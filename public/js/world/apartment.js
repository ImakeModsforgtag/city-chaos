// CITY CHAOS - apartments (client): pictures + lamp in every unit, and the trophy shelf of whoever is home
// (gold bars for heists, race cups, a boss crown, a police badge, a gang flag, toy versions of your cars, a plaque).
import * as THREE from 'three';
import { textCanvas } from '../engine/geo.js';
import { UNITS, APT, aptAt } from '/shared/apartment.js';
import { GANGS } from '/shared/turf.js';
import { showCar } from '../vehicles/cars.js';
import { carCode } from '/shared/garage.js';
import { fmtRace } from '/shared/races.js';

const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const gold = L(0xffd23f, { emissive: 0x4a3600 }), silver = L(0xcfd8dc, { emissive: 0x202020 });
function plane(text, w, h, opt) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(textCanvas(text, opt)), transparent: true })); return m; }

export class AptView {
  constructor(scene) {
    this.scene = scene; this.shelves = UNITS.map(() => null); this.key = UNITS.map(() => '');
    this.light = new THREE.PointLight(0xfff3d6, 1.4, 16, 1.2); this.light.visible = false; scene.add(this.light);
    for (const u of UNITS) {
      const g = new THREE.Group(); scene.add(g);
      // "window" with the city skyline + a framed poster + a ceiling lamp
      const win = plane('🌆  CHAOS CITY  🌃', 3.2, 1.4, { w: 640, h: 280, bg: '#3a2a6b', fg: '#ffd23f', font: 'bold 64px Trebuchet MS, sans-serif', radius: 12 });
      win.position.set(u.x1 - 0.02, u.y + 1.9, u.z0 + 4); win.rotation.y = -Math.PI / 2; g.add(win);
      const tv = plane('📺 CHAOS NEWS', 2.1, 1.1, { w: 420, h: 220, bg: '#0d47a1', fg: '#ffffff', font: 'bold 52px Trebuchet MS, sans-serif', radius: 6 });
      tv.position.set(u.x0 + 0.17, u.y + 1.45, u.z0 + 5.45); tv.rotation.y = Math.PI / 2; g.add(tv);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3d6 })); lamp.position.set((u.x0 + u.x1) / 2, u.y + APT.h - 0.3, (u.z0 + u.z1) / 2); g.add(lamp);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.08), L(0x6d4c41)); door.position.set(u.door[0], u.y + 1.15, u.z1 - 0.05); g.add(door);
      const sign = plane('🚪 EXIT', 1, 0.3, { w: 256, h: 80, bg: '#2e7d32', fg: '#ffffff', font: 'bold 44px Trebuchet MS, sans-serif', radius: 10 }); sign.position.set(u.door[0], u.y + 2.5, u.z1 - 0.1); sign.rotation.y = Math.PI; g.add(sign);
    }
  }
  set(units) {
    units.forEach((u, i) => {
      const key = u ? JSON.stringify(u) : '';
      if (key === this.key[i]) return; this.key[i] = key;
      if (this.shelves[i]) { this.scene.remove(this.shelves[i]); this.shelves[i] = null; }
      if (u) this.shelves[i] = this.buildShelf(UNITS[i], u[1], u[2] || {});
    });
  }
  buildShelf(U, name, t) {
    const g = new THREE.Group(), y = U.y + 0.9, z = U.z0 + 0.33; this.scene.add(g);
    let x = U.x0 + 0.6;
    const put = (obj, w) => { obj.position.x += x + w / 2; obj.position.y += y; obj.position.z += z; g.add(obj); x += w + 0.15; };
    // gold bars: one per heist (up to 6)
    if (t.heists) { const s = new THREE.Group(); for (let i = 0; i < Math.min(6, t.heists); i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.13), gold); b.position.set((i % 3) * 0.28 - 0.28, 0.045 + Math.floor(i / 3) * 0.09, 0); s.add(b); } put(s, 0.85); }
    // race cup
    if (t.raceWins) { const c = new THREE.Group(); const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.06, 0.2, 12), silver); cup.position.y = 0.3; c.add(cup); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), silver); st.position.y = 0.13; c.add(st); const bs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), L(0x212121)); bs.position.y = 0.03; c.add(bs); put(c, 0.3); }
    // boss crown
    if (t.bosses) { const c = new THREE.Group(); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10, 1, true), gold); band.position.y = 0.06; c.add(band); for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), gold); const a = i / 5 * Math.PI * 2; sp.position.set(Math.sin(a) * 0.12, 0.15, Math.cos(a) * 0.12); c.add(sp); } put(c, 0.3); }
    // police badge: robbers stopped
    if (t.crooks) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 6), gold); b.rotation.x = Math.PI / 2; b.position.y = 0.15; put(b, 0.26); }
    // gang flag
    if (t.turfs && GANGS[t.gang]) { const f = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), silver); pole.position.y = 0.25; f.add(pole); const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.17), L(GANGS[t.gang].hex, { side: THREE.DoubleSide })); fl.position.set(0.14, 0.4, 0); f.add(fl); put(f, 0.32); }
    // weekly stars (one per week you finished all 4 challenges, up to 5)
    if (t.weeklies) { const s = new THREE.Group(); for (let i = 0; i < Math.min(5, t.weeklies); i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), gold); st.scale.set(1, 1, 0.4); st.position.set(i * 0.14 - 0.28, 0.12 + (i % 2) * 0.05, 0); s.add(st); } put(s, 0.7); }
    // toy cars
    for (const m of t.cars || []) { const c = showCar(carCode(m, 1)); c.scale.setScalar(0.11); c.rotation.y = Math.PI / 2; put(c, 0.5); }
    // plaque on the wall above the shelf
    const lines = [`🏆 ${name} · LEVEL ${t.lvl || 1}`, `💰 ${t.heists || 0} heists · 🏁 ${t.raceWins || 0} race wins · 👑 ${t.bosses || 0} bosses`, `🦹 ${t.crooks || 0} robbers stopped · 🏴 ${t.turfs || 0} turf · 💼 ${t.jobs || 0} jobs`,
      t.best && (t.best.loop || t.best.tour) ? `⏱ best: ${t.best.loop ? 'CITY LOOP ' + fmtRace(t.best.loop) : ''} ${t.best.tour ? 'GRAND TOUR ' + fmtRace(t.best.tour) : ''}` : '⏱ no race times yet'];
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 300; const c2 = cv.getContext('2d');
    c2.fillStyle = '#4e342e'; c2.fillRect(0, 0, 1024, 300); c2.strokeStyle = '#ffd23f'; c2.lineWidth = 12; c2.strokeRect(6, 6, 1012, 288);
    c2.fillStyle = '#ffd23f'; c2.font = 'bold 56px Trebuchet MS, sans-serif'; c2.textAlign = 'center'; c2.fillText(lines[0], 512, 76);
    c2.fillStyle = '#ffffff'; c2.font = 'bold 38px Trebuchet MS, sans-serif'; lines.slice(1).forEach((l, i) => c2.fillText(l, 512, 140 + i * 56));
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.23), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
    pl.position.set((U.x0 + U.x1) / 2, U.y + 2.0, U.z0 + 0.02); g.add(pl);
    return g;
  }
  // light up the unit you're in
  update(pos) {
    const i = aptAt(pos.x, pos.y, pos.z);
    this.here = i;
    if (i >= 0) { const u = UNITS[i]; this.light.position.set((u.x0 + u.x1) / 2, u.y + APT.h - 0.6, (u.z0 + u.z1) / 2); this.light.visible = true; }
    else this.light.visible = false;
  }
  // E / grip prompts inside: the exit door and the bed
  prompt(pos, vr) {
    if (this.here === undefined || this.here < 0) return null;
    const u = UNITS[this.here], K = vr ? 'Squeeze grip' : 'Press E';
    if (Math.hypot(pos.x - u.door[0], pos.z - u.door[2]) < 1.8) return { text: `🚪 ${K} to go back to the city`, act: 'aptLeave' };
    if (Math.hypot(pos.x - u.bed[0], pos.z - u.bed[2]) < APT.range) return { text: `😴 ${K} to take a nap (full health)`, act: 'aptRest' };
    return null;
  }
}
