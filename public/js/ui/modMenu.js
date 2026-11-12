// CITY CHAOS - the secret MOD MENU (client).
// Unlock: PC = type M O D M E N U (then F8 or typing it again opens/closes it).
//         Meta Quest = press A, B, A, X, Y (then it's also in the Y menu as "MOD MENU").
import { MOD_BASES, MOD_SCOPES, MOD_SKINS, MOD_RATES, MOD_DAMAGE, MOD_SPEEDS, MOD_JUMPS, MOD_GIVE, MOD_PLACES, SCOPE_NAME, DEFAULT_CUSTOM, cleanCustom } from '/shared/mods.js';
import { WEAPONS } from '/shared/weapons.js';

const PC_CODE = 'MODMENU', VR_CODE = 'ABAXY';
const SERVER_FLAGS = ['inf', 'auto', 'god', 'boom', 'ghost'];
const LABEL = { inf: 'INFINITE AMMO', auto: 'AUTO FIRE (ANY GUN)', god: 'GOD MODE', boom: 'EXPLOSIVE BULLETS', ghost: 'COPS IGNORE ME', esp: 'ESP: SEE EVERYONE', fly: 'FLY / NOCLIP' };
const ICON = { inf: '♾️', auto: '🔫', god: '🛡️', boom: '💥', ghost: '👻', esp: '👁️', fly: '🕊️' };
const next = (arr, v, d = 1) => arr[(arr.indexOf(v) + d + arr.length) % arr.length];

