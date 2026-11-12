// CITY CHAOS cars: low-poly car models (with NPC drivers), traffic interpolation, and the
// local driving controller used after you hijack a car.
import * as THREE from 'three';
import { GeoBatch, trs, MAT } from '../engine/geo.js';
import { npcBodyMesh } from '../player/npcs.js';
import * as audio from '../audio/audio.js';

export const DRIVER = { NPC: 0, PLAYER: 1, NONE: 2 };
const COLORS = [0xff4d4d, 0x3a86ff, 0xffd23f, 0x2ec27e, 0x9b6bff, 0xf5f5f5, 0xff9f1c, 0x00c2c7];
const DELAY = 0.16;
export const SEAT = new THREE.Vector3(-0.42, 1.28, 0.25);   // driver's head position in car space
const HALF_L = 2.15, HALF_W = 1.0;

const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const geoCache = {};
const torus = new THREE.TorusGeometry(0.19, 0.025, 6, 16);
// open = convertible version used for the car YOU drive in VR (no roof blocking your view)
function carGeometry(ci, open = false) {
  const key = ci + (open ? 'o' : '');
  if (geoCache[key]) return geoCache[key];
  if (ci === 10) return (geoCache[key] = vanGeometry(open));
  const police = ci === POLICE || ci === 9, suv = ci === 9;
  const c = suv ? 0x1d2340 : police ? 0xf4f6fb : COLORS[ci % COLORS.length], dark = 0x23233a, trim = 0xd9dde8, glass = 0x9be7ff;
  const b = new GeoBatch(), glow = new GeoBatch();
  b.box(-1.0, 0.32, -2.15, 1.0, suv ? 1.12 : 1.0, 2.15, c);       // body
  if (suv) { for (const sx of [-1.02, 1.02]) b.box(sx - 0.004, 0.7, -1.9, sx + 0.004, 0.84, 1.9, 0xf4f6fb); b.box(-1.0, 0.3, -2.45, 1.0, 0.7, -2.22, 0x111111); }
  if (police && !suv) {
    b.box(-1.012, 0.36, -1.3, 1.012, 0.96, 0.95, 0x1d2340);         // black and white doors
    b.box(-1.01, 0.62, -2.17, 1.01, 1.003, -1.45, 0x1d2340);        // dark hood tip
    for (const sx of [-1.02, 1.02]) b.box(sx - 0.004, 0.66, -0.75, sx + 0.004, 0.86, 0.45, 0xffd23f); // gold badge stripe
    b.box(-1.0, 0.3, -2.42, 1.0, 0.62, -2.22, 0x15151f);           // push bar
  }
  if (!open) {
    const top = suv ? 1.78 : 1.62;
    b.box(-0.92, 1.0, -0.95, 0.92, top, suv ? 1.9 : 1.15, c);                // cabin
    b.box(-0.95, top - 0.02, -0.9, 0.95, top + 0.06, suv ? 1.85 : 1.1, new THREE.Color(c).multiplyScalar(0.85).getHex()); // roof
  } else {
    b.box(-0.95, 1.0, -0.95, 0.95, 1.18, -0.7, dark);              // dashboard
    for (const sx of [-0.9, 0.86]) b.box(sx, 1.18, -0.93, sx + 0.04, 1.5, -0.89, dark); // windshield pillars (no glass, so you can see)
    b.geom(torus, trs(SEAT.x, 1.1, -0.42, -1.1, 0, 0), dark);      // steering wheel
    b.box(SEAT.x - 0.02, 0.95, -0.62, SEAT.x + 0.02, 1.08, -0.45, dark);
    b.box(-0.85, 0.7, 0.35, 0.85, 1.25, 0.6, 0x5c5f73);            // seat backs
  }
  b.box(-1.03, 0.28, -2.22, 1.03, 0.55, -2.05, dark);             // front bumper
  b.box(-1.03, 0.28, 2.05, 1.03, 0.55, 2.22, dark);               // rear bumper
  if (!police) b.box(-1.02, 0.55, -0.6, 1.02, 0.62, 0.6, trim);   // side stripe
  if (police) b.box(-0.7, open ? 1.0 : 1.68, open ? 1.45 : -0.15, 0.7, open ? 1.1 : 1.76, open ? 1.75 : 0.15, 0x2a2a35); // light bar base
  // windows (slightly outside the cabin)
  if (!open) {
    b.quad(0, 1.33, -0.96, 1.6, 0.48, 'z', -1, glass); b.quad(0, 1.33, 1.16, 1.6, 0.48, 'z', 1, glass);
    b.quad(-0.93, 1.33, 0.1, 1.85, 0.46, 'x', -1, glass); b.quad(0.93, 1.33, 0.1, 1.85, 0.46, 'x', 1, glass);
  }
  // wheels + hubcaps
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) {
    b.geom(cyl, trs(sx * 0.98, 0.42, sz, 0, 0, Math.PI / 2, 0.42, 0.3, 0.42), 0x1b1b24);
    b.geom(cyl, trs(sx * 1.13, 0.42, sz, 0, 0, Math.PI / 2, 0.2, 0.02, 0.2), trim);
  }
  // lights
  glow.box(-0.9, 0.62, -2.16, -0.5, 0.82, -2.14, 0xfff6c0); glow.box(0.5, 0.62, -2.16, 0.9, 0.82, -2.14, 0xfff6c0);
  glow.box(-0.9, 0.62, 2.14, -0.55, 0.8, 2.16, 0xff3030); glow.box(0.55, 0.62, 2.14, 0.9, 0.8, 2.16, 0xff3030);
  return (geoCache[key] = { body: b.build(), glow: glow.build() });
}
const bodyMat = MAT.lambert(), glowMat = MAT.basic();
export const POLICE = 8;
const isPolice = (c) => c === POLICE || c === 9;   // 9 = police SUV (3+ stars)
// prison transport van (vehicle escape route)
function vanGeometry(open) {
  const b = new GeoBatch(), glow = new GeoBatch(), w = 0xf5f6fa, dark = 0x23233a;
  b.box(-1.05, 0.32, -2.4, 1.05, 1.15, 2.4, w);
  if (!open) b.box(-1.0, 1.15, -1.3, 1.0, 2.3, 2.4, w); else { b.box(-1.0, 1.15, 0.6, 1.0, 2.3, 2.4, w); b.box(-0.95, 1.0, -1.0, 0.95, 1.18, -0.75, dark); b.geom(torus, trs(SEAT.x, 1.1, -0.47, -1.1, 0, 0), dark); }
  for (const sx of [-1.06, 1.06]) b.box(sx - 0.005, 1.0, -2.3, sx + 0.005, 1.3, 2.3, 0xe67e22);
  if (!open) { b.quad(0, 1.75, -1.31, 1.8, 0.7, 'z', -1, 0x9be7ff); for (const sx of [-1, 1]) for (let z = -0.2; z < 2.2; z += 0.8) b.quad(sx * 1.005, 1.85, z, 0.5, 0.3, 'x', sx, 0x2c3e50); }
  b.box(-1.08, 0.28, -2.48, 1.08, 0.55, -2.3, dark); b.box(-1.08, 0.28, 2.3, 1.08, 0.55, 2.48, dark);
  for (const sx of [-1, 1]) for (const sz of [-1.55, 1.55]) b.geom(cyl, trs(sx * 1.02, 0.42, sz, 0, 0, Math.PI / 2, 0.42, 0.3, 0.42), 0x1b1b24);
  glow.box(-0.9, 0.62, -2.41, -0.5, 0.82, -2.39, 0xfff6c0); glow.box(0.5, 0.62, -2.41, 0.9, 0.82, -2.39, 0xfff6c0);
  glow.box(-0.9, 0.62, 2.39, -0.55, 0.8, 2.41, 0xff3030); glow.box(0.55, 0.62, 2.39, 0.9, 0.8, 2.41, 0xff3030);
  return { body: b.build(), glow: glow.build() };
}
// The police car used in the arrest cutscene: open frame with see-through windows, a back seat and a cage,
// so the camera (or your VR head) can sit in the back and watch the city go by.
export function cutsceneCar() {
  const root = new THREE.Group();
  const g = carGeometry(POLICE, true);
  const body = new THREE.Mesh(g.body, bodyMat); body.castShadow = true; root.add(body);
  root.add(new THREE.Mesh(g.glow, glowMat));
  const b = new GeoBatch(), dark = 0x23233a, c = 0xf4f6fb;
  for (const [x, z] of [[-0.9, -0.93], [0.86, -0.93], [-0.92, 0.25], [0.88, 0.25], [-0.92, 1.12], [0.88, 1.12]]) b.box(x, 1.0, z, x + 0.05, 1.64, z + 0.05, dark); // pillars
  b.box(-0.95, 1.62, -0.92, 0.95, 1.7, 1.17, c);                         // roof
  b.box(-0.85, 0.6, 1.0, 0.85, 1.3, 1.2, 0x3d3f52); b.box(-0.85, 0.6, 0.45, 0.85, 0.78, 1.05, 0x3d3f52); // back bench
  for (let x = -0.85; x <= 0.85; x += 0.24) b.box(x - 0.008, 0.95, 0.31, x + 0.008, 1.62, 0.33, 0x7f8c8d); // cage between front + back
  b.box(-0.9, 1.0, 0.3, 0.9, 1.03, 0.34, 0x7f8c8d);
  const frame = new THREE.Mesh(b.build(), bodyMat); root.add(frame);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  for (const [w, h, x, y, z, ry] of [[1.75, 0.5, 0, 1.35, -0.95, 0], [1.75, 0.5, 0, 1.35, 1.16, 0], [2.0, 0.5, -0.93, 1.35, 0.1, Math.PI / 2], [2.0, 0.5, 0.93, 1.35, 0.1, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 3; root.add(m);
  }
  const lights = [new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: OFF })), new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: OFF }))];
  lights[0].position.set(-0.34, 1.8, 0); lights[1].position.set(0.34, 1.8, 0); root.add(...lights);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a2a35 })); bar.position.set(0, 1.72, 0); root.add(bar);
  return { root, lights, rearSeat: new THREE.Vector3(0.42, 1.36, 0.85), frontSeats: [new THREE.Vector3(SEAT.x, SEAT.y, SEAT.z), new THREE.Vector3(-SEAT.x, SEAT.y, SEAT.z)],
           flash(t, on) { const ph = Math.floor(t * 6) % 2; lights[0].material.color.copy(on && ph ? RED_ON : OFF); lights[1].material.color.copy(on && !ph ? BLUE_ON : OFF); } };
}
const lightGeo = new THREE.BoxGeometry(0.62, 0.16, 0.26);
const RED_ON = new THREE.Color(0xff2a2a), BLUE_ON = new THREE.Color(0x2a6bff), OFF = new THREE.Color(0x55555f);

