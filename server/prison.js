// CITY CHAOS - server-side prison: arrests, the cutscene timer, schedule, guards, cameras, alarms,
// escape items/doors and basketball. Everything is decided here so every player in the room sees
// the same doors, alarms and escape progress, and nobody can fake an escape.
import { PHASES, PHASE, ITEMS, PERIM, inPrisonArea } from '../public/shared/prison.js';
import { NPC_STATE } from './npcs.js';

export const PNPC = { GUARD: 3, PRISONER: 4 };
export const CUT_DUR = 44;          // seconds the arrest cutscene takes (players can skip)
const HOLD_TIME = 12;               // seconds in the station holding cell for a short arrest
const GUARD_SPEED = { patrol: 1.5, investigate: 2.8, chase: 5.1 };
const CATCH_DIST = 1.5;
const r2 = (v) => Math.round(v * 100) / 100;

const TALK = {
  'BIG MIKE': (p, j) => {
    if (j.pflags.has('code')) return 'Medical drawer code is 4-2-7-1. The nurse keeps a KEYCARD in there. You didn\'t hear it from me.';
    if (j.baskets >= 3) { j.pflags.add('code'); return 'Nice shooting, rookie! The medical drawer code is 4-2-7-1. There\'s a KEYCARD inside.'; }
    return `You wanna know a secret? Sink 3 baskets on the court first. (${j.baskets}/3)`;
  },
  'DOC': (p, j) => {
    if (j.pflags.has('tileKnown')) return 'One tile in the SHOWERS is loose. Dig with a SPOON. Down there, turn BOTH valves or the grate stays shut.';
    if (j.items.has('TRAY')) { j.items.delete('TRAY'); j.pflags.add('tileKnown'); return 'Ahh, real food! Psst... a tile in the SHOWERS is loose. Dig it out with a SPOON and you\'ll find the old sewer.'; }
    return 'I\'m starving. Bring me a FOOD TRAY from breakfast and I\'ll make it worth your while.';
  },
  'LEFTY': () => 'There\'s a fuse box on the WORKSHOP ROOF that powers the electric fence. Cut it, then a ROPE gets you over the wall.',
  'RICO': () => 'That van in the sally port? KEYS are in the CONTROL ROOM, next to the gate button. Open the gate and floor it.',
  'OLD PETE': () => 'Back in my day: MAINTENANCE PANEL in the laundry, SCREWDRIVER from the workshop, BOLT CUTTERS for the tunnel gate.',
  'SPARKS': () => 'Cameras are everywhere. With a KEYCARD you can get into the CONTROL ROOM and LOOP THE FEEDS for a minute.',
  'TINY': () => 'Put on a GUARD UNIFORM and nobody looks twice. Lockers are in the admin building. Bedsheets in the laundry make good rope too.',
  'MOUSE': () => 'Be back in your cell at LOCKDOWN. And guards hear EVERYTHING. Only dig or cut when they\'re far away.'
};

export class PrisonManager {
  constructor(room, map, world) {
    this.room = room; this.map = map; this.P = map.prison; this.world = world;
    this.doorBoxes = new Map();
    for (const b of world.boxes) if (b.door) { if (!this.doorBoxes.has(b.door)) this.doorBoxes.set(b.door, []); this.doorBoxes.get(b.door).push(b); }
    this.reset();
  }

  reset() {
    for (const bs of this.doorBoxes.values()) for (const b of bs) b.off = false;
    this.doorOpen = {}; this.doorUntil = {}; this.permOpen = new Set();
    this.flags = {}; this.fenceOffUntil = 0; this.camsOffUntil = 0; this.gateUntil = 0; this.gateAlarmAt = 0;
    this.alarm = { until: 0, target: 0, reason: '' };
    this.holders = {};
    this.clock = 0; this.phase = 0; this.phaseLeft = PHASES[0].dur;
    this.ball = { x: this.P.ball[0], y: this.P.ball[1], z: this.P.ball[2], vx: 0, vy: 0, vz: 0, holder: 0, thrower: 0, idleSince: 0 };
    this.holds = new Map();
    this.camCool = {};
    this.active = false; this.emptySince = 0; this.stateDirty = true; this.stateAt = 0;
    if (this.room.npcs) this.room.npcs.list = this.room.npcs.list.filter(n => !n.prison);
    this.guards = []; this.inmates = [];
    this.lastMsg = new Map();
  }

  now() { return this.room.now(); }
  prisoners() { return [...this.room.players.values()].filter(p => p.jail && p.connected); }
  inside() { return this.prisoners().filter(p => p.jail.state === 'in' && p.alive && p.pose); }

