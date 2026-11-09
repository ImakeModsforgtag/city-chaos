// Arrest cutscene (3+ stars). Real 3D actors, no images:
//  1 CAPTURE   cops walk up, cuff you, walk you to the police car
//  2 RIDE      the car drives the actual city roads, lights + siren + radio chatter
//  3 ARRIVAL   prison gate opens, guards watch, gate closes, you're walked inside
//  4 WAKE UP   "6 HOURS LATER..." -> you wake up on your cell bed
// Desktop gets cinematic camera cuts. VR never moves your head for you: you sit in the back seat
// for the ride (fixed seated view), and every scene change is a gentle fade.
import * as THREE from 'three';
import { roadRoute } from '/shared/roads.js';
import { cutsceneCar } from '../vehicles/cars.js';
import { NPCs, npcBodyMesh } from '../player/npcs.js';
import { Avatar } from '../player/avatar.js';
import { textCanvas } from '../engine/geo.js';
import * as audio from '../audio/audio.js';

const S2 = 8, S3 = 26, S4 = 36, END = 44;
const UP = new THREE.Vector3(0, 1, 0);
const qYaw = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const ease = (k) => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
const rot = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

// distance-parameterised polyline [[x,z],...]
function path(pts) {
  const seg = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  return {
    pts, L,
    at(s) {
      s = Math.max(0, Math.min(L, s));
      for (let i = 0; i < seg.length; i++) {
        if (s <= seg[i] || i === seg.length - 1) {
          const a = pts[i], b = pts[i + 1], k = seg[i] ? s / seg[i] : 0;
          return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) };
        }
        s -= seg[i];
      }
      return { x: pts[0][0], z: pts[0][1], yaw: 0 };
    }
  };
}

export class ArrestCutscene {
  constructor({ scene, camera, rig, map, world, prisonView }) {
    this.scene = scene; this.camera = camera; this.rig = rig; this.map = map; this.world = world; this.prisonView = prisonView;
    this.active = false;
    this.group = new THREE.Group(); scene.add(this.group);
    this.factory = new NPCs(this.group, null);
    // fade sphere + caption sprites live on the camera so they work the same on desktop and in VR
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fade.renderOrder = 998; this.fade.visible = false; camera.add(this.fade);
    this.caption = this.sprite(1.0, 0.25); this.caption.position.set(0, 0.02, -0.95);
    this.hint = this.sprite(0.42, 0.06); this.hint.position.set(0, -0.36, -0.95);
    this.bars = null;
  }