export class Cars {
  constructor(scene) {
    this.scene = scene; this.map = new Map(); this.localId = 0;
  }
  build(id, color) {
    const g = carGeometry(color);
    const root = new THREE.Group();
    const body = new THREE.Mesh(g.body, bodyMat); body.castShadow = true; root.add(body);
    body.userData.color = color;
    root.add(new THREE.Mesh(g.glow, glowMat));
    const driver = npcBodyMesh(1000 + id, isPolice(color) ? 2 : color === 10 ? 3 : 0); // police cars get a uniformed cop driver
    driver.position.set(SEAT.x, SEAT.y - 1.55, SEAT.z); driver.scale.setScalar(0.95);
    root.add(driver);
    let lights = null;
    if (isPolice(color)) {
      lights = [new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: OFF })), new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: OFF }))];
      const ly = color === 9 ? 1.94 : 1.84;
      lights[0].position.set(-0.34, ly, 0); lights[1].position.set(0.34, ly, 0);
      for (const l of lights) root.add(l);
    }
    this.scene.add(root);
    return { id, root, body, driver, lights, police: isPolice(color), van: color === 10, lightY: color === 9 ? 1.94 : 1.84, siren: false, buf: [], x: 0, y: 0, z: 0, yaw: 0, speed: 0, driverKind: 0, pid: 0, open: false };
  }
  sync(list, st) {
    if (!list) return;
    const seen = new Set();
    for (const a of list) {
      const [id, x, y, z, yaw, speed, dk, pid, color, , siren, crook] = a;
      seen.add(id);
      let c = this.map.get(id);
      if (!c) { c = this.build(id, color); this.map.set(id, c); c.x = x; c.y = y; c.z = z; c.yaw = yaw; }
      c.buf.push({ t: st, x, y, z, yaw, speed });
      if (c.buf.length > 20) c.buf.shift();
      c.driverKind = dk; c.pid = pid;
      if (!!crook !== !!c.crook) {   // a car thief behind the wheel (masked robber instead of the normal driver)
        c.crook = !!crook;
        const d = npcBodyMesh(c.crook ? 6000 + id : 1000 + id, c.crook ? 6 : 0);
        d.position.copy(c.driver.position); d.scale.copy(c.driver.scale); c.root.remove(c.driver); c.root.add(d); c.driver = d;
      }
      c.driver.visible = dk === DRIVER.NPC;
      c.siren = !!siren;
    }
    // temporary cars (police dispatch) disappear when the server removes them
    for (const [id, c] of this.map) if (!seen.has(id) && id !== this.localId) { this.scene.remove(c.root); this.map.delete(id); }
  }
  clear() { for (const c of this.map.values()) this.scene.remove(c.root); this.map.clear(); }
  get(id) { return this.map.get(id); }

  update(dt, serverNow, camPos, local, firstPerson = false) {
    const t = serverNow - DELAY;
    for (const c of this.map.values()) {
      const wantOpen = !!(local && c.id === local.id && firstPerson) || c.id === this.rideId;   // open top for the car you're driving (VR) or riding in
      if (wantOpen !== c.open) { c.open = wantOpen; c.body.geometry = carGeometry(c.body.userData.color, wantOpen).body; }
      if (local && c.id === local.id) {
        c.x = local.x; c.y = local.y; c.z = local.z; c.yaw = local.yaw; c.speed = local.speed;
      } else if (c.buf.length) {
        const b = c.buf;
        let i = b.length - 1; while (i > 0 && b[i - 1].t > t) i--;
        const A = b[Math.max(0, i - 1)], B = b[i];
        const k = A === B || t >= B.t ? 1 : Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-4, B.t - A.t)));
        c.x = A.x + (B.x - A.x) * k; c.y = A.y + (B.y - A.y) * k; c.z = A.z + (B.z - A.z) * k;
        let d = B.yaw - A.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw = A.yaw + d * k; c.speed = B.speed;
      }
      const far = Math.hypot(c.x - camPos.x, c.z - camPos.z) > 140;
      c.root.visible = !far;
      if (far) continue;
      c.root.position.set(c.x, c.y, c.z); c.root.rotation.y = c.yaw;
      if (c.lights) {
        // light bar sits on the roof, or on the trunk of the open top car you're driving in VR
        const y = c.open ? 1.16 : c.lightY, z = c.open ? 1.6 : 0;
        c.lights[0].position.set(-0.34, y, z); c.lights[1].position.set(0.34, y, z);
        const ph = Math.floor(serverNow * 6) % 2;
        c.lights[0].material.color.copy(c.siren ? (ph ? RED_ON : OFF) : OFF);
        c.lights[1].material.color.copy(c.siren ? (ph ? OFF : BLUE_ON) : OFF);
        if (c.siren) {
          c.sirenT = (c.sirenT || 0) - dt;
          if (c.sirenT <= 0 && Math.hypot(c.x - camPos.x, c.z - camPos.z) < 90) { audio.playSiren(new THREE.Vector3(c.x, c.y + 1.5, c.z)); c.sirenT = 2.6; }
        }
      }
    }
  }
  // nearest car to a point (xz) within range
  nearest(p, range) {
    let best = null, bd = range;
    for (const c of this.map.values()) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd && Math.abs(p.y - c.y) < 3) { bd = d; best = c; }
    }
    return best;
  }
  seatWorld(c, out = new THREE.Vector3()) {
    out.copy(SEAT).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); out.x += c.x; out.y += c.y; out.z += c.z;
    return out;
  }
  // left door point (where you get out)
  doorWorld(c, out = new THREE.Vector3()) {
    out.set(-2.1, 0, 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); out.x += c.x; out.y = c.y; out.z += c.z;
    return out;
  }
}

