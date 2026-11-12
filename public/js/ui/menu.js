// Main menu, lobby, customization (color wheel + live 3D preview), settings, how-to-play.
import * as THREE from 'three';
import { settings, profile, saveProfile, setSetting } from './settings.js';
import { HEADS, BODIES, HATS, GLASSES, BACKS, MODES, MAX_PLAYERS, TEAM_COLORS } from '/shared/constants.js';
import { Avatar } from '../player/avatar.js';
import { esc } from './hud.js';
import * as audio from '../audio/audio.js';

const $ = (id) => document.getElementById(id);
const CATALOG = { head: HEADS, body: BODIES, hat: HATS, glasses: GLASSES, back: BACKS };
const SWATCHES = ['#ff9f1c', '#ff3d7f', '#3a86ff', '#2ec27e', '#8338ec', '#ffd23f', '#ff5252', '#00d4d4', '#a0522d', '#f5f5f5', '#333344', '#ff8fd8'];

export class Menu {
  constructor(cb) {
    this.cb = cb;
    this.current = 'main'; this.history = [];
    this.root = $('menu');
    // navigation
    document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.playClick(); this.go(b.dataset.goto); }));
    document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => { audio.unlock(); audio.playClick(); this.action(b.dataset.action); }));
    document.querySelectorAll('button').forEach(b => b.addEventListener('mouseenter', () => audio.playHover()));
    // name
    const nameInputs = [$('name-input'), $('join-name')];
    nameInputs.forEach(ni => {
      ni.value = profile.name;
      ni.addEventListener('input', () => {
        profile.name = ni.value.replace(/[^\w \-!?.]/g, '').slice(0, 16); saveProfile();
        nameInputs.forEach(o => { if (o !== ni) o.value = profile.name; });
        this.cb.onProfile && this.cb.onProfile();
      });
    });
    // join keypad (easy with Quest controllers)
    const kp = $('keypad');
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split('').forEach(ch => {
      const b = document.createElement('button'); b.textContent = ch;
      b.onclick = () => { audio.playClick(); const ci = $('code-input'); if (ci.value.length < 6) ci.value += ch; };
      kp.appendChild(b);
    });
    const del = document.createElement('button'); del.textContent = '⌫'; del.className = 'del';
    del.onclick = () => { audio.playClick(); const ci = $('code-input'); ci.value = ci.value.slice(0, -1); };
    kp.appendChild(del);
    $('code-input').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    $('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.action('join'); });
    // segmented controls
    for (const id of ['create-mode', 'create-kills', 'create-time']) this.seg($(id));
    this.seg($('lobby-mode-seg'), (v) => this.cb.onMode && this.cb.onMode(v));
    // Cop / Civilian pickers (main menu, lobby and pause menu stay in sync)
    document.querySelectorAll('.role-seg').forEach(el => this.seg(el, (v) => { this.setRole(v); this.cb.onRole && this.cb.onRole(v); }));
    this.setRole(profile.role);
    $('create-mode').addEventListener('click', () => {
      const m = this.segVal($('create-mode'));
      const kl = $('create-kills').querySelectorAll('button');
      const vals = m === 'tdm' ? [25, 50, 75] : [10, 25, 50];
      kl.forEach((b, i) => { b.dataset.val = vals[i]; b.textContent = vals[i]; });
    });
    this.bindSettings();
    this.bindCustom();
  }

  seg(el, onChange) {
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
      audio.playClick(); if (onChange) onChange(b.dataset.val);
    }));
  }
  setRole(role) {
    profile.role = role === 'cop' ? 'cop' : 'civilian'; saveProfile();
    document.querySelectorAll('.role-seg').forEach(el => this.segSet(el, profile.role));
    const h = $('role-hint');
    if (h) h.textContent = profile.role === 'cop' ? '👮 You spawn at the police station. Stop robbers, drive police cars, arrest wanted players.' : '🧑 Rob stores and steal cars, but the cops will come for you.';
  }
  segVal(el) { const b = el.querySelector('button.on'); return b ? b.dataset.val : null; }
  segSet(el, v) { el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === String(v))); }

  show(v) { this.root.classList.toggle('hidden', !v); if (!v) this.stopPreview(); }
  go(name) {
    if (name === 'back') name = this.history.pop() || 'main';
    else if (name !== this.current) { if (['custom', 'settings'].includes(name)) this.history.push(this.current); }
    document.querySelectorAll('#menu > .screen').forEach(s => s.classList.add('hidden'));
    $('screen-' + name).classList.remove('hidden');
    this.current = name;
    if (name === 'custom') this.startPreview(); else this.stopPreview();
    if (name === 'join') { $('join-error').textContent = ''; setTimeout(() => $('code-input').focus(), 50); }
    if (name === 'settings') this.syncSettings();
    if (name === 'profile' && this.cb.onProgress) this.cb.onProgress();
  }
  action(a) {
    const cb = this.cb;
    if (a === 'play') cb.onPlay();
    if (a === 'resetProgress' && cb.onResetProgress) cb.onResetProgress();
    if (a === 'join') {
      const code = $('code-input').value.trim().toUpperCase();
      if (code.length !== 6) { $('join-error').textContent = 'Room codes have 6 characters.'; return; }
      cb.onJoin(code);
    }
    if (a === 'create') cb.onCreate({ mode: this.segVal($('create-mode')), killLimit: Number(this.segVal($('create-kills'))), timeLimit: Number(this.segVal($('create-time'))) });
    if (a === 'copy') cb.onCopy();
    if (a === 'vr') cb.onVR();
    if (a === 'desktop') cb.onDesktop();
    if (a === 'leave') cb.onLeave();
    if (a === 'mic') cb.onMic();
    if (a === 'team') cb.onTeam();
    if (a === 'resume') cb.onResume();
    if (a === 'pause-settings') cb.onPauseGo('settings');
    if (a === 'pause-custom') cb.onPauseGo('custom');
    if (a === 'randomize') {
      const c = profile.cos;
      c.color = SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      c.accent = SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      for (const k of Object.keys(CATALOG)) c[k] = Math.floor(Math.random() * CATALOG[k].length);
      this.cosChanged();
    }
  }
  setStatus(s) { $('net-status').textContent = s; }
  joinError(s) { $('join-error').textContent = s; }

  // ---------------------------------------------------------------- lobby
  renderLobby(r) {
    $('lobby-code').textContent = r.code;
    $('pause-code').textContent = r.code;
    $('lobby-mode').textContent = (r.isPublic ? 'PUBLIC · ' : 'PRIVATE · ') + MODES[r.mode].name;
    $('lobby-limits').textContent = `First to ${r.killLimit} · ${Math.round(r.timeLimit / 60)} min`;
    $('host-settings').classList.toggle('hidden', !r.isHost || r.isPublic);
    this.segSet($('lobby-mode-seg'), r.mode);
    $('btn-team').classList.toggle('hidden', !MODES[r.mode].teams);
    const ps = r.players;
    $('lobby-count').textContent = `${ps.filter(p => p.connected).length}/${MAX_PLAYERS}`;
    $('lobby-players').innerHTML = ps.map(p => {
      const tm = p.team >= 0 ? `<span class="tm" style="background:#${TEAM_COLORS[p.team].toString(16).padStart(6, '0')}">${p.team === 0 ? 'RED' : 'BLUE'}</span>` : '';
      return `<li class="${p.connected ? '' : 'off'}"><span class="dot" style="background:${p.cos.color}"></span>${p.role === 'cop' ? '👮 ' : ''}${esc(p.name)}${p.id === r.you ? ' (you)' : ''}${p.host ? ' 👑' : ''}${p.vr ? ' 🥽' : ''}${tm}</li>`;
    }).join('');
  }
  setMic(on) { $('btn-mic').textContent = on ? '🎤 MIC: ON' : '🎤 MIC: OFF'; }
  setVRSupport(ok, why) {
    $('btn-vr').disabled = !ok;
    $('vr-note').textContent = ok ? 'Put your headset on after pressing ENTER VR.' : why;
  }

  // ---------------------------------------------------------------- settings
  bindSettings() {
    document.querySelectorAll('[data-setting]').forEach(el => {
      const k = el.dataset.setting;
      if (el.classList.contains('seg')) this.seg(el, (v) => setSetting(k, v));
      else el.addEventListener('input', () => setSetting(k, el.value));
    });
  }
  syncSettings() {
    document.querySelectorAll('[data-setting]').forEach(el => {
      const k = el.dataset.setting;
      if (el.classList.contains('seg')) this.segSet(el, settings[k]); else el.value = settings[k];
    });
  }

  // ---------------------------------------------------------------- customization
  bindCustom() {
    const wheel = $('wheel'), x = wheel.getContext('2d');
    const R = wheel.width / 2;
    const img = x.createImageData(wheel.width, wheel.height);
    for (let j = 0; j < wheel.height; j++) for (let i = 0; i < wheel.width; i++) {
      const dx = i - R, dy = j - R, d = Math.hypot(dx, dy);
      const k = (j * wheel.width + i) * 4;
      if (d > R) { img.data[k + 3] = 0; continue; }
      const c = new THREE.Color().setHSL(((Math.atan2(dy, dx) / Math.PI / 2) + 1) % 1, d / R, 1 - (d / R) * 0.5);
      img.data[k] = c.r * 255; img.data[k + 1] = c.g * 255; img.data[k + 2] = c.b * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    let dragging = false;
    const pick = (e) => {
      const rect = wheel.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width * wheel.width - R, py = (e.clientY - rect.top) / rect.height * wheel.height - R;
      const d = Math.min(R, Math.hypot(px, py));
      const br = Number($('bright').value) / 100;
      const c = new THREE.Color().setHSL(((Math.atan2(py, px) / Math.PI / 2) + 1) % 1, d / R, (1 - (d / R) * 0.5) * br);
      profile.cos.color = '#' + c.getHexString();
      this.cosChanged();
    };
    wheel.addEventListener('pointerdown', (e) => { dragging = true; wheel.setPointerCapture(e.pointerId); pick(e); });
    wheel.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    wheel.addEventListener('pointerup', () => { dragging = false; });
    $('bright').addEventListener('input', () => {
      const c = new THREE.Color(profile.cos.color); const hsl = {}; c.getHSL(hsl);
      c.setHSL(hsl.h, hsl.s, Math.max(0.08, 0.5 * Number($('bright').value) / 100 + 0.1)); profile.cos.color = '#' + c.getHexString(); this.cosChanged();
    });
    const sw = (el, key) => {
      el.innerHTML = '';
      SWATCHES.forEach(c => { const i = document.createElement('i'); i.style.background = c; i.onclick = () => { profile.cos[key] = c; audio.playClick(); this.cosChanged(); }; el.appendChild(i); });
    };
    sw($('swatches'), 'color'); sw($('accent-swatches'), 'accent');
    document.querySelectorAll('.cycler').forEach(cy => {
      const key = cy.dataset.key, list = CATALOG[key];
      const [prev, next] = cy.querySelectorAll('button');
      prev.onclick = () => { profile.cos[key] = (profile.cos[key] - 1 + list.length) % list.length; audio.playClick(); this.cosChanged(); };
      next.onclick = () => { profile.cos[key] = (profile.cos[key] + 1) % list.length; audio.playClick(); this.cosChanged(); };
    });
    this.syncCustom();
  }
  syncCustom() {
    document.querySelectorAll('.cycler').forEach(cy => { cy.querySelector('b').textContent = CATALOG[cy.dataset.key][profile.cos[cy.dataset.key]]; });
    document.querySelectorAll('#swatches i').forEach((i, k) => i.classList.toggle('on', SWATCHES[k] === profile.cos.color));
    document.querySelectorAll('#accent-swatches i').forEach((i, k) => i.classList.toggle('on', SWATCHES[k] === profile.cos.accent));
  }
  cosChanged() {
    saveProfile(); this.syncCustom();
    if (this.previewAvatar) this.previewAvatar.setCosmetics(profile.cos);
    this.cb.onProfile && this.cb.onProfile();
  }
  startPreview() {
    const cv = $('preview');
    if (!this.pr) {
      this.pr = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      this.pr.outputColorSpace = THREE.SRGBColorSpace;
      this.ps = new THREE.Scene();
      this.ps.add(new THREE.HemisphereLight(0xffffff, 0xffc89a, 2.2));
      const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 3, -3); this.ps.add(d);
      this.pc = new THREE.PerspectiveCamera(35, 1, 0.1, 20); this.pc.position.set(0, 1.0, -3.0); this.pc.lookAt(0, 0.95, 0);
      this.previewAvatar = new Avatar(profile.cos, { isLocal: true });
      this.previewAvatar.setWeapon('pistol');
      this.ps.add(this.previewAvatar.root);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshLambertMaterial({ color: 0xffe0a8 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = 0.4; this.ps.add(ground);
    }
    this.previewOn = true;
    const loop = () => {
      if (!this.previewOn) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w && h && (cv.width !== w || cv.height !== h)) { this.pr.setSize(w, h, false); this.pc.aspect = w / h; this.pc.updateProjectionMatrix(); }
      const t = performance.now() / 1000;
      const yaw = Math.sin(t * 0.7) * 0.9;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      const hy = 1.45 + Math.sin(t * 2) * 0.02;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const l = [-rx * 0.35 + fx * 0.15, 0.85 + Math.sin(t * 2.2) * 0.05, -rz * 0.35 + fz * 0.15, q.x, q.y, q.z, q.w];
      const r = [rx * 0.3 + fx * 0.3, 1.0, rz * 0.3 + fz * 0.3, q.x, q.y, q.z, q.w];
      this.previewAvatar.setPose([0, hy, 0, q.x, q.y, q.z, q.w], l, r, 1 / 60);
      this.pr.render(this.ps, this.pc);
      requestAnimationFrame(loop);
    };
    loop();
  }
  stopPreview() { this.previewOn = false; }
}
