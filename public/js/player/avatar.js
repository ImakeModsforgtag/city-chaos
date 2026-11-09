// Low-poly cartoony player avatar with cosmetics.
// Layout matches the server hitboxes: head sphere at the head pose, torso hanging below.
import * as THREE from 'three';
import { createWeaponModel } from '../weapons/models.js';
import { TEAM_COLORS } from '/shared/constants.js';
import { textCanvas } from '../engine/geo.js';

const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const G = {
  sphere: new THREE.SphereGeometry(1, 10, 8), ico: new THREE.IcosahedronGeometry(1, 0), box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8), cone: new THREE.ConeGeometry(1, 1, 10),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 14), half: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  dodec: new THREE.DodecahedronGeometry(1, 0)
};
const black = L(0x1d1442), white = L(0xffffff), gold = L(0xffd23f, { emissive: 0x442200 }), glowCyan = new THREE.MeshBasicMaterial({ color: 0x6ff7ff });
const flame = new THREE.MeshBasicMaterial({ color: 0xffa13b });
const copBlue = L(0x1f3a93);
const orange = L(0xff7f27);

function mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  m.castShadow = true; return m;
}

export class Avatar {
  constructor(cos, { name = '', team = -1, isLocal = false } = {}) {
    this.root = new THREE.Group(); this.root.name = 'avatar';
    this.head = new THREE.Group(); this.body = new THREE.Group();
    this.lh = new THREE.Group(); this.rh = new THREE.Group();
    this.weaponHolder = new THREE.Group(); this.rh.add(this.weaponHolder);
    this.root.add(this.head, this.body, this.lh, this.rh);
    this.isLocal = isLocal;
    this.team = team; this.name = name;
    this.weaponId = null; this.weapon = null;
    this.anim = { kick: 0, reload: 0, reloadDur: 1, bob: Math.random() * 10 };
    this.bodyYaw = 0;
    this.setCosmetics(cos);
    if (!isLocal) this.setName(name, team);
  }

