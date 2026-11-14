// CITY CHAOS - street races (server authority). See public/shared/races.js for the rules.
// Positions come from the cars the racers are driving (validated by server/vehicles.js).
import { RACE, ROUTES, RACE_START, racePrize, fmtRace } from '../public/shared/races.js';

export class Races {
  constructor(room) { this.room = room; this.reset(); this.next = 0; }
  reset() { this.racersAtStart = 0; this.state = 'idle'; this.racers = new Map(); this.route = null; this.startAt = 0; this.until = 0; this.places = 0; }
  carOf(p) { return p.inCar ? this.room.vehicles.cars.find(c => c.id === p.inCar) : null; }
  stateMsg() {
    if (this.state === 'idle') return { type: 'race', ev: 'idle' };
    return { type: 'race', ev: 'state', state: this.state, route: this.route.id, startAt: this.startAt, racers: [...this.racers.keys()] };
  }
  tick(dt) {
    const t = this.room.now();
    if (this.state === 'idle' || this.state === 'lobby') {
      // drivers who roll into the start line join (and open a race if none is waiting)
      for (const p of this.room.players.values()) {
        if (!p.alive || this.racers.has(p.id)) continue;
        const car = this.carOf(p); if (!car || car.pid !== p.id) continue;
        if (Math.hypot(car.x - RACE_START[0], car.z - RACE_START[1]) > RACE.joinRadius) continue;
        if (this.state === 'idle') {
          if (t < (this.coolUntil || 0)) continue;
          this.state = 'lobby'; this.route = ROUTES[this.next++ % ROUTES.length]; this.startAt = t + RACE.lobby;
          this.room.broadcast({ type: 'feed', text: `🏁 ${p.name} opened a street race (${this.route.name})! Drive to the start line to join` });
        }
        this.racers.set(p.id, { cp: 0, done: 0, time: 0, place: 0, outSince: 0 });
        if (this.room.npcs.addSpectators) this.room.npcs.addSpectators(RACE_START[0], RACE_START[1]);   // fans gather at the line
        this.room.broadcast({ type: 'race', ev: 'join', pid: p.id, route: this.route.id, startAt: this.startAt, racers: [...this.racers.keys()] });
      }
      if (this.state === 'lobby') {
        // racers who drive away or get out before the start drop out
        for (const [id] of this.racers) {
          const p = this.room.players.get(id), car = p && this.carOf(p);
          if (!p || !car || !p.alive || Math.hypot(car.x - RACE_START[0], car.z - RACE_START[1]) > RACE.joinRadius * 2.5) this.drop(id, 'left the start line');
        }
        if (!this.racers.size) { this.room.npcs.clearSpectators(); this.reset(); this.room.broadcast({ type: 'race', ev: 'idle' }); return; }
        if (t >= this.startAt) {
          this.state = 'running'; this.until = t + RACE.timeout; this.racersAtStart = this.racers.size;
          this.room.npcs.cheer(RACE_START[0], RACE_START[1], 45, 4.5);
          this.room.broadcast({ type: 'race', ev: 'go', route: this.route.id, racers: [...this.racers.keys()], startAt: this.startAt });
        }
      }
      return;
    }
    if (this.state !== 'running') return;
    const cps = this.route.cps;
    for (const [id, r] of this.racers) {
      if (r.done) continue;
      const p = this.room.players.get(id), car = p && this.carOf(p);
      if (!p || !p.alive) { this.drop(id, p ? 'was knocked out' : 'left'); continue; }
      if (!car || car.pid !== p.id) { if (!r.outSince) r.outSince = t; if (t - r.outSince > RACE.outOfCar) this.drop(id, 'got out of the car'); continue; }
      r.outSince = 0;
      const [cx, cz] = cps[r.cp];
      if (Math.hypot(car.x - cx, car.z - cz) < RACE.cpRadius) {
        r.cp++;
        if (r.cp >= cps.length) this.finish(p, r, t);
        else this.room.sendTo(p, { type: 'race', ev: 'cp', i: r.cp, n: cps.length });
      }
    }
    // standings for everyone in the race (twice a second)
    if (t - (this.lastStand || 0) > 0.5) {
      this.lastStand = t;
      const list = [...this.racers].map(([id, r]) => [id, r.cp, r.place]);
      for (const id of this.racers.keys()) { const p = this.room.players.get(id); if (p) this.room.sendTo(p, { type: 'race', ev: 'stand', list }); }
    }
    const left = [...this.racers.values()].some(r => !r.done);
    if (!left || t > this.until) this.end(t);
  }
  finish(p, r, t) {
    r.done = 1; r.time = t - this.startAt; r.place = ++this.places;
    { const car = this.carOf(p); if (car) this.room.npcs.cheer(car.x, car.z, 45, 5, r.place === 1 ? ['🏆 WINNER!', 'WOOOO!', 'WHAT A DRIVE!', '🔥🔥🔥'] : ['YEAH!', 'Nice!', 'WOO!']); }
    const n = this.racersAtStart || this.racers.size;
    let prize = racePrize(r.place, n, this.route), beat = false;
    if (n <= 1) { beat = r.time <= this.route.par; prize = beat ? RACE.soloPrize : 0; }
    const best = (p.prof.raceBest && p.prof.raceBest[this.route.id]) || 0, pb = !best || r.time < best;
    if (p.prof) {
      if (pb) { p.prof.raceBest = p.prof.raceBest || {}; p.prof.raceBest[this.route.id] = Math.round(r.time * 10) / 10; }
      if (prize) p.cash = (p.cash || 0) + prize;
      const S = this.room.saves;
      if (S) {
        S.stat(p, 'races'); S.addXP(p, RACE.xp, 'race');
        if ((n > 1 && r.place === 1) || beat) { S.stat(p, 'raceWins'); S.addXP(p, RACE.winXp, 'raceWin'); }
        S.event(p, 'race'); S.save(p, true);
      }
    }
    this.room.broadcast({ type: 'race', ev: 'finish', pid: p.id, place: r.place, time: r.time, prize, pb, solo: n <= 1, beat, par: this.route.par, total: p.cash });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    this.room.broadcast({ type: 'feed', text: n > 1 ? `🏁 ${p.name} finished ${['1st', '2nd', '3rd'][r.place - 1] || r.place + 'th'} in ${fmtRace(r.time)}` : `🏁 ${p.name} ran the ${this.route.name} in ${fmtRace(r.time)}${beat ? ' (beat the target!)' : ''}` });
  }
  drop(id, why) {
    if (!this.racers.has(id)) return;
    this.racers.delete(id);
    this.room.broadcast({ type: 'race', ev: 'dnf', pid: id, why });
  }
  end(t) {
    const results = [...this.racers].filter(([, r]) => r.done).sort((a, b) => a[1].place - b[1].place).map(([id, r]) => [id, r.place, Math.round(r.time * 10) / 10]);
    for (const [id, r] of this.racers) if (!r.done) this.room.broadcast({ type: 'race', ev: 'dnf', pid: id, why: 'ran out of time' });
    this.room.broadcast({ type: 'race', ev: 'end', results });
    this.room.npcs.clearSpectators(8); this.reset(); this.coolUntil = t + RACE.cooldown;
  }
  playerGone(p) { this.drop(p.id, 'left'); }
}
