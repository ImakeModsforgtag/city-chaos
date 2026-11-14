// CITY CHAOS - the 📱 phone. PC: press P. VR: turn your left wrist toward your face (like checking a watch) and the
// phone pops up on your wrist: tap an app with your right hand.
// Shows your cash + savings, level, what you're doing (job / race / heist), today's missions, the weekly challenges,
// holiday gifts, and five apps: CALL MY CAR, GPS (a beam to any place in the city), RADIO, WAVE and 🗺️ MAP
// (PC: opens the big map, same as M. VR: the wrist screen turns into the city map, tap BACK to return).
import * as THREE from 'three';
import { roundRect } from '../engine/geo.js';

const FONT = 'Trebuchet MS, sans-serif', INK = '#1d1442';
export const GPS_PLACES = (map) => [
  { name: '💼 JOBS', p: map.jobBoard }, { name: '🏦 CITY BANK', p: map.bank && map.bank.center }, { name: '🚗 CAR LOT', p: map.carLot },
  { name: '👕 THREADS', p: map.threads }, { name: '🏠 APARTMENTS', p: map.aptDoor && map.aptDoor.keeper }, { name: '🏁 RACE START', p: [56, 0.15, -30] },
  { name: '🔫 GUN SHOP', p: (map.shops.find(s => s.name === 'GUN SHOP') || {}).keeper }, { name: '🗼 CHAOS TOWER', p: [72, 0.15, -82] }
].filter(x => x.p);

function txt(x, t, a, b, size, color = '#fff', align = 'left') { x.font = `bold ${size}px ${FONT}`; x.textAlign = align; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(t, a, b); }
function fit(x, t, max, size) { x.font = `bold ${size}px ${FONT}`; while (t.length > 4 && x.measureText(t).width > max) t = t.slice(0, -2); return x.measureText(t).width > max ? t : t; }