  setCosmetics(cos) {
    this.cos = { ...cos };
    for (const g of [this.head, this.body]) while (g.children.length) g.remove(g.children[0]);
    for (const g of [this.lh, this.rh]) for (const c of [...g.children]) if (c !== this.weaponHolder) g.remove(c);
    const skin = L(cos.color), acc = L(cos.accent || '#ffffff');
    const darker = L(new THREE.Color(cos.color).multiplyScalar(0.75));
    this.skin = skin;
    // ---------------- head
    const H = this.head;
    let topY = 0.2, faceZ = -0.19;
    switch (cos.head | 0) {
      case 1: H.add(mesh(G.box, skin, 0, 0, 0, 0.36, 0.34, 0.34)); topY = 0.17; faceZ = -0.172; break;
      case 2: H.add(mesh(G.ico, skin, 0, 0, 0, 0.23)); topY = 0.2; faceZ = -0.17; break;
      case 3: H.add(mesh(G.sphere, skin, 0, 0.03, 0, 0.18, 0.25, 0.19)); topY = 0.26; faceZ = -0.17; break;
      default: H.add(mesh(G.sphere, skin, 0, 0, 0, 0.21)); topY = 0.2; faceZ = -0.18;
    }
    // big cartoon eyes + mouth (face looks down -Z, same as camera forward)
    for (const sx of [-1, 1]) {
      H.add(mesh(G.sphere, white, sx * 0.075, 0.04, faceZ, 0.06, 0.07, 0.03));
      H.add(mesh(G.sphere, black, sx * 0.072, 0.035, faceZ - 0.022, 0.03, 0.036, 0.015));
    }
    H.add(mesh(G.box, black, 0, -0.07, faceZ + 0.005, 0.09, 0.02, 0.02));
    // hats
    switch (cos.guard ? 8 : cos.prisoner ? 0 : cos.cop ? 7 : cos.hat | 0) {
      case 8: H.add(mesh(G.cyl, L(0x2c3e50), 0, topY + 0.02, 0, 0.23, 0.13, 0.23)); H.add(mesh(G.box, black, 0, topY - 0.05, -0.2, 0.3, 0.02, 0.16)); H.add(mesh(G.box, L(0xbdc3c7), 0, topY + 0.04, -0.232, 0.07, 0.06, 0.01)); break; // guard cap
      case 7: H.add(mesh(G.cyl, copBlue, 0, topY + 0.02, 0, 0.23, 0.13, 0.23)); H.add(mesh(G.box, black, 0, topY - 0.05, -0.2, 0.3, 0.02, 0.16)); H.add(mesh(G.box, gold, 0, topY + 0.04, -0.232, 0.07, 0.06, 0.01)); break; // police cap
      case 1: H.add(mesh(G.half, acc, 0, topY - 0.06, 0, 0.21, 0.14, 0.21)); H.add(mesh(G.cyl, acc, 0, topY - 0.05, -0.15, 0.13, 0.015, 0.12)); break; // cap
      case 2: H.add(mesh(G.cyl, black, 0, topY + 0.02, 0, 0.26, 0.02, 0.26)); H.add(mesh(G.cyl, black, 0, topY + 0.15, 0, 0.15, 0.26, 0.15)); H.add(mesh(G.cyl, L(0xff3d7f), 0, topY + 0.06, 0, 0.152, 0.05, 0.152)); break; // top hat
      case 3: H.add(mesh(G.half, acc, 0, topY - 0.08, 0, 0.215, 0.18, 0.215)); H.add(mesh(G.sphere, white, 0, topY + 0.1, 0, 0.055)); break; // beanie
      case 4: H.add(mesh(G.cyl8, gold, 0, topY + 0.03, 0, 0.16, 0.08, 0.16)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; H.add(mesh(G.cone, gold, Math.cos(a) * 0.14, topY + 0.11, Math.sin(a) * 0.14, 0.035, 0.09, 0.035)); } break; // crown
      case 5: H.add(mesh(G.cyl, L(0x9c6b3e), 0, topY - 0.01, 0, 0.32, 0.02, 0.32)); H.add(mesh(G.cyl8, L(0x9c6b3e), 0, topY + 0.07, 0, 0.15, 0.15, 0.15)); H.add(mesh(G.cyl8, L(0x5d3a1a), 0, topY + 0.02, 0, 0.152, 0.03, 0.152)); break; // cowboy
      case 6: H.add(mesh(G.cone, L(0xff7a1a), 0, topY + 0.16, 0, 0.17, 0.42, 0.17)); H.add(mesh(G.cyl, white, 0, topY + 0.14, 0, 0.115, 0.05, 0.115)); H.add(mesh(G.box, L(0xff7a1a), 0, topY - 0.04, 0, 0.36, 0.03, 0.36)); break; // traffic cone
    }
    // glasses
    switch (cos.glasses | 0) {
      case 1: for (const sx of [-1, 1]) H.add(mesh(G.box, black, sx * 0.075, 0.045, faceZ - 0.035, 0.11, 0.07, 0.02)); H.add(mesh(G.box, black, 0, 0.055, faceZ - 0.035, 0.06, 0.015, 0.02)); break;
      case 2: for (const sx of [-1, 1]) H.add(mesh(G.torus, L(0xff3d7f), sx * 0.075, 0.04, faceZ - 0.035, 0.055, 0.055, 0.055)); break;
      case 3: H.add(mesh(G.box, glowCyan, 0, 0.045, faceZ - 0.04, 0.32, 0.065, 0.02)); break;
      case 4: H.add(mesh(G.torus, gold, 0.075, 0.04, faceZ - 0.035, 0.06, 0.06, 0.06)); H.add(mesh(G.box, gold, 0.12, -0.04, faceZ - 0.03, 0.006, 0.14, 0.006)); break;
    }
    // ---------------- body (torso hangs 0.32 .. 0.95 below head center)
    const B = this.body;
    switch (cos.body | 0) {
      case 1: B.add(mesh(G.cyl8, skin, 0, -0.62, 0, 0.17, 0.62, 0.15)); break;
      case 2: B.add(mesh(G.cyl8, skin, 0, -0.62, 0, 0.28, 0.56, 0.26)); B.add(mesh(G.cyl8, darker, 0, -0.62, 0, 0.285, 0.08, 0.265)); break;
      case 3: B.add(mesh(G.box, skin, 0, -0.62, 0, 0.44, 0.56, 0.3)); B.add(mesh(G.box, acc, 0, -0.55, -0.155, 0.22, 0.16, 0.02)); B.add(mesh(G.sphere, glowCyan, 0.06, -0.55, -0.17, 0.025)); B.add(mesh(G.sphere, new THREE.MeshBasicMaterial({ color: 0xff3d7f }), -0.04, -0.55, -0.17, 0.025)); break;
      default: B.add(mesh(G.dodec, skin, 0, -0.62, 0, 0.29, 0.33, 0.25));
    }
    B.add(mesh(G.box, cos.cop || cos.guard ? black : cos.prisoner ? orange : acc, 0, -0.8, 0, 0.42, 0.06, 0.3)); // belt/accent band
    if (cos.prisoner) { // orange prison jumpsuit over your body + a number patch
      B.add(mesh(G.box, orange, 0, -0.62, 0, 0.5, 0.62, 0.42));
      B.add(mesh(G.box, white, 0, -0.5, -0.215, 0.16, 0.08, 0.02));
    }
    if (cos.guard) { // stolen guard uniform
      B.add(mesh(G.box, L(0x6c7a89), 0, -0.62, 0, 0.5, 0.62, 0.42));
      B.add(mesh(G.box, L(0xbdc3c7), 0.09, -0.5, -0.215, 0.07, 0.08, 0.02));
    }
    if (cos.cop) { // police uniform: blue vest + gold badge over your colors
      B.add(mesh(G.box, copBlue, 0, -0.6, 0, 0.5, 0.36, 0.42));
      B.add(mesh(G.box, gold, 0.09, -0.5, -0.215, 0.07, 0.08, 0.02));
    }
    this.teamBand = mesh(G.cyl8, L(0xffffff), 0, -0.4, 0, 0.2, 0.05, 0.2); this.teamBand.visible = false; B.add(this.teamBand);
    // little legs (stubby, cartoony)
    this.legs = [-1, 1].map(sx => { const l = mesh(G.cyl8, cos.prisoner ? orange : cos.guard ? L(0x2c3e50) : darker, sx * 0.1, -0.98, 0, 0.07, 0.16, 0.07); B.add(l); return l; });
    if (this.isVR) this.legs.forEach(l => l.visible = false);
    switch (cos.prisoner || cos.guard ? 0 : cos.back | 0) {
      case 1: B.add(mesh(G.box, acc, 0, -0.58, 0.2, 0.3, 0.36, 0.14)); B.add(mesh(G.box, darker, 0, -0.66, 0.28, 0.22, 0.14, 0.04)); break;
      case 2: for (const sx of [-1, 1]) { B.add(mesh(G.cyl, L(0xb0bec5), sx * 0.09, -0.6, 0.22, 0.07, 0.36, 0.07)); B.add(mesh(G.cone, flame, sx * 0.09, -0.86, 0.22, 0.05, 0.14, 0.05, Math.PI)); } break;
      case 3: B.add(mesh(G.box, L(0xd62828), 0, -0.68, 0.16, 0.42, 0.62, 0.02, 0.12)); break;
      case 4: B.add(mesh(G.sphere, L(0xe76f51), 0.02, -0.75, 0.2, 0.15, 0.17, 0.05)); B.add(mesh(G.box, L(0x6d4c2a), 0.02, -0.4, 0.2, 0.04, 0.5, 0.03, 0, 0, 0.2)); break;
    }
    // ---------------- hands (mittens)
    this.lh.add(mesh(G.sphere, darker, 0, 0, 0.02, 0.065, 0.06, 0.085));
    this.rh.add(mesh(G.sphere, darker, 0, 0, 0.02, 0.065, 0.06, 0.085));
    this.lh.add(mesh(G.sphere, darker, 0.05, 0.02, -0.02, 0.03)); // thumbs
    this.rh.add(mesh(G.sphere, darker, -0.05, 0.02, -0.02, 0.03));
    this.setTeam(this.team);
    if (this.weaponId) { const w = this.weaponId; this.weaponId = null; this.setWeapon(w); }
  }

