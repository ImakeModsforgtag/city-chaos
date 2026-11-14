// CITY CHAOS - store menus (client). Walk up to a shopkeeper:
//   PC: press E to open the store, click an item (or press its number) to buy, E / Esc to close.
//   VR: squeeze grip near the clerk, point the laser and pull the trigger on an item, B or CLOSE to leave.
// The server checks everything (distance, cash, store closed...) and answers with 'shopResult'.
import { SHOP_ITEMS, SHOP_RANGE, itemInfo } from '/shared/shops.js';
import { GOLDEN } from '/shared/weapons.js';
import { garageItems, CAR_MODELS } from '/shared/garage.js';
import { wardrobeItems, OUTFITS } from '/shared/wardrobe.js';

const HEAD_H = 1.55;
const COLORS = { weapon: '#d62f4b', ammo: '#8d6e63', heal: '#2ec27e', armor: '#3a86ff', boost: '#ff9f1c', lotto: '#8338ec', golden: '#b8860b', deposit: '#1b8a4e', withdraw: '#1565c0', job: '#ff9f1c', jobquit: '#6c6f8a', carbuy: '#e53935', carsel: '#2ec27e', carpaint: '#8338ec', carcall: '#ffb703', outfit: '#e91e63', wear: '#2ec27e', aptbuy: '#6a1b9a', apthome: '#2ec27e', aptvisit: '#00b4d8' };

export class ShopMenu {
  constructor({ net, map, world, npcs, toast, hud, vrui, audio, myCash, goldForSale, relock, myBank, myJob, myGarage, myLevel, myWardrobe, myOutfit, myApt }) {
    Object.assign(this, { net, map, world, npcs, toast, hud, vrui, audio, myCash, goldForSale, relock, myBank, myJob, myGarage, myLevel, myWardrobe, myOutfit, myApt });
    // places with a menu but no clerk: the 💼 JOBS kiosk
    this.spots = map.shops.slice();
    if (map.jobBoard) this.spots.push({ name: 'JOB BOARD', keeper: map.jobBoard, yaw: 0, kiosk: true });
    if (map.carLot) this.spots.push({ name: 'CAR LOT', keeper: map.carLot, yaw: Math.PI / 2, kiosk: true });
    if (map.threads) this.spots.push({ name: 'THREADS', keeper: map.threads, yaw: Math.PI / 2, kiosk: true });
    if (map.aptDoor) this.spots.push({ name: 'APARTMENTS', keeper: map.aptDoor.keeper, yaw: 0, kiosk: true });
    this.shop = null;        // name of the store whose menu is open (PC panel or VR page)
    this.vrOpen = false;
    this.lastMsg = '';
    this.buildPanel();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ---------------------------------------------------------------- where are the stores?
  // the store whose clerk is close enough to talk to (and not behind a wall), or null
  near(head) {
    let best = null, bd = SHOP_RANGE;
    for (const s of this.spots) {
      const kx = s.keeper[0], ky = s.keeper[1] + HEAD_H - 0.4, kz = s.keeper[2];
      const d = Math.hypot(head.x - kx, head.y - ky, head.z - kz);
      if (d >= bd || (!SHOP_ITEMS[s.name] && s.name !== 'CAR LOT' && s.name !== 'THREADS' && s.name !== 'APARTMENTS')) continue;
      if (!this.canSee(head, kx, s.keeper[1], kz)) continue;
      best = s; bd = d;
    }
    return best;
  }
  // can you see the clerk's face or the top of their head? 
  canSee(head0, kx, ky0, kz) {
    // look from at least normal standing eye height, so a short body isn't blocked by the counter
    const head = { x: head0.x, y: Math.max(head0.y, ky0 + 1.5), z: head0.z };
    for (const h of [HEAD_H - 0.4, HEAD_H + 0.15]) {
      const ky = ky0 + h, d = Math.hypot(head.x - kx, head.y - ky, head.z - kz);
      if (d < 0.5) return true;
      if (this.world.raycast(head.x, head.y, head.z, (kx - head.x) / d, (ky - head.y) / d, (kz - head.z) / d, d) >= d - 0.4) return true;
    }
    return false;
  }
  // the clerk NPC standing at that store (to know if it's closed / being robbed)
  clerk(s) {
    for (const n of this.npcs.map.values()) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 2.5) return n;
    return null;
  }
  status(s) {
    if (s.kiosk) return null;
    const n = this.clerk(s);
    if (!n || !n.alive || n.state === 3) return 'Nobody is at the counter';
    if (n.closed) return `${s.name} is CLOSED (just robbed)`;
    return null;
  }
  items(name) {
    if (name === 'CAR LOT') return garageItems(this.myGarage(), this.myLevel());
    if (name === 'THREADS') return wardrobeItems(this.myWardrobe(), this.myOutfit());
    if (name === 'APARTMENTS') return this.myApt().map(it => ({ ...it, locked: it.kind === 'aptbuy' && this.myLevel() < it.lvl }));
    const list = (SHOP_ITEMS[name] || []).slice();
    // the secret Golden Sniper only shows up for the cop who unlocked it
    if (name === 'GUN SHOP' && this.goldForSale()) list.unshift({ id: 'golden', name: 'GOLDEN SNIPER', icon: '🏆', price: GOLDEN.price, kind: 'golden', secret: true });
    return list;
  }
  info(it) {
    if (it.kind === 'golden') return 'secret: only you can see this';
    if (it.kind === 'carbuy') { const m = CAR_MODELS.find(x => x.id === it.model); return it.locked ? `🔒 unlocks at level ${it.lvl}` : `${m.about} · top speed ${Math.round(m.top * 3.6)} km/h`; }
    if (it.kind === 'carsel') return 'you own this one · pick it to drive it';
    if (it.kind === 'carpaint') return 'new color for the car you drive';
    if (it.kind === 'carcall') return 'or press C anywhere (VR: Y menu)';
    if (it.kind === 'outfit') return 'yours to keep · puts it on right away';
    if (it.kind === 'aptbuy') return it.locked ? `🔒 unlocks at level ${it.lvl}` : 'trophy shelf · bed · safe zone · friends can visit';
    if (it.kind === 'apthome') return 'your trophies are waiting';
    if (it.kind === 'aptvisit') return 'they\'re home right now';
    if (it.kind === 'wear') return it.outfit ? 'you own this one' : 'back to your normal look';
    return itemInfo(it);
  }
  promptFor(name, vr) { const k = vr ? 'Squeeze grip' : 'Press E'; return name === 'CITY BANK' ? `🏦 ${k} to use the CITY BANK` : name === 'JOB BOARD' ? `💼 ${k} for JOBS` : name === 'CAR LOT' ? `🚗 ${k} for the CAR LOT` : name === 'THREADS' ? `👕 ${k} to shop for clothes at THREADS` : name === 'APARTMENTS' ? `🏠 ${k} for the APARTMENTS` : `🛒 ${k} to shop at ${name}`; }
  title(name) { return name === 'CITY BANK' ? '🏦 CITY BANK' : name === 'JOB BOARD' ? '💼 JOBS' : name === 'CAR LOT' ? '🚗 CAR LOT' : name === 'THREADS' ? '👕 THREADS' : name === 'APARTMENTS' ? '🏠 APARTMENTS' : '🛒 ' + name; }
  priceTag(it) { return it.kind === 'carsel' || it.kind === 'carcall' || it.kind === 'wear' || it.kind === 'apthome' || it.kind === 'aptvisit' ? '' : it.locked ? `🔒 Lv ${it.lvl}` : it.kind === 'job' || it.kind === 'jobquit' || it.kind === 'withdraw' || (it.kind === 'deposit' && !it.amount) ? '' : `$${it.price}`; }
  extraLine() { return this.shop === 'CITY BANK' ? `Savings: $${this.myBank()} · grows 2% a day · safe from robbers` : this.shop === 'JOB BOARD' ? (this.myJob() ? `Current job: ${this.myJob()}` : 'Pick a job. Pay grows with the distance.') : this.shop === 'CAR LOT' ? (this.myGarage().cars.length ? `You own ${this.myGarage().cars.length} car${this.myGarage().cars.length > 1 ? 's' : ''} · press C anywhere to call yours` : 'Buy your own car. Only you can drive it, and you can call it anywhere.') : this.shop === 'THREADS' ? 'Outfits are yours to keep. Change them any time here or in CUSTOMIZE.' : this.shop === 'APARTMENTS' ? 'Your own place: trophies, a bed, and nobody can hurt you inside.' : ''; }