  sprite(w, h) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    s.scale.set(w, h, 1); s.renderOrder = 999; s.visible = false; s.userData.text = null; this.camera.add(s);
    return s;
  }
  setText(s, text, style = {}) {
    if (s.userData.text === text) return;
    s.userData.text = text;
    if (s.material.map) s.material.map.dispose();
    if (!text) { s.visible = false; s.material.map = null; return; }
    const W = style.w || 1024, Hh = style.h || 256;
    s.scale.set(s.userData.base || s.scale.x, (s.userData.base || s.scale.x) * Hh / W, 1); s.userData.base = s.userData.base || s.scale.x;
    const tex = new THREE.CanvasTexture(textCanvas(text, { w: W, h: Hh, bg: style.bg === undefined ? null : style.bg, fg: style.fg || '#ffffff', font: style.font || 'bold 92px Trebuchet MS, sans-serif' }));
    tex.colorSpace = THREE.SRGBColorSpace;
    s.material.map = tex; s.material.needsUpdate = true; s.visible = true;
  }

  // ---------------------------------------------------------------- start
  start(msg, { xr, cos, name, skipLabel }) {
    this.stop();
    this.active = true; this.t = 0; this.lastNow = 0; this.xr = xr; this.serverDone = false; this.skipped = false; this.cos = cos;
    this.msg = msg;
    const [hx, hy, hz] = msg.from;
    const fd = this.world.raycast(hx, hy, hz, 0, -1, 0, 6);
    const A = new THREE.Vector3(hx, Number.isFinite(fd) ? hy - fd : hy - 1.45, hz);
    this.A = A; this.pyaw = msg.yaw || 0;
    // park the police car 5-7m away on a clear spot the player can see
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, d = 6;
      const cx = A.x + Math.cos(a) * d, cz = A.z + Math.sin(a) * d;
      const gy = this.floor(cx, A.y + 2, cz); if (gy === null || Math.abs(gy - A.y) > 1.2) continue;
      if (this.world.sphereOverlaps(cx, gy + 0.9, cz, 1.25) || this.world.sphereOverlaps(cx, gy + 1.5, cz, 1.25)) continue;
      const dx = cx - A.x, dz = cz - A.z, dl = Math.hypot(dx, dz);
      if (this.world.raycast(A.x, A.y + 1, A.z, dx / dl, 0, dz / dl, dl) < dl - 1.4) continue;
      best = { x: cx, y: gy, z: cz }; break;
    }
    if (!best) best = { x: A.x + 5, y: A.y, z: A.z };
    this.carPos = new THREE.Vector3(best.x, best.y, best.z);
    const tx = A.x - best.x, tz = A.z - best.z, tl = Math.hypot(tx, tz) || 1;
    this.toPlayer = [tx / tl, tz / tl];
    this.carYaw = Math.atan2(-tz / tl, tx / tl);        // rear right door faces the player
    // the ride: real roads from near the arrest toward the south edge of the city
    const r = roadRoute(best.x, best.z, 3, 118);
    this.ride = path(r.length > 1 ? r : [[best.x, best.z], [best.x, best.z + 120]]);
    this.rideLen = Math.min(this.ride.L, 240);
    this.approach = path(this.map.prison.approach);
    // actors
    this.car = cutsceneCar(); this.group.add(this.car.root);
    this.seated = this.car.frontSeats.map((s, i) => { const m = npcBodyMesh(4400 + i, 2); m.position.set(s.x, s.y - 1.55, s.z); m.scale.setScalar(0.95); this.car.root.add(m); return m; });
    this.cops = [0, 1].map(i => { const n = this.factory.build(4500 + i, 2); n.root.visible = true; return n; });
    this.player = new Avatar(cos, { name, isLocal: true }); this.group.add(this.player.root);
    this.guards = [0, 1].map(i => { const n = this.factory.build(4600 + i, 3); n.root.visible = true; return n; });
    this.lastCarYaw = null; this.radioDone = new Set(); this.sirenT = 0; this.cuffed = false;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    if (!xr) this.letterbox(true);
    this.setText(this.hint, skipLabel || 'SPACE: skip', { w: 512, h: 72, bg: 'rgba(0,0,0,0.45)', font: 'bold 40px Trebuchet MS, sans-serif' });
    audio.playBuzzer(); audio.playSiren(null);
    this.fade.visible = true; this.fade.material.opacity = 1;
  }

  floor(x, fromY, z) { const d = this.world.raycast(x, fromY, z, 0, -1, 0, 8); return Number.isFinite(d) ? fromY - d : null; }

  letterbox(on) {
    if (on && !this.bars) {
      this.bars = [0, 1].map(i => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;right:0;height:11vh;background:#000;z-index:40;${i ? 'bottom:0' : 'top:0'};pointer-events:none`; document.body.appendChild(d); return d; });
    } else if (!on && this.bars) { this.bars.forEach(b => b.remove()); this.bars = null; }
  }

  requestSkip() {
    if (!this.active || this.skipped || this.t < 1.2) return false;
    this.skipped = true; audio.stopRadio();
    if (this.t < S4) this.t = S4;
    return true;
  }

  // ---------------------------------------------------------------- per-frame
  update(frameDt) {
    if (!this.active) return false;
    // run on real time (not the capped frame delta) so it stays in step with the server's timer even if FPS dips
    const now = performance.now() / 1000; const dt = Math.min(0.25, this.lastNow ? now - this.lastNow : frameDt); this.lastNow = now;
    const speed = this.skipped && this.t >= S4 ? 2 : 1;
    this.t += dt * speed;
    const t = this.t;
    this.radio(t);
    if (t < S2) this.scene1(t, dt);
    else if (t < S3) this.scene2(t, dt);
    else if (t < S4) this.scene3(t, dt);
    else this.scene4(t, dt);
    // fades between scenes
    const f = (a, b) => (t >= a && t <= b);
    let op = 0;
    if (t < 0.6) op = 1 - t / 0.6;
    else if (f(S2 - 0.6, S2)) op = (t - (S2 - 0.6)) / 0.6; else if (f(S2, S2 + 0.6)) op = 1 - (t - S2) / 0.6;
    else if (f(S3 - 0.6, S3)) op = (t - (S3 - 0.6)) / 0.6; else if (f(S3, S3 + 0.6)) op = 1 - (t - S3) / 0.6;
    else if (this.xr && (f(31.0, 31.6) || f(33.4, 34))) op = ((t - (t < 32 ? 31 : 33.4)) / 0.6);
    else if (this.xr && (f(31.6, 32.2) || f(34, 34.6))) op = 1 - (t - (t < 33 ? 31.6 : 34)) / 0.6;
    else if (f(S4 - 0.6, S4)) op = (t - (S4 - 0.6)) / 0.6;
    else if (t >= S4 && t < 39.4) op = 1;
    else if (t >= 39.4) op = this.blink(t - 39.4);
    this.fade.material.opacity = Math.max(0, Math.min(1, op));
    if (t >= END && (this.serverDone || t > END + 6)) { this.stop(); return false; }
    return true;
  }

  blink(k) {
    // waking up: eyes open slowly, two heavy blinks
    if (k < 0.8) return 1 - k / 0.8 * 0.7;
    if (k < 1.1) return 0.3 + (k - 0.8) / 0.3 * 0.7;
    if (k < 1.6) return 1 - (k - 1.1) / 0.5;
    if (k < 1.75) return (k - 1.6) / 0.15 * 0.8;
    if (k < 2.1) return 0.8 - (k - 1.75) / 0.35 * 0.8;
    return 0;
  }

  radio(t) {
    const lines = [
      [9.2, 'Dispatch, unit twelve. Suspect is in custody. Transporting to County Prison.'],
      [14.6, 'Copy, unit twelve. Suspect has a high wanted level. Proceed directly to the intake gate.'],
      [20.4, 'Ten four. Lights and sirens, E T A five minutes.'],
      [26.9, 'County Prison, unit twelve at the main gate with one inmate.'],
      [29.4, 'Gate opening. Bring them through.']
    ];
    for (const [at, text] of lines) if (t >= at && !this.radioDone.has(at) && !this.skipped) { this.radioDone.add(at); audio.radio(text, { pitch: at === 29.4 ? 1.05 : 0.85 }); }
  }

  // world position of a car-local point
  carWorld(local, car = this.car.root) { return local.clone().applyMatrix4(car.matrixWorld); }

  // ---------------------------------------------------------------- scene 1: capture
  scene1(t, dt) {
    const { A, carPos, carYaw } = this;
    const car = this.car.root; car.visible = true;
    car.position.copy(carPos); car.rotation.set(0, carYaw, 0); car.updateMatrixWorld(true);
    this.car.flash(t, true);
    this.sirenT -= dt; if (this.sirenT <= 0) { audio.playSiren(new THREE.Vector3(carPos.x, carPos.y + 1.5, carPos.z)); this.sirenT = 2.6; }
    const [tpx, tpz] = this.toPlayer;
    const faceCar = Math.atan2(tpx, tpz);              // player turns to face the car
    const side = [-tpz, tpx];
    const doorL = this.carWorld(new THREE.Vector3(-1.4, 0, -0.6)), doorR = this.carWorld(new THREE.Vector3(1.4, 0, -0.6));
    const rear = this.carWorld(new THREE.Vector3(1.5, 0, 0.75));
    // player
    let px = A.x, pz = A.z, pyaw = lerp(this.pyaw, faceCar, ease((t - 0.5) / 1.5));
    if (t > 5) { const k = ease((t - 5) / 2.4); px = lerp(A.x, rear.x, k); pz = lerp(A.z, rear.z, k); pyaw = Math.atan2(-(rear.x - A.x), -(rear.z - A.z)); }
    const hy = A.y + 1.45 + (t > 5 && t < 7.4 ? Math.abs(Math.sin(t * 7)) * 0.03 : 0);
    let L, R;
    if (t < 3) { const up = ease((t - 0.4) / 0.8); L = this.local(px, hy, pz, pyaw, -0.32, lerp(-0.6, 0.25, up), -0.05); R = this.local(px, hy, pz, pyaw, 0.32, lerp(-0.6, 0.25, up), -0.05); }
    else { L = this.local(px, hy, pz, pyaw, -0.08, -0.72, 0.22); R = this.local(px, hy, pz, pyaw, 0.08, -0.72, 0.22); }
    this.player.root.visible = !this.xr;
    this.player.setPose([px, hy, pz, ...qYaw(pyaw)], [...L, 0, 0, 0, 1], [...R, 0, 0, 0, 1], dt);
    if (t >= 4 && !this.cuffed) { this.cuffed = true; audio.playCuffs(); this.setText(this.caption, 'ARRESTED!', { bg: '#c0392b', font: 'bold 120px Trebuchet MS, sans-serif' }); }
    if (t >= 6 && this.caption.userData.text === 'ARRESTED!') this.setText(this.caption, null);
    // cops: walk from the car doors to either side of the player, cuff, escort
    this.cops.forEach((c, i) => {
      const s = i ? 1 : -1;
      const start = i ? doorR : doorL;
      const stand = { x: A.x + side[0] * s * 0.75 + tpx * 0.35, z: A.z + side[1] * s * 0.75 + tpz * 0.35 };
      let x, z, yaw, walking = false;
      if (t < 0.6) { x = start.x; z = start.z; yaw = Math.atan2(-(stand.x - start.x), -(stand.z - start.z)); }
      else if (t < 3) { const k = ease((t - 0.6) / 2.4); x = lerp(start.x, stand.x, k); z = lerp(start.z, stand.z, k); yaw = Math.atan2(-(stand.x - start.x), -(stand.z - start.z)); walking = k < 1; }
      else if (t < 5) { x = stand.x; z = stand.z; yaw = Math.atan2(-(A.x - x), -(A.z - z)); }
      else {
        const k = ease((t - 5) / 2.4), goal = i ? { x: doorL.x, z: doorL.z } : { x: rear.x + side[0] * 0.8, z: rear.z + side[1] * 0.8 };
        x = lerp(stand.x, goal.x, k); z = lerp(stand.z, goal.z, k); yaw = Math.atan2(-(goal.x - stand.x), -(goal.z - stand.z)); walking = k < 1;
      }
      c.root.visible = !(i === 1 && t > 7.3);
      this.animCop(c, x, this.floor(x, A.y + 1.5, z) ?? A.y, z, yaw, walking, t, t >= 3 && t < 5 ? 'cuff' : t >= 5 && i === 0 ? 'escort' : 'idle');
    });
    this.guards.forEach(g => g.root.visible = false);
    // camera
    if (this.xr) { if (!this.vrPlaced) { this.vrPlaced = true; } return; }
    const base = Math.atan2(-tpx, -tpz) + 0.5, orbit = base + Math.sin(t * 0.25) * 0.45;
    const ox = Math.sin(orbit), oz = Math.cos(orbit);
    const wall = this.world.raycast(A.x, A.y + 2.1, A.z, ox * 0.97, 0.24, oz * 0.97, 5.4);
    const rad = Math.max(1.6, Math.min(5.0, (Number.isFinite(wall) ? wall : 6) - 0.5));
    this.cam(new THREE.Vector3(A.x + ox * rad, A.y + 2.1 + rad * 0.12, A.z + oz * rad), new THREE.Vector3(lerp(A.x, (A.x + carPos.x) / 2, ease((t - 4.5) / 2)), A.y + 1.1, lerp(A.z, (A.z + carPos.z) / 2, ease((t - 4.5) / 2))), t < 0.1);
  }

  local(x, y, z, yaw, lx, ly, lz) { const [rx, rz] = rot(lx, lz, yaw); return [x + rx, y + ly, z + rz]; }

  animCop(c, x, y, z, yaw, walking, t, pose) {
    c.root.position.set(x, y, z); c.root.rotation.y = yaw;
    c.phase = (c.phase || 0) + (walking ? 0.16 : 0.02);
    const sw = walking ? Math.sin(c.phase) * 0.55 : 0;
    c.legs[0].rotation.x = sw; c.legs[1].rotation.x = -sw;
    if (pose === 'cuff') { c.lh.position.set(-0.16, 1.1 + Math.sin(t * 9) * 0.03, -0.45); c.rh.position.set(0.16, 1.1 + Math.cos(t * 9) * 0.03, -0.45); }
    else if (pose === 'escort') { c.lh.position.set(-0.32, 0.92, -sw * 0.25); c.rh.position.set(0.25, 1.2, -0.42); }
    else { c.lh.position.set(-0.32, 0.92, -sw * 0.25); c.rh.position.set(0.32, 0.92, sw * 0.25); }
    if (c.gun) c.gun.visible = pose !== 'cuff';
  }

  // ---------------------------------------------------------------- scene 2: ride through the city
  scene2(t, dt) {
    this.cops.forEach(c => c.root.visible = false);
    const k = t - S2, D = S3 - S2;
    const v = this.rideLen / (D - 1.2);
    const s = k < 1.5 ? v * k * k / 3 : v * (k - 0.75);
    const p = this.ride.at(Math.min(this.rideLen, s));
    const car = this.car.root;
    if (this.smoothYaw === undefined || k < 0.05) this.smoothYaw = p.yaw;
    let dy = p.yaw - this.smoothYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.smoothYaw += dy * Math.min(1, dt * 3.5);
    car.position.set(p.x, 0, p.z); car.rotation.set(0, this.smoothYaw, 0); car.updateMatrixWorld(true);
    this.car.flash(t, true);
    this.sirenT -= dt; if (this.sirenT <= 0) { audio.playSiren(null); this.sirenT = 2.6; }
    const seat = this.carWorld(this.car.rearSeat);
    this.player.root.visible = !this.xr && (k > 9.5);                // seen from outside only
    this.player.setPose([seat.x, seat.y, seat.z, ...qYaw(this.smoothYaw + 0.25)], [...this.carWorld(new THREE.Vector3(0.34, 0.75, 0.75)).toArray(), 0, 0, 0, 1], [...this.carWorld(new THREE.Vector3(0.5, 0.75, 0.75)).toArray(), 0, 0, 0, 1], dt);
    if (this.xr) return this.vrSeat(seat, this.smoothYaw);
    if (k < 5) this.cam(this.carWorld(new THREE.Vector3(0.36, 1.42 + Math.sin(t * 9) * 0.006, 0.95)), this.carWorld(new THREE.Vector3(0.3, 1.1, -5)), true);
    else if (k < 9.5) this.cam(seat, this.carWorld(new THREE.Vector3(4, 1.05, 0.4)), true);
    else if (k < 14) {
      if (!this.roadCam || this.roadCam.shot !== 1) { const a = this.ride.at(Math.min(this.rideLen, s + 30)); this.roadCam = { shot: 1, p: new THREE.Vector3(a.x + Math.cos(a.yaw) * 5, 2.2, a.z - Math.sin(a.yaw) * 5) }; }
      this.cam(this.roadCam.p, new THREE.Vector3(p.x, 0.9, p.z), true);
    } else {
      const back = new THREE.Vector3(Math.sin(this.smoothYaw), 0, Math.cos(this.smoothYaw));
      this.cam(new THREE.Vector3(p.x + back.x * 9, 4.6, p.z + back.z * 9), new THREE.Vector3(p.x, 1, p.z), true);
    }
  }

  // VR: sit in the back seat facing forward. Only the car turning rotates you, never a camera cut.
  vrSeat(seat, yaw) {
    const rig = this.rig, cam = this.camera;
    if (this.lastCarYaw === null) {
      const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
      rig.rotation.set(0, yaw - e.y, 0); this.lastCarYaw = yaw;
    }
    const d = Math.atan2(Math.sin(yaw - this.lastCarYaw), Math.cos(yaw - this.lastCarYaw)); this.lastCarYaw = yaw;
    rig.rotation.y += d;
    const local = new THREE.Vector3(cam.position.x, 0, cam.position.z).applyAxisAngle(UP, rig.rotation.y);
    rig.position.set(seat.x - local.x, seat.y - cam.position.y, seat.z - local.z);
  }
  vrStand(x, y, z, yaw) {
    const rig = this.rig, cam = this.camera;
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    rig.rotation.set(0, yaw - e.y, 0);
    const local = new THREE.Vector3(cam.position.x, 0, cam.position.z).applyAxisAngle(UP, rig.rotation.y);
    rig.position.set(x - local.x, y, z - local.z);
  }

  // ---------------------------------------------------------------- scene 3: prison arrival
  scene3(t, dt) {
    const k = t - S3;
    const car = this.car.root;
    const AP = this.approach;
    const s = AP.L * ease(Math.min(1, k / 5.4));
    const p = AP.at(s);
    car.position.set(p.x, 0, p.z); car.rotation.set(0, p.yaw, 0); car.updateMatrixWorld(true);
    this.car.flash(t, true);
    // the gate opens for the car and closes behind it
    const gate = this.prisonView.doors.get('gate');
    this.prisonView.override = { gate: k > 0.4 && k < 4.6 };
    if (k > 0.4 && !this.gateSound) { this.gateSound = true; audio.playGate(new THREE.Vector3(0, 3, 344)); }
    if (k > 4.6 && !this.gateSound2) { this.gateSound2 = true; audio.playGate(new THREE.Vector3(0, 3, 344)); }
    // guards at the entrance
    this.guards.forEach((g, i) => { g.root.visible = true; this.animCop(g, i ? 5 : -5, 0, 347, i ? Math.PI * 0.75 : -Math.PI * 0.75, false, t, 'idle'); });
    const seat = this.carWorld(this.car.rearSeat);
    const door = { x: 0, z: 365.6 };
    if (k < 5.6) {
      this.cops.forEach(c => c.root.visible = false);
      this.player.root.visible = !this.xr && k > 3;
      this.player.setPose([seat.x, seat.y, seat.z, ...qYaw(p.yaw + 0.25)], [...this.carWorld(new THREE.Vector3(0.34, 0.75, 0.75)).toArray(), 0, 0, 0, 1], [...this.carWorld(new THREE.Vector3(0.5, 0.75, 0.75)).toArray(), 0, 0, 0, 1], dt);
      if (this.xr) return this.vrSeat(seat, p.yaw);
      if (k < 3) this.cam(new THREE.Vector3(9, 2.4, 333), new THREE.Vector3(p.x, 1.2, p.z), true);
      else this.cam(new THREE.Vector3(-9.5, 3.4, 363), new THREE.Vector3(lerp(p.x, 0, 0.5), 1.3, lerp(p.z, 347, 0.4)), true);
      return;
    }
    // escort out of the car and toward the admin building, then down the corridor
    if (!this.doorSlam) { this.doorSlam = true; audio.playCarDoorSlam(); }
    const out = this.carWorld(new THREE.Vector3(1.5, 0, 0.75));
    let px, pz, yaw, walk;
    if (k < 8) { const q = ease((k - 5.6) / 2.4); px = lerp(out.x, door.x, q); pz = lerp(out.z, door.z - 0.8, q); yaw = Math.atan2(-(door.x - out.x), -(door.z - out.z)); walk = q < 1; }
    else { const q = ease((k - 8) / 2); px = 0; pz = lerp(381.5, 388.6, q); yaw = Math.PI; walk = q < 1; }
    const hy = 1.45 + (walk ? Math.abs(Math.sin(t * 7)) * 0.03 : 0);
    this.player.root.visible = !this.xr;
    this.player.setPose([px, hy, pz, ...qYaw(yaw)], [...this.local(px, hy, pz, yaw, -0.08, -0.72, 0.22), 0, 0, 0, 1], [...this.local(px, hy, pz, yaw, 0.08, -0.72, 0.22), 0, 0, 0, 1], dt);
    this.cops.forEach((c, i) => {
      c.root.visible = true;
      const [ox, oz] = rot(i ? 0.8 : -0.8, i ? 0.4 : -0.9, yaw);
      this.animCop(c, px + ox, 0, pz + oz, yaw, walk, t, i ? 'escort' : 'idle');
    });
    if (this.xr) {
      if (k < 8) this.vrStand(4.5, 0, 361, Math.atan2(-(px - 4.5), -(pz - 361)));
      else this.vrStand(0, 0, 379.6, Math.PI);
      this.player.root.visible = false;
      return;
    }
    if (k < 8) this.cam(new THREE.Vector3(7.5, 2.5, 359), new THREE.Vector3(px, 1.2, pz), k < 5.7);
    else this.cam(new THREE.Vector3(0.6, 2.0, lerp(378.8, 383, ease((k - 8) / 2))), new THREE.Vector3(px, 1.3, pz + 2), k < 8.05);
  }

  // ---------------------------------------------------------------- scene 4: six hours later
  scene4(t, dt) {
    this.prisonView.override = null;
    this.car.root.visible = false;
    for (const c of [...this.cops, ...this.guards]) c.root.visible = false;
    this.player.root.visible = false;
    const k = t - S4;
    if (k < 3.4) this.setText(this.caption, k > 0.6 && k < 3.2 ? '6 HOURS LATER...' : null, { font: 'italic bold 96px Georgia, serif' });
    else this.setText(this.caption, k > 5.6 ? 'YOU HAVE BEEN SENT TO PRISON.' : null, { w: 1600, h: 220, bg: 'rgba(20,10,40,0.82)', font: 'bold 86px Trebuchet MS, sans-serif' });
    if (k > 5.6 && !this.chime) { this.chime = true; audio.playCellDoor(null); }
    const [bx, by, bz] = this.msg.bed;
    const cell = this.map.prison.cells[this.msg.cell];
    const yaw = cell ? cell.yaw : 0;
    if (this.xr) { if (k >= 3.4) this.vrStand(bx, by, bz, yaw); return; }
    if (k < 3.4) return;
    const rise = ease((k - 5.4) / 1.8);
    const eye = new THREE.Vector3(bx, by + lerp(0.35, 1.0, rise), bz + lerp(0.55, 0.2, rise));
    const [fx, fz] = rot(0, -3, yaw);
    const look = new THREE.Vector3(lerp(bx, bx + fx, rise), lerp(by + 4, by + 0.9, rise), lerp(bz + 0.9, bz + fz, rise));
    this.cam(eye, look, true);
    if (k > 3.4 && k < 3.5) audio.playHeartbeat();
  }

  // desktop camera: smooth unless cut
  cam(pos, look, cut) {
    if (cut) { this.camPos.copy(pos); this.camLook.copy(look); }
    else { this.camPos.lerp(pos, 0.08); this.camLook.lerp(look, 0.08); }
    const rig = this.rig, cam = this.camera;
    rig.position.copy(this.camPos); rig.rotation.set(0, 0, 0);
    cam.position.set(0, 0, 0);
    const m = new THREE.Matrix4().lookAt(this.camPos, this.camLook, UP);
    cam.quaternion.setFromRotationMatrix(m);
  }

  stop() {
    if (!this.active && !this.car) return;
    this.active = false;
    if (this.car) { this.group.remove(this.car.root); this.car = null; }
    if (this.player) { this.group.remove(this.player.root); this.player.dispose(); this.player = null; }
    for (const c of [...(this.cops || []), ...(this.guards || [])]) this.group.remove(c.root);
    this.cops = []; this.guards = [];
    this.fade.visible = false; this.fade.material.opacity = 0;
    this.setText(this.caption, null); this.setText(this.hint, null);
    this.letterbox(false);
    if (this.prisonView) this.prisonView.override = null;
    this.gateSound = this.gateSound2 = this.doorSlam = this.chime = false; this.vrPlaced = false; this.smoothYaw = undefined; this.roadCam = null;
    audio.stopRadio();
  }
}
