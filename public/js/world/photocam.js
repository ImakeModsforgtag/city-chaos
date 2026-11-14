// CITY CHAOS - 📷 the camera tablet. A handheld tablet with a live screen and buttons: take photos, record video,
// switch between the back and front (selfie) camera, mirror the picture left to right or flip it upside down, zoom,
// and stand it on a 🔺 tripod anywhere you like. Once it is on the tripod you see through it (PC: full screen,
// VR: on the tablet in your hand), you aim it wherever you want, and a 📸 CAPTURE button takes the shot, so you can
// get yourself and your friends in the picture.
// PC: V takes the tablet out. Click = photo, hold click = video, F = front/back, H = mirror, J = upside down,
// Z = zoom, T = tripod (T again picks it up), E = step away from / look through the tripod, V = put away.
// VR: Y menu > CAMERA (or the phone's 📷 app). The tablet sits in your right hand: poke its buttons with your left
// hand, tap the trigger for a photo, hold the trigger for video, right stick aims the tripod, B puts it away.
// Photos (JPG) and videos (MP4 or WEBM) download to the Downloads folder (Quest: open the Files app) and are kept
// in the phone's 🖼️ PHOTOS app (the last 30 photos and 6 videos, on this device only).
import * as THREE from 'three';
import * as audio from '../audio/audio.js';

const PHOTO_W = 1600, PHOTO_H = 1200;        // saved photo size (4:3)
const VID_W = 640, VID_H = 480, VID_FPS = 24, VID_MAX = 30;   // video clips: 640x480, 24 fps, 30 s max
const VIEW_EVERY = 3;                         // the live screen redraws every 3rd frame (saves Quest frame time)
const HOLD = 0.45;                            // hold the trigger / mouse this long to start recording
const DB = 'cc_photos', MAX_PHOTOS = 30, MAX_VIDEOS = 6;
const ZOOMS = [62, 45, 30], HEAD_H = 1.25;    // tripod camera height

