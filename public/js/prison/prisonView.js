// Client-side prison visuals: buildings (merged meshes), animated doors, electric fence, cameras,
// searchlights, alarm lights, escape items, the basketball, and interaction markers.
// The city and the prison are never visible at the same time, so only one of them is drawn.
import * as THREE from 'three';
import { buildCity } from '../engine/city.js';
import { GeoBatch, trs, MAT, textCanvas } from '../engine/geo.js';
import { inPrisonArea, ITEMS } from '/shared/prison.js';

const KIND_COL = { bars: 0x4f5b66, fence: 0x9aa5ab, panel: 0x7f8c8d, tile: 0x9fc3d6, gate: 0x5d6d7e, steel: 0x5d6d7e };

export class PrisonView {
  constructor(scene, map, cityMeshes) {
    this.scene = scene; this.P = map.prison; this.city = cityMeshes;
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    const sub = new THREE.Scene();
    const built = buildCity(sub, { boxes: this.P.boxes.filter(b => !b.door && !b.fence), windows: [], props: this.P.props, labels: this.P.labels });
    for (const o of [...sub.children]) this.root.add(o);
    this.built = built;
    this.doors = new Map();
    this.buildDoors();
    this.buildFence();
    this.buildCameras();
    this.buildExtras();
    this.ball = this.buildBall();
    this.markers = new Map();
    this.itemMeshes = this.buildItems();
    this.state = { doors: [], fence: 0, cams: 0, alarm: 0, holders: {} };
    this.active = false;
    this.t = 0;
  }

  // ---------------------------------------------------------------- build
  buildDoors() {
    const mat = MAT.lambert({ flatShading: true });
    for (const d of Object.values(this.P.doors)) {
      const [x0, y0, z0] = d.min, [x1, y1, z1] = d.max;
      const w = x1 - x0, h = y1 - y0, dz = z1 - z0;
      const b = new GeoBatch(), col = KIND_COL[d.kind] || 0x5d6d7e;
      if (d.kind === 'bars' || d.kind === 'fence') {
        // vertical bars + frame
        const alongX = w >= dz, len = alongX ? w : dz, n = Math.max(2, Math.round(len / (d.kind === 'fence' ? 0.25 : 0.18)));
        for (let i = 0; i <= n; i++) {
          const a = -len / 2 + (len * i) / n;
          if (alongX) b.box(a - 0.025, -h / 2, -dz / 2, a + 0.025, h / 2, dz / 2, col); else b.box(-w / 2, -h / 2, a - 0.025, w / 2, h / 2, a + 0.025, col);
        }
        if (alongX) { b.box(-w / 2, h / 2 - 0.08, -dz / 2, w / 2, h / 2, dz / 2, col); b.box(-w / 2, -h / 2, -dz / 2, w / 2, -h / 2 + 0.08, dz / 2, col); b.box(-w / 2, -0.05, -dz / 2, w / 2, 0.05, dz / 2, col); }
        else { b.box(-w / 2, h / 2 - 0.08, -dz / 2, w / 2, h / 2, dz / 2, col); b.box(-w / 2, -h / 2, -dz / 2, w / 2, -h / 2 + 0.08, dz / 2, col); b.box(-w / 2, -0.05, -dz / 2, w / 2, 0.05, dz / 2, col); }
      } else {
        b.box(-w / 2, -h / 2, -dz / 2, w / 2, h / 2, dz / 2, col);
        if (d.kind === 'steel' && h > 2) { // window strip + handle
          if (w >= dz) { b.box(-w * 0.3, h * 0.12, -dz / 2 - 0.01, w * 0.3, h * 0.35, dz / 2 + 0.01, 0x9be7ff); b.box(w * 0.32, -0.1, -dz / 2 - 0.04, w * 0.42, 0.0, dz / 2 + 0.04, 0xf1c40f); }
          else { b.box(-w / 2 - 0.01, h * 0.12, -dz * 0.3, w / 2 + 0.01, h * 0.35, dz * 0.3, 0x9be7ff); b.box(-w / 2 - 0.04, -0.1, dz * 0.32, w / 2 + 0.04, 0.0, dz * 0.42, 0xf1c40f); }
        }
        if (d.kind === 'gate') for (let k = -4; k <= 4; k += 1) b.box(k - 0.06, -h / 2, -dz / 2 - 0.02, k + 0.06, h / 2, dz / 2 + 0.02, 0x2c3e50);
        if (d.kind === 'tile') { b.box(-w / 2 + 0.1, h / 2, -dz / 2 + 0.68, w / 2 - 0.2, h / 2 + 0.004, -dz / 2 + 0.71, 0x4a6572); }
        if (d.kind === 'panel') { for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.box(sx * w * 0.4 - 0.03, sy * h * 0.4 - 0.03, -dz / 2 - 0.02, sx * w * 0.4 + 0.03, sy * h * 0.4 + 0.03, dz / 2 + 0.02, 0xbdc3c7); }
      }
      const m = new THREE.Mesh(b.build(), mat);
      const home = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.position.copy(home); m.castShadow = true;
      this.root.add(m);
      // how it opens: cells and gates slide sideways, panels/tiles/hatches come off
      const slide = d.kind === 'bars' || d.kind === 'gate' || d.kind === 'steel' || d.kind === 'fence';
      const axis = w >= dz ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const len = Math.max(w, dz);
      const openPos = slide ? home.clone().addScaledVector(axis, len * (d.kind === 'fence' ? 0 : 0.96)).add(new THREE.Vector3(0, d.kind === 'fence' ? -20 : 0, 0)) : home.clone();
      this.doors.set(d.id, { def: d, mesh: m, home, openPos, slide, k: 0, open: false });
    }
  }

