// CITY CHAOS - server-side NPCs: shopkeepers, pedestrians and cops.
// The server owns every NPC so all players see the same ones, and so robbery,
// wanted levels and NPC damage can't be faked by a client.
import { raySphere, rayCapsule } from '../public/shared/collision.js';
import { HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS } from '../public/shared/constants.js';
import { Crooks } from './crooks.js';

export const NPC_TYPE = { PED: 0, SHOP: 1, COP: 2, CROOK: 6 };   // 3-5 are prison guards / inmates / SWAT (client)
export const NPC_STATE = { WALK: 0, PANIC: 1, HANDSUP: 2, DEAD: 3, AIM: 4, IDLE: 5, CHEER: 6, DANCE: 7, WAVE: 8 };
const REACT_STATES = new Set([6, 7, 8]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const HEAD_H = 1.55;            // head height above the NPC's feet (same hitbox as players)
const PED_COUNT = 18;
const MAX_COPS = 8;
const maxCops = (p) => (p && p.wanted >= 5 ? 12 : MAX_COPS);   // 5 stars: maximum response
const ARREST_TIME = 3;          // seconds an NPC cop needs to cuff you (3+ stars)
const ROB_TIME = 4;             // seconds of aiming to empty the register
const ROB_RANGE = 6;
const STORE_CLOSED = 75;        // seconds a robbed store stays closed
const WANTED_DECAY = 25;        // seconds unseen by cops before losing a star
const r2 = (v) => Math.round(v * 100) / 100;

export class NPCManager {
  constructor(room, map, world) {
    this.room = room; this.map = map; this.world = world;
    this.list = [];
    this.nextId = 1;
    this.loops = this.buildLoops();
    this.copSpawns = map.spawns.filter(s => s.p[1] < 0.05);
    this.reset();
    this.crooks = new Crooks(this);   // NPC robbers + car thieves
  }

  // ---------------------------------------------------------------- setup
  // Sidewalk walking loops, validated against the collision world so peds never walk through walls.
  buildLoops() {
    const loops = [];
    const B = this.map.block;
    for (const z0 of this.map.blockStarts) for (const x0 of this.map.blockStarts) {
      for (const o of [1.7, 2.3, -1.0]) {
        const y = o > 0 ? 0.15 : 0;
        const pts = [[x0 + o, z0 + o], [x0 + B - o, z0 + o], [x0 + B - o, z0 + B - o], [x0 + o, z0 + B - o]];
        let ok = true;
        for (let i = 0; i < 4 && ok; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4];
          const len = Math.hypot(bx - ax, bz - az);
          for (let d = 0; d <= len; d += 0.5) {
            const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
            if (this.world.sphereOverlaps(x, y + 0.45, z, 0.32) || this.world.sphereOverlaps(x, y + 1.1, z, 0.32)) { ok = false; break; }
          }
        }
        if (ok) { loops.push({ pts, y }); break; }
      }
    }
    return loops;
  }

  add(n) { n.id = this.nextId++; n.hist = []; this.list.push(n); return n; }

  reset() {
    this.list = [];
    for (const s of this.map.shops) {
      this.add({ type: NPC_TYPE.SHOP, shop: s.name, x: s.keeper[0], y: s.keeper[1], z: s.keeper[2], yaw: s.yaw, homeYaw: s.yaw,
                 home: s.keeper, hp: 60, maxHp: 60, state: NPC_STATE.IDLE, closedUntil: 0, rob: null, respawnAt: 0 });
    }
    for (let i = 0; i < PED_COUNT && this.loops.length; i++) this.add(this.newPed(i));
  }

  newPed(i = Math.floor(Math.random() * 1000)) {
    const loop = this.loops[i % this.loops.length];
    const seg = Math.floor(Math.random() * 4), k = Math.random();
    const [ax, az] = loop.pts[seg], [bx, bz] = loop.pts[(seg + 1) % 4];
    return { type: NPC_TYPE.PED, loop, seg, dir: Math.random() < 0.5 ? 1 : -1, x: ax + (bx - ax) * k, y: loop.y, z: az + (bz - az) * k,
             yaw: 0, hp: 40, maxHp: 40, state: NPC_STATE.WALK, panicUntil: 0, speed: 1.1 + Math.random() * 0.5, respawnAt: 0 };
  }

  // a carjacked driver: runs away from the car screaming, then leaves
  addRunner(x, z, fromX, fromZ) {
    const n = this.add({ type: NPC_TYPE.PED, runner: true, x, y: this.floorAt(x, z, 0.2), z, yaw: 0, hp: 40, maxHp: 40, state: NPC_STATE.PANIC,
                         fromX, fromZ, runUntil: this.room.now() + 7, respawnAt: 0, panicUntil: Infinity, speed: 4.2 });
    return n;
  }

  // ---------------------------------------------------------------- wanted level
  addWanted(p, stars, reason) {
    if (!p || !p.alive || p.role === 'cop' || p.jail || p.holding) return; // cops can't become wanted; prisoners are already caught
    const before = p.wanted || 0;
    p.wanted = Math.min(5, before + stars);
    p.wantedSeenAt = this.room.now();
    if (p.wanted !== before) this.room.broadcast({ type: 'wanted', id: p.id, wanted: p.wanted, reason });
    if (p.wanted >= 4 && before < 4) this.spawnCopsFor(p, 2); // SWAT joins the pursuit
  }
  clearWanted(p) {
    if (p.arrestBy) { const n = this.list.find(q => q.id === p.arrestBy.npc); if (n) n.arrest = null; p.arrestBy = null; }
    if (!p.wanted) return;
    p.wanted = 0;
    this.room.broadcast({ type: 'wanted', id: p.id, wanted: 0 });
  }

  // ---------------------------------------------------------------- robbery
  // Client sends 'rob' every ~0.3s while aiming a gun at a shopkeeper.
  onRob(p, id) {
    const n = this.list.find(q => q.id === id);
    const t = this.room.now();
    if (!n || n.type !== NPC_TYPE.SHOP || n.state === NPC_STATE.DEAD || !p.alive || !p.pose || !p.slots[p.cur]) return;
    if (p.role === 'cop') return this.room.sendTo(p, { type: 'robStatus', id, cop: true });
    // a cop player nearby keeps the store safe
    for (const q of this.room.players.values()) {
      if (q.role === 'cop' && q.alive && q.pose && q !== p && Math.hypot(q.pose.h[0] - n.x, q.pose.h[2] - n.z) < 12) return this.room.sendTo(p, { type: 'robStatus', id, copNear: true });
    }
    if (t < n.closedUntil) return this.room.sendTo(p, { type: 'robStatus', id, closed: Math.ceil(n.closedUntil - t) });
    const [hx, hy, hz] = p.pose.h;
    const kx = n.x, ky = n.y + HEAD_H - 0.4, kz = n.z;
    const dist = Math.hypot(hx - kx, hy - ky, hz - kz);
    if (dist > ROB_RANGE) return;
    const dx = (kx - hx) / dist, dy = (ky - hy) / dist, dz = (kz - hz) / dist;
    if (this.world.raycast(hx, hy, hz, dx, dy, dz, dist) < dist - 0.4) return; // must see the clerk
    if (!n.rob || n.rob.pid !== p.id || t - n.rob.last > 1.2) {
      n.rob = { pid: p.id, progress: 0, last: t };
      // alert every cop player
      for (const q of this.room.players.values()) if (q.role === 'cop') this.room.sendTo(q, { type: 'robAlert', shop: n.shop, by: p.id, x: r2(n.x), z: r2(n.z) });
    }
    n.rob.progress += Math.min(0.5, t - n.rob.last) || 0.3;
    n.rob.last = t;
    n.state = NPC_STATE.HANDSUP;
    n.yaw = Math.atan2(-(hx - n.x), -(hz - n.z));
    if (n.rob.progress >= ROB_TIME) {
      const cash = 150 + Math.floor(Math.random() * 350);
      p.cash = (p.cash || 0) + cash; p.robs = (p.robs || 0) + 1; this.room.saves.stat(p, 'robs');
      n.closedUntil = t + STORE_CLOSED; n.rob = null;
      this.room.broadcast({ type: 'robbed', id: n.id, by: p.id, shop: n.shop, cash, total: p.cash });
      this.addWanted(p, 2, 'robbery');
      this.spawnCopsFor(p, 2);
    } else {
      this.room.sendTo(p, { type: 'robStatus', id, progress: r2(n.rob.progress / ROB_TIME) });
    }
  }

  // ---------------------------------------------------------------- combat hooks
  targets(rewindT) {
    const out = [];
    for (const n of this.list) {
      if (n.state === NPC_STATE.DEAD || n.prison) continue; // prison guards/inmates can't be shot
      const h = this.posAt(n, rewindT);
      out.push({ npc: n, x: h.x, y: h.y + HEAD_H, z: h.z });
    }
    return out;
  }
  posAt(n, t) {
    const h = n.hist;
    if (!h.length || t >= h[h.length - 1].t) return n;
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) {
      const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
    return h[0];
  }

  damage(n, attacker, amount, head, w) {
    if (n.state === NPC_STATE.DEAD || amount <= 0) return;
    if (attacker && attacker.role === 'cop' && n.type === NPC_TYPE.COP) return; // no friendly fire between cops
    n.hp -= amount;
    this.room.broadcast({ type: 'npcHit', id: n.id, by: attacker ? attacker.id : null, amt: amount, head: !!head });
    if (n.type === NPC_TYPE.CROOK) {   // robbers: no wanted stars for shooting them, a bounty for taking them down
      if (n.hp > 0) return this.crooks.onHurt(n, attacker, this.room.now());
      n.state = NPC_STATE.DEAD; n.respawnAt = this.room.now() + 4; n.surrender = 0;
      this.room.broadcast({ type: 'npcDie', id: n.id, by: attacker ? attacker.id : null, w: w === 'golden' ? 'sniper' : w, head: !!head, kind: n.type, x: r2(n.x), y: r2(n.y), z: r2(n.z) });
      if (w === 'golden' && attacker) this.room.sendTo(attacker, { type: 'npcDie', id: n.id, by: attacker.id, w, head: !!head, kind: n.type, x: r2(n.x), y: r2(n.y), z: r2(n.z) });
      return this.crooks.onDeath(n, attacker);
    }
    if (attacker && n.type === NPC_TYPE.PED && !attacker.wanted && attacker.role !== 'cop') this.addWanted(attacker, 1, 'shooting civilians');
    if (attacker && n.type === NPC_TYPE.COP) { attacker.shotCop = this.room.now(); n.target = attacker.id; this.addWanted(attacker, 0, 'cop'); if (!attacker.wanted) this.addWanted(attacker, 1, 'assault'); }
    if (n.hp > 0) {
      if (n.type === NPC_TYPE.PED) this.panic(n);
      if (n.type === NPC_TYPE.SHOP && attacker) { this.addWanted(attacker, 1, 'assault'); }
      return;
    }
    // died
    n.state = NPC_STATE.DEAD; n.rob = null;
    n.respawnAt = this.room.now() + (n.type === NPC_TYPE.COP ? 9999 : n.type === NPC_TYPE.SHOP ? 35 : 20);
    { const dm = { type: 'npcDie', id: n.id, by: attacker ? attacker.id : null, w, head: !!head, kind: n.type, x: r2(n.x), y: r2(n.y), z: r2(n.z) };
      if (w === 'golden' && attacker) { this.room.broadcast({ ...dm, w: 'sniper' }, attacker.id); this.room.sendTo(attacker, dm); } else this.room.broadcast(dm); }
    if (attacker && attacker.role === 'cop') { attacker.cash = Math.max(0, (attacker.cash || 0) - 100); this.room.sendTo(attacker, { type: 'penalty', amt: 100, reason: 'a cop took out a civilian' }); }
    else if (attacker) {
      if (n.type === NPC_TYPE.COP) { this.addWanted(attacker, 1, 'cop killer'); this.spawnCopsFor(attacker, 1); }
      else { this.addWanted(attacker, 1, n.type === NPC_TYPE.SHOP ? 'shopkeeper' : 'pedestrian'); this.spawnCopsFor(attacker, 1); }
    }
    if (n.type === NPC_TYPE.COP) this.list = this.list.filter(q => q !== n);
  }

  panic(n, fromX, fromZ) {
    if (n.type !== NPC_TYPE.PED || n.state === NPC_STATE.DEAD || n.runner || n.fare) return;
    n.react = null;
    if (n.spectator) {   // race fans scatter when the shooting starts
      if (fromX === undefined) { fromX = n.x + 1; fromZ = n.z; }
      Object.assign(n, { runner: true, spectator: false, fromX, fromZ, runUntil: this.room.now() + 6, speed: 4.2, state: NPC_STATE.PANIC, panicUntil: Infinity });
      return;
    }
    if (n.state !== NPC_STATE.PANIC && fromX !== undefined) {
      // run away from the noise along the loop
      const [ax, az] = n.loop.pts[n.seg], [bx, bz] = n.loop.pts[(n.seg + 1) % 4];
      const fx = (n.dir > 0 ? bx - ax : ax - bx), fz = (n.dir > 0 ? bz - az : az - bz);
      if (fx * (n.x - fromX) + fz * (n.z - fromZ) < 0) n.dir *= -1;
    }
    n.state = NPC_STATE.PANIC; n.panicUntil = this.room.now() + 7;
  }

  // gunshots scare nearby pedestrians
  noise(x, z, radius = 28) {
    for (const n of this.list) if (n.type === NPC_TYPE.PED && Math.hypot(n.x - x, n.z - z) < radius) this.panic(n, x, z);
  }

  splash(x, y, z, owner, def) {
    for (const n of [...this.list]) {
      if (n.state === NPC_STATE.DEAD) continue;
      const cy = n.y + 1.0, d = Math.hypot(n.x - x, cy - y, n.z - z);
      if (d >= def.splashRadius) continue;
      const dx = (n.x - x) / d, dy = (cy - y) / d, dz = (n.z - z) / d;
      if (this.world.raycast(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, dx, dy, dz, d) < d - 0.4) continue;
      this.damage(n, owner, Math.round(def.splashDamage * (1 - d / def.splashRadius * 0.7)), false, 'rocket');
    }
    this.noise(x, z, 40);
  }

  // ---------------------------------------------------------------- cops
  // somebody saw it happen: a pedestrian, shopkeeper or cop within range (crimes only count in public)
  witnessed(x, z, range = 22) {
    for (const n of this.list) if (!n.prison && n.state !== NPC_STATE.DEAD && Math.hypot(n.x - x, n.z - z) < range) return true;
    return false;
  }
  copCount() { return this.list.filter(n => n.type === NPC_TYPE.COP).length; }
  swatFor(p) { return p.wanted >= 5 ? Math.random() < 0.75 : p.wanted >= 4 ? Math.random() < 0.5 : false; }
  // cops show up three ways: a police car from the station, out of the donut shop (with a donut), or on foot
  spawnCopsFor(p, n) {
    if (!p.pose || p.role === 'cop' || this.noCops) return;   // (noCops: automated tests only)
    if (p.jail || p.holding) return;
    for (let i = 0; i < n && this.copCount() < maxCops(p); i++) {
      const r = Math.random();
      if (this.swatFor(p)) { if (Math.random() < 0.4 && this.room.vehicles.dispatch(p)) { i++; continue; } this.spawnStreetCop(p, true); continue; }
      if (r < 0.5 && this.room.vehicles.dispatch(p)) { i++; continue; } // a police car brings 2 cops
      if (r < 0.85) { const d = this.map.donutDoor; this.spawnCopAt(d[0] + (Math.random() - 0.5) * 2, d[2] + Math.random(), p, { donut: true }); continue; }
      this.spawnStreetCop(p);
    }
  }
  spawnCopAt(x, z, p, { donut = false, swat = false } = {}) {
    if (this.copCount() >= maxCops(p)) return null;
    const y = this.floorAt(x, z, 0.2);
    const hp = swat ? 160 : 80;
    return this.add({ type: NPC_TYPE.COP, x, y, z, yaw: 0, hp, maxHp: hp, state: NPC_STATE.WALK, target: p.id, donut, swat,
                      nextShot: this.room.now() + 1.5, lastProgress: this.room.now(), progX: x, progZ: z, side: 0, sideUntil: 0, idleSince: 0 });
  }
  // NPC cops sent after an NPC robber
  spawnCopForCrook(x, z, crook) {
    if (this.copCount() >= MAX_COPS) return null;
    return this.add({ type: NPC_TYPE.COP, x, y: this.floorAt(x, z, 0.2), z, yaw: 0, hp: 80, maxHp: 80, state: NPC_STATE.WALK, target: null, crook: crook.id,
                      nextShot: this.room.now() + 1.2, lastProgress: this.room.now(), progX: x, progZ: z, side: 0, sideUntil: 0, idleSince: 0 });
  }
  updateCopVsCrook(n, dt, t) {
    const c = this.list.find(q => q.id === n.crook && q.state !== NPC_STATE.DEAD && !q.remove);
    if (!c || c.car) { n.crook = null; return this.updateCop(n, dt, t); }
    n.idleSince = 0;
    const hx = n.x, hy = n.y + HEAD_H, hz = n.z;
    const dx = c.x - hx, dz = c.z - hz, dist = Math.hypot(dx, dz), d3 = Math.hypot(dx, c.y + HEAD_H - hy, dz) || 1;
    n.yaw = Math.atan2(-dx, -dz);
    const los = d3 < 34 && this.world.raycast(hx, hy, hz, dx / d3, (c.y + HEAD_H - hy) / d3, dz / d3, d3) >= d3 - 0.5;
    if (c.surrender && los && dist < 2.4) { this.room.broadcast({ type: 'npcSay', id: n.id, text: "YOU'RE UNDER ARREST!" }); this.crooks.arrest(c, null); return; }
    if (!c.surrender && los && dist < 28) {
      n.state = NPC_STATE.AIM;
      if (dist > 9) this.walk(n, dx / dist, dz / dist, 2.6 * dt);
      if (t >= n.nextShot) {
        n.nextShot = t + 0.9 + Math.random() * 0.7;
        const hit = Math.random() < Math.max(0.25, 0.6 - d3 * 0.012);
        const ex = c.x + (hit ? 0 : (Math.random() - 0.5) * 2), ey = c.y + HEAD_H - (hit ? 0.4 : Math.random() * 1.2), ez = c.z + (hit ? 0 : (Math.random() - 0.5) * 2);
        this.room.broadcast({ type: 'npcShot', id: n.id, o: [r2(hx), r2(hy - 0.35), r2(hz)], e: [r2(ex), r2(ey), r2(ez)] });
        if (hit) this.damage(c, null, 12, false, 'cop');
      }
      n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
      return;
    }
    n.state = NPC_STATE.WALK;
    // robber inside a store (out of sight, or giving up and waiting to be cuffed): go in through the door like he did
    const route = c.job === 'rob' && (!los || c.surrender) ? this.crooks.routes.get(c.shop) : null;
    let gx = c.x, gz = c.z;
    if (route && Math.hypot(c.x - route.path[route.path.length - 1][0], c.z - route.path[route.path.length - 1][1]) < 6) {
      const wps = route.path.slice(0, -1);
      n.wpi = n.wpi || 0;
      while (n.wpi < wps.length && Math.hypot(n.x - wps[n.wpi][0], n.z - wps[n.wpi][1]) < 0.8) n.wpi++;
      if (n.wpi < wps.length) { gx = wps[n.wpi][0]; gz = wps[n.wpi][1]; }
    } else n.wpi = 0;
    const gdx = gx - n.x, gdz = gz - n.z, gd = Math.hypot(gdx, gdz) || 1;
    let mx = gdx / gd, mz = gdz / gd;
    if (t < n.sideUntil) { const sx = -mz * n.side, sz = mx * n.side; mx = mx * 0.3 + sx; mz = mz * 0.3 + sz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    this.walk(n, mx, mz, (c.surrender ? 3.2 : 4.3) * dt);
    if (Math.hypot(n.x - n.progX, n.z - n.progZ) > 1.5) { n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
    else if (t - n.lastProgress > 1.5 && t > n.sideUntil) { n.side = Math.random() < 0.5 ? -1 : 1; n.sideUntil = t + 1.6; }
  }

  spawnStreetCop(p, swat = false) {
    const [px, , pz] = p.pose.h;
    for (let i = 0; i < 1; i++) {
      const cands = this.copSpawns.map(s => ({ s, d: Math.hypot(s.p[0] - px, s.p[2] - pz) })).filter(c => c.d > 22 && c.d < 75);
      const pool = cands.length ? cands : this.copSpawns.map(s => ({ s, d: 0 }));
      const sp = pool[Math.floor(Math.random() * pool.length)].s;
      this.add({ type: NPC_TYPE.COP, x: sp.p[0] + (Math.random() - 0.5) * 3, y: sp.p[1], z: sp.p[2] + (Math.random() - 0.5) * 3, yaw: 0,
                 hp: swat ? 160 : 80, maxHp: swat ? 160 : 80, swat, state: NPC_STATE.WALK, target: p.id, nextShot: this.room.now() + 1.5, lastProgress: this.room.now(),
                 progX: sp.p[0], progZ: sp.p[2], side: 0, sideUntil: 0, idleSince: 0 });
    }
  }

  floorAt(x, z, fromY) {
    const d = this.world.raycast(x, fromY + 1.2, z, 0, -1, 0, 4);
    return d < Infinity ? fromY + 1.2 - d : fromY;
  }
  // move an NPC on the ground with wall sliding; returns distance moved
  walk(n, dx, dz, dist) {
    const ox = n.x, oz = n.z;
    const p = { x: n.x + dx * dist, y: n.y + 0.9, z: n.z + dz * dist };
    this.world.pushSphere(p, 0.33);
    const fy = this.floorAt(p.x, p.z, n.y);
    if (Math.abs(fy - n.y) < 0.55) { n.x = p.x; n.z = p.z; n.y = fy; }
    return Math.hypot(n.x - ox, n.z - oz);
  }

  updateCop(n, dt, t) {
    if (n.crook) return this.updateCopVsCrook(n, dt, t);
    const room = this.room;
    let target = room.players.get(n.target);
    if (n.arrest) return this.updateArrest(n, t);
    if (!target || !target.alive || !target.wanted || !target.connected || target.jail || target.holding) {
      // find another wanted player, otherwise go off duty
      target = [...room.players.values()].filter(q => q.alive && q.wanted && q.pose && q.connected && !q.jail && !q.holding)
        .sort((a, b) => Math.hypot(a.pose.h[0] - n.x, a.pose.h[2] - n.z) - Math.hypot(b.pose.h[0] - n.x, b.pose.h[2] - n.z))[0];
      if (!target) { if (!n.idleSince) n.idleSince = t; if (t - n.idleSince > 12) n.remove = true; n.state = NPC_STATE.IDLE; return; }
      n.target = target.id;
    }
    n.idleSince = 0;
    const [tx, ty, tz] = target.pose.h;
    const hx = n.x, hy = n.y + HEAD_H, hz = n.z;
    const dx = tx - hx, dz = tz - hz, dist = Math.hypot(dx, dz);
    const d3 = Math.hypot(dx, ty - hy, dz);
    const los = d3 < 40 && this.world.raycast(hx, hy, hz, dx / d3, (ty - hy) / d3, dz / d3, d3) >= d3 - 0.5;
    if (los) target.wantedSeenAt = t;
    n.yaw = Math.atan2(-dx, -dz);
    const stars = target.wanted;
    // 3+ stars: cops try to cuff you up close (move away or shoot to resist)
    if (stars >= 3 && d3 < 2.3 && !target.arrestBy && !target.inCar && !target.ride && t > (n.nextArrest || 0)) {
      n.arrest = { pid: target.id, start: t, x: tx, z: tz };
      target.arrestBy = { npc: n.id, start: t };
      room.sendTo(target, { type: 'arrestAttempt', id: n.id, t: ARREST_TIME });
      room.broadcast({ type: 'npcSay', id: n.id, text: n.swat ? 'SWAT! ON THE GROUND!' : "YOU'RE UNDER ARREST!" });
      n.state = NPC_STATE.AIM;
      return;
    }
    // 1 star: police only investigate (no shooting unless you shot at them)
    const mayShoot = stars >= 2 || (target.shotCop && t - target.shotCop < 30);
    if (los && dist < 30 && !mayShoot) {
      n.state = NPC_STATE.WALK;
      if (dist > 3) this.walk(n, dx / dist, dz / dist, 2.4 * dt);
      else if (t > (n.warnAt || 0)) { n.warnAt = t + 6; room.broadcast({ type: 'npcSay', id: n.id, text: 'Hey! We got a report about you...' }); }
      n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
      return;
    }
    if (los && stars >= 3 && dist < 16 && !target.inCar && !target.ride) {
      // close in for the arrest instead of shooting
      n.state = NPC_STATE.AIM; this.walk(n, dx / dist, dz / dist, 3.6 * dt);
      n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
      return;
    }
    if (los && dist < 30) {
      n.state = NPC_STATE.AIM;
      if (dist > 10) this.walk(n, dx / dist, dz / dist, 2.6 * dt);
      if (t >= n.nextShot) {
        n.nextShot = t + (n.swat ? 0.55 : 0.9) + Math.random() * 0.7;
        const hit = Math.random() < Math.max(0.2, 0.62 - d3 * 0.012);
        // tracer endpoint: on the target if hit, otherwise a near miss
        const miss = hit ? 0 : 0.8 + Math.random();
        const ex = tx + (hit ? 0 : (Math.random() - 0.5) * miss * 2), ey = ty - (hit ? 0.4 : Math.random() * 1.2), ez = tz + (hit ? 0 : (Math.random() - 0.5) * miss * 2);
        room.broadcast({ type: 'npcShot', id: n.id, o: [r2(hx), r2(hy - 0.35), r2(hz)], e: [r2(ex), r2(ey), r2(ez)] });
        if (hit) room.damage(target, null, n.swat ? 13 : 8, 'cop', false, [hx, hy, hz]);
      }
      n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
      return;
    }
    // chase
    n.state = NPC_STATE.WALK;
    let mx = dx / (dist || 1), mz = dz / (dist || 1);
    if (t < n.sideUntil) { const sx = -mz * n.side, sz = mx * n.side; mx = mx * 0.3 + sx; mz = mz * 0.3 + sz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    this.walk(n, mx, mz, 4.3 * dt);
    if (Math.hypot(n.x - n.progX, n.z - n.progZ) > 1.5) { n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
    else if (t - n.lastProgress > 1.5 && t > n.sideUntil) { n.side = Math.random() < 0.5 ? -1 : 1; n.sideUntil = t + 1.6; }
    if (t - n.lastProgress > 7 && dist > 15) {
      // hopelessly stuck (target on a roof or behind buildings): reposition to a nearby street corner
      const near = this.copSpawns.map(s => ({ s, d: Math.hypot(s.p[0] - tx, s.p[2] - tz) })).filter(c => c.d > 12).sort((a, b) => a.d - b.d)[Math.floor(Math.random() * 3)];
      if (near) { n.x = near.s.p[0]; n.z = near.s.p[2]; n.y = near.s.p[1]; n.hist = []; }
      n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
    }
  }

  updateArrest(n, t) {
    const room = this.room, a = n.arrest, p = room.players.get(a.pid);
    if (!p || !p.alive || !p.pose || p.jail || p.holding) { n.arrest = null; if (p) p.arrestBy = null; return; }
    const [tx, , tz] = p.pose.h;
    n.yaw = Math.atan2(-(tx - n.x), -(tz - n.z)); n.state = NPC_STATE.AIM;
    if (Math.hypot(tx - a.x, tz - a.z) > 3.2 || Math.hypot(tx - n.x, tz - n.z) > 3.6 || p.inCar || p.ride) return this.resistArrest(p, 'running');
    if (t - a.start >= ARREST_TIME) {
      n.arrest = null; p.arrestBy = null; n.nextArrest = t + 5;
      room.prison.arrest(p, null, n);
    }
  }
  // the suspect ran or fought back: +1 star and the cuffs come off
  resistArrest(p, how) {
    const a = p.arrestBy; if (!a) return;
    p.arrestBy = null;
    const n = this.list.find(q => q.id === a.npc);
    if (n) { n.arrest = null; n.nextArrest = this.room.now() + 4; }
    this.room.sendTo(p, { type: 'arrestResist', how });
    this.addWanted(p, 1, 'resisting arrest');
  }

  updatePed(n, dt, t) {
    if (n.react) {   // cheering, dancing or waving back at a player
      if (t < n.react.until && n.state !== NPC_STATE.PANIC) { n.state = n.react.state; if (n.react.yaw !== undefined) n.yaw = n.react.yaw; return; }
      n.react = null; if (REACT_STATES.has(n.state)) n.state = n.spectator || n.fare ? NPC_STATE.IDLE : NPC_STATE.WALK;
    }
    if (n.dodge) {   // jumping out of the way of a speeding car
      if (t < n.dodge.until) { this.walk(n, n.dodge.x, n.dodge.z, 5.5 * dt); return; }
      n.dodge = null;
    }
    if (n.spectator) { if (t > n.spectator) { n.remove = true; return; } n.state = NPC_STATE.IDLE; return; }
    if (n.fare || (!n.loop && !n.runner)) { n.state = NPC_STATE.IDLE; return; }   // a taxi passenger waiting at the curb
    if (n.runner) {
      if (t > n.runUntil) { n.remove = true; return; }
      let dx = n.x - n.fromX, dz = n.z - n.fromZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      this.walk(n, dx, dz, n.speed * dt); n.yaw = Math.atan2(-dx, -dz);
      return;
    }
    if (n.state === NPC_STATE.PANIC && t > n.panicUntil) n.state = NPC_STATE.WALK;
    const speed = n.state === NPC_STATE.PANIC ? 4.2 : n.speed;
    let left = speed * dt;
    for (let guard = 0; guard < 4 && left > 0; guard++) {
      const i0 = n.seg, i1 = (n.seg + 1) % 4;
      const [tx, tz] = n.dir > 0 ? n.loop.pts[i1] : n.loop.pts[i0];
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { n.seg = n.dir > 0 ? i1 : (n.seg + 3) % 4; continue; }
      const step = Math.min(d, left);
      n.x += dx / d * step; n.z += dz / d * step; left -= step;
      n.yaw = Math.atan2(-dx, -dz);
    }
    n.y = n.loop.y;
  }

  // ---------------------------------------------------------------- 🙌 pedestrians reacting to the city
  react(n, state, secs, faceX, faceZ) {
    if (n.type !== NPC_TYPE.PED || n.state === NPC_STATE.DEAD || n.state === NPC_STATE.PANIC || n.runner || n.dodge) return false;
    const yaw = faceX === undefined ? undefined : Math.atan2(-(faceX - n.x), -(faceZ - n.z));
    n.react = { state, until: this.room.now() + secs, yaw }; n.state = state; if (yaw !== undefined) n.yaw = yaw;
    return true;
  }
  say(n, text) { this.room.broadcast({ type: 'npcSay', id: n.id, text }); }

  // a crowd of race fans gathers at the start line while a race is on
  addSpectators(x, z, count = 6, secs = 120) {
    const until = this.room.now() + secs;
    const have = this.list.filter(n => n.spectator);
    if (have.length) { for (const n of have) n.spectator = until; return have; }
    const spots = [];
    for (const loop of this.loops) for (let i = 0; i < 4; i++) {
      const [ax, az] = loop.pts[i], [bx, bz] = loop.pts[(i + 1) % 4];
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
      const px = ax + ex * k, pz = az + ez * k, d = Math.hypot(px - x, pz - z);
      if (d < 24) spots.push({ px, pz, ex, ez, L: Math.sqrt(L2), d, y: loop.y });
    }
    spots.sort((a, b) => a.d - b.d);
    const out = [];
    for (let i = 0; i < count && spots.length; i++) {
      const s = spots[i % Math.min(spots.length, 3)], off = (Math.floor(i / Math.min(spots.length, 3)) - 1) * 1.6 + (Math.random() - 0.5) * 0.6;
      const sx = s.px + s.ex / s.L * off, sz = s.pz + s.ez / s.L * off;
      out.push(this.add({ type: NPC_TYPE.PED, spectator: until, x: sx, y: s.y, z: sz, yaw: Math.atan2(-(x - sx), -(z - sz)), hp: 40, maxHp: 40,
                          state: NPC_STATE.IDLE, panicUntil: 0, speed: 1.2, respawnAt: 0 }));
    }
    return out;
  }
  clearSpectators(later = 6) { const t = this.room.now(); for (const n of this.list) if (n.spectator) n.spectator = Math.min(n.spectator, t + later); }

  // everyone close enough to see it cheers (race start, a racer crossing the line)
  cheer(x, z, radius = 40, secs = 4, lines = ['WOOO!', 'GO GO GO!', '🔥🔥🔥', 'YEAAAH!']) {
    let n0 = 0;
    for (const n of this.list) {
      if (n.type !== NPC_TYPE.PED || Math.hypot(n.x - x, n.z - z) > radius) continue;
      if (this.react(n, NPC_STATE.CHEER, secs * (0.8 + Math.random() * 0.4), x, z)) { n0++; if (Math.random() < 0.45) this.say(n, pick(lines)); }
    }
    return n0;
  }

  // a player emoted: pedestrians nearby answer it
  emote(p, e) {
    if (!p || !p.alive || p.inCar || !p.pose) return 0;
    const [px, hy, pz] = p.pose.h, py = hy - 1.6;
    const near = this.list.filter(n => n.type === NPC_TYPE.PED && n.state !== NPC_STATE.DEAD && !n.runner && Math.hypot(n.x - px, n.z - pz) < 9 && Math.abs((n.y || 0) - py) < 2.5)
                          .sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, 4);
    const R = {   // emote index -> [state, seconds, lines]
      0: [NPC_STATE.WAVE, 2.6, ['Hey!', 'Hi there!', '👋']],            1: [NPC_STATE.CHEER, 2.2, ['HAHA', 'lol 😂', 'Good one!']],
      2: [NPC_STATE.DANCE, 5, ['💃 Ayyy!', 'Let\'s go!', '🎶']],        3: [NPC_STATE.WAVE, 2.2, ['👍', 'Nice!']],
      4: [null, 0, ['Whoa, chill!', 'Yikes...', '😬']],                 5: [NPC_STATE.WAVE, 2.4, ['❤️', 'Aww!']],
      6: [NPC_STATE.CHEER, 2.6, ['🦍 OOH OOH!', 'BEAST!']],             7: [NPC_STATE.WAVE, 2.2, ['GG!', '🤝']]
    }[e];
    if (!R) return 0;
    let n0 = 0;
    for (const n of near) {
      if (n.state === NPC_STATE.PANIC || n.dodge) continue;
      if (R[0] === null) { if (Math.random() < 0.7) { this.say(n, pick(R[2])); n0++; } continue; }
      if (this.react(n, R[0], R[1] * (0.9 + Math.random() * 0.3), px, pz)) { n0++; if (Math.random() < 0.5) this.say(n, pick(R[2])); }
    }
    return n0;
  }

  // pedestrians jump out of the way of fast cars heading at them
  dodgeCars(t) {
    const cars = (this.room.vehicles && this.room.vehicles.cars) || [];
    const fast = cars.filter(c => Math.abs(c.speed) > 8);
    if (!fast.length) return;
    for (const n of this.list) {
      if (n.type !== NPC_TYPE.PED || n.state === NPC_STATE.DEAD || n.fare || n.prison || n.dodge || (n.dodgeAt && t - n.dodgeAt < 2.5)) continue;
      for (const c of fast) {
        const sg = c.speed >= 0 ? 1 : -1, fx = -Math.sin(c.yaw) * sg, fz = -Math.cos(c.yaw) * sg;
        const dx = n.x - c.x, dz = n.z - c.z, ah = dx * fx + dz * fz, side = dx * -fz + dz * fx;
        if (ah < 0.5 || ah > Math.min(14, Math.abs(c.speed) * 0.9) || Math.abs(side) > 2.4 || Math.abs((n.y || 0) - (c.y || 0)) > 2) continue;
        const s = side >= 0 ? 1 : -1;   // leap to whichever side is closer
        n.react = null; n.dodge = { x: -fz * s, z: fx * s, until: t + 0.55 }; n.dodgeAt = t;
        if (!n.runner && !n.spectator && !n.fare) { n.state = NPC_STATE.PANIC; n.panicUntil = t + 2.5; }
        if (Math.random() < 0.5) this.say(n, pick(['WHOA!', 'HEY! WATCH IT!', 'Learn to drive!', 'AAAH!']));
        break;
      }
    }
  }

  updateShop(n, dt, t) {
    if (n.rob && t - n.rob.last > 1.5) { n.rob = null; }
    if (n.rob && n.rob.crook) return;
    if (!n.rob) { n.state = NPC_STATE.IDLE; n.yaw = n.homeYaw; }
  }

  tick(dt) {
    const t = this.room.now();
    for (const n of this.list) {
      if (n.prison) continue; // prison guards/inmates are run by the PrisonManager
      if (n.state === NPC_STATE.DEAD) {
        if (t >= n.respawnAt) {
          if (n.type === NPC_TYPE.SHOP) { Object.assign(n, { x: n.home[0], y: n.home[1], z: n.home[2], hp: n.maxHp, state: NPC_STATE.IDLE, rob: null }); }
          else if (n.type === NPC_TYPE.PED && (n.runner || n.fare || n.spectator)) { n.remove = true; continue; }
          else if (n.type === NPC_TYPE.CROOK) { n.remove = true; continue; }
          else if (n.type === NPC_TYPE.PED) { const f = this.newPed(); Object.assign(n, f, { id: n.id, hist: [] }); }
          this.room.broadcast({ type: 'npcSpawn', id: n.id });
        }
        continue;
      }
      if (n.type === NPC_TYPE.PED) this.updatePed(n, dt, t);
      else if (n.type === NPC_TYPE.COP) this.updateCop(n, dt, t);
      else if (n.type === NPC_TYPE.CROOK) this.crooks.update(n, dt, t);
      else this.updateShop(n, dt, t);
      n.hist.push({ t, x: n.x, y: n.y, z: n.z });
      if (n.hist.length > 12) n.hist.shift();
    }
    this.list = this.list.filter(n => !n.remove);
    if (t - (this.dodgeT || 0) > 0.1) { this.dodgeT = t; this.dodgeCars(t); }
    this.crooks.tick(dt, t);
    // wanted level decays when no cop can see you
    for (const p of this.room.players.values()) {
      if (!p.wanted) continue;
      if (!p.alive) { this.clearWanted(p); continue; }
      if (t - (p.wantedSeenAt || 0) > WANTED_DECAY) {
        p.wanted--; p.wantedSeenAt = t;
        this.room.broadcast({ type: 'wanted', id: p.id, wanted: p.wanted, reason: 'lost' });
      }
      // keep enough cops on the case (2 per star, capped)
      const chasing = this.list.filter(n => n.type === NPC_TYPE.COP && n.target === p.id).length + this.room.vehicles.pendingFor(p) * 2;
      if (p.jail || p.holding) continue;
      if (chasing < Math.min(p.wanted * 2, maxCops(p)) && Math.random() < dt * (p.wanted >= 4 ? 0.45 : 0.25)) this.spawnCopsFor(p, 1);
    }
  }

  snapshot() {
    const arr = [];
    const t = this.room.now();
    for (const n of this.list) {
      const closed = n.type === NPC_TYPE.SHOP && t < n.closedUntil ? 1 : 0;
      const flags = (n.donut ? 1 : 0) | (n.swat ? 2 : 0) | (n.mode === 'chase' ? 4 : 0) | (n.tower ? 8 : 0) | (n.arrest ? 16 : 0) | (n.car ? 32 : 0) | (n.loot ? 64 : 0) | (n.boss ? 128 : 0) | (n.guard ? 256 : 0);
      arr.push([n.id, n.type, r2(n.x), r2(n.y), r2(n.z), r2(n.yaw), n.state, closed, flags]);
    }
    return arr;
  }
}

// ray test helper used by Room.onShoot for NPC hits
export function rayNpc(o, d, tg) {
  const th = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], tg.x, tg.y, tg.z, HEAD_RADIUS + 0.03);
  const tb = rayCapsule(o[0], o[1], o[2], d[0], d[1], d[2], tg.x, tg.y - BODY_BOTTOM, tg.y - BODY_TOP, tg.z, BODY_RADIUS);
  return th < tb ? { t: th, head: true } : { t: tb, head: false };
}
