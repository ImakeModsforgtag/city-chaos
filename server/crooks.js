// CITY CHAOS - NPC bad guys (server). Masked robbers show up around the city every so often and either
//   * walk into a store, pull a gun on the clerk, empty the register and run for it, or
//   * walk up to a car waiting in traffic, throw the driver out and speed off in it.
// The police respond (NPC cops chase and shoot them, cop players can arrest them with E / grip),
// and anybody who takes a robber down gets a bounty plus whatever the robber stole. Shooting a robber
// never gives you wanted stars. A robber you shoot (or a cop who chases him) gets shot back at.
//
// Robbers are normal NPCs in npcs.list (type CROOK) so they're drawn, hit-tested and snapshotted like
// everyone else; this module only runs their brains.
import { NPC_TYPE, NPC_STATE } from './npcs.js';
import { DRIVER } from './vehicles.js';

export const CROOK = {
  max: 2,                 // robbers active at once
  firstDelay: [20, 35],   // seconds after the first player joins
  every: [35, 70],        // seconds between new robbers
  hp: 70,
  robTime: 6,             // seconds holding up the clerk
  bounty: 150,            // for taking one down (cops get double)
  arrestPay: 250,         // cop player arrests one
  driveTime: 45,          // seconds a car thief joyrides before vanishing into traffic
  dmgPlayer: 7, dmgCop: 10
};
const HEAD_H = 1.55;
const r2 = (v) => Math.round(v * 100) / 100;
const rand = (a, b) => a + Math.random() * (b - a);

export class Crooks {
  constructor(npcs) {
    this.npcs = npcs; this.room = npcs.room; this.map = npcs.map; this.world = npcs.world;
    this.nextAt = null;
    this.routes = new Map();     // shop name -> { spawn, path:[[x,z]...], door }
    for (const s of this.map.shops) { const r = this.shopRoute(s); if (r) this.routes.set(s.name, r); }
  }
  get on() { return this.room.crooksOn; }
  list() { return this.npcs.list.filter(n => n.type === NPC_TYPE.CROOK); }

  // ---------------------------------------------------------------- store routes (door -> counter)
  shopRoute(s) {
    const [kx, ky, kz] = s.keeper;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const counter = [kx + fx * 2.9, kz + fz * 2.9];
    // the ground floor door of the building the clerk stands in
    let best = null, bd = Infinity;
    for (const o of this.map.openings) {
      if (!o.door || o.y0 > ky + 0.5) continue;
      if (kx < o.x0 - 0.5 || kx > o.x0 + o.w + 0.5 || kz < o.z0 - 0.5 || kz > o.z0 + o.d + 0.5) continue;
      const m = (o.a + o.b) / 2;
      const d = o.side === 's' ? { x: o.x0 + m, z: o.z0 + o.d, nx: 0, nz: 1 } : o.side === 'n' ? { x: o.x0 + m, z: o.z0, nx: 0, nz: -1 }
              : o.side === 'e' ? { x: o.x0 + o.w, z: o.z0 + m, nx: 1, nz: 0 } : { x: o.x0, z: o.z0 + m, nx: -1, nz: 0 };
      const dist = Math.hypot(d.x - counter[0], d.z - counter[1]);
      if (dist < bd) { bd = dist; best = d; }
    }
    // open stores (gas station) have no door: walk straight up to the counter from the street side
    if (!best) best = { x: counter[0] + fx * 3, z: counter[1] + fz * 3, nx: fx, nz: fz, open: true };
    const out = [best.x + best.nx * 2.2, best.z + best.nz * 2.2];
    const inside = [best.x - best.nx * 1.3, best.z - best.nz * 1.3];
    const spawn = [best.x + best.nx * 6, best.z + best.nz * 6];
    return { spawn, path: best.open ? [out, counter] : [out, inside, counter], door: best };
  }

