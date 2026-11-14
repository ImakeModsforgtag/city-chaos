// CITY CHAOS - your own cars. Buy them at the 🚗 CAR LOT (gas station), paint them, and call your car to the
// nearest street any time (PC: C, VR: Y menu > CALL MY CAR). Your cars are kept in your save.
// A personal car's "color" number (sent with every car) = 100 + model index * 20 + paint.
export const CAR_MODELS = [
  { id: 'compact', name: 'Pocket Rocket', icon: '🚗', price: 1000, lvl: 1, top: 26, accel: 10, grip: 1.7, about: 'cheap, zippy, easy to park' },
  { id: 'pickup', name: 'Big Rig Pickup', icon: '🛻', price: 2500, lvl: 3, top: 25, accel: 9, grip: 1.6, about: 'tough truck with a cargo bed' },
  { id: 'muscle', name: 'Thunder V8', icon: '🏎', price: 4500, lvl: 5, top: 31, accel: 12, grip: 1.6, about: 'loud and fast in a straight line' },
  { id: 'sports', name: 'Viper GT', icon: '🏁', price: 8000, lvl: 8, top: 34, accel: 13, grip: 1.9, about: 'the fastest car in the city' },
  { id: 'gold', name: 'Gold Rush', icon: '👑', price: 20000, lvl: 12, top: 34, accel: 14, grip: 2.0, about: 'solid gold supercar (paint stays gold)' }
];
export const PAINTS = [
  { name: 'Red', c: 0xe53935 }, { name: 'Blue', c: 0x1e88e5 }, { name: 'Yellow', c: 0xfdd835 }, { name: 'Green', c: 0x43a047 },
  { name: 'Purple', c: 0x8e24aa }, { name: 'White', c: 0xf5f5f5 }, { name: 'Orange', c: 0xfb8c00 }, { name: 'Black', c: 0x212121 },
  { name: 'Pink', c: 0xff4fa3 }, { name: 'Teal', c: 0x00acc1 }
];
export const PAINT_PRICE = 250;
export const CALL_COOLDOWN = 15;    // seconds between calling your car
export const CALL_RANGE = 70;       // your car shows up on a street at most this far away
export const GOLD = 0xd4af37;

export const modelIdx = (id) => CAR_MODELS.findIndex(m => m.id === id);
export const carCode = (model, paint) => 100 + Math.max(0, modelIdx(model)) * 20 + (paint % PAINTS.length);
export function decodeCar(code) {
  if (code < 100) return null;
  const m = CAR_MODELS[Math.floor((code - 100) / 20)];
  return m ? { model: m, paint: (code - 100) % 20 } : null;
}
// how a car drives (traffic / police / van cars use the default)
export function carStats(code) { const d = decodeCar(code); return d ? d.model : { top: 26, accel: 10, grip: 1.7 }; }

// the menu at the CAR LOT kiosk (built per player: what you own decides what's on it)
export function garageItems(g, lvl) {
  const items = [];
  for (const m of CAR_MODELS) {
    if (g.cars.includes(m.id)) items.push({ id: 'use:' + m.id, name: (g.sel === m.id ? '✔ ' : 'Drive ') + m.name, icon: m.icon, kind: 'carsel', price: 0, model: m.id });
    else items.push({ id: 'buy:' + m.id, name: m.name, icon: m.icon, kind: 'carbuy', price: m.price, model: m.id, lvl: m.lvl, locked: lvl < m.lvl });
  }
  if (g.sel && g.sel !== 'gold') items.push({ id: 'paint', name: `Repaint (${PAINTS[(g.paint[g.sel] + 1) % PAINTS.length].name})`, icon: '🎨', kind: 'carpaint', price: PAINT_PRICE });
  if (g.sel) items.push({ id: 'call', name: 'Bring my car here', icon: '🔑', kind: 'carcall', price: 0 });
  return items;
}
export function cleanGarage(x) {
  const g = { cars: [], sel: '', paint: {} };
  if (!x || typeof x !== 'object') return g;
  for (const m of CAR_MODELS) if (Array.isArray(x.cars) && x.cars.includes(m.id)) { g.cars.push(m.id); const pt = Math.floor(Number(x.paint && x.paint[m.id])); g.paint[m.id] = Number.isFinite(pt) ? Math.max(0, Math.min(PAINTS.length - 1, pt)) : 0; }
  g.sel = g.cars.includes(x.sel) ? x.sel : (g.cars[0] || '');
  return g;
}
