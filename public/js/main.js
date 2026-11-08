// CITY CHAOS - main game bootstrap + loop.
import * as THREE from 'three';
import { buildMap } from '/shared/map.js';
import { CollisionWorld } from '/shared/collision.js';
import { WEAPONS } from '/shared/weapons.js';
import { MODES, MAX_HEALTH } from '/shared/constants.js';
import { createEngine } from './engine/renderer.js';
import { buildCity } from './engine/city.js';
import { Effects } from './engine/effects.js';
import { Network } from './net/network.js';
import { Voice } from './net/voice.js';
import { RemotePlayers } from './player/remotePlayers.js';
import { Avatar } from './player/avatar.js';
import { NPCs, NPC_TYPE, NPC_NAMES } from './player/npcs.js';
import { Cars, Driving, DRIVER } from './vehicles/cars.js';
import { Pickups } from './weapons/pickups.js';
import { WeaponSystem } from './weapons/weaponSystem.js';
import { Walker, VRMover } from './physics/movement.js';
import { VRInput } from './vr/vrInput.js';
import { VRUI } from './vr/vrUI.js';
import { DesktopInput } from './ui/desktopInput.js';
import { HUD, toast, esc } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { settings, profile, saveProfile, setSetting } from './ui/settings.js';
import * as audio from './audio/audio.js';

const $ = (id) => document.getElementById(id);
const loadStep = (pct, txt) => { $('loadfill').style.width = pct + '%'; if (txt) $('loadtext').textContent = txt; };

// ------------------------------------------------------------------ world
loadStep(10, 'Building the city...');
const map = buildMap();
const world = new CollisionWorld(map.boxes);
const canvas = $('game');
const engine = createEngine(canvas);
const { renderer, scene, camera, rig } = engine;
loadStep(40, 'Painting buildings...');
const city = buildCity(scene, map);
const effects = new Effects(scene);
const pickups = new Pickups(scene, map);
const sky = scene.getObjectByName('sky');
loadStep(70, 'Loading weapons...');

if (!profile.name) { profile.name = 'Player' + Math.floor(1000 + Math.random() * 9000); saveProfile(); }

const net = new Network();
net.hello = () => ({ name: profile.name, cos: profile.cos, role: profile.role });
const myRole = () => (G.room && G.players.get(G.room.you)?.role) || profile.role || 'civilian';
const isCop = () => myRole() === 'cop';
const remote = new RemotePlayers(scene, effects);
const npcs = new NPCs(scene, effects);
const cars = new Cars(scene);
const driving = new Driving(world, cars);
const wIcon = (w) => w === 'car' ? '🚗' : w === 'cop' ? '👮' : w === 'arrest' ? '🚔' : (WEAPONS[w] && WEAPONS[w].icon) || '💥';
const weapons = new WeaponSystem({ scene, camera, effects, net, world, remote });
weapons.npcs = npcs;
const vrInput = new VRInput(renderer, rig);
const vrui = new VRUI({ scene, camera, input: vrInput });
const hud = new HUD();
const desk = new DesktopInput(canvas);
const voice = new Voice(net);
const walker = new Walker(world, map.ladders);
const vrMover = new VRMover(world, map.ladders);

// VR weapon holder lives on the right controller's pointing pose
const vrHolder = new THREE.Group();
weapons.vrHolder = vrHolder;
// local VR hands (mittens)
let localAvatar = new Avatar(profile.cos, { isLocal: true });
const handL = localAvatar.lh, handR = localAvatar.rh;
scene.add(handL); handL.visible = false;
vrHolder.add(handR); handR.visible = false;

function rebuildLocalHands() {
  localAvatar.setCosmetics(profile.cos);
}

// ------------------------------------------------------------------ state
const G = {
  room: null,            // { code, you, mode, isPublic, hostId, killLimit, timeLimit, teamScores }
  players: new Map(),    // id -> public info (+kills/deaths)
  me: { hp: MAX_HEALTH, alive: false, life: 0, team: -1, wanted: 0 },
  rob: null, robSentAt: 0,
  view: 'menu',          // menu | lobby | playing | paused | vr
  death: null, matchEnd: null, matchResetAt: 0, remaining: 0,
  yaw: 0, pitch: 0, lastSend: 0, showBoard: false,
  fps: 0, frames: 0, fpsT: 0, mic: false, vrSupported: false
};

// ------------------------------------------------------------------ menu wiring
const menu = new Menu({
  onPlay: () => { if (!net.connected) return toast('Still connecting to the server...'); net.send({ type: 'quick', name: profile.name, cos: profile.cos, role: profile.role }); toast('Finding a match...'); },
  onJoin: (code) => { if (!net.connected) return menu.joinError('Not connected to the server yet.'); net.send({ type: 'join', code, name: profile.name, cos: profile.cos, role: profile.role }); },
  onCreate: (o) => { if (!net.connected) return toast('Still connecting to the server...'); net.send({ type: 'create', ...o, name: profile.name, cos: profile.cos, role: profile.role }); },
  onCopy: copyInvite,
  onVR: enterVR,
  onDesktop: playDesktop,
  onLeave: leaveRoom,
  onMic: toggleMic,
  onTeam: () => net.send({ type: 'switchTeam' }),
  onRole: (r) => { if (G.room && r !== myRole()) { net.send({ type: 'setRole', role: r }); toast(r === 'cop' ? '👮 You are now a Cop' : '🧑 You are now a Civilian'); } },
  onMode: (m) => { if (G.room) net.send({ type: 'settings', mode: m, killLimit: MODES[m].killLimit, timeLimit: G.room.timeLimit }); },
  onResume: resumeDesktop,
  onPauseGo: (screen) => { $('pause').classList.add('hidden'); G.view = 'lobby'; hud.show(false); menu.show(true); menu.history = ['lobby']; menu.go(screen); },
  onProfile: () => { rebuildLocalHands(); if (G.room) net.send({ type: 'cosmetics', cos: profile.cos, name: profile.name }); }
});

