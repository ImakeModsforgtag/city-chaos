// CITY CHAOS - authoritative game room.
// The server owns: health, ammo, inventory, pickups, hit detection, kills, scores, respawns, match flow.
// Clients only send their pose + intents (shoot / reload / pickup / switch).
import { buildMap } from '../public/shared/map.js';
import { CollisionWorld, raySphere, rayCapsule } from '../public/shared/collision.js';
import { NPCManager, rayNpc } from './npcs.js';
import { VehicleManager } from './vehicles.js';
import { PrisonManager } from './prison.js';
import { GoldenSniper } from './golden.js';
import { onShopBuy, soakArmor } from './shops.js';
import { Saves } from './profiles.js';
import { addReport } from './bugs.js';
import { CityBank } from './bank.js';
import { Jobs } from './jobs.js';
import { BANK } from '../public/shared/economy.js';
import { lockCos } from '../public/shared/levels.js';
import { inPrisonArea } from '../public/shared/prison.js';
import { WEAPONS, WEAPON_IDS, MAX_SLOTS, DEFAULT_WEAPON, falloff, publicWeapon } from '../public/shared/weapons.js';
import {
  MAX_HEALTH, RESPAWN_TIME, MAX_PLAYERS, MODES, HEAD_RADIUS, BODY_TOP, BODY_BOTTOM, BODY_RADIUS,
  RECONNECT_GRACE
} from '../public/shared/constants.js';

const MAP = buildMap();
// each room gets its own collision world so prison doors can open in one room and stay shut in another
const roomWorld = () => new CollisionWorld(MAP.boxes.map(b => b.vaultDoor ? { ...b, min: [...b.min], max: [...b.max] } : b).concat(   // (each room has its own bank vault door)
  MAP.prison.boxes.map(b => b.door ? { ...b, min: [...b.min], max: [...b.max] } : b)));
const HISTORY = 40;                // pose history samples kept for lag compensation (~2s at 20Hz)
const MAX_REWIND = 0.35;           // seconds
const SPAWN_PROTECT = 1.5;

export const now = () => performance.now() / 1000;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function sanitizeName(n) {
  n = String(n || '').replace(/[^\w \-!?.]/g, '').trim().slice(0, 16);
  return n || 'Player';
}
function sanitizeCos(c) {
  c = c || {};
  const int = (v, max) => clamp(Math.floor(Number(v) || 0), 0, max);
  const color = (v) => /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#ff9f1c';
  return { color: color(c.color), accent: color(c.accent || '#ffffff'), head: int(c.head, 3), body: int(c.body, 3),
           hat: int(c.hat, 6), glasses: int(c.glasses, 4), back: int(c.back, 4) };
}

export class Room {
  constructor(code, opts, server) {
    this.code = code;
    this.server = server;
    this.isPublic = !!opts.isPublic;
    this.crooksOn = opts.crooks !== false && process.env.CROOKS !== 'off' && (process.env.CC_TEST !== '1' || process.env.CROOKS === 'on');   // (automated test servers only get robbers on request)   // NPC robbers + car thieves (env CROOKS=off turns them off)
    this.missionsOn = opts.missions !== false && opts.progress !== false;   // tests turn these off so cash checks stay exact
    this.xpOn = opts.progress !== false;
    this.crimes = opts.crimes !== false;   // player-vs-player crimes (attacking players, destruction). Tests that need a pure deathmatch turn it off.
    this.mode = MODES[opts.mode] ? opts.mode : 'ffa';
    this.killLimit = clamp(Number(opts.killLimit) || MODES[this.mode].killLimit, 5, 200);
    this.timeLimit = clamp(Number(opts.timeLimit) || MODES[this.mode].timeLimit, 60, 3600);
    this.players = new Map();
    this.hostId = null;
    this.rockets = [];
    this.nextRocketId = 1;
    this.pickups = MAP.pickups.map(p => ({ ...p, avail: true, respawnAt: 0 }));
    this.teamScores = [0, 0];
    this.match = { state: 'playing', endsAt: now() + this.timeLimit, winner: null, resetAt: 0 };
    this.created = now();
    this.world = roomWorld();
    this.npcs = new NPCManager(this, MAP, this.world);
    this.vehicles = new VehicleManager(this, MAP, this.world);
    this.prison = new PrisonManager(this, MAP, this.world);
    this.gold = new GoldenSniper(this, MAP);
    this.saves = new Saves(this);   // saved progress (cash + lifetime stats)
    this.bank = new CityBank(this, MAP);   // savings accounts + the vault heist
    this.jobs = new Jobs(this, MAP);       // delivery + taxi jobs
    this.npcAcc = 0; this.snapCount = 0;
  }
  now() { return now(); }
  teamsMode() { return !!MODES[this.mode].teams; }

