// Pooled visual effects (cheap: unlit materials, small pools, no real-time lights).
import * as THREE from 'three';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // tracer: unit-length box along +Y, scaled + oriented per shot
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.tracerMats = {};
    this.flashGeo = new THREE.OctahedronGeometry(1, 0);
    this.puffGeo = new THREE.IcosahedronGeometry(1, 0);
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 20);
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, depthWrite: false });
    this.flashMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.dustMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc8, transparent: true, flatShading: true, depthWrite: false });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, depthWrite: false });
    this.boomMat = new THREE.MeshBasicMaterial({ color: 0xff7b1c, transparent: true, depthWrite: false });
    this.boomMat2 = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, depthWrite: false });
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x77778a, transparent: true, flatShading: true, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.rockets = new Map();
    this.rocketGeo = new THREE.ConeGeometry(0.07, 0.35, 8).rotateX(-Math.PI / 2);
    this.rocketMat = new THREE.MeshLambertMaterial({ color: 0xff6a3b, flatShading: true });
  }

  add(mesh, life, update) {
    this.scene.add(mesh);
    this.items.push({ mesh, life, max: life, update });
    if (this.items.length > 220) { const old = this.items.shift(); this.scene.remove(old.mesh); }
  }

  tracer(from, to, color = 0xffe066, width = 0.025) {
    const len = from.distanceTo(to); if (len < 0.3) return;
    let mat = this.tracerMats[color];
    if (!mat) mat = this.tracerMats[color] = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(this.tracerGeo, mat.clone());
    m.position.copy(from);
    _v.subVectors(to, from).normalize();
    m.quaternion.setFromUnitVectors(_up, _v);
    m.scale.set(width, len, width);
    this.add(m, 0.09, (it, k) => { it.mesh.material.opacity = k; it.mesh.scale.x = it.mesh.scale.z = width * (0.5 + k); });
  }

  muzzle(pos, dir, big = 1) {
    const m = new THREE.Mesh(this.flashGeo, this.flashMat.clone());
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(_up, dir);
    const s = 0.06 * big;
    m.scale.set(s, s * 2.6, s);
    m.rotation.y += Math.random() * 3;
    this.add(m, 0.06, (it, k) => { it.mesh.material.opacity = k; });
    const c = new THREE.Mesh(this.flashGeo, this.flashMat2.clone());
    c.position.copy(pos); c.scale.setScalar(0.035 * big);
    this.add(c, 0.04, (it, k) => { it.mesh.material.opacity = k; });
  }

  impact(pos, normal, isPlayer = false) {
    const n = isPlayer ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.puffGeo, (isPlayer ? this.sparkMat : this.dustMat).clone());
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      if (normal) v.addScaledVector(normal, 2);
      const s = isPlayer ? 0.05 : 0.07 + Math.random() * 0.05;
      m.scale.setScalar(s);
      this.add(m, 0.35 + Math.random() * 0.2, (it, k, dt) => {
        it.mesh.position.addScaledVector(v, dt); v.y -= dt * 4;
        it.mesh.material.opacity = k; it.mesh.scale.setScalar(s * (1.6 - k * 0.6));
      });
    }
  }

  explosion(pos) {
    const core = new THREE.Mesh(this.puffGeo, this.boomMat2.clone()); core.position.copy(pos);
    this.add(core, 0.25, (it, k) => { it.mesh.scale.setScalar(0.5 + (1 - k) * 3); it.mesh.material.opacity = k; });
    const ball = new THREE.Mesh(this.puffGeo, this.boomMat.clone()); ball.position.copy(pos);
    this.add(ball, 0.5, (it, k) => { it.mesh.scale.setScalar(1 + (1 - k) * 4.5); it.mesh.material.opacity = k * k; it.mesh.rotation.y += 0.05; });
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone()); ring.position.copy(pos); ring.rotation.x = -Math.PI / 2;
    this.add(ring, 0.4, (it, k) => { it.mesh.scale.setScalar(1 + (1 - k) * 6); it.mesh.material.opacity = k; });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(this.puffGeo, this.smokeMat.clone());
      s.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6);
      const sc = 0.5 + Math.random() * 0.6;
      this.add(s, 1.2 + Math.random() * 0.6, (it, k, dt) => {
        it.mesh.position.addScaledVector(v, dt); v.multiplyScalar(1 - dt * 2);
        it.mesh.scale.setScalar(sc * (1 + (1 - k) * 2)); it.mesh.material.opacity = k * 0.8;
      });
    }
  }

  // cartoony "pop" into confetti chunks in the player's colors
  pop(pos, color, accent) {
    const mats = [new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true }), new THREE.MeshLambertMaterial({ color: accent, flatShading: true, transparent: true })];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(this.puffGeo, mats[i % 2].clone());
      m.position.set(pos.x, pos.y - Math.random() * 0.8, pos.z);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5 + 1, (Math.random() - 0.5) * 5);
      const s = 0.06 + Math.random() * 0.1, spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0);
      m.scale.setScalar(s);
      this.add(m, 1.6, (it, k, dt) => {
        it.mesh.position.addScaledVector(v, dt); v.y -= 12 * dt;
        if (it.mesh.position.y < 0.1 && v.y < 0) { v.y *= -0.4; v.x *= 0.7; v.z *= 0.7; }
        it.mesh.rotation.x += spin.x * dt; it.mesh.rotation.y += spin.y * dt;
        it.mesh.material.opacity = Math.min(1, k * 3);
      });
    }
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone()); ring.position.copy(pos); ring.lookAt(pos.x, pos.y + 1, pos.z);
    this.add(ring, 0.3, (it, k) => { it.mesh.scale.setScalar(0.3 + (1 - k) * 1.5); it.mesh.material.opacity = k; });
  }

  spawnRocket(id, o, v) {
    const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    m.position.set(o[0], o[1], o[2]);
    const vel = new THREE.Vector3(v[0], v[1], v[2]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), vel.clone().normalize());
    this.scene.add(m);
    this.rockets.set(id, { m, vel, t: 0, trail: 0 });
  }
  removeRocket(id) {
    const r = this.rockets.get(id); if (!r) return;
    this.scene.remove(r.m); this.rockets.delete(id);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this.scene.remove(it.mesh); if (it.mesh.material.dispose && it.mesh.material !== this.rocketMat) it.mesh.material.dispose(); this.items.splice(i, 1); continue; }
      it.update(it, it.life / it.max, dt);
    }
    for (const [id, r] of this.rockets) {
      r.m.position.addScaledVector(r.vel, dt); r.t += dt; r.trail += dt;
      if (r.trail > 0.03) {
        r.trail = 0;
        const s = new THREE.Mesh(this.puffGeo, this.smokeMat.clone()); s.position.copy(r.m.position);
        const sc = 0.08 + Math.random() * 0.06;
        this.add(s, 0.7, (it, k) => { it.mesh.scale.setScalar(sc * (1 + (1 - k) * 3)); it.mesh.material.opacity = k * 0.6; });
        const f = new THREE.Mesh(this.puffGeo, this.sparkMat.clone()); f.position.copy(r.m.position); f.scale.setScalar(0.07);
        this.add(f, 0.1, (it, k) => { it.mesh.material.opacity = k; });
      }
      if (r.t > 7) this.removeRocket(id);
    }
  }
}
