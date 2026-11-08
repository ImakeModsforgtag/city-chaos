// Floating weapon / ammo / health pickups placed around the city.
import * as THREE from 'three';
import { createWeaponModel, createAmmoModel, createHealthModel } from './models.js';
import { WEAPONS } from '/shared/weapons.js';

const RAR = { common: 0x9be7ff, uncommon: 0x7bff5a, rare: 0xb57bff, legendary: 0xff3b6b };

export class Pickups {
  constructor(scene, map) {
    this.items = [];
    const ringGeo = new THREE.RingGeometry(0.28, 0.36, 20);
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.3, 1.6, 10, 1, true);
    for (const p of map.pickups) {
      const g = new THREE.Group();
      g.position.set(p.p[0], p.p[1], p.p[2]);
      let model, color;
      if (p.kind === 'weapon') {
        model = createWeaponModel(p.weapon);
        const len = { pistol: 1.6, revolver: 1.5, smg: 1.4, ar: 1.15, shotgun: 1.1, sniper: 0.95, rocket: 0.95 }[p.weapon];
        model.scale.setScalar(len);
        model.rotation.z = Math.PI / 2 * 0; color = RAR[WEAPONS[p.weapon].rarity];
      } else if (p.kind === 'ammo') { model = createAmmoModel(); model.position.y = -0.15; color = 0xffd23f; }
      else { model = createHealthModel(); model.position.y = -0.15; color = 0xff4d6d; }
      const spin = new THREE.Group(); spin.add(model); g.add(spin);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.38; g.add(ring);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 0.4; g.add(beam);
      scene.add(g);
      this.items.push({ def: p, g, spin, ring, beam, avail: true, highlight: 0, phase: p.id * 0.7 });
    }
  }
  setAvail(id, avail) { const it = this.items[id]; if (!it) return; it.avail = !!avail; it.g.visible = !!avail; }
  setAll(list) { for (const [id, a] of list) this.setAvail(id, a); }

  // nearest available pickup to a point (within r)
  nearest(pos, r) {
    let best = null, bd = r;
    for (const it of this.items) {
      if (!it.avail) continue;
      const d = it.g.position.distanceTo(pos);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  // best pickup in front of the camera for desktop "E"
  aimed(eye, dir, r = 3) {
    let best = null, bs = -1;
    for (const it of this.items) {
      if (!it.avail) continue;
      const v = it.g.position.clone().sub(eye);
      const d = v.length(); if (d > r) continue;
      const dot = v.normalize().dot(dir);
      const score = dot - d * 0.08 + (d < 1.4 ? 0.6 : 0);
      if ((dot > 0.5 || d < 1.4) && score > bs) { bs = score; best = it; }
    }
    return best;
  }
  update(dt, t, cam) {
    for (const it of this.items) {
      if (!it.avail) continue;
      // distance culling keeps draw calls low on Quest (only nearby pickups render)
      const near = !cam || it.g.position.distanceToSquared(cam) < 55 * 55;
      it.g.visible = near;
      if (!near) continue;
      it.spin.rotation.y += dt * 1.4;
      it.spin.position.y = Math.sin(t * 2 + it.phase) * 0.06;
      const s = 1 + it.highlight * 0.25 + Math.sin(t * 4 + it.phase) * 0.04;
      it.ring.scale.setScalar(s);
      it.beam.material.opacity = 0.14 + it.highlight * 0.3;
      it.highlight = Math.max(0, it.highlight - dt * 3);
    }
  }
  label(it) { const d = it.def; return d.kind === 'weapon' ? WEAPONS[d.weapon].name : d.kind === 'ammo' ? 'Ammo' : 'Health +50'; }
}
