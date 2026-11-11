// CITY CHAOS - Golden Sniper (client side):
//  * ESP: outlines of every player (red), cop (blue) and NPC (yellow), drawn through walls. They live on
//    their own render layer, so they only show up INSIDE THE SCOPE (desktop zoom / VR scope glass).
//  * Lock-on: whatever the scope is aimed close to (and you can actually see) gets the automatic headshot.
//  * VR scope: a real zoomed view rendered onto the scope glass, like a real rifle scope.
//  * Bullet cam: after a shot the camera rides behind the golden bullet until it hits something.
import * as THREE from 'three';
import { WEAPONS, goldenFlight } from '/shared/weapons.js';
import { NPC_TYPE, NPC_STATE } from '../player/npcs.js';
import * as audio from '../audio/audio.js';

export const ESP_LAYER = 5;
const DEG = Math.PI / 180, NPC_HEAD = 1.55;
const COL = { player: 0xff3b5c, cop: 0x3fa2ff, npc: 0xffd23f, lock: 0xffffff };
const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 1.9, 0.72)); boxGeo.translate(0, 0.95, 0);
const headGeo = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.2));
const espMat = {}; for (const k in COL) espMat[k] = new THREE.LineBasicMaterial({ color: COL[k], depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, fog: false });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

function onLayer(o) { o.traverse(c => c.layers.set(ESP_LAYER)); return o; }

