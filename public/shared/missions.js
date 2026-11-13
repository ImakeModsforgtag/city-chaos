// CITY CHAOS - daily missions (shared by the server and the browser).
// Every day (midnight Pacific time) everyone gets the same 3 missions, picked from the pool below.
// Finish one and you get its cash + XP right away; finish all 3 for a bonus. Progress is saved with your profile.
export const MISSION_TZ = 'America/Los_Angeles';
export const MISSIONS_PER_DAY = 3;
export const ALL_DONE_BONUS = { cash: 300, xp: 150 };

// ev = the game event that counts. n = [min, max] goal. cash / xp = reward per 1 of the goal (rounded).
export const MISSION_POOL = [
  { id: 'kills', ev: 'kills', n: [3, 8], text: 'Take down {n} player{s}', cash: 40, xp: 25 },
  { id: 'headshots', ev: 'headshots', n: [2, 5], text: 'Land {n} headshot takedown{s}', cash: 60, xp: 35 },
  { id: 'crooks', ev: 'crooks', n: [1, 3], text: 'Stop {n} NPC robber{s} (shoot or arrest)', cash: 120, xp: 60 },
  { id: 'cars', ev: 'cars', n: [2, 5], text: 'Hijack {n} car{s}', cash: 40, xp: 20 },
  { id: 'shop', ev: 'shop', n: [2, 5], text: 'Buy {n} thing{s} at the stores', cash: 30, xp: 15 },
  { id: 'food', ev: 'food', n: [2, 4], text: 'Buy {n} snack{s} or meal{s} at food stores', cash: 30, xp: 15 },
  { id: 'spend', ev: 'spend', n: [200, 600], step: 50, text: 'Spend ${n} at the stores', cash: 0.4, xp: 0.25 },
  { id: 'earn', ev: 'earn', n: [400, 1200], step: 100, text: 'Earn ${n} cash', cash: 0.25, xp: 0.15 },
  { id: 'minutes', ev: 'minutes', n: [10, 20], step: 5, text: 'Play for {n} minutes', cash: 8, xp: 5 },
  { id: 'matches', ev: 'matches', n: [1, 3], text: 'Finish {n} match{es}', cash: 80, xp: 50 },
  { id: 'win', ev: 'wins', n: [1, 1], text: 'Win a match', cash: 250, xp: 150 },
  { id: 'tower', ev: 'tower', n: [1, 1], text: 'Stand on the very top of the Chaos Tower', cash: 200, xp: 120 },
  { id: 'lotto', ev: 'lotto', n: [2, 4], text: 'Try your luck {n} time{s} (scratch tickets or arcade)', cash: 30, xp: 15 },
  { id: 'boost', ev: 'boost', n: [1, 3], text: 'Buy {n} speed or jump boost{s}', cash: 40, xp: 20 },
  { id: 'armor', ev: 'armor', n: [1, 1], text: 'Buy body armor', cash: 120, xp: 60 },
  { id: 'jobs', ev: 'jobs', n: [1, 3], text: 'Finish {n} job{s} (delivery or taxi)', cash: 100, xp: 60 },
  { id: 'deposit', ev: 'deposit', n: [200, 800], step: 100, text: 'Put ${n} in the CITY BANK', cash: 0.2, xp: 0.1 }
];
// the top of the Chaos Tower (roof of the highest tier, x/z box + height)
export const TOWER_TOP = { x0: 66, x1: 78, z0: -102, z1: -88, y: 54 };

// 'YYYY-MM-DD' for Pacific time
export function dayKey(ms = Date.now()) {
  try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: MISSION_TZ }); }
  catch { return new Date(ms - 8 * 3600e3).toISOString().slice(0, 10); }
}
// seconds until the next reset (approximate across DST, good enough for a countdown)
export function secondsToReset(ms = Date.now()) {
  const now = dayKey(ms);
  let lo = ms, hi = ms + 26 * 3600e3;
  while (hi - lo > 1000) { const mid = (lo + hi) / 2; if (dayKey(mid) === now) lo = mid; else hi = mid; }
  return Math.ceil((hi - ms) / 1000);
}

function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;   // mulberry32
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// the 3 missions for a day: { id, ev, goal, text, cash, xp }
export function missionsFor(day) {
  const r = rng('cc-missions-' + day), pool = MISSION_POOL.slice(), out = [];
  while (out.length < MISSIONS_PER_DAY && pool.length) {
    const m = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (m.id === 'earn' && out.some(o => o.id === 'spend')) continue;   // not both money ones
    const step = m.step || 1;
    const goal = Math.round((m.n[0] + Math.floor(r() * ((m.n[1] - m.n[0]) / step + 1)) * step) / step) * step;
    out.push({ id: m.id, ev: m.ev, goal, text: m.text.replace('{n}', goal).replace(/\{s\}/g, goal === 1 ? '' : 's').replace(/\{es\}/g, goal === 1 ? '' : 'es'), cash: Math.round(m.cash * goal / 10) * 10 || 10, xp: Math.max(10, Math.round(m.xp * goal / 5) * 5) });
  }
  return out;
}
export function fmtReset(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h}h ${m}m` : `${m}m`; }