  // ---------------------------------------------------------------- arrests
  // Called for any arrest (cop player or NPC cop). 3+ stars -> prison, otherwise the station holding cell.
  arrest(p, byPlayer, byNpc) {
    if (!p.alive || p.jail || p.holding || p.role === 'cop') return false;
    const stars = p.wanted || 0;
    const room = this.room;
    if (p.inCar) room.vehicles.playerGone(p);
    const at = p.pose ? p.pose.h.slice(0, 3).map(r2) : [0, 1.5, 0];
    if (byPlayer && stars) byPlayer.cash = (byPlayer.cash || 0) + stars * 200; // arresting pays a double bounty
    this.saveInventory(p);
    room.npcs.clearWanted(p);
    room.broadcast({ type: 'arrested', id: p.id, by: byPlayer ? byPlayer.id : 0, npc: byNpc ? byNpc.id : 0, stars, prison: stars >= 3, scores: room.scores() });
    if (stars >= 3) {
      const cell = this.freeCell();
      p.jail = { state: 'cut', cell, since: this.now(), cutEnd: this.now() + CUT_DUR, items: new Set(), pflags: new Set(), baskets: 0, disguise: false };
      const yaw = p.pose ? yawOfQuat(p.pose.h) : 0;
      room.sendTo(p, { type: 'arrestCut', from: at, yaw: r2(yaw), dur: CUT_DUR, cell, bed: this.P.cells[cell].bed, cop: byPlayer ? byPlayer.id : 0 });
      this.activate();
      room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
    } else {
      const h = this.map.holding, c = h.cells[p.id % h.cells.length];
      p.holding = { until: this.now() + HOLD_TIME };
      room.sendTo(p, { type: 'arrestShort', t: HOLD_TIME, stars });
      room.teleport(p, c, 0);
    }
    return true;
  }

  saveInventory(p) {
    p.savedInv = { slots: p.slots.map(s => ({ ...s })), cur: p.cur };
    p.slots = []; p.cur = 0; p.reloadingUntil = 0;
    this.room.sendInventory(p);
  }
  restoreInventory(p) {
    if (p.savedInv && p.savedInv.slots.length) { p.slots = p.savedInv.slots; p.cur = Math.min(p.savedInv.cur, p.slots.length - 1); }
    else { p.slots = []; p.cur = 0; this.room.giveWeapon(p, 'pistol'); }
    p.savedInv = null;
    this.room.sendInventory(p);
  }

  freeCell() {
    const used = new Set(this.prisoners().map(q => q.jail.cell));
    for (let i = 0; i < this.P.cells.length; i++) if (!used.has(i)) return i;
    return Math.floor(Math.random() * this.P.cells.length);
  }

  skipCut(p) { if (p.jail && p.jail.state === 'cut' && this.now() - p.jail.since > 1.5) this.finishCut(p); }
  finishCut(p) {
    const j = p.jail; if (!j || j.state !== 'cut') return;
    j.state = 'in'; j.since = this.now();
    const c = this.P.cells[j.cell];
    p.hp = 100; p.alive = true;
    this.room.teleport(p, c.bed, c.yaw);
    this.room.sendTo(p, { type: 'jailStart', cell: j.cell, bed: c.bed, yaw: c.yaw });
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    this.sendMe(p); this.stateDirty = true;
  }

  bedSpawn(p) { const c = this.P.cells[p.jail.cell]; return { p: c.bed, yaw: c.yaw }; }

  meState(p) {
    const j = p.jail; if (!j) return null;
    return { state: j.state, cell: j.cell, items: [...j.items], pflags: [...j.pflags], baskets: j.baskets, disguise: j.disguise };
  }
  sendMe(p) { if (p.jail) this.room.sendTo(p, { type: 'pMe', ...this.meState(p) }); }
  msg(p, text, key = text) {
    const k = p.id + '|' + key, t = this.now();
    if (t - (this.lastMsg.get(k) || 0) < 1.2) return;
    this.lastMsg.set(k, t);
    this.room.sendTo(p, { type: 'pMsg', text });
  }

  escape(p, how) {
    const room = this.room, j = p.jail;
    if (!j) return;
    if (this.ball.holder === p.id) this.dropBall();
    this.releaseItems(p);
    if (p.inCar) { const car = room.vehicles.cars.find(c => c.id === p.inCar); room.vehicles.playerGone(p); if (car && car.home) room.vehicles.sendHome(car); }
    p.jail = null;
    this.restoreInventory(p);
    // back in the city, as far from the police station as we can manage
    const spots = this.map.spawns.filter(s => s.team === -1 && s.p[1] < 0.5);
    const sp = spots.sort((a, b) => Math.hypot(b.p[0] - 28, b.p[2] + 80) - Math.hypot(a.p[0] - 28, a.p[2] + 80))[Math.floor(Math.random() * Math.min(5, spots.length))] || this.map.spawns[0];
    room.teleport(p, sp.p, 0);
    room.broadcast({ type: 'escaped', id: p.id, how });
    room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
    room.npcs.addWanted(p, 5, 'prison escape');
    room.npcs.spawnCopsFor(p, 3);
    if (this.alarm.target === p.id) this.endAlarm();
    this.stateDirty = true;
  }