function copyInvite() {
  if (!G.room) return;
  const link = `${location.origin}/?room=${G.room.code}`;
  const msg = `Join my CITY CHAOS game! Open ${link} and enter code ${G.room.code}`;
  const done = () => { $('copy-msg').textContent = 'Invite copied! Paste it to your friends.'; toast('Invite link copied!'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(msg).then(done, () => fallbackCopy(msg, done));
  else fallbackCopy(msg, done);
}
function fallbackCopy(s, done) {
  const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch { prompt('Copy this invite:', s); }
  ta.remove();
}

// ------------------------------------------------------------------ views
function setView(v) {
  G.view = v;
  const inGame = v === 'playing' || v === 'paused';
  hud.show(inGame);
  menu.show(v === 'menu' || v === 'lobby');
  $('pause').classList.toggle('hidden', v !== 'paused');
  desk.enabled = v === 'playing';
  if (v === 'menu' || v === 'lobby') { audio.stopAmbience(); audio.startMusic(); }
  else { audio.stopMusic(); audio.startAmbience(); }
}
function playDesktop() {
  if (!G.room) return;
  audio.unlock();
  setView('playing');
  desk.lock();
}
function resumeDesktop() { setView('playing'); desk.lock(); }
desk.onUnlock = () => { if (G.view === 'playing') setView('paused'); };
$('clicktoplay').addEventListener('click', () => desk.lock());

async function enterVR() {
  audio.unlock();
  if (!navigator.xr) return toast('WebXR not available in this browser.');
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    renderer.xr.setSession(session);
  } catch (e) { console.error(e); toast('Could not start VR: ' + (e.message || e)); }
}
renderer.xr.addEventListener('sessionstart', () => {
  G.view = 'vr';
  menu.show(false); hud.show(false); $('pause').classList.add('hidden');
  desk.enabled = false; desk.unlock();
  weapons.setVR(true); vrui.setVisible(true);
  handL.visible = true; handR.visible = true;
  audio.stopMusic(); audio.startAmbience();
  // keep standing where the desktop body was
  pendingVRTeleport = { p: walker.feet.clone(), yaw: G.yaw };
  G.vrRefHeight = 0; // re-measure the player's real height each session
  vrMover.reset();
  engine.applyQuality();
});
renderer.xr.addEventListener('sessionend', () => {
  weapons.setVR(false); vrui.setVisible(false);
  handL.visible = false; handR.visible = false;
  // put the desktop body where the VR head was
  const head = new THREE.Vector3(); camera.getWorldPosition(head);
  rig.rotation.set(0, 0, 0);
  walker.feet.set(head.x, rig.position.y, head.z); walker.vel.set(0, 0, 0);
  camera.position.set(0, walker.height - 0.05, 0); camera.quaternion.identity();
  setView(G.room ? 'lobby' : 'menu'); if (G.room) menu.go('lobby');
  engine.applyQuality();
});
let pendingVRTeleport = null;

function toggleMic() {
  audio.unlock();
  voice.setMic(!voice.enabled).then(() => { G.mic = voice.enabled; menu.setMic(G.mic); toast(G.mic ? 'Mic on: nearby players can hear you' : 'Mic off'); })
    .catch(() => { G.mic = false; menu.setMic(false); toast('Microphone permission was denied.'); });
}

function leaveRoom() {
  net.send({ type: 'leave' });
  cleanupRoom();
}
function cleanupRoom() {
  if (driving.active) driving.exit();
  G.room = null; G.players.clear(); remote.clear(); npcs.clear(); cars.clear(); voice.closeAll(); G.me.wanted = 0; G.rob = null;
  G.death = null; G.matchEnd = null; G.me.alive = false;
  if (renderer.xr.isPresenting) renderer.xr.getSession().end();
  desk.unlock();
  history.replaceState(null, '', '/');
  setView('menu'); menu.go('main');
}

// ------------------------------------------------------------------ helpers
function nameOf(id) { if (id == null) return null; const p = G.players.get(id); return p ? p.name : '???'; }
function boardModel() {
  const rows = [...G.players.values()].map(p => ({ name: p.name, color: p.cos.color, kills: p.kills || 0, deaths: p.deaths || 0, team: p.team, me: p.id === G.room.you, connected: p.connected, host: p.id === G.room.hostId, vr: p.vr, cash: p.cash || 0, wanted: p.wanted || 0 }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return { players: rows, teams: MODES[G.room.mode].teams, teamScores: G.room.teamScores, killLimit: G.room.killLimit, mode: G.room.mode };
}
function lobbyModel() {
  return { ...G.room, isHost: G.room.hostId === G.room.you, players: [...G.players.values()].map(p => ({ ...p, host: p.id === G.room.hostId })) };
}
function refreshLobby() { if (G.room) menu.renderLobby(lobbyModel()); }
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function headWorld(out = new THREE.Vector3()) { return camera.getWorldPosition(out); }

function teleport(p, yaw) {
  if (renderer.xr.isPresenting) {
    // rotate the rig so the HEAD faces yaw, and move it so the head is over p
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    rig.rotation.set(0, yaw - e.y, 0);
    const local = new THREE.Vector3(camera.position.x, 0, camera.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y);
    // Gorilla: eyes ~0.85m above the ground (your hands then hold you there). Small/Human: feet on the ground.
    const yOff = isGorillaBody() ? 0.85 - Math.max(0.5, camera.position.y) : -vrFloorOffset();
    rig.position.set(p.x - local.x, p.y + yOff, p.z - local.z);
    vrMover.reset();
  } else {
    walker.feet.set(p.x, p.y, p.z); walker.vel.set(0, 0, 0);
    G.yaw = yaw; G.pitch = 0;
  }
}

// ------------------------------------------------------------------ network events
net.on('open', () => { menu.setStatus('🟢 Online'); });
net.on('close', () => { menu.setStatus('🔴 Reconnecting...'); if (G.room) { toast('Connection lost. Reconnecting...', 4000); hud.notice('📶 Reconnecting...', 3000); vrui.setNotice('Reconnecting...', 3); } });
net.on('roomLost', () => { if (G.room) { cleanupRoom(); toast('You were disconnected from the room.', 4000); } });
net.on('error', (m) => { menu.joinError(m.message); toast(m.message); });
net.on('left', () => {});

net.on('joined', (m) => {
  const reconnect = m.reconnected && G.room && G.room.code === m.code;
  G.room = { code: m.code, you: m.you, mode: m.mode, isPublic: m.isPublic, hostId: m.hostId, killLimit: m.killLimit, timeLimit: m.timeLimit, teamScores: m.teamScores };
  G.players.clear(); remote.clear(); remote.myId = m.you;
  for (const p of m.players) { G.players.set(p.id, p); remote.upsert(p); }
  const me = G.players.get(m.you);
  G.me.team = me.team; G.me.hp = me.hp; G.me.alive = me.alive; G.me.life = m.life;
  pickups.setAll(m.pickups);
  npcs.clear(); if (m.npcs) npcs.sync(m.npcs, m.st);
  cars.clear(); if (m.cars) cars.sync(m.cars, m.st);
  if (!m.inCar && driving.active) driving.exit();
  if (m.inCar && !driving.active) { const c = m.cars.find(k => k[0] === m.inCar); if (c) driving.enter(c); }
  G.me.wanted = me.wanted || 0;
  if (me.role && me.role !== profile.role) menu.setRole(me.role);
  weapons.setInventory(m.inv);
  G.remaining = m.match.remaining;
  G.matchEnd = m.match.state === 'ended' ? winnerText(m.match.winner) : null;
  if (!reconnect && m.spawn) teleport(new THREE.Vector3(...m.spawn.p), m.spawn.yaw);
  voice.setRoom(m.you, m.players.filter(p => p.connected).map(p => p.id));
  if (G.mic) voice.setMic(true).catch(() => {});
  history.replaceState(null, '', `/?room=${m.code}`);
  if (reconnect) { toast('Reconnected!'); vrui.setNotice('Reconnected!', 1.5); }
  else if (G.view !== 'vr') { setView('lobby'); menu.go('lobby'); }
  refreshLobby();
});
net.on('playerJoined', (m) => {
  G.players.set(m.p.id, m.p); remote.upsert(m.p); voice.addPeer(m.p.id);
  refreshLobby(); hud.feed(`👋 ${esc(m.p.name)} joined`); vrui.addFeed(`${m.p.name} joined`);
});
net.on('playerLeft', (m) => {
  const p = G.players.get(m.id);
  if (p) { hud.feed(`🚪 ${esc(p.name)} left`); vrui.addFeed(`${p.name} left`); }
  G.players.delete(m.id); remote.remove(m.id); voice.removePeer(m.id);
  if (G.room) G.room.hostId = m.hostId;
  refreshLobby();
});
net.on('playerUpdate', (m) => {
  const old = G.players.get(m.p.id);
  G.players.set(m.p.id, { ...old, ...m.p });
  if (m.p.id === G.room?.you) { G.me.team = m.p.team; if (m.p.role && m.p.role !== profile.role) menu.setRole(m.p.role); }
  remote.upsert(m.p);
  if (old && old.connected && !m.p.connected) voice.removePeer(m.p.id);
  if (old && !old.connected && m.p.connected) voice.addPeer(m.p.id);
  refreshLobby();
});
net.on('roomSettings', (m) => {
  Object.assign(G.room, { mode: m.mode, killLimit: m.killLimit, timeLimit: m.timeLimit });
  for (const p of m.players) { G.players.set(p.id, p); remote.upsert(p); if (p.id === G.room.you) G.me.team = p.team; }
  const t = `NEW MATCH: ${MODES[m.mode].name.toUpperCase()}`;
  hud.notice(t, 2500); vrui.setNotice(t, 2.5); toast(t);
  refreshLobby();
});
net.on('snap', (m) => { remote.onSnapshot(m.st, m.p); G.remaining = m.m; });
net.on('shot', (m) => {
  remote.onShot(m.id, m.w);
  const o = new THREE.Vector3(...m.o);
  const from = remote.muzzleOf(m.id, new THREE.Vector3()) || o;
  const d = WEAPONS[m.w];
  for (const e of m.e) {
    const end = new THREE.Vector3(...e);
    effects.tracer(from, end, d.color, m.w === 'sniper' ? 0.04 : 0.022);
    effects.impact(end, null, false);
  }
  effects.muzzle(from, new THREE.Vector3(...m.e[0]).sub(o).normalize(), m.w === 'shotgun' ? 2 : 1.3);
  audio.playShot(m.w, o);
  // bullet whizz if it passed near me
  const me = headWorld(new THREE.Vector3());
  const end = new THREE.Vector3(...m.e[0]);
  const line = new THREE.Line3(o, end), cp = new THREE.Vector3(); line.closestPointToPoint(me, true, cp);
  if (cp.distanceTo(me) < 2 && cp.distanceTo(me) > 0.3) audio.playWhizz(cp);
});
net.on('reloading', (m) => remote.onReload(m.id, m.w));
net.on('dmg', (m) => {
  const p = G.players.get(m.id); if (p) p.hp = m.hp;
  if (m.id === G.room.you) {
    G.me.hp = m.hp;
    audio.playHurt();
    vrui.damage(); vrInput.pulse('left', 0.7, 80); vrInput.pulse('right', 0.7, 80);
    let ang = null;
    if (m.from) {
      const me = headWorld(new THREE.Vector3());
      const dx = m.from[0] - me.x, dz = m.from[2] - me.z;
      const camYaw = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      ang = Math.atan2(dx, -dz) + camYaw;
    }
    hud.damage(ang);
  }
  if (m.by === G.room.you && m.id !== G.room.you) { hud.hit(m.head); audio.playHit(m.head); vrInput.pulse('right', m.head ? 0.8 : 0.4, 40); }
});
net.on('hp', (m) => { if (m.id === G.room.you) G.me.hp = m.hp; const p = G.players.get(m.id); if (p) p.hp = m.hp; });
net.on('kill', (m) => {
  for (const [id, k, d, c] of m.scores.p) { const p = G.players.get(id); if (p) { p.kills = k; p.deaths = d; p.cash = c || 0; } }
  G.room.teamScores = m.scores.t;
  const killer = nameOf(m.killer), victim = nameOf(m.victim);
  const vp = m.victim === G.room.you ? headWorld(new THREE.Vector3()) : (remote.headOf(m.victim) ? new THREE.Vector3(...remote.headOf(m.victim)) : null);
  const vinfo = G.players.get(m.victim);
  if (vp && vinfo && !m.silent) { if (m.victim !== G.room.you) effects.pop(vp, vinfo.cos.color, vinfo.cos.accent); audio.playDeath(m.victim === G.room.you ? null : vp); }
  if (!m.silent) {
    const icon = m.w === 'fall' ? '💀' : m.w ? wIcon(m.w) : '💀';
    const txt = m.w === 'arrest' ? `🚔 ${killer} ARRESTED ${victim}` : m.w === 'cop' ? `👮 Police took down ${victim}` : m.killer && m.killer !== m.victim ? `${killer} ${icon}${m.head ? ' 🎯' : ''} ${victim}` : `${victim} ${icon} wiped out`;
    hud.feed(esc(txt), m.killer === G.room.you || m.victim === G.room.you); vrui.addFeed(txt);
  }
  if (m.victim === G.room.you) {
    G.me.alive = false; G.me.hp = 0;
    G.death = { by: m.w === 'arrest' ? `${killer} 🚔 (ARRESTED)` : m.w === 'cop' ? 'the Police 👮' : m.killer && m.killer !== m.victim ? killer : null, t: m.respawnIn };
  }
  if (m.killer === G.room.you && m.victim !== G.room.you) {
    const t = m.w === 'arrest' ? `🚔 ARRESTED ${victim}!` : m.head ? `🎯 HEADSHOT! ${victim}` : `💥 ELIMINATED ${victim}`;
    hud.notice(t); vrui.setNotice(t); audio.playKill(); vrInput.pulse('right', 1, 120);
  }
});
net.on('respawn', (m) => {
  const p = G.players.get(m.id); if (p) { p.alive = true; p.hp = m.hp; }
  if (m.id !== G.room?.you) return;
  if (driving.active) driving.exit();
  G.me.alive = true; G.me.hp = m.hp; G.me.life = m.life; G.death = null;
  teleport(new THREE.Vector3(...m.p), m.yaw);
  audio.playSpawn();
});
net.on('inv', (m) => weapons.setInventory(m));
// ------------------------------------------------------------------ NPCs, robbery, wanted
net.on('npcs', (m) => { npcs.sync(m.n, m.st); cars.sync(m.c, m.st); });
// ------------------------------------------------------------------ cars
net.on('carEnter', (m) => {
  if (m.pid !== G.room?.you) return;
  driving.enter(m.car); G.lastCarYaw = undefined; G.camYaw = 0;
  const t = renderer.xr.isPresenting ? 'Right trigger: gas · Left trigger: brake · B: get out' : 'W/S drive · A/D steer · E to get out';
  hud.notice('🚗 ' + (m.hijacked ? 'CARJACKED!' : 'Driving'), 1500); vrui.setNotice(t, 3);
  if (!renderer.xr.isPresenting) toast(t, 4000);
});
net.on('carExit', (m) => {
  if (m.pid !== G.room?.you || !driving.active) return;
  const c = driving.car; driving.exit();
  const door = cars.doorWorld(c);
  door.y = c.y + 0.1;
  if (renderer.xr.isPresenting) teleport(door, c.yaw); else { walker.feet.copy(door); walker.vel.set(0, 0, 0); G.yaw = c.yaw; G.pitch = 0; }
});
net.on('honk', (m) => { const c = cars.get(m.id); if (c) audio.playHonk(new THREE.Vector3(c.x, c.y + 1, c.z)); });
net.on('carHit', (m) => {
  if (m.victim !== G.room?.you) return;
  const v = new THREE.Vector3(...m.v);
  if (renderer.xr.isPresenting) vrMover.gorilla.vel.add(v); else { walker.vel.add(v); walker.grounded = false; }
  audio.playCrash(12);
});
net.on('npcHit', (m) => { if (m.by === G.room?.you) { hud.hit(m.head); audio.playHit(m.head); vrInput.pulse('right', m.head ? 0.7 : 0.35, 35); } });
net.on('npcSpawn', (m) => npcs.respawn(m.id));
net.on('npcDie', (m) => {
  npcs.die(m.id);
  if (m.by != null) {
    const icon = m.w ? wIcon(m.w) : '💥';
    const txt = `${nameOf(m.by)} ${icon}${m.head ? ' 🎯' : ''} ${NPC_NAMES[m.kind]}`;
    hud.feed(esc(txt), m.by === G.room?.you); vrui.addFeed(txt);
  }
});
net.on('npcShot', (m) => {
  const o = new THREE.Vector3(...m.o), e = new THREE.Vector3(...m.e);
  effects.tracer(o, e, 0x9fd3ff, 0.022); effects.muzzle(o, e.clone().sub(o).normalize(), 1.2); effects.impact(e, null, false);
  audio.playShot('pistol', o);
  const me = headWorld(new THREE.Vector3());
  const line = new THREE.Line3(o, e), cp = new THREE.Vector3(); line.closestPointToPoint(me, true, cp);
  if (cp.distanceTo(me) < 2.5 && cp.distanceTo(me) > 0.3) audio.playWhizz(cp);
});
net.on('robStatus', (m) => {
  const t = performance.now() / 1000;
  if (m.cop) { G.rob = null; G.prompt = '👮 Cops protect stores, they don\'t rob them'; return; }
  if (m.copNear) { G.rob = { text: '👮 A COP IS WATCHING THIS STORE', p: 0, at: t }; return; }
  if (m.closed) G.rob = { text: `🔒 Store closed for ${m.closed}s`, p: 0, at: t };
  else G.rob = { text: `💰 ROBBING... HOLD YOUR AIM`, p: m.progress, at: t };
});
net.on('robbed', (m) => {
  const p = G.players.get(m.by); if (p) p.cash = m.total;
  const txt = `💰 ${nameOf(m.by)} robbed ${m.shop} ($${m.cash})`;
  hud.feed(esc(txt), m.by === G.room?.you); vrui.addFeed(txt);
  if (m.by === G.room?.you) {
    G.rob = null; audio.playCash();
    hud.notice(`+$${m.cash}  🚨 COPS ARE COMING!`, 2500); vrui.setNotice(`+$${m.cash}  COPS ARE COMING!`, 2.5);
    vrInput.pulse('left', 0.8, 120); vrInput.pulse('right', 0.8, 120);
  }
});
net.on('wanted', (m) => {
  const p = G.players.get(m.id); if (p) p.wanted = m.wanted;
  remote.setWanted(m.id, m.wanted);
  if (isCop() && m.id !== G.room?.you && m.wanted > 0 && p) { const t = `🚨 ${p.name} is WANTED ${'★'.repeat(m.wanted)}`; hud.feed(esc(t), true); vrui.addFeed(t); }
  if (m.id !== G.room?.you) return;
  const before = G.me.wanted; G.me.wanted = m.wanted;
  if (m.wanted > before) { const t = `${'★'.repeat(m.wanted)} WANTED!`; hud.notice(t, 1800); vrui.setNotice(t, 1.8); }
  else if (m.wanted === 0 && before > 0 && m.reason === 'lost') { hud.notice('😎 You lost the cops!', 2000); vrui.setNotice('You lost the cops!', 2); }
});
// police / roles
net.on('robAlert', (m) => {
  const t = `🚨 ${nameOf(m.by)} is robbing ${m.shop}!`;
  hud.notice(t, 2500); vrui.setNotice(t, 2.5); hud.feed(esc(t), true); vrui.addFeed(t);
  audio.playSiren(null); vrInput.pulse('left', 0.6, 100);
});
net.on('penalty', (m) => { const t = `👮 -$${m.amt}: ${m.reason}`; hud.notice(t, 1800); vrui.setNotice(t, 1.8); const p = G.players.get(G.room?.you); if (p) p.cash = Math.max(0, (p.cash || 0) - m.amt); });
net.on('dispatch', (m) => { if (m.target === G.room?.you) { hud.notice('🚓 A POLICE CAR IS ON THE WAY!', 2000); vrui.setNotice('POLICE CAR ON THE WAY!', 2); } });
net.on('copsOut', (m) => { const c = cars.get(m.id); if (c) audio.playDoor(); });
net.on('siren', (m) => { const c = cars.get(m.id); if (c) { c.siren = m.on; c.sirenT = 0; } });
net.on('pickup', (m) => {
  pickups.setAvail(m.id, m.avail);
  if (!m.avail && m.by === G.room?.you) {
    audio.playPickup(m.kind); vrInput.pulse('right', 0.5, 50); vrInput.pulse('left', 0.5, 50);
    const t = m.kind === 'weapon' ? `+ ${WEAPONS[m.w].name}` : m.kind === 'ammo' ? '+ AMMO' : '+ HEALTH';
    hud.notice(t, 1000); vrui.setNotice(t, 1);
  }
});
net.on('rocket', (m) => { effects.spawnRocket(m.id, m.o, m.v); if (m.owner !== G.room?.you) audio.playShot('rocket', new THREE.Vector3(...m.o)); });
net.on('explode', (m) => {
  effects.removeRocket(m.id);
  const p = new THREE.Vector3(...m.p);
  effects.explosion(p); audio.playExplosion(p);
  // knockback (rocket jumps!)
  const me = headWorld(new THREE.Vector3()); me.y -= 0.5;
  const d = me.distanceTo(p);
  if (d < 6 && G.me.alive) {
    const imp = me.clone().sub(p).normalize().multiplyScalar((1 - d / 6) * 11); imp.y += (1 - d / 6) * 4;
    if (renderer.xr.isPresenting) vrMover.gorilla.vel.add(imp); else { walker.vel.add(imp); walker.grounded = false; }
    vrInput.pulse('left', 1, 150); vrInput.pulse('right', 1, 150);
  }
});
net.on('match', (m) => {
  if (m.scores) for (const [id, k, d, c] of m.scores.p) { const p = G.players.get(id); if (p) { p.kills = k; p.deaths = d; p.cash = c || 0; p.wanted = 0; } }
  if (m.scores) G.me.wanted = 0;
  if (m.scores) G.room.teamScores = m.scores.t;
  if (m.pickups) pickups.setAll(m.pickups);
  if (m.state === 'ended') { G.matchEnd = winnerText(m.winner); G.matchResetAt = performance.now() / 1000 + m.resetIn; audio.playWin(); }
  else { G.matchEnd = null; G.remaining = m.remaining; hud.notice('NEW MATCH!', 2000); vrui.setNotice('NEW MATCH!'); }
});
function winnerText(w) {
  if (!w) return null;
  if (w.draw) return "IT'S A DRAW!";
  if (w.team !== undefined) return `${w.team === 0 ? 'RED' : 'BLUE'} TEAM WINS!`;
  return w.id === G.room?.you ? 'YOU WIN! 🏆' : `${w.name} WINS!`;
}

// ------------------------------------------------------------------ frame loop
// One bad frame must never freeze the game: catch it, report it to the server window, keep going.
let lastErrAt = 0;
function safeFrame() {
  try { frame(); }
  catch (e) {
    console.error(e);
    const t = performance.now();
    if (t - lastErrAt > 5000) { lastErrAt = t; net.send({ type: 'clientError', msg: String(e && e.message || e).slice(0, 300), stack: String(e && e.stack || '').slice(0, 600) }); }
    try { desk.endFrame(); renderer.render(scene, camera); } catch {}
  }
}
window.addEventListener('error', (e) => net.send({ type: 'clientError', msg: String(e.message).slice(0, 300), stack: String(e.error && e.error.stack || '').slice(0, 600) }));

const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let snapReady = true, attractT = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = performance.now() / 1000;
  const xr = renderer.xr.isPresenting;
  if (!Number.isFinite(G.yaw)) G.yaw = 0;
  if (!Number.isFinite(G.pitch)) G.pitch = 0;
  G.frames++; if (t - G.fpsT > 1) { G.fps = G.frames; G.frames = 0; G.fpsT = t; }
  if (window.__frameHook) window.__frameHook(dt); // used by automated tests only
  rig.updateMatrixWorld(true);
  if (xr) renderer.xr.updateCamera(camera);

  const inRoom = !!G.room;
  const canAct = inRoom && G.me.alive && !G.matchEnd;
  let moving = false;

  if (xr) {
    if (pendingVRTeleport) { teleport(pendingVRTeleport.p, pendingVRTeleport.yaw); pendingVRTeleport = null; rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera); }
    const s = vrInput.update();
    const L = s.left, R = s.right;
    if (!isGorillaBody()) trackRealHeight(); // Gorilla body has no feet, so no height offset to calibrate
    const head = headWorld(new THREE.Vector3());
    // menu
    if (L.pressed.b) { if (vrui.menuOpen) vrui.closeMenu(); else if (inRoom) vrui.openMenu(menuModel()); }
    vrui.boardHeld = !!L.held.stick;
    // turning
    const turn = R.stick.x;
    if (!vrui.menuOpen && settings.turnMode !== 'off' && !driving.active) {
      let ang = 0;
      if (settings.turnMode === 'snap') { if (Math.abs(turn) > 0.7 && snapReady) { ang = -Math.sign(turn) * THREE.MathUtils.degToRad(settings.snapAngle); snapReady = false; } if (Math.abs(turn) < 0.3) snapReady = true; }
      else ang = -turn * 2.4 * dt;
      if (ang) {
        rig.position.sub(head).applyAxisAngle(UP, ang).add(head);
        rig.rotation.y += ang;
        rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera);
        vrMover.gorilla.hands.forEach(h => h.init = false);
      }
    }
    // movement
    const lc = vrInput.get('left'), rc = vrInput.get('right');
    const hands = [lc ? lc.grip.getWorldPosition(new THREE.Vector3()) : head.clone().add(new THREE.Vector3(-0.2, -0.6, 0)),
                   rc ? rc.grip.getWorldPosition(new THREE.Vector3()) : head.clone().add(new THREE.Vector3(0.2, -0.6, 0))];
    if (driving.active && inRoom && G.me.alive) {
      // ---- VR driving: right trigger gas, left trigger brake/reverse, left stick steers
      const thr = (R.trigger > 0.08 ? R.trigger : 0) - (L.trigger > 0.08 ? L.trigger : 0);
      driving.update(dt, { throttle: thr, steer: L.stick.x, brake: false });
      const car = driving.car;
      if (G.lastCarYaw === undefined) {
        // face the car's forward direction when you sit down
        const hy = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
        G.lastCarYaw = hy;
      }
      const dyaw = Math.atan2(Math.sin(car.yaw - G.lastCarYaw), Math.cos(car.yaw - G.lastCarYaw)); G.lastCarYaw = car.yaw;
      if (dyaw) { const h = headWorld(new THREE.Vector3()); rig.position.sub(h).applyAxisAngle(UP, dyaw).add(h); rig.rotation.y += dyaw; rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera); }
      const seat = cars.seatWorld(car); const h2 = headWorld(new THREE.Vector3());
      rig.position.add(seat.sub(h2));
      vrMover.reset();
      G.vrSpeed = Math.abs(car.speed);
    } else if (inRoom && G.me.alive) {
      const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const stick = new THREE.Vector3().addScaledVector(right, L.stick.x).addScaledVector(fwd, -L.stick.y);
      const before = rig.position.clone();
      const ev = vrMover.update(dt, rig, head, hands, { mode: settings.moveMode, stick: settings.moveMode === 'gorilla' ? null : stick, jump: L.pressed.a, armBoost: settings.armBoost, floorOffset: vrFloorOffset(), gt: isGorillaBody() });
      for (const tp of ev.taps) { audio.playTap(tp.pos, tp.speed); vrInput.pulse(tp.i === 0 ? 'left' : 'right', Math.min(1, 0.15 + tp.speed * 0.1), 25); }
      if (ev.step) audio.playStep(null, 0.7);
      if (ev.landed > 5) audio.playStep(null, 1.4);
      clampRig();
      // safety net: if you ever end up under the map, go back to the last spot you stood safely
      { const h2 = headWorld(new THREE.Vector3());
        if (h2.y < -6.5) { rig.position.copy(G.vrSafe || rig.position); vrMover.reset(); }
        else if (vrMover.gorilla.anyTouching || vrMover.grounded) { (G.vrSafe ||= new THREE.Vector3()).copy(rig.position); } }
      const sp = rig.position.distanceTo(before) / Math.max(dt, 1e-3);
      G.vrSpeed = (G.vrSpeed || 0) * 0.85 + sp * 0.15;
      moving = sp > 0.5;
    }
    rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera);
    // hands visuals: left mitten sticks to surfaces it touches
    if (lc) { const vis = vrMover.gorilla.handVisual(0); handL.position.copy(vis || lc.grip.getWorldPosition(tmpV)); handL.quaternion.copy(lc.grip.getWorldQuaternion(tmpQ)); }
    if (rc && vrHolder.parent !== rc.ray) { rc.ray.add(vrHolder); vrui.attach(lc ? lc.grip : rig, rc.ray, vrHolder); }
    if (lc && vrui.wrist.mesh.parent !== lc.grip) vrui.attach(lc.grip, rc ? rc.ray : rig, vrHolder);
    // menu pointer
    if (vrui.menuOpen) {
      const act = vrui.updatePointer(R.pressed.trigger);
      if (act) menuAction(act);
    } else if (canAct && driving.active) {
      if (R.pressed.b) net.send({ type: 'exitCar' });
      if (R.pressed.a) audio.playHonk(null);
      const pc = cars.get(driving.car.id);
      if (pc && pc.police && L.pressed.a) net.send({ type: 'siren', on: !pc.siren });
      G.prompt = `${pc && pc.police ? '🚓' : '🚗'} ${Math.round(Math.abs(driving.car.speed) * 3.6)} km/h · B: get out · A: honk${pc && pc.police ? ' · X: siren' : ''}`;
    } else if (canAct) {
      // weapons
      weapons.tryFire(R.trigger > 0.6, R.pressed.trigger);
      if (R.pressed.a) weapons.reload();
      if (R.pressed.b) weapons.cycle(1);
      let prompt = null; G.arrestPrompt = false;
      // arrest: cops grab a wanted player with either hand
      if (isCop()) for (const [side, ctl, st] of [['left', lc, L], ['right', rc, R]]) {
        if (!ctl || prompt) continue; // arresting beats grabbing pickups
        const hp = ctl.grip.getWorldPosition(new THREE.Vector3());
        const q = arrestTarget(hp, 1.0, true);
        if (!q) continue;
        prompt = `🚔 Grip ${q.info.name} to ARREST them`; G.arrestPrompt = true;
        if ((st.pressed.grip || st.held.grip) && t - (G.arrestAt || 0) > 0.8) { G.arrestAt = t; net.send({ type: 'arrest', id: q.info.id }); vrInput.pulse(side, 0.9, 120); }
      }
      // grab pickups: squeeze grip near one (works whether you squeeze before or after reaching)
      for (const [side, ctl, st] of [['left', lc, L], ['right', rc, R]]) {
        if (!ctl || G.arrestPrompt) continue;
        const hp = ctl.grip.getWorldPosition(new THREE.Vector3());
        const it = pickups.nearest(hp, 0.8);
        if (!it) continue;
        it.highlight = 1;
        const auto = it.def.kind !== 'weapon' && hp.distanceTo(it.g.position) < 0.45; // touch ammo/health to collect
        prompt = it.def.kind === 'weapon' ? `Grip to grab ${pickups.label(it)}` : `Touch or grip: ${pickups.label(it)}`;
        if ((st.held.grip || st.grip > 0.5 || auto) && t - (it.reqAt || 0) > 0.6) { it.reqAt = t; net.send({ type: 'pickup', id: it.def.id }); vrInput.pulse(side, 0.3, 30); }
      }
      // walking/rolling over ammo or health also collects it
      const body = pickups.nearest(new THREE.Vector3(head.x, rig.position.y + 0.7, head.z), 1.1);
      if (body && body.def.kind !== 'weapon' && t - (body.reqAt || 0) > 0.6) { body.reqAt = t; net.send({ type: 'pickup', id: body.def.id }); }
      // hijack: grab a car with either hand
      const pickupPrompt = !!prompt;
      for (const [side, ctl, st] of [['left', lc, L], ['right', rc, R]]) {
        if (!ctl || pickupPrompt) continue; // a pickup in reach takes priority; otherwise EITHER hand can grab the car
        const hp = ctl.grip.getWorldPosition(new THREE.Vector3());
        const car = cars.nearest(hp, 2.9);
        if (!car || car.driverKind === DRIVER.PLAYER || hp.y > car.y + 2.2) continue;
        prompt = carPrompt(car, 'Grip');
        if ((st.pressed.grip || st.held.grip) && t - (G.hijackAt || 0) > 0.8) { G.hijackAt = t; net.send({ type: 'hijack', id: car.id }); vrInput.pulse(side, 0.6, 60); }
      }
      G.prompt = prompt;
    } else G.prompt = null;
  } else {
    // ---------------------------------------------------------------- desktop
    if (G.view === 'playing') {
      G.yaw -= desk.mouse.dx * 0.0022 * settings.mouseSens;
      G.pitch = THREE.MathUtils.clamp(G.pitch - desk.mouse.dy * 0.0022 * settings.mouseSens, -1.5, 1.5);
      if (!Number.isFinite(G.yaw)) G.yaw = 0;
      if (!Number.isFinite(G.pitch)) G.pitch = 0;
      G.showBoard = desk.down('Tab');
      if (desk.hit('Escape')) desk.unlock();
    } else G.showBoard = false;
    if (inRoom && driving.active) {
      // ---- desktop driving with a chase camera
      const playing = G.view === 'playing' && G.me.alive;
      const k = (c) => playing && desk.down(c);
      driving.update(dt, { throttle: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0), steer: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0), brake: k('Space') });
      if (playing && desk.hit('KeyH')) audio.playHonk(null);
      if (playing && desk.hit('KeyE')) net.send({ type: 'exitCar' });
      const c = driving.car, pc = cars.get(c.id), police = pc && pc.police;
      if (playing && police && desk.hit('KeyL')) net.send({ type: 'siren', on: !pc.siren });
      if (playing) G.camYaw = (G.camYaw || 0) - desk.mouse.dx * 0.0025 * settings.mouseSens;
      if (!desk.mouse.dx) G.camYaw = (G.camYaw || 0) * Math.max(0, 1 - dt * 1.2);
      const yaw = c.yaw + G.camYaw;
      // keep the camera from going inside buildings
      const bx = Math.sin(yaw), bz = Math.cos(yaw), dir = new THREE.Vector3(bx, 0.35, bz).normalize();
      const hitD = world.raycast(c.x, c.y + 1.8, c.z, dir.x, dir.y, dir.z, 8);
      const dist = Math.min(8, (Number.isFinite(hitD) ? hitD : 8) - 0.4);
      rig.position.set(c.x + dir.x * dist, c.y + 1.8 + dir.y * dist, c.z + dir.z * dist);
      rig.rotation.set(0, yaw, 0); camera.position.set(0, 0, 0); camera.rotation.set(-0.2, 0, 0);
      walker.feet.set(c.x, c.y, c.z); walker.vel.set(0, 0, 0);
      G.prompt = playing ? `${police ? '🚓' : '🚗'} ${Math.round(Math.abs(c.speed) * 3.6)} km/h · E: get out · H: honk${police ? ' · L: siren' : ''}` : null;
    } else if (inRoom) {
      const playing = G.view === 'playing' && G.me.alive;
      const k = (c) => playing && desk.down(c);
      const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
      const wish = new THREE.Vector3((k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), 0, (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0));
      if (wish.lengthSq() > 1) wish.normalize();
      // rotate local wish into world (yaw)
      const w = new THREE.Vector3(wish.x * Math.cos(G.yaw) + wish.z * Math.sin(G.yaw), 0, -wish.x * Math.sin(G.yaw) + wish.z * Math.cos(G.yaw));
      const ev = walker.update(dt, { wish: w, sprint: k('ShiftLeft') || k('ShiftRight'), jump: playing && desk.hit('Space'), jumpHeld: k('Space'), climb: k('KeyW') ? 1 : k('KeyS') ? -1 : (k('Space') ? 1 : 0) });
      if (ev.step) audio.playStep(null, 0.8);
      if (ev.landed) audio.playStep(null, Math.min(1.6, ev.landed / 6));
      moving = wish.lengthSq() > 0.01 && walker.grounded;
      clampWalker();
      if (walker.feet.y < -6.5) { walker.feet.copy(G.deskSafe || walker.feet.set(0, 1, 0)); walker.vel.set(0, 0, 0); }
      else if (walker.grounded) (G.deskSafe ||= new THREE.Vector3()).copy(walker.feet);
      rig.position.copy(walker.feet); rig.rotation.set(0, G.yaw, 0);
      camera.position.set(0, walker.height - 0.05, 0);
      camera.rotation.set(G.pitch, 0, 0);
      if (playing && !G.matchEnd) {
        weapons.tryFire(desk.mouse.left, desk.mouse.leftPressed);
        if (desk.hit('KeyR')) weapons.reload();
        if (desk.hit('Digit1')) weapons.switchTo(0);
        if (desk.hit('Digit2')) weapons.switchTo(1);
        if (desk.hit('Digit3')) weapons.switchTo(2);
        if (desk.hit('KeyQ')) weapons.cycle(-1);
        if (desk.mouse.wheel) weapons.cycle(desk.mouse.wheel > 0 ? 1 : -1);
        const eye = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
        const it = pickups.aimed(eye, dir, 3);
        G.prompt = it ? `Press E to pick up ${pickups.label(it)}` : null;
        const perp = !it && isCop() ? arrestTarget(walker.feet.clone().setY(walker.feet.y + walker.height - 0.1), 2.4, false) : null;
        if (perp) { G.prompt = `🚔 Press E to ARREST ${perp.info.name}`; if (desk.hit('KeyE')) net.send({ type: 'arrest', id: perp.info.id }); }
        else if (it) { it.highlight = 1; if (desk.hit('KeyE')) net.send({ type: 'pickup', id: it.def.id }); }
        else {
          const car = cars.nearest(walker.feet.clone().setY(walker.feet.y + 0.5), 3.9);
          if (car && car.driverKind !== DRIVER.PLAYER) {
            G.prompt = carPrompt(car, 'Press E');
            if (desk.hit('KeyE')) net.send({ type: 'hijack', id: car.id });
          }
        }
      } else G.prompt = null;
      if (G.view === 'lobby') { G.yaw += dt * 0.08; }
    } else {
      // attract mode: slow fly-over of the city behind the menu
      attractT += dt * 0.05;
      rig.position.set(Math.cos(attractT) * 95, 45, Math.sin(attractT) * 95);
      rig.rotation.set(0, Math.atan2(rig.position.x, rig.position.z), 0);
      camera.position.set(0, 0, 0); camera.rotation.set(-0.38, 0, 0);
    }
  }
  rig.updateMatrixWorld(true);
  if (xr) renderer.xr.updateCamera(camera);

  if (weapons.model) weapons.model.visible = !driving.active;
  weapons.update(dt, moving);
  if (G.death) G.death.t -= dt;
  updateRobbery(t, canAct && !driving.active && !(xr && vrui.menuOpen) && (xr || G.view === 'playing'));

  // send my pose 20x per second
  if (inRoom && t - G.lastSend > 1 / 20) { G.lastSend = t; sendState(xr); }

  remote.update(dt, net.serverNow());
  for (const [id, p] of remote.players) if (p.head) voice.setPosition(id, p.head[0], p.head[1], p.head[2]);
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  pickups.update(dt, t, camPos);
  npcs.cull = xr ? 34 : 50;
  npcs.update(dt, net.serverNow(), camPos);
  cars.update(dt, net.serverNow(), camPos, driving.car, xr);
  effects.update(dt);
  sky.position.copy(camPos);
  engine.followSun(camPos);
  const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
  audio.setListener(camPos, new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), new THREE.Vector3(0, 1, 0).applyQuaternion(camQ));

  if (inRoom) {
    const ws = weapons.current;
    const st = {
      dt, hp: G.me.hp, weapon: ws, slots: weapons.slots, cur: weapons.cur, reloading: weapons.reloading, reloadP: weapons.reloadProgress(),
      timer: G.matchEnd ? fmt((G.matchResetAt - t)) : fmt(G.remaining), teams: MODES[G.room.mode].teams, teamScores: G.room.teamScores,
      kills: G.players.get(G.room.you)?.kills || 0, deaths: G.players.get(G.room.you)?.deaths || 0,
      prompt: G.prompt, death: G.death, driving: driving.active, cash: G.players.get(G.room.you)?.cash || 0, wanted: G.me.wanted,
      rob: G.rob && t - G.rob.at < 0.9 ? G.rob : null, showBoard: G.showBoard || !!G.matchEnd, board: boardModel(),
      matchEnd: G.matchEnd, matchResetIn: G.matchResetAt - t, showFps: settings.showFps, fps: G.fps, ping: Math.round(net.rtt * 1000),
      vignette: settings.vignette ? THREE.MathUtils.clamp(((G.vrSpeed || 0) - 1.5) / 5, 0, 0.85) : 0,
      teamText: MODES[G.room.mode].teams ? `RED ${G.room.teamScores[0]} : ${G.room.teamScores[1]} BLUE` : null
    };
    if (xr) vrui.update(dt, st); else if (G.view === 'playing' || G.view === 'paused') hud.update(st);
  }
  desk.endFrame();
  renderer.render(scene, camera);
}

