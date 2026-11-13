// CITY CHAOS - saved player progress (shared by server and client).
// The server keeps the real numbers. Every few seconds it sends your client a signed save
// ("save token") which the browser keeps; when you join a game the token is sent back and the server
// checks the signature, so nobody can edit their cash. Works with no database and survives server restarts
// (set PROFILE_SECRET on the server so old saves stay valid after a redeploy).
export const PROFILE_VERSION = 1;
export const START_CASH = 200;           // new players start with enough to buy something
export const SAVE_EVERY = 5;             // seconds between saves while something changed
export const STAT_KEYS = ['kills', 'deaths', 'headshots', 'arrests', 'robs', 'crooks', 'earned', 'spent', 'playSec', 'matches', 'wins', 'cars', 'jobs', 'heists', 'interest'];
export const STAT_NAMES = {
  kills: 'Takedowns', deaths: 'Times knocked out', headshots: 'Headshots', arrests: 'Players arrested', robs: 'Stores robbed',
  crooks: 'Robbers stopped', jobs: 'Jobs done', heists: 'Bank heists', interest: 'Interest earned', earned: 'Cash earned', spent: 'Cash spent', playSec: 'Time played', matches: 'Matches played', wins: 'Matches won', cars: 'Cars hijacked'
};

export function newProfile() {
  const stats = {}; for (const k of STAT_KEYS) stats[k] = 0;
  return { v: PROFILE_VERSION, cash: START_CASH, bank: 0, bankAt: Date.now(), xp: 0, stats, daily: { day: '', prog: [0, 0, 0], done: [0, 0, 0], bonus: 0 }, created: Date.now(), updated: Date.now() };
}

// fill in anything missing / drop anything weird (older saves, hand-made objects)
export function cleanProfile(p) {
  const out = newProfile();
  if (!p || typeof p !== 'object') return out;
  const num = (v, max) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0; };
  out.cash = num(p.cash, 1e9);
  out.xp = num(p.xp, 1e9);
  out.bank = num(p.bank, 1e10);
  out.bankAt = num(p.bankAt, 1e15) || Date.now();
  out.tut = p.tut ? 1 : 0;   // finished / skipped the tutorial
  const d = p.daily && typeof p.daily === 'object' ? p.daily : {};
  out.daily = { day: typeof d.day === 'string' && /^\d{4}-\d\d-\d\d$/.test(d.day) ? d.day : '', prog: [0, 1, 2].map(i => num(d.prog && d.prog[i], 1e7)),
                done: [0, 1, 2].map(i => (d.done && d.done[i]) ? 1 : 0), bonus: d.bonus ? 1 : 0 };
  for (const k of STAT_KEYS) out.stats[k] = num(p.stats && p.stats[k], 1e12);
  out.created = num(p.created, 1e15) || Date.now();
  out.updated = num(p.updated, 1e15) || Date.now();
  return out;
}

// read a save token's contents without checking it (client: show your profile in the menu)
export function peekToken(token) {
  try {
    const body = String(token).split('.')[0];
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(body.replace(/-/g, '+').replace(/_/g, '/')))) : Buffer.from(body, 'base64url').toString('utf8');
    return cleanProfile(JSON.parse(json));
  } catch { return null; }
}

export function fmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
