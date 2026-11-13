// CITY CHAOS - a big glowing beam + ground ring + floating icon that marks where to go (jobs).
// Seen from far away on PC and in VR.
import * as THREE from 'three';
import { textCanvas } from '../engine/geo.js';

export class Marker {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 60, 16, 1, true), this.beamMat);
    beam.position.y = 30; this.root.add(beam);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.08; this.root.add(this.ring);
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.icon.scale.set(3.2, 1.6, 1); this.icon.position.y = 4.2; this.icon.renderOrder = 10; this.root.add(this.icon);
    this.key = '';
  }
  show(p, label, color = 0xffd23f) {
    if (!p) return this.hide();
    this.root.visible = true; this.root.position.set(p[0], p[1], p[2]);
    this.beamMat.color.setHex(color); this.ringMat.color.setHex(color);
    if (this.key !== label) {
      this.key = label;
      if (this.icon.material.map) this.icon.material.map.dispose();
      const c = textCanvas(label, { w: 512, h: 256, bg: '#1d1442', fg: '#ffd23f', font: 'bold 130px Trebuchet MS, sans-serif', radius: 60 });
      this.icon.material.map = new THREE.CanvasTexture(c); this.icon.material.needsUpdate = true;
    }
  }
  hide() { this.root.visible = false; }
  update(t, cam) {
    if (!this.root.visible) return;
    const s = 1 + Math.sin(t * 4) * 0.08; this.ring.scale.set(s, s, s);
    this.icon.position.y = 4.2 + Math.sin(t * 2) * 0.25;
    // the floating label grows with distance so it stays readable
    if (cam) { const d = cam.distanceTo(this.root.position); const k = Math.max(1, d / 25); this.icon.scale.set(3.2 * k, 1.6 * k, 1); }
  }
}