  // ---------------------------------------------------------------- spawning
  tick(dt, t) {
    if (!this.on) return;
    const players = [...this.room.players.values()].filter(p => p.connected && p.pose && !p.jail);
    if (!players.length) { this.nextAt = null; return; }
    if (this.nextAt === null) this.nextAt = t + rand(...CROOK.firstDelay);
    if (t >= this.nextAt) {
      this.nextAt = t + rand(...CROOK.every);
      if (this.list().length < CROOK.max) (Math.random() < 0.55 ? this.startRobbery(t) || this.startCarTheft(t) : this.startCarTheft(t) || this.startRobbery(t));
    }
  }

  newCrook(x, z, job, extra = {}) {
    const y = this.npcs.floorAt(x, z, 0.2);
    const n = this.npcs.add({ type: NPC_TYPE.CROOK, x, y, z, yaw: 0, hp: CROOK.hp, maxHp: CROOK.hp, state: NPC_STATE.WALK, job, phase: 'go',
                              pi: 0, loot: 0, aggro: null, nextShot: 0, lastProgress: this.room.now(), progX: x, progZ: z, born: this.room.now(), respawnAt: 0, ...extra });
    this.room.broadcast({ type: 'npcSay', id: n.id, text: job === 'rob' ? '😈 heh heh...' : '😈 nice ride...' });
    return n;
  }

  startRobbery(t, shopName = null) {
    const taken = new Set(this.list().map(c => c.shop));
    const shops = this.npcs.list.filter(n => n.type === NPC_TYPE.SHOP && n.state !== NPC_STATE.DEAD && !n.rob && t >= n.closedUntil && !taken.has(n.shop) && this.routes.has(n.shop)
      && (!shopName || n.shop === shopName)
      && ![...this.room.players.values()].some(q => q.role === 'cop' && q.alive && q.pose && Math.hypot(q.pose.h[0] - n.x, q.pose.h[2] - n.z) < 12));
    if (!shops.length) return null;
    const clerk = shops[Math.floor(Math.random() * shops.length)];
    const r = this.routes.get(clerk.shop);
    return this.newCrook(r.spawn[0], r.spawn[1], 'rob', { shop: clerk.shop, clerk: clerk.id, path: r.path.map(p => [...p]) });
  }

  // a car stopped at a red light (or any NPC car if none are), not a police car, not already targeted
  startCarTheft(t, carId = null) {
    const V = this.room.vehicles;
    const taken = new Set(this.list().map(c => c.carTarget));
    let cars = V.cars.filter(c => c.driver === DRIVER.NPC && !c.police && !c.route && !c.van && !c.crook && !taken.has(c.id) && (!carId || c.id === carId));
    const waiting = cars.filter(c => c.speed < 1);
    if (waiting.length) cars = waiting;
    if (!cars.length) return null;
    const car = cars[Math.floor(Math.random() * cars.length)];
    // spawn on the sidewalk next to the car
    let spot = null;
    for (const loop of this.npcs.loops) for (let i = 0; i < 4; i++) {
      const [ax, az] = loop.pts[i], [bx, bz] = loop.pts[(i + 1) % 4];
      const L = Math.hypot(bx - ax, bz - az), k = Math.max(0, Math.min(1, ((car.x - ax) * (bx - ax) + (car.z - az) * (bz - az)) / (L * L)));
      const px = ax + (bx - ax) * k, pz = az + (bz - az) * k, d = Math.hypot(px - car.x, pz - car.z);
      if (d > 2.5 && d < 9 && (!spot || d < spot.d)) spot = { x: px, z: pz, d };
    }
    if (!spot) return null;
    car.crookTarget = true; car.crookWaitUntil = t + 14;
    return this.newCrook(spot.x, spot.z, 'car', { carTarget: car.id });
  }

  // ---------------------------------------------------------------- brains
  update(n, dt, t) {
    if (n.copsAt && t >= n.copsAt) { n.copsAt = 0; this.sendCops(n, 2); }
    if (n.surrender) { n.state = NPC_STATE.HANDSUP; return; }
    if (n.car) return this.driving(n, t);
    // fight back: shoot whoever shot us / the cops chasing us
    const foe = this.foe(n, t);
    if (foe) {
      n.yaw = Math.atan2(-(foe.x - n.x), -(foe.z - n.z)); n.state = NPC_STATE.AIM;
      if (t >= n.nextShot) this.shoot(n, foe, t);
      // keep running while shooting when fleeing, otherwise stand and fight
      if (n.phase === 'flee' || n.phase === 'away') this.follow(n, dt, t, 3.4);
      return;
    }
    if (n.job === 'rob') return this.robber(n, dt, t);
    return this.carThief(n, dt, t);
  }

