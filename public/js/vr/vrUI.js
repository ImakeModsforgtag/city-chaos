// In-headset UI: wrist display, gun ammo screen, head HUD (kill feed / notices / death),
// damage vignette, comfort vignette, and a laser-pointer menu + scoreboard.
import * as THREE from 'three';
import { roundRect } from '../engine/geo.js';
import { WEAPONS } from '/shared/weapons.js';
import { TEAM_NAMES } from '/shared/constants.js';
import * as audio from '../audio/audio.js';

const FONT = 'Trebuchet MS, sans-serif';
const INK = '#1d1442';

class Panel {
  constructor(w, h, worldW, { transparent = true, depthTest = true } = {}) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.x = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldW * h / w),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent, depthTest, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 20;
    this.w = w; this.h = h; this.worldW = worldW; this.last = '';
  }
  draw(key, fn) { if (key === this.last) return; this.last = key; this.x.clearRect(0, 0, this.w, this.h); fn(this.x, this.w, this.h); this.tex.needsUpdate = true; }
}
function box(x, a, b, w, h, fill, r = 18, stroke = INK, lw = 6) { x.fillStyle = stroke; roundRect(x, a, b, w, h, r); x.fill(); x.fillStyle = fill; roundRect(x, a + lw, b + lw, w - lw * 2, h - lw * 2, r - lw / 2); x.fill(); }
function text(x, t, a, b, size, color = '#fff', align = 'center', bold = true) {
  x.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; x.textAlign = align; x.textBaseline = 'middle';
  x.lineWidth = Math.max(3, size / 7); x.strokeStyle = INK; x.strokeText(t, a, b); x.fillStyle = color; x.fillText(t, a, b);
}