  buildFence() {
    const posts = new GeoBatch(), wires = new GeoBatch();
    for (const f of this.P.fences) {
      const [x0, y0, z0] = f.min, [x1, y1, z1] = f.max, alongX = (x1 - x0) > (z1 - z0);
      const len = alongX ? x1 - x0 : z1 - z0;
      for (let a = 0; a <= len; a += 4) {
        const x = alongX ? x0 + a : (x0 + x1) / 2, z = alongX ? (z0 + z1) / 2 : z0 + a;
        posts.box(x - 0.06, y0, z - 0.06, x + 0.06, y1, z + 0.06, 0x7f8c8d);
        posts.box(x - 0.09, y1 - 0.05, z - 0.09, x + 0.09, y1, z + 0.09, 0xf1c40f);
      }
      for (let k = 0; k < 5; k++) {
        const y = y0 + 0.25 + k * 0.36;
        if (alongX) wires.box(x0, y - 0.015, (z0 + z1) / 2 - 0.015, x1, y + 0.015, (z0 + z1) / 2 + 0.015, 0xffffff);
        else wires.box((x0 + x1) / 2 - 0.015, y - 0.015, z0, (x0 + x1) / 2 + 0.015, y + 0.015, z1, 0xffffff);
      }
    }
    this.root.add(new THREE.Mesh(posts.build(), MAT.lambert({ flatShading: true })));
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, vertexColors: true });
    this.root.add(new THREE.Mesh(wires.build(), this.wireMat));
  }

  buildCameras() {
    this.cams = [];
    for (const c of this.P.cameras) {
      const g = new THREE.Group();
      const b = new GeoBatch();
      b.box(-0.12, -0.12, -0.35, 0.12, 0.12, 0.1, 0xecf0f1); b.box(-0.08, -0.08, -0.42, 0.08, 0.08, -0.35, 0x222831);
      b.box(-0.03, 0.1, 0.0, 0.03, 0.35, 0.06, 0x7f8c8d);
      const body = new THREE.Mesh(b.build(), MAT.lambert({ flatShading: true }));
      body.rotation.x = -0.35;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      led.position.set(0.07, 0.1, -0.3); body.add(led);
      g.add(body); g.position.set(...c.p); g.rotation.y = c.yaw;
      this.root.add(g);
      this.cams.push({ def: c, g, led });
    }
  }

  buildExtras() {
    // searchlights on the towers + flashing alarm beacons
    this.lights = [];
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2, transparent: true, opacity: 0.12, depthWrite: false });
    for (const p of this.P.props.filter(q => q.type === 'searchlight')) {
      const g = new THREE.Group(); g.position.set(p.x, p.y + 0.6, p.z);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0x2d3436 })); lamp.rotation.x = Math.PI / 2; g.add(lamp);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 18, 10, 1, true).translate(0, -9, 0), beamMat);
      beam.rotation.x = Math.PI / 2 + 0.55; g.add(beam);
      this.root.add(g); this.lights.push({ g, dir: p.dir, seed: this.lights.length });
    }
    this.beacons = [];
    const bm = new THREE.MeshBasicMaterial({ color: 0x551111 });
    for (const [x, y, z] of [[0, 5.15, 378], [-36, 7.2, 418], [34, 5.6, 407], [0, 8.6, 344.5], [44, 5.2, 435]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6), bm.clone());
      m.position.set(x, y, z); this.root.add(m); this.beacons.push(m);
    }
  }

  buildBall() {
    const b = new GeoBatch();
    b.geom(new THREE.SphereGeometry(0.12, 12, 8), trs(0, 0, 0), 0xe67e22);
    b.geom(new THREE.TorusGeometry(0.121, 0.006, 4, 16), trs(0, 0, 0, Math.PI / 2, 0, 0), 0x222222);
    b.geom(new THREE.TorusGeometry(0.121, 0.006, 4, 16), trs(0, 0, 0), 0x222222);
    const m = new THREE.Mesh(b.build(), MAT.lambert({ flatShading: true }));
    m.position.set(...this.P.ball); m.castShadow = true;
    this.root.add(m);
    this.ballBuf = [];
    return m;
  }

  buildItems() {
    const out = {};
    const mk = (fn) => { const b = new GeoBatch(); fn(b); return new THREE.Mesh(b.build(), MAT.lambert({ flatShading: true })); };
    const place = (item, id, mesh) => { const it = this.P.interacts.find(i => i.id === id); mesh.position.set(it.p[0], it.p[1] - 0.18, it.p[2]); this.root.add(mesh); out[item] = mesh; };
    place('SCREWDRIVER', 'screwdriver', mk(b => { b.box(-0.02, 0, -0.15, 0.02, 0.04, 0.02, 0xe74c3c); b.box(-0.006, 0.014, 0.02, 0.006, 0.026, 0.16, 0xbdc3c7); }));
    place('CUTTERS', 'cutters', mk(b => { b.box(-0.03, 0, -0.3, 0.03, 0.04, 0.05, 0xc0392b); b.box(0.04, 0, -0.3, 0.1, 0.04, 0.05, 0xc0392b); b.box(-0.02, 0.005, 0.05, 0.09, 0.035, 0.2, 0x7f8c8d); }));
    place('KEYCARD', 'drawer', mk(b => { b.box(-0.05, 0, -0.03, 0.05, 0.006, 0.03, 0xf1c40f); }));
    place('VANKEYS', 'vankeys', mk(b => { b.box(-0.02, 0, -0.02, 0.02, 0.01, 0.02, 0xbdc3c7); b.box(-0.006, 0, 0.02, 0.006, 0.01, 0.08, 0xf1c40f); }));
    out.KEYCARD.visible = false; // hidden in the drawer
    return out;
  }

  marker(it) {
    let m = this.markers.get(it.id);
    if (!m) {
      const tex = new THREE.CanvasTexture(textCanvas('✋', { w: 96, h: 96, bg: '#ffd23f', fg: '#1d1442', font: 'bold 64px Trebuchet MS, sans-serif', radius: 48 }));
      tex.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      m.scale.set(0.22, 0.22, 1); m.renderOrder = 10;
      m.position.set(it.p[0], it.p[1] + 0.35, it.p[2]);
      this.root.add(m); this.markers.set(it.id, m);
    }
    return m;
  }

  // ---------------------------------------------------------------- state
  setState(s) {
    this.state = s;
    for (const [id, d] of this.doors) d.open = s.doors.includes(id);
  }
  // instantly snap every door to its state (after a teleport)
  snapDoors() { for (const d of this.doors.values()) { d.k = d.open ? 1 : 0; d.mesh.position.lerpVectors(d.home, d.openPos, d.k); d.mesh.visible = d.slide || !d.open; } }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.root.visible = on;
    for (const m of [this.city.solidMesh, this.city.flatMesh, this.city.glowMesh, this.city.signs]) m.visible = !on;
  }

  pushBall(m) { this.ballBuf.push({ t: m.st || 0, x: m.x, y: m.y, z: m.z }); if (this.ballBuf.length > 10) this.ballBuf.shift(); this.ballHolder = m.h; }

  update(dt, serverNow, camPos, opts) {
    this.setActive(inPrisonArea(camPos.x, camPos.z));
    if (!this.active) return;
    this.t += dt;
    const t = serverNow;
    for (const [id, d] of this.doors) {
      const ov = this.override && id in this.override ? this.override[id] : d.open;   // the cutscene drives the main gate itself
      const target = ov ? 1 : 0;
      if (d.k !== target) {
        d.k += Math.sign(target - d.k) * Math.min(Math.abs(target - d.k), dt * (d.def.kind === 'gate' ? 0.35 : 1.6));
        d.mesh.position.lerpVectors(d.home, d.openPos, d.slide ? d.k : 0);
        d.mesh.visible = d.slide || d.k < 0.5;
      }
    }
    const fenceOn = !this.state.fence;
    this.wireMat.color.setHex(fenceOn ? (Math.random() < 0.06 ? 0xffffff : 0x66e0ff) : 0x2d3436);
    const camsOn = !this.state.cams;
    for (const c of this.cams) {
      c.g.rotation.y = c.def.yaw + Math.sin(t * 0.8 + c.def.id) * 0.6;
      c.led.material.color.setHex(camsOn ? ((Math.floor(t * 2) % 2) ? 0xff2222 : 0x661111) : 0x333333);
    }
    for (const l of this.lights) { l.g.rotation.y = (l.dir > 0 ? Math.PI : 0) + Math.sin(t * 0.35 + l.seed * 1.7) * 1.4; l.g.rotation.x = -0.15; }
    const alarm = this.state.alarm;
    for (const [i, b] of this.beacons.entries()) b.material.color.setHex(alarm ? ((Math.floor(t * 4 + i) % 2) ? 0xff1111 : 0x330000) : 0x551111);
    // ball (interpolated)
    const bb = this.ballBuf;
    if (opts.myBall && opts.handPos) this.ball.position.copy(opts.handPos);
    else if (bb.length) {
      const rt = t - 0.12;
      let i = bb.length - 1; while (i > 0 && bb[i - 1].t > rt) i--;
      const A = bb[Math.max(0, i - 1)], B = bb[i];
      const k = A === B || rt >= B.t ? 1 : Math.max(0, Math.min(1, (rt - A.t) / Math.max(1e-4, B.t - A.t)));
      this.ball.position.set(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, A.z + (B.z - A.z) * k);
    }
    this.ball.rotation.x += dt * 3;
    // escape items disappear when somebody is carrying them
    for (const [item, m] of Object.entries(this.itemMeshes)) m.visible = item === 'KEYCARD' ? false : !this.state.holders[item];
    // interaction markers near the player
    for (const it of this.P.interacts) {
      const near = opts.prisoner && Math.hypot(camPos.x - it.p[0], camPos.z - it.p[2]) < 7 && Math.abs(camPos.y - it.p[1]) < 4;
      if (near) { const m = this.marker(it); m.visible = true; m.position.y = it.p[1] + 0.35 + Math.sin(this.t * 3) * 0.04; }
      else if (this.markers.has(it.id)) this.markers.get(it.id).visible = false;
    }
  }
}

export { ITEMS };
