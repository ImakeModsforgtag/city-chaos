// CITY CHAOS - the 🚗 CAR LOT and your own cars (server authority).
// Buying, picking which car you drive, repainting, and calling your car to the nearest street.
// Your cars live in your save (p.prof.garage). Only you can drive your car; friends can ride along.
import { CAR_MODELS, PAINTS, PAINT_PRICE, CALL_COOLDOWN, CALL_RANGE, carCode, garageItems } from '../public/shared/garage.js';
import { levelFromXp } from '../public/shared/levels.js';

export class Garage {
  constructor(room) { this.room = room; }
  g(p) { return p.prof.garage || (p.prof.garage = { cars: [], sel: '', paint: {} }); }
  msg(p) { const g = this.g(p); return { type: 'garage', cars: g.cars, sel: g.sel, paint: g.paint, out: this.carOf(p) ? this.carOf(p).id : 0 }; }
  send(p) { if (p.prof) this.room.sendTo(p, this.msg(p)); }
  carOf(p) { return this.room.vehicles.cars.find(c => c.owner === p.id && !c.remove); }

  // a CAR LOT menu item: { ok, why, ... }
  use(p, id) {
    const g = this.g(p), lvl = levelFromXp(p.prof.xp || 0);
    const it = garageItems(g, lvl).find(i => i.id === id);
    if (!it) return { ok: false, why: 'That isn\'t on the lot' };
    if (it.kind === 'carbuy') {
      const m = CAR_MODELS.find(x => x.id === it.model);
      if (lvl < m.lvl) return { ok: false, why: `${m.name} unlocks at level ${m.lvl}` };
      if ((p.cash || 0) < m.price) return { ok: false, why: `You need $${m.price} (you have $${p.cash || 0}). Keep some in the bank and save up!` };
      p.cash -= m.price;
      g.cars.push(m.id); g.paint[m.id] = Math.floor(Math.random() * PAINTS.length); g.sel = m.id;
      this.after(p, 'spend', m.price);
      this.room.broadcast({ type: 'feed', text: `🚗 ${p.name} bought a ${m.name}!` });
      return { ok: true, bought: m.id };
    }
    if (it.kind === 'carsel') { g.sel = it.model; p.saveDirty = true; this.repaintOut(p); return { ok: true }; }
    if (it.kind === 'carpaint') {
      if ((p.cash || 0) < PAINT_PRICE) return { ok: false, why: `A paint job costs $${PAINT_PRICE}` };
      p.cash -= PAINT_PRICE; g.paint[g.sel] = (g.paint[g.sel] + 1) % PAINTS.length;
      this.after(p, 'spend', PAINT_PRICE); this.repaintOut(p);
      return { ok: true, paint: g.paint[g.sel] };
    }
    if (it.kind === 'carcall') return this.call(p);
    return { ok: false, why: '?' };
  }
  after(p, ev, n) {
    p.saveDirty = true;
    if (this.room.saves) { this.room.saves.event(p, 'shop'); this.room.saves.event(p, ev, n); this.room.saves.save(p, true); }
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
  }
  // your car that's out already changes color / model right away
  repaintOut(p) {
    const car = this.carOf(p), g = this.g(p); if (!car) return;
    car.color = carCode(g.sel, g.paint[g.sel] || 0);
    this.room.broadcast({ type: 'carColor', id: car.id, color: car.color });
  }

  // C (PC) / CALL MY CAR (VR): your car shows up on the nearest street
  call(p) {
    const g = this.g(p), t = this.room.now();
    if (!g.sel) return { ok: false, why: 'You don\'t own a car yet. Buy one at the 🚗 CAR LOT (gas station)' };
    if (!p.alive || !p.pose) return { ok: false, why: 'You can\'t call your car right now' };
    if (p.jail) return { ok: false, why: 'No cars in prison!' };
    if (p.inCar || p.ride) return { ok: false, why: 'Get out of this car first' };
    const wait = CALL_COOLDOWN - (t - (p.carCallAt || -99));
    if (wait > 0) return { ok: false, why: `Your car is on its way... call again in ${Math.ceil(wait)}s` };
    const spot = this.room.vehicles.parkingSpot(p.pose.h[0], p.pose.h[2], CALL_RANGE);
    if (!spot) return { ok: false, why: 'Walk to a street first' };
    const old = this.carOf(p);
    if (old && old.driver !== 2 /* NONE */ && old.pid !== p.id) return { ok: false, why: 'Someone is in your car' };
    if (old) old.remove = true;
    p.carCallAt = t;
    const car = this.room.vehicles.spawnPersonal(p, carCode(g.sel, g.paint[g.sel] || 0), spot);
    this.send(p);
    return { ok: true, id: car.id, at: [spot[0], spot[2]] };
  }
  // you left: your car goes away a bit later (unless someone is using it)
  playerGone(p) { const c = this.carOf(p); if (c) { c.ownerGoneAt = this.room.now(); } }
}
