// CITY CHAOS - 📷 the camera. Take photos and record video clips of the city and your friends.
// PC: press V to take it out (V again puts it away). Click = photo, hold the left mouse button = record video
// (let go to stop), F = flip to selfie. VR: Y menu > CAMERA (or the phone's 📷 app). It sits in your right hand
// with a live screen on the back: tap the trigger = photo, hold the trigger = video, A = selfie.
// Photos (JPG) and videos (MP4 or WEBM) download to the headset's / computer's Downloads folder (Quest: open the
// Files app) and are also kept in the phone's 📷 PHOTOS app (the last 30 photos and 6 videos, on this device only).
import * as THREE from 'three';
import * as audio from '../audio/audio.js';
import { textCanvas } from '../engine/geo.js';

const PHOTO_W = 1600, PHOTO_H = 1200;        // saved photo size (4:3)
const VID_W = 640, VID_H = 480, VID_FPS = 24, VID_MAX = 30;   // video clips: 640x480, 24 fps, 30 s max
const VIEW_EVERY = 3;                         // the live viewfinder redraws every 3rd frame (saves Quest frame time)
const HOLD = 0.45;                            // hold the trigger / mouse this long to start recording
const DB = 'cc_photos', MAX_PHOTOS = 30, MAX_VIDEOS = 6;

