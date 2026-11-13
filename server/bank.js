// CITY CHAOS - CITY BANK (server): savings accounts at the teller + the vault heist.
//
// Savings: deposit / withdraw at the teller (store menu). Savings are saved with your profile, are safe when
// you get knocked out or arrested, and earn 2% a day (capped).
// Heist: a civilian holds E / grip at the vault door to drill it (15 s; the alarm = 1 star, cracking it = 1 more).
// The door swings open and 3 cash stacks can be grabbed (+1 star). Get 120 m away from the bank with a stack
// to keep it. Knocked out or arrested on the way = the cash is gone. Then the vault closes and the bank is on
// lockdown for 8 minutes.
import { BANK, bankInterest } from '../public/shared/economy.js';

const r2 = (v) => Math.round(v * 100) / 100;
const HEAD_H = 1.55;

export class CityBank {
  constructor(room, map) {
    this.room = room; this.map = map; this.B = map.bank;
    this.door = room.world.boxes.find(b => b.vaultDoor);
    this.reset();
  }
  reset() {
    this.state = 'closed';          // closed | drilling | open | lockdown
    this.progress = 0; this.lastDrill = -9; this.driller = null;
    this.openUntil = 0; this.lockUntil = 0;
    this.loot = [0, 0, 0];
    if (this.door) this.door.off = false;
  }
  stateMsg(extra = {}) {
    const t = this.room.now();
    return { type: 'bank', state: this.state, p: r2(this.progress / BANK.heist.drillTime), loot: this.loot.map(v => v > 0 ? 1 : 0),
             lock: this.state === 'lockdown' ? Math.ceil(this.lockUntil - t) : 0, open: this.state === 'open' ? Math.ceil(this.openUntil - t) : 0, ...extra };
  }
  send(extra) { this.room.broadcast(this.stateMsg(extra)); }

  // ---------------------------------------------------------------- savings (called from the store code at the teller)
  accrue(p) {
    if (!p.prof) return 0;
    const now = Date.now(), { gain } = bankInterest(p.prof.bank, now - p.prof.bankAt);
    if (p.prof.bank <= 0) { p.prof.bankAt = now; return 0; }
    if (gain < 1) return 0;   // keep counting until a whole dollar is owed
    p.prof.bank += gain; p.prof.bankAt = now; p.saveDirty = true;
    this.room.saves.stat(p, 'interest', gain);
    return gain;
  }
  account(p, it) {
    const prof = p.prof; if (!prof) return { ok: 0, why: 'No account' };
    this.accrue(p);
    let amt;
    if (it.kind === 'deposit') {
      amt = it.amount ? it.amount : Math.floor(p.cash || 0);
      if (amt <= 0) return { ok: 0, why: 'You have no cash to deposit' };
      if ((p.cash || 0) < amt) return { ok: 0, why: `You only have $${p.cash || 0} on you` };
      p.cash -= amt; p.lastCash = p.cash;   // moving money into savings isn't "spending"
      if (prof.bank <= 0) prof.bankAt = Date.now();
      prof.bank += amt;
      this.room.saves.event(p, 'deposit', amt);
    } else {
      amt = it.amount ? it.amount : prof.bank;
      if (amt <= 0) return { ok: 0, why: 'Your savings are empty' };
      if (prof.bank < amt) return { ok: 0, why: `You only have $${prof.bank} saved` };
      prof.bank -= amt; p.cash = (p.cash || 0) + amt; p.lastCash = p.cash;   // not "earned" either
    }
    p.saveDirty = true;
    return { ok: 1, amount: amt, bank: prof.bank, cash: p.cash };
  }

  // ---------------------------------------------------------------- the heist
  near(p, pt, r) { const h = p.pose && p.pose.h; return h && Math.hypot(h[0] - pt[0], h[2] - pt[2]) < r && Math.abs(h[1] - (pt[1] + HEAD_H)) < 1.6; }
  canHeist(p) { return p.alive && p.pose && !p.jail && !p.inCar && !p.holding && p.role !== 'cop'; }

