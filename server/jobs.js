// CITY CHAOS - jobs (server). Start one at the 💼 JOBS kiosk on the plaza (it uses the store menu).
//   📦 Food Delivery: pick up an order at a food store counter, run it to a customer's door before the timer runs out
//      (late = half pay, very late = the customer cancels).
//   🚕 Taxi: get any car, drive to a passenger waiting on the sidewalk, stop next to them, drive them to their stop.
// Pay grows with the distance. Every job gives XP and counts for the "finish jobs" daily mission.
import { JOBS, jobPay, jobTime } from '../public/shared/economy.js';
import { NPC_TYPE, NPC_STATE } from './npcs.js';

const r2 = (v) => Math.round(v * 100) / 100;
const FOOD = ['SNAX', 'DONUTS', 'STAR DINER', 'GAS & GO'];
const LATE_GRACE = 30;      // seconds after the timer you can still deliver (half pay)
const CAR_GRACE = 15;       // taxi: seconds you can be out of your car before the passenger gives up
const rand = (a) => a[Math.floor(Math.random() * a.length)];

export class Jobs {
  constructor(room, map) {
    this.room = room; this.map = map;
    // food store counters (where orders are picked up)
    this.counters = map.shops.filter(s => FOOD.includes(s.name)).map(s => ({ name: s.name, p: [s.keeper[0] - Math.sin(s.yaw) * 2.9, s.keeper[1], s.keeper[2] - Math.cos(s.yaw) * 2.9] }));
    // customer doors: houses + ground floor doors of buildings (named after the nearest sign)
    this.doors = [];
    let n = 1;
    for (const b of map.buildings) if (b.kind === 'house') {
      const north = b.front === 'n', z = north ? b.z0 - 2.2 : b.z1 + 2.2;
      this.doors.push({ name: `House #${n++} (Maple St)`, p: [b.doorX, 0.15, z] });
    }
    for (const o of map.openings) {
      if (!o.door || o.y0 > 0.5) continue;
      const m = (o.a + o.b) / 2;
      const d = o.side === 's' ? [o.x0 + m, o.z0 + o.d + 1.8] : o.side === 'n' ? [o.x0 + m, o.z0 - 1.8] : o.side === 'e' ? [o.x0 + o.w + 1.8, o.z0 + m] : [o.x0 - 1.8, o.z0 + m];
      let name = null, bd = 30;
      for (const l of map.labels) { const dd = Math.hypot(l.p[0] - d[0], l.p[2] - d[1]); if (dd < bd && !/PARKING|JOBS/.test(l.text)) { bd = dd; name = l.text; } }
      if (name && !FOOD.includes(name)) this.doors.push({ name, p: [d[0], 0.15, d[1]] });
    }
  }
  sidewalkSpot(near, minD, maxD) {
    const L = this.room.npcs.loops;
    for (let tries = 0; tries < 60; tries++) {
      const loop = rand(L), i = Math.floor(Math.random() * 4), k = 0.15 + Math.random() * 0.7;
      const [ax, az] = loop.pts[i], [bx, bz] = loop.pts[(i + 1) % 4];
      const x = ax + (bx - ax) * k, z = az + (bz - az) * k, d = Math.hypot(x - near[0], z - near[2]);
      if (d >= minD && d <= maxD) return [x, loop.y, z];
    }
    return null;
  }
  head(p) { return p.pose ? p.pose.h : null; }
  car(p) { return p.inCar ? this.room.vehicles.cars.find(c => c.id === p.inCar) : null; }

  send(p, extra = {}) {
    const j = p.job, t = this.room.now();
    if (!j) return this.room.sendTo(p, { type: 'job', kind: null, ...extra });
    this.room.sendTo(p, { type: 'job', kind: j.kind, phase: j.phase, target: j.target ? j.target.map(r2) : null, text: j.text,
                          left: j.until ? Math.max(0, Math.round(j.until - t)) : 0, pay: j.pay || 0, ...extra });
  }

