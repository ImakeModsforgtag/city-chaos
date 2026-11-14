// Local weapon handling. The client predicts ammo + effects for instant feel;
// the SERVER decides hits, damage, ammo and reload completion (anti-cheat).
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';
import { raySphere, rayCapsule } from '/shared/collision.js';
import { HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS } from '/shared/constants.js';
import { createWeaponModel } from './models.js';
import { animateWeapon } from '../player/avatar.js';
import { INTERP_DELAY } from '../player/remotePlayers.js';
import * as audio from '../audio/audio.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Vector3();

export class WeaponSystem {
  constructor({ scene, camera, effects, net, world, remote }) {
    Object.assign(this, { scene, camera, effects, net, world, remote });
    this.slots = []; this.cur = 0;
    this.reloadUntil = 0; this.nextFire = 0;
    this.anim = { kick: 0, reload: 0, reloadDur: 1 };
    this.model = null; this.modelId = null;
    this.vr = false;
    // desktop viewmodel holder (child of camera)
    this.deskHolder = new THREE.Group(); this.deskHolder.position.set(0.17, -0.15, -0.33);
    camera.add(this.deskHolder);
    this.vrHolder = null;  // set by main to an Object3D on the right controller ray
    this.sway = new THREE.Vector2();
    this.onFire = null;    // callback(weaponId) for haptics
  }
  now() { return performance.now() / 1000; }
  get current() { return this.slots[this.cur] || null; }
  get def() { const s = this.current; return s ? WEAPONS[s.w] : null; }
  get reloading() { return this.now() < this.reloadUntil; }
  reloadProgress() { const d = this.def; if (!d || !this.reloading) return 0; return 1 - (this.reloadUntil - this.now()) / d.reloadTime; }

  setVR(vr) { this.vr = vr; this.attach(); }
  attach() {
    if (!this.model) return;
    const holder = this.vr ? this.vrHolder : this.deskHolder;
    // desktop viewmodels are scaled down so the whole gun fits on screen
    const DESK = { pistol: 0.75, revolver: 0.75, smg: 0.8, ar: 0.62, shotgun: 0.58, sniper: 0.5, golden: 0.46, rocket: 0.6 };
    const did = this.modelId;
    this.model.scale.setScalar(this.vr ? 1 : (DESK[did] || 0.7));
    if (holder && this.model.parent !== holder) holder.add(this.model);
  }

  // inventory from server is the truth
  setInventory(inv) {
    const prevW = this.current && this.current.w;
    this.slots = inv.slots.map(s => ({ ...s }));
    this.cur = inv.cur;
    if (inv.reloading > 0) {
      const end = this.now() + inv.reloading;
      if (!this.reloading) { this.anim.reload = inv.reloading; this.anim.reloadDur = this.def.reloadTime; audio.playReload(this.current.w, 0); }
      this.reloadUntil = end;
    } else if (this.reloading) {
      this.reloadUntil = 0; this.anim.reload = 0; audio.playReload(this.current && this.current.w, 1);
    }
    const w = this.current && this.current.w;
    if (w !== prevW) this.equip(w);
  }

  equip(w) {
    if (this.model) this.model.parent && this.model.parent.remove(this.model);
    this.model = null; this.modelId = w;
    if (!w) return;
    this.model = createWeaponModel(w);
    this.model.traverse(o => { o.castShadow = false; });
    this.attach();
    this.anim.kick = 0;
    this.equipT = 0.25; // raise animation
  }

  reload() {
    const s = this.current, d = this.def;
    if (!s || this.reloading || s.mag >= d.mag || s.reserve <= 0) return;
    this.net.send({ type: 'reload' });
    this.reloadUntil = this.now() + d.reloadTime;
    this.anim.reload = d.reloadTime; this.anim.reloadDur = d.reloadTime;
    audio.playReload(s.w, 0);
  }

  switchTo(i) {
    if (i < 0 || i >= this.slots.length || i === this.cur) return;
    this.cur = i; this.reloadUntil = 0; this.anim.reload = 0;
    this.net.send({ type: 'switch', slot: i });
    this.equip(this.current.w);
    audio.playReload(this.current.w, 1);
  }
  // custom gun look changed while holding it: rebuild the model
  refreshModel() { if (this.current) this.equip(this.current.w); }
  cycle(dir = 1) { if (this.slots.length > 1) this.switchTo((this.cur + dir + this.slots.length) % this.slots.length); }

  // aim ray. Desktop: from the eye. VR: from the gun muzzle.
  aim(outO, outD) {
    if (this.vr && this.model) {
      this.model.userData.muzzle.getWorldPosition(outO);
      this.model.getWorldQuaternion(_q);
      outD.set(0, 0, -1).applyQuaternion(_q).normalize();
    } else {
      this.camera.getWorldPosition(outO);
      this.camera.getWorldDirection(outD);
    }
  }

