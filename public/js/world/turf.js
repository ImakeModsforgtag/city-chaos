// CITY CHAOS - gang turf (client): a big ring + flag at each of the six zones, colored by the gang that owns it.
import * as THREE from 'three';
import { textCanvas } from '../engine/geo.js';
import { GANGS, TURFS, TURF, COP_GANG } from '/shared/turf.js';

const NEUTRAL = 0xb0b4c4;
export class TurfView {
  constructor(scene, world) {
    this.zones = TURFS.map(t => {
      const g = new THREE.Group();
      const d = world.raycast(t.p[0], 30, t.p[1], 0, -1, 0, 40), y = Number.isFinite(d) ? 30 - d : 0.15;
      g.position.set(t.p[0], y, t.p[1]); scene.add(g);
      const ringMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(TURF.radius - 0.5, TURF.radius, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      const fillMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(TURF.radius - 0.5, 48), fillMat); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.05; g.add(fill);
      // capture progress arc
      const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const arc = new THREE.Mesh(new THREE.RingGeometry(TURF.radius - 1.3, TURF.radius - 0.6, 48, 1, 0, 0.001), arcMat); arc.rotation.x = -Math.PI / 2; arc.position.y = 0.07; g.add(arc);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), new THREE.MeshLambertMaterial({ color: 0x9e9e9e })); pole.position.y = 3; g.add(pole);
      const flagMat = new THREE.MeshLambertMaterial({ color: NEUTRAL, side: THREE.DoubleSide });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1), flagMat); flag.position.set(0.95, 5.3, 0); g.add(flag);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true })); label.scale.set(5, 1.25, 1); label.position.y = 6.9; g.add(label);
      return { t, g, ring, ringMat, fillMat, arc, arcMat, flag, flagMat, label, owner: -1, prog: 0, by: 0, contested: 0, y };
    });
    this.set(TURFS.map(() => [0, 0, 0, 0]));
  }
  set(list) {
    list.forEach(([owner, prog, by, contested], i) => {
      const z = this.zones[i]; if (!z) return;
      if (owner !== z.owner) {
        z.owner = owner; const col = GANGS[owner] ? GANGS[owner].hex : NEUTRAL;
        z.ringMat.color.setHex(col); z.fillMat.color.setHex(col); z.flagMat.color.setHex(col);
        if (z.label.material.map) z.label.material.map.dispose();
        z.label.material.map = new THREE.CanvasTexture(textCanvas(`🏴 ${z.t.name}${GANGS[owner] ? ' · ' + GANGS[owner].name : ''}`, { w: 1024, h: 256, bg: GANGS[owner] ? GANGS[owner].color : '#555a70', fg: '#ffffff', font: 'bold 74px Trebuchet MS, sans-serif', radius: 50 }));
        z.label.material.needsUpdate = true;
      }
      z.prog = prog; z.by = by; z.contested = contested;
      z.arc.geometry.dispose();
      z.arc.geometry = new THREE.RingGeometry(TURF.radius - 1.3, TURF.radius - 0.6, 48, 1, Math.PI / 2, Math.max(0.001, prog / 100 * Math.PI * 2));
      z.arcMat.color.setHex(contested ? 0xffffff : by === COP_GANG ? 0x1f3a93 : GANGS[by] ? GANGS[by].hex : 0xffffff);
    });
  }
  // the zone you're standing in (for the HUD line)
  at(pos) { return this.zones.find(z => Math.hypot(pos.x - z.t.p[0], pos.z - z.t.p[1]) < TURF.radius && pos.y < z.y + TURF.maxY + 2 && pos.y > z.y - 3) || null; }
  line(pos, myGang, cop) {
    const z = this.at(pos); if (!z) return null;
    const own = GANGS[z.owner] ? `${GANGS[z.owner].icon} ${GANGS[z.owner].name} turf` : 'neutral turf';
    if (z.contested) return `🏴 ${z.t.name} · ${own} · ⚔ CONTESTED`;
    if (z.prog > 0 && z.by) return `🏴 ${z.t.name} · ${z.by === COP_GANG ? '🚔 clearing' : `${GANGS[z.by].icon} taking it`} ${z.prog}%`;
    if (cop) return `🏴 ${z.t.name} · ${own}${z.owner ? ' · stay here to clear it' : ''}`;
    if (!myGang) return `🏴 ${z.t.name} · ${own} · join a gang (pause / Y menu) to take it`;
    return `🏴 ${z.t.name} · ${own}${z.owner === myGang ? ' · yours!' : ''}`;
  }
  update(t) { for (const z of this.zones) { z.flag.rotation.y = Math.sin(t * 2 + z.t.p[0]) * 0.25; z.fillMat.opacity = z.prog > 0 ? 0.12 + Math.abs(Math.sin(t * 4)) * 0.1 : 0.12; } }
}