  setTeam(team) {
    this.team = team;
    if (team >= 0) { this.teamBand.visible = true; this.teamBand.material = L(TEAM_COLORS[team], { emissive: TEAM_COLORS[team], emissiveIntensity: 0.4 }); }
    else this.teamBand.visible = false;
    if (this.tag) this.setName(this.name, team);
  }

  setName(name, team = this.team) {
    this.name = name;
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    const bg = team === 0 ? '#d62f4b' : team === 1 ? '#2f63d6' : this.role === 'cop' ? '#1f3a93' : '#1d1442';
    const tex = new THREE.CanvasTexture(textCanvas((this.role === 'cop' ? '👮 ' : '') + name, { w: 256, h: 64, bg, font: 'bold 38px Trebuchet MS, sans-serif', radius: 18 }));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    this.tag.scale.set(0.8, 0.2, 1);
    this.tag.renderOrder = 5;
    this.root.add(this.tag);
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    if (this.weapon) this.weaponHolder.remove(this.weapon);
    this.weapon = id ? createWeaponModel(id) : null;
    if (this.weapon) {
      // The right-hand pose is the controller's pointing pose, so the gun needs no extra tilt.
      this.weapon.position.set(0, -0.02, 0.03);
      this.weaponHolder.add(this.weapon);
    }
  }

