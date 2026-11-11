// CITY CHAOS movement.
//
// 1) Gorilla: Gorilla Tag-style arm locomotion for VR.
//    Each hand is a small sphere. When a hand touches a surface it "sticks" there, and moving
//    your real hand moves your BODY the opposite way (push the ground back -> you go forward,
//    push down -> you go up, pull on a ledge -> you climb). When you let go, your body keeps the
//    velocity it had (times a jump multiplier), so you can run, leap, wall-jump and swing.
//    Only the head and hands collide, exactly like Gorilla Tag, so you can't clip through walls.
//
// 2) Walker: classic capsule movement for desktop (WASD) and the VR joystick comfort mode,
//    with step-up for stairs, ladders and ledge mantling.
import * as THREE from 'three';

const G = 9.8;
const HAND_R = 0.075, HEAD_R = 0.22;
// RELEASE: how far a planted hand moves AWAY from the surface before it lets go (small = not sticky).
// MAX_JUMP / jump multiplier match Gorilla Tag's feel (about 6.5 m/s top launch speed, 1.1x).
const UNSTICK = 0.6, MAX_ARM = 1.55, RELEASE = 0.012, VEL_LIMIT = 0.45, MAX_JUMP = 6.5;
const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };
const v3 = (o) => ({ x: o.x, y: o.y, z: o.z });

function sweep(world, from, to, r) {
  _a.x = from.x; _a.y = from.y; _a.z = from.z; _b.x = to.x; _b.y = to.y; _b.z = to.z;
  return world.sweepSphere(_a, _b, r);
}

export class Gorilla {
  constructor(world) {
    this.world = world;
    this.vel = new THREE.Vector3();
    this.hands = [0, 1].map(() => ({ last: new THREE.Vector3(), touching: false, init: false, prev: new THREE.Vector3(), contact: null }));
    this.hist = [];
    this.anyTouching = false;
    this.jumpMult = 1.1;
  }
  reset() { this.vel.set(0, 0, 0); this.hist = []; this.hands.forEach(h => { h.init = false; h.touching = false; }); }

