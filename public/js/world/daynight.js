// CITY CHAOS - day and night (client). Moves the sun, fades the sky and fog to night, turns on the streetlights
// (glows on every lamp), lights up the windows, shows stars and gives cars headlights.
import * as THREE from 'three';
import { gameHour, daylight, dusk } from '/shared/daynight.js';

const C = (h) => new THREE.Color(h);
const DAY = { bg: C(0x8fd3ff), fog: C(0xcdebff), sky: C(0xffffff), sun: C(0xfff0d2), hemiS: C(0xd6ecff), hemiG: C(0xffd2a6) };
const WINTER = { bg: C(0xb8c8dc), fog: C(0xe8eef6) };
const NIGHT = { bg: C(0x0b1030), fog: C(0x141a3a), sky: C(0x1a2350), sun: C(0x8fa8ff), hemiS: C(0x3b4a8a), hemiG: C(0x2a2035) };
const DUSK = { bg: C(0xffa36b), fog: C(0xffc29a), sky: C(0xffb08a), sun: C(0xff9a5a) };
function glowTex(r, g, b) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, `rgba(${r},${g},${b},1)`); grd.addColorStop(0.25, `rgba(${r},${g},${b},0.55)`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
export class DayNight {
  constructor({ scene, sun, hemi, map, city }) {
    Object.assign(this, { scene, sun, hemi });
    this.offset = 0; this.fixed = null; this.hour = 12; this.f = 1;
    this.sky = scene.getObjectByName('skyDome');
    this.clouds = []; const sg = scene.getObjectByName('sky'); if (sg) sg.traverse(o => { if (o.isMesh && o !== this.sky && o.material && o.material.color) this.clouds.push({ m: o.material, c: o.material.color.clone() }); });
    // windows: every glass material in the city glows warm at night
    this.glass = new Set(); for (const g of city.extra || []) if (g) g.traverse(o => { if (o.isMesh && o.material && o.material.isMeshPhongMaterial && o.material.specular && o.material.specular.getHex() === 0x8fa6c4) this.glass.add(o.material); });
    // streetlights: one additive glow per lamp head
    const dirv = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }, pts = [];
    for (const p of map.props || []) {
      if (p.type !== 'lamp') continue;
      const top = p.y + (p.short ? 3.2 : 5.5), [dx, dz] = dirv[p.dir] || [0, -1];
      if (p.style === 'lantern') pts.push(p.x, top + 0.3, p.z);
      else if (p.style === 'deco') pts.push(p.x, top + 0.15, p.z);
      else pts.push(p.x + dx * 1.5, top - 0.3, p.z + dz * 1.5);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lampMat = new THREE.PointsMaterial({ size: 2.6, map: glowTex(255, 226, 150), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lamps = new THREE.Points(lg, this.lampMat); this.lamps.frustumCulled = false; scene.add(this.lamps);
    // pools of light under the lamps
    this.poolMat = new THREE.MeshBasicMaterial({ map: glowTex(255, 220, 140), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), this.poolMat, pts.length / 3);
    const m4 = new THREE.Matrix4(); for (let i = 0; i < pts.length / 3; i++) { m4.makeTranslation(pts[i * 3], 0.18, pts[i * 3 + 2]); pool.setMatrixAt(i, m4); }
    pool.frustumCulled = false; scene.add(pool); this.lampCount = pts.length / 3;
    // stars
    const sp = []; for (let i = 0; i < 700; i++) { const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3, r = 420; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sgm, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -9; scene.add(this.stars);
    // headlights (two glows in front of each nearby car)
    this.hlGeo = new THREE.BufferGeometry(); this.hlPos = new Float32Array(64 * 3); this.hlGeo.setAttribute('position', new THREE.BufferAttribute(this.hlPos, 3));
    this.hlMat = new THREE.PointsMaterial({ size: 1.4, map: glowTex(255, 248, 220), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.headlights = new THREE.Points(this.hlGeo, this.hlMat); this.headlights.frustumCulled = false; scene.add(this.headlights);
    this.tmp = new THREE.Color();
  }
  // the server's clock (ms) so everyone agrees on the time; fixed = a test override (hour)
  sync(serverMs, fixed) { this.offset = serverMs - Date.now(); this.fixed = fixed === undefined || fixed === null ? null : fixed; }
  now() { return this.fixed !== null ? this.fixed : gameHour(Date.now() + this.offset); }
  update(dt, cam, cars, winter) {
    const h = this.now(), f = daylight(h), k = dusk(h) * 0.85, n = 1 - f;
    this.hour = h; this.f = f;
    const mix = (a, b, c, out) => out.copy(a).lerp(b, n).lerp(c || a, c ? k * (1 - n * 0.5) : 0);
    const base = winter ? WINTER : DAY;
    mix(base.bg, NIGHT.bg, DUSK.bg, this.scene.background);
    if (this.scene.fog) mix(base.fog, NIGHT.fog, DUSK.fog, this.scene.fog.color);
    if (this.sky) mix(DAY.sky, NIGHT.sky, DUSK.sky, this.sky.material.color);
    for (const c of this.clouds) c.m.color.copy(c.c).lerp(NIGHT.sky, n * 0.85).lerp(DUSK.sky, k * 0.5);
    // sun: high at noon, low at dusk, a dim blue moon at night
    this.sun.intensity = 0.35 + 2.2 * f; mix(DAY.sun, NIGHT.sun, DUSK.sun, this.sun.color);
    this.hemi.intensity = 0.55 + 1.0 * f; this.hemi.color.copy(DAY.hemiS).lerp(NIGHT.hemiS, n); this.hemi.groundColor.copy(DAY.hemiG).lerp(NIGHT.hemiG, n);
    const night = Math.max(0, (0.65 - f) / 0.65);
    for (const m of this.glass) { m.emissive.setHex(0xffc864); m.emissiveIntensity = night * 0.6; }
    this.lampMat.opacity = night; this.poolMat.opacity = night * 0.55; this.starMat.opacity = Math.max(0, (0.4 - f) / 0.4) * (winter ? 0.4 : 1);
    this.stars.position.set(cam.x, 0, cam.z);
    // headlights on the 32 nearest cars
    this.hlMat.opacity = night;
    let i = 0;
    if (night > 0 && cars) {
      const list = [...cars.values()].filter(c => c.root && c.root.visible).sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z)).slice(0, 32);
      for (const c of list) {
        const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
        for (const s of [-0.7, 0.7]) { this.hlPos[i++] = c.x + fx * 2.35 + rx * s; this.hlPos[i++] = c.y + 0.75; this.hlPos[i++] = c.z + fz * 2.35 + rz * s; }
      }
    }
    this.hlGeo.setDrawRange(0, i / 3); this.hlGeo.attributes.position.needsUpdate = true;
  }
}