  // pose arrays: [x,y,z,qx,qy,qz,qw]
  setPose(h, l, r, dt) {
    this.head.position.set(h[0], h[1], h[2]); this.head.quaternion.set(h[3], h[4], h[5], h[6]);
    this.lh.position.set(l[0], l[1], l[2]); this.lh.quaternion.set(l[3], l[4], l[5], l[6]);
    this.rh.position.set(r[0], r[1], r[2]); this.rh.quaternion.set(r[3], r[4], r[5], r[6]);
    // body follows head position, yaw only (smoothed)
    const e = _e.setFromQuaternion(this.head.quaternion, 'YXZ');
    let dy = e.y - this.bodyYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.bodyYaw += dy * Math.min(1, dt * 6);
    this.anim.bob += dt * 3;
    const prev = this._prevHead || this.head.position;
    const vx = (h[0] - prev.x) / Math.max(dt, 1e-3), vz = (h[2] - prev.z) / Math.max(dt, 1e-3);
    this._prevHead = { x: h[0], y: h[1], z: h[2] };
    const speed = Math.min(6, Math.hypot(vx, vz));
    this.body.position.set(h[0], h[1] + Math.sin(this.anim.bob * (1 + speed)) * 0.015 * (1 + speed * 0.5), h[2]);
    this.body.rotation.set(0, this.bodyYaw, 0);
    // lean into movement
    const fwdx = -Math.sin(this.bodyYaw), fwdz = -Math.cos(this.bodyYaw);
    const lean = (vx * fwdx + vz * fwdz) * 0.03;
    const side = (vx * -fwdz + vz * fwdx) * 0.03;
    this.body.rotation.x = THREE.MathUtils.clamp(-lean, -0.3, 0.3);
    this.body.rotation.z = THREE.MathUtils.clamp(side, -0.3, 0.3);
    if (this.tag) this.tag.position.set(h[0], h[1] + 0.55, h[2]);
    if (this.stars) this.stars.position.set(h[0], h[1] + 0.76, h[2]);
    this.animateWeapon(dt);
  }

