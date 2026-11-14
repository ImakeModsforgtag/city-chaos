// CITY CHAOS - levels and XP (shared by the server and the browser).
// You earn XP for playing (takedowns, arrests, robberies, stopping robbers, finishing matches, time played).
// Each level needs a bit more XP than the last. Leveling up pays a little cash and unlocks cosmetics.
export const MAX_LEVEL = 50;

// XP for each action
export const XP = {
  kill: 25, headshot: 10, arrest: 60, rob: 40, crook: 50, crookArrest: 70,
  car: 5, match: 30, win: 70, minute: 4, shop: 2, job: 40, heist: 150, race: 60, raceWin: 60, turf: 40, boss: 150
};
export const XP_REASON = {
  kill: 'Takedown', headshot: 'Headshot', arrest: 'Arrest', rob: 'Store robbed', crook: 'Robber stopped', crookArrest: 'Robber arrested',
  car: 'Car hijacked', match: 'Match played', win: 'Match won', minute: 'Playing', shop: 'Shopping', mission: 'Mission complete', missions: 'All daily missions', job: 'Job done', heist: 'Bank heist', tutorial: 'Tutorial done', race: 'Race finished', raceWin: 'Race won', turf: 'Turf taken', boss: 'Boss taken down', weekly: 'Weekly challenge', weeklies: 'All weekly challenges', gift: '🎁 Gift'
};

// total XP needed to REACH a level (level 1 = 0 XP). Level 2 = 100, 3 = 210, 5 = 500, 10 = 2,100, 20 = about 11,000, 50 = about 82,600
export function xpForLevel(lvl) {
  lvl = Math.max(1, Math.min(MAX_LEVEL, lvl | 0));
  let total = 0;
  for (let l = 1; l < lvl; l++) total += 100 + (l - 1) * 50 * Math.min(1, l / 10) + Math.max(0, l - 10) * 25;
  return Math.round(total);
}
export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}
// progress inside the current level: { lvl, into, need, frac }
export function levelProgress(xp) {
  const lvl = levelFromXp(xp);
  if (lvl >= MAX_LEVEL) return { lvl, into: 0, need: 0, frac: 1 };
  const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
  return { lvl, into: xp - a, need: b - a, frac: (xp - a) / (b - a) };
}
// cash bonus for reaching a level
export const levelCash = (lvl) => 50 + lvl * 25;

// cosmetics that unlock with levels (index into the lists in constants.js). Everything not listed is free.
export const UNLOCKS = {
  hat: { 2: 2, 3: 4, 6: 6, 5: 8, 4: 12 },   // (item index: level) Top Hat 2, Beanie 4, Traffic Cone 6, Cowboy 8, Crown 12
  glasses: { 3: 5, 4: 10 },                  // Visor 5, Monocle 10
  back: { 2: 3, 3: 9, 4: 7 },                // Jetpack 3, Cape 9, Guitar 7
  head: { 3: 14 },                           // Bean head 14
  body: { 3: 16 }                            // Robot body 16
};
export function unlockLevel(key, idx) { return (UNLOCKS[key] && UNLOCKS[key][idx]) || 1; }
export function isUnlocked(key, idx, lvl) { return lvl >= unlockLevel(key, idx); }
// what unlocks AT exactly this level (for the level-up message)
export function unlocksAt(lvl, names) {
  const out = [];
  for (const key of Object.keys(UNLOCKS)) for (const [idx, l] of Object.entries(UNLOCKS[key])) if (l === lvl) out.push(names[key][idx]);
  return out;
}
// replace anything still locked with the free default
export function lockCos(cos, lvl) {
  const c = { ...cos };
  for (const key of Object.keys(UNLOCKS)) if (!isUnlocked(key, c[key] | 0, lvl)) c[key] = 0;
  return c;
}
