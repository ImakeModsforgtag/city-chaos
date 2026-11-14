// CITY CHAOS - 👕 THREADS, the clothing store on the downtown plaza. Outfits are bought with cash (not levels),
// kept in your save, and worn over your body (pick them in CUSTOMIZE or straight from the store).
export const OUTFITS = [
  { name: 'None', icon: '🚫', price: 0 },
  { name: 'Hoodie', icon: '🧥', price: 150 },
  { name: 'Hawaiian Shirt', icon: '🌺', price: 250 },
  { name: 'Track Suit', icon: '🏃', price: 350 },
  { name: 'Tuxedo', icon: '🤵', price: 700 },
  { name: 'Hero Suit', icon: '🦸', price: 1200 },
  { name: 'Gold Drip', icon: '💰', price: 3000 },
  { name: 'Santa Suit', icon: '🎅', price: 0, exclusive: 'holiday gifts' }   // only from 🎁 gifts in the holiday event
];
export const cleanWardrobe = (w) => { const out = []; if (Array.isArray(w)) for (const i of w) { const n = Math.floor(Number(i)); if (n > 0 && n < OUTFITS.length && !out.includes(n)) out.push(n); } return out.sort((a, b) => a - b); };
export const owns = (wardrobe, i) => !i || (wardrobe || []).includes(i);
// the THREADS menu (per player: what you own decides the buttons)
export function wardrobeItems(owned, wearing) {
  const items = [];
  OUTFITS.forEach((o, i) => {
    if (!i || (o.exclusive && !owns(owned, i))) return;   // exclusive outfits aren't for sale
    if (owns(owned, i)) items.push({ id: 'wear:' + i, name: (wearing === i ? '✔ Wearing ' : 'Wear ') + o.name, icon: o.icon, kind: 'wear', price: 0, outfit: i });
    else items.push({ id: 'buy:' + i, name: o.name, icon: o.icon, kind: 'outfit', price: o.price, outfit: i });
  });
  if (wearing) items.push({ id: 'wear:0', name: 'Take the outfit off', icon: '🚫', kind: 'wear', price: 0, outfit: 0 });
  return items;
}