  // walk along n.path; returns true when the end is reached
  follow(n, dt, t, speed) {
    if (!n.path || n.pi >= n.path.length) return true;
    const [px, pz] = n.path[n.pi];
    const dx = px - n.x, dz = pz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.45) { n.pi++; n.lastProgress = t; return n.pi >= n.path.length; }
    this.npcs.walk(n, dx / d, dz / d, Math.min(d, speed * dt));
    n.yaw = Math.atan2(-dx, -dz);
    if (n.state !== NPC_STATE.AIM || !this.foe(n, t)) n.state = NPC_STATE.WALK;
    if (Math.hypot(n.x - n.progX, n.z - n.progZ) > 0.6) { n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
    else if (t - n.lastProgress > 3) {
      // stuck on something: hop to the next point (keeps robbers from getting wedged on a shelf)
      n.x = px; n.z = pz; n.y = this.npcs.floorAt(px, pz, n.y); n.pi++; n.lastProgress = t; n.hist = [];
    }
    return false;
  }

  robber(n, dt, t) {
    const clerk = this.npcs.list.find(q => q.id === n.clerk);
    if (n.phase === 'go') {
      if (!clerk || clerk.state === NPC_STATE.DEAD || t < clerk.closedUntil || (clerk.rob && !clerk.rob.crook)) return this.runAway(n, t, false);
      if (this.follow(n, dt, t, 1.9)) { n.phase = 'rob'; n.robStart = t; this.alert(n, clerk); }
      return;
    }
    if (n.phase === 'rob') {
      if (!clerk || clerk.state === NPC_STATE.DEAD) return this.runAway(n, t, false);
      n.state = NPC_STATE.AIM; n.yaw = Math.atan2(-(clerk.x - n.x), -(clerk.z - n.z));
      clerk.rob = { crook: n.id, pid: -1, progress: t - n.robStart, last: t };
      clerk.state = NPC_STATE.HANDSUP; clerk.yaw = Math.atan2(-(n.x - clerk.x), -(n.z - clerk.z));
      if (t - n.robStart >= CROOK.robTime) {
        n.loot = 150 + Math.floor(Math.random() * 300);
        clerk.rob = null; clerk.closedUntil = t + 75;
        this.room.broadcast({ type: 'crook', ev: 'robbed', id: n.id, shop: n.shop, cash: n.loot, x: r2(n.x), z: r2(n.z) });
        return this.runAway(n, t, true);
      }
      return;
    }
    // flee: out of the door, then to a street corner far away, then gone
    if (this.follow(n, dt, t, 4.2)) this.escaped(n, t);
  }

