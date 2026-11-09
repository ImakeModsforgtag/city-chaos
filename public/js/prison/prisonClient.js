// Client side of the prison: state from the server, interactions (desktop E / VR grip),
// talking to inmates, basketball, the status panel, announcements, alarm + shock feedback.
import * as THREE from 'three';
import { PHASES, ITEMS, inPrisonArea } from '/shared/prison.js';
import * as audio from '../audio/audio.js';
import { esc } from '../ui/hud.js';

const HOLD_SEND = 0.25;

export class PrisonClient {
  constructor({ net, map, world, view, npcs }) {
    this.net = net; this.map = map; this.P = map.prison; this.world = world; this.view = view; this.npcs = npcs;
    this.doorBoxes = new Map();
    for (const b of world.boxes) if (b.door) { if (!this.doorBoxes.has(b.door)) this.doorBoxes.set(b.door, []); this.doorBoxes.get(b.door).push(b); }
    this.reset();
  }
  reset() {
    this.me = null; this.st = { phase: 0, left: 0, doors: [], fence: 0, cams: 0, gate: 0, alarm: 0, holders: {}, flags: {}, active: false };
    this.hold = null; this.progress = null; this.sub = null; this.ballHeld = false; this.alarmT = 0; this.handHist = { left: [], right: [] };
    this.stAt = performance.now() / 1000;
    for (const bs of this.doorBoxes.values()) for (const b of bs) b.off = false;
  }
  get prisoner() { return !!(this.me && this.me.state === 'in'); }
  get inCut() { return !!(this.me && this.me.state === 'cut'); }

  onState(m, camPos) {
    const prev = new Set(this.st.doors);
    this.st = m; this.stAt = performance.now() / 1000;
    const open = new Set(m.doors);
    for (const [id, bs] of this.doorBoxes) for (const b of bs) b.off = open.has(id);
    this.view.setState(m);
    // door sounds near you
    if (camPos && inPrisonArea(camPos.x, camPos.z)) {
      for (const id of new Set([...prev, ...open])) {
        if (prev.has(id) === open.has(id)) continue;
        const d = this.P.doors[id], c = new THREE.Vector3((d.min[0] + d.max[0]) / 2, 1.5, (d.min[2] + d.max[2]) / 2);
        if (c.distanceTo(camPos) < 25) (id === 'gate' ? audio.playGate(c) : audio.playCellDoor(c));
      }
    }
  }
  onMe(m) {
    const had = this.me ? new Set(this.me.items) : new Set();
    this.me = m;
    for (const it of m.items) if (!had.has(it)) audio.playPickup('weapon');
  }
  say(text, ms = 5000) { this.sub = { text, until: performance.now() + ms }; }

  // ---------------------------------------------------------------- interaction targets
  targets(eye, dir, xr, hands) {
    const out = [];
    for (const it of this.P.interacts) {
      const dx = it.p[0] - eye.x, dy = it.p[1] - eye.y, dz = it.p[2] - eye.z;
      if (Math.abs(dy) > 2.3) continue;
      if (xr) {
        for (const h of hands) { const d = Math.hypot(it.p[0] - h.pos.x, it.p[1] - h.pos.y, it.p[2] - h.pos.z); if (d < (it.both ? 1.1 : 0.8)) out.push({ kind: 'act', it, d, side: h.side }); }
      } else {
        const d = Math.hypot(dx, dz); if (d > (it.r || 2.3)) continue;
        const l = Math.hypot(dx, dy, dz) || 1, dot = (dx * dir.x + dy * dir.y + dz * dir.z) / l;
        if (dot > 0.55 || d < 0.9) out.push({ kind: 'act', it, d: d - dot });
      }
    }
    // inmates to talk to
    for (const n of this.npcs.map.values()) {
      if (n.type !== 4 || !n.alive) continue;
      const dx = n.x - eye.x, dz = n.z - eye.z, d = Math.hypot(dx, dz);
      if (d > (xr ? 1.6 : 2.6) || Math.abs(n.y + 1.5 - eye.y) > 2) continue;
      if (!xr) { const dot = (dx * dir.x + dz * dir.z) / (d || 1); if (dot < 0.6) continue; }
      out.push({ kind: 'talk', n, d: d + 0.5 });
    }
    // basketball
    const b = this.view.ball.position;
    if (!this.view.ballHolder) {
      const d = xr ? Math.min(...hands.map(h => h.pos.distanceTo(b))) : Math.hypot(b.x - eye.x, b.z - eye.z);
      if (d < (xr ? 0.45 : 2.2) && Math.abs(b.y - eye.y) < 2.3) out.push({ kind: 'ball', d: d - 0.2 });
    }
    return out.sort((a, c) => a.d - c.d);
  }