  onDrill(p) {
    const t = this.room.now(), H = BANK.heist;
    if (!this.canHeist(p)) { if (p.role === 'cop') this.room.sendTo(p, this.stateMsg({ you: 'cop' })); return; }
    if (!this.near(p, this.B.drill, 2.2)) return;
    if (this.state === 'lockdown') return this.room.sendTo(p, this.stateMsg());
    if (this.state === 'open') return;
    if (this.state === 'closed') {
      this.state = 'drilling'; this.progress = 0;
      this.room.npcs.addWanted(p, H.wantedDrill, 'cracking the bank vault');
      this.room.broadcast({ type: 'bankAlarm', by: p.id, x: r2(this.B.center[0]), z: r2(this.B.center[2]) });
      for (const q of this.room.players.values()) if (q.role === 'cop') this.room.sendTo(q, { type: 'robAlert', shop: 'the CITY BANK vault', by: p.id, x: r2(this.B.center[0]), z: r2(this.B.center[2]), bank: 1 });
      this.room.npcs.noise(this.B.drill[0], this.B.drill[2], 30);
      this.send({ ev: 'alarm', by: p.id });
    }
    this.progress += Math.min(0.4, Math.max(0, t - this.lastDrill));
    this.lastDrill = t; this.driller = p.id;
    if (this.progress >= H.drillTime) {
      this.state = 'open'; this.openUntil = t + H.openTime; this.door.off = true;
      this.room.npcs.addWanted(p, H.wantedOpen, 'cracking the bank vault');
      this.loot = [0, 1, 2].map(() => H.loot[0] + Math.floor(Math.random() * (H.loot[1] - H.loot[0] + 1) / 10) * 10);
      return this.send({ ev: 'open', by: p.id });
    }
    this.room.sendTo(p, this.stateMsg());
  }
  onGrab(p, i) {
    i = i | 0;
    if (this.state !== 'open' || !this.canHeist(p) || p.heistLoot || !(this.loot[i] > 0)) return;
    if (!this.near(p, this.B.loot[i], 2.0)) return;
    p.heistLoot = this.loot[i]; this.loot[i] = 0;
    this.room.npcs.addWanted(p, BANK.heist.wantedGrab, 'stealing from the bank vault');
    this.send({ ev: 'grab', i, by: p.id });
    this.room.sendTo(p, { type: 'heist', loot: p.heistLoot, from: [r2(this.B.center[0]), r2(this.B.center[2])], escape: BANK.heist.escape });
  }

  tick(dt) {
    const t = this.room.now(), H = BANK.heist;
    if (this.state === 'drilling' && t - this.lastDrill > H.decay) {
      this.progress = Math.max(0, this.progress - dt * 2);
      if (this.progress <= 0) { this.state = 'closed'; this.send({ ev: 'stop' }); }
    }
    if (this.state === 'open' && t > this.openUntil) {
      // don't lock anybody inside the vault
      const V = this.B.vault;
      const inside = [...this.room.players.values()].some(p => p.alive && p.pose && p.pose.h[0] > V.x0 && p.pose.h[0] < V.x1 && p.pose.h[2] > V.z0 - 0.6 && p.pose.h[2] < V.z1);
      if (!inside) { this.state = 'lockdown'; this.lockUntil = t + H.cooldown; this.door.off = false; this.loot = [0, 0, 0]; this.send({ ev: 'close' }); }
    }
    if (this.state === 'lockdown' && t > this.lockUntil) { this.state = 'closed'; this.progress = 0; this.send({ ev: 'ready' }); }
    // getaways
    for (const p of this.room.players.values()) {
      if (!p.heistLoot) continue;
      if (!p.alive || p.jail || !p.connected) {
        this.room.broadcast({ type: 'heistEnd', id: p.id, ok: 0, cash: p.heistLoot });
        this.room.sendTo(p, { type: 'heist', loot: 0, lost: 1 });
        p.heistLoot = 0; continue;
      }
      const h = p.pose && p.pose.h; if (!h) continue;
      if (Math.hypot(h[0] - this.B.center[0], h[2] - this.B.center[2]) > H.escape) {
        const cash = p.heistLoot; p.heistLoot = 0;
        p.cash = (p.cash || 0) + cash;
        this.room.saves.stat(p, 'heists', 1, 'heist');
        this.room.sendTo(p, { type: 'heist', loot: 0, paid: cash, cash: p.cash });
        this.room.broadcast({ type: 'heistEnd', id: p.id, ok: 1, cash });
        this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
      }
    }
  }
}