  // Phase 1: hand contacts -> where should the body move? (null if no hand is pushing)
  // A planted hand stays "stuck" to its contact point until you pull it AWAY from the surface
  // (along the surface normal). Dragging it along the ground moves your body instead.
  handOffsets(dt, head, hands, useHands = true, slide = false) {
    const drop = 0.5 * G * dt * dt; // tiny downward bias so a hand resting on the floor still registers
    const offsets = [];
    if (!useHands) { this.hands.forEach(h => { h.touching = false; h.init = false; }); return null; }
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i], cur = hands[i];
      h.pushing = false;
      if (!h.init) { h.last.copy(cur); h.prev.copy(cur); h.init = true; h.touching = false; continue; }
      if (cur.distanceTo(head) > MAX_ARM) { h.touching = false; h.last.copy(cur); continue; }
      if (h.touching && h.contact) {
        let n = h.contact;
        if (Math.hypot(n.nx, n.ny, n.nz) < 0.5) n = h.contact = { nx: 0, ny: 1, nz: 0 }; // never trust a zero normal
        if (slide) { h.last.x = cur.x; h.last.z = cur.z; } // joystick: planted hands slide along instead of holding you back
        const away = (cur.x - h.last.x) * n.nx + (cur.y - h.last.y) * n.ny + (cur.z - h.last.z) * n.nz;
        if (away < RELEASE) {
          // lifting the hand off the surface never drags your body down/into it (that felt sticky):
          // only pushing into the surface and dragging along it move you
          const o = new THREE.Vector3(h.last.x - cur.x, h.last.y - cur.y, h.last.z - cur.z);
          if (away > 0) o.add(new THREE.Vector3(n.nx, n.ny, n.nz).multiplyScalar(away));
          offsets.push(o);
          h.pushing = true; continue;
        }
        h.touching = false; h.last.copy(cur); // released: hand pulled off the surface
        continue;
      }
      // a hand that's already inside a wall/floor (after a snap turn or a release) must come out
      // before it can grab again; otherwise it would "grab" from inside and yank you
      if (this.world.sphereOverlaps(h.last.x, h.last.y, h.last.z, HAND_R * 0.9)) {
        // never sweep from a stale point inside a wall (that caused yanks). Instead, if the hand is
        // inside geometry RIGHT NOW, it can't sink in: it gets pushed out and pushes your body (Gorilla Tag rule)
        h.last.copy(cur);
        if (this.world.sphereOverlaps(cur.x, cur.y, cur.z, HAND_R)) {
          // push the hand straight out toward your head (works even where boxes are stacked)
          const dir = head.clone().sub(cur).normalize();
          for (let d = 0.01; d <= 0.5; d += 0.01) {
            const px = cur.x + dir.x * d, py = cur.y + dir.y * d, pz = cur.z + dir.z * d;
            if (!this.world.sphereOverlaps(px, py, pz, HAND_R * 0.98)) {
              offsets.push(new THREE.Vector3(px - cur.x, py - cur.y, pz - cur.z)); h.pushing = true;
              h.newContact = { p: { x: px, y: py, z: pz }, hit: { nx: dir.x, ny: dir.y, nz: dir.z } };
              break;
            }
          }
        }
        continue;
      }
      _b.x = cur.x; _b.y = cur.y - drop; _b.z = cur.z;
      const res = this.world.sweepSphere(v3(h.last), _b, HAND_R);
      if (res.hit) {
        offsets.push(new THREE.Vector3(res.p.x - cur.x, res.p.y - cur.y, res.p.z - cur.z));
        h.pushing = true; h.newContact = res;
      }
    }
    if (!offsets.length) return null;
    const move = new THREE.Vector3();
    for (const o of offsets) move.add(o);
    move.divideScalar(offsets.length);
    if (move.length() > 0.35) move.setLength(0.35); // never let one frame of bad tracking teleport you
    return move;
  }

  // Phase 2: after the body moved by `actual`, update hand anchors + launch velocity
  finishHands(dt, head, hands, actual, pushed, forVel = actual) {
    const taps = [];
    this.anyTouching = false;
    const head2 = head.clone().add(actual);
    for (let i = 0; i < 2; i++) {
      const h = this.hands[i];
      if (!h.init) continue;
      const cur = hands[i].clone().add(actual);
      const was = h.touching;
      if (cur.distanceTo(head2) > MAX_ARM) { h.last.copy(cur); h.touching = false; h.newContact = null; continue; }
      if (h.touching) {
        // stays planted at h.last; unstick only if the arm got stretched way too far from it
        if (cur.distanceTo(h.last) > UNSTICK) { h.touching = false; h.last.copy(cur); }
      } else if (h.newContact) {
        h.last.set(h.newContact.p.x, h.newContact.p.y, h.newContact.p.z);
        h.contact = h.newContact.hit; h.touching = true;
        if (Math.hypot(h.contact.nx, h.contact.ny, h.contact.nz) < 0.5) h.contact = { nx: 0, ny: 1, nz: 0 };
      } else if (this.world.sphereOverlaps(h.last.x, h.last.y, h.last.z, HAND_R * 0.9)) {
        h.last.copy(cur); // still inside geometry: wait until the hand comes out
      } else {
        const res = sweep(this.world, h.last, cur, HAND_R);
        if (res.hit) { h.last.set(res.p.x, res.p.y, res.p.z); h.contact = res.hit; h.touching = true; }
        else h.last.copy(cur);
      }
      h.newContact = null;
      if (!was && h.touching) {
        const sp = hands[i].distanceTo(h.prev) / Math.max(dt, 1e-3);
        if (sp > 0.6) taps.push({ i, speed: sp, pos: h.last.clone() });
      }
      h.prev.copy(hands[i]);
      if (h.touching) this.anyTouching = true;
    }
    this.hist.push(forVel.clone().divideScalar(Math.max(dt, 1e-3)));
    if (this.hist.length > 5) this.hist.shift();
    if (pushed) {
      const avg = new THREE.Vector3(); this.hist.forEach(v => avg.add(v)); avg.divideScalar(this.hist.length);
      if (avg.length() > VEL_LIMIT) {
        avg.multiplyScalar(this.jumpMult);
        if (avg.length() > MAX_JUMP) avg.setLength(MAX_JUMP);
        this.vel.copy(avg);
      } else this.vel.set(0, 0, 0);
    }
    return taps;
  }

  handVisual(i) { return this.hands[i].touching ? this.hands[i].last : null; }
}