  carThief(n, dt, t) {
    const car = this.room.vehicles.cars.find(c => c.id === n.carTarget);
    if (n.phase === 'go') {
      if (!car || car.driver !== DRIVER.NPC || car.crook || t > (car.crookWaitUntil || 0) + 2) { if (car) car.crookTarget = false; return this.runAway(n, t, false); }
      // the driver's door is on the car's left
      const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
      const dx = (car.x - lx * 1.5) - n.x, dz = (car.z - lz * 1.5) - n.z, d = Math.hypot(dx, dz);
      if (d < 1.0 || Math.hypot(car.x - n.x, car.z - n.z) < 2.2) return this.stealCar(n, car, t);
      this.npcs.walk(n, dx / d, dz / d, Math.min(d, 3.6 * dt)); n.yaw = Math.atan2(-dx, -dz); n.state = NPC_STATE.WALK;
      if (Math.hypot(n.x - n.progX, n.z - n.progZ) > 0.6) { n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
      else if (t - n.lastProgress > 3) return this.stealCar(n, car, t);   // wedged against the car: close enough
      return;
    }
    if (this.follow(n, dt, t, 4.2)) this.escaped(n, t);
  }

  stealCar(n, car, t) {
    const V = this.room.vehicles;
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    this.npcs.addRunner(car.x - lx * 1.8, car.z - lz * 1.8, car.x, car.z);   // the owner runs off screaming
    this.npcs.noise(car.x, car.z, 18);
    car.crook = n.id; car.crookTarget = false; car.crookUntil = t + CROOK.driveTime; car.speed = 4; car.waitSince = 0;
    n.car = car.id; n.phase = 'drive'; n.state = NPC_STATE.IDLE;
    this.seat(n, car);
    this.room.broadcast({ type: 'crook', ev: 'car', id: n.id, car: car.id, x: r2(car.x), z: r2(car.z) });
    for (const q of this.room.players.values()) if (q.role === 'cop') this.room.sendTo(q, { type: 'robAlert', shop: 'a car', by: -1, x: r2(car.x), z: r2(car.z), crook: 1 });
    void V;
  }
  // sit the robber in the driver's seat (he stays hittable through the window)
  seat(n, car) {
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw), fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    n.x = car.x - lx * 0.42 - fx * 0.25; n.z = car.z - lz * 0.42 - fz * 0.25; n.y = car.y - 0.3; n.yaw = car.yaw;
  }
  driving(n, t) {
    const car = this.room.vehicles.cars.find(c => c.id === n.car);
    if (!car || car.crook !== n.id) { n.car = null; n.phase = 'flee'; return this.runAway(n, t, true); }
    this.seat(n, car);
    if (t > car.crookUntil) {
      const near = [...this.room.players.values()].some(p => p.pose && Math.hypot(p.pose.h[0] - car.x, p.pose.h[2] - car.z) < 35);
      if (near) car.crookUntil = t + 8;
      else { car.crook = null; n.remove = true; this.room.broadcast({ type: 'crook', ev: 'gone', id: n.id }); }
    }
  }
  // a player took the car back: the robber jumps out and runs
  bail(car, t) {
    const n = this.npcs.list.find(q => q.id === car.crook);
    car.crook = null;
    if (!n) return;
    const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    n.car = null; n.x = car.x - lx * 1.9; n.z = car.z - lz * 1.9; n.y = this.npcs.floorAt(n.x, n.z, 0.2); n.hist = [];
    this.runAway(n, t, true);
  }

  // head for a street corner 35-80 m away (back out of the store door first)
  runAway(n, t, loud) {
    const route = n.job === 'rob' ? this.routes.get(n.shop) : null;
    const back = route && n.phase !== 'go' ? route.path.slice(0, -1).reverse() : [];
    const corners = this.npcs.copSpawns.map(s => ({ p: s.p, d: Math.hypot(s.p[0] - n.x, s.p[2] - n.z) })).filter(c => c.d > 35 && c.d < 80);
    const far = corners.length ? corners[Math.floor(Math.random() * corners.length)].p : [n.x + rand(-40, 40), 0, n.z + rand(-40, 40)];
    n.path = [...back, [far[0], far[2]]]; n.pi = 0; n.phase = loud ? 'flee' : 'away';
    n.lastProgress = t; n.progX = n.x; n.progZ = n.z;
    if (loud) { n.fleeSince = t; this.npcs.noise(n.x, n.z, 20); }
  }
  // reached the getaway corner: vanish if nobody is close, otherwise keep running
  escaped(n, t) {
    const near = [...this.room.players.values()].some(p => p.pose && Math.hypot(p.pose.h[0] - n.x, p.pose.h[2] - n.z) < 25);
    if (near && t - n.born < 150) return this.runAway(n, t, n.phase === 'flee');
    n.remove = true;
    if (n.loot) this.room.broadcast({ type: 'crook', ev: 'escaped', id: n.id, cash: n.loot });
  }

