// CITY CHAOS - the secret Golden Sniper (server authority).
// * A cop who has made 5 arrests can buy it at the GUN SHOP counter. Only ONE exists per game.
// * Nothing about it is announced: unlock/buy messages go only to that player, and kills with it
//   show up for everyone else as a normal sniper kill.
// * Shots lock onto the target they were aimed close to (checked here: angle, range, line of sight)
//   and land as a headshot when the bullet arrives (the shooter watches it fly with the bullet cam).
import { WEAPONS, GOLDEN, goldenFlight } from '../public/shared/weapons.js';
import { raySphere, rayCapsule } from '../public/shared/collision.js';
import { HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS } from '../public/shared/constants.js';
import { rayNpc, NPC_TYPE } from './npcs.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const BUY_RANGE = 2.8;   // meters from the spot in front of the GUN SHOP counter

export class GoldenSniper {
  constructor(room, map) {
    this.room = room;
    this.owner = null;          // player id holding the one Golden Sniper
    this.pending = [];          // bullets in flight
    const shop = map.shops.find(s => s.name === 'GUN SHOP');
    // the customer side of the counter: 3.4 m in front of the shopkeeper (yaw 0 = facing -Z)
    this.counter = shop ? [shop.keeper[0] - Math.sin(shop.yaw) * 3.4, shop.keeper[1], shop.keeper[2] - Math.cos(shop.yaw) * 3.4].map(v => Math.round(v * 100) / 100) : null;
  }
  now() { return this.room.now(); }
  unlocked(p) { return (p.arrests || 0) >= GOLDEN.arrests; }
  info(p, extra = {}) {
    return { type: 'goldInfo', unlocked: this.unlocked(p) ? 1 : 0, avail: this.owner ? 0 : 1, own: this.owner === p.id ? 1 : 0, price: GOLDEN.price, at: this.counter, ...extra };
  }
  // tell only the players who unlocked it (quietly) whether it's still for sale
  notifyUnlocked() { for (const q of this.room.players.values()) if (this.unlocked(q)) this.room.sendTo(q, this.info(q)); }

  // a cop player arrested someone
  onArrest(cop) {
    cop.arrests = (cop.arrests || 0) + 1;
    if (cop.arrests === GOLDEN.arrests) this.room.sendTo(cop, this.info(cop, { first: 1 }));
  }

  onBuy(p) {
    const fail = (why) => this.room.sendTo(p, { type: 'goldBuy', ok: 0, why });
    if (!this.counter || !p.alive || !p.pose || p.jail || p.holding) return fail('You can\'t do that right now');
    if (Math.hypot(p.pose.h[0] - this.counter[0], p.pose.h[2] - this.counter[2]) > BUY_RANGE || Math.abs(p.pose.h[1] - this.counter[1]) > 3) return fail('Get closer to the counter');
    if (this.owner === p.id) return fail('You already own it');
    if (p.role !== 'cop' || !this.unlocked(p)) return fail('Not for sale');
    if (this.owner) return fail('Sold out. Somebody already has it');
    if ((p.cash || 0) < GOLDEN.price) return fail(`You need $${GOLDEN.price}`);
    p.cash -= GOLDEN.price;
    this.owner = p.id;
    this.room.giveWeapon(p, 'golden', true);
    this.room.sendInventory(p);
    this.room.sendTo(p, { type: 'goldBuy', ok: 1, cash: p.cash });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    this.notifyUnlocked();
  }

  // mod menu "Give gun: Golden Sniper": still only one per game, so the mod user becomes the owner.
  // If somebody else had it, it quietly leaves their inventory (no message, no kill feed, nobody is told).
  modGive(p) {
    if (!p.alive || p.jail) return;
    const prev = this.owner !== null && this.owner !== p.id ? this.room.players.get(this.owner) : null;
    if (prev) {
      const i = prev.slots.findIndex(s => s.w === 'golden');
      if (i >= 0) {
        prev.slots.splice(i, 1);
        if (!prev.slots.length) prev.slots.push({ w: 'pistol', mag: 12, reserve: 48 });
        prev.cur = Math.min(prev.cur, prev.slots.length - 1);
        this.room.sendInventory(prev);
      }
    }
    this.owner = p.id;
    this.room.giveWeapon(p, 'golden', true);
    this.room.sendInventory(p);
    this.room.sendTo(p, this.info(p));
    this.notifyUnlocked();
  }

  // the owner keeps it for the whole game: it comes back every time they respawn
  respawned(p) { if (this.owner === p.id && !p.jail) this.room.giveWeapon(p, 'golden', false); }
  playerGone(id) {
    this.pending = this.pending.filter(b => b.by !== id);
    if (this.owner === id) { this.owner = null; this.notifyUnlocked(); }
  }