  releaseItems(p) {
    if (!p.jail) return;
    for (const k of Object.keys(this.holders)) if (this.holders[k] === p.id) delete this.holders[k];
    p.jail.items.clear();
    if (p.jail.disguise) { p.jail.disguise = false; this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) }); }
    this.stateDirty = true;
  }

  caught(p, guard) {
    const j = p.jail; if (!j || j.state !== 'in') return;
    if (this.ball.holder === p.id) this.dropBall();
    if (p.inCar) this.room.vehicles.playerGone(p);
    const had = j.items.size;
    this.releaseItems(p);
    const c = this.P.cells[j.cell];
    this.room.teleport(p, c.bed, c.yaw);
    this.room.sendTo(p, { type: 'pCaught', items: had });
    if (guard) this.say(guard, 'Back in your cell!');
    if (this.alarm.target === p.id) this.endAlarm();
    for (const g of this.guards) if (g.target === p.id) { g.target = 0; g.mode = g.static ? 'static' : 'return'; }
    this.sendMe(p);
  }

  playerGone(p) {
    if (this.ball.holder === p.id) this.dropBall();
    if (p.jail) for (const k of Object.keys(this.holders)) if (this.holders[k] === p.id) delete this.holders[k];
  }

  // ---------------------------------------------------------------- NPCs
  activate() {
    if (this.active) return;
    this.active = true; this.emptySince = 0;
    this.clock = 0; this.phase = 0; this.phaseLeft = PHASES[0].dur;
    const npcs = this.room.npcs;
    const add = (o) => npcs.add({ prison: true, hp: 999, maxHp: 999, yaw: 0, state: NPC_STATE.WALK, ...o });
    this.P.routes.forEach((r, i) => this.guards.push(add({ type: PNPC.GUARD, x: r[0][0], y: 0, z: r[0][1], route: i, wp: 1, mode: 'patrol', susp: {} })));
    for (const s of this.P.statics) this.guards.push(add({ type: PNPC.GUARD, x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.yaw, homeYaw: s.yaw, home: s.p, static: true, role: s.role, mode: 'static', susp: {}, state: NPC_STATE.IDLE }));
    for (const t of this.P.towers) this.guards.push(add({ type: PNPC.GUARD, x: t.x, y: t.y, z: t.z, yaw: t.yaw, homeYaw: t.yaw, home: [t.x, t.y, t.z], static: true, tower: true, mode: 'static', susp: {}, state: NPC_STATE.IDLE }));
    this.P.npcNames.forEach((name, i) => {
      const s = this.P.spots.yard[i];
      this.inmates.push(add({ type: PNPC.PRISONER, x: s[0], y: 0, z: s[1], name, idx: i, goal: s, lastProgress: 0, progX: s[0], progZ: s[1], state: NPC_STATE.IDLE }));
    });
    this.room.broadcast({ type: 'pAnnounce', text: 'ATTENTION: NEW INMATE ARRIVING AT THE MAIN GATE.' });
  }

  say(n, text) { this.room.broadcast({ type: 'pSay', id: n.id, text }); }
  announce(text) { this.room.broadcast({ type: 'pAnnounce', text }); }

  // ---------------------------------------------------------------- rules
  violation(p) {
    const j = p.jail; if (!j || j.state !== 'in') return null;
    const [x, y, z] = p.pose.h;
    for (const zn of this.P.zones) {
      const b = zn.b;
      if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) {
        if (zn.open && zn.open.includes(this.phase)) continue;
        return zn.name;
      }
    }
    if (this.phase === PHASE.LOCKDOWN && PHASES[PHASE.LOCKDOWN].dur - this.phaseLeft > 12) {
      const c = this.P.cells[j.cell];
      if (!(x > c.min[0] && x < c.max[0] && z > c.min[1] && z < c.max[1])) return 'Out of cell during lockdown';
    }
    return null;
  }

  sees(n, p, range, fov) {
    const [tx, ty, tz] = p.pose.h;
    const hx = n.x, hy = n.y + 1.55, hz = n.z;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, d = Math.hypot(dx, dy, dz);
    if (d > range) return false;
    if (fov < Math.PI) {
      const fx = -Math.sin(n.yaw), fz = -Math.cos(n.yaw), hd = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / hd < Math.cos(fov)) return false;
    }
    return this.world.raycast(hx, hy, hz, dx / d, dy / d, dz / d, d) >= d - 0.4;
  }

  setAlarm(p, reason) {
    const t = this.now();
    const was = this.alarm.until > t;
    this.alarm = { until: t + 25, target: p ? p.id : 0, reason };
    if (!was) {
      this.room.broadcast({ type: 'pAlarm', on: true, reason, target: p ? p.id : 0 });
      this.announce('⚠ ALERT! ' + reason.toUpperCase() + '! ALL GUARDS RESPOND!');
    }
    this.stateDirty = true;
  }
  endAlarm() {
    if (this.alarm.until <= 0) return;
    this.alarm = { until: 0, target: 0, reason: '' };
    this.room.broadcast({ type: 'pAlarm', on: false });
    this.stateDirty = true;
  }

  noise(x, y, z, radius) {
    for (const g of this.guards) {
      if (g.static || g.mode === 'chase') continue;
      if (Math.hypot(g.x - x, g.z - z) < radius && Math.abs(g.y - y) < 6) {
        if (g.mode !== 'investigate') this.say(g, 'What was that noise?');
        g.mode = 'investigate'; g.noise = [x, z]; g.lookUntil = 0;
      }
    }
  }

  // ---------------------------------------------------------------- doors
  setDoor(id, open) {
    if (this.doorOpen[id] === open) return;
    this.doorOpen[id] = open;
    for (const b of this.doorBoxes.get(id) || []) b.off = open;
    this.stateDirty = true;
  }
  updateDoors(t) {
    const lockCells = this.phase === PHASE.LOCKDOWN && PHASES[PHASE.LOCKDOWN].dur - this.phaseLeft > 8;
    for (const [id, d] of Object.entries(this.P.doors)) {
      let open;
      if (d.cell !== undefined) open = !lockCells;
      else if (d.phase !== undefined) open = this.phase === d.phase;
      else if (id === 'gate') open = t < this.gateUntil;
      else if (this.permOpen.has(id)) open = true;
      else open = t < (this.doorUntil[id] || 0);
      this.setDoor(id, open);
    }
  }

  // ---------------------------------------------------------------- interactions (client repeats 'pAct' while holding)
  onAct(p, id) {
    const j = p.jail; if (!j || j.state !== 'in' || !p.alive || !p.pose) return;
    const it = this.P.interacts.find(i => i.id === id); if (!it) return;
    const [hx, hy, hz] = p.pose.h;
    if (Math.hypot(hx - it.p[0], hz - it.p[2]) > (it.r || 2.3) || Math.abs(hy - it.p[1]) > 2.3) return;
    const t = this.now();
    if (it.phase && !it.phase.includes(this.phase)) return this.msg(p, it.phaseMsg || 'Not now.');
    if (it.pflag && !j.pflags.has(it.pflag)) return this.msg(p, it.pflagMsg || 'You don\'t know how to do that yet.');
    for (const need of it.need || []) if (!j.items.has(need)) return this.msg(p, `You need: ${ITEMS[need].icon} ${ITEMS[need].name.toUpperCase()}`);
    if (it.give) {
      if (j.items.has(it.give) || (it.give === 'UNIFORM' && j.disguise)) return this.msg(p, 'You already have that.');
      if (ITEMS[it.give].unique && this.holders[it.give]) return this.msg(p, 'Someone already took it.');
    }
    if (it.door && this.doorOpen[it.door] && !it.doorFor) return this.msg(p, 'Already open.');
    if (it.flag && this.flags[it.flag]) return this.msg(p, 'Already turned.');
    if (it.act === 'rope' && t >= this.fenceOffUntil) return this.msg(p, '⚡ The fence is still electrified! Cut the power first.');
    if (it.act === 'gate' && t < this.gateUntil) return this.msg(p, 'The gate is already open!');
    // hold progress
    let h = this.holds.get(p.id);
    if (!h || h.id !== id || t - h.last > 0.8) h = { id, progress: 0, last: t, noiseAt: t };
    h.progress += Math.min(0.4, t - h.last); h.last = t;
    this.holds.set(p.id, h);
    if (it.noise && t - h.noiseAt > 1) { h.noiseAt = t; this.noise(it.p[0], it.p[1], it.p[2], it.noise); }
    if (it.risky) for (const g of this.guards) if (Math.hypot(g.x - hx, g.z - hz) < it.risky && this.sees(g, p, it.risky, 1.2)) { this.say(g, 'HEY! Put that back!'); this.holds.delete(p.id); return this.caught(p, g); }
    if (h.progress < it.hold) { this.room.sendTo(p, { type: 'pHold', id, p: r2(h.progress / it.hold) }); return; }
    this.holds.delete(p.id);
    this.room.sendTo(p, { type: 'pHold', id, p: 1, done: true });
    this.complete(p, it, t);
  }

  complete(p, it, t) {
    const j = p.jail;
    if (it.give) {
      if (it.give === 'UNIFORM') {
        j.disguise = true; this.msg(p, '🦺 You\'re wearing a guard uniform. Walk calmly, keep your distance.');
        this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
      } else {
        j.items.add(it.give);
        if (ITEMS[it.give].unique) this.holders[it.give] = p.id;
        this.msg(p, `Got: ${ITEMS[it.give].icon} ${ITEMS[it.give].name.toUpperCase()}`);
      }
    }
    if (it.door) {
      if (it.doorFor) this.doorUntil[it.door] = t + it.doorFor;
      else { this.permOpen.add(it.door); }
      this.updateDoors(t);
      if (it.door === 'tile') this.msg(p, 'The tile comes loose... there\'s a sewer pipe below!');
      if (it.door === 'tgate') this.msg(p, 'The gate is open! The tunnel leads outside the walls.');
      if (it.door === 'vent') this.msg(p, 'The panel is off. A ladder goes down into the dark.');
    }
    if (it.flag) {
      this.flags[it.flag] = true;
      if (this.flags.valveA && this.flags.valveB) { this.permOpen.add('grate'); this.updateDoors(t); this.announceUnder('You hear the sewer water draining... the grate swings open!'); }
      else this.msg(p, 'The valve squeals as it turns. One more somewhere?');
    }
    if (it.act === 'gate') {
      this.gateUntil = t + 30; this.gateAlarmAt = t + 8; this.updateDoors(t);
      this.msg(p, '🚧 Main gate opening for 30 seconds!');
    }
    if (it.act === 'cams') { this.camsOffUntil = t + 60; this.msg(p, '📹 Camera feeds looping for 60 seconds.'); }
    if (it.act === 'fence') {
      this.fenceOffUntil = t + 45;
      this.announce('MAINTENANCE: PERIMETER FENCE POWER FAILURE. TECHNICIANS DISPATCHED.');
      this.noise(it.p[0], it.p[1], it.p[2], 30);
    }
    if (it.act === 'rope') {
      j.items.delete('ROPE');
      this.room.teleport(p, this.P.ropeLand, 0);
      this.escape(p, 'rooftop');
      return;
    }
    this.sendMe(p);
    this.stateDirty = true;
  }
  announceUnder(text) { for (const q of this.inside()) if (q.pose.h[1] < -1) this.room.sendTo(q, { type: 'pMsg', text }); }

  onTalk(p, id) {
    const j = p.jail; if (!j || j.state !== 'in' || !p.pose) return;
    const n = this.inmates.find(q => q.id === id); if (!n) return;
    if (Math.hypot(n.x - p.pose.h[0], n.z - p.pose.h[2]) > 3.2) return;
    const fn = TALK[n.name]; if (!fn) return;
    const text = fn(p, j);
    n.yaw = Math.atan2(-(p.pose.h[0] - n.x), -(p.pose.h[2] - n.z)); n.talkUntil = this.now() + 3;
    this.room.sendTo(p, { type: 'pTalkMsg', name: n.name, text });
    this.say(n, n.name);
    this.sendMe(p);
  }

  // ---------------------------------------------------------------- basketball
  onBallGrab(p) {
    const b = this.ball;
    if (!p.jail || p.jail.state !== 'in' || !p.pose || b.holder) return;
    if (Math.hypot(b.x - p.pose.h[0], b.z - p.pose.h[2]) > 2.4 || Math.abs(b.y - p.pose.h[1]) > 2.4) return;
    b.holder = p.id; b.vx = b.vy = b.vz = 0;
    this.room.broadcast({ type: 'pBall', ...this.ballState() });
  }
  onBallThrow(p, v) {
    const b = this.ball;
    if (b.holder !== p.id || !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) return;
    let [vx, vy, vz] = v; const sp = Math.hypot(vx, vy, vz);
    if (sp > 15) { vx *= 15 / sp; vy *= 15 / sp; vz *= 15 / sp; }
    const [hx, hy, hz] = p.pose.h, d = Math.hypot(vx, vz) || 1;
    b.x = hx + vx / d * 0.45; b.y = hy - 0.15; b.z = hz + vz / d * 0.45;
    b.vx = vx; b.vy = vy; b.vz = vz; b.holder = 0; b.thrower = p.id; b.idleSince = this.now();
  }
  dropBall() { const b = this.ball; b.holder = 0; b.vx = b.vy = b.vz = 0; }
  ballState() { const b = this.ball; return { x: r2(b.x), y: r2(b.y), z: r2(b.z), h: b.holder }; }
  tickBall(dt) {
    const b = this.ball, t = this.now();
    if (b.holder) {
      const p = this.room.players.get(b.holder);
      if (!p || !p.jail || p.jail.state !== 'in' || !p.alive || !p.pose) return this.dropBall();
      const [hx, hy, hz, qx, qy, qz, qw] = p.pose.h;
      const fx = -2 * (qx * qz + qw * qy), fz = -(1 - 2 * (qx * qx + qy * qy)), fl = Math.hypot(fx, fz) || 1;
      b.x = hx + fx / fl * 0.45; b.y = hy - 0.35; b.z = hz + fz / fl * 0.45;
      return;
    }
    const steps = 4, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const py = b.y;
      b.vy -= 9.8 * h;
      b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
      // hoops: ball falling down through the rim
      for (const [rx, ry, rz] of this.P.rims) {
        if (py >= ry && b.y < ry && Math.hypot(b.x - rx, b.z - rz) < 0.24) {
          const shooter = this.room.players.get(b.thrower);
          b.vx *= 0.3; b.vz *= 0.3;
          if (shooter && shooter.jail) {
            shooter.jail.baskets++;
            this.room.broadcast({ type: 'pScore', by: shooter.id, n: shooter.jail.baskets });
            this.sendMe(shooter);
          }
        }
      }
      const q = { x: b.x, y: b.y, z: b.z };
      const n = this.world.pushSphere(q, 0.12);
      if (n) {
        const l = Math.hypot(n.nx, n.ny, n.nz) || 1, nx = n.nx / l, ny = n.ny / l, nz = n.nz / l;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz;
        if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vz -= 1.6 * vn * nz; b.vx *= 0.92; b.vz *= 0.92; }
        b.x = q.x; b.y = q.y; b.z = q.z;
      }
    }
    if (Math.hypot(b.vx, b.vy, b.vz) < 0.3 && b.y < 0.4) { b.vx *= 0.8; b.vz *= 0.8; }
    const off = Math.abs(b.x) > 14 || b.z < 408 || b.z > 446 || b.y < -2;
    if ((off && t - b.idleSince > 12) || b.y < -3) { Object.assign(b, { x: this.P.ball[0], y: this.P.ball[1], z: this.P.ball[2], vx: 0, vy: 0, vz: 0 }); }
  }

  // ---------------------------------------------------------------- main tick (10 Hz)
  tick(dt) {
    const t = this.now();
    for (const p of this.room.players.values()) {
      if (p.holding && t >= p.holding.until) {
        p.holding = null;
        this.restoreInventory(p);
        this.room.teleport(p, this.map.holding.release, Math.PI);
        this.room.sendTo(p, { type: 'released' });
      }
      if (p.jail && p.jail.state === 'cut' && t >= p.jail.cutEnd) this.finishCut(p);
    }
    if (!this.active) return;
    const inside = this.inside();
    if (!this.prisoners().length) {
      if (!this.emptySince) this.emptySince = t;
      if (t - this.emptySince > 60) { this.reset(); this.room.broadcast({ type: 'pState', ...this.stateMsg() }); }
      return;
    }
    this.emptySince = 0;
    // schedule
    this.phaseLeft -= dt;
    if (this.phaseLeft <= 0) {
      this.phase = (this.phase + 1) % PHASES.length; this.phaseLeft = PHASES[this.phase].dur;
      const ph = PHASES[this.phase];
      this.announce(ph.lock ? 'LOCKDOWN! ALL INMATES RETURN TO YOUR CELLS. DOORS CLOSE IN 8 SECONDS.' : `ATTENTION INMATES: ${ph.name}. ${ph.hint}.`);
      this.stateDirty = true;
    }
    if (this.gateAlarmAt && t >= this.gateAlarmAt) { this.gateAlarmAt = 0; this.setAlarm(inside.find(q => q.inCar) || null, 'Unauthorized gate opening'); }
    if (this.alarm.until && t > this.alarm.until) this.endAlarm();
    this.updateDoors(t);
    // fence shocks + escapes
    const fenceOn = t >= this.fenceOffUntil;
    for (const p of inside) {
      const [x, y, z] = p.pose.h;
      if (x < PERIM.x0 - 0.7 || x > PERIM.x1 + 0.7 || z < PERIM.z0 - 0.7 || z > PERIM.z1 + 0.7) {
        if (y > -1.5) {
          const how = p.inCar ? 'vehicle' : p.jail.disguise ? 'disguise' : z > PERIM.z1 && Math.abs(x - 23) < 4 ? 'maintenance' : x < PERIM.x0 && Math.abs(z - 437) < 4 ? 'sewer' : 'over the wall';
          this.escape(p, how); continue;
        }
      } else if (!inPrisonArea(x, z)) { this.caught(p, null); continue; }
      if (fenceOn && y > 7.2 && t > (p.jail.shockAt || 0)) {
        const near = this.P.fences.some(f => x > f.min[0] - 0.8 && x < f.max[0] + 0.8 && z > f.min[2] - 0.8 && z < f.max[2] + 0.8);
        if (near) {
          p.jail.shockAt = t + 1.5;
          const cx = Math.max(PERIM.x0 + 2, Math.min(PERIM.x1 - 2, x)), cz = Math.max(PERIM.z0 + 2, Math.min(PERIM.z1 - 2, z));
          const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1;
          this.room.sendTo(p, { type: 'pShock', push: [r2(dx / l * 6), 3, r2(dz / l * 6)] });
          this.room.damage(p, null, 25, 'shock', false, null);
          this.setAlarm(p, 'Electric fence contact');
        }
      }
    }
    const still = inside.filter(p => p.jail && p.jail.state === 'in');   // some may have escaped just now
    this.tickGuards(dt, t, still);
    this.tickCameras(t, still);
    this.tickInmates(dt, t, still);
    this.tickBall(dt);
    for (const n of [...this.guards, ...this.inmates]) { n.hist.push({ t, x: n.x, y: n.y, z: n.z }); if (n.hist.length > 12) n.hist.shift(); }
    if (this.stateDirty || t - this.stateAt > 1) { this.stateDirty = false; this.stateAt = t; this.room.broadcast({ type: 'pState', ...this.stateMsg() }); }
  }

  stateMsg() {
    const t = this.now();
    return {
      active: this.active, phase: this.phase, left: Math.round(this.phaseLeft), doors: Object.keys(this.doorOpen).filter(k => this.doorOpen[k]),
      fence: Math.max(0, Math.round(this.fenceOffUntil - t)), cams: Math.max(0, Math.round(this.camsOffUntil - t)),
      gate: Math.max(0, Math.round(this.gateUntil - t)), alarm: this.alarm.until > t ? 1 : 0, holders: this.holders, flags: this.flags
    };
  }

  tickCameras(t, inside) {
    if (t < this.camsOffUntil || !inside.length) return;
    for (const cam of this.P.cameras) {
      if (t < (this.camCool[cam.id] || 0)) continue;
      const sweep = cam.yaw + Math.sin(t * 0.8 + cam.id) * 0.6;
      const pseudo = { x: cam.p[0], y: cam.p[1] - 1.55, z: cam.p[2], yaw: sweep };
      for (const p of inside) {
        if (p.jail.disguise) continue;
        const v = this.violation(p); if (!v) continue;
        if (!this.sees(pseudo, p, 17, 0.55)) continue;
        this.camCool[cam.id] = t + 10;
        this.room.broadcast({ type: 'pCam', id: cam.id });
        this.setAlarm(p, `Camera spotted a prisoner: ${cam.name}`);
        break;
      }
    }
  }

  tickGuards(dt, t, inside) {
    const npcs = this.room.npcs;
    const alarmTarget = this.alarm.until > t ? this.room.players.get(this.alarm.target) : null;
    for (const g of this.guards) {
      // detection
      if (g.mode !== 'chase') {
        for (const p of inside) {
          const d = Math.hypot(p.pose.h[0] - g.x, p.pose.h[2] - g.z);
          if (d > (g.tower ? 36 : 20)) continue;
          const v = this.violation(p);
          if (p.jail.disguise) {
            // a disguise only fails up close: stay near a guard for a few seconds and they recognize you
            if (d < 2.6 && this.sees(g, p, 3, Math.PI)) {
              g.susp[p.id] = (g.susp[p.id] || 0) + dt;
              if (g.susp[p.id] > 2.5) { g.susp[p.id] = 0; this.blowCover(p, g); }
            } else g.susp[p.id] = Math.max(0, (g.susp[p.id] || 0) - dt);
            continue;
          }
          if (!v) continue;
          if (!this.sees(g, p, g.tower ? 36 : 20, g.tower ? Math.PI : 1.15)) continue;
          if (g.static) {
            if (t > (g.shoutAt || 0)) { g.shoutAt = t + 6; this.say(g, g.tower ? 'TOWER TO ALL UNITS: PRISONER IN ' + v.toUpperCase() + '!' : 'HEY! You can\'t be here!'); }
            this.setAlarm(p, `${v}`);
          } else {
            this.say(g, 'HEY! STOP RIGHT THERE!');
            g.mode = 'chase'; g.target = p.id; g.chaseStart = t; g.lastSeen = t; g.progAt = t; g.progX = g.x; g.progZ = g.z;
          }
          break;
        }
      }
      if (g.static) {
        if (g.tower) { g.yaw = g.homeYaw + Math.sin(t * 0.35 + g.id) * 1.4; g.state = NPC_STATE.IDLE; continue; }
        if (g.role === 'checkpoint' && alarmTarget) { g.mode = 'chase'; g.target = alarmTarget.id; g.lastSeen = t; g.progAt = t; g.progX = g.x; g.progZ = g.z; g.static = false; g.wasStatic = true; }
        else { g.state = NPC_STATE.IDLE; g.yaw = g.homeYaw; continue; }
      }
      if (alarmTarget && g.mode !== 'chase' && alarmTarget.jail && alarmTarget.jail.state === 'in') {
        g.mode = 'chase'; g.target = alarmTarget.id; g.lastSeen = t; g.progAt = t; g.progX = g.x; g.progZ = g.z;
      }
      if (g.mode === 'chase') this.guardChase(g, dt, t, npcs);
      else if (g.mode === 'investigate') {
        const [nx, nz] = g.noise; const dx = nx - g.x, dz = nz - g.z, d = Math.hypot(dx, dz);
        g.state = NPC_STATE.WALK;
        if (d > 1.2) { npcs.walk(g, dx / d, dz / d, GUARD_SPEED.investigate * dt); g.yaw = Math.atan2(-dx, -dz); }
        else { if (!g.lookUntil) g.lookUntil = t + 4; g.yaw += dt * 1.6; g.state = NPC_STATE.IDLE; if (t > g.lookUntil) { g.mode = 'return'; g.lookUntil = 0; } }
      } else if (g.mode === 'return') {
        if (g.wasStatic) {
          const [hx, , hz] = g.home, dx = hx - g.x, dz = hz - g.z, d = Math.hypot(dx, dz);
          if (d > 0.6) { npcs.walk(g, dx / d, dz / d, GUARD_SPEED.investigate * dt); g.yaw = Math.atan2(-dx, -dz); g.state = NPC_STATE.WALK; }
          else { g.static = true; g.mode = 'static'; g.wasStatic = false; }
        } else {
          const r = this.P.routes[g.route];
          let best = 0, bd = Infinity; r.forEach((w, i) => { const d = Math.hypot(w[0] - g.x, w[1] - g.z); if (d < bd) { bd = d; best = i; } });
          g.wp = best; g.mode = 'patrol';
        }
      } else this.guardPatrol(g, dt, t, npcs);
    }
  }
  guardPatrol(g, dt, t, npcs) {
    const r = this.P.routes[g.route]; const [wx, wz] = r[g.wp];
    const dx = wx - g.x, dz = wz - g.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { g.wp = (g.wp + 1) % r.length; return; }
    const moved = npcs.walk(g, dx / d, dz / d, GUARD_SPEED.patrol * dt);
    g.yaw = Math.atan2(-dx, -dz); g.state = NPC_STATE.WALK;
    if (moved < 0.01) { g.stuck = (g.stuck || 0) + dt; if (g.stuck > 3) { g.x = wx; g.z = wz; g.y = npcs.floorAt(wx, wz, 0.2); g.stuck = 0; } } else g.stuck = 0;
  }
  guardChase(g, dt, t, npcs) {
    const p = this.room.players.get(g.target);
    if (!p || !p.jail || p.jail.state !== 'in' || !p.alive || !p.pose) { g.mode = 'return'; g.target = 0; return; }
    const [tx, ty, tz] = p.pose.h;
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
    if (this.sees(g, p, 30, Math.PI)) g.lastSeen = t;
    if (d < CATCH_DIST && Math.abs(ty - (g.y + 1.55)) < 2.2) return this.caught(p, g);
    const alarmOn = this.alarm.until > t && this.alarm.target === p.id;
    if (!alarmOn && t - g.lastSeen > 6) { this.say(g, 'Lost them...'); g.mode = 'return'; g.target = 0; return; }
    if (!alarmOn && !this.violation(p) && t - g.chaseStart > 3 && t - g.lastSeen > 2) { this.say(g, 'Stay out of trouble.'); g.mode = 'return'; g.target = 0; return; }
    if (t - g.chaseStart > 4 && !alarmOn) this.setAlarm(p, 'Prisoner escape attempt');
    let mx = dx / (d || 1), mz = dz / (d || 1);
    if (t < (g.sideUntil || 0)) { const sx = -mz * g.side, sz = mx * g.side; mx = mx * 0.3 + sx; mz = mz * 0.3 + sz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    npcs.walk(g, mx, mz, GUARD_SPEED.chase * dt);
    g.yaw = Math.atan2(-dx, -dz); g.state = NPC_STATE.PANIC;
    if (Math.hypot(g.x - g.progX, g.z - g.progZ) > 1.2) { g.progAt = t; g.progX = g.x; g.progZ = g.z; }
    else if (t - g.progAt > 1.4 && t > (g.sideUntil || 0)) { g.side = Math.random() < 0.5 ? -1 : 1; g.sideUntil = t + 1.4; }
  }
  blowCover(p, g) {
    p.jail.disguise = false;
    this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
    this.say(g, 'Wait... you\'re not a guard!');
    this.msg(p, '❗ Your disguise was blown!');
    g.mode = 'chase'; g.target = p.id; g.chaseStart = t0(this); g.lastSeen = t0(this); g.progAt = t0(this); g.progX = g.x; g.progZ = g.z;
    if (g.static) { g.static = false; g.wasStatic = true; }
    this.setAlarm(p, 'Prisoner in a guard uniform');
    this.sendMe(p);
  }

  tickInmates(dt, t, inside) {
    const npcs = this.room.npcs;
    const key = this.phase === PHASE.BREAKFAST ? 'cafeteria' : this.phase === PHASE.WORK ? 'work' : this.phase === PHASE.LOCKDOWN ? 'hall' : this.phase === PHASE.YARD ? 'yard' : (this.phase === PHASE.FREE ? 'yard' : 'hall');
    for (const n of this.inmates) {
      if (t < (n.talkUntil || 0)) { n.state = NPC_STATE.IDLE; continue; }
      const s = this.P.spots[key][n.idx];
      if (n.goalKey !== key) { n.goalKey = key; n.goal = [s[0] + (Math.random() - 0.5) * 2, s[1] + (Math.random() - 0.5) * 2]; n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
      const [gx, gz] = n.goal, dx = gx - n.x, dz = gz - n.z, d = Math.hypot(dx, dz);
      if (d < 0.5) {
        n.state = NPC_STATE.IDLE;
        if (Math.random() < dt * 0.08) n.goal = [s[0] + (Math.random() - 0.5) * 3, s[1] + (Math.random() - 0.5) * 3];
        continue;
      }
      npcs.walk(n, dx / d, dz / d, 1.3 * dt);
      n.yaw = Math.atan2(-dx, -dz); n.state = NPC_STATE.WALK;
      if (Math.hypot(n.x - n.progX, n.z - n.progZ) > 1) { n.lastProgress = t; n.progX = n.x; n.progZ = n.z; }
      else if (t - n.lastProgress > 3) {
        // blocked by a wall: hop to the goal when nobody is looking (keeps the AI cheap for Quest)
        const seen = inside.some(p => Math.hypot(p.pose.h[0] - n.x, p.pose.h[2] - n.z) < 18 || Math.hypot(p.pose.h[0] - gx, p.pose.h[2] - gz) < 18);
        if (!seen) { n.x = gx; n.z = gz; n.y = npcs.floorAt(gx, gz, 0.2); n.hist = []; }
        n.lastProgress = t;
      }
    }
  }
}

function t0(pm) { return pm.now(); }
function yawOfQuat(h) { const [, , , qx, qy, qz, qw] = h; return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)); }