  alert(n, clerk) {
    this.room.broadcast({ type: 'crook', ev: 'rob', id: n.id, shop: n.shop, x: r2(clerk.x), z: r2(clerk.z) });
    this.room.broadcast({ type: 'npcSay', id: n.id, text: 'HANDS UP! EMPTY THE REGISTER!' });
    for (const q of this.room.players.values()) if (q.role === 'cop') this.room.sendTo(q, { type: 'robAlert', shop: n.shop, by: -1, x: r2(clerk.x), z: r2(clerk.z), crook: 1 });
    this.npcs.noise(n.x, n.z, 16);
    // NPC police respond (they take ~8 s to get there, so players get a chance to step in first)
    if (!n.noCops) n.copsAt = this.room.now() + 8;
  }
  sendCops(n, count) {
    const chasing = this.npcs.list.filter(c => c.type === NPC_TYPE.COP && c.crook === n.id).length;
    for (let i = chasing; i < count; i++) {
      const sp = this.npcs.copSpawns.map(s => ({ s, d: Math.hypot(s.p[0] - n.x, s.p[2] - n.z) })).filter(c => c.d > 18 && c.d < 60);
      const pick = sp.length ? sp[Math.floor(Math.random() * sp.length)].s.p : this.map.donutDoor;
      this.npcs.spawnCopForCrook(pick[0] + rand(-1.5, 1.5), pick[2] + rand(-1.5, 1.5), n);
    }
  }

  // ---------------------------------------------------------------- combat
  // who is this robber fighting? (whoever shot him, or a cop chasing him, if he can see them)
  foe(n, t) {
    if (n.phase === 'drive') return null;
    const cands = [];
    if (n.aggro && t - n.aggro.t < 20) {
      if (n.aggro.kind === 'p') { const p = this.room.players.get(n.aggro.id); if (p && p.alive && p.pose && !p.jail && !p.inCar) cands.push({ kind: 'p', ref: p, x: p.pose.h[0], y: p.pose.h[1], z: p.pose.h[2] }); }
      else { const c = this.npcs.list.find(q => q.id === n.aggro.id && q.state !== NPC_STATE.DEAD); if (c) cands.push({ kind: 'n', ref: c, x: c.x, y: c.y + HEAD_H, z: c.z }); }
    }
    for (const c of this.npcs.list) if (c.type === NPC_TYPE.COP && c.crook === n.id && c.state !== NPC_STATE.DEAD) cands.push({ kind: 'n', ref: c, x: c.x, y: c.y + HEAD_H, z: c.z });
    // cop players close by while he's on the job
    if (n.phase !== 'go') for (const p of this.room.players.values()) if (p.role === 'cop' && p.alive && p.pose && !p.inCar && Math.hypot(p.pose.h[0] - n.x, p.pose.h[2] - n.z) < 14) cands.push({ kind: 'p', ref: p, x: p.pose.h[0], y: p.pose.h[1], z: p.pose.h[2] });
    let best = null, bd = 26;
    for (const c of cands) {
      const hx = n.x, hy = n.y + HEAD_H, hz = n.z, d = Math.hypot(c.x - hx, c.y - hy, c.z - hz);
      if (d >= bd || d < 0.3) continue;
      if (this.world.raycast(hx, hy, hz, (c.x - hx) / d, (c.y - hy) / d, (c.z - hz) / d, d) < d - 0.5) continue;
      best = c; bd = d;
    }
    return best;
  }
  shoot(n, foe, t) {
    n.nextShot = t + rand(0.9, 1.6);
    const hx = n.x, hy = n.y + HEAD_H, hz = n.z, d = Math.hypot(foe.x - hx, foe.y - hy, foe.z - hz);
    const hit = Math.random() < Math.max(0.15, 0.5 - d * 0.012);
    const ex = foe.x + (hit ? 0 : rand(-1, 1)), ey = foe.y - (hit ? 0.4 : rand(0, 1.2)), ez = foe.z + (hit ? 0 : rand(-1, 1));
    this.room.broadcast({ type: 'npcShot', id: n.id, o: [r2(hx), r2(hy - 0.35), r2(hz)], e: [r2(ex), r2(ey), r2(ez)], crook: 1 });
    this.npcs.noise(hx, hz, 20);
    if (!hit) return;
    if (foe.kind === 'p') this.room.damage(foe.ref, null, CROOK.dmgPlayer, 'robber', false, [hx, hy, hz]);
    else this.npcs.damage(foe.ref, null, CROOK.dmgCop, false, 'robber');
  }

