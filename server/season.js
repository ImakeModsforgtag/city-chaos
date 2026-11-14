// CITY CHAOS - the holiday event (server). See public/shared/season.js.
import { seasonActive, giftSpots, giftsFor, rollGift, GIFT_RANGE, SANTA_OUTFIT } from '../public/shared/season.js';
import { dayKey } from '../public/shared/missions.js';

export class Season {
  constructor(room) {
    this.room = room;
    this.forced = process.env.SEASON === 'winter' ? true : process.env.SEASON === 'off' ? false : null;
    this.spots = giftSpots(room.npcs.map, room.npcs.world);
  }
  get on() { return this.forced !== null ? this.forced : seasonActive(); }
  gifts() { return giftsFor(dayKey(), this.spots); }
  got(p) {
    const g = p.prof.gifts || (p.prof.gifts = { day: '', got: [] }), d = dayKey();
    if (g.day !== d) { g.day = d; g.got = []; p.saveDirty = true; }
    return g.got;
  }
  msg(p) { return this.on ? { type: 'season', on: 1, gifts: this.gifts().map(g => [g.id, ...g.p]), got: p && p.prof ? this.got(p) : [] } : { type: 'season', on: 0 }; }
  send(p) { this.room.sendTo(p, this.msg(p)); }
  set(on) { this.forced = on; for (const p of this.room.players.values()) if (p.connected) this.send(p); }
  open(p, id) {
    if (!this.on || !p.prof || !p.alive || !p.pose || p.jail) return;
    const g = this.gifts().find(x => x.id === Math.floor(Number(id))); if (!g) return;
    const got = this.got(p);
    if (got.includes(g.id)) return this.room.sendTo(p, { type: 'pMsg', text: '🎁 You already opened that one today' });
    const h = p.pose.h;
    if (Math.hypot(h[0] - g.p[0], h[2] - g.p[2]) > GIFT_RANGE + 0.8 || Math.abs(h[1] - 1.5 - g.p[1]) > 2.5) return;
    got.push(g.id); p.saveDirty = true;
    let prize = rollGift(Math.random());
    if (prize.kind === 'santa' && (p.prof.wardrobe || []).includes(SANTA_OUTFIT)) prize = { kind: 'cash', cash: 500 };   // already have it: big cash instead
    if (prize.kind === 'cash') { p.cash = (p.cash || 0) + prize.cash; }
    if (prize.kind === 'xp' && this.room.saves) this.room.saves.addXP(p, prize.xp, 'gift');
    if (prize.kind === 'santa') { (p.prof.wardrobe ||= []).push(SANTA_OUTFIT); p.prof.wardrobe.sort((a, b) => a - b); this.room.sendTo(p, { type: 'wardrobe', owned: p.prof.wardrobe }); this.room.broadcast({ type: 'feed', text: `🎅 ${p.name} found the SANTA SUIT in a gift!` }); }
    if (this.room.saves) { this.room.saves.event(p, 'gift'); this.room.saves.save(p, true); }
    this.room.sendTo(p, { type: 'gift', id: g.id, prize, cash: p.cash, left: this.gifts().length - got.length });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
  }
}
