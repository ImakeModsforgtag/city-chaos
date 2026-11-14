// CITY CHAOS - your apartment. Buy one at the 🏠 APARTMENTS door on the PINK PALMS building, then go home any time:
// a private room with a trophy shelf (heists, race wins, boss crews, turf, robbers stopped, your cars), a bed that
// heals you, and friends can visit while you're home. It's a safe zone: no damage inside, no entering while wanted.
// The rooms are sealed boxes built under the city (y -13), one per player who is home.
export const APT = { price: 5000, lvl: 4, units: 6, floorY: -13, w: 10, d: 8, h: 3.2, x0: 24, z0: 30, gap: 13, restEvery: 20, range: 3.2 };
export function aptUnits() {
  const out = [];
  for (let i = 0; i < APT.units; i++) {
    const x0 = APT.x0 + i * APT.gap, z0 = APT.z0, x1 = x0 + APT.w, z1 = z0 + APT.d, y = APT.floorY;
    out.push({ i, x0, z0, x1, z1, y, spawn: [x0 + APT.w / 2, y, z1 - 1.6, 0], door: [x0 + APT.w / 2, y, z1 - 0.4], bed: [x0 + 1.6, y, z0 + 2.2], shelf: [x0 + APT.w / 2, y, z0 + 0.35] });
  }
  return out;
}
export const UNITS = aptUnits();
export function aptAt(x, y, z) {
  if (y > APT.floorY + 6 || y < APT.floorY - 3) return -1;
  for (const u of UNITS) if (x > u.x0 - 0.5 && x < u.x1 + 0.5 && z > u.z0 - 0.5 && z < u.z1 + 0.5) return u.i;
  return -1;
}
// what's on your trophy shelf (built from your save)
export function trophies(prof, lvl) {
  const s = (prof && prof.stats) || {};
  return { lvl, heists: s.heists || 0, raceWins: s.raceWins || 0, races: s.races || 0, bosses: s.bosses || 0, crooks: s.crooks || 0, turfs: s.turfs || 0, weeklies: s.weeklies || 0,
           jobs: s.jobs || 0, kills: s.kills || 0, gang: (prof && prof.gang) || 0, cars: ((prof && prof.garage && prof.garage.cars) || []).slice(0, 5),
           best: (prof && prof.raceBest) || {} };
}
// the menu at the 🏠 APARTMENTS door: units = [[ownerId, name, trophies] | null, ...]
export function aptItems(own, units, me) {
  const list = [];
  if (!own) list.push({ id: 'buy', name: 'Buy an apartment', icon: '🏠', kind: 'aptbuy', price: APT.price, lvl: APT.lvl });
  else list.push({ id: 'home', name: 'Go home', icon: '🛋', kind: 'apthome', price: 0 });
  for (const u of units || []) if (u && u[0] !== me) list.push({ id: 'visit:' + u[0], name: `Visit ${u[1]}'s place`, icon: '🚪', kind: 'aptvisit', price: 0 });
  return list;
}
