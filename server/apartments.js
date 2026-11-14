// CITY CHAOS - apartments (server authority). See public/shared/apartment.js.
import { APT, UNITS, aptAt, trophies } from '../public/shared/apartment.js';
import { levelFromXp } from '../public/shared/levels.js';
import { MAX_HEALTH } from '../public/shared/constants.js';

export class Apartments {
  constructor(room) { this.room = room; this.units = UNITS.map(() => ({ owner: 0, name: '', t: null })); }
  owns(p) { return !!(p.prof && p.prof.apt); }
  unitOf(id) { return this.units.findIndex(u => u.owner === id); }
  inside(i) { return [...this.room.players.values()].filter(q => q.apt === i); }
  msg() { return { type: 'apts', units: this.units.map(u => u.owner ? [u.owner, u.name, u.t] : null) }; }
  send() { this.room.broadcast(this.msg()); }
  use(p, id) {
    if (!p.alive || !p.pose || p.jail || p.inCar || p.ride) return { ok: false, why: 'You can\'t go in right now' };
    if (id === 'buy') {
      if (this.owns(p)) return { ok: false, why: 'You already have an apartment' };
      const lvl = levelFromXp(p.prof.xp || 0);
      if (lvl < APT.lvl) return { ok: false, why: `Apartments unlock at level ${APT.lvl}` };
      if ((p.cash || 0) < APT.price) return { ok: false, why: `An apartment costs $${APT.price} (you have $${p.cash || 0})` };
      p.cash -= APT.price; p.prof.apt = 1; p.saveDirty = true;
      const S = this.room.saves; if (S) { S.event(p, 'shop'); S.event(p, 'spend', APT.price); S.save(p, true); }
      this.room.broadcast({ type: 'feed', text: `🏠 ${p.name} bought an apartment!` });
      this.room.sendTo(p, { type: 'aptOwn', own: 1 });
      this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
      return { ok: true, bought: 1 };
    }
    if ((p.wanted || 0) > 0) return { ok: false, why: 'Lose the cops first! (no going home with wanted stars)' };
    if (id === 'home') {
      if (!this.owns(p)) return { ok: false, why: 'Buy an apartment first' };
      let i = this.unitOf(p.id);
      if (i < 0) { i = this.units.findIndex(u => !u.owner); if (i < 0) return { ok: false, why: 'The building is full right now, try again in a minute' }; }
      this.claim(i, p);
      return this.enter(p, i);
    }
    if (id.startsWith('visit:')) {
      const i = this.unitOf(Number(id.slice(6)));
      if (i < 0) return { ok: false, why: 'They\'re not home' };
      return this.enter(p, i);
    }
    return { ok: false, why: '?' };
  }
  claim(i, p) { const u = this.units[i]; u.owner = p.id; u.name = p.name; u.t = trophies(p.prof, levelFromXp(p.prof.xp || 0)); this.send(); }
  enter(p, i) {
    const u = UNITS[i];
    p.apt = i; p.aptAt = this.room.now();
    this.room.teleport(p, [u.spawn[0] + (Math.random() - 0.5), u.spawn[1], u.spawn[2]], u.spawn[3]);
    this.room.sendTo(p, { type: 'aptIn', i, owner: this.units[i].owner });
    return { ok: true, i };
  }
  // E / grip at the door inside
  leave(p) {
    if (p.apt === undefined || p.apt < 0) return;
    p.apt = -1;
    const o = this.room.npcs.map.aptDoor.out;
    this.room.teleport(p, [o[0] + (Math.random() - 0.5) * 1.5, o[1], o[2]], o[3]);
    this.room.sendTo(p, { type: 'aptOut' });
    this.tidy();
  }
  rest(p) {
    if (p.apt === undefined || p.apt < 0 || !p.alive) return;
    const u = UNITS[p.apt], h = p.pose && p.pose.h, t = this.room.now();
    if (!h || Math.hypot(h[0] - u.bed[0], h[2] - u.bed[2]) > APT.range) return;
    if (t - (p.restAt || -99) < APT.restEvery) return this.room.sendTo(p, { type: 'pMsg', text: 'You just had a nap!' });
    p.restAt = t; p.hp = MAX_HEALTH;
    this.room.broadcast({ type: 'hp', id: p.id, hp: p.hp });
    this.room.sendTo(p, { type: 'pMsg', text: '😴 Ahh, a quick nap. Full health!' });
  }
  // nobody home: the unit is free again (and guests get walked out when the owner leaves)
  tidy() {
    let changed = false;
    this.units.forEach((u, i) => {
      if (!u.owner) return;
      const owner = this.room.players.get(u.owner), ownerIn = owner && owner.apt === i && owner.connected;
      const people = this.inside(i);
      if (!ownerIn) { for (const q of people) if (q.connected) this.leave(q); else q.apt = -1; u.owner = 0; u.name = ''; u.t = null; changed = true; }
    });
    if (changed) this.send();
  }
  tick() {
    // anyone who ended up outside their unit (respawn, teleport, match reset) is no longer "home"
    for (const p of this.room.players.values()) {
      if (p.apt === undefined || p.apt < 0) continue;
      const h = p.pose && p.pose.h;
      if (!p.alive || !p.connected || !h || aptAt(h[0], h[1] - 1.5, h[2]) !== p.apt) { if (this.room.now() - (p.aptAt || 0) > 2) p.apt = -1; }
    }
    this.tidy();
  }
  safe(p) { return p && p.apt !== undefined && p.apt >= 0; }
}
