// CITY CHAOS - the city clock. One full day takes 24 real minutes (1 game hour = 1 real minute), the same in every
// room (it runs off the server's clock). Night is roughly 8 PM to 6 AM: streetlights, lit windows, headlights, stars,
// and more robbers out.
export const DAY_MINUTES = 24;
const OFFSET = 9;   // the hour it is at the start of the Unix clock (just picks where the cycle sits)
export function gameHour(ms) { return (((ms / 60000) * (24 / DAY_MINUTES) + OFFSET) % 24 + 24) % 24; }
// 1 = full day, 0 = full night, smooth through sunrise (5:30-7:30) and sunset (18:00-20:00)
export function daylight(h) {
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return h < 12 ? ss(5.5, 7.5, h) : 1 - ss(18, 20, h);
}
// how orange the light is (sunrise / sunset)
export function dusk(h) { const d = Math.min(Math.abs(h - 6.5), Math.abs(h - 19)); return Math.max(0, 1 - d / 1.2); }
export const isNight = (h) => daylight(h) < 0.35;
export function fmtHour(h) { const H = Math.floor(h), M = Math.floor((h - H) * 60); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`; }

// ---------------------------------------------------------------- weather
// Every 6 game hours (6 real minutes) the weather may change: mostly clear, sometimes rain, now and then a
// thunderstorm. It's worked out from the clock, so every room has the same weather. No rain during the holiday snow.
function hash(n) { let t = (n * 2654435761) >>> 0; t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967296; }
export function weatherAt(ms) {
  const hours = (ms / 60000) * (24 / DAY_MINUTES) + OFFSET, block = Math.floor(hours / 6);
  const r = hash(block + 7);
  return r < 0.18 ? 'storm' : r < 0.42 ? 'rain' : 'clear';
}
