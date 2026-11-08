// CITY CHAOS - server-side NPCs: shopkeepers, pedestrians and cops.
// The server owns every NPC so all players see the same ones, and so robbery,
// wanted levels and NPC damage can't be faked by a client.
import { raySphere, rayCapsule } from '../public/shared/collision.js';
import { HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS } from '../public/shared/constants.js';

export const NPC_TYPE = { PED: 0, SHOP: 1, COP: 2 };
export const NPC_STATE = { WALK: 0, PANIC: 1, HANDSUP: 2, DEAD: 3, AIM: 4, IDLE: 5 };
const HEAD_H = 1.55;            // head height above the NPC's feet (same hitbox as players)
const PED_COUNT = 18;
const MAX_COPS = 8;
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
    if (!p || !p.alive || p.role === 'cop') return; // cops can't become wanted
    const before = p.wanted || 0;
    p.wanted = Math.min(5, before + stars);
    p.wantedSeenAt = this.room.now();
    if (p.wanted !== before) this.room.broadcast({ type: 'wanted', id: p.id, wanted: p.wanted, reason });
  }
  clearWanted(p) {
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
      p.cash = (p.cash || 0) + cash; p.robs = (p.robs || 0) + 1;
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
      if (n.state === NPC_STATE.DEAD) continue;
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
    if (attacker && n.type === NPC_TYPE.COP) { n.target = attacker.id; this.addWanted(attacker, 0, 'cop'); if (!attacker.wanted) this.addWanted(attacker, 1, 'assault'); }
    if (n.hp > 0) {
      if (n.type === NPC_TYPE.PED) this.panic(n);
      if (n.type === NPC_TYPE.SHOP && attacker) { this.addWanted(attacker, 1, 'assault'); }
      return;
    }
    // died
    n.state = NPC_STATE.DEAD; n.rob = null;
    n.respawnAt = this.room.now() + (n.type === NPC_TYPE.COP ? 9999 : n.type === NPC_TYPE.SHOP ? 35 : 20);
    this.room.broadcast({ type: 'npcDie', id: n.id, by: attacker ? attacker.id : null, w, head: !!head, kind: n.type, x: r2(n.x), y: r2(n.y), z: r2(n.z) });
    if (attacker && attacker.role === 'cop') { attacker.cash = Math.max(0, (attacker.cash || 0) - 100); this.room.sendTo(attacker, { type: 'penalty', amt: 100, reason: 'a cop took out a civilian' }); }
    else if (attacker) {
      if (n.type === NPC_TYPE.COP) { this.addWanted(attacker, 1, 'cop killer'); this.spawnCopsFor(attacker, 1); }
      else { this.addWanted(attacker, 1, n.type === NPC_TYPE.SHOP ? 'shopkeeper' : 'pedestrian'); this.spawnCopsFor(attacker, 1); }
    }
    if (n.type === NPC_TYPE.COP) this.list = this.list.filter(q => q !== n);
  }

  panic(n, fromX, fromZ) {
    if (n.type !== NPC_TYPE.PED || n.state === NPC_STATE.DEAD || n.runner) return;
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
  copCount() { return this.list.filter(n => n.type === NPC_TYPE.COP).length; }
  // cops show up three ways: a police car from the station, out of the donut shop (with a donut), or on foot
  spawnCopsFor(p, n) {
    if (!p.pose || p.role === 'cop') return;
    for (let i = 0; i < n && this.copCount() < MAX_COPS; i++) {
      const r = Math.random();
      if (r < 0.5 && this.room.vehicles.dispatch(p)) { i++; continue; } // a police car brings 2 cops
      if (r < 0.85) { const d = this.map.donutDoor; this.spawnCopAt(d[0] + (Math.random() - 0.5) * 2, d[2] + Math.random(), p, { donut: true }); continue; }
      this.spawnStreetCop(p);
    }
  }
  spawnCopAt(x, z, p, { donut = false } = {}) {
    if (this.copCount() >= MAX_COPS) return null;
    const y = this.floorAt(x, z, 0.2);
    return this.add({ type: NPC_TYPE.COP, x, y, z, yaw: 0, hp: 80, maxHp: 80, state: NPC_STATE.WALK, target: p.id, donut,
                      nextShot: this.room.now() + 1.5, lastProgress: this.room.now(), progX: x, progZ: z, side: 0, sideUntil: 0, idleSince: 0 });
  }
  spawnStreetCop(p) {
    const [px, , pz] = p.pose.h;
    for (let i = 0; i < 1; i++) {
      const cands = this.copSpawns.map(s => ({ s, d: Math.hypot(s.p[0] - px, s.p[2] - pz) })).filter(c => c.d > 22 && c.d < 75);
      const pool = cands.length ? cands : this.copSpawns.map(s => ({ s, d: 0 }));
      const sp = pool[Math.floor(Math.random() * pool.length)].s;
      this.add({ type: NPC_TYPE.COP, x: sp.p[0] + (Math.random() - 0.5) * 3, y: sp.p[1], z: sp.p[2] + (Math.random() - 0.5) * 3, yaw: 0,
                 hp: 80, maxHp: 80, state: NPC_STATE.WALK, target: p.id, nextShot: this.room.now() + 1.5, lastProgress: this.room.now(),
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
    const room = this.room;
    let target = room.players.get(n.target);
    if (!target || !target.alive || !target.wanted || !target.connected) {
      // find another wanted player, otherwise go off duty
      target = [...room.players.values()].filter(q => q.alive && q.wanted && q.pose && q.connected)
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
    if (los && dist < 30) {
      n.state = NPC_STATE.AIM;
      if (dist > 10) this.walk(n, dx / dist, dz / dist, 2.6 * dt);
      if (t >= n.nextShot) {
        n.nextShot = t + 0.9 + Math.random() * 0.7;
        const hit = Math.random() < Math.max(0.2, 0.62 - d3 * 0.012);
        // tracer endpoint: on the target if hit, otherwise a near miss
        const miss = hit ? 0 : 0.8 + Math.random();
        const ex = tx + (hit ? 0 : (Math.random() - 0.5) * miss * 2), ey = ty - (hit ? 0.4 : Math.random() * 1.2), ez = tz + (hit ? 0 : (Math.random() - 0.5) * miss * 2);
        room.broadcast({ type: 'npcShot', id: n.id, o: [r2(hx), r2(hy - 0.35), r2(hz)], e: [r2(ex), r2(ey), r2(ez)] });
        if (hit) room.damage(target, null, 8, 'cop', false, [hx, hy, hz]);
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

  updatePed(n, dt, t) {
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

  updateShop(n, dt, t) {
    if (n.rob && t - n.rob.last > 1.5) { n.rob = null; }
    if (!n.rob) { n.state = NPC_STATE.IDLE; n.yaw = n.homeYaw; }
  }

  tick(dt) {
    const t = this.room.now();
    for (const n of this.list) {
      if (n.state === NPC_STATE.DEAD) {
        if (t >= n.respawnAt) {
          if (n.type === NPC_TYPE.SHOP) { Object.assign(n, { x: n.home[0], y: n.home[1], z: n.home[2], hp: n.maxHp, state: NPC_STATE.IDLE, rob: null }); }
          else if (n.type === NPC_TYPE.PED && n.runner) { n.remove = true; continue; }
          else if (n.type === NPC_TYPE.PED) { const f = this.newPed(); Object.assign(n, f, { id: n.id, hist: [] }); }
          this.room.broadcast({ type: 'npcSpawn', id: n.id });
        }
        continue;
      }
      if (n.type === NPC_TYPE.PED) this.updatePed(n, dt, t);
      else if (n.type === NPC_TYPE.COP) this.updateCop(n, dt, t);
      else this.updateShop(n, dt, t);
      n.hist.push({ t, x: n.x, y: n.y, z: n.z });
      if (n.hist.length > 12) n.hist.shift();
    }
    this.list = this.list.filter(n => !n.remove);
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
      if (chasing < Math.min(p.wanted * 2, MAX_COPS) && Math.random() < dt * 0.25) this.spawnCopsFor(p, 1);
    }
  }

  snapshot() {
    const arr = [];
    const t = this.room.now();
    for (const n of this.list) {
      const closed = n.type === NPC_TYPE.SHOP && t < n.closedUntil ? 1 : 0;
      arr.push([n.id, n.type, r2(n.x), r2(n.y), r2(n.z), r2(n.yaw), n.state, closed, n.donut ? 1 : 0]);
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