// ---------------------------------------------------------------------------- Walker
const SPHERES = [0.32, 0.9, 1.42];
const WR = 0.32;
const STEP = 0.5;

export class Walker {
  constructor(world, ladders) {
    this.world = world; this.ladders = ladders;
    this.feet = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.grounded = false; this.coyote = 0; this.onLadder = false; this.stepDist = 0;
    this.height = 1.6;
  }
  overlaps(x, y, z, scale = 0.95) {
    for (const h of SPHERES) if (h < this.height && this.world.sphereOverlaps(x, y + h, z, WR * scale)) return true;
    return false;
  }
  inLadder() {
    const c = this.feet;
    for (const l of this.ladders) {
      if (c.x > l.min[0] && c.x < l.max[0] && c.z > l.min[2] && c.z < l.max[2] && c.y + 0.4 > l.min[1] && c.y < l.max[1]) return true;
    }
    return false;
  }
  // resolve all capsule spheres; returns {ground, wall:boolean, wallN}
  resolve() {
    let ground = false, wall = false, wallN = null, ceiling = false;
    for (let k = 0; k < 2; k++) {
      for (let s = 0; s < SPHERES.length; s++) {
        const h = SPHERES[s];
        const p = { x: this.feet.x, y: this.feet.y + h, z: this.feet.z };
        const n = this.world.pushSphere(p, WR);
        if (!n) continue;
        this.feet.x = p.x; this.feet.y = p.y - h; this.feet.z = p.z;
        if (n.ny > 0.55) ground = true;
        else if (n.ny < -0.55) ceiling = true;
        else { wall = true; wallN = n; }
      }
    }
    return { ground, wall, wallN, ceiling };
  }