  // a robber got hurt (by a player, a cop or a car)
  onHurt(n, attacker, t) {
    if (attacker) n.aggro = { kind: 'p', id: attacker.id, t };
    if (n.phase === 'go' && n.job === 'rob' && n.hp < n.maxHp) this.runAway(n, t, true);   // spooked before the job: run
    // badly hurt with police close: give up
    if (n.hp < 30 && !n.car && !n.surrender) {
      const copNear = this.npcs.list.some(c => c.type === NPC_TYPE.COP && c.state !== NPC_STATE.DEAD && Math.hypot(c.x - n.x, c.z - n.z) < 10)
        || [...this.room.players.values()].some(p => p.role === 'cop' && p.alive && p.pose && Math.hypot(p.pose.h[0] - n.x, p.pose.h[2] - n.z) < 10);
      if (copNear) { n.surrender = t; n.state = NPC_STATE.HANDSUP; this.room.broadcast({ type: 'npcSay', id: n.id, text: "OK OK! DON'T SHOOT! I GIVE UP!" }); }
    }
  }
  // a robber went down: bounty + the loot to whoever did it
  onDeath(n, attacker) {
    const clerk = this.npcs.list.find(q => q.id === n.clerk);
    if (clerk && clerk.rob && clerk.rob.crook === n.id) clerk.rob = null;
    if (n.car) {
      const car = this.room.vehicles.cars.find(c => c.id === n.car);
      if (car && car.crook === n.id) { car.crook = null; car.driver = DRIVER.NONE; car.speed = 0; car.emptySince = this.room.now(); }
      n.car = null;
    }
    for (const car of this.room.vehicles.cars) if (car.crookTarget && n.carTarget === car.id) car.crookTarget = false;
    if (!attacker) { this.room.broadcast({ type: 'crook', ev: 'down', id: n.id }); return; }
    const pay = (attacker.role === 'cop' ? CROOK.bounty * 2 : CROOK.bounty) + (n.loot || 0);
    attacker.cash = (attacker.cash || 0) + pay;
    this.room.saves.stat(attacker, 'crooks');
    this.room.sendTo(attacker, { type: 'crook', ev: 'bounty', id: n.id, cash: pay, loot: n.loot || 0, total: attacker.cash });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(attacker) });
  }

  // cop player cuffs a robber (E / grip next to him)
  onArrest(p, id) {
    const n = this.npcs.list.find(q => q.id === id && q.type === NPC_TYPE.CROOK);
    if (!n || n.state === NPC_STATE.DEAD || n.car || p.role !== 'cop' || !p.alive || !p.pose || p.jail || p.inCar) return;
    if (Math.hypot(p.pose.h[0] - n.x, p.pose.h[2] - n.z) > 3.2 || Math.abs(p.pose.h[1] - (n.y + HEAD_H)) > 2.2) return;
    this.arrest(n, p);
  }
  arrest(n, p) {
    const clerk = this.npcs.list.find(q => q.id === n.clerk);
    if (clerk && clerk.rob && clerk.rob.crook === n.id) clerk.rob = null;
    for (const car of this.room.vehicles.cars) if (n.carTarget === car.id) car.crookTarget = false;
    n.remove = true;
    if (p) {
      const pay = CROOK.arrestPay + (n.loot || 0);
      p.cash = (p.cash || 0) + pay;
      this.room.saves.stat(p, 'crooks', 1, 'crookArrest');
      this.room.sendTo(p, { type: 'crook', ev: 'bounty', id: n.id, cash: pay, loot: n.loot || 0, total: p.cash, arrest: 1 });
      this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    }
    this.room.broadcast({ type: 'crook', ev: 'arrested', id: n.id, by: p ? p.id : 0, x: r2(n.x), y: r2(n.y), z: r2(n.z) });
  }
}
