// Low-poly cartoony weapon models. Forward = -Z, the grip/hand is at the origin.
// Each model exposes named parts used by animations: body, mag (drops on reload),
// move (slide / cylinder / pump / bolt / warhead), muzzle (Object3D at barrel tip).
import * as THREE from 'three';
import { GeoBatch, trs, MAT } from '../engine/geo.js';
import { WEAPONS } from '/shared/weapons.js';

const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const cone = new THREE.ConeGeometry(1, 1, 10);
const sph = new THREE.SphereGeometry(1, 8, 6);
const sharedMat = MAT.lambert();
const glowMat = MAT.basic();

const dark = 0x2b2d42, mid = 0x5c6378, wood = 0xb5713b, light = 0xeceff4;

function mk() { return { body: new GeoBatch(), mag: new GeoBatch(), move: new GeoBatch(), glow: new GeoBatch() }; }
// cylinder along Z
const zc = (b, x, y, z0, z1, r, col, g = cyl) => b.geom(g, trs(x, y, (z0 + z1) / 2, Math.PI / 2, 0, 0, r, Math.abs(z1 - z0), r), col);

const BUILDERS = {
  pistol(p, c) {
    p.body.box(-0.026, 0.02, -0.17, 0.026, 0.072, 0.045, c);                // slide (body)
    p.move.box(-0.028, 0.055, -0.15, 0.028, 0.078, 0.03, new THREE.Color(c).multiplyScalar(0.8).getHex()); // slide top
    p.body.box(-0.022, -0.005, -0.12, 0.022, 0.025, 0.03, dark);            // frame
    p.body.geom(new THREE.BoxGeometry(0.044, 0.13, 0.05), trs(0, -0.055, 0.02, 0.28, 0, 0), dark); // grip
    p.body.box(-0.006, -0.04, -0.06, 0.006, -0.03, -0.01, mid);              // trigger guard
    p.body.box(-0.004, 0.072, -0.16, 0.004, 0.09, -0.15, light);             // sight
    zc(p.body, 0, 0.046, -0.19, -0.165, 0.012, mid);
    p.mag.geom(new THREE.BoxGeometry(0.034, 0.04, 0.04), trs(0, -0.125, 0.04, 0.28, 0, 0), light);
    return { muzzle: [0, 0.046, -0.2] };
  },
  revolver(p, c) {
    zc(p.body, 0, 0.06, -0.26, -0.06, 0.018, mid);                           // barrel
    p.body.box(-0.012, 0.075, -0.26, 0.012, 0.085, -0.07, c);                // rib
    p.body.box(-0.024, 0.02, -0.07, 0.024, 0.085, 0.03, c);                  // frame
    p.move.geom(cyl6, trs(0, 0.052, -0.035, Math.PI / 2, 0, 0, 0.034, 0.06, 0.034), light); // cylinder
    p.body.geom(new THREE.BoxGeometry(0.04, 0.12, 0.05), trs(0, -0.04, 0.045, 0.45, 0, 0), wood); // grip
    p.body.box(-0.007, 0.07, 0.02, 0.007, 0.1, 0.04, dark);                  // hammer
    p.body.box(-0.005, -0.01, -0.03, 0.005, 0.02, 0.0, dark);                // trigger
    p.body.box(-0.004, 0.085, -0.255, 0.004, 0.1, -0.245, light);
    return { muzzle: [0, 0.06, -0.27], magIsMove: true };
  },
  ar(p, c) {
    p.body.box(-0.03, 0.0, -0.25, 0.03, 0.08, 0.12, c);                      // receiver
    p.body.box(-0.034, 0.01, -0.45, 0.034, 0.07, -0.25, dark);               // handguard
    zc(p.body, 0, 0.04, -0.66, -0.45, 0.013, mid);                           // barrel
    zc(p.body, 0, 0.04, -0.69, -0.64, 0.02, dark);                           // flash hider
    p.body.box(-0.012, 0.08, -0.12, 0.012, 0.12, 0.05, dark);                // carry handle
    p.body.box(-0.004, 0.07, -0.44, 0.004, 0.11, -0.42, dark);               // front sight
    p.body.box(-0.025, -0.02, 0.12, 0.025, 0.07, 0.36, c);                   // stock
    p.body.box(-0.027, -0.05, 0.3, 0.027, 0.08, 0.37, dark);                 // butt pad
    p.body.geom(new THREE.BoxGeometry(0.036, 0.11, 0.045), trs(0, -0.05, 0.06, 0.35, 0, 0), dark); // grip
    p.mag.geom(new THREE.BoxGeometry(0.032, 0.17, 0.06), trs(0, -0.08, -0.13, -0.25, 0, 0), light); // mag
    p.glow.box(-0.006, 0.12, -0.04, 0.006, 0.13, -0.02, 0x7bff5a);
    return { muzzle: [0, 0.04, -0.7] };
  },
  smg(p, c) {
    p.body.box(-0.032, -0.005, -0.22, 0.032, 0.075, 0.08, c);
    zc(p.body, 0, 0.035, -0.33, -0.22, 0.015, mid);
    p.body.box(-0.02, 0.075, -0.18, 0.02, 0.095, 0.02, dark);
    p.body.geom(new THREE.BoxGeometry(0.036, 0.11, 0.045), trs(0, -0.05, 0.03, 0.3, 0, 0), dark);
    p.body.box(-0.012, -0.0, 0.08, 0.012, 0.05, 0.26, dark);                 // wire stock
    p.body.box(-0.02, -0.03, 0.24, 0.02, 0.06, 0.27, dark);
    p.body.box(-0.02, -0.06, -0.21, 0.02, 0.0, -0.17, dark);                 // fore grip
    p.mag.box(-0.016, -0.2, -0.13, 0.016, 0.0, -0.09, light);
    p.glow.box(-0.034, 0.03, -0.1, -0.033, 0.05, 0.0, 0xff5ad7);
    return { muzzle: [0, 0.035, -0.34] };
  },
  shotgun(p, c) {
    zc(p.body, 0, 0.06, -0.72, -0.12, 0.022, mid);                           // barrel
    zc(p.body, 0, 0.022, -0.6, -0.12, 0.018, dark);                          // tube mag
    p.body.box(-0.032, 0.0, -0.14, 0.032, 0.085, 0.08, c);                    // receiver
    p.move.box(-0.034, 0.0, -0.46, 0.034, 0.045, -0.26, wood);               // pump
    p.body.box(-0.03, -0.06, 0.06, 0.03, 0.07, 0.4, wood);                    // stock
    p.body.box(-0.032, -0.08, 0.36, 0.032, 0.075, 0.41, dark);
    p.body.box(-0.005, -0.03, -0.06, 0.005, 0.0, -0.02, dark);
    p.body.box(-0.006, 0.08, -0.7, 0.006, 0.1, -0.68, 0xffd23f);
    return { muzzle: [0, 0.06, -0.73], magIsMove: true };
  },
  sniper(p, c) {
    zc(p.body, 0, 0.05, -0.95, -0.25, 0.016, mid);
    zc(p.body, 0, 0.05, -1.0, -0.94, 0.026, dark);                           // muzzle brake
    p.body.box(-0.034, 0.0, -0.3, 0.034, 0.085, 0.12, c);                     // receiver
    p.body.box(-0.04, -0.03, -0.55, 0.04, 0.05, -0.28, c);                    // forestock
    p.body.box(-0.032, -0.07, 0.1, 0.032, 0.08, 0.46, c);                     // stock
    p.body.box(-0.034, -0.09, 0.42, 0.034, 0.085, 0.47, dark);
    zc(p.body, 0, 0.15, -0.22, 0.08, 0.026, dark);                            // scope
    zc(p.body, 0, 0.15, -0.28, -0.2, 0.036, dark);
    zc(p.body, 0, 0.15, 0.06, 0.12, 0.032, dark);
    p.body.box(-0.01, 0.085, -0.15, 0.01, 0.13, -0.11, dark); p.body.box(-0.01, 0.085, 0.0, 0.01, 0.13, 0.04, dark);
    p.glow.geom(cyl, trs(0, 0.15, -0.285, Math.PI / 2, 0, 0, 0.03, 0.005, 0.03), 0x7bdcff);
    p.glow.geom(cyl, trs(0, 0.15, 0.125, Math.PI / 2, 0, 0, 0.026, 0.005, 0.026), 0xff5252);
    p.move.box(0.034, 0.05, 0.02, 0.08, 0.065, 0.035, light);                  // bolt handle
    p.move.geom(sph, trs(0.085, 0.057, 0.028, 0, 0, 0, 0.014), light);
    p.mag.box(-0.022, -0.06, -0.12, 0.022, 0.0, -0.04, light);
    p.body.box(-0.004, -0.05, -0.55, 0.004, 0.0, -0.53, dark);                // bipod stub
    return { muzzle: [0, 0.05, -1.01] };
  },
  rocket(p, c) {
    zc(p.body, 0, 0.1, -0.55, 0.45, 0.085, c);                               // tube
    zc(p.body, 0, 0.1, -0.58, -0.5, 0.1, dark);                               // front ring
    zc(p.body, 0, 0.1, 0.4, 0.5, 0.1, dark);                                  // back ring
    p.body.box(-0.03, -0.05, -0.08, 0.03, 0.02, -0.02, dark);                 // grip
    p.body.geom(new THREE.BoxGeometry(0.04, 0.12, 0.05), trs(0, -0.05, 0.0, 0.2, 0, 0), dark);
    p.body.box(-0.03, -0.04, -0.32, 0.03, 0.02, -0.26, dark);                 // fore grip
    p.body.box(0.085, 0.13, -0.15, 0.14, 0.2, 0.05, dark);                    // sight box
    p.glow.box(0.09, 0.16, -0.155, 0.135, 0.19, -0.15, 0xff3b3b);
    p.body.box(-0.02, 0.185, -0.4, 0.02, 0.2, 0.3, 0xffd23f);                 // stripe
    // warhead sticking out the front (hidden after firing until reload)
    p.move.geom(cone, trs(0, 0.1, -0.68, -Math.PI / 2, 0, 0, 0.07, 0.18, 0.07), 0x9aa4b8);
    zc(p.move, 0, 0.1, -0.6, -0.55, 0.07, 0xff6a3b);
    return { muzzle: [0, 0.1, -0.62], magIsMove: true };
  }
};