  get connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }
  get size() { return this.players.size; }

  // ------------------------------------------------------------------ membership
  addPlayer(client, info) {
    const id = client.id;
    const team = MODES[this.mode].teams ? this.smallerTeam() : -1;
    const p = {
      id, client, token: client.token, name: sanitizeName(info.name), cos: sanitizeCos(info.cos), role: info.role === 'cop' ? 'cop' : 'civilian',
      team, connected: true, disconnectedAt: 0,
      hp: MAX_HEALTH, alive: false, respawnAt: now() + 0.1, life: 0, protectUntil: 0,
      inCar: 0, kills: 0, deaths: 0, headshots: 0, cash: 0, wanted: 0, wantedSeenAt: 0, robs: 0,
      slots: [], cur: 0, reloadingUntil: 0, lastShot: 0,
      pose: null, hist: [], vr: false, lastStateAt: 0, joinedAt: now()
    };
    this.players.set(id, p);
    this.saves.attach(p, info.profile);   // your saved cash + stats
    if (!this.hostId) this.hostId = id;
    client.room = this;
    this.spawn(p);
    this.sendTo(p, { type: 'joined', ...this.fullState(p) });
    this.saves.hello(p);
    this.sendTo(p, this.bank.stateMsg());
    this.broadcast({ type: 'playerJoined', p: this.publicPlayer(p) }, id);
    return p;
  }

  reattach(p, client) {
    p.client = client; p.connected = true; p.disconnectedAt = 0;
    client.room = this; client.id = p.id;
    this.sendTo(p, { type: 'joined', ...this.fullState(p), reconnected: true });
    this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) }, p.id);
    this.sendInventory(p);
  }

  dropConnection(p) {
    this.vehicles.playerGone(p);
    p.connected = false; p.disconnectedAt = now(); p.client = null;
    this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) });
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.job) this.jobs.end(p, 'quit', true);
    this.saves.save(p, true);   // last save before leaving (if still connected)
    this.vehicles.playerGone(p);
    this.prison.playerGone(p);
    this.players.delete(id);
    this.gold.playerGone(id);
    this.server.tokens.delete(p.token);
    if (this.hostId === id) {
      const next = [...this.players.values()].find(q => q.connected) || [...this.players.values()][0];
      this.hostId = next ? next.id : null;
    }
    this.broadcast({ type: 'playerLeft', id, hostId: this.hostId });
  }

  smallerTeam() {
    let a = 0, b = 0;
    for (const p of this.players.values()) { if (p.team === 0) a++; else if (p.team === 1) b++; }
    return a <= b ? 0 : 1;
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, cos: p.cos, team: p.team, hp: p.hp, alive: p.alive, kills: p.kills,
             deaths: p.deaths, connected: p.connected, vr: p.vr, host: p.id === this.hostId, cash: p.cash || 0, wanted: p.wanted || 0, role: p.role || 'civilian',
             jail: p.jail ? (p.jail.state === 'cut' ? 1 : p.jail.disguise ? 3 : 2) : 0, lvl: p.lvl || 1 };
  }

  fullState(p) {
    return {
      code: this.code, you: p.id, mode: this.mode, isPublic: this.isPublic, hostId: this.hostId,
      killLimit: this.killLimit, timeLimit: this.timeLimit, team: p.team,
      players: [...this.players.values()].map(q => this.publicPlayer(q)),
      pickups: this.pickups.map(k => [k.id, k.avail ? 1 : 0]),
      teamScores: this.teamScores, match: this.matchInfo(), st: now(),
      spawn: p.spawnPoint, life: p.life, inv: this.invPayload(p), npcs: this.npcs.snapshot(), cars: this.vehicles.snapshot(), inCar: p.inCar || 0, ride: p.ride || null,
      jail: this.prison.meState(p), prison: this.prison.stateMsg(), holding: p.holding ? 1 : 0
    };
  }

  matchInfo() {
    return { state: this.match.state, remaining: Math.max(0, this.match.endsAt - now()), winner: this.match.winner,
             resetIn: this.match.state === 'ended' ? Math.max(0, this.match.resetAt - now()) : 0 };
  }

  // ------------------------------------------------------------------ messaging
  sendTo(p, msg) { if (p.connected && p.client) p.client.send(msg); }
  broadcast(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== exceptId && p.connected && p.client) p.client.sendRaw(data);
  }

  handle(p, msg) {
    switch (msg.type) {
      case 'state': return this.onState(p, msg);
      case 'shoot': return this.onShoot(p, msg);
      case 'reload': return this.onReload(p);
      case 'switch': return this.onSwitch(p, msg);
      case 'pickup': return this.onPickup(p, msg);
      case 'cosmetics':
        p.cos = lockCos(sanitizeCos(msg.cos), p.lvl || 1); if (msg.name) p.name = sanitizeName(msg.name);
        return this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) });
      case 'settings': return this.onSettings(p, msg);
      case 'rob': return this.npcs.onRob(p, Math.floor(Number(msg.id)));
      case 'hijack': return this.vehicles.onHijack(p, Math.floor(Number(msg.id)));
      case 'exitCar': return this.vehicles.onExit(p);
      case 'siren': return this.vehicles.onSiren(p, msg.on);
      case 'arrest': return this.onArrest(p, Math.floor(Number(msg.id)));
      case 'arrestCrook': return this.npcs.crooks.onArrest(p, Math.floor(Number(msg.id)));
      case 'pAct': return this.prison.onAct(p, String(msg.id || ''));
      case 'pTalk': return this.prison.onTalk(p, Math.floor(Number(msg.id)));
      case 'ballGrab': return this.prison.onBallGrab(p);
      case 'ballThrow': return this.prison.onBallThrow(p, msg.v);
      case 'skipCut': return this.prison.skipCut(p);
      case 'buyGold': return this.gold.onBuy(p);
      case 'shopBuy': return onShopBuy(this, p, msg);
      case 'testGold': // automated browser tests only (server started with CC_TEST=1)
        if (process.env.CC_TEST === '1') { p.arrests = 5; p.cash = (p.cash || 0) + 1000; this.sendTo(p, this.gold.info(p, { first: 1 })); }
        return;
      case 'testTp': // automated browser tests only (server started with CC_TEST=1)
        if (process.env.CC_TEST === '1' && Array.isArray(msg.p)) { this.teleport(p, msg.p.map(Number), Number(msg.yaw) || 0); p.cash = Number(msg.cash) || p.cash; this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) }); }
        return;
      case 'testMission': // automated browser tests only: count a mission event
        if (process.env.CC_TEST === '1') this.saves.event(p, String(msg.ev), Math.max(0, Number(msg.n)));
        return;
      case 'heist': return msg.a === 'grab' ? this.bank.onGrab(p, msg.i) : this.bank.onDrill(p);
      case 'bugReport': if (addReport('bug', p, this, msg)) this.sendTo(p, { type: 'bugThanks' }); return;
      case 'clientError': addReport('error', p, this, msg); return;
      case 'tutorial': return this.saves.tutorial(p, msg.a === 'done' ? 'done' : 'skip');
      case 'jobQuit': if (p.job) this.jobs.end(p, 'quit'); return;
      case 'testNoCops': // automated browser tests only: no NPC police in this room
        if (process.env.CC_TEST === '1') { this.npcs.noCops = true; for (const n of this.npcs.list) if (n.type === 2) n.remove = true; for (const c of this.vehicles.cars) if (c.temp) c.remove = true; }
        return;
      case 'testXp': // automated browser tests only: give XP
        if (process.env.CC_TEST === '1') this.saves.addXP(p, Math.max(0, Number(msg.amt) || 0), 'kill');
        return;
      case 'testCrook': // automated browser tests only: start an NPC robbery / car theft right now
        if (process.env.CC_TEST === '1') { const C = this.npcs.crooks; C.nextAt = Infinity; const n = msg.job === 'car' ? C.startCarTheft(this.now()) : C.startRobbery(this.now(), msg.shop || null); if (n && msg.noCops) n.noCops = true; this.sendTo(p, { type: 'testCrook', id: n ? n.id : 0, car: n && n.carTarget }); }
        return;
      case 'setRole': {
        const role = msg.role === 'cop' ? 'cop' : 'civilian';
        if (role === p.role || p.jail || p.holding) return;
        p.role = role;
        if (p.wanted) this.npcs.clearWanted(p);
        if (p.alive) this.kill(p, null, null, false, true); // quick silent respawn at the right place
        return this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) });
      }
      case 'rtc': {
        const to = this.players.get(msg.to);
        if (to && to.connected) this.sendTo(to, { type: 'rtc', from: p.id, data: msg.data });
        return;
      }
      case 'voice': p.voice = !!msg.on; return this.broadcast({ type: 'voice', id: p.id, on: p.voice }, p.id);
      case 'switchTeam':
        if (MODES[this.mode].teams) {
          p.team = p.team === 0 ? 1 : 0; this.kill(p, null, null, false, true);
          this.broadcast({ type: 'playerUpdate', p: this.publicPlayer(p) });
        }
        return;
    }
  }

  onSettings(p, msg) {
    if (p.id !== this.hostId) return;
    if (MODES[msg.mode]) this.mode = msg.mode;
    this.killLimit = clamp(Number(msg.killLimit) || MODES[this.mode].killLimit, 5, 200);
    this.timeLimit = clamp(Number(msg.timeLimit) || MODES[this.mode].timeLimit, 60, 3600);
    // reassign teams
    let i = 0;
    for (const q of this.players.values()) q.team = MODES[this.mode].teams ? (i++ % 2) : -1;
    this.resetMatch();
    this.broadcast({ type: 'roomSettings', mode: this.mode, killLimit: this.killLimit, timeLimit: this.timeLimit,
                     players: [...this.players.values()].map(q => this.publicPlayer(q)) });
  }

  onState(p, m) {
    if (!Array.isArray(m.h) || m.h.length !== 7 || !Array.isArray(m.l) || !Array.isArray(m.r)) return;
    if (m.life !== p.life) return;          // stale state from before a respawn/teleport
    const vals = [...m.h, ...m.l, ...m.r];
    if (vals.length !== 21 || vals.some(v => typeof v !== 'number' || !Number.isFinite(v))) return;
    const t = now();
    const [hx, hy, hz] = m.h;
    if ((Math.abs(hx) > 130 || Math.abs(hz) > 130) && !inPrisonArea(hx, hz)) return;
    if (hy < -20 || hy > 80) return;
    if (p.jail && p.jail.state === 'cut') return; // frozen during the arrest cutscene
    if (p.pose && p.alive) {
      const dt = Math.max(0.03, t - p.lastStateAt);
      const dist = Math.hypot(hx - p.pose.h[0], hy - p.pose.h[1], hz - p.pose.h[2]);
      if (dist / dt > 40 && dist > 3) return; // impossible speed -> ignore (anti teleport)
    }
    p.pose = { h: m.h, l: m.l, r: m.r };
    if (p.inCar && m.car) this.vehicles.onCarState(p, m.car);
    p.vr = !!m.vr;
    p.lastStateAt = t;
    p.hist.push({ t, x: hx, y: hy, z: hz });
    if (p.hist.length > HISTORY) p.hist.shift();
  }

  // position of p's head at server time t (lag compensation)
  headAt(p, t) {
    const h = p.hist;
    if (!h.length) return p.pose ? { x: p.pose.h[0], y: p.pose.h[1], z: p.pose.h[2] } : null;
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return h[0];
  }

  // ------------------------------------------------------------------ inventory
  giveWeapon(p, w, equip = true) {
    const def = WEAPONS[w];
    const existing = p.slots.findIndex(s => s.w === w);
    if (existing >= 0) {
      p.slots[existing].reserve = Math.min(def.reserve * 2, p.slots[existing].reserve + def.mag * 2);
      if (equip) { p.cur = existing; }
    } else if (p.slots.length < MAX_SLOTS) {
      p.slots.push({ w, mag: def.mag, reserve: def.reserve });
      if (equip) p.cur = p.slots.length - 1;
    } else {
      // full: replace the gun in your hands (but never the one-of-a-kind Golden Sniper)
      let i = p.cur;
      if (p.slots[i] && p.slots[i].w === 'golden') i = p.slots.findIndex(s => s.w !== 'golden');
      if (i < 0) i = p.cur;
      p.slots[i] = { w, mag: def.mag, reserve: def.reserve };
      if (equip) p.cur = i;
    }
    p.reloadingUntil = 0;
  }
  invPayload(p) {
    return { slots: p.slots.map(s => ({ w: s.w, mag: s.mag, reserve: s.reserve })), cur: p.cur,
             reloading: Math.max(0, p.reloadingUntil - now()) };
  }
  sendInventory(p) { this.sendTo(p, { type: 'inv', ...this.invPayload(p) }); }

  onSwitch(p, m) {
    const s = Math.floor(Number(m.slot));
    if (!p.alive || !(s >= 0 && s < p.slots.length) || s === p.cur) return;
    p.cur = s; p.reloadingUntil = 0;
    this.sendInventory(p);
  }

  onReload(p) {
    const s = p.slots[p.cur];
    if (!p.alive || !s) return;
    const def = WEAPONS[s.w];
    if (s.mag >= def.mag || s.reserve <= 0 || p.reloadingUntil > now()) return;
    p.reloadingUntil = now() + def.reloadTime;
    p.reloadSlot = p.cur;
    this.sendInventory(p);
    this.broadcast({ type: 'reloading', id: p.id, w: s.w }, p.id);
  }

  finishReloads(t) {
    for (const p of this.players.values()) {
      if (p.reloadingUntil && t >= p.reloadingUntil) {
        p.reloadingUntil = 0;
        const s = p.slots[p.reloadSlot];
        if (s && p.reloadSlot === p.cur) {
          const def = WEAPONS[s.w];
          const need = def.mag - s.mag, take = Math.min(need, s.reserve);
          s.mag += take; s.reserve -= take;
        }
        this.sendInventory(p);
      }
    }
  }

  onPickup(p, m) {
    const k = this.pickups[Math.floor(Number(m.id))];
    if (!k || !k.avail || !p.alive || !p.pose) return;
    const [hx, hy, hz] = p.pose.h;
    // must be close to head OR either hand
    const near = (x, y, z) => Math.hypot(x - k.p[0], y - k.p[1], z - k.p[2]);
    const d = Math.min(near(hx, hy, hz), near(p.pose.l[0], p.pose.l[1], p.pose.l[2]), near(p.pose.r[0], p.pose.r[1], p.pose.r[2]));
    if (d > 3.2) return;
    if (k.kind === 'weapon') this.giveWeapon(p, k.weapon);
    else if (k.kind === 'ammo') {
      if (!p.slots.length) return;
      for (const s of p.slots) { const def = WEAPONS[s.w]; s.reserve = Math.min(def.reserve * 2, s.reserve + Math.max(def.mag, 2)); }
    } else if (k.kind === 'health') {
      if (p.hp >= MAX_HEALTH) return;
      p.hp = Math.min(MAX_HEALTH, p.hp + 50);
      this.broadcast({ type: 'hp', id: p.id, hp: p.hp });
    }
    k.avail = false; k.respawnAt = now() + k.respawn;
    this.broadcast({ type: 'pickup', id: k.id, avail: 0, by: p.id, kind: k.kind, w: k.weapon });
    this.sendInventory(p);
  }

  // ------------------------------------------------------------------ combat
  onShoot(p, m) {
    const t = now();
    if (p.arrestBy) this.npcs.resistArrest(p, 'shooting');
    const s = p.slots[p.cur];
    if (!p.alive || !s || s.w !== m.w || !p.pose) return this.sendInventory(p);
    const def = WEAPONS[s.w];
    if (p.reloadingUntil > t) return this.sendInventory(p);
    if (s.mag <= 0) return this.sendInventory(p);
    if (t - p.lastShot < def.fireInterval * 0.8) return;            // fire-rate cap
    if (!Array.isArray(m.o) || m.o.length !== 3 || !Array.isArray(m.d) || !m.d.length) return;
    const o = m.o.map(Number);
    if (o.some(v => !Number.isFinite(v))) return;
    const [hx, hy, hz] = p.pose.h;
    if (Math.hypot(o[0] - hx, o[1] - hy, o[2] - hz) > 2.6) return;   // muzzle must be near the shooter
    p.lastShot = t;
    s.mag--;
    p.protectUntil = 0;

    // normalize + validate directions
    const pellets = Math.max(1, def.pellets);
    const dirs = [];
    for (let i = 0; i < Math.min(pellets, m.d.length); i++) {
      const d = m.d[i]; if (!Array.isArray(d) || d.length !== 3) return;
      const l = Math.hypot(d[0], d[1], d[2]); if (!(l > 0.5 && l < 1.5)) return;
      dirs.push([d[0] / l, d[1] / l, d[2] / l]);
    }
    const d0 = dirs[0];
    for (const d of dirs) {
      const dot = d[0] * d0[0] + d[1] * d0[1] + d[2] * d0[2];
      if (Math.acos(clamp(dot, -1, 1)) > def.spread * 4 + 0.03) return; // spread too wide -> reject
    }

    if (s.w === 'golden') {
      this.npcs.noise(o[0], o[2]);
      const rw = (typeof m.ct === 'number' && Number.isFinite(m.ct)) ? clamp(m.ct, t - MAX_REWIND, t) : t;
      return this.gold.shoot(p, s, o, d0, m, rw);
    }
    if (s.w === 'rocket') {
      const sp = def.projectileSpeed;
      const rk = { id: this.nextRocketId++, owner: p.id, x: o[0], y: o[1], z: o[2], vx: d0[0] * sp, vy: d0[1] * sp, vz: d0[2] * sp, born: t };
      this.rockets.push(rk);
      this.broadcast({ type: 'rocket', id: rk.id, owner: p.id, o: o.map(r3), v: [rk.vx, rk.vy, rk.vz].map(r3) });
      this.sendInventory(p);
      return;
    }

    // hitscan with lag compensation
    const rewind = (typeof m.ct === 'number' && Number.isFinite(m.ct)) ? clamp(m.ct, t - MAX_REWIND, t) : t;
    const targets = [];
    for (const q of this.players.values()) {
      if (q.id === p.id || !q.alive || !q.connected) continue;
      if (MODES[this.mode].teams && q.team === p.team) continue;
      const hpos = this.headAt(q, rewind); if (!hpos) continue;
      targets.push({ q, hpos });
    }
    const npcTargets = this.npcs.targets(rewind);
    const npcDmg = new Map();
    this.npcs.noise(o[0], o[2]);
    const dmgMap = new Map();
    const ends = [];
    for (const d of dirs) {
      const wd = this.world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], def.range);
      let best = Math.min(wd, def.range), bestT = null, head = false;
      for (const tg of targets) {
        const { x, y, z } = tg.hpos;
        const th = raySphere(o[0], o[1], o[2], d[0], d[1], d[2], x, y, z, HEAD_RADIUS + 0.03);
        if (th < best) { best = th; bestT = tg; head = true; }
        const tb = rayCapsule(o[0], o[1], o[2], d[0], d[1], d[2], x, y - BODY_BOTTOM, y - BODY_TOP, z, BODY_RADIUS);
        if (tb < best) { best = tb; bestT = tg; head = false; }
      }
      let bestN = null, npcHead = false;
      for (const tg of npcTargets) {
        const h = rayNpc(o, d, tg);
        if (h.t < best) { best = h.t; bestN = tg.npc; npcHead = h.head; bestT = null; }
      }
      ends.push([r3(o[0] + d[0] * best), r3(o[1] + d[1] * best), r3(o[2] + d[2] * best)]);
      if (bestN) {
        const dmg = def.damage * falloff(def, best) * (npcHead ? def.headMult : 1);
        const cur = npcDmg.get(bestN) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head = cur.head || npcHead; npcDmg.set(bestN, cur);
      }
      if (bestT) {
        const dmg = def.damage * falloff(def, best) * (head ? def.headMult : 1);
        const cur = dmgMap.get(bestT.q) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head = cur.head || head;
        dmgMap.set(bestT.q, cur);
      }
    }
    this.broadcast({ type: 'shot', id: p.id, w: s.w, o: o.map(r3), e: ends }, p.id);
    for (const [q, info] of dmgMap) this.damage(q, p, Math.round(info.dmg), s.w, info.head, o);
    for (const [n, info] of npcDmg) this.npcs.damage(n, p, Math.round(info.dmg), info.head, s.w);
    this.sendInventory(p);
  }

  damage(q, attacker, amount, w, head, from) {
    if (!q.alive || amount <= 0) return;
    if (q.protectUntil > now()) return;
    if ((q.jail && q.jail.state === 'cut') || q.holding) return;
    // attacking innocent people in public makes you wanted (Free For All only; team matches are a war)
    if (this.crimes && attacker && attacker !== q && attacker.role !== 'cop' && !attacker.jail && !MODES[this.mode].teams && !q.wanted && !attacker.wanted && attacker.pose && this.npcs.witnessed(attacker.pose.h[0], attacker.pose.h[2])) this.npcs.addWanted(attacker, 1, 'attacking a player');
    amount = soakArmor(this, q, amount);              // body armor bought at a store
    q.hp = Math.max(0, q.hp - amount);
    this.broadcast({ type: 'dmg', id: q.id, by: attacker ? attacker.id : null, amt: amount, hp: q.hp, head: !!head,
                     from: from ? from.map(r3) : null, w: publicWeapon(w) });
    if (q.hp <= 0) this.kill(q, attacker, w, head);
  }

  kill(victim, killer, w, head, silent = false) {
    if (!victim.alive) return;
    this.vehicles.playerGone(victim);
    victim.alive = false; victim.hp = 0;
    if (victim.armor) { victim.armor = 0; this.sendTo(victim, { type: 'armor', ap: 0 }); }
    victim.boost = null;
    victim.respawnAt = now() + (silent ? 0.5 : RESPAWN_TIME);
    victim.reloadingUntil = 0;
    if (!silent) { victim.deaths++; this.saves.stat(victim, 'deaths'); }
    if (!silent && killer && killer !== victim && victim.wanted) {
      const mult = w === 'arrest' ? 2 : 1; // arresting pays double
      killer.cash = (killer.cash || 0) + victim.wanted * 100 * mult; // bounty for taking down a wanted player
    } else if (!silent && killer && killer !== victim && killer.role === 'cop' && victim.role !== 'cop') {
      killer.cash = Math.max(0, (killer.cash || 0) - 100); // cops are fined for taking out innocent people
      this.sendTo(killer, { type: 'penalty', amt: 100, reason: 'shot an innocent' });
    }
    if (this.crimes && !silent && killer && killer !== victim && killer.role !== 'cop' && !killer.jail && !MODES[this.mode].teams && !victim.wanted && victim.role !== 'cop' && killer.pose && this.npcs.witnessed(killer.pose.h[0], killer.pose.h[2])) this.npcs.addWanted(killer, 1, 'murder');
    if (victim.wanted) this.npcs.clearWanted(victim);
    // the killer grabs some of the cash you carry (money in the CITY BANK is safe)
    if (!silent && killer && killer !== victim && w !== 'arrest' && (victim.cash || 0) > 0) {
      const took = Math.min(BANK.deathLossMax, Math.floor(victim.cash * BANK.deathLoss));
      if (took > 0) {
        victim.cash -= took; killer.cash = (killer.cash || 0) + took;
        this.sendTo(victim, { type: 'cashLost', amt: took, by: killer.id, why: 'ko' });
        this.sendTo(killer, { type: 'cashGot', amt: took, from: victim.id });
      }
    }
    if (!silent && killer && killer !== victim) {
      killer.kills++; this.saves.stat(killer, 'kills');
      if (head) { killer.headshots++; this.saves.stat(killer, 'headshots'); }
      if (MODES[this.mode].teams && killer.team >= 0) this.teamScores[killer.team]++;
    }
    const km = { type: 'kill', killer: killer ? killer.id : null, victim: victim.id, w: w || null, head: !!head,
                 respawnIn: silent ? 0.5 : RESPAWN_TIME, silent, scores: this.scores() };
    if (w === 'golden' && killer) { this.broadcast({ ...km, w: publicWeapon(w) }, killer.id); this.sendTo(killer, km); } // secret weapon
    else this.broadcast(km);
    if (!silent) this.checkWin();
  }

  onArrest(p, id) {
    const q = this.players.get(id);
    if (!q || q === p || p.role !== 'cop' || !p.alive || !q.alive || !q.wanted || !p.pose || !q.pose) return;
    if (Math.hypot(p.pose.h[0] - q.pose.h[0], p.pose.h[1] - q.pose.h[1], p.pose.h[2] - q.pose.h[2]) > 2.8) return;
    if (q.jail || q.holding) return;
    this.prison.arrest(q, p, null);
  }

  // move a player somewhere (server decides): bumps life so stale client states are ignored
  teleport(p, pos, yaw = 0) {
    p.life++;
    p.pose = { h: [pos[0], pos[1] + 1.45, pos[2], 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], l: [pos[0], pos[1] + 1, pos[2], 0, 0, 0, 1], r: [pos[0], pos[1] + 1, pos[2], 0, 0, 0, 1] };
    p.hist = []; p.lastStateAt = now();
    this.sendTo(p, { type: 'tp', p: pos, yaw, life: p.life });
  }

  scores() {
    return { p: [...this.players.values()].map(q => [q.id, q.kills, q.deaths, q.cash || 0]), t: this.teamScores };
  }

  explode(rk, x, y, z, direct) {
    const def = WEAPONS.rocket;
    const owner = this.players.get(rk.owner);
    this.broadcast({ type: 'explode', id: rk.id, p: [r3(x), r3(y), r3(z)], owner: rk.owner });
    this.npcs.splash(x, y, z, owner || null, def);
    if (this.crimes && owner && owner.role !== 'cop' && !owner.jail && now() > (owner.boomAt || 0) && this.npcs.witnessed(x, z, 30)) { owner.boomAt = now() + 15; this.npcs.addWanted(owner, 1, 'destruction'); }
    for (const q of this.players.values()) {
      if (!q.alive || !q.pose || !q.connected) continue;
      if (MODES[this.mode].teams && owner && q.team === owner.team && q !== owner) continue;
      const cx = q.pose.h[0], cy = q.pose.h[1] - 0.5, cz = q.pose.h[2];
      const dist = Math.hypot(cx - x, cy - y, cz - z);
      let dmg = 0;
      if (direct === q) dmg = def.damage;
      else if (dist < def.splashRadius) {
        // line of sight from explosion to target
        const dx = (cx - x) / (dist || 1), dy = (cy - y) / (dist || 1), dz = (cz - z) / (dist || 1);
        const wd = this.world.raycast(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, dx, dy, dz, dist);
        if (wd < dist - 0.4) continue;
        dmg = def.splashDamage * (1 - dist / def.splashRadius * 0.7);
      }
      if (q === owner) dmg *= def.selfDamageMult;
      if (dmg > 0) this.damage(q, owner || null, Math.round(dmg), 'rocket', false, [x, y, z]);
    }
  }

  // ------------------------------------------------------------------ spawning & match
  pickSpawn(p) {
    if (p.role === 'cop' && MAP.copSpawns && MAP.copSpawns.length) {
      const c = MAP.copSpawns[Math.floor(Math.random() * MAP.copSpawns.length)];
      return { p: c, team: -1 };
    }
    const teams = MODES[this.mode].teams;
    let cands = MAP.spawns.filter(s => !teams || s.team === -1 || s.team === p.team);
    const enemies = [...this.players.values()].filter(q => q !== p && q.alive && q.pose && (!teams || q.team !== p.team));
    const scored = cands.map(s => {
      let md = 999;
      for (const e of enemies) md = Math.min(md, Math.hypot(e.pose.h[0] - s.p[0], e.pose.h[2] - s.p[2]));
      return { s, md: md + Math.random() * 25 };
    }).sort((a, b) => b.md - a.md);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
    return top[Math.floor(Math.random() * top.length)].s;
  }

  spawn(p) {
    this.vehicles.playerGone(p);
    if (p.jail && p.jail.state === 'in') {
      // prisoners wake up back in their cell, still without weapons
      const b = this.prison.bedSpawn(p);
      p.alive = true; p.hp = MAX_HEALTH; p.life++; p.slots = []; p.cur = 0; p.protectUntil = now() + SPAWN_PROTECT;
      p.pose = { h: [b.p[0], b.p[1] + 1.45, b.p[2], 0, 0, 0, 1], l: [b.p[0], b.p[1] + 1, b.p[2], 0, 0, 0, 1], r: [b.p[0], b.p[1] + 1, b.p[2], 0, 0, 0, 1] };
      p.hist = []; p.lastStateAt = now(); p.spawnPoint = { p: b.p, yaw: b.yaw };
      this.broadcast({ type: 'respawn', id: p.id, p: b.p, yaw: b.yaw, life: p.life, hp: p.hp });
      this.sendInventory(p);
      return;
    }
    const s = this.pickSpawn(p);
    p.alive = true; p.hp = MAX_HEALTH; p.life++;
    p.slots = []; p.cur = 0; p.reloadingUntil = 0;
    this.giveWeapon(p, DEFAULT_WEAPON);
    this.gold.respawned(p);
    p.protectUntil = now() + SPAWN_PROTECT;
    const yaw = Math.atan2(-s.p[0], -s.p[2]); // face toward city center
    p.spawnPoint = { p: s.p, yaw };
    p.pose = { h: [s.p[0], s.p[1] + 1.45, s.p[2], 0, 0, 0, 1], l: [s.p[0], s.p[1] + 1, s.p[2], 0, 0, 0, 1], r: [s.p[0], s.p[1] + 1, s.p[2], 0, 0, 0, 1] };
    p.hist = [];
    p.lastStateAt = now();
    this.broadcast({ type: 'respawn', id: p.id, p: s.p, yaw, life: p.life, hp: p.hp });
    this.sendInventory(p);
  }

  checkWin() {
    if (this.match.state !== 'playing') return;
    let winner = null;
    if (MODES[this.mode].teams) {
      if (this.teamScores[0] >= this.killLimit) winner = { team: 0 };
      else if (this.teamScores[1] >= this.killLimit) winner = { team: 1 };
    } else {
      for (const q of this.players.values()) if (q.kills >= this.killLimit) winner = { id: q.id, name: q.name };
    }
    if (winner) this.endMatch(winner);
  }

  endMatch(winner) {
    if (!winner) {
      if (MODES[this.mode].teams) {
        const [a, b] = this.teamScores;
        winner = a === b ? { draw: true } : { team: a > b ? 0 : 1 };
      } else {
        const best = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
        winner = best ? { id: best.id, name: best.name } : { draw: true };
      }
    }
    this.match.state = 'ended'; this.match.winner = winner; this.match.resetAt = now() + 12;
    for (const q of this.players.values()) {
      if (!q.connected) continue;
      this.saves.stat(q, 'matches');
      if ((winner.id && winner.id === q.id) || (winner.team !== undefined && winner.team === q.team)) this.saves.stat(q, 'wins');
      this.saves.save(q, true);
    }
    this.broadcast({ type: 'match', ...this.matchInfo(), scores: this.scores() });
  }

  resetMatch() {
    this.teamScores = [0, 0];
    for (const q of this.players.values()) { q.kills = 0; q.deaths = 0; q.headshots = 0; q.wanted = 0; q.robs = 0; }   // cash is your saved wallet: it carries over
    this.npcs.reset();
    this.prison.reset();
    for (const q of this.players.values()) { q.inCar = 0; q.ride = null; q.jail = null; q.holding = null; q.savedInv = null; }
    this.vehicles.reset();
    this.pickups.forEach(k => { k.avail = true; k.respawnAt = 0; });
    this.rockets = [];
    this.match = { state: 'playing', endsAt: now() + this.timeLimit, winner: null, resetAt: 0 };
    for (const q of this.players.values()) this.spawn(q);
    this.broadcast({ type: 'match', ...this.matchInfo(), scores: this.scores(), pickups: this.pickups.map(k => [k.id, 1]) });
  }

  // ------------------------------------------------------------------ simulation tick (30 Hz)
  tick(dt) {
    const t = now();
    this.finishReloads(t);
    this.gold.tick();
    this.saves.tick(dt);
    this.bank.tick(dt);
    this.jobTick = (this.jobTick || 0) + dt; if (this.jobTick > 0.25) { this.jobTick = 0; this.jobs.tick(); }
    this.npcAcc += dt;
    if (this.npcAcc >= 0.1) { const d = Math.min(0.25, this.npcAcc); this.npcs.tick(d); this.vehicles.tick(d); this.prison.tick(d); this.npcAcc = 0; }
    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rk = this.rockets[i];
      const sp = Math.hypot(rk.vx, rk.vy, rk.vz);
      const dx = rk.vx / sp, dy = rk.vy / sp, dz = rk.vz / sp;
      const step = sp * dt;
      const wd = this.world.raycast(rk.x, rk.y, rk.z, dx, dy, dz, step);
      let direct = null, hitT = wd;
      for (const q of this.players.values()) {
        if (!q.alive || !q.pose || q.id === rk.owner) continue;
        const [hx, hy, hz] = q.pose.h;
        const tb = rayCapsule(rk.x, rk.y, rk.z, dx, dy, dz, hx, hy - BODY_BOTTOM, hy, hz, BODY_RADIUS + 0.1);
        if (tb < hitT && tb <= step) { hitT = tb; direct = q; }
      }
      if (hitT <= step || t - rk.born > 6) {
        const tt = Math.min(hitT, step);
        this.rockets.splice(i, 1);
        this.explode(rk, rk.x + dx * (tt - 0.1), rk.y + dy * (tt - 0.1), rk.z + dz * (tt - 0.1), direct);
        continue;
      }
      rk.x += rk.vx * dt; rk.y += rk.vy * dt; rk.z += rk.vz * dt;
    }
    // respawns + fall out of world
    for (const p of this.players.values()) {
      if (!p.alive && t >= p.respawnAt && p.connected && this.match.state === 'playing') this.spawn(p);
      if (p.alive && p.pose && p.pose.h[1] < -15) this.kill(p, null, 'fall', false);
    }
    // pickups
    for (const k of this.pickups) if (!k.avail && t >= k.respawnAt) {
      k.avail = true; this.broadcast({ type: 'pickup', id: k.id, avail: 1 });
    }
    // match flow
    if (this.match.state === 'playing' && t >= this.match.endsAt) this.endMatch(null);
    else if (this.match.state === 'ended' && t >= this.match.resetAt) this.resetMatch();
    // drop players whose reconnect grace expired
    for (const p of [...this.players.values()]) {
      if (!p.connected && t - p.disconnectedAt > RECONNECT_GRACE) this.removePlayer(p.id);
    }
  }

  snapshot() {
    const arr = [];
    for (const p of this.players.values()) {
      if (!p.pose || !p.connected) continue;
      const s = p.slots[p.cur];
      arr.push([p.id, p.alive ? 1 : 0, ...p.pose.h.map(r3), ...p.pose.l.map(r3), ...p.pose.r.map(r3),
                s ? WEAPON_IDS.indexOf(s.w) : -1, p.reloadingUntil > now() ? 1 : 0, p.vr ? 1 : 0]);
    }
    this.broadcast({ type: 'snap', st: r3(now()), p: arr, m: Math.round(Math.max(0, this.match.endsAt - now())) });
    if (this.snapCount++ % 2 === 0) {
      this.broadcast({ type: 'npcs', st: r3(now()), n: this.npcs.snapshot(), c: this.vehicles.snapshot() });
      if (this.prison.active) this.broadcast({ type: 'pBall', st: r3(now()), ...this.prison.ballState() });
    }
  }
}