  // ctx: { xr, eye, dir, t, hands:[{side,pos,gripHeld,gripPressed,gripReleased}], key:{eDown,eHit,clickHit}, myId }
  update(dt, ctx) {
    this.progress = null;
    if (this.sub && performance.now() > this.sub.until) this.sub = null;
    if (!this.prisoner) { this.hold = null; return null; }
    const t = ctx.t;
    // track hand velocity for VR throws
    for (const h of ctx.hands || []) { const H = this.handHist[h.side]; H.push({ t, p: h.pos.clone() }); while (H.length > 6) H.shift(); }
    this.ballHeld = this.view.ballHolder === ctx.myId;
    if (this.ballHeld) {
      if (ctx.xr) {
        const h = (ctx.hands || []).find(q => q.side === this.ballHand) || ctx.hands[0];
        if (h && h.gripReleased) {
          const H = this.handHist[h.side], a = H[0], z = H[H.length - 1], dtt = Math.max(0.03, z.t - a.t);
          const v = z.p.clone().sub(a.p).multiplyScalar(1.35 / dtt);
          this.net.send({ type: 'ballThrow', v: [v.x, v.y, v.z] }); audio.playSwish();
        }
        return h ? 'Let go of grip to throw 🏀' : null;
      }
      if (ctx.key.clickHit || ctx.key.eHit) {
        const v = ctx.dir.clone().multiplyScalar(8.2).add(new THREE.Vector3(0, 2.6, 0));
        this.net.send({ type: 'ballThrow', v: [v.x, v.y, v.z] }); audio.playSwish();
      }
      return '🏀 Click to shoot';
    }
    const list = this.targets(ctx.eye, ctx.dir, ctx.xr, ctx.hands || []);
    const tg = list[0];
    if (!tg) { this.hold = null; return null; }
    const verb = ctx.xr ? 'Grip' : 'Hold E';
    if (tg.kind === 'talk') {
      const hit = ctx.xr ? (ctx.hands || []).some(h => h.gripPressed) : ctx.key.eHit;
      if (hit) this.net.send({ type: 'pTalk', id: tg.n.id });
      return `💬 ${ctx.xr ? 'Grip' : 'Press E'} to talk`;
    }
    if (tg.kind === 'ball') {
      const hand = ctx.xr ? (ctx.hands || []).find(h => h.gripPressed) : null;
      if (ctx.xr ? !!hand : ctx.key.eHit) { this.net.send({ type: 'ballGrab' }); if (hand) this.ballHand = hand.side; }
      return `🏀 ${ctx.xr ? 'Grip' : 'Press E'} to pick up the ball`;
    }
    // hold-to-interact (server tracks the progress)
    const it = tg.it;
    const holding = ctx.xr ? (ctx.hands || []).some(h => h.side === tg.side && h.gripHeld) : ctx.key.eDown;
    if (holding) {
      if (!this.hold || this.hold.id !== it.id) this.hold = { id: it.id, start: t, sent: 0, p: 0 };
      if (t - this.hold.sent > HOLD_SEND) { this.hold.sent = t; this.net.send({ type: 'pAct', id: it.id }); if (it.noise && Math.random() < 0.5) audio.playScrape(null); }
      this.hold.p = Math.max(this.hold.p, Math.min(0.98, (t - this.hold.start) / Math.max(0.3, it.hold)));
      this.progress = { text: it.label.toUpperCase() + '...', p: this.serverP && this.serverP.id === it.id ? Math.max(this.serverP.p, this.hold.p * 0.9) : this.hold.p };
      return null;
    }
    this.hold = null; this.serverP = null;
    const needs = (it.need || []).map(n => ITEMS[n].icon).join('');
    return `✋ ${verb}: ${it.label}${needs ? ' (' + needs + ')' : ''}`;
  }
  onHold(m) { this.serverP = { id: m.id, p: m.p }; if (m.done) { this.hold = null; this.serverP = null; audio.playClick(); } }

  // ---------------------------------------------------------------- panel
  panel(myDisguise) {
    if (!this.me || this.me.state !== 'in') return null;
    const s = this.st, ph = PHASES[s.phase] || PHASES[0];
    const left = Math.max(0, Math.round(s.left - (performance.now() / 1000 - this.stAt)));
    const items = this.me.items.map(i => ITEMS[i].icon).join(' ') + (myDisguise ? ' 🦺' : '');
    const status = [];
    if (s.alarm) status.push('⚠ ALARM! GUARDS ON ALERT');
    if (s.fence) status.push(`⚡ Fence power OFF (${s.fence}s)`);
    if (s.cams) status.push(`📹 Cameras looped (${s.cams}s)`);
    if (s.gate) status.push(`🚧 Main gate OPEN (${s.gate}s)`);
    if (myDisguise) status.push('🦺 Disguised as a guard');
    const html = `<b>🔒 COUNTY PRISON · Cell ${this.me.cell + 1}</b><br>${esc(ph.name)} · ${left}s<br><span class="hint">${esc(ph.hint)}</span>` +
      (items ? `<div class="items">${items}</div>` : '') + status.map(x => `<div class="${x.startsWith('⚠') ? 'alarm' : ''}">${esc(x)}</div>`).join('') +
      `<div class="hint">Talk to inmates (E) for ways out. ${this.me.baskets ? '🏀 ' + this.me.baskets : ''}</div>`;
    const vr = [`🔒 CELL ${this.me.cell + 1} · ${ph.name} ${left}s`, ...(items ? [items] : []), ...status].join('\n');
    return { html, vr };
  }

  tick(dt) {
    if (!this.st.alarm) return;
    this.alarmT -= dt;
    if (this.alarmT <= 0) { audio.playAlarm(); this.alarmT = 2.2; }
  }
}
