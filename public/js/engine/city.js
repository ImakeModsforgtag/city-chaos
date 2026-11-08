// Turns the shared map data into low-poly cartoony meshes (few draw calls).
import * as THREE from 'three';
import { GeoBatch, trs, MAT, textCanvas } from './geo.js';

const WIN_COLORS = [0x9be7ff, 0xbdf0ff, 0xffe28a, 0x6fa8ff, 0xcfe8ff, 0xffd166];

export function buildCity(scene, map) {
  const solid = new GeoBatch();   // lit, casts + receives shadows
  const flat = new GeoBatch();    // lit, receives only (roads, markings, windows)
  const glow = new GeoBatch();    // unlit bright bits (lamps, signs lights)

  for (const b of map.boxes) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const thin = (y1 - y0) < 0.06;
    (thin ? flat : solid).box(x0, y0, z0, x1, y1, z1, b.c, { skipBottom: y0 <= 0.01 && y0 >= -0.6 });
  }

  // windows on solid buildings
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const w of map.windows) {
    const faces = [
      { axis: 'z', sign: w.inward ? 1 : -1, fixed: w.inward ? w.z0 + 2 + 0.03 : w.z0 - 0.03, a0: w.x0, a1: w.x1 },
      { axis: 'z', sign: w.inward ? -1 : 1, fixed: w.inward ? w.z1 - 2 - 0.03 : w.z1 + 0.03, a0: w.x0, a1: w.x1 },
      { axis: 'x', sign: w.inward ? 1 : -1, fixed: w.inward ? w.x0 + 2 + 0.03 : w.x0 - 0.03, a0: w.z0, a1: w.z1 },
      { axis: 'x', sign: w.inward ? -1 : 1, fixed: w.inward ? w.x1 - 2 - 0.03 : w.x1 + 0.03, a0: w.z0, a1: w.z1 }
    ];
    const ww = w.inward ? 2.4 : 1.3, wh = w.inward ? 2.2 : 1.6, sp = w.inward ? 6 : 3, vs = w.inward ? 5 : 3.2;
    for (const f of faces) {
      const len = f.a1 - f.a0;
      const n = Math.floor((len - 1.5) / sp);
      if (n < 1) continue;
      const start = f.a0 + (len - (n - 1) * sp) / 2;
      for (let i = 0; i < n; i++) for (let y = w.y0 + wh / 2; y + wh / 2 < w.y1; y += vs) {
        const a = start + i * sp;
        const col = WIN_COLORS[Math.floor(rnd() * WIN_COLORS.length)];
        if (f.axis === 'z') { flat.quad(a, y, f.fixed, ww + 0.25, wh + 0.25, 'z', f.sign, 0xf7f1e3); flat.quad(a, y, f.fixed + f.sign * 0.01, ww, wh, 'z', f.sign, col); }
        else { flat.quad(f.fixed, y, a, ww + 0.25, wh + 0.25, 'x', f.sign, 0xf7f1e3); flat.quad(f.fixed + f.sign * 0.01, y, a, ww, wh, 'x', f.sign, col); }
      }
    }
  }

  // props
  const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 7);
  const cyl12 = new THREE.CylinderGeometry(1, 1, 1, 12);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const torus = new THREE.TorusGeometry(1, 0.08, 6, 14);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const leaf = [0x4caf50, 0x66bb6a, 0x2e9e5b, 0x8bc34a, 0x43a047];
  for (const p of map.props) {
    switch (p.type) {
      case 'tree': {
        const s = p.s || 1;
        const k = Math.floor((p.x * 13 + p.z * 7) % 5 + 5) % 5;
        solid.geom(cyl6, trs(p.x, p.y + 1.3 * s, p.z, 0, 0, 0, 0.28 * s, 2.6 * s, 0.28 * s), 0x8a5a3b);
        if (k % 2) {
          solid.geom(cone, trs(p.x, p.y + 3.6 * s, p.z, 0, k, 0, 2.2 * s, 3.2 * s, 2.2 * s), leaf[k]);
          solid.geom(cone, trs(p.x, p.y + 5.2 * s, p.z, 0, k, 0, 1.6 * s, 2.4 * s, 1.6 * s), leaf[(k + 1) % 5]);
        } else {
          solid.geom(ico, trs(p.x, p.y + 3.8 * s, p.z, k, k, 0, 2.2 * s), leaf[k]);
          solid.geom(ico, trs(p.x + 0.8 * s, p.y + 4.6 * s, p.z - 0.4 * s, 0, k, k, 1.4 * s), leaf[(k + 2) % 5]);
        }
        break;
      }
      case 'lamp':
        solid.box(p.x - 0.08, p.y + 5.3, p.z - 0.08, p.x + 1.2, p.y + 5.5, p.z + 0.08, 0x8f9bb3);
        glow.geom(sphere, trs(p.x + 1.1, p.y + 5.25, p.z, 0, 0, 0, 0.28), 0xfff3b0);
        break;
      case 'car': {
        const { x, y, z, rot } = p;
        const L = 2.1, W = 1.0;
        const wheel = (dx, dz) => solid.geom(cyl12, trs(x + dx, y + 0.42, z + dz, rot ? Math.PI / 2 : 0, 0, rot ? 0 : Math.PI / 2, 0.42, 0.3, 0.42), 0x222222);
        if (rot) { for (const sx of [-1.3, 1.3]) for (const sz of [-1.02, 1.02]) wheel(sx, sz); }
        else { for (const sz of [-1.3, 1.3]) for (const sx of [-1.02, 1.02]) wheel(sx, sz); }
        // windows on the cabin
        const hx = rot ? L * 0.55 : W * 0.9, hz = rot ? W * 0.9 : L * 0.55;
        flat.quad(x, y + 1.5, z + hz + 0.02, (rot ? hx : hx) * 1.7, 0.5, 'z', 1, 0x9be7ff);
        flat.quad(x, y + 1.5, z - hz - 0.02, hx * 1.7, 0.5, 'z', -1, 0x9be7ff);
        flat.quad(x + hx + 0.02, y + 1.5, z, hz * 1.7, 0.5, 'x', 1, 0x9be7ff);
        flat.quad(x - hx - 0.02, y + 1.5, z, hz * 1.7, 0.5, 'x', -1, 0x9be7ff);
        // headlights
        if (rot) { glow.box(x + 2.1, y + 0.7, z - 0.8, x + 2.15, y + 0.95, z - 0.4, 0xfff6c0); glow.box(x + 2.1, y + 0.7, z + 0.4, x + 2.15, y + 0.95, z + 0.8, 0xfff6c0); }
        else { glow.box(x - 0.8, y + 0.7, z + 2.1, x - 0.4, y + 0.95, z + 2.15, 0xfff6c0); glow.box(x + 0.4, y + 0.7, z + 2.1, x + 0.8, y + 0.95, z + 2.15, 0xfff6c0); }
        break;
      }
      case 'hoop':
        solid.geom(torus, trs(p.x, p.y, p.z + p.dir * 0.35, Math.PI / 2, 0, 0, 0.32), 0xff6d00);
        solid.box(p.x - 0.05, p.y, p.z - 0.05, p.x + 0.05, p.y + 0.06, p.z + p.dir * 0.05 + 0.05, 0xff6d00);
        break;
      case 'courtRing':
        flat.geom(new THREE.RingGeometry(3.4, 3.6, 24), trs(p.x, p.y + 0.02, p.z, -Math.PI / 2, 0, 0), 0xfff5e1);
        break;
      case 'fountain':
        flat.geom(cyl12, trs(p.x, p.y + 0.72, p.z, 0, 0, 0, 3.1, 0.04, 3.1), 0x4fc3f7);
        solid.geom(cyl12, trs(p.x, p.y + 2.8, p.z, 0, 0, 0, 1.1, 0.3, 1.1), 0xd0d0dc);
        glow.geom(ico, trs(p.x, p.y + 3.15, p.z, 0, 0, 0, 0.35, 0.5, 0.35), 0x9be7ff);
        break;
      case 'pump':
        flat.quad(p.x, p.y + 1.25, p.z + 0.41, 0.8, 0.5, 'z', 1, 0x263238);
        flat.quad(p.x, p.y + 1.25, p.z - 0.41, 0.8, 0.5, 'z', -1, 0x263238);
        solid.box(p.x - 0.65, p.y + 1.7, p.z - 0.45, p.x + 0.65, p.y + 1.9, p.z + 0.45, 0xe84545);
        break;
      case 'container': {
        const hx = p.rot ? 1.25 : 3.05, hz = p.rot ? 3.05 : 1.25;
        const dark = new THREE.Color(p.color).multiplyScalar(0.72).getHex();
        if (p.rot) for (let k = -2.6; k <= 2.6; k += 0.65) { solid.box(p.x - hx - 0.04, p.y + 0.1, p.z + k - 0.1, p.x - hx, p.y + 2.5, p.z + k + 0.1, dark); solid.box(p.x + hx, p.y + 0.1, p.z + k - 0.1, p.x + hx + 0.04, p.y + 2.5, p.z + k + 0.1, dark); }
        else for (let k = -2.6; k <= 2.6; k += 0.65) { solid.box(p.x + k - 0.1, p.y + 0.1, p.z - hz - 0.04, p.x + k + 0.1, p.y + 2.5, p.z - hz, dark); solid.box(p.x + k - 0.1, p.y + 0.1, p.z + hz, p.x + k + 0.1, p.y + 2.5, p.z + hz + 0.04, dark); }
        break;
      }
      case 'crateTrim': {
        const c = p.rare ? 0xffd23f : 0x6d4c2a;
        solid.box(p.x - 0.52, p.y + 0.05, p.z - 0.52, p.x + 0.52, p.y + 0.15, p.z + 0.52, c);
        solid.box(p.x - 0.52, p.y + 0.65, p.z - 0.52, p.x + 0.52, p.y + 0.75, p.z + 0.52, c);
        if (p.rare) glow.box(p.x - 0.15, p.y + 0.8, p.z - 0.15, p.x + 0.15, p.y + 0.82, p.z + 0.15, 0xffffff);
        break;
      }
      case 'ac':
        solid.box(p.x - 1.2, p.y, p.z - 0.8, p.x + 1.2, p.y + 1.1, p.z + 0.8, 0xc7ccd9);
        solid.geom(cyl12, trs(p.x, p.y + 1.12, p.z, 0, 0, 0, 0.6, 0.04, 0.6), 0x5c6272);
        break;
      case 'gasSign':
        solid.box(p.x - 1.6, p.y + 7, p.z - 0.3, p.x + 1.6, p.y + 9.6, p.z + 0.3, 0xe84545);
        break;
    }
  }

  const solidMesh = new THREE.Mesh(solid.build(), MAT.lambert());
  solidMesh.castShadow = true; solidMesh.receiveShadow = true; solidMesh.name = 'city';
  const flatMesh = new THREE.Mesh(flat.build(), MAT.lambert({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  flatMesh.receiveShadow = true; flatMesh.name = 'cityFlat';
  const glowMesh = new THREE.Mesh(glow.build(), MAT.basic());
  glowMesh.name = 'cityGlow';
  scene.add(solidMesh, flatMesh, glowMesh);

  // signs (canvas textures)
  const signs = new THREE.Group();
  for (const l of map.labels) {
    const w = Math.max(3, l.text.length * 0.55 + 1);
    const tex = new THREE.CanvasTexture(textCanvas(l.text, { w: 512, h: 128, bg: l.bg, fg: l.color, font: `bold ${Math.min(80, Math.floor(820 / l.text.length))}px Trebuchet MS, sans-serif` }));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(l.p[0], l.p[1], l.p[2]);
    m.rotation.y = l.rotY || 0;
    m.position.z += (l.rotY ? -0.02 : 0.02);
    signs.add(m);
  }
  // gas station price sign
  {
    const gs = map.props.find(p => p.type === 'gasSign');
    if (gs) {
      const tex = new THREE.CanvasTexture(textCanvas('GAS 3.99', { w: 512, h: 256, bg: '#c62828', font: 'bold 110px Trebuchet MS' }));
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      for (const s of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), mat);
        m.position.set(gs.x, gs.y + 8.3, gs.z + s * 0.32); m.rotation.y = s > 0 ? 0 : Math.PI; signs.add(m);
      }
    }
  }
  scene.add(signs);
  return { solidMesh, flatMesh, glowMesh, signs, stats: { solid: solid.count, flat: flat.count, glow: glow.count } };
}