export class ModMenu {
  constructor({ net, walker, vrMover, weapons, hud, vrui, toast, inRoom, relock }) {
    Object.assign(this, { net, walker, vrMover, weapons, hud, vrui, toast, inRoom, relock });
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('cc_mods') || '{}'); } catch {}
    this.s = { unlocked: !!saved.unlocked, inf: false, auto: false, god: false, boom: false, ghost: false, esp: false, fly: false,
      speed: 1, jump: 1, give: 'ar', place: 0, custom: cleanCustom(saved.custom || DEFAULT_CUSTOM) };
    this.weaponMods = { inf: false, auto: false, custom: this.s.custom };   // read by the weapon system
    this.vrPage = null;            // null | 'main' | 'custom'
    this.buf = ''; this.vrBuf = []; this.serverOff = false;
    this.buildPanel();
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.apply();
  }
  get unlocked() { return this.s.unlocked; }
  save() { try { localStorage.setItem('cc_mods', JSON.stringify({ unlocked: this.s.unlocked, custom: this.s.custom })); } catch {} }

  // ---------------------------------------------------------------- secret codes
  onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'F8' && this.s.unlocked) { e.preventDefault(); return this.toggle(); }
    if (e.code === 'Escape' && this.isOpen()) return this.close();
    if (e.key && e.key.length === 1) {
      this.buf = (this.buf + e.key.toUpperCase()).slice(-PC_CODE.length);
      if (this.buf === PC_CODE) { this.buf = ''; if (!this.s.unlocked) this.unlock(); this.toggle(); }
    }
  }
  // VR: called every frame with the controller states; true when A B A X Y was just completed
  vrCode(L, R) {
    const t = performance.now();
    const add = (c) => { this.vrBuf.push({ c, t }); if (this.vrBuf.length > VR_CODE.length) this.vrBuf.shift(); };
    if (R.pressed.a) add('A'); if (R.pressed.b) add('B'); if (L.pressed.a) add('X'); if (L.pressed.b) add('Y');
    const seq = this.vrBuf.map(b => b.c).join('');
    if (seq === VR_CODE && t - this.vrBuf[0].t < 4000) { this.vrBuf = []; if (!this.s.unlocked) this.unlock(); this.vrPage = 'main'; return true; }
    return false;
  }
  unlock() {
    this.s.unlocked = true; this.save();
    this.net.send({ type: 'mod', k: 'unlock' });
    const t = '🛠 MOD MENU UNLOCKED';
    this.hud.notice(t, 3500); this.vrui.setNotice(t, 3);
  }
  // after joining a room the server forgets your mods: send them again
  sync() {
    if (!this.s.unlocked) return;
    this.net.send({ type: 'mod', k: 'unlock' });
    for (const k of SERVER_FLAGS) if (this.s[k]) this.net.send({ type: 'mod', k, v: true });
  }
  onServer(m) {
    if (m.off) { this.serverOff = true; for (const k of SERVER_FLAGS) this.s[k] = false; this.toast('Mods are turned off on this server'); this.apply(); this.render(); return; }
    this.serverOff = false;
    for (const k of SERVER_FLAGS) this.s[k] = !!m[k];
    this.apply(); this.render();
  }

  // ---------------------------------------------------------------- the effect of every mod
  apply() {
    const s = this.s;
    this.weaponMods.inf = s.inf; this.weaponMods.auto = s.auto; this.weaponMods.custom = s.custom;
    this.weapons.mods = this.weaponMods;
    const b = this.boost;   // store boosts (energy drink, coffee...) stack on top of the mod speed / jump
    this.walker.mods = { speed: s.speed * (b ? b.speed : 1), jump: s.jump * (b ? b.jump : 1), fly: s.fly };
    this.vrMover.gravityScale = 1 / this.walker.mods.jump;
  }
  speedMul() { return this.walker.mods.speed; }
  // a speed / jump boost bought at a store, for dur seconds
  setBoost(b) { this.boost = b ? { speed: b.speed || 1, jump: b.jump || 1, until: performance.now() / 1000 + b.dur } : null; this.apply(); }
  boostLeft() { return this.boost ? Math.max(0, this.boost.until - performance.now() / 1000) : 0; }
  tickBoost() { if (this.boost && this.boostLeft() <= 0) { this.boost = null; this.apply(); this.toast('Your boost wore off'); } }
  send(k, v) {
    if (!this.s.unlocked) return;
    if (!this.inRoom()) { this.toast('Join a room first'); return; }
    this.net.send({ type: 'mod', k, v });
  }
  // one function for both the PC panel and the VR buttons
  action(a) {
    const s = this.s;
    if (SERVER_FLAGS.includes(a)) { s[a] = !s[a]; this.send(a, s[a]); }
    else if (a === 'esp' || a === 'fly') s[a] = !s[a];
    else if (a === 'speed') s.speed = next(MOD_SPEEDS, s.speed);
    else if (a === 'jump') s.jump = next(MOD_JUMPS, s.jump);
    else if (a === 'giveNext') s.give = next(MOD_GIVE, s.give);
    else if (a === 'give') this.send('give', s.give);
    else if (a.startsWith('give:')) { s.give = a.slice(5); this.send('give', s.give); }
    else if (a === 'cash' || a === 'heal' || a === 'clear') this.send(a);
    else if (a === 'placeNext') s.place = (s.place + 1) % MOD_PLACES.length;
    else if (a === 'tp') this.send('tp', s.place);
    else if (a === 'base') s.custom.base = next(MOD_BASES, s.custom.base);
    else if (a === 'scope') s.custom.scope = next(MOD_SCOPES, s.custom.scope);
    else if (a === 'skin') s.custom.skin = next(MOD_SKINS, s.custom.skin);
    else if (a === 'rate') s.custom.rate = next(MOD_RATES, s.custom.rate);
    else if (a === 'dmg+' || a === 'dmg-') { const i = MOD_DAMAGE.findIndex(v => v >= s.custom.dmg); s.custom.dmg = MOD_DAMAGE[Math.max(0, Math.min(MOD_DAMAGE.length - 1, (i < 0 ? MOD_DAMAGE.length - 1 : i) + (a === 'dmg+' ? 1 : -1)))]; }
    else if (a === 'equip') { this.send('custom', s.custom); this.toast(`🛠 Custom gun: ${WEAPONS[s.custom.base].name} · ${s.custom.dmg} dmg · ${SCOPE_NAME[s.custom.scope]}`); }
    else if (a === 'page:custom') this.vrPage = 'custom';
    else if (a === 'page:main') this.vrPage = 'main';
    else if (a === 'close') { this.vrPage = null; this.close(); }
    if (a.startsWith('dmg') || ['base', 'scope', 'skin', 'rate', 'save'].includes(a)) { this.save(); if (this.weapons.current && this.weapons.current.w === 'custom') { this.apply(); this.weapons.refreshModel(); this.send('custom', s.custom); } }
    this.apply(); this.render();
  }

  // ---------------------------------------------------------------- VR pages (drawn by vrUI on the Y menu panel)
  vrModel() {
    const s = this.s, on = (k) => ({ label: `${ICON[k]} ${LABEL[k]}: ${s[k] ? 'ON' : 'OFF'}`, act: 'mod:' + k, on: s[k] });
    if (this.vrPage === 'custom') {
      const c = s.custom;
      return { cols: 2, title: '🛠 CUSTOM GUN', sub: `${WEAPONS[c.base].name.toUpperCase()} · ${c.dmg} DAMAGE · ${SCOPE_NAME[c.scope]} · ${c.skin.toUpperCase()} · ${c.rate.toUpperCase()}`, items: [
        { label: `BASE: ${WEAPONS[c.base].name.toUpperCase()}`, act: 'mod:base', color: '#3a86ff' }, { label: `SCOPE: ${SCOPE_NAME[c.scope]}`, act: 'mod:scope', color: '#3a86ff' },
        { label: `LOOK: ${c.skin.toUpperCase()}`, act: 'mod:skin', color: '#8338ec' }, { label: `FIRE: ${c.rate.toUpperCase()}`, act: 'mod:rate', color: '#8338ec' },
        { label: `DAMAGE ${c.dmg}  ( - )`, act: 'mod:dmg-', color: '#ff3d7f' }, { label: `DAMAGE ${c.dmg}  ( + )`, act: 'mod:dmg+', color: '#ff3d7f' },
        { label: '⚡ EQUIP CUSTOM GUN', act: 'mod:equip', color: '#ff9f1c' }, { label: '◀ BACK TO MODS', act: 'mod:page:main', color: '#6c6f8a' },
        { label: '✖ CLOSE', act: 'mod:close', color: '#6c6f8a' }] };
    }
    return { cols: 2, title: '🛠 MOD MENU', sub: this.serverOff ? 'MODS ARE OFF ON THIS SERVER' : 'A B A X Y unlocked · trigger to pick', items: [
      on('inf'), on('auto'), on('god'), on('boom'), on('ghost'), on('esp'), on('fly'),
      { label: `⚡ SPEED: ${s.speed}x`, act: 'mod:speed', color: '#3a86ff', on: s.speed > 1 }, { label: `🦘 SUPER JUMP: ${s.jump}x`, act: 'mod:jump', color: '#3a86ff', on: s.jump > 1 },
      { label: '❤️ HEAL', act: 'mod:heal', color: '#e63946' }, { label: '💰 +$1000', act: 'mod:cash', color: '#2a9d8f' }, { label: '⭐ CLEAR WANTED STARS', act: 'mod:clear', color: '#f4a261' },
      { label: `GIVE: ${WEAPONS[s.give].name.toUpperCase()} (next)`, act: 'mod:giveNext', color: '#5e548e' }, { label: `🎁 GIVE ${WEAPONS[s.give].name.toUpperCase()}`, act: 'mod:give', color: '#9f86c0' },
      { label: `TP: ${MOD_PLACES[s.place].name}`, act: 'mod:placeNext', color: '#5e548e' }, { label: '🌀 TELEPORT!', act: 'mod:tp', color: '#9f86c0' },
      { label: '🛠 CUSTOM GUN ▶', act: 'mod:page:custom', color: '#ff9f1c' }, { label: '✖ CLOSE', act: 'mod:close', color: '#6c6f8a' }] };
  }

  // ---------------------------------------------------------------- PC panel
  isOpen() { return !this.el.classList.contains('hidden'); }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() { if (!this.s.unlocked) return; this.el.classList.remove('hidden'); this.render(); if (document.pointerLockElement) document.exitPointerLock(); }
  close() { if (!this.isOpen()) return; this.el.classList.add('hidden'); if (this.relock) this.relock(); }   // back to the game (mouse captured again)
  buildPanel() {
    const el = document.createElement('div'); el.id = 'modmenu'; el.className = 'hidden';
    el.innerHTML = `
      <div class="mm-head"><b>🛠 CITY CHAOS MOD MENU</b><span>F8 or MODMENU to close</span><button data-x>✖</button></div>
      <div class="mm-sec">PLAYER</div>
      <div class="mm-grid">${['inf', 'auto', 'god', 'boom', 'ghost', 'esp', 'fly'].map(k => `<button class="mm-tg" data-a="${k}">${ICON[k]} ${LABEL[k]}</button>`).join('')}</div>
      <div class="mm-row"><span>Speed</span>${MOD_SPEEDS.map(v => `<button data-speed="${v}">${v}x</button>`).join('')}<span>Jump</span>${MOD_JUMPS.map(v => `<button data-jump="${v}">${v}x</button>`).join('')}</div>
      <div class="mm-row"><button data-a="heal">❤️ Heal</button><button data-a="cash">💰 +$1000</button><button data-a="clear">⭐ Clear stars</button></div>
      <div class="mm-row"><span>Give</span>${MOD_GIVE.map(w => `<button data-a="give:${w}">${WEAPONS[w].icon} ${WEAPONS[w].name}</button>`).join('')}</div>
      <div class="mm-row"><span>Teleport</span><select data-place>${MOD_PLACES.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}</select><button data-a="tp">🌀 Go</button></div>
      <div class="mm-sec">🛠 CUSTOM GUN</div>
      <div class="mm-row"><span>Base</span>${MOD_BASES.map(b => `<button data-base="${b}">${WEAPONS[b].icon} ${WEAPONS[b].name}</button>`).join('')}</div>
      <div class="mm-row"><span>Scope</span><select data-scope>${MOD_SCOPES.map(c => `<option value="${c}">${SCOPE_NAME[c]}</option>`).join('')}</select>
        <span>Look</span><select data-skin>${MOD_SKINS.map(c => `<option value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select>
        <span>Fire</span>${MOD_RATES.map(r => `<button data-rate="${r}">${r}</button>`).join('')}</div>
      <div class="mm-row"><span>Damage</span><input type="range" min="1" max="999" step="1" data-dmg><b data-dmgv></b></div>
      <div class="mm-row"><button class="mm-equip" data-a="equip">⚡ EQUIP CUSTOM GUN</button></div>
      <div class="mm-hint">Fly: Space up · C down · Shift fast · Right click aims through your scope</div>`;
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x !== undefined) return this.close();
      if (b.dataset.a) return this.action(b.dataset.a);
      if (b.dataset.speed) { this.s.speed = +b.dataset.speed; this.apply(); this.render(); }
      if (b.dataset.jump) { this.s.jump = +b.dataset.jump; this.apply(); this.render(); }
      if (b.dataset.base) { this.s.custom.base = b.dataset.base; this.action('save'); }
      if (b.dataset.rate) { this.s.custom.rate = b.dataset.rate; this.action('save'); }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.place !== undefined) this.s.place = +t.value;
      if (t.dataset.scope !== undefined) { this.s.custom.scope = t.value; this.action('save'); }
      if (t.dataset.skin !== undefined) { this.s.custom.skin = t.value; this.action('save'); }
      if (t.dataset.dmg !== undefined) { this.s.custom.dmg = +t.value; this.action('dmg'); }
    });
    el.addEventListener('input', (e) => { if (e.target.dataset.dmg !== undefined) { this.s.custom.dmg = +e.target.value; el.querySelector('[data-dmgv]').textContent = e.target.value; } });
    document.body.appendChild(el); this.el = el;
  }
  render() {
    if (!this.el || !this.isOpen()) return;
    const s = this.s, q = (sel) => this.el.querySelectorAll(sel);
    q('.mm-tg').forEach(b => b.classList.toggle('on', !!s[b.dataset.a]));
    q('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s.speed));
    q('[data-jump]').forEach(b => b.classList.toggle('on', +b.dataset.jump === s.jump));
    q('[data-base]').forEach(b => b.classList.toggle('on', b.dataset.base === s.custom.base));
    q('[data-rate]').forEach(b => b.classList.toggle('on', b.dataset.rate === s.custom.rate));
    this.el.querySelector('[data-scope]').value = s.custom.scope; this.el.querySelector('[data-skin]').value = s.custom.skin;
    this.el.querySelector('[data-place]').value = String(s.place);
    this.el.querySelector('[data-dmg]').value = s.custom.dmg; this.el.querySelector('[data-dmgv]').textContent = s.custom.dmg;
    this.el.querySelector('.mm-head span').textContent = this.serverOff ? 'MODS ARE OFF ON THIS SERVER' : 'F8 or MODMENU to close';
  }
}
