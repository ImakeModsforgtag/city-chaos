// CITY CHAOS - what every store sells. Shared by the server (prices + effects are checked there)
// and the client (shop menu on PC and in VR).
//
// Item kinds:
//   weapon  { w }                       gun (or extra ammo for it if you already carry it)
//   ammo    { }                         refills the reserve ammo of every gun you carry
//   heal    { hp }                      health (100 = full)
//   armor   { ap }                      body armor points (max 100). Armor soaks 70% of each hit.
//   boost   { speed, jump, dur }        temporary speed / jump boost (seconds)
//   lotto   { odds:[[chance,cash],...]} scratch ticket / prize machine (server rolls it)

export const MAX_ARMOR = 100;
export const ARMOR_SOAK = 0.7;          // share of each hit the armor takes instead of your health
export const SHOP_RANGE = 4.6;          // meters from the shopkeeper (the counter is in between)

export const SHOP_ITEMS = {
  'GUN SHOP': [
    { id: 'pistol', name: 'Pistol', icon: '🔫', price: 100, kind: 'weapon', w: 'pistol' },
    { id: 'revolver', name: 'Revolver', icon: '🤠', price: 200, kind: 'weapon', w: 'revolver' },
    { id: 'smg', name: 'SMG', icon: '💨', price: 300, kind: 'weapon', w: 'smg' },
    { id: 'shotgun', name: 'Shotgun', icon: '💥', price: 350, kind: 'weapon', w: 'shotgun' },
    { id: 'ar', name: 'Assault Rifle', icon: '⚡', price: 450, kind: 'weapon', w: 'ar' },
    { id: 'sniper', name: 'Sniper Rifle', icon: '🎯', price: 700, kind: 'weapon', w: 'sniper' },
    { id: 'rocket', name: 'Rocket Launcher', icon: '🚀', price: 1200, kind: 'weapon', w: 'rocket' },
    { id: 'ammo', name: 'Ammo Box', icon: '📦', price: 40, kind: 'ammo' },
    { id: 'vest', name: 'Body Armor', icon: '🦺', price: 150, kind: 'armor', ap: 50 },
    { id: 'heavy', name: 'Heavy Armor', icon: '🛡️', price: 300, kind: 'armor', ap: 100 }
  ],
  'SNAX': [
    { id: 'chips', name: 'Chaos Chips', icon: '🥔', price: 15, kind: 'heal', hp: 20 },
    { id: 'candy', name: 'Candy Bar', icon: '🍫', price: 20, kind: 'heal', hp: 30 },
    { id: 'soda', name: 'Fizz Soda', icon: '🥤', price: 30, kind: 'boost', speed: 1.3, jump: 1, dur: 30 },
    { id: 'jerky', name: 'Mega Jerky', icon: '🥩', price: 45, kind: 'heal', hp: 60 }
  ],
  'DONUTS': [
    { id: 'donut', name: 'Glazed Donut', icon: '🍩', price: 15, kind: 'heal', hp: 30 },
    { id: 'box', name: 'Dozen Donuts', icon: '📦', price: 60, kind: 'heal', hp: 100 },
    { id: 'coffee', name: 'Cop Coffee', icon: '☕', price: 25, kind: 'boost', speed: 1.35, jump: 1, dur: 45 },
    { id: 'sprinkle', name: 'Sprinkle Rush', icon: '🌈', price: 40, kind: 'boost', speed: 1.2, jump: 1.6, dur: 40 }
  ],
  'MEGA MART': [
    { id: 'bandage', name: 'Bandages', icon: '🩹', price: 25, kind: 'heal', hp: 35 },
    { id: 'medkit', name: 'Medkit', icon: '🧰', price: 80, kind: 'heal', hp: 100 },
    { id: 'ammo', name: 'Ammo Box', icon: '📦', price: 45, kind: 'ammo' },
    { id: 'vest', name: 'Body Armor', icon: '🦺', price: 170, kind: 'armor', ap: 50 },
    { id: 'shoes', name: 'Running Shoes', icon: '👟', price: 60, kind: 'boost', speed: 1.5, jump: 1, dur: 60 }
  ],
  'GAS & GO': [
    { id: 'energy', name: 'Energy Drink', icon: '⚡', price: 40, kind: 'boost', speed: 1.5, jump: 1.3, dur: 40 },
    { id: 'hotdog', name: 'Hot Dog', icon: '🌭', price: 20, kind: 'heal', hp: 35 },
    { id: 'scratch', name: 'Scratch Ticket', icon: '🎟️', price: 25, kind: 'lotto', odds: [[0.005, 1000], [0.04, 200], [0.15, 40]] },
    { id: 'ammo', name: 'Ammo Box', icon: '📦', price: 50, kind: 'ammo' }
  ],
  'STAR DINER': [
    { id: 'burger', name: 'Star Burger', icon: '🍔', price: 50, kind: 'heal', hp: 100 },
    { id: 'fries', name: 'Fries', icon: '🍟', price: 20, kind: 'heal', hp: 30 },
    { id: 'shake', name: 'Rocket Shake', icon: '🥤', price: 35, kind: 'boost', speed: 1.25, jump: 2, dur: 35 },
    { id: 'pie', name: 'Apple Pie', icon: '🥧', price: 30, kind: 'heal', hp: 50 }
  ],
  'ARCADE': [
    { id: 'claw', name: 'Claw Machine', icon: '🧸', price: 20, kind: 'lotto', odds: [[0.02, 200], [0.08, 50], [0.2, 20]] },
    { id: 'jackpot', name: 'Jackpot Spin', icon: '🎰', price: 100, kind: 'lotto', odds: [[0.01, 2500], [0.05, 300], [0.15, 100]] },
    { id: 'pixel', name: 'Pixel Power-Up', icon: '👾', price: 50, kind: 'boost', speed: 1.4, jump: 2.2, dur: 30 },
    { id: 'slush', name: 'Blue Slushie', icon: '🧊', price: 15, kind: 'heal', hp: 25 }
  ]
};

export function shopItem(shop, id) {
  const list = SHOP_ITEMS[shop];
  return list ? list.find(i => i.id === id) || null : null;
}

// a short line describing what an item does (shop menus)
export function itemInfo(it) {
  switch (it.kind) {
    case 'weapon': return 'new gun (or ammo for it)';
    case 'ammo': return 'refills ammo for all your guns';
    case 'heal': return it.hp >= 100 ? 'full health' : `+${it.hp} health`;
    case 'armor': return `+${it.ap} armor`;
    case 'boost': return [it.speed > 1 ? `${it.speed}x speed` : '', it.jump > 1 ? `${it.jump}x jump` : ''].filter(Boolean).join(' + ') + ` for ${it.dur}s`;
    case 'lotto': return `win up to $${Math.max(...it.odds.map(o => o[1]))}`;
  }
  return '';
}