  // input: { wish: Vector3 (world XZ, length 0..1), sprint, jump (edge), jumpHeld, climb (0..1) }
  update(dt, input) {
    const events = { landed: 0, step: false, jumped: false };
    // self-heal if anything ever produced NaN (never let one bad frame break the game)
    if (!Number.isFinite(this.vel.x + this.vel.y + this.vel.z)) this.vel.set(0, 0, 0);
    if (!Number.isFinite(this.feet.x + this.feet.y + this.feet.z)) this.feet.set(0, 1, 0);
    if (!Number.isFinite(input.wish.x + input.wish.z)) input.wish.set(0, 0, 0);
    this.onLadder = this.inLadder();
    const speed = input.sprint ? 8.2 : 5.6;
    const tx = input.wish.x * speed, tz = input.wish.z * speed;
    const accel = this.grounded ? 14 : (this.onLadder ? 10 : 3.5);
    const k = Math.min(1, accel * dt);
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    if (this.onLadder) {
      const climb = input.climb;
      this.vel.y = climb > 0.1 ? 3.6 : climb < -0.1 ? -3 : Math.max(this.vel.y - 30 * dt, -1);
      if (input.jump) { this.vel.y = 5; this.vel.x -= input.wish.x * 4; this.vel.z -= input.wish.z * 4; events.jumped = true; }
    } else {
      this.vel.y -= 22 * dt;
      if (input.jump && (this.grounded || this.coyote > 0)) { this.vel.y = 7.4; this.grounded = false; this.coyote = 0; events.jumped = true; }
    }
    if (this.vel.y < -30) this.vel.y = -30;
    const wasGrounded = this.grounded;
    const prevVy = this.vel.y;
    const total = this.vel.clone().multiplyScalar(dt);
    const n = Math.max(1, Math.ceil(total.length() / 0.18));
    this.grounded = false;
    let blocked = false;
    for (let i = 0; i < n; i++) {
      const before = this.feet.clone();
      this.feet.x += total.x / n; this.feet.z += total.z / n;
      let r = this.resolve();
      // step up onto stairs / curbs
      if (r.wall && (wasGrounded || this.grounded)) {
        const want = new THREE.Vector3(before.x + total.x / n, before.y, before.z + total.z / n);
        const up = before.y + STEP;
        if (!this.overlaps(want.x, up, want.z, 1.04) && !this.overlaps(before.x, up, before.z, 1.04)) {
          // find the lowest free height (full-size test so we don't get pushed back off the step)
          let y = before.y + 0.04;
          while (y < up && this.overlaps(want.x, y, want.z, 1.04)) y += 0.04;
          this.feet.set(want.x, y + 0.01, want.z);
          r = { ground: true, wall: false };
        } else blocked = true;
      } else if (r.wall) blocked = true;
      this.feet.y += total.y / n;
      const r2 = this.resolve();
      if (r.ground || r2.ground) { this.grounded = true; if (this.vel.y < 0) this.vel.y = 0; }
      if ((r.ceiling || r2.ceiling) && this.vel.y > 0) this.vel.y = 0;
    }
    // stick to the ground when walking down stairs
    if (wasGrounded && !this.grounded && this.vel.y <= 0 && !this.onLadder) {
      for (let d = 0.04; d <= STEP; d += 0.04) {
        if (this.overlaps(this.feet.x, this.feet.y - d - 0.02, this.feet.z, 1.0)) { this.feet.y -= d - 0.03; this.resolve(); this.grounded = true; this.vel.y = 0; break; }
      }
    }
    // ledge mantle: jump into a wall with free space above -> climb up
    if (!this.grounded && blocked && input.jumpHeld && !this.onLadder) {
      const fx = input.wish.x, fz = input.wish.z;
      if (Math.hypot(fx, fz) > 0.3 && !this.overlaps(this.feet.x + fx * 0.5, this.feet.y + 1.0, this.feet.z + fz * 0.5)) this.vel.y = Math.max(this.vel.y, 5.2);
    }
    if (this.grounded) this.coyote = 0.12; else this.coyote -= dt;
    if (!wasGrounded && this.grounded && prevVy < -4) events.landed = -prevVy;
    if (this.grounded) {
      this.stepDist += Math.hypot(total.x, total.z);
      if (this.stepDist > (input.sprint ? 2.6 : 2.0)) { this.stepDist = 0; events.step = true; }
    }
    return events;
  }
}

// ---------------------------------------------------------------------------- VR mover
// One body for every VR mode. Arms (Gorilla), joystick, gravity, jumping, stairs and ladders all
// produce a single displacement that is moved through the world as a capsule (feet -> head).
// Because ALL rig movement happens in one place, the hand anchors stay perfectly in sync (no jitter).
const FEET_R = 0.26, HEAD_R2 = 0.2, VR_STEP = 0.5;
const GT_HEAD_R = 0.2, GT_BODY_R = 0.3, GT_BODY_DROP = 0.3, GT_STEP = 0.32;

export class VRMover {
  constructor(world, ladders) {
    this.gorilla = new Gorilla(world);
    this.world = world; this.ladders = ladders;
    this.grounded = false; this.stepDist = 0;
  }
  reset() { this.gorilla.reset(); this.grounded = false; }

