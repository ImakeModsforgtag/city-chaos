// CITY CHAOS - server-side vehicles: NPC traffic, hijacking, player driving, run-overs.
// NPC cars follow lane loops and brake for anything in front of them. When a player hijacks a
// car, that player's client drives it (instant response) and the server validates + relays it.
import { roadRoute } from '../public/shared/roads.js';
import { SIGNALS, signalState } from '../public/shared/cityKit.js';
import { inPrisonArea } from '../public/shared/prison.js';
import { NPC_TYPE, NPC_STATE } from './npcs.js';

const NPC_CARS = 10;
const CRUISE = 9;              // m/s NPC driving speed
const HIJACK_RANGE = 4.4;      // meters from the car's center
const MAX_PLAYER_SPEED = 34;   // m/s anti-cheat cap for player-driven cars
const ABANDON_RESPAWN = 45;    // seconds an empty car waits before rejoining traffic
const CAR_HALF_L = 2.15, CAR_HALF_W = 1.0;
const POLICE_COLOR = 8;
const r2 = (v) => Math.round(v * 100) / 100;

export const DRIVER = { NPC: 0, PLAYER: 1, NONE: 2 };

export class VehicleManager {
  constructor(room, map, world) {
    this.room = room; this.map = map; this.world = world;
    this.loops = map.trafficLoops.map(pts => {
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segs.push({ a, b, len, start: total }); total += len;
      }
      return { segs, total };
    });
    this.reset();
  }

  reset() {
    this.cars = [];
    for (let i = 0; i < NPC_CARS; i++) {
      const li = i % this.loops.length;
      const loop = this.loops[li];
      const s = ((i / NPC_CARS) * 3.7 % 1) * loop.total;
      const car = { id: i + 1, color: i % 8, loop: li, s, x: 0, y: 0, z: 0, yaw: 0, speed: CRUISE, driver: DRIVER.NPC, pid: 0,
                    waitSince: 0, pushUntil: 0, emptySince: 0, lastHonk: 0, hits: new Map() };
      this.placeOnLoop(car); car.yaw = this.loopYaw(car);
      this.cars.push(car);
    }
    // the prison van (vehicle escape route): only a prisoner holding the VAN KEYS can drive it
    { const [x, y, z, yaw] = this.map.prison.van;
      this.vanId = 9000;
      this.cars.push({ id: this.vanId, color: 10, van: true, home: [x, y, z, yaw], x, y, z, yaw, speed: 0, driver: DRIVER.NONE, pid: 0, siren: false, emptySince: 0, hits: new Map(), lastHonk: 0, waitSince: 0, pushUntil: 0 }); }
    // police cars parked in the station lot (only cops can drive them without getting wanted)
    this.nextId = NPC_CARS + 1;
    for (const [x, y, z, yaw] of this.map.policeLot) {
      this.cars.push({ id: this.nextId++, color: POLICE_COLOR, police: true, home: [x, y, z, yaw], x, y, z, yaw, speed: 0, driver: DRIVER.NONE, pid: 0,
                       siren: false, emptySince: 0, hits: new Map(), lastHonk: 0, waitSince: 0, pushUntil: 0 });
    }
  }

  // ---------------------------------------------------------------- police dispatch
  dispatchCount() { return this.cars.filter(c => c.route).length; }
  pendingFor(p) { return this.cars.filter(c => c.route && c.target === p.id).length; }

  route(sx, sz, tx, tz) { return roadRoute(sx, sz, tx, tz); }

  // send a police car (with 2 cops inside) from the station to a wanted player
  dispatch(p) {
    if (!p.pose || this.dispatchCount() >= 2) return false;
    const [ex, , ez] = this.map.policeExit;
    const route = this.route(ex, ez, p.pose.h[0], p.pose.h[2]);
    if (route.length < 2) return false;
    const [x, z] = route[0];
    const car = { id: this.nextId++, color: p.wanted >= 3 ? 9 : POLICE_COLOR, police: true, temp: true, swat: p.wanted >= 4, x, y: 0, z, yaw: Math.atan2(-(route[1][0] - x), -(route[1][1] - z)),
                  speed: 4, driver: DRIVER.NPC, pid: 0, siren: true, route, ri: 1, target: p.id, emptySince: 0, hits: new Map(), lastHonk: 0, waitSince: 0, pushUntil: 0, born: this.room.now() };
    this.cars.push(car);
    this.room.broadcast({ type: 'dispatch', id: car.id, target: p.id });
    return true;
  }

  driveRoute(car, dt, t) {
    const target = this.room.players.get(car.target);
    const tp = target && target.alive && target.pose ? target.pose.h : null;
    const arrived = car.ri >= car.route.length || (tp && Math.hypot(tp[0] - car.x, tp[2] - car.z) < 16) || t - car.born > 60;
    if (arrived) {
      car.speed = 0; car.route = null; car.driver = DRIVER.NONE; car.siren = false; car.emptySince = t;
      if (target && target.alive && target.wanted) {
        const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
        this.room.npcs.spawnCopAt(car.x - lx * 2, car.z - lz * 2, target, { swat: car.swat });
        this.room.npcs.spawnCopAt(car.x + lx * 2, car.z + lz * 2, target, { swat: car.swat });
        this.room.broadcast({ type: 'copsOut', id: car.id });
      }
      return;
    }
    // brake only for cars right in front (everyone else gets out of the way of the siren)
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    let blocked = false;
    for (const o of this.cars) { if (o === car) continue; const dx = o.x - car.x, dz = o.z - car.z, ah = dx * fx + dz * fz; if (ah > 0.5 && ah < 7 && Math.abs(dx * -fz + dz * fx) < 2.2) { blocked = true; break; } }
    const want = blocked ? 0 : 13;
    car.speed += Math.max(-16 * dt, Math.min(7 * dt, want - car.speed));
    let left = car.speed * dt;
    while (left > 0 && car.ri < car.route.length) {
      const [px, pz] = car.route[car.ri];
      const dx = px - car.x, dz = pz - car.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { car.ri++; continue; }
      const st = Math.min(d, left); car.x += dx / d * st; car.z += dz / d * st; left -= st;
      const yaw = Math.atan2(-dx, -dz); let dy = yaw - car.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); car.yaw += dy * 0.5;
    }
  }

  onSiren(p, on) {
    const car = this.cars.find(c => c.id === p.inCar);
    if (car && car.police) { car.siren = !!on; this.room.broadcast({ type: 'siren', id: car.id, on: car.siren }); }
  }

  // position + heading at distance s along the car's loop
  placeOnLoop(car) {
    const loop = this.loops[car.loop];
    car.s = ((car.s % loop.total) + loop.total) % loop.total;
    const seg = loop.segs.find(g => car.s >= g.start && car.s < g.start + g.len) || loop.segs[0];
    const k = (car.s - seg.start) / seg.len;
    car.x = seg.a[0] + (seg.b[0] - seg.a[0]) * k;
    car.z = seg.a[1] + (seg.b[1] - seg.a[1]) * k;
    car.y = 0;
    const want = Math.atan2(-(seg.b[0] - seg.a[0]), -(seg.b[1] - seg.a[1]));
    let d = want - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    car.yaw += d * 0.35; // smooth turn through corners
  }

  // is something (car, player or NPC) right in front of this NPC car?
  blocked(car) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const check = (x, z, range, half) => {
      const dx = x - car.x, dz = z - car.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      return ahead > 0.5 && ahead < range && side < half;
    };
    // a robber is walking up to this car: the driver is waiting at the light and doesn't see him coming
    if (car.crookTarget && this.room.now() < (car.crookWaitUntil || 0)) return 'crook';
    for (const o of this.cars) if (o !== car && check(o.x, o.z, 8.5, 2.4)) { car.blocker = o; return 'car'; }
    // traffic lights: stop at the line on red (and on yellow if there's still room to stop)
    if ((!car.police || !car.siren) && !car.crook) {   // car thieves run red lights
      const alongX = Math.abs(fx) > 0.7, alongZ = Math.abs(fz) > 0.7, t = this.room.now();
      if (alongX || alongZ) for (const [ix, iz] of SIGNALS) {
        if (alongX ? Math.abs(car.z - iz) > 6 : Math.abs(car.x - ix) > 6) continue;
        const ahead = alongX ? (ix - car.x) * fx : (iz - car.z) * fz;
        if (ahead < 8.2 || ahead > 13) continue;
        const st = signalState(ix, iz, alongX ? 'x' : 'z', t);
        if (st === 'r' || (st === 'y' && ahead > 10)) return 'light';
      }
    }
    for (const p of this.room.players.values()) {
      if (!p.alive || !p.pose || p.inCar || p.ride || p.pose.h[1] > car.y + 3.5) continue;
      if (check(p.pose.h[0], p.pose.h[2], 9, 2.2)) return 'player';
      // someone walking up to the car (e.g. to the driver's door): the driver freezes (a car thief doesn't)
      if (!car.crook && Math.hypot(p.pose.h[0] - car.x, p.pose.h[2] - car.z) < 4.2) return 'near';
    }
    for (const n of this.room.npcs.list) if (n.state !== NPC_STATE.DEAD && check(n.x, n.z, 7, 2.0)) return 'npc';
    return null;
  }

  // ---------------------------------------------------------------- hijacking + driving
  onHijack(p, id) {
    const car = this.cars.find(c => c.id === id);
    if (!car || !p.alive || !p.pose || p.inCar || p.ride) return;
    if (car.van && car.driver !== DRIVER.PLAYER && !(p.jail && p.jail.items.has('VANKEYS'))) return this.room.sendTo(p, { type: 'pMsg', text: 'The prison van is locked. You need the 🔑 VAN KEYS.' }); // (friends can still hop in once it's moving)
    if (p.holding || (p.jail && !car.van)) return;
    const [hx, hy, hz] = p.pose.h;
    if (Math.hypot(hx - car.x, hz - car.z) > HIJACK_RANGE || Math.abs(hy - car.y) > 3.5) return;
    if (car.driver === DRIVER.PLAYER) {
      // getaway ride: hop into a free seat of a car your teammate is driving (civilians with civilians, cops with cops)
      const d = this.room.players.get(car.pid);
      if (!d || car.pid === p.id) return;
      if ((d.role || 'civilian') !== (p.role || 'civilian')) return this.room.sendTo(p, { type: 'pMsg', text: p.role === 'cop' ? 'That\'s a civilian\'s car. Arrest them instead!' : 'You can\'t ride with a cop!' });
      return this.addRider(p, car);
    }
    const t = this.room.now();
    if (car.police && p.role !== 'cop') {
      this.room.npcs.addWanted(p, 2, 'stole a police car');
      this.room.npcs.spawnCopsFor(p, 2);
    }
    if (car.driver === DRIVER.NPC && car.route) { car.route = null; car.siren = false; } // police dispatch car: the cop driver gives up the car
    else if (car.driver === DRIVER.NPC && car.crook) { this.room.npcs.crooks.bail(car, t); this.room.npcs.noise(car.x, car.z, 18); } // taking a stolen car back from a thief: no crime
    else if (car.driver === DRIVER.NPC) {
      // the driver bails out of the left door and runs for it
      const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw); // car's left side
      this.room.npcs.addRunner(car.x - lx * 1.8, car.z - lz * 1.8, car.x, car.z);
      if (p.role !== 'cop') this.room.npcs.addWanted(p, 1, 'carjacking'); // cops can commandeer cars
      this.room.npcs.noise(car.x, car.z, 18);
    }
    if (car.driver === DRIVER.NPC) this.room.saves.stat(p, 'cars');
    car.driver = DRIVER.PLAYER; car.pid = p.id; car.speed = 0; car.emptySince = 0;
    p.inCar = car.id;
    car.hits = new Map();
    this.room.broadcast({ type: 'carEnter', id: car.id, pid: p.id, hijacked: true, car: this.carArr(car) });
  }

  onExit(p) {
    if (p.ride && !p.inCar) return this.removeRider(p);
    const car = this.cars.find(c => c.id === p.inCar);
    p.inCar = 0;
    if (!car) return;
    car.driver = DRIVER.NONE; car.pid = 0; car.speed = 0; car.emptySince = this.room.now();
    this.room.broadcast({ type: 'carExit', id: car.id, pid: p.id });
  }

  playerGone(p) { if (p.inCar) this.onExit(p); if (p.ride) this.removeRider(p); }

  // ---------------------------------------------------------------- passengers (getaway rides)
  riders(car) { return car.riders || (car.riders = new Map()); }
  addRider(p, car) {
    const r = this.riders(car), used = new Set(r.values());
    const seat = [0, 1, 2].find(s => !used.has(s));
    if (seat === undefined) return this.room.sendTo(p, { type: 'pMsg', text: 'The car is full (3 passengers max).' });
    r.set(p.id, seat);
    p.ride = { car: car.id, seat };
    this.room.broadcast({ type: 'carRide', id: car.id, pid: p.id, seat, on: true });
  }
  removeRider(p) {
    const car = this.cars.find(c => p.ride && c.id === p.ride.car);
    const seat = p.ride ? p.ride.seat : 0;
    p.ride = null;
    if (car) this.riders(car).delete(p.id);
    this.room.broadcast({ type: 'carRide', id: car ? car.id : 0, pid: p.id, seat, on: false });
  }
  ejectRiders(car) {
    for (const pid of [...this.riders(car).keys()]) { const q = this.room.players.get(pid); if (q) this.removeRider(q); else this.riders(car).delete(pid); }
  }

  // driver's client reports the car each state update: [id, x, y, z, yaw, speed]
  onCarState(p, c) {
    const car = this.cars.find(k => k.id === p.inCar);
    if (!car || car.pid !== p.id || !Array.isArray(c) || c.length !== 6 || c[0] !== car.id) return;
    const [, x, y, z, yaw, speed] = c.map(Number);
    if (![x, y, z, yaw, speed].every(Number.isFinite)) return;
    if ((Math.abs(x) > 125 || Math.abs(z) > 125) && !(car.van && inPrisonArea(x, z))) return;
    if (y < -8 || y > 40) return;
    const t = this.room.now();
    const dt = Math.max(0.03, t - (car.lastUpdate || t - 0.05));
    const moved = Math.hypot(x - car.x, z - car.z);
    if (moved / dt > MAX_PLAYER_SPEED * 1.5 && moved > 4) return; // impossible jump -> ignore
    const prevX = car.x, prevZ = car.z;
    car.x = x; car.y = y; car.z = z; car.yaw = yaw;
    car.speed = Math.max(-12, Math.min(MAX_PLAYER_SPEED, speed));
    car.lastUpdate = t;
    this.runOver(car, p, prevX, prevZ, t);
  }

  // damage players + NPCs the car plows into
  runOver(car, driver, px, pz, t) {
    const sp = Math.abs(car.speed);
    if (sp < 5) return;
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const inside = (x, y, z) => {
      if (Math.abs(y - car.y) > 2.6) return false;
      const dx = x - car.x, dz = z - car.z;
      return Math.abs(dx * fx + dz * fz) < CAR_HALF_L + 0.45 && Math.abs(dx * -fz + dz * fx) < CAR_HALF_W + 0.45;
    };
    const dmg = Math.min(110, Math.round(sp * 5));
    for (const q of this.room.players.values()) {
      if (q === driver || !q.alive || !q.pose || q.inCar || q.ride) continue;
      if ((car.hits.get('p' + q.id) || 0) > t) continue;
      if (inside(q.pose.h[0], q.pose.h[1] - 0.8, q.pose.h[2])) {
        car.hits.set('p' + q.id, t + 1);
        if (this.room.mode === 'tdm' && q.team === driver.team) continue;
        this.room.broadcast({ type: 'carHit', id: car.id, victim: q.id, v: [r2(fx * sp * 0.6), 4, r2(fz * sp * 0.6)] });
        this.room.damage(q, driver, dmg, 'car', false, [car.x, car.y + 1, car.z]);
      }
    }
    for (const n of [...this.room.npcs.list]) {
      if (n.state === NPC_STATE.DEAD) continue;
      if ((car.hits.get('n' + n.id) || 0) > t) continue;
      if (inside(n.x, n.y + 0.8, n.z)) { car.hits.set('n' + n.id, t + 1); this.room.npcs.damage(n, driver, dmg, false, 'car'); }
    }
  }

  // ---------------------------------------------------------------- simulation (10 Hz)
  tick(dt) {
    const t = this.room.now();
    this.cleanup();
    for (const car of this.cars) {
      if (car.driver === DRIVER.PLAYER) {
        const p = this.room.players.get(car.pid);
        if (!p || !p.alive || !p.connected || p.inCar !== car.id) { if (p) p.inCar = 0; car.driver = DRIVER.NONE; car.pid = 0; car.speed = 0; car.emptySince = t; this.room.broadcast({ type: 'carExit', id: car.id, pid: p ? p.id : 0 }); }
        continue;
      }
      if (car.route) { this.driveRoute(car, dt, t); continue; }
      if (car.temp && car.driver === DRIVER.NONE) {
        const near = [...this.room.players.values()].some(p => p.pose && Math.hypot(p.pose.h[0] - car.x, p.pose.h[2] - car.z) < 30);
        if (!near && t - car.emptySince > 40) car.remove = true;
        continue;
      }
      if (car.home && car.driver === DRIVER.NONE) {
        // police lot cars drive themselves back... well, reappear in the lot after a minute
        const [hx, hy, hz, hyaw] = car.home;
        const away = Math.hypot(car.x - hx, car.z - hz) > 2;
        const near = [...this.room.players.values()].some(p => p.pose && (Math.hypot(p.pose.h[0] - car.x, p.pose.h[2] - car.z) < 25 || Math.hypot(p.pose.h[0] - hx, p.pose.h[2] - hz) < 10));
        if (away && !near && t - car.emptySince > 60) { car.x = hx; car.y = hy; car.z = hz; car.yaw = hyaw; car.siren = false; }
        continue;
      }
      if (car.driver === DRIVER.NONE) {
        // abandoned: rejoin traffic later (jump to a random spot on a loop, away from players)
        if (!car.police && t - car.emptySince > ABANDON_RESPAWN) {
          const near = [...this.room.players.values()].some(p => p.pose && Math.hypot(p.pose.h[0] - car.x, p.pose.h[2] - car.z) < 25);
          if (!near) {
            car.loop = Math.floor(Math.random() * this.loops.length); car.s = Math.random() * this.loops[car.loop].total;
            car.driver = DRIVER.NPC; car.speed = CRUISE; car.yaw = 0; this.placeOnLoop(car); car.yaw = this.loopYaw(car);
          }
        }
        continue;
      }
      // NPC driving: brake for obstacles, nudge through after waiting a while (no gridlock)
      const why = t < car.pushUntil ? null : this.blocked(car);
      // waiting in line behind a car that's stopped at a red light is a normal wait, not a jam
      car.queued = why === 'light' || (why === 'car' && !!car.blocker && !!car.blocker.queued);
      const target = why ? 0 : car.crook ? CRUISE * 1.6 : CRUISE;   // car thieves floor it
      car.speed += Math.max(-14 * dt, Math.min(5 * dt, target - car.speed));
      if (why) {
        if (!car.waitSince) car.waitSince = t;
        if (why === 'player' && t - car.lastHonk > 3) { car.lastHonk = t; this.room.broadcast({ type: 'honk', id: car.id }); }
        if (why === 'car' && t - car.waitSince > (car.queued ? 25 : 3)) car.pushUntil = t + 2;
        if (car.crook && t - car.waitSince > 1.2) { car.pushUntil = t + 1.5; if (t - car.lastHonk > 2) { car.lastHonk = t; this.room.broadcast({ type: 'honk', id: car.id }); } }
      } else car.waitSince = 0;
      car.s += car.speed * dt;
      this.placeOnLoop(car);
      if (car.crook) { const n = this.room.npcs.list.find(q => q.id === car.crook); if (n) this.room.npcs.crooks.seat(n, car); }
    }
  }
  sendHome(car) { this.ejectRiders(car); this.sendHomeRaw(car); }
  sendHomeRaw(car) { const [hx, hy, hz, hyaw] = car.home; Object.assign(car, { x: hx, y: hy, z: hz, yaw: hyaw, speed: 0, siren: false, driver: DRIVER.NONE, pid: 0 }); }
  cleanup() { for (const c of this.cars) if (c.remove) this.ejectRiders(c); this.cars = this.cars.filter(c => !c.remove); }
  loopYaw(car) { const loop = this.loops[car.loop]; const seg = loop.segs.find(g => car.s >= g.start && car.s < g.start + g.len) || loop.segs[0]; return Math.atan2(-(seg.b[0] - seg.a[0]), -(seg.b[1] - seg.a[1])); }

  carArr(c) { return [c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), r2(c.speed), c.driver, c.pid || 0, c.color, c.police ? 1 : 0, c.siren ? 1 : 0, c.crook ? 1 : 0]; }
  snapshot() { return this.cars.map(c => this.carArr(c)); }
}