// Robbery: aim any gun at a shopkeeper from close range and hold it. The server checks
// distance + line of sight and decides when the register is emptied.
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
// a wanted player close enough to arrest (cops only). hand = VR hand position (tight range to their body)
function arrestTarget(p, range, hand) {
  let best = null, bd = range;
  for (const q of remote.players.values()) {
    if (!q.alive || !q.head || !q.info.wanted || !q.info.connected) continue;
    const [hx, hy, hz] = q.head;
    const d = hand ? Math.min(Math.hypot(p.x - hx, p.y - hy, p.z - hz), Math.hypot(p.x - hx, p.y - (hy - 0.55), p.z - hz))
                   : (Math.abs(p.y - hy) < 1.6 ? Math.hypot(p.x - hx, p.z - hz) : 99);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function carPrompt(car, verb) {
  if (car.police) return isCop() ? `🚓 ${verb} to drive the police car` : `🚓 ${verb} to steal the police car (+2★)`;
  if (car.driverKind === DRIVER.NPC) return isCop() ? `🚗 ${verb} to commandeer the car` : `🚗 ${verb} to hijack the car`;
  return `🚗 ${verb} to get in`;
}
function updateRobbery(t, active) {
  if (!active || !weapons.current || isCop()) return;
  weapons.aim(_ro, _rd);
  const hit = npcs.ray(_ro, _rd, 6.5, NPC_TYPE.SHOP);
  if (!hit) return;
  if (world.raycast(_ro.x, _ro.y, _ro.z, _rd.x, _rd.y, _rd.z, hit.t) < hit.t - 0.3) return; // wall/roof in the way
  const n = hit.npc;
  if (!G.rob || t - G.rob.at > 0.9) {
    const shop = map.shops.reduce((a, s) => Math.hypot(s.keeper[0] - n.x, s.keeper[2] - n.z) < Math.hypot(a.keeper[0] - n.x, a.keeper[2] - n.z) ? s : a, map.shops[0]);
    G.prompt = n.closed ? `🔒 ${shop.name} was just robbed` : `🔫 Keep aiming to rob ${shop.name}`;
  }
  if (!n.closed && t - G.robSentAt > 0.3) { G.robSentAt = t; net.send({ type: 'rob', id: n.id }); }
}

// Gorilla size: you're ~0.55m shorter than real life (like Gorilla Tag), so a small bend reaches the ground
// Body size is matched to the REAL player's height: we track how tall they stand (running max of
// head height) and lower them so their eyes end up at a fixed height. Gorilla = Gorilla Tag size.
const VR_EYE = { gorilla: 0.9, small: 1.25 };
// Gorilla = true Gorilla Tag physics: no feet, your HANDS hold you up (eyes ~0.8-0.95m off the ground)
function isGorillaBody() { return !settings.vrSize || settings.vrSize === 'gorilla'; }
function vrFloorOffset() {
  if (settings.vrSize === 'human' || isGorillaBody()) return 0;
  const target = VR_EYE[settings.vrSize] || VR_EYE.gorilla;
  return Math.max(0, (G.vrRefHeight || 1.6) - target);
}
function trackRealHeight() {
  const h = camera.position.y; // head height above the real floor (local-floor space)
  if (h > 0.9 && h < 2.3 && h > (G.vrRefHeight || 0)) {
    const before = vrFloorOffset();
    G.vrRefHeight = G.vrRefHeight ? G.vrRefHeight + Math.min(0.02, h - G.vrRefHeight) : h; // grow smoothly
    rig.position.y -= vrFloorOffset() - before; // keep your feet where they were
  }
}

function clampWalker() {
  const H = map.worldHalf - 0.6;
  walker.feet.x = THREE.MathUtils.clamp(walker.feet.x, -H, H); walker.feet.z = THREE.MathUtils.clamp(walker.feet.z, -H, H);
  if (walker.feet.y > 60) walker.feet.y = 60;
}
function clampRig() {
  const head = headWorld(new THREE.Vector3()), H = map.worldHalf - 0.5;
  if (head.x < -H) rig.position.x += -H - head.x; if (head.x > H) rig.position.x -= head.x - H;
  if (head.z < -H) rig.position.z += -H - head.z; if (head.z > H) rig.position.z -= head.z - H;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const pose = (p, q) => [r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)];
function sendState(xr) {
  const hp = camera.getWorldPosition(new THREE.Vector3()), hq = camera.getWorldQuaternion(new THREE.Quaternion());
  let l, r;
  if (xr) {
    const lc = vrInput.get('left'), rc = vrInput.get('right');
    l = lc ? pose(handL.getWorldPosition(new THREE.Vector3()), handL.getWorldQuaternion(new THREE.Quaternion())) : pose(hp.clone().add(new THREE.Vector3(-0.25, -0.5, 0)), hq);
    r = rc ? pose(rc.ray.getWorldPosition(new THREE.Vector3()), rc.ray.getWorldQuaternion(new THREE.Quaternion())) : pose(hp.clone().add(new THREE.Vector3(0.25, -0.5, 0)), hq);
  } else {
    const yq = new THREE.Quaternion().setFromAxisAngle(UP, G.yaw);
    const lp = new THREE.Vector3(-0.28, -0.55, -0.15).applyQuaternion(yq).add(hp);
    l = pose(lp, yq);
    // right hand = where the gun is, pointing where I look
    const rp = new THREE.Vector3(0.22, -0.3, -0.42).applyQuaternion(hq).add(hp);
    r = pose(rp, hq);
  }
  if (driving.active) {
    // you're in the driver seat: report the car, and put your head + hands at the wheel
    const c = driving.car, cq = new THREE.Quaternion().setFromAxisAngle(UP, c.yaw);
    const seat = cars.seatWorld(c);
    const hpose = xr ? pose(hp, hq) : pose(seat, cq);
    const wheel = (sx) => new THREE.Vector3(sx, -0.3, -0.45).applyQuaternion(cq).add(seat);
    net.send({ type: 'state', life: G.me.life, h: hpose, l: pose(wheel(-0.18), cq), r: pose(wheel(0.18), cq), vr: xr, car: driving.stateArr() });
    return;
  }
  net.send({ type: 'state', life: G.me.life, h: pose(hp, hq), l, r, vr: xr });
}

function menuModel() {
  return { settings, role: myRole(), mic: G.mic, code: G.room?.code || '', teams: G.room && MODES[G.room.mode].teams, isHost: G.room && G.room.hostId === G.room.you && !G.room.isPublic, mode: G.room?.mode };
}
function menuAction(act) {
  if (act === 'resume') vrui.closeMenu();
  else if (act === 'move') setSetting('moveMode', { gorilla: 'both', both: 'joystick', joystick: 'gorilla' }[settings.moveMode]);
  else if (act === 'turn') {
    const order = [['snap', 30], ['snap', 45], ['snap', 60], ['smooth', 45], ['off', 45]];
    const i = order.findIndex(([m, a]) => m === settings.turnMode && (m !== 'snap' || a === settings.snapAngle));
    const [m, a] = order[(i + 1) % order.length]; setSetting('turnMode', m); setSetting('snapAngle', a);
  }
  else if (act === 'vignette') setSetting('vignette', !settings.vignette);
  else if (act === 'size') {
    setSetting('vrSize', { gorilla: 'small', small: 'human', human: 'gorilla' }[settings.vrSize] || 'gorilla');
    // re-place yourself on the ground right below you with the new body
    const h = headWorld(new THREE.Vector3()); const d = world.raycast(h.x, h.y, h.z, 0, -1, 0, 30);
    const yaw = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    teleport(new THREE.Vector3(h.x, Number.isFinite(d) ? h.y - d : h.y - 1, h.z), yaw);
  }
  else if (act === 'calibrate') { const was = vrFloorOffset(); G.vrRefHeight = Math.max(0.9, camera.position.y); rig.position.y += was - vrFloorOffset(); vrMover.reset(); vrui.setNotice('Height calibrated!', 1.5); }
  else if (act === 'shadows') setSetting('shadows', !settings.shadows);
  else if (act === 'mic') toggleMic();
  else if (act === 'role') { const r = isCop() ? 'civilian' : 'cop'; menu.setRole(r); net.send({ type: 'setRole', role: r }); vrui.closeMenu(); vrui.setNotice(r === 'cop' ? 'You are now a COP' : 'You are now a CIVILIAN', 2); }
  else if (act === 'team') net.send({ type: 'switchTeam' });
  else if (act === 'mode') { const m = G.room.mode === 'ffa' ? 'tdm' : 'ffa'; net.send({ type: 'settings', mode: m, killLimit: MODES[m].killLimit, timeLimit: G.room.timeLimit }); }
  else if (act === 'leave') { vrui.closeMenu(); leaveRoom(); }
  if (vrui.menuOpen) vrui.model = menuModel();
}

weapons.onFire = (w) => { if (renderer.xr.isPresenting) vrInput.pulse('right', Math.min(1, WEAPONS[w].kick * 5 + 0.2), w === 'rocket' || w === 'shotgun' ? 90 : 35); };

// ------------------------------------------------------------------ start
async function start() {
  loadStep(85, 'Connecting...');
  if (navigator.xr) {
    try { G.vrSupported = await navigator.xr.isSessionSupported('immersive-vr'); } catch { G.vrSupported = false; }
  }
  menu.setVRSupport(G.vrSupported, !window.isSecureContext ? 'VR needs HTTPS. Open the https:// link.' : 'No VR headset detected: use PLAY ON DESKTOP (or open this page in the Meta Quest browser).');
  net.connect();
  net.startWatchdog();
  renderer.setAnimationLoop(safeFrame);
  loadStep(100, 'Ready!');
  setTimeout(() => { $('loading').classList.remove('show'); $('loading').classList.add('hidden'); }, 250);
  setView('menu'); menu.go('main');
  const params = new URLSearchParams(location.search);
  const code = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length === 6) { $('code-input').value = code; menu.go('join'); }
  // first tap anywhere unlocks audio (required by browsers / Quest)
  const unlock = () => { audio.unlock(); if (G.view === 'menu' || G.view === 'lobby') audio.startMusic(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: true });
  window.__npcMap = npcs.map; window.__cc = { cars, driving, menuAction: (a) => menuAction(a), G, desk, vrui, vrInput, net, walker, vrMover, weapons, remote, renderer, rig, camera, city, map, world, pickups, scene };
}
start();
