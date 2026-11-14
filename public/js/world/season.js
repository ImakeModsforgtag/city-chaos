// CITY CHAOS - the holiday event (client): falling snow, a frosty sky, a giant decorated tree on the plaza,
// snowmen, and the 🎁 gifts hidden around the city (open them with E / grip).
import * as THREE from 'three';
import { GIFT_RANGE } from '/shared/season.js';

const TREE = [38, -26];
const SNOWMEN = [[-80, -22], [-22, 30], [80, 34], [22, -78], [-78, 80]];
const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
export class SeasonView {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.on = false; this.gifts = []; this.got = new Set();
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    const ground = (x, z) => { const d = world.raycast(x, 30, z, 0, -1, 0, 40); return Number.isFinite(d) ? 30 - d : 0.15; };
    // snow: one points cloud that follows the camera
    const N = 1600, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 70; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const fc = document.createElement('canvas'); fc.width = fc.height = 32; const fx = fc.getContext('2d'); const grd = fx.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); fx.fillStyle = grd; fx.fillRect(0, 0, 32, 32);
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, map: new THREE.CanvasTexture(fc), transparent: true, opacity: 0.95, depthWrite: false }));
    this.snow.frustumCulled = false; this.root.add(this.snow);
    // the big tree
    const t = new THREE.Group(), ty = ground(...TREE); t.position.set(TREE[0], ty, TREE[1]); this.root.add(t);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 8), L(0x6d4c41)); trunk.position.y = 0.7; t.add(trunk);
    const green = L(0x1b8a4e);
    [[2.6, 2.4, 2.2], [2.1, 2.2, 3.7], [1.6, 2.0, 5.1], [1.05, 1.7, 6.3]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), green); c.position.y = y; t.add(c); });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xffd23f })); star.position.y = 7.45; t.add(star); this.star = star;
    this.bulbs = [];
    const cols = [0xff3b4e, 0x3a86ff, 0xffd23f, 0x2ec27e, 0xff4fa3];
    for (let i = 0; i < 36; i++) { const y = 1.6 + (i / 36) * 5, r = 2.5 * (1 - (y - 1.4) / 6.3) + 0.1, a = i * 2.4; const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: cols[i % 5] })); b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); t.add(b); this.bulbs.push(b); }
    // presents under the tree (decoration)
    for (const [dx, dz, c] of [[1.4, 0.6, 0xff3b4e], [-1.2, 1.0, 0x3a86ff], [0.3, -1.5, 0xffd23f]]) { const p = this.giftMesh(c); p.position.set(dx, 0, dz); t.add(p); }
    // snowmen
    for (const [x, z] of SNOWMEN) {
      const s = new THREE.Group(), y = ground(x, z); s.position.set(x, y, z); this.root.add(s);
      const w = L(0xf5f7ff);
      [[0.55, 0.5], [0.4, 1.25], [0.28, 1.8]].forEach(([r, yy]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), w); b.position.y = yy; s.add(b); });
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), L(0xff7a1a)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.8, -0.32); s.add(nose);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), L(0x212121)); hat.position.y = 2.15; s.add(hat);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 14), L(0xd62828)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.55; s.add(scarf);
    }
    this.giftRoot = new THREE.Group(); this.root.add(this.giftRoot);
  }
  giftMesh(color) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), L(color)); box.position.y = 0.25; g.add(box);
    const rib = L(0xffffff);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.1), rib); r1.position.y = 0.25; g.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.62), rib); r2.position.y = 0.25; g.add(r2);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 12), rib); bow.position.y = 0.55; g.add(bow);
    return g;
  }
  set(m) {
    this.on = !!m.on; this.root.visible = this.on;
    this.applySky(this.on);
    while (this.giftRoot.children.length) this.giftRoot.remove(this.giftRoot.children[0]);
    this.gifts = []; this.got = new Set(m.got || []);
    if (!this.on) return;
    const cols = [0xff3b4e, 0x3a86ff, 0x2ec27e, 0xff4fa3, 0xffd23f, 0x8338ec];
    for (const [id, x, y, z] of m.gifts) {
      const mesh = this.giftMesh(cols[id % cols.length]); mesh.position.set(x, y, z); this.giftRoot.add(mesh);
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; mesh.add(glow);
      mesh.visible = !this.got.has(id);
      this.gifts.push({ id, x, y, z, mesh });
    }
  }
  applySky(on) {
    const s = this.scene;
    if (!this.skySaved) this.skySaved = { bg: s.background && s.background.clone ? s.background.clone() : null, fog: s.fog ? s.fog.color.clone() : null, near: s.fog && s.fog.near, far: s.fog && s.fog.far };
    const sky = s.getObjectByName('skyDome'); if (sky) sky.visible = !on;   // grey winter sky: hide the blue dome, show the grey background
    if (on) { if (s.background && s.background.setHex) s.background.setHex(0xb8c8dc); if (s.fog) { s.fog.color.setHex(0xe8eef6); s.fog.near = 60; s.fog.far = 330; } }
    else if (this.skySaved) { if (this.skySaved.bg && s.background.copy) s.background.copy(this.skySaved.bg); if (s.fog && this.skySaved.fog) { s.fog.color.copy(this.skySaved.fog); s.fog.near = this.skySaved.near; s.fog.far = this.skySaved.far; } }
  }
  opened(id) { this.got.add(id); const g = this.gifts.find(q => q.id === id); if (g) g.mesh.visible = false; }
  count() { return { got: this.gifts.filter(g => this.got.has(g.id)).length, total: this.gifts.length }; }
  near(pos) { let best = null, bd = GIFT_RANGE; for (const g of this.gifts) { if (this.got.has(g.id)) continue; const d = Math.hypot(pos.x - g.x, pos.z - g.z); if (d < bd && Math.abs(pos.y - g.y) < 2.2) { bd = d; best = g; } } return best; }
  update(dt, t, cam) {
    if (!this.on) return;
    const p = this.snow.geometry.attributes.position, a = p.array;
    this.snow.position.set(cam.x, Math.max(0, cam.y - 8), cam.z);
    for (let i = 0; i < a.length; i += 3) { a[i + 1] -= dt * (1.3 + (i % 7) * 0.12); a[i] += Math.sin(t + i) * dt * 0.25; if (a[i + 1] < 0) a[i + 1] += 30; }
    p.needsUpdate = true;
    this.star.rotation.y = t; const k = Math.floor(t * 2);
    this.bulbs.forEach((b, i) => b.visible = (i + k) % 3 !== 0);
    for (const g of this.gifts) if (g.mesh.visible) { g.mesh.rotation.y = t * 0.8 + g.id; g.mesh.position.y = g.y + Math.abs(Math.sin(t * 2 + g.id)) * 0.12; }
  }
}
