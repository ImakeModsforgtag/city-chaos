// CITY CHAOS - weapon definitions shared by server (authority) and client (visuals/prediction).
// Times are in seconds, distances in meters.

export const WEAPONS = {
  pistol: {
    name: 'Pistol', damage: 20, fireInterval: 0.22, auto: false, mag: 12, reserve: 48,
    reloadTime: 1.2, spread: 0.008, pellets: 1, range: 120, falloffStart: 25, falloffEnd: 70,
    headMult: 2.0, kick: 0.04, color: 0x4dd0ff, icon: '🔫', rarity: 'common'
  },
  revolver: {
    name: 'Revolver', damage: 45, fireInterval: 0.55, auto: false, mag: 6, reserve: 24,
    reloadTime: 2.0, spread: 0.004, pellets: 1, range: 150, falloffStart: 35, falloffEnd: 90,
    headMult: 2.0, kick: 0.09, color: 0xffb13b, icon: '🤠', rarity: 'common'
  },
  ar: {
    name: 'Assault Rifle', damage: 16, fireInterval: 0.1, auto: true, mag: 30, reserve: 90,
    reloadTime: 1.8, spread: 0.014, pellets: 1, range: 200, falloffStart: 45, falloffEnd: 120,
    headMult: 2.0, kick: 0.035, color: 0x7bff5a, icon: '⚡', rarity: 'uncommon'
  },
  smg: {
    name: 'SMG', damage: 11, fireInterval: 0.065, auto: true, mag: 35, reserve: 105,
    reloadTime: 1.5, spread: 0.03, pellets: 1, range: 90, falloffStart: 15, falloffEnd: 45,
    headMult: 1.6, kick: 0.025, color: 0xff5ad7, icon: '💨', rarity: 'common'
  },
  shotgun: {
    name: 'Shotgun', damage: 12, fireInterval: 0.85, auto: false, mag: 6, reserve: 24,
    reloadTime: 2.2, spread: 0.075, pellets: 8, range: 45, falloffStart: 8, falloffEnd: 30,
    headMult: 1.5, kick: 0.14, color: 0xff6a3b, icon: '💥', rarity: 'uncommon'
  },
  sniper: {
    name: 'Sniper Rifle', damage: 90, fireInterval: 1.4, auto: false, mag: 5, reserve: 15,
    reloadTime: 2.6, spread: 0.0005, pellets: 1, range: 400, falloffStart: 400, falloffEnd: 401,
    headMult: 2.5, kick: 0.2, color: 0xb57bff, icon: '🎯', rarity: 'rare'
  },
  // Secret: only sold at the GUN SHOP to a cop with 5 arrests, one per game. Bolt action, real scope,
  // scope ESP, locks a headshot on whatever it's aimed close to, and the shooter rides the bullet.
  golden: {
    name: 'Golden Sniper', damage: 100, fireInterval: 1.6, auto: false, mag: 5, reserve: 15,
    reloadTime: 2.8, spread: 0, pellets: 1, range: 500, falloffStart: 500, falloffEnd: 501,
    headMult: 3, kick: 0.22, color: 0xffcf3a, icon: '🏆', rarity: 'mythic', shopOnly: true,
    bulletSpeed: 90, scopeFov: [9, 3.5]
  },
  rocket: {
    name: 'Rocket Launcher', damage: 110, fireInterval: 1.2, auto: false, mag: 1, reserve: 3,
    reloadTime: 2.5, spread: 0, pellets: 0, range: 300, projectileSpeed: 32,
    splashRadius: 5.5, splashDamage: 95, selfDamageMult: 0.4, headMult: 1,
    kick: 0.25, color: 0xff3b3b, icon: '🚀', rarity: 'legendary'
  }
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const MAX_SLOTS = 3;           // carried weapons
export const DEFAULT_WEAPON = 'pistol';

// Golden Sniper rules (shared so the client and server agree)
export const GOLDEN = { price: 750, arrests: 5, lockDegServer: 8, minFlight: 0.5, maxFlight: 2.2 };
// how long the golden bullet flies (bullet cam length); damage lands when it arrives
export function goldenFlight(dist) { return Math.min(GOLDEN.maxFlight, Math.max(GOLDEN.minFlight, dist / WEAPONS.golden.bulletSpeed)); }
// what everyone else sees in the kill feed: it's a secret, so it shows up as a normal sniper
export const publicWeapon = (w) => (w === 'golden' ? 'sniper' : w);

export function falloff(w, dist) {
  if (dist <= w.falloffStart) return 1;
  if (dist >= w.falloffEnd) return 0.5;
  return 1 - 0.5 * (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
}