export class VRUI {
  constructor({ scene, camera, input }) {
    this.scene = scene; this.camera = camera; this.input = input;
    this.wrist = new Panel(320, 200, 0.13);
    this.ammo = new Panel(192, 96, 0.08);
    this.hud = new Panel(1024, 640, 0.62, { depthTest: false });
    this.hud.mesh.position.set(0, 0.06, -0.85);
    camera.add(this.hud.mesh);
    // depthTest off: menus never sink into the ground or walls (Gorilla players stand low)
    this.menu = new Panel(1024, 1400, 0.8, { depthTest: false });
    this.board = new Panel(1024, 900, 0.72, { depthTest: false });
    this.menu.mesh.visible = false; this.board.mesh.visible = false;
    scene.add(this.menu.mesh, this.board.mesh);
    // damage + comfort vignettes (head locked)
    const vg = new THREE.SphereGeometry(0.3, 16, 12);
    this.dmgMat = new THREE.MeshBasicMaterial({ color: 0xff1030, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, fog: false });
    this.dmgSphere = new THREE.Mesh(vg, this.dmgMat); this.dmgSphere.renderOrder = 30; camera.add(this.dmgSphere);
    this.comfort = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, fog: false }));
    this.comfort.position.z = -0.25; this.comfort.renderOrder = 31; camera.add(this.comfort);
    // laser pointer
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff3d7f }));
    this.laser.visible = false;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.menu.mesh.renderOrder = 35; this.board.mesh.renderOrder = 35;
    this.dot.visible = false; this.dot.renderOrder = 40; scene.add(this.dot);
    this.menuOpen = false; this.boardHeld = false;
    this.buttons = []; this.hover = -1;
    this.feed = []; this.notice = null; this.death = null;
    this.ray = new THREE.Raycaster();
    this.flash = 0; this.dmgDir = null;
    this.visible = false;
  }

  attach(leftGrip, rightRay, gunHolder) {
    leftGrip.add(this.wrist.mesh); this.wrist.mesh.position.set(0, 0.07, 0.06);
    rightRay.add(this.laser);
    this.gunHolder = gunHolder;
    gunHolder.add(this.ammo.mesh); this.ammo.mesh.position.set(0, 0.12, 0.06);
    this.rightRay = rightRay;
  }
  setVisible(v) {
    this.visible = v;
    for (const m of [this.wrist.mesh, this.ammo.mesh, this.hud.mesh, this.dmgSphere, this.comfort]) m.visible = v;
    if (!v) { this.closeMenu(); this.board.mesh.visible = false; }
  }

  addFeed(html) { this.feed.push({ t: 6, s: html }); if (this.feed.length > 4) this.feed.shift(); }
  setNotice(s, dur = 2) { this.notice = { s, t: dur }; }
  damage(fromDir) { this.flash = 0.6; }

  // --------------------------------------------------------------- menu
  openMenu(model) {
    this.menuOpen = true; this.model = model;
    const cam = this.camera, p = new THREE.Vector3(), q = new THREE.Quaternion();
    cam.getWorldPosition(p); cam.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.menu.mesh.position.copy(p).addScaledVector(fwd, 0.95).add(new THREE.Vector3(0, -0.05, 0)).addScaledVector(right, -0.22);
    this.menu.mesh.lookAt(p.x, this.menu.mesh.position.y, p.z);
    this.board.mesh.position.copy(p).addScaledVector(fwd, 1.0).add(new THREE.Vector3(0, -0.02, 0)).addScaledVector(right, 0.62);
    this.board.mesh.lookAt(p.x, this.board.mesh.position.y, p.z);
    this.menu.mesh.visible = true; this.board.mesh.visible = true;
    this.laser.visible = true; this.menu.last = '';
    audio.playClick();
  }
  closeMenu() { this.menuOpen = false; this.menu.mesh.visible = false; if (!this.boardHeld) this.board.mesh.visible = false; this.laser.visible = false; this.dot.visible = false; }

  drawMenu() {
    const m = this.model;
    if (m.items) return this.drawPage(m);
    const s = m.settings;
    const items = [
      { label: '▶  RESUME', color: '#2ec27e', act: 'resume' },
      ...(m.tutorial ? [{ label: '⏭  SKIP TUTORIAL', color: '#00b4d8', act: 'tutskip' }] : []),
      { label: m.role === 'cop' ? 'ROLE: 👮 COP (click to be a civilian)' : 'ROLE: 🧑 CIVILIAN (click to be a cop)', color: m.role === 'cop' ? '#1f3a93' : '#ff9f1c', act: 'role' },
      ...(m.missions ? [{ label: `📋  DAILY MISSIONS (${m.missions})`, color: '#2ec27e', act: 'missions' }] : []),
      { label: `MOVEMENT: ${s.moveMode === 'gorilla' ? 'GORILLA ARMS' : s.moveMode === 'both' ? 'ARMS + STICK' : 'JOYSTICK'}`, color: '#3a86ff', act: 'move' },
      { label: `BODY SIZE: ${s.vrSize === 'human' ? 'HUMAN (REAL HEIGHT)' : s.vrSize === 'small' ? 'SMALL (STANDING)' : 'GORILLA (GORILLA TAG)'}`, color: '#2ec27e', act: 'size' },
      { label: 'STAND TALL + CLICK: RECALIBRATE', color: '#2ec27e', act: 'calibrate' },
      { label: `TURNING: ${s.turnMode.toUpperCase()}${s.turnMode === 'snap' ? ' ' + s.snapAngle + '°' : ''}`, color: '#3a86ff', act: 'turn' },
      { label: `COMFORT VIGNETTE: ${s.vignette ? 'ON' : 'OFF'}`, color: '#8338ec', act: 'vignette' },
      { label: `MIC: ${m.mic ? 'ON 🎤' : 'OFF'}`, color: '#f5b700', act: 'mic' },
      { label: `SHADOWS: ${s.shadows ? 'ON' : 'OFF'}`, color: '#8338ec', act: 'shadows' },
      ...(m.teams ? [{ label: 'SWITCH TEAM', color: '#ff9f1c', act: 'team' }] : []),
      ...(m.isHost ? [{ label: `MODE: ${m.mode === 'tdm' ? 'TEAM DEATHMATCH' : 'FREE FOR ALL'} (host)`, color: '#ff3d7f', act: 'mode' }] : []),
      { label: '🐞  REPORT A BUG HERE', color: '#c9a227', act: 'bug' },
      { label: '🚪  LEAVE ROOM', color: '#6c6f8a', act: 'leave' }
    ];
    const key = JSON.stringify(items.map(i => i.label)) + this.hover + m.code;
    // button hit areas are rebuilt EVERY frame (drawing only happens when something changes)
    const step = Math.min(94, Math.floor((1400 - 225 - 24) / items.length));   // always fits the panel, however many buttons
    this.buttons = items.map((it, i) => ({ x: 80, y: 225 + i * step, w: 1024 - 160, h: step - 10, act: it.act }));
    this.menu.draw(key, (x, w, h) => {
      box(x, 0, 0, w, h, '#fff8ef', 40, INK, 10);
      text(x, 'CITY CHAOS', w / 2, 80, 84, '#ffd23f');
      text(x, `ROOM ${m.code}`, w / 2, 170, 60, '#3a86ff');
      items.forEach((it, i) => {
        const b = this.buttons[i];
        box(x, b.x, b.y, b.w, b.h, this.hover === i ? '#ffffff' : it.color, 24, INK, 8);
        text(x, it.label, w / 2, b.y + (step - 10) / 2 + 2, step < 84 ? 34 : 40, this.hover === i ? it.color : '#fff');
      });
    });
  }

  // a page with its own buttons (store menus): two columns, title + subtitle
  drawPage(m) {
    const items = m.items, cols = m.cols || 1, bw = cols === 2 ? 430 : 864, bh = cols === 2 ? 78 : 84, step = cols === 2 ? 86 : 94;
    this.buttons = items.map((it, i) => ({ x: cols === 2 ? (i % 2 ? 534 : 60) : 80, y: 230 + Math.floor(i / cols) * step, w: bw, h: bh, act: it.act }));
    const key = 'page' + JSON.stringify(items.map(i => i.label + i.on)) + this.hover + m.title + m.sub;
    this.menu.draw(key, (x, w, h) => {
      box(x, 0, 0, w, h, m.bg || '#14102e', 40, '#7cf9ff', 10);
      text(x, m.title, w / 2, 82, 74, '#7cf9ff');
      text(x, m.sub || '', w / 2, 160, 34, '#ffd23f');
      items.forEach((it, i) => {
        const b = this.buttons[i], c = it.on ? '#00c853' : it.color || '#3d3a6b';
        box(x, b.x, b.y, b.w, b.h, this.hover === i ? '#ffffff' : c, 22, '#000', 6);
        text(x, it.label, b.x + b.w / 2, b.y + bh / 2 + 2, it.label.length > 22 ? 26 : 31, this.hover === i ? c : '#fff');
      });
    });
  }

  drawBoard(m) {
    const rows = m.players;
    const key = JSON.stringify(rows) + m.teamScores + m.mode;
    this.board.draw(key, (x, w, h) => {
      box(x, 0, 0, w, h, 'rgba(29,20,66,0.92)', 40, INK, 10);
      text(x, 'SCOREBOARD', w / 2, 70, 64, '#ffd23f');
      if (m.teams) text(x, `RED ${m.teamScores[0]}  :  ${m.teamScores[1]} BLUE   (to ${m.killLimit})`, w / 2, 140, 44, '#fff');
      else text(x, `First to ${m.killLimit} eliminations`, w / 2, 140, 36, '#cfc8ff');
      text(x, 'PLAYER', 80, 205, 30, '#aaa', 'left'); text(x, 'K', 660, 205, 30, '#aaa'); text(x, 'D', 760, 205, 30, '#aaa'); text(x, '$', 890, 205, 30, '#aaa');
      rows.forEach((r, i) => {
        const y = 260 + i * 76;
        x.fillStyle = r.color; roundRect(x, 70, y - 24, 48, 48, 12); x.fill();
        const tc = r.team === 0 ? '#ff7b8b' : r.team === 1 ? '#7ba8ff' : '#fff';
        text(x, (r.me ? '★ ' : '') + `Lv${r.lvl || 1} ` + r.name + (r.connected ? '' : ' (away)'), 140, y, 42, r.me ? '#ffd23f' : tc, 'left');
        text(x, String(r.kills), 660, y, 44); text(x, String(r.deaths), 760, y, 44); text(x, String(r.cash || 0), 890, y, 36, '#7dff9a');
      });
    });
  }

  updatePointer(trigger) {
    if (!this.menuOpen || !this.rightRay) return null;
    const o = new THREE.Vector3(), q = new THREE.Quaternion();
    this.rightRay.getWorldPosition(o); this.rightRay.getWorldQuaternion(q);
    this.ray.set(o, new THREE.Vector3(0, 0, -1).applyQuaternion(q));
    const hit = this.ray.intersectObject(this.menu.mesh)[0];
    let hov = -1;
    if (hit) {
      this.dot.visible = true; this.dot.position.copy(hit.point);
      this.laser.scale.z = hit.distance;
      const px = hit.uv.x * this.menu.w, py = (1 - hit.uv.y) * this.menu.h;
      hov = this.buttons.findIndex(b => px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h);
    } else { this.dot.visible = false; this.laser.scale.z = 3; }
    if (hov !== this.hover) { this.hover = hov; if (hov >= 0) { audio.playHover(); this.input.pulse('right', 0.2, 15); } }
    if (trigger && hov >= 0) { audio.playClick(); this.input.pulse('right', 0.5, 30); return this.buttons[hov].act; }
    return null;
  }

  // --------------------------------------------------------------- per-frame
  update(dt, st) {
    if (!this.visible) return;
    const camPos = new THREE.Vector3(); this.camera.getWorldPosition(camPos);
    // wrist + gun screens always face the player
    this.wrist.mesh.lookAt(camPos); this.ammo.mesh.lookAt(camPos);
    const hp = Math.round(st.hp);
    this.wrist.draw(`${hp}|${st.timer}|${st.kills}|${st.deaths}|${st.teamText}|${st.cash}|${st.wanted}|${st.armor}|${st.boost}|${st.lvl ? st.lvl.lvl + ':' + Math.round(st.lvl.frac * 20) : ''}`, (x, w, h) => {
      box(x, 0, 0, w, h, 'rgba(29,20,66,0.88)', 30, INK, 8);
      text(x, '❤ ' + hp, 20, 46, 48, hp > 30 ? '#5dff9b' : '#ff5d5d', 'left');
      text(x, st.timer, w - 20, 46, 42, '#ffd23f', 'right');
      if (st.armor || st.boost) text(x, (st.armor ? '🛡' + Math.round(st.armor) : '') + (st.boost ? ' ⚡' + st.boost : ''), w / 2 - 10, 46, 34, '#7cc4ff');
      x.fillStyle = '#2a1f55'; roundRect(x, 20, 86, w - 40, 30, 12); x.fill();
      x.fillStyle = hp > 30 ? '#2ec27e' : '#ff3b3b'; roundRect(x, 20, 86, (w - 40) * Math.max(0, hp) / 100, 30, 12); x.fill();
      const stars = '★'.repeat(st.wanted || 0);
      text(x, stars ? `${stars}  $${st.cash || 0}` : (st.teamText || `K ${st.kills} D ${st.deaths}  $${st.cash || 0}`), w / 2, st.lvl ? 140 : 158, stars ? 38 : 30, stars ? '#ffd23f' : '#fff');
      if (st.lvl) {   // level + XP bar
        text(x, 'LV ' + st.lvl.lvl, 20, 178, 26, '#ffd23f', 'left');
        x.fillStyle = '#0006'; roundRect(x, 100, 171, w - 120, 14, 7); x.fill();
        x.fillStyle = '#ffd23f'; roundRect(x, 100, 171, Math.max(8, (w - 120) * st.lvl.frac), 14, 7); x.fill();
      }
    });
    const ws = st.weapon;
    this.ammo.mesh.visible = !!ws;
    if (ws) this.ammo.draw(`${ws.w}|${ws.mag}|${ws.reserve}|${st.reloading ? 1 : 0}`, (x, w, h) => {
      box(x, 0, 0, w, h, st.reloading ? '#f5b700' : ws.mag === 0 ? '#d6204e' : 'rgba(29,20,66,0.9)', 20, INK, 6);
      text(x, st.reloading ? 'RELOAD' : `${ws.mag}/${ws.reserve}`, w / 2, h / 2 + 2, st.reloading ? 40 : 46);
    });
    // head HUD
    this.feed.forEach(f => f.t -= dt); this.feed = this.feed.filter(f => f.t > 0);
    if (this.notice) { this.notice.t -= dt; if (this.notice.t <= 0) this.notice = null; }
    const feedKey = this.feed.map(f => f.s).join('|') + (this.notice ? this.notice.s : '') + (st.death ? st.death.by + Math.ceil(st.death.t) : '') + (st.matchEnd || '') + (st.prompt || '') + (st.rob ? st.rob.text + Math.round(st.rob.p * 20) : '') + '|' + (st.wanted || 0) + '|' + (st.prison ? st.prison.vr : '') + '|' + (st.sub || '');
    this.hud.draw(feedKey, (x, w, h) => {
      this.feed.forEach((f, i) => {
        x.font = `bold 30px ${FONT}`; const tw = x.measureText(f.s).width + 40;
        box(x, w - tw - 10, 10 + i * 56, tw, 50, 'rgba(29,20,66,0.75)', 16, INK, 4);
        text(x, f.s, w - tw / 2 - 10, 36 + i * 56, 30);
      });
      if (st.wanted) { text(x, '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted), w / 2, 40, 54, '#ffd23f'); text(x, WANTED_VR[st.wanted], w / 2, 88, 26, '#ff9f9f'); }
      if (st.prison) { const lines = st.prison.vr.split('\n'); box(x, 10, 10, 420, 30 + lines.length * 34, 'rgba(29,20,66,0.78)', 16, INK, 4); lines.forEach((l, i) => text(x, l, 24, 40 + i * 34, 26, i === 0 ? '#ffd23f' : l.startsWith('⚠') ? '#ff5d5d' : '#fff', 'left')); }
      if (st.sub) { const s = st.sub.replace(/<[^>]+>/g, ''); box(x, 40, 590, w - 80, 46, 'rgba(0,0,0,0.75)', 14, INK, 3); text(x, s.length > 70 ? s.slice(0, 68) + '…' : s, w / 2, 614, 24); }
      if (this.notice) text(x, this.notice.s, w / 2, 290, Math.max(30, Math.min(70, Math.floor((w - 40) / (this.notice.s.length * 0.56)))), '#ffd23f');   // long notices shrink to fit
      if (st.prompt && !st.rob) { box(x, w / 2 - 260, 470, 520, 70, 'rgba(29,20,66,0.8)', 20, INK, 5); text(x, st.prompt, w / 2, 506, 34); }
      if (st.rob) {
        box(x, w / 2 - 300, 450, 600, 120, 'rgba(29,20,66,0.85)', 22, INK, 6); text(x, st.rob.text, w / 2, 490, 34, '#ffd23f');
        x.fillStyle = '#2a1f55'; roundRect(x, w / 2 - 260, 525, 520, 26, 10); x.fill();
        x.fillStyle = '#7dff9a'; roundRect(x, w / 2 - 260, 525, 520 * Math.min(1, st.rob.p || 0), 26, 10); x.fill();
      }
      if (st.death) {
        box(x, w / 2 - 330, 230, 660, 230, 'rgba(160,0,40,0.85)', 30, INK, 8);
        text(x, 'ELIMINATED', w / 2, 290, 76, '#fff');
        text(x, st.death.by ? `by ${st.death.by}` : '', w / 2, 360, 40, '#ffd23f');
        text(x, `Respawning in ${Math.max(1, Math.ceil(st.death.t))}`, w / 2, 415, 38);
      }
      if (st.matchEnd) { box(x, w / 2 - 400, 160, 800, 200, 'rgba(29,20,66,0.9)', 30, INK, 8); text(x, st.matchEnd, w / 2, 260, 56, '#ffd23f'); }
    });
    // damage flash
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.dmgMat.opacity = this.flash * 0.55;
    this.comfort.material.opacity = st.vignette;
    // scoreboard (hold left stick or menu open)
    if (this.menuOpen) { this.drawMenu(); this.drawBoard(st.board); }
    else if (this.boardHeld) {
      const p = camPos, q = new THREE.Quaternion(); this.camera.getWorldQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.board.mesh.position.copy(p).addScaledVector(fwd, 1.0); this.board.mesh.lookAt(p);
      this.board.mesh.visible = true; this.drawBoard(st.board);
    } else this.board.mesh.visible = false;
  }
}
const WANTED_VR = ['', 'Police are investigating', 'Police are chasing you', 'Police will try to arrest you', 'SWAT joined the pursuit', 'MAXIMUM POLICE RESPONSE'];
export { TEAM_NAMES, WEAPONS };
