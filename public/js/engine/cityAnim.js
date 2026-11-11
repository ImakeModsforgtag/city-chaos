// CITY CHAOS - animated city details. Repeated things use InstancedMesh (one draw call each):
// traffic light lamps, rooftop fans, antenna blinkers. A few one-off landmarks animate on their own.
import * as THREE from 'three';
import { signalState } from '/shared/cityKit.js';
import { GeoBatch, textCanvas } from './geo.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _c = new THREE.Color();
const LIT = { r: new THREE.Color(0xff2a2a), y: new THREE.Color(0xffc21a), g: new THREE.Color(0x33ff7a) };
const DIM = { r: new THREE.Color(0x3a1212), y: new THREE.Color(0x3a2e0c), g: new THREE.Color(0x0f3320) };

export class CityAnim {
  constructor(scene, map) {
    this.root = new THREE.Group(); this.root.name = 'city-anim'; scene.add(this.root);
    this.signals = []; this.fans = []; this.blinks = []; this.flags = []; this.spinners = []; this.neons = []; this.misc = [];
    this.built = false; this.lastSig = -1;
  }
  // ---------------------------------------------------------------- registration (called while the city is built)
  addSignal(x, y, z, axis, ix, iz) { this.signals.push({ x, y, z, axis, ix, iz }); }
  addFan(x, y, z) { this.fans.push({ x, y, z, a: Math.random() * 6, sp: 5 + Math.random() * 4 }); }
  addBlink(x, y, z, c) { this.blinks.push({ x, y, z, c, ph: Math.random() * 2 }); }
  addNeon(mesh) { this.neons.push({ m: mesh, ph: Math.random() * 10, base: mesh.material.color.clone() }); }
  addFlag(p) {
    const g = new THREE.PlaneGeometry(1.8, 1.1, 10, 4); g.translate(0.9, -0.55, 0);
    const cols = [], pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const stripe = Math.floor((pos.getY(i) + 1.1) / 0.22) % 2; _c.set(stripe ? p.c2 : p.c1); cols.push(_c.r, _c.g, _c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.position.set(p.x, p.y + 0.2, p.z); m.rotation.y = Math.random() * 6; this.root.add(m);
    this.flags.push({ m, base: Float32Array.from(pos.array), ph: Math.random() * 6 });
  }
  addDonut(p) {
    const g = new THREE.Group();
    const dough = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.6, 10, 20), new THREE.MeshLambertMaterial({ color: 0xe0a060 }));
    const icing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.62, 10, 20, Math.PI * 2), new THREE.MeshLambertMaterial({ color: 0xff6f91 }));
    icing.scale.set(1.02, 1.02, 0.7); icing.position.z = 0.16;
    g.add(dough, icing);
    const spr = [0xffffff, 0x7cf9ff, 0xffd54f, 0x76ff03], sb = new GeoBatch(), bg = new THREE.BoxGeometry(0.2, 0.06, 0.06);
    for (let i = 0; i < 26; i++) { const a = i * 0.83, r = 1.25 + Math.sin(i * 3.1) * 0.35; sb.geom(bg, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a * 2)), new THREE.Vector3(1, 1, 1)), spr[i % 4]); }
    g.add(new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    g.position.set(p.x, p.y + 2.6, p.z); this.root.add(g); this.spinners.push({ o: g, axis: 'y', sp: 0.6 });
  }
  addBillboard(p) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, p.h + 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0x263238 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ map: tex }));
    const g = new THREE.Group(); g.add(frame, screen); screen.position.z = 0.16;
    g.position.set(p.x, p.y + 1.8 + p.h / 2, p.z); g.rotation.y = p.yaw || 0; this.root.add(g);
    const slides = [['ELECTRO', 'NEW VR HEADSETS', '#0d1b6b', '#7cf9ff'], ['50% OFF', 'ALL TVs TODAY', '#c2185b', '#ffffff'], ['CITY CHAOS', 'NOW IN VR', '#1b5e20', '#ffeb3b'], ['DONUTS?', 'GO NORTH', '#ff6f91', '#ffffff']];
    this.misc.push({ k: 'tv', c, tex, slides, i: -1, next: 0 });
  }
  addRoofSign(p) {
    const tex = new THREE.CanvasTexture(textCanvas(p.text, { w: 1024, h: 192, bg: p.bg, fg: p.fg, font: 'bold 130px Trebuchet MS, sans-serif', border: '#222', radius: 30 })); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), mat); m.position.set(p.x, p.y + 0.6 + p.h / 2, p.z + s * 0.03); m.rotation.y = s > 0 ? 0 : Math.PI; this.root.add(m); }
    // chasing marquee bulbs along the bottom
    const n = 24, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), n * 2);
    for (let i = 0; i < n; i++) for (const s of [0, 1]) { _m.makeTranslation(p.x - p.w / 2 + 0.3 + (p.w - 0.6) * i / (n - 1), p.y + 0.7, p.z + (s ? -0.08 : 0.08)); bulbs.setMatrixAt(i * 2 + s, _m); bulbs.setColorAt(i * 2 + s, _c.set(0xffffff)); }
    this.root.add(bulbs); this.misc.push({ k: 'bulbs', m: bulbs, n });
  }
  addCrown(p) {
    const mats = [];
    for (let k = 0; k < 3; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x7cf9ff }); mats.push(mat);
      const y = p.y + 0.7 + k * 1.05, b = new GeoBatch();   // one glowing band around the crown = one mesh
      b.quad(p.x, y, p.z + p.d / 2 + 0.01, p.w + 0.04, 0.3, 'z', 1, 0xffffff); b.quad(p.x, y, p.z - p.d / 2 - 0.01, p.w + 0.04, 0.3, 'z', -1, 0xffffff);
      b.quad(p.x + p.w / 2 + 0.01, y, p.z, p.d + 0.04, 0.3, 'x', 1, 0xffffff); b.quad(p.x - p.w / 2 - 0.01, y, p.z, p.d + 0.04, 0.3, 'x', -1, 0xffffff);
      mat.vertexColors = true; this.root.add(new THREE.Mesh(b.build(), mat));
    }
    this.misc.push({ k: 'crown', mats });
  }
  addBeacon(p) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff1744, fog: false })); m.position.set(p.x, p.y, p.z); this.root.add(m); this.misc.push({ k: 'beacon', m }); }
  addUfo(p) {
    // hidden detail: a tiny UFO that circles the top of Chaos Tower now and then
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 6), new THREE.MeshLambertMaterial({ color: 0xb0bec5 })); disc.scale.y = 0.28;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x80deea, shininess: 90, transparent: true, opacity: 0.8 })); dome.position.y = 0.25;
    const alien = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0x76ff03 })); alien.position.y = 0.4;
    g.add(disc, dome, alien);
    const lb = new GeoBatch(), lg = new THREE.SphereGeometry(0.12, 6, 4);
    for (let k = 0; k < 8; k++) lb.geom(lg, new THREE.Matrix4().makeTranslation(Math.cos(k * Math.PI / 4) * 1.5, -0.05, Math.sin(k * Math.PI / 4) * 1.5), k % 2 ? 0xffeb3b : 0xff4081);
    g.add(new THREE.Mesh(lb.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    this.root.add(g); this.misc.push({ k: 'ufo', g, cx: p.x, cz: p.z, y: p.y + 14 });
  }
  addSiren(p) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0x9e9e9e })); base.position.set(p.x, p.y + 0.2, p.z);
    const spin = new THREE.Group(); spin.position.set(p.x, p.y + 0.6, p.z);
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), new THREE.MeshBasicMaterial({ color: 0xff1744 })); b.position.x = s * 0.25; spin.add(b); }
    this.root.add(base, spin); this.spinners.push({ o: spin, axis: 'y', sp: 3.5 });
  }
  addTank(x, y, z) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#4fc3f7'; g.fillRect(0, 0, 1024, 256); g.fillStyle = '#29b6f6'; g.fillRect(0, 200, 1024, 56);
    g.font = 'bold 84px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#0277bd';
    for (const cx of [256, 768]) { g.strokeText('CITY CHAOS', cx, 110, 460); g.fillStyle = '#ffffff'; g.fillText('CITY CHAOS', cx, 110, 460); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 4.4, 20, 1, true), new THREE.MeshLambertMaterial({ map: tex })); tank.position.set(x, y + 2.4, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.5, 20), new THREE.MeshLambertMaterial({ color: 0x0277bd })); roof.position.set(x, y + 5.35, z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd54f })); ball.position.set(x, y + 6.2, z);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 1.6, 0.6, 20), new THREE.MeshLambertMaterial({ color: 0x0288d1 })); bottom.position.set(x, y - 0.1, z);
    for (const o of [tank, roof, ball, bottom]) { o.castShadow = true; this.root.add(o); }
  }
  addSwings(p) {
    const seats = [];
    for (const dx of [-0.8, 0.8]) {
      const piv = new THREE.Group(); piv.position.set(p.x + dx, p.y + 2.35, p.z);
      const b = new GeoBatch(); b.box(-0.235, -1.8, -0.015, -0.205, 0, 0.015, 0x9e9e9e); b.box(0.205, -1.8, -0.015, 0.235, 0, 0.015, 0x9e9e9e); b.box(-0.275, -1.83, -0.125, 0.275, -1.77, 0.125, 0x1e88e5);
      piv.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      this.root.add(piv); seats.push({ piv, ph: dx > 0 ? 1.3 : 0 });
    }
    this.misc.push({ k: 'swings', seats });
  }
  addFountain(p) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.55, depthWrite: false });
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 10, 1, true), mat); jet.position.set(p.x, p.y + 4.1, p.z);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6), mat); top.position.set(p.x, p.y + 5.1, p.z);
    const fall = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.7, 2.0, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })); fall.position.set(p.x, p.y + 1.9, p.z);
    const rings = [];
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(p.x, p.y + 0.69, p.z); this.root.add(r); rings.push({ r, ph: k / 3 }); }
    this.root.add(jet, top, fall);
    this.misc.push({ k: 'fountain', jet, top, fall, rings });
  }
  addDuck(x, y, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffeb3b })); body.scale.set(1.2, 0.8, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), body.material); head.position.set(0.2, 0.25, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), new THREE.MeshLambertMaterial({ color: 0xff7043 })); beak.rotation.z = -Math.PI / 2; beak.position.set(0.4, 0.23, 0);
    g.add(body, head, beak); g.position.set(x, y + 0.12, z); this.root.add(g); this.misc.push({ k: 'duck', g, x, z });
  }

  // ---------------------------------------------------------------- build the instanced meshes (once, after registration)
  build() {
    this.built = true;
    if (this.signals.length) {
      const geo = new THREE.SphereGeometry(0.13, 8, 6), n = this.signals.length;
      this.lamps = {};
      for (const [k, dy] of [['r', 0.37], ['y', 0], ['g', -0.37]]) {
        const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
        this.signals.forEach((s, i) => { _m.makeTranslation(s.x, s.y + dy, s.z); im.setMatrixAt(i, _m); im.setColorAt(i, DIM[k]); });
        this.root.add(im); this.lamps[k] = im;
      }
    }
    if (this.fans.length) {
      const b = new GeoBatch(); b.box(-0.42, -0.01, -0.06, 0.42, 0.01, 0.06, 0x546e7a); b.box(-0.06, -0.01, -0.42, 0.06, 0.01, 0.42, 0x546e7a); b.box(-0.08, -0.04, -0.08, 0.08, 0.04, 0.08, 0x263238);
      this.fanMesh = new THREE.InstancedMesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), this.fans.length);
      this.root.add(this.fanMesh);
    }
    if (this.blinks.length) {
      this.blinkMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.blinks.length);
      this.blinks.forEach((b, i) => { _m.makeTranslation(b.x, b.y, b.z); this.blinkMesh.setMatrixAt(i, _m); this.blinkMesh.setColorAt(i, _c.set(b.c)); });
      this.root.add(this.blinkMesh);
    }
  }

  // ---------------------------------------------------------------- per frame
  update(tServer, dt, camPos) {
    if (!this.built) this.build();
    const t = performance.now() / 1000;
    // traffic lights (4x a second is plenty)
    if (this.lamps && Math.floor(tServer * 4) !== this.lastSig) {
      this.lastSig = Math.floor(tServer * 4);
      this.signals.forEach((s, i) => { const st = signalState(s.ix, s.iz, s.axis, tServer); for (const k of ['r', 'y', 'g']) this.lamps[k].setColorAt(i, st === k ? LIT[k] : DIM[k]); });
      for (const k of ['r', 'y', 'g']) this.lamps[k].instanceColor.needsUpdate = true;
    }
    if (this.fanMesh) {
      this.fans.forEach((f, i) => { f.a += f.sp * dt; _q.setFromEuler(_e.set(0, f.a, 0)); this.fanMesh.setMatrixAt(i, _m.compose(_p.set(f.x, f.y, f.z), _q, _s)); });
      this.fanMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.blinkMesh) {
      this.blinks.forEach((b, i) => this.blinkMesh.setColorAt(i, ((t + b.ph) % 2) < 0.4 ? _c.set(b.c) : _c.set(0x330000)));
      this.blinkMesh.instanceColor.needsUpdate = true;
    }
    for (const f of this.flags) {
      if (camPos && f.m.position.distanceTo(camPos) > 120) continue;
      const pos = f.m.geometry.attributes.position, a = pos.array;
      for (let i = 0; i < pos.count; i++) { const x = f.base[i * 3]; a[i * 3 + 2] = Math.sin(x * 2.6 - t * 4 + f.ph) * 0.16 * (x / 1.8); }
      pos.needsUpdate = true; f.m.rotation.y += Math.sin(t * 0.3 + f.ph) * 0.002;
    }
    for (const s of this.spinners) s.o.rotation[s.axis] += s.sp * dt;
    for (const n of this.neons) {
      const flick = Math.sin(t * 23 + n.ph) > 0.985 ? 0.45 : 1, pulse = 0.88 + Math.sin(t * 2.2 + n.ph) * 0.12;
      n.m.material.color.copy(n.base).multiplyScalar(flick * pulse);
    }
    for (const m of this.misc) {
      if (m.k === 'tv' && t > m.next) {
        m.i = (m.i + 1) % m.slides.length; m.next = t + 3;
        const [a, b, bg, fg] = m.slides[m.i], g = m.c.getContext('2d');
        g.fillStyle = bg; g.fillRect(0, 0, 512, 192); g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < 192; y += 6) g.fillRect(0, y, 512, 2);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.font = 'bold 74px Trebuchet MS, sans-serif'; g.fillText(a, 256, 74); g.font = 'bold 36px Trebuchet MS, sans-serif'; g.fillText(b, 256, 148);
        m.tex.needsUpdate = true;
      } else if (m.k === 'bulbs') {
        const on = Math.floor(t * 8);
        for (let i = 0; i < m.n; i++) for (const s of [0, 1]) m.m.setColorAt(i * 2 + s, (i + on) % 3 === 0 ? _c.set(0xffffff) : _c.set(0xffb300));
        m.m.instanceColor.needsUpdate = true;
      } else if (m.k === 'crown') m.mats.forEach((mat, k) => mat.color.setHSL(((t * 0.06 + k * 0.12) % 1), 0.85, 0.62));
      else if (m.k === 'beacon') m.m.visible = (t % 1.6) < 0.5;
      else if (m.k === 'ufo') {
        const a = t * 0.35, show = Math.sin(t * 0.05) > 0.2;   // only around part of the time
        m.g.visible = show; m.g.position.set(m.cx + Math.cos(a) * 11, m.y + Math.sin(t * 1.3) * 0.6, m.cz + Math.sin(a) * 11); m.g.rotation.y = t * 1.6;
      } else if (m.k === 'swings') for (const s of m.seats) s.piv.rotation.x = Math.sin(t * 1.7 + s.ph) * 0.45;
      else if (m.k === 'fountain') {
        const k = 1 + Math.sin(t * 3) * 0.08; m.jet.scale.set(1, k, 1); m.top.scale.setScalar(0.9 + Math.sin(t * 5) * 0.15); m.fall.rotation.y = t * 0.6;
        for (const r of m.rings) { const u = (t * 0.5 + r.ph) % 1; r.r.scale.setScalar(1.2 + u * 1.8); r.r.material.opacity = 0.5 * (1 - u); }
      } else if (m.k === 'duck') { const a = t * 0.12; m.g.position.x = m.x + Math.cos(a) * 3; m.g.position.z = m.z + Math.sin(a) * 2; m.g.rotation.y = -a - Math.PI / 2; m.g.position.y += Math.sin(t * 2.4) * 0.0015; }
    }
  }
}