  // ---------------------------------------------------------------- shooting
  shoot(p, s, o, d, m, rewind) {
    const room = this.room, def = WEAPONS.golden;
    const teams = room.teamsMode();
    let hit = null; // { kind:'p'|'n', q|n, end:[x,y,z], dist, head, dmg }
    // 1) locked target: must be near where the gun points, in range and in plain sight
    const L = Array.isArray(m.lock) && m.lock.length === 2 ? m.lock : null;
    if (L) {
      let h = null, q = null, n = null;
      if (L[0] === 'p') {
        q = room.players.get(Math.floor(Number(L[1])));
        if (q && q !== p && q.alive && q.connected && !(teams && q.team === p.team)) h = room.headAt(q, rewind);
      } else if (L[0] === 'n') {
        const id = Math.floor(Number(L[1]));
        const tg = room.npcs.targets(rewind).find(t => t.npc.id === id);
        if (tg && !(p.role === 'cop' && tg.npc.type === NPC_TYPE.COP)) { n = tg.npc; h = { x: tg.x, y: tg.y, z: tg.z }; }
      }
      if (h) {
        const dx = h.x - o[0], dy = h.y - o[1], dz = h.z - o[2], dist = Math.hypot(dx, dy, dz);
        const cos = (dx * d[0] + dy * d[1] + dz * d[2]) / Math.max(dist, 1e-6);
        const wall = room.world.raycast(o[0], o[1], o[2], dx / dist, dy / dist, dz / dist, dist);
        if (dist <= def.range && cos >= Math.cos(GOLDEN.lockDegServer * Math.PI / 180) && wall >= dist - 0.35) {
          hit = { kind: q ? 'p' : 'n', q, n, end: [h.x, h.y, h.z], dist, head: true, dmg: Math.round(def.damage * def.headMult) };
        }
      }
    }
    // 2) no lock: a normal straight shot (wall, player or NPC, whichever is first)
    if (!hit) {
      const wd = room.world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], def.range);
      let best = Math.min(wd, def.range); hit = { kind: 'w', dist: best, head: false };
      for (const q of room.players.values()) {
        if (q === p || !q.alive || !q.connected || (teams && q.team === p.team)) continue;
        const hp = room.headAt(q, rewind); if (!hp) continue;
        const th = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], hp.x, hp.y, hp.z, HEAD_RADIUS + 0.03);
        const tb = rayCapsule(o[0], o[1], o[2], d[0], d[1], d[2], hp.x, hp.y - BODY_BOTTOM, hp.y - BODY_TOP, hp.z, BODY_RADIUS);
        if (th < best) { best = th; hit = { kind: 'p', q, dist: th, head: true }; }
        if (tb < best) { best = tb; hit = { kind: 'p', q, dist: tb, head: false }; }
      }
      for (const tg of room.npcs.targets(rewind)) {
        const h = rayNpc(o, d, tg);
        if (h.t < best) { best = h.t; hit = { kind: 'n', n: tg.npc, dist: h.t, head: h.head }; }
      }
      hit.end = [o[0] + d[0] * hit.dist, o[1] + d[1] * hit.dist, o[2] + d[2] * hit.dist];
      hit.dmg = Math.round(def.damage * (hit.head ? def.headMult : 1));
    }
    const fly = goldenFlight(hit.dist);
    if (hit.kind !== 'w') this.pending.push({ at: this.now() + fly, by: p.id, kind: hit.kind, q: hit.q, n: hit.n, dmg: hit.dmg, head: hit.head, from: o });
    room.broadcast({ type: 'shot', id: p.id, w: 'golden', o: o.map(r3), e: [hit.end.map(r3)], fly: r3(fly) }, p.id);
    room.sendTo(p, { type: 'goldShot', e: hit.end.map(r3), fly: r3(fly), kind: hit.kind, id: hit.q ? hit.q.id : hit.n ? hit.n.id : 0 });
    room.sendInventory(p);
  }

  tick() {
    if (!this.pending.length) return;
    const t = this.now(), keep = [];
    for (const b of this.pending) {
      if (t < b.at) { keep.push(b); continue; }
      const by = this.room.players.get(b.by);
      if (!by) continue;
      if (b.kind === 'p') { if (b.q && b.q.alive && this.room.players.get(b.q.id) === b.q) this.room.damage(b.q, by, b.dmg, 'golden', b.head, b.from); }
      else if (b.n) this.room.npcs.damage(b.n, by, b.dmg, b.head, 'golden');
    }
    this.pending = keep;
  }
}