// ------------------------------------------------------------------------------------------------
// Local driving: simple arcade car physics with world + traffic collisions.
export class Driving {
  constructor(world, cars) { this.world = world; this.cars = cars; this.car = null; this.vy = 0; this.crashT = 0; }
  enter(arr) {
    const [id, x, y, z, yaw] = arr;
    this.car = { id, x, y, z, yaw, speed: 0 };
    this.vy = 0;
    audio.playDoor();
  }
  exit() { this.car = null; audio.engine(false); audio.playDoor(); }
  get active() { return !!this.car; }

  hits(x, y, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const o of [-1.25, 0, 1.25]) if (this.world.sphereOverlaps(x + fx * o, y + 1.0, z + fz * o, 0.95)) return true; // 5cm clearance so the surface the car sits on never counts as a wall
    return false;
  }

  // input: { throttle: -1..1, steer: -1..1, brake: bool }
  update(dt, input) {
    const c = this.car; if (!c) return null;
    const ev = { crash: 0 };
    // engine + steering
    const accel = input.throttle > 0 ? (c.speed < 0 ? 18 : 10) : input.throttle < 0 ? (c.speed > 0 ? -18 : -6) : 0;
    c.speed += accel * Math.abs(input.throttle || 0) * dt * (accel ? 1 : 0);
    if (!input.throttle) c.speed *= Math.max(0, 1 - dt * 0.9);       // coast
    if (input.brake) c.speed *= Math.max(0, 1 - dt * 4);
    c.speed = THREE.MathUtils.clamp(c.speed, -7, 26);
    const grip = c.speed / (Math.abs(c.speed) + 2.5);                  // no turning when stopped
    c.yaw -= input.steer * 1.7 * grip * dt;
    // move with collision (try full move, then slide on each axis)
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const dx = fx * c.speed * dt, dz = fz * c.speed * dt;
    if (!this.hits(c.x + dx, c.y, c.z + dz, c.yaw)) { c.x += dx; c.z += dz; }
    else if (!this.hits(c.x + dx, c.y, c.z, c.yaw)) { c.x += dx; c.speed *= 0.85; }
    else if (!this.hits(c.x, c.y, c.z + dz, c.yaw)) { c.z += dz; c.speed *= 0.85; }
    else { if (Math.abs(c.speed) > 4) ev.crash = Math.abs(c.speed); c.speed *= -0.25; }
    // other cars
    for (const o of this.cars.map.values()) {
      if (o.id === c.id) continue;
      const ox = c.x - o.x, oz = c.z - o.z, d = Math.hypot(ox, oz);
      if (d < 3.4 && d > 0.01) {
        c.x += ox / d * (3.4 - d); c.z += oz / d * (3.4 - d);
        if (Math.abs(c.speed) > 4) ev.crash = Math.max(ev.crash, Math.abs(c.speed));
        c.speed *= -0.3;
      }
    }
    // ground: follow ramps / curbs, fall off ledges
    const d = this.world.raycast(c.x, c.y + 1.4, c.z, 0, -1, 0, 30);
    const ground = Number.isFinite(d) ? c.y + 1.4 - d : c.y - 5;
    if (ground >= c.y - 0.05) { c.y += Math.min(ground - c.y, 6 * dt + 0.06); this.vy = 0; }
    else { this.vy -= 20 * dt; c.y = Math.max(ground, c.y + this.vy * dt); }
    const H = 118; c.x = THREE.MathUtils.clamp(c.x, -H, H); c.z = THREE.MathUtils.clamp(c.z, -H, H);
    if (ev.crash) { audio.playCrash(ev.crash); }
    audio.engine(true, Math.abs(c.speed));
    return ev;
  }
  stateArr() { const c = this.car; return [c.id, +c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2), +c.yaw.toFixed(3), +c.speed.toFixed(2)]; }
}