// scope reticle: thin duplex crosshair, mil dots and a dark edge, drawn once on a canvas
function reticleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 170, 256, 256, 256); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.fillStyle = '#000'; x.fillRect(0, 252, 160, 8); x.fillRect(352, 252, 160, 8); x.fillRect(252, 352, 8, 160); x.fillRect(252, 0, 8, 160);
  x.fillRect(160, 255, 192, 2); x.fillRect(255, 160, 2, 192);
  for (let i = -4; i <= 4; i++) if (i) { x.beginPath(); x.arc(256 + i * 22, 256, 2.6, 0, 7); x.fill(); x.beginPath(); x.arc(256, 256 + i * 22, 2.6, 0, 7); x.fill(); }
  x.fillStyle = '#ff2a2a'; x.beginPath(); x.arc(256, 256, 2.4, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class GoldenSniper {
  constructor({ scene, world, remote, npcs, effects, isFriend, myRole }) {
    Object.assign(this, { scene, world, remote, npcs, effects, isFriend, myRole });
    this.markers = []; this.cands = [];
    this.lock = null;
    this.zoom = 0;                 // 0 = low zoom, 1 = high zoom
    this.bullets = [];
    this.cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.03, 600);  // desktop bullet cam
    this.bc = null;                // active bullet cam (follows this bullet)
    this.scopeCam = new THREE.PerspectiveCamera(8, 1, 0.08, 650); this.scopeCam.layers.enable(ESP_LAYER);
    this.rt = null; this.reticle = null;
  }
  get active() { return !!this.bc; }

  // ---------------------------------------------------------------- targets + ESP
  gather() {
    const out = this.cands; out.length = 0;
    for (const p of this.remote.players.values()) {
      if (!p.alive || !p.head || !p.info || !p.info.connected || p.info.jail === 1 || this.isFriend(p.info)) continue;
      out.push({ kind: 'p', id: p.info.id, cls: p.info.role === 'cop' ? 'cop' : 'player', hx: p.head[0], hy: p.head[1], hz: p.head[2], fy: p.head[1] - 1.62, name: p.info.name });
    }
    for (const n of this.npcs.map.values()) {
      if (!n.alive || n.state === NPC_STATE.DEAD || !n.buf.length) continue;
      if (n.type !== NPC_TYPE.PED && n.type !== NPC_TYPE.SHOP && n.type !== NPC_TYPE.COP) continue; // prison NPCs can't be shot
      out.push({ kind: 'n', id: n.id, cls: n.type === NPC_TYPE.COP ? 'cop' : 'npc', hx: n.x, hy: n.y + NPC_HEAD, hz: n.z, fy: n.y, name: n.type === NPC_TYPE.COP ? 'Police' : n.type === NPC_TYPE.SHOP ? 'Shopkeeper' : 'Civilian' });
    }
    return out;
  }
  // best target within coneDeg of the aim ray that's in plain sight
  computeLock(o, d, coneDeg) {
    const minCos = Math.cos(coneDeg * DEG), range = WEAPONS.golden.range, cop = this.myRole() === 'cop';
    let best = null, bestCos = minCos;
    for (const c of this.cands.length ? this.cands : this.gather()) {
      if (cop && c.kind === 'n' && c.cls === 'cop') continue; // cops can't hurt police NPCs
      const dx = c.hx - o.x, dy = c.hy - o.y, dz = c.hz - o.z, dist = Math.hypot(dx, dy, dz);
      if (dist < 1 || dist > range) continue;
      const k = (dx * d.x + dy * d.y + dz * d.z) / dist;
      if (k <= bestCos) continue;
      const wall = this.world.raycast(o.x, o.y, o.z, dx / dist, dy / dist, dz / dist, dist);
      if (wall < dist - 0.35) continue;
      bestCos = k; best = { kind: c.kind, id: c.id, cls: c.cls, name: c.name, dist };
    }
    this.lock = best;
    return best;
  }
  headOf(kind, id, out = new THREE.Vector3()) {
    if (kind === 'p') { const p = this.remote.players.get(id); return p && p.head ? out.set(p.head[0], p.head[1], p.head[2]) : null; }
    const n = this.npcs.map.get(id); return n ? out.set(n.x, n.y + NPC_HEAD, n.z) : null;
  }

  // every frame while the Golden Sniper is held: update outlines + lock (show = draw ESP at all)
  update(dt, { held, o, d, cone, show }) {
    const cands = held ? this.gather() : (this.cands.length = 0, this.cands);
    if (held && o) this.computeLock(o, d, cone); else this.lock = null;
    let i = 0;
    if (held && show) {
      const t = performance.now() / 1000;
      for (const c of cands) {
        let m = this.markers[i];
        if (!m) {
          m = { g: new THREE.Group(), box: new THREE.LineSegments(boxGeo, espMat.npc), head: new THREE.LineSegments(headGeo, espMat.npc) };
          m.g.add(m.box, m.head); m.box.renderOrder = m.head.renderOrder = 1000; m.g.frustumCulled = false;
          m.box.frustumCulled = m.head.frustumCulled = false;
          onLayer(m.g); this.scene.add(m.g); this.markers[i] = m;
        }
        const locked = this.lock && this.lock.kind === c.kind && this.lock.id === c.id;
        const mat = locked ? espMat.lock : espMat[c.cls];
        m.box.material = mat; m.head.material = mat;
        m.g.visible = true;
        m.box.position.set(c.hx, c.fy, c.hz); m.box.scale.set(1, (c.hy + 0.25 - c.fy) / 1.9, 1);
        m.head.position.set(c.hx, c.hy, c.hz);
        const s = locked ? 1.5 + Math.sin(t * 12) * 0.25 : 1; m.head.scale.setScalar(s); m.head.rotation.y = t * (locked ? 6 : 1.5);
        i++;
      }
    }
    for (; i < this.markers.length; i++) this.markers[i].g.visible = false;
    for (const b of this.bullets) this.flyBullet(b, dt);
    this.bullets = this.bullets.filter(b => !b.gone);
    if (this.bc && this.bc.gone) this.bc = null;
  }

  // ---------------------------------------------------------------- VR scope glass
  renderScope(renderer, scene, model, headPos, xr) {
    const sc = model && model.userData.scope; if (!sc) return;
    const lens = sc.lens;
    const eye = sc.eye.getWorldPosition(_v);
    const fwd = _v2.set(0, 0, -1).applyQuaternion(model.getWorldQuaternion(_q));
    const toEye = eye.clone().sub(headPos), dEye = toEye.length();
    const close = xr && dEye < 0.24 && (dEye < 0.04 || toEye.divideScalar(dEye).dot(fwd) > 0.55); // eye right behind the scope
    if (!close) { if (lens.material.map) { lens.material.map = null; lens.material.color.set(0x0b1626); lens.material.needsUpdate = true; } if (this.reticle) this.reticle.visible = false; return; }
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(512, 512, { samples: 2 });
      this.reticle = new THREE.Mesh(new THREE.CircleGeometry(0.0236, 28), new THREE.MeshBasicMaterial({ map: reticleTexture(), transparent: true, depthWrite: false }));
    }
    if (this.reticle.parent !== model) { model.add(this.reticle); this.reticle.position.copy(sc.lens.position); this.reticle.position.z += 0.0006; }
    this.reticle.visible = true;
    const cam = this.scopeCam;
    cam.fov = this.zoom ? 3.5 : 8; cam.updateProjectionMatrix();
    sc.anchor.getWorldPosition(cam.position); sc.anchor.getWorldQuaternion(cam.quaternion); cam.updateMatrixWorld(true);
    const xrOn = renderer.xr.enabled, prev = renderer.getRenderTarget(), shadowAU = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    lens.visible = false; this.reticle.visible = false;
    try { renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, cam); }
    finally { renderer.setRenderTarget(prev); renderer.xr.enabled = xrOn; renderer.shadowMap.autoUpdate = shadowAU; lens.visible = true; this.reticle.visible = true; }
    if (lens.material.map !== this.rt.texture) { lens.material.map = this.rt.texture; lens.material.color.set(0xffffff); lens.material.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- the golden bullet + bullet cam
  // from: muzzle, lock: {kind,id} or null, end: where a straight shot stops. cam: ride the bullet.
  fire({ from, dir, lock, end, fly, cam }) {
    const target = lock ? this.headOf(lock.kind, lock.id) : end.clone();
    const tgt = target || end.clone();
    const dist = from.distanceTo(tgt);
    const b = {
      start: from.clone(), pos: from.clone(), last: tgt.clone(), lock: lock ? { kind: lock.kind, id: lock.id } : null,
      t: 0, dur: fly || goldenFlight(dist), hold: 0, hit: false, gone: false, cam, dir: dir.clone().normalize(), trail: []
    };
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 10), new THREE.MeshPhongMaterial({ color: 0xffcf3a, emissive: 0x5a3c00, shininess: 120, specular: 0xffffff }));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 10), body.material); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.04; mesh.add(tip);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.add(glow);
    const N = 36, tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false; b.N = N; b.trailMesh = trail;
    b.mesh = mesh; this.scene.add(mesh, trail);
    this.bullets.push(b);
    if (cam) { this.bc = b; audio.playBulletCam(b.dur); b.follow = cam === 'vr' ? 0.3 : 0.55; b.camPos = from.clone().addScaledVector(b.dir, -b.follow); }
    return b;
  }
  // the server's answer for my shot (where it really lands / what it locked)
  confirm(m) {
    const b = this.bc || this.bullets[this.bullets.length - 1]; if (!b || b.hit) return;
    if (m.kind === 'p' || m.kind === 'n') { b.lock = { kind: m.kind, id: m.id }; }
    else { b.lock = null; b.last.set(m.e[0], m.e[1], m.e[2]); }
    if (Math.abs((m.fly || b.dur) - b.dur) > 0.05) b.dur = Math.max(b.t + 0.15, m.fly);
  }
  skip() { if (this.bc) { this.bc.cam = false; this.bc = null; } }

  flyBullet(b, dt) {
    if (b.hit) {
      b.hold -= dt;
      if (b.cam && b.hitCam) b.camPos.lerp(b.hitCam, Math.min(1, dt * 5)); // ease back to watch the hit
      if (b.hold <= 0) { b.gone = true; this.scene.remove(b.mesh, b.trailMesh); b.trailMesh.geometry.dispose(); }
      return;
    }
    b.t += dt;
    if (b.lock) { const h = this.headOf(b.lock.kind, b.lock.id, _v); if (h) b.last.copy(h); }
    const u = Math.min(1, b.t / b.dur), s = 1 - Math.pow(1 - u, 1.45);   // fast out of the barrel, slow-mo into the target
    const prev = b.pos.clone();
    b.pos.copy(b.start).lerp(b.last, s);
    const step = b.pos.clone().sub(prev);
    if (step.lengthSq() > 1e-8) b.dir.copy(step).normalize();
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), b.dir);
    b.mesh.children[0].rotation.y += dt * 40;
    b.trail.push(b.pos.clone()); if (b.trail.length > b.N) b.trail.shift();
    const arr = b.trailMesh.geometry.attributes.position.array;
    for (let i = 0; i < b.N; i++) { const p = b.trail[Math.max(0, b.trail.length - 1 - i)] || b.pos; arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; }
    b.trailMesh.geometry.attributes.position.needsUpdate = true;
    if (b.cam) {
      // ride just behind and a touch above the bullet, looking where it's going
      const want = b.pos.clone().addScaledVector(b.dir, -(b.follow || 0.55)).addScaledVector(UP, 0.07);
      b.camPos.lerp(want, Math.min(1, dt * 18));
      b.look = b.pos.clone().addScaledVector(b.dir, 4);
    }
    if (u >= 1) {
      b.hit = true; b.hold = b.cam ? 0.65 : 0.05;
      b.mesh.visible = false;
      this.effects.impact(b.last.clone(), null, false);
      if (this.effects.muzzle) this.effects.muzzle(b.last.clone(), b.dir.clone().negate(), 1.6);
      if (b.cam) {
        audio.playBulletImpact(); b.look = b.last.clone();
        // pull the camera back ~2.4 m (stopping short of any wall) so you see the hit
        const back = b.dir.clone().negate().addScaledVector(UP, 0.25).normalize();
        const room = this.world.raycast(b.last.x, b.last.y, b.last.z, back.x, back.y, back.z, 2.6);
        b.hitCam = b.last.clone().addScaledVector(back, Math.max(0.6, Math.min(2.4, (Number.isFinite(room) ? room : 2.6) - 0.3)));
      }
    }
  }
  // camera pose for the bullet cam (world position + look-at point)
  camPose() { const b = this.bc; return b ? { pos: b.camPos, look: b.look || b.pos } : null; }
}
