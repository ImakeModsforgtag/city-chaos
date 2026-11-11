// CITY CHAOS - shared city helpers (client + server use the same numbers).

// which neighborhood each 44 m block belongs to: BLOCK_DISTRICT[row][col] (row = north to south, col = west to east)
export const BLOCK_DISTRICT = [
  ['shopping', 'shopping', 'services', 'downtown'],
  ['park', 'industrial', 'downtown', 'downtown'],
  ['park', 'residential', 'industrial', 'services'],
  ['industrial', 'residential', 'residential', 'industrial']
];

// the 9 signalized intersections (road center lines)
export const SIGNALS = [];
for (const ix of [-56, 0, 56]) for (const iz of [-56, 0, 56]) SIGNALS.push([ix, iz]);

// Traffic light cycle (24 s). axis 'x' = traffic driving east/west, 'z' = north/south.
// Both the server (NPC cars stop on red) and the client (light colors) use this, with the server clock.
export const SIGNAL_PERIOD = 24;
export function signalPhase(ix, iz, t) { return (((t + (ix + iz) * 0.035) % SIGNAL_PERIOD) + SIGNAL_PERIOD) % SIGNAL_PERIOD; }
export function signalState(ix, iz, axis, t) {
  const ph = signalPhase(ix, iz, t);
  if (axis === 'x') return ph < 9 ? 'g' : ph < 11.5 ? 'y' : 'r';
  return ph >= 12 && ph < 21 ? 'g' : ph >= 21 && ph < 23.5 ? 'y' : 'r';
}

// small seeded random (same everywhere)
export function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
