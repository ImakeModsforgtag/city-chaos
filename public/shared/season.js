// CITY CHAOS - the holiday event (Dec 1 - Jan 5, Pacific time; or set SEASON=winter on the server to force it on).
// Snow, a giant tree on the plaza, snowmen, and 12 gifts hidden around the city every day. Each player can open
// each gift once a day: cash, XP, or (rarely) the exclusive Santa Suit outfit.
import { dayKey } from './missions.js';
export const GIFTS_PER_DAY = 12, GIFT_RANGE = 2.2;
export const SANTA_OUTFIT = 7;
export function seasonActive(ms = Date.now()) {
  const d = dayKey(ms), md = d.slice(5);
  return md >= '12-01' || md <= '01-05';
}
function rng(seedStr) {
  let h = 2166136261; for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// candidate spots: next to the pickups and spawn points around the city (not the prison), ground found by raycast
export function giftSpots(map, world) {
  const out = [];
  const add = (x, y, z) => {
    if (z > 250) return;
    const d = world.raycast(x, y + 1.5, z, 0, -1, 0, 6);
    if (!Number.isFinite(d)) return;
    const gy = y + 1.5 - d;
    if (world.sphereOverlaps(x, gy + 0.5, z, 0.35)) return;
    if (out.some(o => Math.hypot(o[0] - x, o[2] - z) < 6)) return;
    out.push([Math.round(x * 10) / 10, Math.round((gy + 0.02) * 100) / 100, Math.round(z * 10) / 10]);
  };
  for (const pk of map.pickups) add(pk.p[0] + 1.3, pk.p[1] - 0.6, pk.p[2] + 1.1);
  for (const s of map.spawns) add(s.p[0] + 2.2, s.p[1] + 0.5, s.p[2] - 1.8);
  return out;
}
export function giftsFor(day, spots) {
  const r = rng('cc-gifts-' + day), pool = spots.map((p, i) => i), out = [];
  while (out.length < GIFTS_PER_DAY && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out.map((si, k) => ({ id: k, p: spots[si] }));
}
// what's inside (decided by the server when you open it)
export function rollGift(r) {
  if (r < 0.05) return { kind: 'santa' };
  if (r < 0.35) return { kind: 'xp', xp: 50 + Math.floor(r * 300) };
  return { kind: 'cash', cash: 50 + Math.round(r * 200 / 10) * 10 };
}
