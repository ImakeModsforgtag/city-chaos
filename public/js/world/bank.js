// CITY CHAOS - the CITY BANK vault (client): the steel vault door (swings open when the vault is cracked),
// the 3 cash stacks inside, and the red alarm light. The server decides everything; this only shows it.
import * as THREE from 'three';
import { GeoBatch, trs, MAT } from '../engine/geo.js';

export class BankView {
  constructor(scene, map, world) {
    this.B = map.bank; if (!this.B) return;
    this.box = world.boxes.find(b => b.vaultDoor);   // the door's collision box (off = open)
    this.state = 'closed'; this.open = 0; this.loot = [0, 0, 0]; this.p = 0;
    const mat = MAT.lambert();
    const [x0, y0, z0, x1, y1, z1] = this.B.door;
    const w = x1 - x0, h = y1 - y0;
    // the door: a thick steel slab with a big round wheel + bolts. Hinged on its west edge, swings out into the lobby.
    const g = new GeoBatch();
    g.box(0, 0, -0.3, w, h, 0.3, 0x90a4ae);
    g.box(0.15, 0.15, -0.36, w - 0.15, h - 0.15, -0.3, 0xb0bec5);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
    g.geom(cyl, trs(w / 2, h / 2, -0.42, Math.PI / 2, 0, 0, 0.95, 0.12, 0.95), 0x607d8b);
    g.geom(cyl, trs(w / 2, h / 2, -0.52, Math.PI / 2, 0, 0, 0.22, 0.2, 0.22), 0xffc107);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.box(w / 2 + Math.cos(a) * 0.15 - 0.05, h / 2 + Math.sin(a) * 0.15 - 0.05, -0.62, w / 2 + Math.cos(a) * 0.75 + 0.05, h / 2 + Math.sin(a) * 0.75 + 0.05, -0.56, 0xffc107); }
    for (const [bx, by] of [[0.25, 0.25], [w - 0.25, 0.25], [0.25, h - 0.25], [w - 0.25, h - 0.25]]) g.geom(cyl, trs(bx, by, -0.38, Math.PI / 2, 0, 0, 0.09, 0.06, 0.09), 0x37474f);
    this.door = new THREE.Mesh(g.build(), mat);
    this.hinge = new THREE.Group(); this.hinge.position.set(x0, y0, (z0 + z1) / 2); this.hinge.add(this.door);
    scene.add(this.hinge);
    // alarm light above the door
    this.alarm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0x550000 }));
    this.alarm.position.set((x0 + x1) / 2, y1 + 0.5, z0 - 0.15); scene.add(this.alarm);
    // cash stacks (pallets of green bundles + a few gold bars)
    const s = new GeoBatch();
    s.box(-0.6, 0, -0.45, 0.6, 0.12, 0.45, 0x8d6e63);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) s.box(-0.55 + i * 0.37, 0.12 + k * 0.17, -0.4 + j * 0.42, -0.22 + i * 0.37, 0.28 + k * 0.17, -0.02 + j * 0.42, k % 2 ? 0x2e7d32 : 0x43a047);
    for (let i = 0; i < 3; i++) s.box(-0.45 + i * 0.32, 0.63, -0.12, -0.2 + i * 0.32, 0.73, 0.12, 0xffc107);
    const sg = s.build();
    this.stacks = this.B.loot.map(([lx, ly, lz]) => { const m = new THREE.Mesh(sg, mat); m.position.set(lx, ly, lz); m.visible = false; scene.add(m); return m; });
  }
  onState(m) {
    if (!this.B) return;
    this.state = m.state; this.loot = m.loot || [0, 0, 0]; this.p = m.p || 0; this.lock = m.lock || 0; this.openLeft = m.open || 0; this.at = performance.now();
    if (this.box) this.box.off = m.state === 'open';
  }
  // seconds left on the lockdown / open timer
  lockLeft() { return Math.max(0, Math.round(this.lock - (performance.now() - this.at) / 1000)); }
  openLeftS() { return Math.max(0, Math.round(this.openLeft - (performance.now() - this.at) / 1000)); }
  update(dt, t) {
    if (!this.B) return;
    const target = this.state === 'open' ? 1 : 0;
    this.open += Math.sign(target - this.open) * Math.min(Math.abs(target - this.open), dt * 0.6);
    this.hinge.rotation.y = this.open * 1.75;   // swings out into the lobby
    const on = (this.state === 'drilling' || this.state === 'open') && Math.sin(t * 12) > 0;
    this.alarm.material.color.setHex(on ? 0xff1744 : this.state === 'lockdown' ? 0xffab00 : 0x550000);
    for (let i = 0; i < 3; i++) this.stacks[i].visible = this.open > 0.3 && !!this.loot[i];
  }
  // is a spot inside a box around the drill point / a cash stack?
  nearDrill(p, r = 2.2) { const d = this.B.drill; return Math.hypot(p.x - d[0], p.z - d[2]) < r && Math.abs(p.y - (d[1] + 1.55)) < 1.6; }
  nearStack(p, r = 2.0) {
    for (let i = 0; i < 3; i++) { const l = this.B.loot[i]; if (this.loot[i] && Math.hypot(p.x - l[0], p.z - l[2]) < r && Math.abs(p.y - (l[1] + 1.55)) < 1.6) return i; }
    return -1;
  }
}