export class Phone {
  constructor({ data, act, map, drawMap }) {
    this.data = data; this.act = act; this.drawMap = drawMap; this.mapMode = false; this.gps = GPS_PLACES(map); this.gpsI = -1;
    // ---- PC overlay
    const el = document.createElement('div'); el.id = 'phone'; el.className = 'hidden';
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-app]'); if (b) { this.tap(b.dataset.app, b.dataset.i); this.render(true); } if (e.target.closest('[data-x]')) this.close(); });
    document.body.appendChild(el); this.el = el;
    document.addEventListener('keydown', (e) => { if (this.isOpen() && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); e.stopPropagation(); this.close(); } }, true);
    // ---- VR wrist screen
    this.c = document.createElement('canvas'); this.c.width = 512; this.c.height = 820; this.x = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15 * 820 / 512), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 22; this.mesh.visible = false;
    this.buttons = []; this.key = ''; this.vrShown = false; this.tapAt = 0;
  }
  // ---------------------------------------------------------------- actions
  tap(app, i, vr) {
    if (app === 'map' && vr) { this.mapMode = true; this.key = ''; return; }
    if (app === 'back') { this.mapMode = false; this.key = ''; return; }
    if (app === 'gps') {
      if (i !== undefined) this.gpsI = +i;
      else this.gpsI = this.gpsI + 1 >= this.gps.length ? -1 : this.gpsI + 1;
      const g = this.gps[this.gpsI];
      this.act('gps', g ? { p: g.p, label: g.name } : null);
      return;
    }
    this.act(app);
  }
  gpsTarget() { return this.gps[this.gpsI] || null; }
  gpsArrived() { this.gpsI = -1; }
  // ---------------------------------------------------------------- PC
  isOpen() { return !this.el.classList.contains('hidden'); }
  open() { this.el.classList.remove('hidden'); this.render(true); if (document.pointerLockElement) document.exitPointerLock(); }
  close() { if (!this.isOpen()) return; this.el.classList.add('hidden'); if (this.onClose) this.onClose(); }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  render(force) {
    if (!this.isOpen()) return;
    const d = this.data(), key = JSON.stringify(d) + this.gpsI;
    if (!force && key === this.pcKey) return; this.pcKey = key;
    const ms = (d.missions || []).map(m => `<div class="ph-m ${m.done ? 'done' : ''}"><span>${m.done ? '✔ ' : ''}${m.text}</span><b>${m.done ? '' : m.prog + '/' + m.goal}</b></div>`).join('');
    const g = this.gpsTarget();
    this.el.innerHTML = `
      <div class="ph-top"><span>${d.time}</span><span>📶 CITY CHAOS</span><button data-x>✖</button></div>
      <div class="ph-money"><div><small>CASH</small><b>$${d.cash.toLocaleString()}</b></div><div><small>🏦 SAVINGS</small><b>$${d.bank.toLocaleString()}</b></div><div><small>LEVEL</small><b>⭐ ${d.lvl}</b></div></div>
      <div class="ph-xp"><i style="width:${Math.round(d.frac * 100)}%"></i></div>
      ${d.task ? `<div class="ph-task">${d.task}</div>` : ''}
      <h5>📋 TODAY</h5>${ms}
      <h5>⭐ THIS WEEK: ${d.weeklyDone}/${d.weeklyTotal} done</h5>
      ${d.gifts ? `<h5>🎁 GIFTS FOUND TODAY: ${d.gifts}</h5>` : ''}
      <div class="ph-apps">
        <button data-app="car" class="${d.hasCar ? '' : 'off'}">🚗<small>Call my car</small></button>
        <button data-app="radio" class="${d.inCar ? '' : 'off'}">📻<small>${d.radio || 'Radio'}</small></button>
        <button data-app="wave">👋<small>Wave</small></button>
        <button data-app="gps" class="${g ? 'on' : ''}">📍<small>${g ? 'GPS: ' + g.name.split(' ').slice(1).join(' ') : 'GPS off'}</small></button>
        <button data-app="map">🗺️<small>City map (M)</small></button>
      </div>
      <div class="ph-gps">${this.gps.map((p, i) => `<button data-app="gps" data-i="${i}" class="${i === this.gpsI ? 'on' : ''}">${p.name}</button>`).join('')}<button data-app="gps" data-i="-1">✖ off</button></div>
      <small class="ph-hint">P or Esc to put the phone away</small>`;
  }
  // ---------------------------------------------------------------- VR
  // call every frame in VR: shows the phone when you look at your left wrist, taps with the right hand
  updateVR(leftGrip, rightGrip, head, dt) {
    if (!leftGrip) { this.mesh.visible = false; return false; }
    if (this.mesh.parent !== leftGrip) { leftGrip.add(this.mesh); this.mesh.position.set(0.05, 0.0, 0.13); this.mesh.rotation.set(0, Math.PI / 2, 0); this.mesh.rotateZ(-Math.PI / 2); }   // on the inner side of your left wrist: roll your wrist to look at it
    const wp = this.mesh.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.getWorldQuaternion(new THREE.Quaternion()));
    const toHead = head.clone().sub(wp), dist = toHead.length(); toHead.normalize();
    this.lastDot = n.dot(toHead);
    const looking = this.lastDot > (this.vrShown ? 0.45 : 0.62) && dist < 0.65;
    this.vrShown = looking; this.mesh.visible = looking;
    if (!looking) return false;
    this.drawVR();
    // tap: right hand (controller grip) close to the screen over a button
    if (rightGrip) {
      const rp = rightGrip.getWorldPosition(new THREE.Vector3());
      const local = this.mesh.worldToLocal(rp.clone());
      const W = 0.15, H = 0.15 * 820 / 512;
      if (Math.abs(local.z) < 0.035 && Math.abs(local.x) < W / 2 && Math.abs(local.y) < H / 2) {
        const u = (local.x / W + 0.5) * 512, v = (0.5 - local.y / H) * 820;
        const b = this.buttons.find(q => u >= q.x && u <= q.x + q.w && v >= q.y && v <= q.y + q.h);
        const t = performance.now();
        if (b && t - this.tapAt > 700) { this.tapAt = t; this.tap(b.app, undefined, true); this.key = ''; return b.app; }
      }
    }
    return true;
  }
  drawVR() {
    const d = this.data(), g = this.gpsTarget(), key = JSON.stringify(d) + this.gpsI + (this.mapMode ? 'map' + Math.floor(performance.now() / 250) : '');
    if (key === this.key) return; this.key = key;
    const x = this.x, w = 512, h = 820; x.clearRect(0, 0, w, h);
    x.fillStyle = INK; roundRect(x, 0, 0, w, h, 48); x.fill();
    x.fillStyle = '#2a1f5f'; roundRect(x, 14, 14, w - 28, h - 28, 38); x.fill();
    txt(x, d.time, 40, 52, 30, '#ffd23f'); txt(x, '📶 CITY CHAOS', w - 40, 52, 24, '#c9c3ff', 'right');
    if (this.mapMode) {   // 🗺️ the whole city on your wrist
      txt(x, '🗺️ CITY MAP', 40, 104, 30, '#fff');
      if (g) txt(x, fit(x, '📍 ' + g.name.split(' ').slice(1).join(' '), 220, 22), w - 40, 104, 22, '#c9a6ff', 'right');
      const ms = w - 40;
      if (!this.mapC) { this.mapC = document.createElement('canvas'); this.mapC.width = this.mapC.height = ms; }
      if (this.drawMap) this.drawMap(this.mapC.getContext('2d'), ms);
      x.save(); roundRect(x, 20, 130, ms, ms, 24); x.clip(); x.drawImage(this.mapC, 20, 130); x.restore();
      this.buttons = [{ app: 'back', x: 30, y: 130 + ms + 22, w: w - 60, h: 96 }];
      x.fillStyle = '#ff4fa3'; roundRect(x, 30, 130 + ms + 22, w - 60, 96, 26); x.fill();
      txt(x, '◀ BACK', w / 2, 130 + ms + 70, 34, '#fff', 'center');
      this.tex.needsUpdate = true; return;
    }
    txt(x, `$${d.cash.toLocaleString()}`, 40, 112, 50, '#5dff9b'); txt(x, `🏦 $${d.bank.toLocaleString()}`, w - 40, 112, 30, '#7cc4ff', 'right');
    txt(x, `⭐ LV ${d.lvl}`, 40, 162, 28, '#ffd23f');
    x.fillStyle = '#0006'; roundRect(x, 170, 152, w - 210, 20, 10); x.fill(); x.fillStyle = '#ffd23f'; roundRect(x, 170, 152, Math.max(14, (w - 210) * d.frac), 20, 10); x.fill();
    let y = 210;
    if (d.task) { x.fillStyle = '#00b4d8'; roundRect(x, 30, y - 24, w - 60, 48, 14); x.fill(); txt(x, fit(x, d.task, w - 90, 24), 46, y, 24); y += 62; }
    txt(x, '📋 TODAY', 40, y, 26, '#ffd23f'); y += 38;
    for (const m of (d.missions || []).slice(0, 3)) { txt(x, fit(x, (m.done ? '✔ ' : '') + m.text, w - 150, 22), 44, y, 22, m.done ? '#5dff9b' : '#fff'); if (!m.done) txt(x, `${m.prog}/${m.goal}`, w - 40, y, 22, '#ffd23f', 'right'); y += 34; }
    txt(x, `⭐ WEEK: ${d.weeklyDone}/${d.weeklyTotal}${d.gifts ? `   🎁 ${d.gifts}` : ''}`, 40, y + 8, 24, '#ffd23f'); y += 56;
    // apps
    this.buttons = [];
    const apps = [['car', '🚗', 'CAR', d.hasCar], ['radio', '📻', d.radio ? d.radio.split(' ')[0] : 'RADIO', d.inCar], ['wave', '👋', 'WAVE', true], ['gps', '📍', g ? g.name.split(' ').slice(1).join(' ').slice(0, 8) : 'GPS', true], ['map', '🗺️', 'MAP', true]];
    const bw = (w - 60 - 2 * 18) / 3, bh = 112;
    apps.forEach(([app, icon, label, on], i) => {
      const bx = 30 + (i % 3) * (bw + 18), by = y + Math.floor(i / 3) * (bh + 18);
      x.fillStyle = on ? (app === 'gps' && g ? '#8338ec' : '#ff4fa3') : '#4a4560'; roundRect(x, bx, by, bw, bh, 26); x.fill();
      txt(x, icon, bx + bw / 2, by + 44, 44, '#fff', 'center'); txt(x, fit(x, label, bw - 12, 20), bx + bw / 2, by + 90, 20, '#fff', 'center');
      this.buttons.push({ app, x: bx, y: by, w: bw, h: bh });
    });
    txt(x, 'tap an app with your right hand', w / 2, h - 40, 20, '#c9c3ff', 'center');
    this.tex.needsUpdate = true;
  }
}