  // ---------------------------------------------------------------- buying
  buy(id) {
    if (!this.shop) return;
    const it = this.items(this.shop).find(i => i.id === id); if (!it) return;
    if (it.kind === 'golden') this.net.send({ type: 'buyGold' });
    else this.net.send({ type: 'shopBuy', shop: this.shop, item: id });
    this.audio.playClick();
  }
  onResult(m) {
    const it = (SHOP_ITEMS[m.shop] || []).find(i => i.id === m.item);
    if (!m.ok) { this.say(m.why, false); return; }
    if (m.kind === 'apt') { this.audio.playCash(); if (m.bought) this.say(`🏠 The apartment is yours! Press GO HOME  ($${m.cash} left)`, true); else this.close(); return; }
    if (m.kind === 'outfit' || m.kind === 'wear') { this.audio.playCash(); const o = OUTFITS[m.outfit]; this.say(m.kind === 'outfit' ? `👕 You bought the ${o.name}! Looking good  ($${m.cash} left)` : m.outfit ? `👕 Now wearing the ${o.name}` : 'Outfit off', true); return; }
    if (m.kind === 'car') {
      this.audio.playCash ? this.audio.playCash() : this.audio.playPickup();
      const id = String(m.item);
      const t = m.bought ? `🎉 You bought the ${CAR_MODELS.find(x => x.id === m.bought).name}! Press "Bring my car here"` : id === 'call' ? '🔑 Your car is parked on the street nearby' : id === 'paint' ? '🎨 Fresh paint!' : '✔ That\'s the car you\'ll drive now';
      this.say(t + `  ($${m.cash} left)`, true);
      if (id === 'call') this.close();
      return;
    }
    if (m.kind === 'deposit' || m.kind === 'withdraw') { this.audio.playCash(); this.say(`${m.kind === 'deposit' ? 'Deposited' : 'Withdrew'} $${m.amount} · savings $${m.bank} · cash $${m.cash}`, true); return; }
    if (m.kind === 'job') { this.audio.playChime && this.audio.playChime(); this.close(); return; }
    if (m.kind === 'jobquit') { this.say('You quit your job', true); return; }
    this.audio.playCash ? this.audio.playCash() : this.audio.playPickup();
    let t = `${it ? it.icon + ' ' + it.name : 'Bought'}`;
    if (m.kind === 'lotto') t = m.win ? `🎉 YOU WON $${m.win}!` : `${it.icon} No luck this time`;
    else if (m.kind === 'heal') t += ` · ❤ ${m.hp}`;
    else if (m.kind === 'armor') t += ` · 🛡 ${m.ap}`;
    else if (m.kind === 'boost') t += ` · ${m.boost.dur}s boost`;
    this.say(t + `  ($${m.cash} left)`, true);
  }
  say(t, good) {
    this.lastMsg = t; this.lastGood = good;
    this.toast((good ? '🛒 ' : '⚠️ ') + t);
    this.vrui.setNotice(t, 2);
    this.render();
  }