  setRole(role) { if (this.role === role) return; this.role = role; if (this.tag) this.setName(this.name, this.team); }
  // floating wanted stars so cops can see who to chase
  setWanted(n) {
    n = n | 0; if (this.wanted === n) return; this.wanted = n;
    if (this.stars) { this.root.remove(this.stars); this.stars.material.map.dispose(); this.stars.material.dispose(); this.stars = null; }
    if (!n) return;
    const tex = new THREE.CanvasTexture(textCanvas('★'.repeat(n), { w: 64 + 46 * n, h: 64, bg: '#b3122e', fg: '#ffd23f', font: 'bold 44px Trebuchet MS, sans-serif', radius: 18 }));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.stars = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    this.stars.scale.set(0.17 * (64 + 46 * n) / 64, 0.17, 1); this.stars.renderOrder = 5;
    this.root.add(this.stars);
  }
  setVR(vr) { if (this.isVR === vr) return; this.isVR = vr; if (this.legs) this.legs.forEach(l => l.visible = !vr); this.body.scale.setScalar(vr ? 0.62 : 1); }
  kick(amount = 0.1) { this.anim.kick = Math.min(0.6, this.anim.kick + amount * 4); }
  startReload(dur) { this.anim.reload = dur; this.anim.reloadDur = dur; }

  animateWeapon(dt) {
    if (!this.weapon) return;
    animateWeapon(this.weapon, this.anim, dt, 0);
  }
  dispose() { if (this.tag) { this.tag.material.map.dispose(); this.tag.material.dispose(); } }
}
const _e = new THREE.Euler();

// Shared weapon animation (recoil + reload) used by remote avatars and the local viewmodel
export function animateWeapon(w, a, dt, baseRotX = 0) {
  const parts = w.userData.parts;
  a.kick = Math.max(0, a.kick - dt * 5);
  let rx = baseRotX + a.kick * 0.9, pz = a.kick * 0.12, py = 0, rz = 0;
  if (a.reload > 0) {
    a.reload = Math.max(0, a.reload - dt);
    const t = 1 - a.reload / a.reloadDur; // 0..1
    const tilt = Math.sin(Math.min(1, t) * Math.PI);
    rx -= tilt * 0.5; rz = tilt * 0.6; py = -tilt * 0.05;
    if (parts.mag && !w.userData.magIsMove) {
      parts.mag.position.y = t < 0.5 ? -t * 0.6 : -(1 - t) * 0.6;
      parts.mag.visible = !(t > 0.35 && t < 0.55);
    }
    if (parts.move) {
      const id = w.userData.id;
      if (id === 'revolver') { parts.move.position.x = 0.04 * tilt; parts.move.rotation.z += dt * 18 * tilt; }
      else if (id === 'shotgun') parts.move.position.z = Math.sin(t * Math.PI * 6) * 0.06 * tilt;
      else if (id === 'sniper') parts.move.position.z = Math.max(0, Math.sin(t * Math.PI * 2)) * 0.06;
      else if (id === 'rocket') parts.move.visible = t > 0.6;
      else if (id === 'pistol') parts.move.position.z = t > 0.8 ? (1 - t) * 0.2 : 0;
    }
  } else {
    if (parts.mag) { parts.mag.position.y = 0; parts.mag.visible = true; }
    if (parts.move) {
      const id = w.userData.id;
      if (id === 'pistol' || id === 'smg' || id === 'ar') parts.move.position.z = a.kick * 0.08;
      if (id === 'shotgun') parts.move.position.z = a.kick > 0.2 ? 0.06 : parts.move.position.z * 0.8;
      if (id === 'revolver') parts.move.position.x = 0;
    }
  }
  w.rotation.set(rx, 0, rz);
  w.position.z = 0.03 + pz; w.position.y = -0.02 + py;
}
