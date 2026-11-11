// CITY CHAOS - the secret MOD MENU (shared rules: the server and the browser use the same numbers).
// Unlock: VR  = A, B, A, X, Y on the controllers.   PC = type M O D M E N U.
import { WEAPONS } from './weapons.js';

export const MOD_BASES = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'rocket'];
export const MOD_SCOPES = ['none', 'reddot', 'holo', '2x', '4x', '8x', 'sniper'];
export const MOD_SKINS = ['default', 'gold', 'neon', 'chrome', 'rainbow', 'galaxy', 'lava', 'ice'];
export const MOD_RATES = ['semi', 'auto', 'minigun'];
export const MOD_DAMAGE = [5, 10, 25, 50, 75, 100, 150, 250, 500, 999];
export const MOD_SPEEDS = [1, 1.6, 2.2, 3];
export const MOD_JUMPS = [1, 1.8, 3];
export const MOD_GIVE = ['pistol', 'revolver', 'smg', 'ar', 'shotgun', 'sniper', 'rocket'];
export const SCOPE_NAME = { none: 'NO SCOPE', reddot: 'RED DOT', holo: 'HOLO SIGHT', '2x': '2x SCOPE', '4x': '4x SCOPE', '8x': '8x SCOPE', sniper: 'SNIPER 16x' };
// desktop zoom (field of view in degrees) and VR scope-glass zoom for each scope
export const SCOPE_FOV = { reddot: 58, holo: 52, '2x': 36, '4x': 18, '8x': 9.5, sniper: 4.8 };
export const SCOPE_VR_FOV = { '2x': 26, '4x': 13, '8x': 6.5, sniper: 3.2 };
export const MOD_PLACES = [
  { name: 'CHAOS TOWER (ledge, 44 m up)', p: [67, 44.05, -101], yaw: 2.4 },
  { name: 'WATER TOWER CATWALK', p: [-28, 11.85, 81.3], yaw: 0 },
  { name: 'HOSPITAL HELIPAD', p: [42, 20.1, 77], yaw: -1.6 },
  { name: 'MEGA MART ROOF', p: [-29, 8.35, -95], yaw: 0 },
  { name: 'POLICE STATION', p: [27, 0.2, -76], yaw: 0 },
  { name: 'CITY PARK FOUNTAIN', p: [-84, 0.3, -33], yaw: 0 },
  { name: 'GAS & GO', p: [78, 0.2, -14], yaw: 0 },
  { name: 'BASKETBALL COURT', p: [-84, 0.25, 28], yaw: 0 },
  { name: 'CONSTRUCTION SCAFFOLD TOP', p: [95, 15.05, 93], yaw: 0 }
];
export const DEFAULT_CUSTOM = { base: 'ar', dmg: 100, scope: '4x', skin: 'neon', rate: 'auto' };

// never trust what a client sends
export function cleanCustom(c) {
  c = c || {};
  return {
    base: MOD_BASES.includes(c.base) ? c.base : DEFAULT_CUSTOM.base,
    dmg: Math.max(1, Math.min(999, Math.round(Number(c.dmg) || DEFAULT_CUSTOM.dmg))),
    scope: MOD_SCOPES.includes(c.scope) ? c.scope : 'none',
    skin: MOD_SKINS.includes(c.skin) ? c.skin : 'default',
    rate: MOD_RATES.includes(c.rate) ? c.rate : 'auto'
  };
}

// The weapon stats a player really gets, after mods. Same function on server (damage, fire rate) and client (feel).
export function effectiveDef(w, mods) {
  let d = WEAPONS[w];
  if (!d) return d;
  if (w === 'custom') {
    const c = cleanCustom(mods && mods.custom), b = WEAPONS[c.base];
    d = { ...b, name: 'Custom ' + b.name, icon: '🛠', color: WEAPONS.custom.color, damage: c.dmg, mag: WEAPONS.custom.mag, reserve: WEAPONS.custom.reserve,
      auto: c.rate !== 'semi', fireInterval: c.rate === 'minigun' ? 0.05 : c.rate === 'auto' ? Math.min(b.fireInterval, 0.11) : b.fireInterval,
      range: Math.max(b.range || 0, 320), falloffStart: 320, falloffEnd: 321, spread: c.base === 'shotgun' ? b.spread : Math.min(b.spread, 0.012),
      pellets: c.base === 'shotgun' ? b.pellets : 1, headMult: 2, reloadTime: 1.0, explosive: c.base === 'rocket', custom: c, projectileSpeed: undefined };
  }
  if (mods && mods.auto && !d.auto) d = { ...d, auto: true, fireInterval: Math.min(d.fireInterval, 0.12) };
  return d;
}