  // ---------------------------------------------------------------- open / close
  isOpen() { return !!this.shop && !this.el.classList.contains('hidden'); }
  openPC(name) {
    this.shop = name; this.lastMsg = '';
    this.el.classList.remove('hidden'); this.render();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  openVR(name) { this.shop = name; this.vrOpen = true; this.lastMsg = ''; }
  close() {
    const wasPC = this.isOpen();
    if (this.shop) this.closedAt = performance.now();
    this.shop = null; this.vrOpen = false;
    this.el.classList.add('hidden');
    if (wasPC && this.relock) this.relock();
  }
  onKey(e) {
    if (!this.isOpen()) return;
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); e.stopPropagation(); return this.close(); }
    const k = /^Digit(\d)$/.exec(e.code);
    if (k) { const i = (+k[1] || 10) - 1, it = this.items(this.shop)[i]; if (it) this.buy(it.id); }
  }

  // ---------------------------------------------------------------- VR page (drawn by vrUI on the menu panel)
  vrModel() {
    const cash = this.myCash();
    const items = this.items(this.shop).map(it => ({ label: `${it.icon} ${it.name.toUpperCase()}  ${this.priceTag(it)}`.trim(), act: 'shop:buy:' + it.id, color: cash >= it.price && !it.locked ? COLORS[it.kind] : '#4a4560' }));
    items.push({ label: '✖ LEAVE', act: 'shop:close', color: '#6c6f8a' });
    const extra = this.extraLine();
    return { cols: 2, title: this.title(this.shop), sub: this.lastMsg ? this.lastMsg : (extra ? extra.toUpperCase() : `YOU HAVE $${cash} · TRIGGER TO BUY`), bg: '#1d1442', items };
  }

  // ---------------------------------------------------------------- PC panel
  buildPanel() {
    const el = document.createElement('div'); el.id = 'shopmenu'; el.className = 'hidden';
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-buy],[data-x]'); if (!b) return;
      if (b.dataset.x !== undefined) return this.close();
      this.buy(b.dataset.buy);
    });
    document.body.appendChild(el); this.el = el;
  }
  render() {
    if (!this.isOpen()) return;
    const cash = this.myCash(), list = this.items(this.shop);
    const extra = this.extraLine();
    const key = this.shop + '|' + cash + '|' + this.lastMsg + '|' + list.map(i => i.name).join() + '|' + extra;
    if (key === this.key) return; this.key = key;
    this.el.innerHTML = `
      <div class="sm-head"><b>${this.title(this.shop)}</b><span class="sm-cash">$${cash}</span><button data-x>✖</button></div>${extra ? `<div class="sm-msg">${extra}</div>` : ''}
      <div class="sm-grid">${list.map((it, i) => `
        <button class="sm-item ${cash >= it.price && !it.locked ? '' : 'poor'} ${it.secret ? 'gold' : ''}" data-buy="${it.id}" style="--c:${COLORS[it.kind]}">
          <i>${it.icon}</i><b>${it.name}</b><small>${this.info(it)}</small>${this.priceTag(it) ? `<em>${this.priceTag(it)}</em>` : '<em>GO</em>'}<kbd>${i < 10 ? (i + 1) % 10 : ''}</kbd>
        </button>`).join('')}</div>
      <div class="sm-msg ${this.lastGood ? 'good' : 'bad'}">${this.lastMsg || 'Click an item or press its number · E or Esc to leave'}</div>`;
  }
  // called every frame: keep the panel's cash up to date, close it when you walk away
  update(head, alive) {
    if (!this.shop) return;
    const s = this.spots.find(q => q.name === this.shop);
    const d = s ? Math.hypot(head.x - s.keeper[0], head.z - s.keeper[2]) : 99;
    if (!alive || d > SHOP_RANGE + 1.5) { this.close(); return; }
    this.render();
  }
}