  // returns true if a shot was fired
  tryFire(triggerHeld, triggerPressed) {
    const s = this.current, d = this.def;
    if (!s || !this.model || this.holstered) return false;
    const t = this.now();
    if (!(d.auto ? triggerHeld : triggerPressed)) return false;
    if (t < this.nextFire || this.reloading || (this.equipT || 0) > 0.1) return false;
    if (s.mag <= 0) {
      if (triggerPressed) { audio.playEmpty(); this.reload(); }
      return false;
    }
    this.nextFire = t + d.fireInterval;
    s.mag--;
    this.aim(_o, _d);
    const muzzle = new THREE.Vector3(); this.model.userData.muzzle.getWorldPosition(muzzle);
    const dirs = [];
    const n = Math.max(1, d.pellets);
    for (let i = 0; i < n; i++) {
      const v = _d.clone();
      if (d.spread > 0) {
        // random direction within a cone (first pellet of a shotgun is dead-center)
        const a = Math.random() * Math.PI * 2, r = (n > 1 && i === 0) ? 0 : Math.sqrt(Math.random()) * d.spread;
        const up = Math.abs(v.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const side = new THREE.Vector3().crossVectors(v, up).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, v).normalize();
        v.addScaledVector(side, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
      }
      dirs.push(v);
    }
    // Golden Sniper: aim straight at the locked target's head (the server checks the lock is honest)
    let lock = null;
    if (s.w === 'golden' && this.golden) {
      lock = this.golden.computeLock(_o, _d, this.lockCone || 2);
      if (lock) { const h = this.golden.headOf(lock.kind, lock.id); if (h) dirs[0] = h.sub(_o).normalize(); else lock = null; }
    }
    this.net.send({ type: 'shoot', w: s.w, o: [_o.x, _o.y, _o.z].map(r4), d: dirs.map(v => [r4(v.x), r4(v.y), r4(v.z)]), ct: this.net.serverNow() - INTERP_DELAY, lock: lock ? [lock.kind, lock.id] : undefined });
    // local effects
    this.anim.kick += d.kick * 4;
    audio.playShot(s.w, null);
    this.effects.muzzle(muzzle, _d, s.w === 'rocket' ? 3 : s.w === 'shotgun' ? 2 : 1.3);
    if (s.w === 'golden') {
      const hit = lock ? null : this.localTrace(_o, dirs[0], d.range);
      if (this.onGolden) this.onGolden({ from: muzzle.clone(), dir: dirs[0].clone(), lock, end: hit ? hit.point : null });
      setTimeout(() => audio.playBolt(), 500);
    } else if (s.w !== 'rocket') {
      for (const v of dirs) {
        const hit = this.localTrace(_o, v, d.range);
        this.effects.tracer(muzzle, hit.point, d.color, s.w === 'sniper' ? 0.04 : 0.022);
        if (hit.kind === 'world') this.effects.impact(hit.point, hit.normal, false);
      }
    }
    if (s.mag === 0 && s.reserve > 0) setTimeout(() => this.reload(), 250);
    if (this.onFire) this.onFire(s.w);
    return true;
  }

  // visual-only trace (server does the real one)
  localTrace(o, d, range) {
    let best = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    let kind = best < Infinity ? 'world' : 'none';
    const normal = this.world.lastNormal ? new THREE.Vector3().fromArray(this.world.lastNormal) : null;
    if (best === Infinity) best = range;
    for (const p of this.remote.players.values()) {
      if (!p.alive || !p.head || !p.avatar.root.visible) continue;
      const [x, y, z] = p.head;
      const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, x, y, z, HEAD_RADIUS);
      const tb = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, x, y - BODY_BOTTOM, y - BODY_TOP, z, BODY_RADIUS);
      const tt = Math.min(th, tb);
      if (tt < best) { best = tt; kind = 'player'; }
    }
    if (this.npcs) { const h = this.npcs.ray(o, d, best); if (h) { best = h.t; kind = 'player'; } }
    return { point: o.clone().addScaledVector(d, best), kind, normal };
  }

  update(dt, moving) {
    if (!this.model) return;
    this.model.visible = !this.holstered;   // put away while you hold the 📷 camera
    if (this.equipT > 0) this.equipT = Math.max(0, this.equipT - dt);
    animateWeapon(this.model, this.anim, dt, 0);
    if (!this.vr) {
      // desktop: sway + bob + raise on equip
      const t = this.now();
      const bob = moving ? Math.sin(t * 9) * 0.012 : Math.sin(t * 1.5) * 0.003;
      this.model.position.x = Math.cos(t * 4.5) * (moving ? 0.008 : 0);
      this.model.position.y += bob - (this.equipT || 0) * 0.8;
      const long = { ar: 1, shotgun: 1, sniper: 1, golden: 1, rocket: 1 }[this.modelId];
      this.deskHolder.position.set(0.17, long ? -0.16 : -0.15, long ? -0.3 : -0.33);
    }
  }
}
const r4 = (v) => Math.round(v * 10000) / 10000;