  heights(headH) { return [FEET_R, Math.max(FEET_R + 0.1, (headH - 0.25) * 0.55), Math.max(0.6, headH)]; }
  overlaps(x, y, z, headH, scale = 0.95) {
    const hs = this.heights(headH);
    for (let i = 0; i < hs.length; i++) if (this.world.sphereOverlaps(x, y + hs[i], z, (i === 2 ? HEAD_R2 : FEET_R) * scale)) return true;
    return false;
  }
  resolve(f, headH) {
    let ground = false, wall = false, ceiling = false;
    const hs = this.heights(headH);
    for (let k = 0; k < 2; k++) for (let i = 0; i < hs.length; i++) {
      const p = { x: f.x, y: f.y + hs[i], z: f.z };
      const n = this.world.pushSphere(p, i === 2 ? HEAD_R2 : FEET_R);
      if (!n) continue;
      f.x = p.x; f.y = p.y - hs[i]; f.z = p.z;
      if (n.ny > 0.55) { if (i === 0) ground = true; }
      else if (n.ny < -0.55) ceiling = true;
      else if (i < 2) wall = true;
    }
    return { ground, wall, ceiling };
  }
  // move the body capsule by D with wall sliding + automatic step-up (stairs, curbs, crates edges)
  moveBody(feet, D, headH, allowStep) {
    const f = feet.clone();
    let ground = false, ceiling = false, lift = 0;
    if (!Number.isFinite(D.length())) D.set(0, 0, 0);
    const n = Math.min(60, Math.max(1, Math.ceil(D.length() / 0.12)));
    for (let i = 0; i < n; i++) {
      const before = f.clone();
      f.x += D.x / n; f.z += D.z / n;
      const r = this.resolve(f, headH);
      // blocked = we got pushed back instead of moving forward (works for stair edges at any angle)
      const want = Math.hypot(D.x / n, D.z / n);
      const got = Math.hypot(f.x - before.x, f.z - before.z);
      if ((r.wall || (want > 0.002 && got < want * 0.6)) && allowStep) {
        const wx = before.x + D.x / n, wz = before.z + D.z / n;
        for (let y = before.y + 0.04; y <= before.y + VR_STEP; y += 0.04) {
          // full-size test (+margin) so the collision pass can't shove us back off the step
          if (!this.overlaps(wx, y, wz, headH, 1.04)) { lift += y + 0.01 - f.y; f.set(wx, y + 0.01, wz); break; }
        }
      }
      f.y += D.y / n;
      const r2 = this.resolve(f, headH);
      ground = ground || r.ground || r2.ground;
      ceiling = ceiling || r.ceiling || r2.ceiling;
    }
    return { f, ground, ceiling, lift: Math.max(0, lift) };
  }