  // ---------------------------------------------------------------- start / quit (from the JOBS kiosk menu)
  start(p, kind) {
    if (!JOBS[kind]) return { ok: 0, why: 'No such job' };
    if (!p.alive || p.jail) return { ok: 0, why: 'You can\'t work right now' };
    if (p.job) this.end(p, 'quit', true);
    const h = this.head(p);
    if (kind === 'delivery') {
      const opts = this.counters.filter(c => { const n = this.room.npcs.list.find(q => q.type === NPC_TYPE.SHOP && q.shop === c.name); return n && n.state !== NPC_STATE.DEAD; });
      if (!opts.length) return { ok: 0, why: 'No food stores are open' };
      const c = rand(opts);
      p.job = { kind, phase: 'pickup', target: c.p, text: `Pick up the order at ${c.name}`, from: c.name, until: 0 };
    } else {
      p.job = { kind, phase: 'needcar', target: null, text: 'Get a car (E / grip on any car), then go pick up your passenger', until: 0 };
      if (p.inCar) this.taxiPickup(p);
    }
    this.send(p, { started: 1 });
    void h;
    return { ok: 1 };
  }
  taxiPickup(p) {
    const car = this.car(p), from = car ? [car.x, 0, car.z] : this.head(p);
    const spot = this.sidewalkSpot(from, 35, 140) || this.sidewalkSpot(from, 10, 400);
    if (!spot) return;
    const fare = this.room.npcs.add({ type: NPC_TYPE.PED, fare: p.id, x: spot[0], y: spot[1], z: spot[2], yaw: 0, hp: 40, maxHp: 40, state: NPC_STATE.IDLE, respawnAt: 0 });
    Object.assign(p.job, { phase: 'pickup', target: [spot[0], spot[1], spot[2]], fareId: fare.id, text: 'Pick up the passenger waiting on the sidewalk' });
    this.send(p);
  }
  end(p, why, silent = false) {
    const j = p.job; if (!j) return;
    if (j.fareId) { const f = this.room.npcs.list.find(n => n.id === j.fareId); if (f) { f.fare = 0; f.remove = true; } }
    p.job = null;
    if (!silent) this.send(p, { result: why });
  }
  pay(p, late) {
    const j = p.job, cash = jobPay(j.kind, j.dist, late);
    p.cash = (p.cash || 0) + cash;
    this.room.saves.stat(p, 'jobs', 1, 'job');
    this.room.saves.event(p, 'jobs', 1);
    const kind = j.kind;
    this.end(p, late ? 'late' : 'paid', true);
    this.room.sendTo(p, { type: 'job', kind: null, result: late ? 'late' : 'paid', paid: cash, cash: p.cash, was: kind });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
  }

  // ---------------------------------------------------------------- progress
  tick() {
    const t = this.room.now();
    for (const p of this.room.players.values()) {
      const j = p.job; if (!j) continue;
      if (!p.connected) { this.end(p, 'quit', true); continue; }
      if (!p.alive || p.jail) { this.end(p, 'failed'); continue; }
      const h = this.head(p); if (!h) continue;
      const J = JOBS[j.kind];
      if (j.kind === 'delivery') {
        const d = Math.hypot(h[0] - j.target[0], h[2] - j.target[2]), dy = Math.abs(h[1] - j.target[1] - 1.5);
        if (j.phase === 'pickup' && d < J.reach && dy < 2.5) {
          const from = j.target, ok = this.doors.filter(q => { const dd = Math.hypot(q.p[0] - from[0], q.p[2] - from[2]); return dd > 50 && dd < 170; });
          const dest = rand(ok.length ? ok : this.doors);
          j.dist = Math.round(Math.hypot(dest.p[0] - from[0], dest.p[2] - from[2]) * 1.25);
          Object.assign(j, { phase: 'drop', target: dest.p, text: `Deliver the order to ${dest.name}`, until: t + jobTime('delivery', j.dist), pay: jobPay('delivery', j.dist) });
          this.send(p, { picked: 1 });
        } else if (j.phase === 'drop') {
          if (d < J.reach && dy < 2.5) this.pay(p, t > j.until);
          else if (t > j.until + LATE_GRACE) this.end(p, 'timeout');
        }
        continue;
      }
      // taxi
      const car = this.car(p);
      if (j.phase === 'needcar') { if (car) this.taxiPickup(p); continue; }
      if (!car) { j.outSince = j.outSince || t; if (t - j.outSince > CAR_GRACE) this.end(p, j.phase === 'drop' ? 'passenger' : 'failed'); continue; }
      j.outSince = 0;
      const d = Math.hypot(car.x - j.target[0], car.z - j.target[2]), slow = Math.abs(car.speed) < J.stopSpeed;
      if (j.phase === 'pickup') {
        const fare = this.room.npcs.list.find(n => n.id === j.fareId);
        if (!fare || fare.state === NPC_STATE.DEAD) { this.end(p, 'hurt'); continue; }
        if (d < J.reach && slow) {
          fare.fare = 0; fare.remove = true; j.fareId = 0;
          const dest = this.sidewalkSpot(j.target, 90, 220) || this.sidewalkSpot(j.target, 40, 400);
          j.dist = Math.round(Math.hypot(dest[0] - j.target[0], dest[2] - j.target[2]) * 1.25);
          Object.assign(j, { phase: 'drop', target: dest, text: 'Drive your passenger to the marked stop', until: t + jobTime('taxi', j.dist), pay: jobPay('taxi', j.dist) });
          this.send(p, { picked: 1 });
        }
      } else if (j.phase === 'drop') {
        if (d < J.reach && slow) {
          // the passenger gets out and walks off
          const lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
          this.room.npcs.addRunner(car.x + lx * 1.8, car.z + lz * 1.8, car.x, car.z);
          this.pay(p, t > j.until);
        } else if (t > j.until + LATE_GRACE) this.end(p, 'timeout');
      }
    }
  }
}
