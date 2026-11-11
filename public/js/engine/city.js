// Turns the shared map data into low-poly cartoon meshes.
// Performance: everything is merged into a few vertex-colored meshes PER CITY BLOCK ("chunk"), so the GPU can skip
// blocks that are behind you (frustum culling) and small details far away are switched off (level of detail).
import * as THREE from 'three';
import { GeoBatch, trs, MAT, textCanvas } from './geo.js';
import { decorateCity } from './cityDecor.js';
import { CityAnim } from './cityAnim.js';

const DETAIL_FAR = 95;   // meters: beyond this, small details (benches, sills, frames...) aren't drawn

// shared materials
export const CITY_MAT = {
  solid: () => MAT.lambert(),
  flat: () => MAT.lambert({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  glow: () => MAT.basic(),
  glass: () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x8fa6c4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  detail: () => MAT.lambert({ side: THREE.DoubleSide }),
  water: () => new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.86, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
};
const KINDS = ['solid', 'flat', 'glow', 'glass', 'detail', 'water'];

// Splits geometry into chunks on a 56 m grid (one city block + its streets each)
export class Chunker {
  constructor(enabled = true) { this.enabled = enabled; this.cells = new Map(); }
  key(x, z) {
    if (!this.enabled) return 'all';
    const cx = Math.max(0, Math.min(3, Math.floor((x + 112) / 56))), cz = Math.max(0, Math.min(3, Math.floor((z + 112) / 56)));
    return cx + ',' + cz;
  }
  get(kind, x, z) {
    const k = (x === null ? 'global' : this.key(x, z)) + '|' + kind;
    let b = this.cells.get(k); if (!b) { b = new GeoBatch(); this.cells.set(k, b); }
    return b;
  }
  build(scene, groups) {
    const mats = {}; for (const k of KINDS) mats[k] = CITY_MAT[k]();
    let tris = 0;
    for (const [k, b] of this.cells) {
      if (!b.count) continue;
      const kind = k.split('|')[1];
      const m = new THREE.Mesh(b.build(), mats[kind]);
      m.name = 'city-' + k;
      if (kind === 'solid') { m.castShadow = true; m.receiveShadow = true; }
      else if (kind !== 'glow') m.receiveShadow = true;
      if (kind === 'detail') m.castShadow = true;
      groups[kind].add(m);
      tris += b.count / 3;
    }
    for (const k of KINDS) scene.add(groups[k]);
    return tris;
  }
}

export function buildCity(scene, map, opts = {}) {
  const ch = new Chunker(opts.chunks !== false);
  const groups = {}; for (const k of KINDS) { groups[k] = new THREE.Group(); groups[k].name = 'city-' + k; }

  // ---- boxes (collision shapes double as the basic look). Hidden ones (h / v:0) are drawn by props instead.
  for (const b of map.boxes) {
    if (b.h || b.v === 0) continue;
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const big = (x1 - x0) > 60 || (z1 - z0) > 60;
    const thin = (y1 - y0) < 0.06;
    const bt = ch.get(thin ? 'flat' : 'solid', big ? null : (x0 + x1) / 2, (z0 + z1) / 2);
    bt.box(x0, y0, z0, x1, y1, z1, b.c, { skipBottom: y0 <= 0.01 && y0 >= -0.6 });
  }

  // ---- legacy window stickers (still used by the prison)
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const WIN_COLORS = [0x9be7ff, 0xbdf0ff, 0xffe28a, 0x6fa8ff, 0xcfe8ff, 0xffd166];
  for (const w of map.windows || []) {
    const faces = [
      { axis: 'z', sign: -1, fixed: w.z0 - 0.03, a0: w.x0, a1: w.x1 }, { axis: 'z', sign: 1, fixed: w.z1 + 0.03, a0: w.x0, a1: w.x1 },
      { axis: 'x', sign: -1, fixed: w.x0 - 0.03, a0: w.z0, a1: w.z1 }, { axis: 'x', sign: 1, fixed: w.x1 + 0.03, a0: w.z0, a1: w.z1 }];
    const flat = ch.get('flat', (w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
    for (const f of faces) {
      const len = f.a1 - f.a0, n = Math.floor((len - 1.5) / 3); if (n < 1) continue;
      const start = f.a0 + (len - (n - 1) * 3) / 2;
      for (let i = 0; i < n; i++) for (let y = w.y0 + 0.8; y + 0.8 < w.y1; y += 3.2) {
        const a = start + i * 3, col = WIN_COLORS[Math.floor(rnd() * WIN_COLORS.length)];
        if (f.axis === 'z') { flat.quad(a, y, f.fixed, 1.55, 1.85, 'z', f.sign, 0xf7f1e3); flat.quad(a, y, f.fixed + f.sign * 0.01, 1.3, 1.6, 'z', f.sign, col); }
        else { flat.quad(f.fixed, y, a, 1.55, 1.85, 'x', f.sign, 0xf7f1e3); flat.quad(f.fixed + f.sign * 0.01, y, a, 1.3, 1.6, 'x', f.sign, col); }
      }
    }
  }

  // ---- props (classic ones live here; the overhaul ones in cityDecor)
  const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 7), cyl12 = new THREE.CylinderGeometry(1, 1, 1, 12);
  const ico = new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, 7);
  const torus = new THREE.TorusGeometry(1, 0.08, 6, 14), sphere = new THREE.SphereGeometry(1, 8, 6);
  const leaf = [0x4caf50, 0x66bb6a, 0x2e9e5b, 0x8bc34a, 0x43a047];
  const rest = [];
  for (const p of map.props) {
    const solid = ch.get('solid', p.x ?? null, p.z ?? 0), flat = ch.get('flat', p.x ?? null, p.z ?? 0), glow = ch.get('glow', p.x ?? null, p.z ?? 0), det = ch.get('detail', p.x ?? null, p.z ?? 0);
    switch (p.type) {
      case 'tree': drawTree(solid, p.x, p.y, p.z, p.s || 1, Math.floor((p.x * 13 + p.z * 7) % 5 + 5) % 5); break;
      case 'car': {
        const { x, y, z, rot } = p, L = 2.1, W = 1.0;
        const wheel = (dx, dz) => solid.geom(cyl12, trs(x + dx, y + 0.42, z + dz, rot ? Math.PI / 2 : 0, 0, rot ? 0 : Math.PI / 2, 0.42, 0.3, 0.42), 0x222222);
        if (rot) { for (const sx of [-1.3, 1.3]) for (const sz of [-1.02, 1.02]) wheel(sx, sz); } else { for (const sz of [-1.3, 1.3]) for (const sx of [-1.02, 1.02]) wheel(sx, sz); }
        const hx = rot ? L * 0.55 : W * 0.9, hz = rot ? W * 0.9 : L * 0.55;
        flat.quad(x, y + 1.5, z + hz + 0.02, hx * 1.7, 0.5, 'z', 1, 0x9be7ff); flat.quad(x, y + 1.5, z - hz - 0.02, hx * 1.7, 0.5, 'z', -1, 0x9be7ff);
        flat.quad(x + hx + 0.02, y + 1.5, z, hz * 1.7, 0.5, 'x', 1, 0x9be7ff); flat.quad(x - hx - 0.02, y + 1.5, z, hz * 1.7, 0.5, 'x', -1, 0x9be7ff);
        if (rot) { glow.box(x + 2.1, y + 0.7, z - 0.8, x + 2.15, y + 0.95, z - 0.4, 0xfff6c0); glow.box(x + 2.1, y + 0.7, z + 0.4, x + 2.15, y + 0.95, z + 0.8, 0xfff6c0); }
        else { glow.box(x - 0.8, y + 0.7, z + 2.1, x - 0.4, y + 0.95, z + 2.15, 0xfff6c0); glow.box(x + 0.4, y + 0.7, z + 2.1, x + 0.8, y + 0.95, z + 2.15, 0xfff6c0); }
        break;
      }
      case 'hoop':
        solid.geom(torus, trs(p.x, p.y, p.z + p.dir * 0.35, Math.PI / 2, 0, 0, 0.32), 0xff6d00);
        solid.box(p.x - 0.05, p.y, p.z - 0.05, p.x + 0.05, p.y + 0.06, p.z + p.dir * 0.05 + 0.05, 0xff6d00);
        break;
      case 'courtRing': flat.geom(new THREE.RingGeometry(3.4, 3.6, 24), trs(p.x, p.y + 0.02, p.z, -Math.PI / 2, 0, 0), 0xfff5e1); break;
      case 'fountain':
        ch.get('water', p.x, p.z).geom(cyl12, trs(p.x, p.y + 0.66, p.z, 0, 0, 0, 3.15, 0.04, 3.15), 0x4fc3f7);
        solid.geom(cyl12, trs(p.x, p.y + 2.8, p.z, 0, 0, 0, 1.1, 0.3, 1.1), 0xd0d0dc);
        solid.geom(cyl12, trs(p.x, p.y + 0.7, p.z, 0, 0, 0, 3.6, 0.12, 3.6), 0xe6e1d8);
        rest.push(p);  // animated water (cityAnim)
        break;
      case 'pump':
        flat.quad(p.x, p.y + 1.25, p.z + 0.41, 0.8, 0.5, 'z', 1, 0x263238); flat.quad(p.x, p.y + 1.25, p.z - 0.41, 0.8, 0.5, 'z', -1, 0x263238);
        solid.box(p.x - 0.65, p.y + 1.7, p.z - 0.45, p.x + 0.65, p.y + 1.9, p.z + 0.45, 0xe84545);
        glow.box(p.x - 0.3, p.y + 1.35, p.z + 0.42, p.x + 0.3, p.y + 1.55, p.z + 0.43, 0x7cffb2);
        det.geom(cyl6, trs(p.x + 0.7, p.y + 0.9, p.z, 0, 0, 0, 0.05, 1.0, 0.05), 0x212121);
        break;
      case 'container': {
        const hx = p.rot ? 1.25 : 3.05, hz = p.rot ? 3.05 : 1.25, dark = new THREE.Color(p.color).multiplyScalar(0.72).getHex();
        if (p.rot) for (let k = -2.6; k <= 2.6; k += 0.65) { solid.box(p.x - hx - 0.04, p.y + 0.1, p.z + k - 0.1, p.x - hx, p.y + 2.5, p.z + k + 0.1, dark); solid.box(p.x + hx, p.y + 0.1, p.z + k - 0.1, p.x + hx + 0.04, p.y + 2.5, p.z + k + 0.1, dark); }
        else for (let k = -2.6; k <= 2.6; k += 0.65) { solid.box(p.x + k - 0.1, p.y + 0.1, p.z - hz - 0.04, p.x + k + 0.1, p.y + 2.5, p.z - hz, dark); solid.box(p.x + k - 0.1, p.y + 0.1, p.z + hz, p.x + k + 0.1, p.y + 2.5, p.z + hz + 0.04, dark); }
        break;
      }
      case 'crateTrim': {
        const c = p.rare ? 0xffd23f : 0x6d4c2a;
        solid.box(p.x - 0.52, p.y + 0.05, p.z - 0.52, p.x + 0.52, p.y + 0.15, p.z + 0.52, c); solid.box(p.x - 0.52, p.y + 0.65, p.z - 0.52, p.x + 0.52, p.y + 0.75, p.z + 0.52, c);
        if (p.rare) glow.box(p.x - 0.15, p.y + 0.8, p.z - 0.15, p.x + 0.15, p.y + 0.82, p.z + 0.15, 0xffffff);
        break;
      }
      case 'ac':
        solid.box(p.x - 1.2, p.y, p.z - 0.8, p.x + 1.2, p.y + 1.1, p.z + 0.8, 0xc7ccd9);
        solid.geom(cyl12, trs(p.x, p.y + 1.12, p.z, 0, 0, 0, 0.6, 0.04, 0.6), 0x5c6272);
        break;
      case 'lamp':
        if (map.buildings) { rest.push(p); break; }
        solid.box(p.x - 0.08, p.y + 5.3, p.z - 0.08, p.x + 1.2, p.y + 5.5, p.z + 0.08, 0x8f9bb3);
        glow.geom(sphere, trs(p.x + 1.1, p.y + 5.25, p.z, 0, 0, 0, 0.28), 0xfff3b0);
        break;
      case 'gasSign':
        solid.box(p.x - 1.6, p.y + 7, p.z - 0.3, p.x + 1.6, p.y + 9.6, p.z + 0.3, 0xe84545);
        break;
      default: rest.push(p);
    }
  }

  // ---- the overhaul: facades, roofs, roads, street furniture, landmarks (city only)
  const anim = new CityAnim(scene, map);
  if (map.buildings) decorateCity(ch, map, rest, anim, { cyl6, cyl12, ico, cone, sphere, torus, leaf, drawTree });

  const tris = ch.build(scene, groups);

  // ---- signs (canvas textures)
  const signs = new THREE.Group();
  for (const l of map.labels) {
    const w = Math.max(3, l.text.length * 0.55 + 1);
    const tex = new THREE.CanvasTexture(textCanvas(l.text, { w: 512, h: 128, bg: l.bg, fg: l.color, font: `bold ${Math.min(80, Math.floor(820 / l.text.length))}px Trebuchet MS, sans-serif` }));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(l.p[0], l.p[1], l.p[2]); m.rotation.y = l.rotY || 0;
    if (!l.rotY) m.position.z += 0.02;
    signs.add(m);
    if (l.neon) anim.addNeon(m);
  }
  const gs = map.props.find(p => p.type === 'gasSign');
  if (gs) {
    const tex = new THREE.CanvasTexture(textCanvas('GAS 3.99', { w: 512, h: 256, bg: '#c62828', font: 'bold 110px Trebuchet MS' })); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    for (const s of [1, -1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), mat); m.position.set(gs.x, gs.y + 8.3, gs.z + s * 0.32); m.rotation.y = s > 0 ? 0 : Math.PI; signs.add(m); }
  }
  scene.add(signs);

  // level of detail: hide far detail chunks every few frames
  const detailMeshes = groups.detail.children.map(m => { m.geometry.computeBoundingSphere(); return m; });
  let lodTick = 0;
  function update(camPos, t, dt = 1 / 60) {
    if ((lodTick++ & 7) === 0) for (const m of detailMeshes) { const bs = m.geometry.boundingSphere; m.visible = bs.center.distanceTo(camPos) - bs.radius < DETAIL_FAR; }
    anim.update(t, dt, camPos);
  }
  // Group handles so other code (prison view) can hide the whole city
  const solidMesh = groups.solid;
  return { solidMesh, flatMesh: groups.flat, glowMesh: groups.glow, extra: [groups.glass, groups.detail, groups.water, anim.root], signs, update, anim, stats: { tris: Math.round(tris), chunks: ch.cells.size } };
}

// trees: round (two blobs), pine (two cones) or tall poplar
export function drawTree(b, x, y, z, s, k) {
  const leaf = [0x4caf50, 0x66bb6a, 0x2e9e5b, 0x8bc34a, 0x43a047, 0x7cb342];
  const cyl6 = TREE_GEO.cyl, cone = TREE_GEO.cone, ico = TREE_GEO.ico;
  b.geom(cyl6, trs(x, y + 1.3 * s, z, 0, 0, 0, 0.26 * s, 2.6 * s, 0.26 * s), 0x8a5a3b);
  if (k % 3 === 1) {
    b.geom(cone, trs(x, y + 3.5 * s, z, 0, k, 0, 2.1 * s, 3.0 * s, 2.1 * s), leaf[k % 6]);
    b.geom(cone, trs(x, y + 5.1 * s, z, 0, k, 0, 1.5 * s, 2.3 * s, 1.5 * s), leaf[(k + 1) % 6]);
  } else if (k % 3 === 2) {
    b.geom(ico, trs(x, y + 4.2 * s, z, k, k, 0, 1.3 * s, 2.6 * s, 1.3 * s), leaf[(k + 3) % 6]);
  } else {
    b.geom(ico, trs(x, y + 3.8 * s, z, k, k, 0, 2.2 * s), leaf[k % 6]);
    b.geom(ico, trs(x + 0.8 * s, y + 4.6 * s, z - 0.4 * s, 0, k, k, 1.4 * s), leaf[(k + 2) % 6]);
    b.geom(ico, trs(x - 0.9 * s, y + 4.3 * s, z + 0.6 * s, k, 0, k, 1.2 * s), leaf[(k + 4) % 6]);
  }
}
const TREE_GEO = { cyl: new THREE.CylinderGeometry(1, 1, 1, 7), cone: new THREE.ConeGeometry(1, 1, 7), ico: new THREE.IcosahedronGeometry(1, 0) };