// linear -> sRGB pass, with the horizontal / vertical flips baked in (render targets hold linear colors)
const encodeMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, flip: { value: new THREE.Vector2(0, 0) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D map; uniform vec2 flip; varying vec2 vUv;
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main() { vec2 uv = mix(vUv, vec2(1.0) - vUv, flip); vec3 c = clamp(texture2D(map, uv).rgb, 0.0, 1.0); gl_FragColor = vec4(toSRGB(c), 1.0); }`,
  depthTest: false, depthWrite: false
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), encodeMat); quad.frustumCulled = false; quadScene.add(quad);

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };

// ---------------------------------------------------------------- the little photo library (IndexedDB)
function db() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('shots', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbDo(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('shots', mode), st = tx.objectStore('shots'); const out = fn(st); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error); });
}
export const library = {
  async list() { try { const all = await dbDo('readonly', st => st.getAll()); return (all || []).sort((a, b) => b.id - a.id); } catch { return []; } },
  async add(item) {
    try {
      await dbDo('readwrite', st => st.add(item));
      const all = await this.list(), extra = [...all.filter(x => x.kind === 'photo').slice(MAX_PHOTOS), ...all.filter(x => x.kind === 'video').slice(MAX_VIDEOS)];
      if (extra.length) await dbDo('readwrite', st => { for (const x of extra) st.delete(x.id); });
    } catch {}
  },
  async remove(id) { try { await dbDo('readwrite', st => st.delete(id)); } catch {} }
};
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export class PhotoCam {
  constructor({ renderer, scene, weapons, notify, raycast }) {
    Object.assign(this, { renderer, scene, weapons, notify, raycast });
    this.on = false; this.front = false; this.flipH = false; this.flipV = false; this.zoom = 0;
    this.mode = 'hand'; this.povOn = false; this.rec = null; this.frame = 0; this.downAt = -1; this.busy = false; this.flash = 0;
    this.yaw = 0; this.pitch = 0; this.tapAt = 0;
    this.buildTablet(); this.buildTripod(); this.buildHud();
    // full size photo + video targets
    this.photoRT = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { type: THREE.HalfFloatType, samples: 4 });
    this.photoOut = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H);
    this.vidRT = new THREE.WebGLRenderTarget(VID_W, VID_H, { type: THREE.HalfFloatType });
    this.vidOut = new THREE.WebGLRenderTarget(VID_W, VID_H);
    this.vidPx = new Uint8Array(VID_W * VID_H * 4);
    this.vidCanvas = document.createElement('canvas'); this.vidCanvas.width = VID_W; this.vidCanvas.height = VID_H;
    this.vidCtx = this.vidCanvas.getContext('2d'); this.vidImg = this.vidCtx.createImageData(VID_W, VID_H);
    this.applyFlips();
  }

  // ---------------------------------------------------------------- the tablet you hold
  buildTablet() {
    const m = new THREE.Group(); this.model = m; m.visible = false;
    const W = 0.28, H = 0.19;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.014), new THREE.MeshLambertMaterial({ color: 0x241d3f }));
    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.008, H + 0.008, 0.008), new THREE.MeshLambertMaterial({ color: 0xff4fa3 })); rim.position.z = -0.002;
    const backLens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.016, 16), new THREE.MeshLambertMaterial({ color: 0x15151c }));
    backLens.rotation.x = Math.PI / 2; backLens.position.set(-W / 2 + 0.035, H / 2 - 0.032, -0.014);
    const backGlass = new THREE.Mesh(new THREE.CircleGeometry(0.013, 16), new THREE.MeshBasicMaterial({ color: 0x3355aa }));
    backGlass.position.copy(backLens.position).setZ(-0.023); backGlass.rotation.y = Math.PI;
    this.frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.0075, 14), new THREE.MeshBasicMaterial({ color: 0x3355aa }));
    this.frontLens.position.set(W / 2 - 0.016, H / 2 - 0.016, 0.0082);
    this.flashBulb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.009, 0.004), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    this.flashBulb.position.set(-W / 2 + 0.035, H / 2 - 0.062, -0.012);
    this.recDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 }));
    this.recDot.position.set(-W / 2 + 0.016, H / 2 - 0.016, 0.0082);
    m.add(rim, body, backLens, backGlass, this.frontLens, this.flashBulb, this.recDot);
    // live screen (what the lens sees right now)
    this.viewRT = new THREE.WebGLRenderTarget(384, 288, { type: THREE.HalfFloatType });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.246, 0.112), new THREE.MeshBasicMaterial({ map: this.viewRT.texture, toneMapped: false }));
    this.screen.position.set(0, 0.03, 0.0082); m.add(this.screen);
    // the button bar: 4 buttons across, 2 rows
    this.barC = document.createElement('canvas'); this.barC.width = 1040; this.barC.height = 300;
    this.barX = this.barC.getContext('2d');
    this.barTex = new THREE.CanvasTexture(this.barC); this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.barW = 0.26; this.barH = 0.075;
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(this.barW, this.barH), new THREE.MeshBasicMaterial({ map: this.barTex, transparent: true }));
    this.bar.position.set(0, -0.0535, 0.0082); m.add(this.bar);
    m.traverse(o => { o.castShadow = false; });
    // the camera behind the lens
    this.lensCam = new THREE.PerspectiveCamera(ZOOMS[0], 4 / 3, 0.06, 700);
    this.placeLens();
  }

  // ---------------------------------------------------------------- 🔺 the tripod
  buildTripod() {
    const g = new THREE.Group(); this.tripod = g; g.visible = false;
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a48 });
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, HEAD_H - 0.12, 7), legMat);
      leg.position.set(Math.sin(a) * 0.14, (HEAD_H - 0.12) / 2, Math.cos(a) * 0.14);
      leg.rotation.set(Math.cos(a) * -0.22, 0, Math.sin(a) * 0.22);
      g.add(leg);
    }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xff4fa3 }));
    col.position.y = HEAD_H - 0.14; g.add(col);
    const yawG = new THREE.Group(); yawG.position.y = HEAD_H; g.add(yawG); this.tYaw = yawG;
    const pitchG = new THREE.Group(); yawG.add(pitchG); this.tPitch = pitchG;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.1), new THREE.MeshLambertMaterial({ color: 0x241d3f }));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 16), new THREE.MeshLambertMaterial({ color: 0x15151c }));
    lens.rotation.x = Math.PI / 2; lens.position.z = -0.07;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), new THREE.MeshBasicMaterial({ color: 0x3355aa }));
    glass.position.z = -0.0955; glass.rotation.y = Math.PI;
    this.tDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 }));
    this.tDot.position.set(0.03, 0.046, -0.02);
    pitchG.add(head, lens, glass, this.tDot);
    g.traverse(o => { o.castShadow = false; });
    this.scene.add(g);
  }

  // ---------------------------------------------------------------- the PC button bar (same buttons as the tablet)
  buildHud() {
    const el = document.createElement('div'); el.id = 'camui'; el.className = 'hidden';
    el.innerHTML = '<div class="cam-frame"></div><div class="cam-row"></div><small>Press the keys, or tap Esc to free the mouse and click these buttons</small>';
    document.body.appendChild(el);
    this.hud = el; this.hudRow = el.querySelector('.cam-row'); this.hudKey = '';
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { e.stopPropagation(); this.act(b.dataset.a); } });
  }

  // ---------------------------------------------------------------- the buttons (same list drives the tablet and the PC bar)
  buttons() {
    const tri = this.mode === 'tripod';
    return [
      { a: 'photo', icon: '📸', label: 'PHOTO', key: 'Click', color: '#ff4fa3' },
      { a: 'video', icon: this.rec ? '⏹' : '🎥', label: this.rec ? 'STOP' : 'VIDEO', key: 'Hold click', color: this.rec ? '#b3001e' : '#8338ec', on: !!this.rec },
      tri ? { a: 'pov', icon: '👁', label: this.povOn ? 'STEP AWAY' : 'LOOK THRU', key: 'E', color: '#3a86ff', on: this.povOn }
          : { a: 'face', icon: '🔄', label: this.front ? 'FRONT CAM' : 'BACK CAM', key: 'F', color: '#3a86ff', on: this.front },
      tri ? { a: 'tripod', icon: '✋', label: 'PICK UP', key: 'T', color: '#ffd23f', on: true }
          : { a: 'tripod', icon: '🔺', label: 'TRIPOD', key: 'T', color: '#ffd23f' },
      { a: 'fliph', icon: '↔', label: 'MIRROR', key: 'H', color: '#2ec27e', on: this.flipH },
      { a: 'flipv', icon: '↕', label: 'UPSIDE DOWN', key: 'J', color: '#2ec27e', on: this.flipV },
      { a: 'zoom', icon: '🔍', label: `ZOOM ${(ZOOMS[0] / ZOOMS[this.zoom]).toFixed(1)}x`, key: 'Z', color: '#ff9f1c', on: this.zoom > 0 },
      { a: 'close', icon: '✖', label: 'PUT AWAY', key: 'V', color: '#5a5470' }
    ];
  }
  act(a) {
    switch (a) {
      case 'photo': this.photo(); break;
      case 'video': this.rec ? this.stopVideo() : this.startVideo(); break;
      case 'face': this.setFront(!this.front); break;
      case 'fliph': this.flipH = !this.flipH; this.applyFlips(); this.notify(this.flipH ? '↔ Picture mirrored' : '↔ Mirror off'); break;
      case 'flipv': this.flipV = !this.flipV; this.applyFlips(); this.notify(this.flipV ? '↕ Picture upside down' : '↕ Back the right way up'); break;
      case 'zoom': this.zoom = (this.zoom + 1) % ZOOMS.length; this.placeLens(); this.notify(`🔍 Zoom ${(ZOOMS[0] / ZOOMS[this.zoom]).toFixed(1)}x`); break;
      case 'tripod': this.mode === 'tripod' ? this.pickUp() : this.place(); break;
      case 'pov': this.povOn ? this.exitPov() : this.enterPov(); break;
      case 'close': this.setOn(false); this.notify('📷 Camera put away'); break;
      default: return false;
    }
    if (a !== 'photo') audio.playClick();
    this.barKey = ''; return true;
  }

  // ---------------------------------------------------------------- settings
  setFront(v) {
    if (this.mode === 'tripod') { this.yaw += Math.PI; return this.notify('🔄 Turned the tripod camera around'); }
    this.front = !!v; this.placeLens();
    this.notify(this.front ? '🤳 Front camera (you are in the picture)' : '📷 Back camera');
  }
  flip() { this.setFront(!this.front); }                 // kept for the old F key / menu
  get selfie() { return this.front; }
  set selfie(v) { this.front = !!v; this.placeLens(); }
  applyFlips() {
    for (const tex of [this.viewRT.texture, this.vidRT.texture]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
      tex.offset.set(this.flipH ? 1 : 0, this.flipV ? 1 : 0);
      tex.needsUpdate = true;
    }
    this.barKey = ''; this.hudKey = '';
  }
  placeLens() {
    const c = this.lensCam;
    if (this.mode === 'tripod') {
      if (c.parent !== this.tPitch) this.tPitch.add(c);
      c.position.set(0, 0, -0.1); c.rotation.set(0, 0, 0);
    } else {
      if (c.parent !== this.model) this.model.add(c);
      // front camera: VR = the little lens above the screen, PC = like a selfie stick about a meter in front of you
      if (this.front) { if (this.weapons.vr) { c.position.set(0, 0.06, 0.02); c.rotation.set(0, Math.PI, 0); } else { c.position.set(-0.1, 0.3, -0.9); c.rotation.set(-0.12, Math.PI, 0); } }
      else { c.position.set(0, 0.06, -0.02); c.rotation.set(0, 0, 0); }
    }
    c.fov = this.mode === 'tripod' ? ZOOMS[this.zoom] : this.front && !this.weapons.vr ? 75 : ZOOMS[this.zoom];
    c.updateProjectionMatrix();
  }
  get recording() { return !!this.rec; }
  get onTripod() { return this.mode === 'tripod'; }

  // ---------------------------------------------------------------- holding it
  setOn(on) {
    on = !!on; if (on === this.on) return;
    if (!on && this.rec) this.stopVideo();
    this.on = on; this.weapons.holstered = on; this.downAt = -1;
    if (on) this.attach();
    else { if (this.model.parent) this.model.parent.remove(this.model); this.exitPov(); }
    this.model.visible = on; this.hud.classList.toggle('hidden', !on || !!this.weapons.vr);
    audio.playClick();
  }
  toggle() { this.setOn(!this.on); return this.on; }
  attach() {
    const vr = this.weapons.vr, holder = vr ? this.weapons.vrHolder : this.weapons.deskHolder;
    if (!holder) return;
    if (this.model.parent !== holder) holder.add(this.model);
    this.placeLens();
    if (vr) { this.model.position.set(0.01, 0.1, -0.07); this.model.rotation.set(-0.42, 0, 0); this.model.scale.setScalar(0.9); }
    else { this.model.position.set(0.05, 0.02, -0.235); this.model.rotation.set(0.08, -0.2, 0.03); this.model.scale.setScalar(1); }
  }
  reset() { this.setOn(false); this.pickUp(true); this.rec && this.stopVideo(); }

  // ---------------------------------------------------------------- 🔺 tripod: place, aim, pick up
  // eye / dir: where you are looking from. The camera lands on the ground in front of you, facing back at you.
  place(eye, dir) {
    if (this.mode === 'tripod') return;
    eye = eye || this.eyeOf(); dir = dir || this.dirOf();
    if (!eye || !dir) return this.notify('🔺 Could not place the tripod here');
    const flat = new THREE.Vector3(dir.x, 0, dir.z); if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1); flat.normalize();
    let d = this.cast(eye.x, eye.y, eye.z, flat.x, 0, flat.z, 5);
    const dist = Math.max(1.3, Math.min(3, (Number.isFinite(d) ? d : 5) - 0.7));
    const px = eye.x + flat.x * dist, pz = eye.z + flat.z * dist;
    const down = this.cast(px, eye.y + 0.3, pz, 0, -1, 0, 7);
    const baseY = Number.isFinite(down) ? eye.y + 0.3 - down : eye.y - 1.6;
    this.tripod.position.set(px, baseY, pz); this.tripod.visible = true;
    this.yaw = Math.atan2(-(eye.x - px), -(eye.z - pz));          // look back at you
    this.pitch = Math.atan2(eye.y - (baseY + HEAD_H), dist) * 0.9;
    this.mode = 'tripod'; this.front = false; this.placeLens();
    this.notify(this.weapons.vr ? '🔺 On the tripod! The tablet shows what it sees · right stick aims it · 📸 to capture'
                                : '🔺 On the tripod! Mouse aims it · click to capture · T picks it up · E steps away');
    if (!this.weapons.vr) this.enterPov();
    this.barKey = ''; this.hudKey = '';
  }
  pickUp(quiet) {
    if (this.mode !== 'tripod') return;
    this.exitPov(); this.mode = 'hand'; this.tripod.visible = false; this.placeLens();
    if (!quiet) this.notify('✋ Camera back in your hands');
    this.barKey = ''; this.hudKey = '';
  }
  enterPov() { if (this.mode !== 'tripod' || this.weapons.vr) return; this.povOn = true; this.hudKey = ''; }
  exitPov() { if (!this.povOn) return; this.povOn = false; this.hudKey = ''; }
  // PC: the mouse aims the tripod while you look through it. VR: the right stick.
  aim(dx, dy, sens = 1) {
    if (this.mode !== 'tripod') return false;
    this.yaw -= dx * 0.0022 * sens; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022 * sens, -1.2, 1.2);
    return true;
  }
  aimStick(x, y, dt) {
    if (this.mode !== 'tripod' || (Math.abs(x) < 0.15 && Math.abs(y) < 0.15)) return false;
    this.yaw -= x * 1.6 * dt; this.pitch = THREE.MathUtils.clamp(this.pitch - y * 1.1 * dt, -1.2, 1.2);
    return true;
  }
  cast(ox, oy, oz, dx, dy, dz, max) { try { return this.raycast ? this.raycast(ox, oy, oz, dx, dy, dz, max) : Infinity; } catch { return Infinity; } }
  povCam() {
    if (!this.povOn) return null;
    const c = this.lensCam; c.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    c.fov = ZOOMS[this.zoom]; c.updateProjectionMatrix(); return c;
  }

  // trigger / mouse each frame: tap = photo, hold = record while held
  input(held, t, pressed = false) {
    if (!this.on) return;
    if (pressed && !held && this.downAt < 0) { this.photo(); return; }   // a click shorter than one frame
    if (held && this.downAt < 0) this.downAt = t;
    if (held && this.downAt >= 0 && !this.rec && t - this.downAt > HOLD) this.startVideo();
    if (!held && this.downAt >= 0) {
      if (this.rec) this.stopVideo(); else this.photo();   // let go before recording started = a photo
      this.downAt = -1;
    }
  }
  // VR: poke the tablet buttons with your other hand
  vrTap(otherHand) {
    if (!this.on || !otherHand || !this.model.parent) return null;
    const p = this.bar.worldToLocal(otherHand.getWorldPosition(new THREE.Vector3()));
    if (Math.abs(p.z) > 0.04 || Math.abs(p.x) > this.barW / 2 + 0.02 || Math.abs(p.y) > this.barH / 2 + 0.02) { this.tapOn = null; return null; }
    if (this.tapOn) return null;   // take your finger off the tablet before pressing again
    const u = (p.x / this.barW + 0.5) * this.barC.width, v = (0.5 - p.y / this.barH) * this.barC.height;
    const b = (this.barRects || []).find(q => u >= q.x && u <= q.x + q.w && v >= q.y && v <= q.y + q.h);
    const t = performance.now();
    if (!b || t - this.tapAt < 300) return null;
    this.tapAt = t; this.tapOn = b.a; this.act(b.a); return b.a;
  }

  // ---------------------------------------------------------------- rendering
  renderTo(rt) {
    const r = this.renderer, xrOn = r.xr.enabled, prev = r.getRenderTarget(), sAU = r.shadowMap.autoUpdate;
    this.model.updateMatrixWorld(true); this.tripod.updateMatrixWorld(true);
    const c = this.lensCam; c.aspect = rt.width / rt.height; c.fov = this.mode !== 'tripod' && this.front && !this.weapons.vr ? 75 : ZOOMS[this.zoom]; c.updateProjectionMatrix();
    r.xr.enabled = false; r.shadowMap.autoUpdate = false; this.model.visible = false;
    if (this.beforeRender) this.beforeRender();
    try { r.setRenderTarget(rt); r.clear(); r.render(this.scene, c); }
    finally { r.setRenderTarget(prev); r.xr.enabled = xrOn; r.shadowMap.autoUpdate = sAU; this.model.visible = this.on; if (this.afterRender) this.afterRender(); }
  }
  encode(src, out) {
    const r = this.renderer, xrOn = r.xr.enabled, prev = r.getRenderTarget();
    encodeMat.uniforms.map.value = src.texture;
    encodeMat.uniforms.flip.value.set(this.flipH ? 1 : 0, this.flipV ? 1 : 0);
    r.xr.enabled = false;
    try { r.setRenderTarget(out); r.render(quadScene, quadCam); } finally { r.setRenderTarget(prev); r.xr.enabled = xrOn; }
  }

  // call once a frame, before the main render
  update(dt, t) {
    if (this.mode === 'tripod') { this.tYaw.rotation.y = this.yaw; this.tPitch.rotation.x = this.pitch; }
    if (!this.on) { this.hud.classList.add('hidden'); return; }
    if (this.model.parent !== (this.weapons.vr ? this.weapons.vrHolder : this.weapons.deskHolder)) this.attach();
    this.frame++;
    if (this.flash > 0) { this.flash -= dt; this.flashBulb.material.color.setHex(this.flash > 0 ? 0xffffff : 0xdddddd); }
    const recCol = this.rec ? (Math.floor(t * 2) % 2 ? 0xff2a2a : 0x551111) : 0x551111;
    this.recDot.material.color.setHex(recCol); this.tDot.material.color.setHex(recCol);
    this.frontLens.material.color.setHex(this.front && this.mode !== 'tripod' ? 0x5dff9b : 0x3355aa);
    this.drawBar(t); this.drawHud();
    if (this.rec) {
      if (t - this.rec.t0 >= VID_MAX) { this.stopVideo(); return; }
      if (t - this.rec.last >= 1 / VID_FPS - 0.004) {
        this.rec.last = t;
        this.renderTo(this.vidRT); this.encode(this.vidRT, this.vidOut);
        this.renderer.readRenderTargetPixels(this.vidOut, 0, 0, VID_W, VID_H, this.vidPx);
        flipInto(this.vidImg.data, this.vidPx, VID_W, VID_H);
        this.vidCtx.putImageData(this.vidImg, 0, 0); watermark(this.vidCtx, VID_W, VID_H, true);
        if (this.rec.track && this.rec.track.requestFrame) this.rec.track.requestFrame();
        if (this.screen.material.map !== this.vidRT.texture) { this.screen.material.map = this.vidRT.texture; this.screen.material.needsUpdate = true; }
      }
      return;
    }
    if (this.screen.material.map !== this.viewRT.texture) { this.screen.material.map = this.viewRT.texture; this.screen.material.needsUpdate = true; }
    if (this.frame % VIEW_EVERY === 0) this.renderTo(this.viewRT);
  }

  // the tablet's own button bar, drawn on a canvas
  drawBar(t) {
    const btns = this.buttons(), key = btns.map(b => b.label + (b.on ? '1' : '0')).join() + (this.rec ? Math.floor(t) : '');
    if (key === this.barKey) return; this.barKey = key;
    const x = this.barX, W = this.barC.width, H = this.barC.height, cols = 4, rows = 2;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(29,20,66,0.92)'; rr(x, 0, 0, W, H, 26); x.fill();
    const pad = 8, bw = (W - pad * (cols + 1)) / cols, bh = (H - pad * (rows + 1)) / rows;
    this.barRects = [];
    btns.forEach((b, i) => {
      const cx = pad + (i % cols) * (bw + pad), cy = pad + Math.floor(i / cols) * (bh + pad);
      this.barRects.push({ a: b.a, x: cx, y: cy, w: bw, h: bh });
      x.fillStyle = b.on ? b.color : '#3b3360'; rr(x, cx, cy, bw, bh, 18); x.fill();
      x.strokeStyle = b.on ? '#fff' : '#1d1442'; x.lineWidth = 4; x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
      x.font = '44px sans-serif'; x.fillText(b.icon, cx + bw / 2, cy + bh * 0.36);
      x.font = '900 24px Trebuchet MS, sans-serif'; x.fillText(b.label, cx + bw / 2, cy + bh * 0.76);
    });
    this.barTex.needsUpdate = true;
  }
  // the same buttons on the PC screen, with their keys
  drawHud() {
    if (this.weapons.vr || this.hudOk === false) { this.hud.classList.add('hidden'); return; }
    this.hud.classList.remove('hidden');
    this.hud.classList.toggle('pov', this.povOn);
    const btns = this.buttons(), key = btns.map(b => b.label + (b.on ? '1' : '0')).join();
    if (key === this.hudKey) return; this.hudKey = key;
    this.hudRow.innerHTML = btns.map(b => `<button data-a="${b.a}" class="${b.on ? 'on' : ''}"><span>${b.icon}</span><b>${b.label}</b><i>${b.key}</i></button>`).join('');
  }
  // main.js fills these in: where you are looking from, and which way (used to work out where the tripod goes)
  eyeOf() { return this._eye ? this._eye() : null; }
  dirOf() { return this._dir ? this._dir() : null; }

  // ---------------------------------------------------------------- 📸 photo
  photo() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.renderTo(this.photoRT); this.encode(this.photoRT, this.photoOut);
      const px = new Uint8Array(PHOTO_W * PHOTO_H * 4);
      this.renderer.readRenderTargetPixels(this.photoOut, 0, 0, PHOTO_W, PHOTO_H, px);
      const c = document.createElement('canvas'); c.width = PHOTO_W; c.height = PHOTO_H;
      const x = c.getContext('2d'), img = x.createImageData(PHOTO_W, PHOTO_H);
      flipInto(img.data, px, PHOTO_W, PHOTO_H); x.putImageData(img, 0, 0); watermark(x, PHOTO_W, PHOTO_H);
      this.flash = 0.12; audio.playShutter(); this.onShot && this.onShot();
      c.toBlob((blob) => {
        this.busy = false;
        if (!blob) return this.notify('📷 Could not save the photo');
        const name = `city-chaos-${stamp()}.jpg`;
        downloadBlob(blob, name);
        thumb(c).then(th => library.add({ kind: 'photo', name, blob, thumb: th, at: Date.now() }));
        this.notify('📸 Photo saved to Downloads (and your phone\'s 🖼️ Photos)');
        this.lastPhoto = c;
      }, 'image/jpeg', 0.92);
    } catch (e) { this.busy = false; this.notify('📷 Photo failed: ' + (e && e.message || e)); }
  }

  // ---------------------------------------------------------------- 🎥 video
  static videoType() {
    if (!window.MediaRecorder) return null;
    for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  startVideo() {
    if (this.rec) return;
    const type = PhotoCam.videoType();
    if (type === null || !this.vidCanvas.captureStream) { this.notify('🎥 Video recording isn\'t supported in this browser, photos still work'); this.downAt = -1; return; }
    try {
      const stream = this.vidCanvas.captureStream(0);
      const snd = audio.recordStream && audio.recordStream(); if (snd) for (const tr of snd.getAudioTracks()) stream.addTrack(tr);
      const mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 2_500_000 } : undefined);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        const mime = mr.mimeType || type || 'video/webm', ext = /mp4/.test(mime) ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (!blob.size) return this.notify('🎥 The video came out empty, try again');
        const name = `city-chaos-${stamp()}.${ext}`;
        downloadBlob(blob, name);
        thumb(this.vidCanvas).then(th => library.add({ kind: 'video', name, blob, thumb: th, at: Date.now(), secs: Math.round(this.lastSecs || 0) }));
        this.notify(`🎥 Video saved to Downloads (${Math.round(this.lastSecs || 0)}s)`);
      };
      this.rec = { mr, t0: performance.now() / 1000, last: -1, track: stream.getVideoTracks()[0] };
      mr.start(500);
      this.barKey = ''; this.hudKey = '';
      this.notify('🔴 Recording... press 🎥 again (or let go) to stop');
    } catch (e) { this.rec = null; this.notify('🎥 Could not start recording: ' + (e && e.message || e)); }
  }
  stopVideo() {
    const r = this.rec; if (!r) return; this.rec = null;
    this.lastSecs = performance.now() / 1000 - r.t0;
    try { r.mr.stop(); } catch {}
    this.barKey = ''; this.hudKey = '';
  }
}

// WebGL pixels are bottom row first: flip them while copying
function flipInto(dst, src, w, h) {
  const row = w * 4;
  for (let y = 0; y < h; y++) dst.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
}
function watermark(x, w, h, small) {
  const s = Math.round(h / (small ? 22 : 30));
  x.font = `900 ${s}px Trebuchet MS, sans-serif`; x.textAlign = 'right'; x.textBaseline = 'bottom';
  x.lineWidth = Math.max(2, s / 6); x.strokeStyle = 'rgba(29,20,66,0.85)'; x.fillStyle = '#ffd23f';
  x.strokeText('CITY CHAOS', w - s * 0.6, h - s * 0.5); x.fillText('CITY CHAOS', w - s * 0.6, h - s * 0.5);
}
function thumb(src) {
  const c = document.createElement('canvas'); c.width = 240; c.height = 180;
  c.getContext('2d').drawImage(src, 0, 0, 240, 180);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.8));
}
