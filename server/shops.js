// CITY CHAOS - buying things at the stores (server authority).
// Walk up to a shopkeeper (PC: E, VR: grip) to open the store; the client sends
//   { type:'shopBuy', shop:'GUN SHOP', item:'ar' }
// and the server checks you're really at that counter, the clerk is open for business and you can pay.
import { SHOP_ITEMS, shopItem, SHOP_RANGE, MAX_ARMOR, ARMOR_SOAK } from '../public/shared/shops.js';
import { WEAPONS } from '../public/shared/weapons.js';
import { MAX_HEALTH } from '../public/shared/constants.js';
import { NPC_TYPE, NPC_STATE } from './npcs.js';

const HEAD_H = 1.55;
const BUY_COOLDOWN = 0.35;   // seconds between purchases (stops double clicks buying twice)

export function onShopBuy(room, p, m) {
  const shop = String(m.shop || ''), id = String(m.item || '');
  const fail = (why) => room.sendTo(p, { type: 'shopResult', ok: 0, shop, item: id, why });
  const it = shopItem(shop, id);
  if (!it) return fail('That isn\'t sold here');
  if (!p.alive || !p.pose || p.jail || p.holding || p.inCar) return fail('You can\'t shop right now');
  const t = room.now();
  if (t - (p.lastBuyAt || -9) < BUY_COOLDOWN) return;
  // the 💼 JOBS kiosk (no clerk)
  if (shop === 'JOB BOARD') {
    const jb = room.npcs.map.jobBoard, h = p.pose.h;
    if (!jb || Math.hypot(h[0] - jb[0], h[2] - jb[2]) > SHOP_RANGE + 0.6) return fail('Walk up to the JOBS kiosk');
    p.lastBuyAt = t;
    if (it.kind === 'jobquit') { if (!p.job) return fail('You don\'t have a job right now'); room.jobs.end(p, 'quit'); return room.sendTo(p, { type: 'shopResult', ok: 1, shop, item: id, kind: it.kind, cash: p.cash }); }
    const r = room.jobs.start(p, id);
    if (!r.ok) return fail(r.why);
    return room.sendTo(p, { type: 'shopResult', ok: 1, shop, item: id, kind: it.kind, cash: p.cash });
  }
  const n = room.npcs.list.find(q => q.type === NPC_TYPE.SHOP && q.shop === shop);
  if (!n || n.state === NPC_STATE.DEAD) return fail('Nobody is working the counter');
  if (t < n.closedUntil) return fail(`${shop} is closed (just robbed). Back in ${Math.ceil(n.closedUntil - t)}s`);
  if (n.state === NPC_STATE.HANDSUP || n.state === NPC_STATE.PANIC || n.rob) return fail('The clerk is too scared to serve you');
  const [hx, hy, hz] = p.pose.h;
  const kx = n.x, ky = n.y + HEAD_H - 0.4, kz = n.z;
  const dist = Math.hypot(hx - kx, hy - ky, hz - kz);
  if (dist > SHOP_RANGE + 0.6) return fail('Get closer to the counter');
  // you must see the clerk's face or the top of their head (no shopping through walls)
  const ey = Math.max(hy, n.y + 1.5);   // look from at least standing eye height (short bodies vs the counter)
  const sees = [HEAD_H - 0.4, HEAD_H + 0.15].some(h => {
    const y = n.y + h, d = Math.hypot(kx - hx, y - ey, kz - hz);
    return d < 0.5 || room.npcs.world.raycast(hx, ey, hz, (kx - hx) / d, (y - ey) / d, (kz - hz) / d, d) >= d - 0.4;
  });
  if (!sees) return fail('Get closer to the counter');
  // the CITY BANK teller: savings account
  if (shop === 'CITY BANK') {
    p.lastBuyAt = t;
    const r = room.bank.account(p, it);
    if (!r.ok) return fail(r.why);
    room.sendTo(p, { type: 'shopResult', ok: 1, shop, item: id, kind: it.kind, cash: p.cash, bank: r.bank, amount: r.amount });
    room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
    return;
  }
  if ((p.cash || 0) < it.price) return fail(`You need $${it.price} (you have $${p.cash || 0})`);

  // does it do anything for you right now? (don't take money for nothing)
  if (it.kind === 'heal' && p.hp >= MAX_HEALTH) return fail('You\'re already at full health');
  if (it.kind === 'armor' && (p.armor || 0) >= Math.min(MAX_ARMOR, it.ap)) return fail('You already have that much armor');
  if (it.kind === 'ammo' && !p.slots.some(s => s.reserve < WEAPONS[s.w].reserve * 2)) return fail(p.slots.length ? 'Your ammo is already full' : 'You have no guns');
  if (it.kind === 'weapon') {
    const have = p.slots.find(s => s.w === it.w);
    if (have && have.reserve >= WEAPONS[it.w].reserve * 2) return fail(`Your ${WEAPONS[it.w].name} ammo is full`);
  }

  p.cash -= it.price;
  p.lastBuyAt = t;
  const res = { type: 'shopResult', ok: 1, shop, item: id, kind: it.kind, cash: p.cash };
  switch (it.kind) {
    case 'weapon': room.giveWeapon(p, it.w, true); room.sendInventory(p); break;
    case 'ammo':
      for (const s of p.slots) { const d = WEAPONS[s.w]; s.reserve = d.reserve * 2; }
      room.sendInventory(p); break;
    case 'heal':
      p.hp = Math.min(MAX_HEALTH, p.hp + it.hp);
      room.broadcast({ type: 'hp', id: p.id, hp: p.hp }); res.hp = p.hp; break;
    case 'armor':
      p.armor = Math.min(MAX_ARMOR, Math.max(p.armor || 0, it.ap));
      res.ap = p.armor; break;
    case 'boost':
      p.boost = { speed: it.speed, jump: it.jump, until: t + it.dur };
      res.boost = { speed: it.speed, jump: it.jump, dur: it.dur }; break;
    case 'lotto': {
      // rolls from the rarest prize up: odds are [[chance, cash], ...]
      let r = Math.random(), win = 0;
      for (const [c, cash] of it.odds) { if (r < c) { win = cash; break; } r -= c; }
      p.cash += win; res.win = win; res.cash = p.cash; break;
    }
  }
  p.buys = (p.buys || 0) + 1;
  // daily missions
  const S = room.saves;
  S.event(p, 'shop'); S.event(p, 'spend', it.price);
  if (it.kind === 'heal' && shop !== 'MEGA MART') S.event(p, 'food');
  if (it.kind === 'lotto') S.event(p, 'lotto');
  if (it.kind === 'boost') S.event(p, 'boost');
  if (it.kind === 'armor') S.event(p, 'armor');
  room.sendTo(p, res);
  room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
  room.sendTo(p, { type: 'npcSay', id: n.id, text: it.kind === 'lotto' ? (res.win ? `WINNER! $${res.win}` : 'Better luck next time!') : 'Thanks! Come again!' });
}

// armor soaks most of a hit; returns the damage left for your health
export function soakArmor(room, q, amount) {
  if (!q.armor) return amount;
  const take = Math.min(q.armor, Math.round(amount * ARMOR_SOAK));
  q.armor -= take;
  room.sendTo(q, { type: 'armor', ap: q.armor });
  return amount - take;
}

export { SHOP_ITEMS };
