// CITY CHAOS - gang turf (server authority). See public/shared/turf.js.
import { GANGS, TURFS, TURF, COP_GANG } from '../public/shared/turf.js';

export class Turf {
  constructor(room) { this.room = room; this.zones = TURFS.map(z => ({ ...z, owner: 0, prog: 0, by: 0, contested: false })); this.payT = 0; this.dirty = true; }
  stateMsg() { return { type: 'turf', z: this.zones.map(z => [z.owner, Math.round(z.prog), z.by, z.contested ? 1 : 0]) }; }
  setGang(p, g) {
    g = Math.floor(Number(g)) || 0; if (g < 0 || g > 4) return;
    if (p.prof) { p.prof.gang = g; p.saveDirty = true; }
    p.gang = g;
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    this.room.sendTo(p, { type: 'gangSet', g });
  }
  count(g) { return this.zones.filter(z => z.owner === g).length; }
  inZone(p, z) {
    if (!p.alive || !p.pose || p.jail || p.inCar || p.ride) return false;
    const [x, y, zz] = p.pose.h;
    return Math.hypot(x - z.p[0], zz - z.p[1]) < TURF.radius && y < TURF.maxY + 2 && y > -1;   // (not from the apartments under the city)
  }
  tick(dt) {
    const players = [...this.room.players.values()].filter(p => p.connected);
    for (const z of this.zones) {
      const here = new Map();   // side -> players
      for (const p of players) {
        if (!this.inZone(p, z)) continue;
        const side = p.role === 'cop' ? COP_GANG : (p.gang || 0);
        if (!side) continue;
        if (!here.has(side)) here.set(side, []); here.get(side).push(p);
      }
      const sides = [...here.keys()];
      const was = [z.owner, Math.round(z.prog), z.by, z.contested];
      z.contested = sides.length > 1;
      if (sides.length === 1) {
        const side = sides[0], crew = here.get(side);
        const wants = side === COP_GANG ? (z.owner ? COP_GANG : 0) : (z.owner === side ? 0 : side);
        if (wants) {
          if (z.by !== wants) { z.by = wants; z.prog = 0; }
          z.prog = Math.min(100, z.prog + dt * 100 / TURF.capture * Math.min(TURF.maxMul, crew.length));
          if (z.prog >= 100) this.captured(z, side, crew);
        } else if (z.by && z.prog > 0) z.prog = Math.max(0, z.prog - dt * TURF.decay);
      } else if (!sides.length && z.prog > 0) { z.prog = Math.max(0, z.prog - dt * TURF.decay); if (!z.prog) z.by = 0; }
      if (was[0] !== z.owner || was[1] !== Math.round(z.prog) || was[2] !== z.by || was[3] !== z.contested) this.dirty = true;
    }
    // turf income
    this.payT += dt;
    if (this.payT >= TURF.payEvery) {
      this.payT = 0;
      for (const p of players) {
        if (!p.gang || p.role === 'cop') continue;
        const n = this.count(p.gang); if (!n) continue;
        const amt = n * TURF.payPer;
        p.cash = (p.cash || 0) + amt;
        this.room.sendTo(p, { type: 'turfPay', amt, n, total: p.cash });
        this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
      }
    }
    if (this.dirty && this.room.now() - (this.sentAt || 0) > 0.4) { this.dirty = false; this.sentAt = this.room.now(); this.room.broadcast(this.stateMsg()); }
  }
  captured(z, side, crew) {
    const cop = side === COP_GANG, prev = z.owner;
    z.owner = cop ? 0 : side; z.prog = 0; z.by = 0;
    const S = this.room.saves;
    for (const p of crew) {
      p.cash = (p.cash || 0) + (cop ? TURF.clearCash : TURF.capCash);
      if (S) { S.stat(p, 'turfs'); S.addXP(p, TURF.capXp, 'turf'); S.event(p, 'turf'); }
      this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    }
    const g = GANGS[side];
    this.room.broadcast({ type: 'turfTaken', z: z.id, g: cop ? 0 : side, prev, cop, by: crew.map(p => p.id), cash: cop ? TURF.clearCash : TURF.capCash,
      text: cop ? `🚔 Police cleared ${GANGS[prev] ? GANGS[prev].name + ' turf at ' : ''}${z.name}` : `${g.icon} ${g.name} took over ${z.name}!` });
    this.dirty = true;
  }
}