// linear -> sRGB pass (render targets hold linear colors; photos and videos need sRGB like the screen)
const encodeMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D map; varying vec2 vUv;
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main() { vec3 c = clamp(texture2D(map, vUv).rgb, 0.0, 1.0); gl_FragColor = vec4(toSRGB(c), 1.0); }`,
  depthTest: false, depthWrite: false
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), encodeMat); quad.frustumCulled = false; quadScene.add(quad);

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };

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
  constructor({ renderer, scene, weapons, notify }) {
    Object.assign(this, { renderer, scene, weapons, notify });
    this.on = false; this.selfie = false; this.rec = null; this.frame = 0; this.downAt = -1; this.busy = false;
    // ---- the camera you hold
    const m = new THREE.Group(); this.model = m; m.visible = false;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.05), new THREE.MeshLambertMaterial({ color: 0x2b2b38 }));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.046), new THREE.MeshLambertMaterial({ color: 0xff4fa3 })); grip.position.set(0.056, -0.002, -0.003);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.04, 20), new THREE.MeshLambertMaterial({ color: 0x15151c })); lens.rotation.x = Math.PI / 2; lens.position.set(-0.012, 0, -0.044);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.019, 20), new THREE.MeshBasicMaterial({ color: 0x3355aa })); glass.position.set(-0.012, 0, -0.0645); glass.rotation.y = Math.PI;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.022), new THREE.MeshLambertMaterial({ color: 0xffd23f })); top.position.set(0.035, 0.049, 0);
    this.flashBulb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: 0xdddddd })); this.flashBulb.position.set(-0.04, 0.03, -0.026);
    this.recDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 })); this.recDot.position.set(0.045, 0.03, 0.027);
    m.add(body, grip, lens, glass, top, this.flashBulb, this.recDot);
    // live screen on the back (faces you)
    this.viewRT = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.078), new THREE.MeshBasicMaterial({ map: this.viewRT.texture, toneMapped: false }));
    this.screen.position.set(-0.008, 0, 0.0262); m.add(this.screen);
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(0.104, 0.018), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.label.position.set(-0.008, -0.05, 0.0262); m.add(this.label); this.setLabel('TAP 📸 · HOLD 🎥');
    m.traverse(o => { o.castShadow = false; });
    // the lens camera
    this.lensCam = new THREE.PerspectiveCamera(62, 4 / 3, 0.06, 700);
    m.add(this.lensCam); this.placeLens();
    // full size photo + video targets
    this.photoRT = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H, { type: THREE.HalfFloatType, samples: 4 });
    this.photoOut = new THREE.WebGLRenderTarget(PHOTO_W, PHOTO_H);
    this.vidRT = new THREE.WebGLRenderTarget(VID_W, VID_H, { type: THREE.HalfFloatType });
    this.vidOut = new THREE.WebGLRenderTarget(VID_W, VID_H);
    this.vidPx = new Uint8Array(VID_W * VID_H * 4);
    this.vidCanvas = document.createElement('canvas'); this.vidCanvas.width = VID_W; this.vidCanvas.height = VID_H;
    this.vidCtx = this.vidCanvas.getContext('2d'); this.vidImg = this.vidCtx.createImageData(VID_W, VID_H);
  }
  setLabel(t, bg = '#1d1442') {
    if (this.labelText === t) return; this.labelText = t;
    if (this.label.material.map) this.label.material.map.dispose();
    const tex = new THREE.CanvasTexture(textCanvas(t, { w: 576, h: 100, bg, font: 'bold 46px Trebuchet MS, sans-serif', radius: 30 })); tex.colorSpace = THREE.SRGBColorSpace;
    this.label.material.map = tex; this.label.material.needsUpdate = true;
  }
  placeLens() {
    // selfie: VR = the lens on the back of the camera at arm's length; PC = like a selfie stick about a meter in front of you
    if (this.selfie) { if (this.weapons.vr) { this.lensCam.position.set(-0.008, 0, 0.05); this.lensCam.rotation.set(0, Math.PI, 0); } else { this.lensCam.position.set(-0.12, 0.28, -0.85); this.lensCam.rotation.set(-0.12, Math.PI, 0); } }
    else { this.lensCam.position.set(-0.012, 0, -0.07); this.lensCam.rotation.set(0, 0, 0); }
    this.lensCam.fov = this.selfie ? 75 : 62; this.lensCam.updateProjectionMatrix();
  }
  get recording() { return !!this.rec; }

  // ---------------------------------------------------------------- holding it
  setOn(on) {
    on = !!on; if (on === this.on) return;
    if (!on && this.rec) this.stopVideo();
    this.on = on; this.weapons.holstered = on; this.downAt = -1;
    if (on) this.attach(); else if (this.model.parent) this.model.parent.remove(this.model);
    this.model.visible = on;
    audio.playClick();
  }
  toggle() { this.setOn(!this.on); return this.on; }
  attach() {
    const vr = this.weapons.vr, holder = vr ? this.weapons.vrHolder : this.weapons.deskHolder;
    if (!holder) return;
    if (this.model.parent !== holder) holder.add(this.model);
    this.placeLens();
    if (vr) { this.model.position.set(0, 0.01, -0.06); this.model.rotation.set(0, 0, 0); this.model.scale.setScalar(1.25); }
    else { this.model.position.set(-0.03, 0.02, -0.02); this.model.rotation.set(0.05, 0.12, 0); this.model.scale.setScalar(1); }
  }
  flip() { this.selfie = !this.selfie; this.placeLens(); this.notify(this.selfie ? '🤳 Selfie mode' : '📷 Back camera'); audio.playClick(); }

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

  // ---------------------------------------------------------------- rendering
  renderTo(rt) {
    const r = this.renderer, xrOn = r.xr.enabled, prev = r.getRenderTarget(), sAU = r.shadowMap.autoUpdate;
    this.model.updateMatrixWorld(true);
    r.xr.enabled = false; r.shadowMap.autoUpdate = false; this.model.visible = false;
    if (this.beforeRender) this.beforeRender();
    try { r.setRenderTarget(rt); r.clear(); r.render(this.scene, this.lensCam); }
    finally { r.setRenderTarget(prev); r.xr.enabled = xrOn; r.shadowMap.autoUpdate = sAU; this.model.visible = this.on; if (this.afterRender) this.afterRender(); }
  }
  encode(src, out) {
    const r = this.renderer, xrOn = r.xr.enabled, prev = r.getRenderTarget();
    encodeMat.uniforms.map.value = src.texture; r.xr.enabled = false;
    try { r.setRenderTarget(out); r.render(quadScene, quadCam); } finally { r.setRenderTarget(prev); r.xr.enabled = xrOn; }
  }
  // call once a frame, before the main render
  update(dt, t) {
    if (!this.on) return;
    if (this.model.parent !== (this.weapons.vr ? this.weapons.vrHolder : this.weapons.deskHolder)) this.attach();
    this.frame++;
    if (this.flash > 0) { this.flash -= dt; this.flashBulb.material.color.setHex(this.flash > 0 ? 0xffffff : 0xdddddd); }
    if (this.rec) {
      this.recDot.material.color.setHex(Math.floor(t * 2) % 2 ? 0xff2a2a : 0x551111);
      const left = VID_MAX - (t - this.rec.t0);
      this.setLabel(`🔴 REC ${Math.floor(t - this.rec.t0)}s`, '#b3001e');
      if (left <= 0) { this.stopVideo(); return; }
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
    this.setLabel(this.selfie ? '🤳 TAP 📸 · HOLD 🎥' : 'TAP 📸 · HOLD 🎥');
    this.recDot.material.color.setHex(0x551111);
    if (this.screen.material.map !== this.viewRT.texture) { this.screen.material.map = this.viewRT.texture; this.screen.material.needsUpdate = true; }
    if (this.frame % VIEW_EVERY === 0) this.renderTo(this.viewRT);
  }

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
        this.notify('📸 Photo saved to Downloads (and your phone\'s 📷 Photos)');
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
      audio.playClick(); this.notify('🔴 Recording... let go to stop');
    } catch (e) { this.rec = null; this.notify('🎥 Could not start recording: ' + (e && e.message || e)); }
  }
  stopVideo() {
    const r = this.rec; if (!r) return; this.rec = null;
    this.lastSecs = performance.now() / 1000 - r.t0;
    try { r.mr.stop(); } catch {}
    audio.playClick();
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