const cache = {};
// Returns a fresh Group (shares geometry with other copies of the same weapon)
export function createWeaponModel(id) {
  if (!cache[id]) {
    const p = mk();
    const info = BUILDERS[id](p, WEAPONS[id].color);
    const geos = Object.fromEntries(Object.entries(p).filter(([, b]) => b.count > 0).map(([k, b]) => [k, b.build()]));
    // revolver cylinder spins around its own axis, so center its geometry on the pivot once
    if (id === 'revolver') { geos.move.translate(0, -0.052, 0.035); info.movePivot = [0, 0.052, -0.035]; }
    cache[id] = { info, geos };
  }
  const { info, geos } = cache[id];
  const g = new THREE.Group(); g.name = 'weapon_' + id;
  const parts = {};
  for (const [k, geo] of Object.entries(geos)) {
    const m = new THREE.Mesh(geo, k === 'glow' ? glowMat : sharedMat);
    m.castShadow = k !== 'glow';
    if (k === 'move' && info.movePivot) m.position.fromArray(info.movePivot);
    parts[k] = m; g.add(m);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(info.muzzle); g.add(muzzle);
  g.userData = { id, parts, muzzle, magIsMove: !!info.magIsMove };
  return g;
}

// Pickup visuals: ammo box and health pack
export function createAmmoModel() {
  const b = new GeoBatch();
  b.box(-0.22, 0, -0.15, 0.22, 0.24, 0.15, 0x4e7d3a);
  b.box(-0.23, 0.22, -0.16, 0.23, 0.26, 0.16, 0x3a5e2b);
  for (let i = 0; i < 4; i++) { zc(b, -0.12 + i * 0.08, 0.31, -0.06, 0.06, 0.022, 0xffc83d); b.geom(cone, trs(-0.12 + i * 0.08, 0.31, -0.085, -Math.PI / 2, 0, 0, 0.022, 0.05, 0.022), 0xd88a2a); }
  b.box(-0.08, 0.08, 0.151, 0.08, 0.16, 0.152, 0xffd23f);
  const m = new THREE.Mesh(b.build(), sharedMat); m.castShadow = true; return m;
}
export function createHealthModel() {
  const b = new GeoBatch();
  b.box(-0.2, 0, -0.14, 0.2, 0.26, 0.14, 0xffffff);
  b.box(-0.05, 0.03, 0.141, 0.05, 0.23, 0.145, 0xff3b3b); b.box(-0.13, 0.08, 0.141, 0.13, 0.18, 0.145, 0xff3b3b);
  b.box(-0.05, 0.03, -0.145, 0.05, 0.23, -0.141, 0xff3b3b); b.box(-0.13, 0.08, -0.145, 0.13, 0.18, -0.141, 0xff3b3b);
  b.box(-0.07, 0.26, -0.03, 0.07, 0.3, 0.03, 0x9e9e9e);
  const m = new THREE.Mesh(b.build(), sharedMat); m.castShadow = true; return m;
}