  // mode: 'gorilla' | 'both' | 'joystick'; stick: world-space wish Vector3 (x,z); jump: button edge
  // ======================================================================= Gorilla Tag physics
  // No feet. Your body is a head sphere + a torso sphere; only your HANDS hold you up.
  // Arms relaxed on the ground = you rest on them (eyes ~0.8m up). Lift them = you drop onto your torso.
  gtSpheres(c) { return [{ x: c.x, y: c.y, z: c.z, r: GT_HEAD_R }, { x: c.x, y: c.y - GT_BODY_DROP, z: c.z, r: GT_BODY_R }]; }
  gtOverlaps(c, scale = 1) {
    for (const sp of this.gtSpheres(c)) if (this.world.sphereOverlaps(sp.x, sp.y, sp.z, sp.r * scale)) return true;
    return false;
  }
  gtResolve(c) {
    let nx = 0, ny = 0, nz = 0, hit = false, ground = false;
    for (let k = 0; k < 2; k++) {
      const sps = this.gtSpheres(c);
      for (let i = 0; i < sps.length; i++) {
        const sp = sps[i], p = { x: sp.x, y: sp.y, z: sp.z };
        const n = this.world.pushSphere(p, sp.r);
        if (!n) continue;
        c.x += p.x - sp.x; c.y += p.y - sp.y; c.z += p.z - sp.z;
        nx += n.nx; ny += n.ny; nz += n.nz; hit = true;
        if (n.ny > 0.55) ground = true;
      }
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    return { hit, ground, n: hit ? { x: nx / l, y: ny / l, z: nz / l } : null };
  }
  gtMove(head, D, allowStep) {
    const c = head.clone();
    let ground = false, normal = null, lift = 0;
    if (!Number.isFinite(D.length())) D.set(0, 0, 0);
    const n = Math.min(60, Math.max(1, Math.ceil(D.length() / 0.08)));
    for (let i = 0; i < n; i++) {
      const before = c.clone();
      c.x += D.x / n; c.z += D.z / n;
      let r = this.gtResolve(c);
      const want = Math.hypot(D.x / n, D.z / n), got = Math.hypot(c.x - before.x, c.z - before.z);
      // little edge assist: when your arms push you into a low ledge (stairs, curbs, crate lips), pop over it
      if (allowStep && want > 0.002 && got < want * 0.6) {
        const wx = before.x + D.x / n, wz = before.z + D.z / n;
        for (let y = 0.03; y <= GT_STEP; y += 0.03) {
          if (!this.gtOverlaps({ x: wx, y: before.y + y, z: wz }, 1.03)) { lift += before.y + y + 0.005 - c.y; c.set(wx, before.y + y + 0.005, wz); r = { hit: false, ground: true, n: null }; break; }
        }
      }
      if (r.hit) normal = r.n;
      if (r.ground) ground = true;
      c.y += D.y / n;
      const r2 = this.gtResolve(c);
      if (r2.hit) normal = r2.n;
      if (r2.ground) ground = true;
    }
    return { actual: c.clone().sub(head), ground, normal, lift: Math.max(0, lift) };
  }
  gtUpdate(dt, rig, head, hands, { mode, stick, jump }) {
    const g = this.gorilla;
    const useHands = mode !== 'joystick';
    const events = { taps: [], step: false, landed: 0 };
    const sticking = stick && mode !== 'gorilla' && stick.lengthSq() > 0.0001;
    const handMove = g.handOffsets(dt, head, hands, useHands, sticking);
    const D = new THREE.Vector3();
    if (handMove) D.copy(handMove);
    else { g.vel.y -= G * dt; if (g.vel.y < -25) g.vel.y = -25; D.copy(g.vel).multiplyScalar(dt); }
    if (sticking) { D.x += stick.x * 3.2 * dt; D.z += stick.z * 3.2 * dt; }
    if (jump && (this.grounded || handMove)) { g.vel.y = 4.8; D.y = Math.max(D.y, 4.8 * dt); this.grounded = false; }
    const res = this.gtMove(head, D, !!handMove || sticking);
    rig.position.add(res.actual);
    const was = this.grounded;
    this.grounded = res.ground;
    if (!handMove && res.normal) {
      // bump/slide off surfaces while flying; rest on your torso when lying on the ground
      const n = res.normal, vn = g.vel.x * n.x + g.vel.y * n.y + g.vel.z * n.z;
      if (vn < 0) { if (!was && n.y > 0.55 && vn < -4) events.landed = -vn; g.vel.x -= n.x * vn; g.vel.y -= n.y * vn; g.vel.z -= n.z * vn; }
      if (n.y > 0.55) { const k = Math.max(0, 1 - dt * 6); g.vel.x *= k; g.vel.z *= k; }
    }
    const forVel = res.actual.clone(); forVel.y -= res.lift;
    events.taps = g.finishHands(dt, head, hands, res.actual, !!handMove, forVel);
    return events;
  }

  // floorOffset: Gorilla size makes you ~0.55m shorter than real life so your hands reach the ground
  update(dt, rig, head, hands, { mode, stick, jump, armBoost, floorOffset = 0, gt = false }) {
    const g = this.gorilla;
    // tracking glitches: ignore any hand that's NaN/Infinity or impossibly far from the head
    if (!Number.isFinite(head.x + head.y + head.z)) return { taps: [], step: false, landed: 0 };
    for (let i = 0; i < 2; i++) if (!Number.isFinite(hands[i].x + hands[i].y + hands[i].z) || hands[i].distanceTo(head) > 3) hands[i] = head.clone().add(new THREE.Vector3(i ? 0.25 : -0.25, -0.5, 0));
    if (!Number.isFinite(g.vel.x + g.vel.y + g.vel.z)) g.vel.set(0, 0, 0);
    g.jumpMult = 1.1 * (armBoost || 1);
    if (gt) return this.gtUpdate(dt, rig, head, hands, { mode, stick, jump });
    const useHands = mode !== 'joystick';
    const headH = THREE.MathUtils.clamp(head.y - rig.position.y - floorOffset, 0.4, 2.3);
    const events = { taps: [], step: false, landed: 0 };

    // 1) where do the hands want to push the body?
    const handMove = g.handOffsets(dt, head, hands, useHands);
    const D = new THREE.Vector3();
    if (handMove) D.copy(handMove);
    else {
      if (!this.grounded) g.vel.y -= G * dt;
      if (g.vel.y < -25) g.vel.y = -25;
      D.copy(g.vel).multiplyScalar(dt);
    }
    // 2) joystick walking (comfort modes)
    const sticking = stick && mode !== 'gorilla' && stick.lengthSq() > 0.0001;
    if (sticking) { D.x += stick.x * 3.6 * dt; D.z += stick.z * 3.6 * dt; }
    // 3) jump button
    if (jump && (this.grounded || handMove)) { g.vel.set(g.vel.x, 5.4, g.vel.z); D.y = Math.max(D.y, 5.4 * dt); this.grounded = false; }
    // 4) ladders: push the stick forward (or climb with your hands) to go up
    const feet = new THREE.Vector3(head.x, rig.position.y + floorOffset, head.z);
    let onLadder = false;
    for (const l of this.ladders) {
      if (feet.x > l.min[0] && feet.x < l.max[0] && feet.z > l.min[2] && feet.z < l.max[2] && feet.y + 0.4 > l.min[1] && feet.y < l.max[1]) { onLadder = true; break; }
    }
    if (onLadder && !handMove && sticking) {
      g.vel.y = Math.max(g.vel.y, -0.6);
      if (stick.lengthSq() > 0.15) { D.y = 3 * dt; g.vel.y = 0; }
    }
    // 5) move the body through the world
    const res = this.moveBody(feet, D, headH, this.grounded || !!handMove || sticking || onLadder);
    // stick to the floor when walking down stairs / off curbs
    if (!res.ground && this.grounded && g.vel.y <= 0.01 && !handMove && D.y <= 0) {
      for (let d = 0.04; d <= VR_STEP; d += 0.04) {
        if (this.overlaps(res.f.x, res.f.y - d - 0.02, res.f.z, headH)) { res.f.y -= d - 0.02; this.resolve(res.f, headH); res.ground = true; break; }
      }
    }
    const actual = res.f.clone().sub(feet);
    rig.position.add(actual);
    const was = this.grounded;
    this.grounded = res.ground;
    if (res.ground && g.vel.y < 0) { if (!was && g.vel.y < -4) events.landed = -g.vel.y; g.vel.y = 0; }
    if (res.ceiling && g.vel.y > 0) g.vel.y = 0;
    if (this.grounded && !handMove) { const k = Math.max(0, 1 - dt * 7); g.vel.x *= k; g.vel.z *= k; }
    // 6) hands follow the body; momentum for Gorilla launches
    // step-ups shouldn't count as upward speed (or you'd hop when letting go on stairs)
    const forVel = actual.clone(); forVel.y -= res.lift;
    events.taps = g.finishHands(dt, head, hands, actual, !!handMove, forVel);
    if (this.grounded && (sticking || handMove)) { this.stepDist += Math.hypot(actual.x, actual.z); if (this.stepDist > 1.8) { this.stepDist = 0; events.step = true; } }
    return events;
  }
}
