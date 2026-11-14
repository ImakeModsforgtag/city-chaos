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
import { Cars, Driving, DRIVER, showCar } from './vehicles/cars.js';
import { CAR_MODELS, carCode } from '/shared/garage.js';
import { textCanvas } from './engine/geo.js';
import { Pickups } from './weapons/pickups.js';
import { WeaponSystem } from './weapons/weaponSystem.js';
import { GoldenSniper, ESP_LAYER } from './weapons/golden.js';
import { Boosts } from './player/boosts.js';
import { BankView } from './world/bank.js';
import { Marker } from './world/marker.js';
import { Tutorial } from './ui/tutorial.js';
import { RaceView } from './world/race.js';
import { TurfView } from './world/turf.js';
import { GANGS } from '/shared/turf.js';
import { OUTFITS } from '/shared/wardrobe.js';
import { AptView } from './world/apartment.js';
import { SeasonView } from './world/season.js';
import { Phone, GPS_PLACES } from './ui/phone.js';
import { CityMap } from './ui/citymap.js';
import { PhotoCam, library as photoLib, downloadBlob } from './world/photocam.js';
import { DayNight } from './world/daynight.js';
import { Weather } from './world/weather.js';
import { fmtHour, isNight, weatherAt } from '/shared/daynight.js';
import { aptAt, aptItems } from '/shared/apartment.js';
import { EMOTES } from '/shared/emotes.js';
import { BOARDS } from '/shared/leaderboard.js';
import { serverBase } from './net/network.js';
import { BANK, JOBS } from '/shared/economy.js';
import { ShopMenu } from './ui/shopMenu.js';
import { peekToken, tokenPid, STAT_KEYS, STAT_NAMES, START_CASH, fmtTime } from '/shared/profile.js';
import { levelFromXp, levelProgress, lockCos, UNLOCKS, unlockLevel, MAX_LEVEL } from '/shared/levels.js';
import { HATS, GLASSES, BACKS, HEADS, BODIES } from '/shared/constants.js';
import { missionsFor, dayKey, fmtReset, secondsToReset, ALL_DONE_BONUS, weekKey, weekliesFor, secondsToWeekReset, WEEKLY_BONUS } from '/shared/missions.js';
import { Walker, VRMover } from './physics/movement.js';
import { VRInput } from './vr/vrInput.js';
import { VRUI } from './vr/vrUI.js';
import { DesktopInput } from './ui/desktopInput.js';
import { HUD, toast, esc } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { settings, profile, saveProfile, setSetting } from './ui/settings.js';
import { PrisonView } from './prison/prisonView.js';
import { PrisonClient } from './prison/prisonClient.js';
import { ArrestCutscene } from './prison/cutscene.js';
import { inPrisonArea, PRISON } from '/shared/prison.js';
import { WANTED_TEXT } from './ui/hud.js';
import * as audio from './audio/audio.js';

const $ = (id) => document.getElementById(id);
const loadStep = (pct, txt) => { $('loadfill').style.width = pct + '%'; if (txt) $('loadtext').textContent = txt; };

// ------------------------------------------------------------------ world
loadStep(10, 'Building the city...');
const map = buildMap();
const world = new CollisionWorld(map.boxes.concat(map.prison.boxes));   // city + prison (prison doors toggle .off)
const canvas = $('game');
const engine = createEngine(canvas);
const { renderer, scene, camera, rig } = engine;
loadStep(40, 'Painting buildings...');
const city = buildCity(scene, map);
const prisonView = new PrisonView(scene, map, city);
const effects = new Effects(scene);
const pickups = new Pickups(scene, map);
const sky = scene.getObjectByName('sky');
loadStep(70, 'Loading weapons...');

if (!profile.name) { profile.name = 'Player' + Math.floor(1000 + Math.random() * 9000); saveProfile(); }

const net = new Network();
net.hello = () => ({ name: profile.name, cos: myCos(), role: profile.role });
const myRole = () => (G.room && G.players.get(G.room.you)?.role) || profile.role || 'civilian';
const isCop = () => myRole() === 'cop';
const remote = new RemotePlayers(scene, effects);
const npcs = new NPCs(scene, effects);
const cars = new Cars(scene);
const driving = new Driving(world, cars);
const wIcon = (w) => w === 'car' ? '🚗' : w === 'cop' ? '👮' : w === 'robber' ? '🦹' : w === 'arrest' ? '🚔' : w === 'shock' ? '⚡' : (WEAPONS[w] && WEAPONS[w].icon) || '💥';
const weapons = new WeaponSystem({ scene, camera, effects, net, world, remote });
weapons.npcs = npcs;
// the secret Golden Sniper: scope ESP, lock-on headshots, bullet cam
const gold = new GoldenSniper({ scene, world, remote, npcs, effects, myRole: () => myRole(),
  isFriend: (info) => !!(G.room && MODES[G.room.mode].teams && info.team === G.me.team) });
weapons.golden = gold;
weapons.onGolden = (s) => startBulletCam(s);
const scopeEl = document.getElementById('scope'), bulletCamEl = document.getElementById('bulletcam');
// VR comfort blink (bullet cam start/end): a black sphere around your head that fades out
const blink = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
blink.renderOrder = 9999; blink.visible = false; camera.add(blink);
const vrInput = new VRInput(renderer, rig);
const vrui = new VRUI({ scene, camera, input: vrInput });
const hud = new HUD();
const desk = new DesktopInput(canvas);
const voice = new Voice(net);
const allLadders = map.ladders.concat(map.prison.ladders);
const walker = new Walker(world, allLadders);
const vrMover = new VRMover(world, allLadders);
// store boosts (energy drinks etc.) for walking and VR movement
const boosts = new Boosts({ walker, vrMover, toast: (t) => toast(t) });   // store speed / jump boosts
net.on('save', (m) => saveSet(m.token));
// ---------------------------------------------------------------- bug reports + automatic error reports
const GAME_VERSION = '2026.11.12';
function gameInfo() { return { fps: G.fps || 0, ua: navigator.userAgent, view: G.view, version: GAME_VERSION }; }
function sendBug(text) {
  if (!G.room) { toast('Join a game first, then report the bug from the pause menu'); return; }
  const ctx = [G.prompt && `prompt: ${G.prompt}`, G.job && `job: ${G.job.kind} ${G.job.phase}`, G.heist && 'carrying vault cash', driving.active && 'driving', prison.prisoner && 'in prison'].filter(Boolean).join(' · ');
  net.send({ type: 'bugReport', text: text + (ctx ? `  [${ctx}]` : ''), info: gameInfo() });
}
net.on('bugThanks', () => { toast('🐞 Thanks! Your bug report was sent'); const el = document.getElementById('bugmsg'); if (el) el.textContent = '✅ Sent, thank you!'; setTimeout(() => document.getElementById('bugbox')?.classList.add('hidden'), 1500); vrui.setNotice('Bug report sent, thanks!', 2); });
// JavaScript errors are reported automatically (max a few per session) so they show up in the server log
const errQueue = [];
function reportError(msg, src, line, stack) {
  if (errQueue.length + (G.errSent || 0) >= 8) return;
  const m = { type: 'clientError', msg: String(msg).slice(0, 400), src: String(src || '').slice(0, 160), line: line | 0, stack: String(stack || '').slice(0, 900), info: gameInfo() };
  if (G.room && net.connected) { net.send(m); G.errSent = (G.errSent || 0) + 1; } else errQueue.push(m);
}
window.addEventListener('error', (e) => reportError(e.message, e.filename, e.lineno, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => reportError('unhandled promise: ' + (e.reason && e.reason.message || e.reason), '', 0, e.reason && e.reason.stack));
setInterval(() => { while (errQueue.length && G.room && net.connected) { net.send(errQueue.shift()); G.errSent = (G.errSent || 0) + 1; } }, 3000);
// XP + levels
net.on('xp', (m) => {
  const was = myLevel();
  G.myXp = m.xp;
  const p = G.players.get(G.room?.you); if (p) { p.lvl = m.lvl; if (m.cash !== undefined) p.cash = m.cash; }
  hud.xpPop(`+${m.gain} XP${m.reason ? ' · ' + m.reason : ''}`);
  if (m.up) {
    const un = m.unlocks && m.unlocks.length ? `<small>🔓 Unlocked: ${m.unlocks.join(', ')}</small>` : '';
    hud.levelUp(`<div class="big">LEVEL ${m.lvl}!</div><small>+$${m.bonus} level-up bonus</small>${un}`);
    vrui.setNotice(`LEVEL ${m.lvl}! +$${m.bonus}${m.unlocks && m.unlocks.length ? ' · Unlocked ' + m.unlocks.join(', ') : ''}`, 3.5);
    audio.playWin(); vrInput.pulse('left', 0.8, 200); vrInput.pulse('right', 0.8, 200);
    if (was !== m.lvl) { localAvatar.setCosmetics(myCos()); rebuildLocalHands(); if (G.room) net.send({ type: 'cosmetics', cos: myCos(), name: profile.name }); }
  } else if (renderer.xr.isPresenting) vrui.setNotice(`+${m.gain} XP${m.reason ? ' · ' + m.reason : ''}`, 1.2);
});
// daily missions
// the VR menu page with today's missions
function missionsVrModel() {
  const ms = G.missions;
  const items = ms ? ms.list.map(q => ({ label: `${q.done ? '✔ ' : ''}${q.text}  ${q.done ? 'DONE' : q.prog + '/' + q.goal}`, act: 'missions:none', color: q.done ? '#1b8a4e' : '#3d3a6b' })) : [];
  if (ms) items.push({ label: ms.bonus ? '🏆 ALL DONE! BONUS COLLECTED' : `ALL 3 BONUS: +$${ms.bonusCash} · +${ms.bonusXp} XP`, act: 'missions:none', color: '#8338ec' });
  if (G.weekly) for (const q of G.weekly.list) items.push({ label: `⭐ ${q.done ? '✔ ' : ''}${q.text}  ${q.done ? 'DONE' : q.prog + '/' + q.goal}`, act: 'missions:none', color: q.done ? '#b8860b' : '#4a3f1d' });
  items.push({ label: '◀ BACK', act: 'missions:back', color: '#6c6f8a' });
  const left = ms ? Math.max(0, (ms.resetAt - performance.now()) / 1000) : 0;
  return { cols: 1, title: '📋 DAILY MISSIONS', sub: ms ? `NEW MISSIONS IN ${fmtReset(left).toUpperCase()}` : '', items };
}
function weeklyHtml(w) {
  if (!w) return '';
  const left = w.resetAt ? Math.max(0, (w.resetAt - performance.now()) / 1000) : w.resetIn;
  return `<h4 class="wk">⭐ WEEKLY CHALLENGES <small>· new in ${fmtReset(left)}</small></h4>` + w.list.map(m => `<div class="ms wk ${m.done ? 'done' : ''}"><div class="t"><span>${esc(m.text)}</span><b>${m.done ? '' : `${m.prog}/${m.goal}`}</b></div>`
    + `${m.done ? '' : `<div class="bar"><div style="width:${Math.round(100 * m.prog / m.goal)}%"></div></div>`}<small>+$${m.cash} · +${m.xp} XP</small></div>`).join('')
    + `<div class="ms"><small>${w.bonus ? '⭐ All 4 done! Weekly star collected' : `Finish all 4: +$${w.bonusCash} · +${w.bonusXp} XP · a ⭐ for your apartment`}</small></div>`;
}
net.on('weekly', (m) => {
  G.weekly = { ...m, resetAt: performance.now() + m.resetIn * 1000 };
  if (m.just) {
    for (const i of m.just) { const q = m.list[i]; hud.levelUp(`<div class="big">⭐ WEEKLY CHALLENGE!</div><small>${esc(q.text)}</small><small>+$${q.cash} · +${q.xp} XP</small>`, 3600); vrui.setNotice(`WEEKLY CHALLENGE! ${q.text} +$${q.cash}`, 3); }
    if (m.allDone) { hud.levelUp(`<div class="big">⭐ ALL WEEKLY CHALLENGES!</div><small>+$${m.bonusCash} · +${m.bonusXp} XP · a star for your apartment</small>`, 4500); setTimeout(() => vrui.setNotice(`ALL WEEKLY CHALLENGES! +$${m.bonusCash}`, 3.5), 3500); }
    audio.playChime(); vrInput.pulse('right', 0.6, 150);
    const p = G.players.get(G.room?.you); if (p && m.cash !== undefined) p.cash = m.cash;
  }
});
function missionsHtml(ms, title = true) {
  if (!ms) return '';
  const rows = ms.list.map(m => `<div class="ms ${m.done ? 'done' : ''}"><div class="t"><span>${esc(m.text)}</span><b>${m.done ? '' : `${m.prog}/${m.goal}`}</b></div>`
    + `${m.done ? '' : `<div class="bar"><div style="width:${Math.round(100 * m.prog / m.goal)}%"></div></div>`}<small>+$${m.cash} · +${m.xp} XP</small></div>`).join('');
  const left = ms.resetAt ? Math.max(0, (ms.resetAt - performance.now()) / 1000) : ms.resetIn;
  return (title ? `<h4>📋 DAILY MISSIONS <small>· new in ${fmtReset(left)}</small></h4>` : '') + rows
    + `<div class="ms"><small>${ms.bonus ? '🏆 All done! Bonus collected' : `Finish all 3: bonus +$${ms.bonusCash} · +${ms.bonusXp} XP`}</small></div>`;
}
net.on('missions', (m) => {
  const old = G.missions;
  G.missions = { ...m, resetAt: performance.now() + m.resetIn * 1000 };
  G.missionsShowUntil = performance.now() + (old ? 7000 : 10000);
  if (m.just) {
    for (const i of m.just) {
      const q = m.list[i];
      hud.levelUp(`<div class="big">MISSION COMPLETE!</div><small>${esc(q.text)}</small><small>+$${q.cash} · +${q.xp} XP</small>`, 3200);
      vrui.setNotice(`MISSION COMPLETE! ${q.text} +$${q.cash}`, 3);
    }
    if (m.allDone) { hud.levelUp(`<div class="big">ALL DAILY MISSIONS!</div><small>Bonus +$${m.bonusCash} · +${m.bonusXp} XP · new ones in ${fmtReset(m.resetIn)}</small>`, 4000); setTimeout(() => vrui.setNotice(`ALL 3 DAILY MISSIONS! +$${m.bonusCash}`, 3.5), 3000); }
    audio.playChime(); vrInput.pulse('right', 0.6, 150);
    const p = G.players.get(G.room?.you); if (p && m.cash !== undefined) p.cash = m.cash;
  } else if (old && m.fresh) toast('📋 New daily missions are here!');
  else if (old) {   // progress tick: a short VR note for the mission that moved
    const i = m.list.findIndex((q, k) => old.list[k] && q.prog !== old.list[k].prog && !q.done);
    if (i >= 0 && renderer.xr.isPresenting) vrui.setNotice(`📋 ${m.list[i].text}: ${m.list[i].prog}/${m.list[i].goal}`, 1.6);
  }
});
net.on('levelUp', (m) => {
  const p = G.players.get(m.id); if (p) p.lvl = m.lvl;
  if (m.id !== G.room?.you) { const t = `⭐ ${nameOf(m.id)} reached level ${m.lvl}`; hud.feed(esc(t)); vrui.addFeed(t); }
});
net.on('profile', (m) => {
  if (m.reset) toast('⚠️ Your saved progress couldn\'t be read, starting fresh');
  else if (!m.loaded) toast(`👋 Welcome to CITY CHAOS! Here's $${m.cash} to get you started`);
  else toast(`💾 Progress loaded: $${m.cash} · level ${m.lvl}${m.bank ? ` · 🏦 $${m.bank} saved` : ''}`);
  G.myXp = m.xp; G.bank = m.bank || 0;
  if (m.interest) setTimeout(() => toast(`🏦 Your savings earned $${m.interest} interest while you were away`), 2500);
  // brand new players (or players who never saw it and are still low level) get the tutorial once they're in the city
  if (!m.tut && !tutSeen() && (!m.loaded || (m.xp || 0) < 200)) G.tutPending = true;
});
// store menus (walk up to a shopkeeper: PC E · VR grip)
const bankView = new BankView(scene, map, world);   // CITY BANK vault door + cash stacks
const marker = new Marker(scene);                  // job target beam
const raceView = new RaceView(scene); raceView.serverNow = () => net.serverNow();   // street races
const turfView = new TurfView(scene, world);          // gang turf zones
const aptView = new AptView(scene);                     // apartments (rooms under the city)
const seasonView = new SeasonView(scene, world);        // holiday event (snow, tree, gifts)
const _seasonCam = new THREE.Vector3();
const dayNight = new DayNight({ scene, sun: engine.sun, hemi: engine.hemi, map, city });   // the city clock: sun, sky, streetlights, windows, headlights
net.on('clock', (m) => { dayNight.sync(m.ms, m.fixed); G.fixedWeather = m.weather; });
const weather = new Weather(scene, audio);
weather.onChange = (k) => { if (!G.room) return; const t = k === 'storm' ? '⛈ A thunderstorm is rolling in!' : k === 'rain' ? '🌧 It started raining. Roads are slippery!' : '🌤 The rain stopped'; if (weather.seen) { toast(t); vrui.setNotice(t, 2.5); } weather.seen = true; };
const fallY = (x, y, z) => aptAt(x, y, z) >= 0 ? -16 : inPrisonArea(x, z) ? -9 : -6.5;   // below this you get put back
const tut = new Tutorial({ net, hud, vrui, map, toast: (t) => toast(t) });   // first-time tutorial
const tutSeen = () => { try { return localStorage.getItem('cc_tut') === '1'; } catch { return false; } };
net.on('tutReward', (m) => { hud.levelUp(`<div class="big">TUTORIAL COMPLETE!</div><small>+$${m.cash} · +${m.xp} XP</small>`, 3500); vrui.setNotice(`TUTORIAL COMPLETE! +$${m.cash}`, 3); audio.playCash(); const p = G.players.get(G.room?.you); if (p) p.cash = m.total; });
const shopMenu = new ShopMenu({ net, map, world, npcs, toast: (t) => toast(t), hud, vrui, audio, myCash: () => G.players.get(G.room?.you)?.cash || 0, goldForSale: () => !!goldForSale(),
  myBank: () => G.bank || 0, myJob: () => G.job ? `${JOBS[G.job.kind].icon} ${JOBS[G.job.kind].name}` : '',
  myGarage: () => G.garage || { cars: [], sel: '', paint: {} }, myLevel: () => myLevel(),
  myWardrobe: () => G.wardrobe || [], myOutfit: () => profile.cos.outfit | 0,
  myApt: () => aptItems(G.aptOwn, G.apts, G.room?.you),
  relock: () => { if (G.view === 'playing' && !renderer.xr.isPresenting) desk.lock && desk.lock(); } });
// ---------------------------------------------------------------- the BOSS CREW
net.on('boss', (m) => {
  if (m.ev === 'start') {
    G.boss = { shop: m.shop, id: m.id, hp: 450, max: 450, guards: 2 };
    const t = `👑 BOSS CREW is robbing the ${m.shop}! Take them down for big bounties`;
    hud.levelUp(`<div class="big">🚨 BOSS CREW!</div><small>They're hitting the ${esc(m.shop)} · bounty $800 + the loot</small>`, 3500);
    hud.feed(esc(t), true); vrui.addFeed(t); vrui.setNotice(`BOSS CREW at the ${m.shop}!`, 4); audio.playAlarm();
  } else if (m.ev === 'state') { if (m.phase === 'gone') G.boss = null; else G.boss = { ...(G.boss || {}), shop: m.shop, id: m.id, hp: m.hp, max: m.max, guards: m.guards, loot: m.loot, phase: m.phase }; }
  else if (m.ev === 'down') { const t = m.boss ? `👑 ${nameOf(m.by) || 'The police'} ${m.arrest ? 'arrested' : 'took down'} the BOSS!` : `👑 ${nameOf(m.by) || 'Someone'} ${m.arrest ? 'cuffed' : 'dropped'} a boss crew guard`; hud.feed(esc(t), m.by === G.room?.you); vrui.addFeed(t); }
  else if (m.ev === 'over') {
    G.boss = null;
    const t = m.why === 'down' ? `👑 The BOSS CREW is finished!${m.by ? ' ' + nameOf(m.by) + ' got the last one (+$300 bonus)' : ''}` : '👑 The BOSS CREW got away with the cash...';
    hud.feed(esc(t), m.by === G.room?.you); vrui.addFeed(t); vrui.setNotice(t, 3);
    if (m.by === G.room?.you) { hud.levelUp('<div class="big">👑 BOSS CREW DOWN!</div><small>+$300 crew bonus</small>', 3000); audio.playCash(); }
  }
});
function bossLine() {
  const b = G.boss; if (!b) return null;
  return `👑 BOSS CREW · ${b.shop}${b.phase === 'flee' ? ' · RUNNING with $' + (b.loot || 0) : ''} · ♥ ${b.hp}/${b.max}${b.guards ? ` · ${b.guards} guard${b.guards > 1 ? 's' : ''}` : ''}`;
}
// ---------------------------------------------------------------- gang turf
const myGang = () => G.players.get(G.room?.you)?.gang || 0;
function setGang(g) { net.send({ type: 'setGang', g }); }
net.on('turf', (m) => turfView.set(m.z));
net.on('gangSet', (m) => { const g = GANGS[m.g]; const t = g ? `${g.icon} You joined the ${g.name}! Stand in a turf ring to take it over` : 'You left your gang'; toast(t); vrui.setNotice(t, 3); menu.setGang(m.g); if (vrui.menuOpen && !shopMenu.vrOpen && !G.vrMissions) vrui.openMenu(menuModel()); });
net.on('turfTaken', (m) => {
  const mine = m.by.includes(G.room?.you);
  hud.feed(esc(m.text), mine); vrui.addFeed(m.text);
  if (mine) { hud.levelUp(`<div class="big">${m.cop ? '🚔 TURF CLEARED' : '🏴 TURF TAKEN!'}</div><small>+$${m.cash}</small>`, 2400); audio.playCash(); }
});
net.on('turfPay', (m) => { const p = G.players.get(G.room?.you); if (p) p.cash = m.total; toast(`🏴 Turf money: +$${m.amt} (${m.n} zone${m.n > 1 ? 's' : ''})`); vrui.setNotice(`Turf money +$${m.amt}`, 2); });
// ---------------------------------------------------------------- street races
net.on('race', (m) => {
  if (m.ev === 'cp') audio.playChime ? audio.playChime() : audio.playPickup();
  const r = raceView.on(m, G.room?.you);
  if (!r) return;
  if (r.cash !== undefined) { const p = G.players.get(G.room?.you); if (p) p.cash = r.cash; }
  if (r.big) hud.levelUp(`<div class="big">${esc(r.big)}</div><small>${esc(r.text || '')}</small>`, 2600);
  else if (r.text) toast(r.text);
  if (r.vr) vrui.setNotice(r.vr, 3);
  if (r.big && /PLACE|TARGET|FINISHED/.test(r.big)) audio.playCash();
});
// ---------------------------------------------------------------- your own cars (CAR LOT at the gas station)
net.on('garage', (m) => { G.garage = m; });
net.on('carColor', (m) => cars.recolor(m.id, m.color));
function callMyCar() { if (!G.garage || !G.garage.sel) { toast('🚗 Buy your own car at the CAR LOT (gas station) first'); vrui.setNotice('Buy a car at the CAR LOT (gas station) first', 3); return; } net.send({ type: 'carCall' }); }
net.on('carCallResult', (m) => {
  if (!m.ok) { toast('⚠️ ' + m.why); vrui.setNotice(m.why, 3); return; }
  G.carBeacon = { at: [m.at[0], 0.15, m.at[1]], until: performance.now() / 1000 + 20, id: m.id };
  toast('🔑 Your car is parked on the street nearby (follow the beam)'); vrui.setNotice('Your car is here! Follow the beam', 3); audio.playChime && audio.playChime();
});
// the show cars on the CAR LOT pads (with price tags)
{
  for (const s of map.carShow || []) {
    const m = CAR_MODELS[s.model], car = showCar(carCode(m.id, s.model * 3 % 10)); car.position.set(...s.p); car.rotation.y = s.yaw; scene.add(car);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(textCanvas(`${m.name}  $${m.price}`, { w: 512, h: 128, bg: '#1d1442', fg: '#ffd23f', font: 'bold 52px Trebuchet MS, sans-serif', radius: 40 })), transparent: true }));
    tag.scale.set(3, 0.75, 1); tag.position.set(s.p[0], 2.6, s.p[2]); scene.add(tag);
  } }
// ---------------------------------------------------------------- 🎉 party (follow the leader between rooms)
const PARTY_KEY = 'cc_party';
const partyGet = () => { try { return JSON.parse(sessionStorage.getItem(PARTY_KEY) || 'null'); } catch { return null; } };
const partySet = (v) => { try { v ? sessionStorage.setItem(PARTY_KEY, JSON.stringify(v)) : sessionStorage.removeItem(PARTY_KEY); } catch {} };
const NO_PARTY = { code: null, members: [], leader: false };
net.on('open', () => {
  const pk = partyGet();
  if (pk) net.send({ type: 'partyRejoin', code: pk.code, key: pk.key, name: profile.name });
  const want = new URLSearchParams(location.search).get('party');
  if (want && !pk && !G.partyTried) { G.partyTried = true; net.send({ type: 'partyJoin', code: want, name: profile.name }); }
});
net.on('partyKey', (m) => partySet({ code: m.code, key: m.key }));
net.on('party', (m) => {
  if (!m.code) { partySet(null); G.party = NO_PARTY; }
  else G.party = { code: m.code, members: m.members, leader: m.leader };
  menu.setParty(G.party);
});
net.on('partyError', (m) => { menu.setParty({ ...(G.party || NO_PARTY), error: m.message }); toast('🎉 ' + m.message); });
net.on('partyGo', (m) => {
  if (G.room && G.room.code === m.room) return;
  const t = `🎉 Following ${m.by} to room ${m.room}...`;
  toast(t); vrui.setNotice(t, 3);
  setTimeout(() => net.send({ type: 'join', code: m.room, name: profile.name, cos: myCos(), role: profile.role, profile: saveGet() }), 600);
});
function partyAction(a, code) {
  if (!net.connected) return toast('Still connecting to the server...');
  if (a === 'create') net.send({ type: 'partyCreate', name: profile.name });
  else if (a === 'join') net.send({ type: 'partyJoin', code, name: profile.name });
  else if (a === 'leave') net.send({ type: 'partyLeave' });
  else if (a === 'copy' && G.party && G.party.code) { const url = `${location.origin}${location.pathname}?party=${G.party.code}`; navigator.clipboard?.writeText(url).then(() => toast('📋 Party invite link copied!'), () => toast(url)); }
}
// ---------------------------------------------------------------- 🏆 leaderboards
net.on('open', () => { const tk = saveGet(); if (tk) net.send({ type: 'lbSubmit', token: tk, name: profile.name }); });   // keeps the board filled after server restarts
const LB = { key: 'wealth', data: null, at: 0 };
const myPid = () => tokenPid(saveGet() || '');
async function loadBoards(force) {
  if (!force && LB.data && performance.now() - LB.at < 15000) return LB.data;
  try { const r = await fetch(`${serverBase()}/api/leaderboard?pid=${encodeURIComponent(myPid())}`); LB.data = await r.json(); LB.at = performance.now(); } catch { LB.data = LB.data || null; }
  return LB.data;
}
function renderBoards() {
  const tabs = document.getElementById('lb-tabs'), d = LB.data, b = BOARDS.find(x => x.key === LB.key), pid = myPid();
  tabs.innerHTML = BOARDS.map(x => `<button data-lb="${x.key}" class="${x.key === LB.key ? 'on' : ''}">${x.icon} ${x.name}</button>`).join('');
  tabs.querySelectorAll('[data-lb]').forEach(el => el.onclick = () => { LB.key = el.dataset.lb; audio.playClick(); renderBoards(); });
  document.getElementById('lb-title').textContent = `${b.icon} ${b.name}`;
  const rows = d && d.boards ? d.boards[b.key] || [] : null;
  document.getElementById('lb-list').innerHTML = !rows ? '<li><span>Can\'t reach the server right now</span></li>' : !rows.length ? '<li><span>Nobody yet: be the first!</span></li>'
    : rows.map(r => `<li class="${r.pid === pid ? 'me' : ''}"><span>${esc(r.name)} <small>Lv${r.lvl}</small></span><b>${b.fmt(r.v, r)}</b></li>`).join('');
  const me = d && d.me && d.me[b.key];
  document.getElementById('lb-me').textContent = me ? `You're #${me} on this board.` : pid ? 'You\'re not on this board yet.' : 'Play a game to get on the boards!';
}
function onMenuScreen(name) { if (name === 'leaders') { renderBoards(); loadBoards(true).then(renderBoards); } }
function leadersVrModel() {
  const b = BOARDS.find(x => x.key === LB.key), rows = LB.data && LB.data.boards ? (LB.data.boards[b.key] || []).slice(0, 6) : [];
  const items = rows.map((r, i) => ({ label: `${['🥇', '🥈', '🥉'][i] || '#' + (i + 1)} ${r.name}  ${b.fmt(r.v, r)}`, act: 'missions:none', color: r.pid === myPid() ? '#b8860b' : '#3d3a6b' }));
  if (!rows.length) items.push({ label: LB.data ? 'NOBODY YET: BE THE FIRST!' : 'LOADING...', act: 'missions:none', color: '#3d3a6b' });
  items.push({ label: '▶ NEXT BOARD', act: 'leaders:next', color: '#ff9f1c' }, { label: '◀ BACK', act: 'leaders:back', color: '#6c6f8a' });
  return { cols: 1, title: `🏆 ${b.icon} ${b.name.toUpperCase()}`, sub: 'LEADERBOARDS', items };
}
// ---------------------------------------------------------------- 😀 emotes
function sendEmote(e) { if (!G.room || performance.now() - (G.emoteAt || 0) < 1200) return; G.emoteAt = performance.now(); net.send({ type: 'emote', e }); }
net.on('emote', (m) => {
  const E = EMOTES[m.e]; if (!E) return;
  if (m.id === G.room?.you) { hud.notice(`${E.icon} ${E.name}`, 1200); selfieAvatar.playEmote(m.e, E.icon); return; }
  const p = remote.players.get(m.id); if (p) p.avatar.playEmote(m.e, E.icon);
});
// PC emote wheel: hold G, move the mouse toward one (or press 1-8), let go of G
const wheelEl = document.createElement('div'); wheelEl.id = 'emotewheel'; wheelEl.className = 'hidden';
wheelEl.innerHTML = EMOTES.map((e, i) => { const a = i / EMOTES.length * Math.PI * 2 - Math.PI / 2; return `<div class="ew" data-i="${i}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><b>${e.icon}</b><small>${i + 1} ${e.name}</small></div>`; }).join('') + '<div class="ewc">EMOTES<br><small>move the mouse · let go of G</small></div>';
document.body.appendChild(wheelEl);
function emoteWheel(open, dx, dy) {
  if (open && !G.ew) { G.ew = { x: 0, y: 0, i: -1 }; wheelEl.classList.remove('hidden'); }
  if (!G.ew) return false;
  if (open) {
    G.ew.x += dx; G.ew.y += dy;
    const L = Math.hypot(G.ew.x, G.ew.y); if (L > 160) { G.ew.x *= 160 / L; G.ew.y *= 160 / L; }
    if (L > 35) { const a = Math.atan2(G.ew.y, G.ew.x) + Math.PI / 2; G.ew.i = ((Math.round(a / (Math.PI * 2 / EMOTES.length)) % EMOTES.length) + EMOTES.length) % EMOTES.length; }
    for (let k = 1; k <= EMOTES.length; k++) if (desk.hit('Digit' + k)) G.ew.i = k - 1;
    wheelEl.querySelectorAll('.ew').forEach((el, k) => el.classList.toggle('on', k === G.ew.i));
    return true;
  }
  if (G.ew.i >= 0) sendEmote(G.ew.i);
  G.ew = null; wheelEl.classList.add('hidden');
  return false;
}
// VR: a real wave (hand above your head, side to side) = 👋
function detectWave(hand, head, t) {
  const W = G.wave ||= { lastX: 0, dir: 0, flips: [], at: 0 };
  if (hand.y < head.y + 0.08) { W.flips.length = 0; return; }
  const dx = hand.x - W.lastX; W.lastX = hand.x;
  const d = Math.abs(dx) > 0.012 ? Math.sign(dx) : 0;
  if (d && d !== W.dir) { W.dir = d; W.flips.push(t); }
  W.flips = W.flips.filter(f => t - f < 1.3);
  if (W.flips.length >= 4 && t - W.at > 4) { W.at = t; W.flips.length = 0; sendEmote(0); vrui.setNotice('👋 Wave!', 1); }
}
function emotesVrModel() {
  const items = EMOTES.map((e, i) => ({ label: `${e.icon} ${e.name.toUpperCase()}`, act: 'emote:' + i, color: ['#00b4d8', '#ff9f1c', '#e91e63', '#2ec27e', '#d62f4b', '#ff4fa3', '#795548', '#8338ec'][i] }));
  items.push({ label: '◀ BACK', act: 'emotes:back', color: '#6c6f8a' });
  return { cols: 2, title: '😀 EMOTES', sub: 'OR RAISE YOUR HAND AND WAVE!', items };
}
// ---------------------------------------------------------------- 📱 phone (P on PC, look at your left wrist in VR)
// ---------------------------------------------------------------- 🗺️ city map (minimap, M = big map, phone MAP app)
const cityMap = new CityMap(map);
const MAP_PLACES = GPS_PLACES(map);
const _mp = new THREE.Vector3(), _md = new THREE.Vector3();
function mapMe() { camera.getWorldPosition(_mp); camera.getWorldDirection(_md); return { x: _mp.x, z: _mp.z, yaw: Math.atan2(-_md.x, -_md.z) }; }
function mapBlips(full) {
  const out = [];
  for (const z of turfView.zones) { const g = GANGS[z.owner]; out.push({ x: z.t.p[0], z: z.t.p[1], ring: 9, color: g ? g.color : '#9aa0b4', label: full ? '🏴 ' + z.t.name : null }); }
  for (const pl of MAP_PLACES) out.push({ x: pl.p[0], z: pl.p[2], icon: pl.name.split(' ')[0], label: full ? pl.name.split(' ').slice(1).join(' ') : null });
  if (seasonView.on) for (const g of seasonView.gifts) if (!seasonView.got.has(g.id)) out.push({ x: g.x, z: g.z, icon: '🎁' });
  if (G.me.wanted) for (const n of npcs.map.values()) if (n.type === NPC_TYPE.COP && n.alive && n.state !== 3) out.push({ x: n.x, z: n.z, r: 3.5, color: '#3a86ff' });
  for (const p of remote.players.values()) {
    if (!p.avatar.root.visible) continue;
    const i = G.players.get(p.info.id) || p.info, q = p.avatar.root.getWorldPosition(_md);
    out.push({ x: q.x, z: q.z, r: 5, color: i.wanted ? '#ff3b4e' : i.role === 'cop' ? '#3a86ff' : '#ffffff', label: full ? i.name : null });
  }
  if (marker.root.visible) out.push({ x: marker.root.position.x, z: marker.root.position.z, pin: true, color: '#' + marker.beamMat.color.getHexString(), label: full ? marker.key : null });
  return out;
}
const mapNight = () => Math.max(0, Math.min(1, 1 - (dayNight.f ?? 1)));
function drawWholeMap(ctx, size, full) { return cityMap.draw(ctx, { size, cx: 0, cz: 0, radius: cityMap.half, me: G.room ? mapMe() : null, blips: mapBlips(full), labels: full, night: mapNight() }); }
// PC minimap: bottom right, turns with you
const miniEl = document.createElement('canvas'); miniEl.id = 'minimap'; miniEl.width = miniEl.height = 340; $('hud').appendChild(miniEl);
let miniOn = true; try { miniOn = localStorage.getItem('cc_minimap') !== '0'; } catch {}
miniEl.classList.toggle('hidden', !miniOn);
let miniT = 0;
function updateMinimap(t, xr) {
  const show = miniOn && !xr && !!G.room && G.me.alive && !G.scoped;
  miniEl.style.display = show ? '' : 'none';
  if (!show || t - miniT < 0.1) return; miniT = t;
  const me = mapMe();
  cityMap.draw(miniEl.getContext('2d'), { size: 340, cx: me.x, cz: me.z, radius: driving.active ? 95 : 60, rot: me.yaw, round: true, me, blips: mapBlips(false), night: mapNight() });
}
// the big map: M on PC (or the phone's MAP app). Click anywhere to drop a GPS pin.
const bigMap = (() => {
  const el = document.createElement('div'); el.id = 'citymap'; el.className = 'hidden';
  el.innerHTML = `<div class="cm-top"><b>🗺️ CITY MAP</b><span>Click anywhere to set your GPS · M or Esc to close</span><button data-x>✖</button></div>
    <canvas width="900" height="900"></canvas>
    <div class="cm-bar"><span class="cm-legend"><i style="background:#ffd23f"></i>you <i style="background:#fff"></i>players <i style="background:#3a86ff"></i>cops <i style="background:#ff3b4e"></i>wanted <i style="background:#8338ec"></i>GPS</span>
    <button data-clear>📍 Clear GPS</button><button data-mini></button></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), miniBtn = el.querySelector('[data-mini]');
  const label = () => { miniBtn.textContent = `Minimap: ${miniOn ? 'ON' : 'OFF'}`; };
  let timer = 0;
  const api = {
    isOpen: () => !el.classList.contains('hidden'),
    open() { if (!G.room) return; el.classList.remove('hidden'); label(); api.draw(); clearInterval(timer); timer = setInterval(() => api.draw(), 200); if (document.pointerLockElement) document.exitPointerLock(); },
    close() { if (!api.isOpen()) return; el.classList.add('hidden'); clearInterval(timer); if (G.view === 'playing' && !renderer.xr.isPresenting) desk.lock && desk.lock(); },
    toggle() { api.isOpen() ? api.close() : api.open(); },
    view: null,
    draw() { api.view = drawWholeMap(ctx, 900, true); }
  };
  el.addEventListener('mousedown', e => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('[data-x]')) return api.close();
    if (e.target.closest('[data-clear]')) { G.gps = null; phone.gpsArrived(); marker.hide(); toast('📍 GPS off'); return api.draw(); }
    if (e.target.closest('[data-mini]')) { miniOn = !miniOn; try { localStorage.setItem('cc_minimap', miniOn ? '1' : '0'); } catch {} miniEl.classList.toggle('hidden', !miniOn); return label(); }
    if (e.target !== cv) return;
    const r = cv.getBoundingClientRect(), [wx, wz] = cityMap.toWorld(api.view, (e.clientX - r.left) * 900 / r.width, (e.clientY - r.top) * 900 / r.height);
    if (Math.abs(wx) > cityMap.half || Math.abs(wz) > cityMap.half) return;
    let best = -1, bd = 12;
    MAP_PLACES.forEach((pl, i) => { const d = Math.hypot(pl.p[0] - wx, pl.p[2] - wz); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) phone.tap('gps', best);
    else { phone.gpsArrived(); G.gps = { p: [wx, 0.15, wz], label: '📍 MAP PIN' }; toast('📍 GPS: follow the purple beam to your pin'); }
    api.draw();
  });
  document.addEventListener('keydown', (e) => { if (api.isOpen() && (e.code === 'Escape' || e.code === 'KeyM')) { e.preventDefault(); e.stopPropagation(); api.close(); } }, true);
  return api;
})();

const phone = new Phone({ map, drawMap: (ctx, size) => drawWholeMap(ctx, size, false),
  data: () => {
    const p = G.players.get(G.room?.you), pr = levelProgress(myXp()), d = new Date(), wk = G.weekly ? G.weekly.list : [];
    const c = seasonView.on ? seasonView.count() : null;
    return { time: `${weather.kind === 'storm' ? '⛈' : weather.kind === 'rain' ? '🌧' : isNight(dayNight.hour) ? '🌙' : '☀️'} ${fmtHour(dayNight.hour)}`, cash: p ? p.cash || 0 : 0, bank: G.bank || 0, lvl: pr.lvl, frac: +pr.frac.toFixed(2),
             task: G.room ? taskLine(camera, true) : null, missions: G.missions ? G.missions.list.map(m => ({ text: m.text, prog: m.prog, goal: m.goal, done: m.done })) : [],
             weeklyDone: wk.filter(q => q.done).length, weeklyTotal: wk.length || 4, gifts: c ? `${c.got}/${c.total}` : '',
             hasCar: !!(G.garage && G.garage.sel), inCar: driving.active, radio: audio.carRadioStation(), camera: photocam.on };
  },
  act: (app, arg) => {
    if (app === 'car') callMyCar();
    else if (app === 'radio') { if (driving.active) radioNext(); else { toast('📻 Get in a car to use the radio'); vrui.setNotice('Get in a car for the radio', 2); } }
    else if (app === 'wave') sendEmote(0);
    else if (app === 'map') { phone.el.classList.add('hidden'); bigMap.open(); }
    else if (app === 'cam') { if (!renderer.xr.isPresenting) phone.close(); toggleCamera(); }
    else if (app === 'photos') openPhotos();
    else if (app === 'gps') { G.gps = arg; const t = arg ? `📍 GPS: follow the purple beam to ${arg.label}` : '📍 GPS off'; toast(t); vrui.setNotice(t, 2); }
  } });
phone.onClose = () => { if (G.view === 'playing' && !renderer.xr.isPresenting) desk.lock && desk.lock(); };
// ---------------------------------------------------------------- 🎄 holiday event
net.on('season', (m) => { const was = seasonView.on; seasonView.set(m); audio.AMB.winter = !!m.on; if (m.on && !was && G.room) { toast('🎄 Happy holidays! 12 gifts are hidden around the city today'); vrui.setNotice('Happy holidays! Find the 12 hidden gifts', 3); } });
net.on('gift', (m) => {
  seasonView.opened(m.id);
  const p = G.players.get(G.room?.you); if (p && m.cash !== undefined) p.cash = m.cash;
  const pr = m.prize, what = pr.kind === 'santa' ? '🎅 THE SANTA SUIT! (CUSTOMIZE > Outfit)' : pr.kind === 'xp' ? `+${pr.xp} XP` : `+$${pr.cash}`;
  hud.levelUp(`<div class="big">🎁 GIFT!</div><small>${what}</small><small>${m.left} more hidden today</small>`, 2800); vrui.setNotice(`GIFT! ${what} · ${m.left} left`, 3); audio.playCash();
});
function giftInteract(pos, press, vr) {
  const g = seasonView.on ? seasonView.near(pos) : null; if (!g) return null;
  if (press && performance.now() - (G.giftAt || 0) > 600) { G.giftAt = performance.now(); net.send({ type: 'gift', id: g.id }); }
  return `🎁 ${vr ? 'Squeeze grip' : 'Press E'} to open the gift`;
}
// ---------------------------------------------------------------- 🏠 apartments
net.on('apts', (m) => { G.apts = m.units; aptView.set(m.units); });
net.on('aptOwn', (m) => { G.aptOwn = m.own; });
net.on('aptIn', (m) => { const mine = m.owner === G.room?.you; const t = mine ? '🏠 Welcome home! Your trophies are on the shelf' : `🚪 Visiting ${nameOf(m.owner)}'s apartment`; toast(t); vrui.setNotice(t, 3); shopMenu.close(); if (vrui.menuOpen) vrui.closeMenu(); audio.playDoor && audio.playDoor(); });
net.on('aptOut', () => { audio.playDoor && audio.playDoor(); });
function aptInteract(pos, press, vr) {
  const p = aptView.prompt(pos, vr); if (!p) return null;
  if (press && performance.now() - (G.aptAt || 0) > 700) { G.aptAt = performance.now(); net.send({ type: p.act }); }
  return p.text;
}
// ---------------------------------------------------------------- 👕 THREADS (clothing)
net.on('wardrobe', (m) => { G.wardrobe = m.owned; menu.syncCustom(); });
function wearOutfit(i) { profile.cos.outfit = i; saveProfile(); localAvatar.setCosmetics(myCos()); rebuildLocalHands(); menu.syncCustom(); }
// mannequins on the plaza wearing the outfits
for (const mq of map.mannequins || []) {
  const av = new Avatar({ color: '#e0e0e0', accent: ['#ffffff', '#ff4fa3', '#3a86ff', '#2ec27e', '#d62828', '#1e40af', '#ffd23f'][mq.outfit], head: 0, body: 0, hat: 0, glasses: mq.outfit === 6 ? 1 : 0, back: 0, outfit: mq.outfit }, { name: OUTFITS[mq.outfit].name + ' $' + OUTFITS[mq.outfit].price });
  const [x, y, z] = mq.p, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mq.yaw);
  const qa = [q.x, q.y, q.z, q.w], fx = -Math.sin(mq.yaw), fz = -Math.cos(mq.yaw), rx = Math.cos(mq.yaw), rz = -Math.sin(mq.yaw);
  scene.add(av.root);
  for (let i = 0; i < 8; i++) av.setPose([x, y + 1.62, z, ...qa], [x - rx * 0.3 + fx * 0.1, y + 0.95, z - rz * 0.3 + fz * 0.1, ...qa], [x + rx * 0.3 + fx * 0.1, y + 0.95, z + rz * 0.3 + fz * 0.1, ...qa], 0.5);
}
net.on('shopResult', (m) => {
  if ((m.kind === 'outfit' || m.kind === 'wear') && m.ok) wearOutfit(m.outfit);
  const p = G.players.get(G.room?.you); if (p && m.cash !== undefined) p.cash = m.cash;
  if (m.ok && m.kind === 'boost') boosts.setBoost(m.boost);
  if (m.ok && m.kind === 'armor') G.me.armor = m.ap;
  if (m.ok && m.bank !== undefined) G.bank = m.bank;
  if (m.ok && m.kind === 'job' && vrui.menuOpen) vrui.closeMenu();   // job taken: off you go
  if (m.ok) vrInput.pulse('right', 0.5, 60);
  shopMenu.onResult(m);
});
net.on('armor', (m) => { G.me.armor = m.ap; });
// ---------------------------------------------------------------- CITY BANK + heist + jobs
net.on('bankBal', (m) => { G.bank = m.bank; if (m.interest) toast(`🏦 Your savings earned $${m.interest} interest`); });
net.on('bank', (m) => {
  bankView.onState(m);
  if (m.you === 'cop') G.prompt = '👮 Cops guard the vault, they don\'t crack it';
  if (m.state === 'drilling' && G.drilling) G.rob = { text: '🔩 DRILLING THE VAULT... KEEP HOLDING', p: m.p, at: performance.now() / 1000 };
  if (m.ev === 'open') { const t = m.by === G.room?.you ? '💥 YOU CRACKED THE VAULT! Grab a cash stack!' : `🚨 ${nameOf(m.by)} cracked the CITY BANK vault!`; hud.feed(esc(t), m.by === G.room?.you); vrui.addFeed(t); audio.playAlarm(); }
  if (m.ev === 'close') { hud.feed('🔒 The bank vault slammed shut (lockdown)'); vrui.addFeed('🔒 The bank vault slammed shut'); }
});
net.on('bankAlarm', (m) => { const t = `🚨 ALARM! ${nameOf(m.by)} is drilling the CITY BANK vault!`; hud.feed(esc(t), m.by === G.room?.you); vrui.addFeed(t); audio.playAlarm(); });
net.on('heist', (m) => {
  if (m.loot) { G.heist = { loot: m.loot, from: m.from, r: m.escape }; hud.notice(`💰 $${m.loot}! GET ${m.escape} M AWAY FROM THE BANK!`, 3000); vrui.setNotice(`$${m.loot}! Get ${m.escape} m away from the bank!`, 3); audio.playCash(); return; }
  G.heist = null;
  if (m.paid) { hud.levelUp(`<div class="big">HEIST COMPLETE!</div><small>You got away with $${m.paid}</small>`, 3800); vrui.setNotice(`HEIST COMPLETE! +$${m.paid}`, 3.5); audio.playWin(); const p = G.players.get(G.room?.you); if (p) p.cash = m.cash; }
  if (m.lost) { hud.notice('💸 You lost the stolen cash', 2500); vrui.setNotice('You lost the stolen cash', 2.5); }
});
net.on('heistEnd', (m) => { if (m.id === G.room?.you) return; const t = m.ok ? `💰 ${nameOf(m.id)} got away with $${m.cash} from the bank!` : `👮 ${nameOf(m.id)} lost the bank cash`; hud.feed(esc(t)); vrui.addFeed(t); });
net.on('cashLost', (m) => { const t = m.why === 'arrest' ? `🚔 Police confiscated $${m.amt} (keep cash in the CITY BANK)` : `💸 ${nameOf(m.by)} grabbed $${m.amt} from you (cash in the CITY BANK is safe)`; toast(t); vrui.setNotice(t, 3); });
net.on('cashGot', (m) => { hud.notice(`💵 +$${m.amt} grabbed from ${nameOf(m.from)}`, 1800); });
net.on('job', (m) => {
  if (!m.kind) {
    const was = G.job; G.job = null; marker.hide();
    if (m.result === 'paid' || m.result === 'late') {
      const J = JOBS[m.was] || {};
      hud.levelUp(`<div class="big">${m.result === 'late' ? 'LATE BUT DONE' : 'JOB DONE!'}</div><small>${J.icon || ''} ${J.name || 'Job'} · +$${m.paid}${m.result === 'late' ? ' (half pay)' : ''}</small><small>Go back to the 💼 JOBS kiosk for another one</small>`, 3500);
      vrui.setNotice(`JOB DONE! +$${m.paid}`, 3); audio.playCash();
      const p = G.players.get(G.room?.you); if (p && m.cash !== undefined) p.cash = m.cash;
    } else if (was && m.result) {
      const why = { quit: 'You quit the job', timeout: 'Too slow, the customer cancelled', failed: 'The job fell through', passenger: 'Your passenger got out and left', hurt: 'Your passenger got hurt' }[m.result] || 'Job over';
      toast('💼 ' + why); vrui.setNotice(why, 2.5);
    }
    return;
  }
  G.job = { ...m, endsAt: m.left ? performance.now() + m.left * 1000 : 0 };
  if (m.started) { toast(`${JOBS[m.kind].icon} ${m.text}`); vrui.setNotice(m.text, 3); }
  if (m.picked) { hud.notice(m.kind === 'taxi' ? '🚕 Passenger on board!' : '📦 Order picked up!', 1500); audio.playPickup(); vrui.setNotice(m.text, 3); }
});
// the vault: drill (hold) / grab (press) prompts. Returns the prompt text, or null when not at the vault
function vaultInteract(p, hold, press, vr, t) {
  const B = map.bank; if (!B || !G.me.alive) return null;
  const k = vr ? 'grip' : 'E', K = vr ? 'Squeeze grip' : 'Press E';
  const st = bankView.state;
  const i = st === 'open' ? bankView.nearStack(p) : -1;
  if (i >= 0) {
    if (isCop()) return '👮 Guard the vault: arrest anyone who grabs the cash';
    if (G.heist) return '💰 You can only carry one stack: RUN!';
    if (press) net.send({ type: 'heist', a: 'grab', i });
    return `💰 ${K} to grab the cash`;
  }
  if (!bankView.nearDrill(p)) { G.drilling = false; return null; }
  if (isCop()) return '👮 Cops guard the vault, they don\'t crack it';
  if (st === 'lockdown') { const s = bankView.lockLeft(); return `🔒 Vault on lockdown for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  if (st === 'open') return `🚨 The vault is OPEN for ${bankView.openLeftS()}s: grab the cash inside!`;
  G.drilling = !!hold;
  if (hold && t - (G.drillSentAt || 0) > 0.25) { G.drillSentAt = t; net.send({ type: 'heist', a: 'drill' }); if (vr) vrInput.pulse('right', 0.25, 30); if (Math.random() < 0.3) audio.playScrape(); }
  return st === 'drilling' && !hold ? `🔩 Keep holding ${k} to finish drilling!` : `🔩 Hold ${k} to drill the vault (sets off the alarm ★)`;
}
// one line at the top while you're on a job or getting away with bank cash
function taskLine(cam, short = false) {
  const me = cam.getWorldPosition(new THREE.Vector3());
  const arrow = (x, z) => {
    const d = Math.hypot(x - me.x, z - me.z), dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const a = Math.atan2(x - me.x, z - me.z) - Math.atan2(dir.x, dir.z);
    const arrows = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'];
    const idx = ((Math.round(-a / (Math.PI / 4)) % 8) + 8) % 8;
    return `${arrows[idx]} ${Math.round(d)} m`;
  };
  const rl = raceView.line(short); if (rl) return rl;
  const tl = turfView.line(me.setY(me.y - 1.5), myGang(), isCop()); if (tl) return tl;
  if (G.heist) {
    const d = Math.hypot(me.x - G.heist.from[0], me.z - G.heist.from[1]);
    return `💰 $${G.heist.loot} stolen · get ${Math.max(0, Math.round(G.heist.r - d))} m further from the bank!`;
  }
  if (!G.job) return null;
  const j = G.job, tgt = j.target;
  const left = j.endsAt ? Math.round((j.endsAt - performance.now()) / 1000) : 0;
  const tm = j.endsAt ? (left >= 0 ? ` · ⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ' · ⏱ LATE (half pay)') : '';
  if (short) return `${JOBS[j.kind].icon} ${j.text.replace('the order ', '').replace(' waiting on the sidewalk', '').replace(' (E / grip on any car), then go pick up your passenger', '')}${tgt ? ' · ' + arrow(tgt[0], tgt[2]) : ''}${tm}`;
  return `${JOBS[j.kind].icon} ${j.text}${tgt ? ' · ' + arrow(tgt[0], tgt[2]) : ''}${tm}${j.pay ? ` · $${j.pay}` : ''}`;
}
const prison = new PrisonClient({ net, map, world, view: prisonView, npcs });
const cut = new ArrestCutscene({ scene, camera, rig, map, world, prisonView });
let pendingTp = null;

// VR weapon holder lives on the right controller's pointing pose
const vrHolder = new THREE.Group();
weapons.vrHolder = vrHolder;
// local VR hands (mittens)
let localAvatar = new Avatar(profile.cos, { isLocal: true });
const handL = localAvatar.lh, handR = localAvatar.rh;
scene.add(handL); handL.visible = false;
vrHolder.add(handR); handR.visible = false;

// ---------------------------------------------------------------- 📷 the camera (V on PC, Y menu / phone in VR)
const camNote = (t) => { toast(t); vrui.setNotice(t, 2.2); };
const photocam = new PhotoCam({ renderer, scene, weapons, notify: camNote });
// in selfie mode you show up in the picture: a copy of your avatar posed where you are
const selfieAvatar = new Avatar(profile.cos, { isLocal: true }); selfieAvatar.root.visible = false; scene.add(selfieAvatar.root);
photocam.beforeRender = () => {
  if (!photocam.selfie || !G.myPose) return;
  selfieAvatar.setPose(G.myPose.h, G.myPose.l, G.myPose.r, 1 / 30); selfieAvatar.emoteTick(); selfieAvatar.root.visible = true;
};
photocam.afterRender = () => { selfieAvatar.root.visible = false; };
function toggleCamera() { if (!G.room) return; const on = photocam.toggle(); camNote(on ? (renderer.xr.isPresenting ? '📷 Camera out! Tap trigger: photo · hold: video · A: selfie · B: back to your gun' : '📷 Camera out! Click: photo · hold click: video · F: selfie · V: put it away') : '📷 Camera put away'); }
// 🖼️ PC photos viewer (phone > Photos)
const photosEl = document.createElement('div'); photosEl.id = 'photos'; photosEl.className = 'hidden'; document.body.appendChild(photosEl);
let photoUrls = [];
async function openPhotos() {
  phone.el.classList.add('hidden');
  const list = await photoLib.list();
  photoUrls.forEach(u => URL.revokeObjectURL(u)); photoUrls = [];
  const items = list.map(it => { const u = URL.createObjectURL(it.thumb || it.blob); photoUrls.push(u); return `<div class="ph-shot"><img src="${u}"><span>${it.kind === 'video' ? '🎥 ' + (it.secs || 0) + 's' : '📸'} ${new Date(it.at).toLocaleString()}</span><div><button data-save="${it.id}">⬇ Save</button><button data-del="${it.id}">🗑</button></div></div>`; }).join('');
  photosEl.innerHTML = `<div class="cm-top"><b>🖼️ PHOTOS</b><span>${list.length ? 'Your last photos and videos (kept on this device). They were also saved to Downloads.' : 'No photos yet: press V to take out the camera.'}</span><button data-x>✖</button></div><div class="ph-grid">${items}</div>`;
  photosEl._list = list; photosEl.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closePhotos() { if (photosEl.classList.contains('hidden')) return; photosEl.classList.add('hidden'); if (G.view === 'playing' && !renderer.xr.isPresenting) desk.lock && desk.lock(); }
photosEl.addEventListener('mousedown', e => e.stopPropagation());
photosEl.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (e.target.closest('[data-x]')) return closePhotos();
  const sv = e.target.closest('[data-save]'), dl = e.target.closest('[data-del]');
  if (sv) { const it = photosEl._list.find(q => q.id === +sv.dataset.save); if (it) downloadBlob(it.blob, it.name); }
  if (dl) { await photoLib.remove(+dl.dataset.del); openPhotos(); }
});
document.addEventListener('keydown', (e) => { if (!photosEl.classList.contains('hidden') && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); closePhotos(); } }, true);

function rebuildLocalHands() {
  localAvatar.setCosmetics(myCos()); try { selfieAvatar.setCosmetics(myCos()); } catch {}
}

// ------------------------------------------------------------------ state
const RIDERS = new Map();
const G = { riders: RIDERS,
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
// ---------------------------------------------------------------- saved progress (signed save from the server)
const SAVE_KEY = 'cc_save';
function saveGet() { try { return localStorage.getItem(SAVE_KEY) || null; } catch { return null; } }
function saveSet(t) { try { if (t) localStorage.setItem(SAVE_KEY, t); else localStorage.removeItem(SAVE_KEY); } catch {} walletLine(); }
function walletLine() {
  const p = peekToken(saveGet()), el = document.getElementById('wallet-line');
  if (el) el.textContent = p ? `⭐ Level ${levelFromXp(p.xp)} · 💰 $${p.cash}${p.bank ? ` · 🏦 $${p.bank} saved` : ''} · ${fmtTime(p.stats.playSec)} played` : `New player? You start with $${START_CASH}.`;
  menu.syncCustom && menu.syncCustom();
}
// your level (from the server while playing, from your save in the menus)
function myXp() { return G.myXp !== undefined ? G.myXp : (peekToken(saveGet()) || { xp: 0 }).xp; }
function myLevel() { return levelFromXp(myXp()); }
function myCos() { const c = lockCos(profile.cos, myLevel()); if (c.outfit && G.wardrobe && !G.wardrobe.includes(c.outfit)) c.outfit = 0; return c; }   // what others see: locked items show as the default
const COS_NAMES = { hat: HATS, glasses: GLASSES, back: BACKS, head: HEADS, body: BODIES };
function nextUnlocks(lvl) {
  let best = null;
  for (const key of Object.keys(UNLOCKS)) for (const [idx, l] of Object.entries(UNLOCKS[key])) if (l > lvl && (!best || l < best.lvl)) best = { lvl: l, names: [] };
  if (!best) return null;
  for (const key of Object.keys(UNLOCKS)) for (const [idx, l] of Object.entries(UNLOCKS[key])) if (l === best.lvl) best.names.push(COS_NAMES[key][idx]);
  return best;
}
function showProgress() {
  const p = peekToken(saveGet());
  document.getElementById('pf-cash').textContent = '$' + (p ? p.cash : START_CASH);
  document.getElementById('pf-bank').textContent = '$' + (p ? p.bank : 0);
  const pr = levelProgress(p ? p.xp : 0);
  document.getElementById('pf-lvl').textContent = `⭐ Level ${pr.lvl}`;
  document.getElementById('pf-xpfill').style.width = Math.round(pr.frac * 100) + '%';
  document.getElementById('pf-xp').textContent = pr.lvl >= MAX_LEVEL ? 'MAX LEVEL' : `${pr.into} / ${pr.need} XP to level ${pr.lvl + 1}`;
  const next = nextUnlocks(pr.lvl);
  document.getElementById('pf-next').textContent = next ? `Next unlock at level ${next.lvl}: ${next.names.join(', ')}` : 'You have unlocked every item!';
  {
    const day = dayKey(), list = missionsFor(day), d = p && p.daily && p.daily.day === day ? p.daily : { prog: [0, 0, 0], done: [0, 0, 0], bonus: 0 };
    const wk = weekKey(), wl = weekliesFor(wk), w = p && p.weekly && p.weekly.wk === wk ? p.weekly : { prog: [0, 0, 0, 0], done: [0, 0, 0, 0], bonus: 0 };
    document.getElementById('pf-missions').innerHTML = missionsHtml({ list: list.map((m, i) => ({ ...m, prog: Math.min(m.goal, d.prog[i]), done: d.done[i] })), bonus: d.bonus, bonusCash: ALL_DONE_BONUS.cash, bonusXp: ALL_DONE_BONUS.xp, resetIn: secondsToReset() })
      + weeklyHtml({ list: wl.map((m, i) => ({ ...m, prog: Math.min(m.goal, w.prog[i]), done: w.done[i] })), bonus: w.bonus, bonusCash: WEEKLY_BONUS.cash, bonusXp: WEEKLY_BONUS.xp, resetIn: secondsToWeekReset() });
  }
  document.getElementById('pf-stats').innerHTML = STAT_KEYS.map(k => {
    const v = p ? p.stats[k] : 0;
    return `<div><span>${STAT_NAMES[k]}</span><b>${k === 'playSec' ? fmtTime(v) : k === 'earned' || k === 'spent' ? '$' + v : v}</b></div>`;
  }).join('');
}
setTimeout(walletLine, 0);
const menu = new Menu({
  onPlay: () => { if (!net.connected) return toast('Still connecting to the server...'); net.send({ type: 'quick', name: profile.name, cos: myCos(), role: profile.role, profile: saveGet() }); toast('Finding a match...'); },
  onJoin: (code) => { if (!net.connected) return menu.joinError('Not connected to the server yet.'); net.send({ type: 'join', code, name: profile.name, cos: myCos(), role: profile.role, profile: saveGet() }); },
  onCreate: (o) => { if (!net.connected) return toast('Still connecting to the server...'); net.send({ type: 'create', ...o, name: profile.name, cos: myCos(), role: profile.role, profile: saveGet() }); },
  onProgress: () => showProgress(),
  onBug: (text) => sendBug(text),
  onParty: (a, code) => partyAction(a, code),
  onGang: (g) => { if (G.room) setGang(g); },
  onTutorial: () => { try { localStorage.removeItem('cc_tut'); } catch {} G.tutPending = true; tut.stop(); toast(G.room ? '🎓 The tutorial starts as soon as you\'re back in the city' : '🎓 The tutorial will start when you join a game'); },
  level: () => myLevel(),
  wardrobe: () => G.wardrobe || [],
  onResetProgress: () => {
    const msg = document.getElementById('pf-msg');
    if (!G.resetArmed || performance.now() - G.resetArmed > 4000) { G.resetArmed = performance.now(); msg.textContent = 'Tap START OVER again to erase your saved cash and stats.'; return; }
    G.resetArmed = 0; saveSet(null); msg.textContent = 'Progress erased. You start fresh next game.'; showProgress();
  },
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
  onProfile: () => { rebuildLocalHands(); if (G.room) net.send({ type: 'cosmetics', cos: myCos(), name: profile.name }); }
});
menu.onScreen = onMenuScreen;


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
desk.onUnlock = () => { if (G.view === 'playing' && !shopMenu.isOpen() && !phone.isOpen() && !bigMap.isOpen() && photosEl.classList.contains('hidden')) setView('paused'); };   // the store panel frees the mouse without pausing
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
  shopMenu.close(); G.job = null; G.heist = null; G.boss = null; marker.hide(); tut.stop(); audio.stopCarRadio(); cleanupRoom();
}
function cleanupRoom() {
  photocam.setOn(false); closePhotos();
  G.gold = null; if (G.bcam) endBulletCam(); gold.skip();
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
  const rows = [...G.players.values()].map(p => ({ name: p.name, color: p.cos.color, kills: p.kills || 0, deaths: p.deaths || 0, team: p.team, me: p.id === G.room.you, connected: p.connected, host: p.id === G.room.hostId, vr: p.vr, cash: p.cash || 0, wanted: p.wanted || 0, lvl: p.lvl || 1, gang: p.gang || 0 }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return { players: rows, turf: [1, 2, 3, 4].map(g => turfView.zones.filter(z => z.owner === g).length), teams: MODES[G.room.mode].teams, teamScores: G.room.teamScores, killLimit: G.room.killLimit, mode: G.room.mode };
}
function lobbyModel() {
  return { ...G.room, isHost: G.room.hostId === G.room.you, players: [...G.players.values()].map(p => ({ ...p, host: p.id === G.room.hostId })) };
}
function refreshLobby() { if (G.room) menu.renderLobby(lobbyModel()); }
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function headWorld(out = new THREE.Vector3()) { return camera.getWorldPosition(out); }
function tutPos(xr) { if (!xr) return walker.feet.clone(); const h = headWorld(new THREE.Vector3()); return new THREE.Vector3(h.x, rig.position.y, h.z); }

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
  G.ride = m.ride ? { id: m.ride.car, seat: m.ride.seat } : null;
  G.me.wanted = me.wanted || 0;
  if (me.role && me.role !== profile.role) menu.setRole(me.role);
  menu.setGang(me.gang || 0);
  weapons.setInventory(m.inv);
  // prison state (also restores it after a reconnect)
  prison.reset(); if (cut.active && !m.jail) cut.stop();
  if (m.prison) prison.onState(m.prison, camera.getWorldPosition(new THREE.Vector3()));
  if (m.jail) { prison.onMe(m.jail); if (m.jail.state === 'cut') net.send({ type: 'skipCut' }); }
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
    if (m.w === 'golden') { gold.fire({ from, dir: end.clone().sub(from), lock: null, end, fly: m.fly, cam: false }); continue; }
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
// ---- Golden Sniper (these messages only ever come to ME, nobody else is told)
net.on('goldInfo', (m) => {
  G.gold = m;
  if (m.first) {
    const t = '🏆 SECRET UNLOCKED: GOLDEN SNIPER';
    hud.notice(t, 5000); vrui.setNotice('GOLDEN SNIPER UNLOCKED', 4); audio.playKill();
    const f = `🏆 (only you can see this) Buy the Golden Sniper at the GUN SHOP counter for $${m.price}`;
    hud.feed(esc(f), true); vrui.addFeed(`Golden Sniper: GUN SHOP $${m.price}`);
  }
});
net.on('goldBuy', (m) => {
  if (m.ok) { if (G.gold) G.gold.own = 1; const t = '🏆 GOLDEN SNIPER ACQUIRED'; hud.notice(t, 4000); vrui.setNotice(t, 3); audio.playKill(); vrInput.pulse('right', 1, 200); }
  else { toast('🏆 ' + m.why); vrui.setNotice(m.why, 2.5); shopMenu.say(m.why, false); }
  if (m.cash !== undefined) { const p = G.players.get(G.room?.you); if (p) p.cash = m.cash; }
});
net.on('goldShot', (m) => gold.confirm(m));
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
    const txt = m.w === 'arrest' ? `🚔 ${killer} ARRESTED ${victim}` : m.w === 'cop' ? `👮 Police took down ${victim}` : m.w === 'robber' ? `🦹 A robber took down ${victim}` : m.killer && m.killer !== m.victim ? `${killer} ${icon}${m.head ? ' 🎯' : ''} ${victim}` : `${victim} ${icon} wiped out`;
    hud.feed(esc(txt), m.killer === G.room.you || m.victim === G.room.you); vrui.addFeed(txt);
  }
  if (m.victim === G.room.you) {
    G.me.alive = false; G.me.hp = 0;
    G.death = { by: m.w === 'arrest' ? `${killer} 🚔 (ARRESTED)` : m.w === 'cop' ? 'the Police 👮' : m.w === 'robber' ? 'a Robber 🦹' : m.killer && m.killer !== m.victim ? killer : null, t: m.respawnIn };
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
  G.me.armor = 0; boosts.setBoost(null); shopMenu.close(); G.heist = null;
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
  { const mine = m.car && m.car[12] === G.room?.you; if (mine && G.radioStation === undefined) G.radioStation = 'CHAOS FM'; radioAuto(mine || !!G.radioStation); }
  const t = renderer.xr.isPresenting ? 'Right trigger: gas · Left trigger: brake · B: get out' : 'W/S drive · A/D steer · E to get out';
  hud.notice('🚗 ' + (m.hijacked ? 'CARJACKED!' : 'Driving'), 1500); vrui.setNotice(t, 3);
  if (!renderer.xr.isPresenting) toast(t, 4000);
});
// ---------------------------------------------------------------- 📻 car radio + city sounds
function radioNext() { const st = audio.nextStation(); G.radioStation = st; const t = st ? `📻 ${st}  (${renderer.xr.isPresenting ? 'X' : 'N'}: next station)` : '📻 Radio off'; hud.notice(t, 1600); vrui.setNotice(t, 1.6); }
function radioAuto(on) {
  if (!on) { audio.stopCarRadio(); return; }
  if (G.radioStation !== null) { const i = audio.STATIONS.findIndex(s => s.name === G.radioStation); audio.startCarRadio(i >= 0 ? i : 0); G.radioStation = audio.carRadioStation(); }
}
G.radioStation = undefined;   // undefined = never touched (starts on in your own car), null = you turned it off
{
  const D = map.districts || [], BS = map.blockStarts || [], BK = map.block || 44;
  const district = (x, z) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (x >= BS[c] && x < BS[c] + BK && z >= BS[r] && z < BS[r] + BK) return D[r] && D[r][c]; return null; };
  audio.AMB.parkAt = (x, z) => district(x, z) === 'park';
  audio.AMB.downtownAt = (x, z) => district(x, z) === 'downtown' || district(x, z) === 'shopping';
}
net.on('carExit', (m) => {
  if (m.pid !== G.room?.you || !driving.active) return;
  const c = driving.car; driving.exit(); audio.stopCarRadio();
  const door = cars.doorWorld(c);
  door.y = c.y + 0.1;
  if (renderer.xr.isPresenting) teleport(door, c.yaw); else { walker.feet.copy(door); walker.vel.set(0, 0, 0); G.yaw = c.yaw; G.pitch = 0; }
});
net.on('carRide', (m) => {
  if (m.on) G.riders.set(m.pid, { id: m.id, seat: m.seat });
  else { G.riders.delete(m.pid); const q = remote.players.get(m.pid); if (q) q.avatar.root.position.set(0, 0, 0); }
  if (m.pid !== G.room?.you) return;
  if (m.on) {
    G.ride = { id: m.id, seat: m.seat }; G.lastCarYaw = undefined;
    const t = renderer.xr.isPresenting ? 'Getaway ride! Shoot with the trigger · B: get out' : 'Getaway ride! Click to shoot · E: get out';
    hud.notice('🚗 GETAWAY RIDE', 1500); vrui.setNotice('GETAWAY RIDE! B: get out', 3); audio.playDoor();
    if (!renderer.xr.isPresenting) toast(t, 4000);
    return;
  }
  const car = cars.get(m.id) || (G.ride && cars.get(G.ride.id));
  G.ride = null; G.lastCarYaw = undefined;
  if (!car) return;
  // step out of the door on your side of the car
  const local = RIDE_SEATS[m.seat] || RIDE_SEATS[0];
  const door = new THREE.Vector3(Math.sign(local.x) * 2.1, 0, local.z).applyAxisAngle(UP, car.yaw);
  door.x += car.x; door.y = car.y + 0.1; door.z += car.z;
  audio.playDoor();
  if (renderer.xr.isPresenting) teleport(door, car.yaw); else { walker.feet.copy(door); walker.vel.set(0, 0, 0); }
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
  if (m.id === G.room?.you && m.wanted > (G.me.wanted || 0)) { const t = `${'★'.repeat(m.wanted)} ${WANTED_TEXT[m.wanted]}${m.reason ? ' (' + m.reason + ')' : ''}`; hud.notice(t, 2200); vrui.setNotice(t, 2.2); }
  remote.setWanted(m.id, m.wanted);
  if (isCop() && m.id !== G.room?.you && m.wanted > 0 && p) { const t = `🚨 ${p.name} is WANTED ${'★'.repeat(m.wanted)}`; hud.feed(esc(t), true); vrui.addFeed(t); }
  if (m.id !== G.room?.you) return;
  const before = G.me.wanted; G.me.wanted = m.wanted;
  if (m.wanted === 0 && before > 0 && m.reason === 'lost') { hud.notice('😎 You lost the cops!', 2000); vrui.setNotice('You lost the cops!', 2); }
});
// police / roles
net.on('robAlert', (m) => {
  const t = m.crook ? (m.shop === 'a car' ? '🚨 A car thief just stole a car!' : `🚨 A robber is holding up ${m.shop}!`) : `🚨 ${nameOf(m.by)} is robbing ${m.shop}!`;
  hud.notice(t, 2500); vrui.setNotice(t, 2.5); hud.feed(esc(t), true); vrui.addFeed(t);
  audio.playSiren(null); vrInput.pulse('left', 0.6, 100);
});
// NPC bad guys: robbers + car thieves
net.on('crook', (m) => {
  const me = G.room?.you, cop = isCop();
  let t = null, mine = false;
  switch (m.ev) {
    case 'rob': if (!cop) t = `🦹 A robber is holding up ${m.shop}!`; break;          // cops get the robAlert instead
    case 'robbed': t = `💰 A robber emptied the register at ${m.shop} ($${m.cash})`; break;
    case 'car': if (!cop) t = '🦹 A car thief stole a car!'; break;
    case 'escaped': t = `🦹 A robber got away with $${m.cash}`; break;
    case 'down': t = '👮 Police took down a robber'; break;
    case 'arrested': mine = m.by === me; t = m.by ? `🚔 ${nameOf(m.by)} arrested a robber` : '🚔 Police arrested a robber'; if (mine) audio.playCuffs(); break;
    case 'bounty': {
      const p = G.players.get(me); if (p) p.cash = m.total;
      const n = `+$${m.cash} ${m.arrest ? 'ARREST' : 'BOUNTY'}${m.loot ? ` (incl. $${m.loot} stolen cash)` : ''}`;
      hud.notice('🦹 ' + n, 2500); vrui.setNotice(n, 2.5); audio.playCash(); vrInput.pulse('right', 0.7, 90);
      return;
    }
  }
  if (t) { hud.feed(esc(t), mine); vrui.addFeed(t); }
});
net.on('penalty', (m) => { const t = `👮 -$${m.amt}: ${m.reason}`; hud.notice(t, 1800); vrui.setNotice(t, 1.8); const p = G.players.get(G.room?.you); if (p) p.cash = Math.max(0, (p.cash || 0) - m.amt); });
net.on('dispatch', (m) => { if (m.target === G.room?.you) { hud.notice('🚓 A POLICE CAR IS ON THE WAY!', 2000); vrui.setNotice('POLICE CAR ON THE WAY!', 2); } });
net.on('copsOut', (m) => { const c = cars.get(m.id); if (c) audio.playDoor(); });
net.on('siren', (m) => { const c = cars.get(m.id); if (c) { c.siren = m.on; c.sirenT = 0; } });
// ------------------------------------------------------------------ arrests + prison
net.on('tp', (m) => { G.me.life = m.life; if (cut.active) pendingTp = m; else applyTp(m); });
net.on('arrestCut', (m) => {
  if (driving.active) driving.exit();
  prison.me = { state: 'cut', cell: m.cell, items: [], pflags: [], baskets: 0 };
  G.arrestBar = null; G.prompt = null; vrui.notice = null; vrui.feed = [];
  const xr = renderer.xr.isPresenting;
  cut.start(m, { xr, cos: { ...myCos() }, name: profile.name, skipLabel: xr ? 'Press B to skip' : 'SPACE to skip' });
});
net.on('jailStart', () => { cut.serverDone = true; if (prison.me) prison.me.state = 'in'; G.me.hp = MAX_HEALTH; G.me.alive = true; G.death = null; });
net.on('pMe', (m) => prison.onMe(m));
net.on('pState', (m) => prison.onState(m, camera.getWorldPosition(new THREE.Vector3())));
net.on('pHold', (m) => prison.onHold(m));
net.on('pMsg', (m) => prison.say(esc(m.text), 3800));
net.on('pTalkMsg', (m) => { prison.say(`<b>${esc(m.name)}:</b> ${esc(m.text)}`, 9000); audio.playHover(); });
net.on('pSay', (m) => npcs.say(m.id, m.text, 2600, '#34495e'));
net.on('npcSay', (m) => npcs.say(m.id, m.text, 2600, '#1f3a93'));
net.on('pAnnounce', (m) => { if (prison.prisoner || prisonView.active) { audio.playChime(); prison.say('📢 ' + esc(m.text), 6000); } });
net.on('pAlarm', (m) => {
  if (!(prison.prisoner || prisonView.active)) return;
  if (m.on) { hud.notice('⚠ ALARM! ' + (m.reason || ''), 2500); vrui.setNotice('⚠ ALARM!', 2.5); audio.playAlarm(); }
  else { hud.notice('Alarm cleared', 1500); vrui.setNotice('Alarm cleared', 1.5); }
});
net.on('pCaught', (m) => {
  hud.notice('🚨 CAUGHT! Back to your cell', 2600); vrui.setNotice('CAUGHT! Back to your cell', 2.6); audio.playCellDoor(null);
  if (m.items) prison.say('The guards confiscated everything you were carrying.', 4500);
});
net.on('pShock', (m) => {
  audio.playShock(); hud.notice('⚡ ZAP!', 1200); vrui.setNotice('⚡ ZAP!', 1.2); vrInput.pulse('left', 1, 300); vrInput.pulse('right', 1, 300);
  const v = new THREE.Vector3(...m.push);
  if (renderer.xr.isPresenting) { vrMover.reset(); rig.position.addScaledVector(v, 0.25); } else walker.vel.copy(v);
});
net.on('pScore', (m) => {
  if (m.by === G.room?.you) { hud.notice(`🏀 SWISH! ${m.n} basket${m.n > 1 ? 's' : ''}`, 1600); vrui.setNotice(`🏀 SWISH! (${m.n})`, 1.6); }
  if (prisonView.active) audio.playSwish();
});
net.on('pBall', (m) => prisonView.pushBall({ ...m, st: m.st || net.serverNow() }));
net.on('arrested', (m) => {
  const who = nameOf(m.id), by = m.by ? nameOf(m.by) : 'the police';
  const txt = m.prison ? `🚔 ${who} was arrested by ${by} and sent to PRISON` : `🚔 ${who} was arrested by ${by}`;
  hud.feed(esc(txt), m.id === G.room?.you || m.by === G.room?.you); vrui.addFeed(txt);
  if (m.scores) for (const [id, k, d, c] of m.scores.p) { const p = G.players.get(id); if (p) { p.kills = k; p.deaths = d; p.cash = c || 0; } }
  if (m.by === G.room?.you) { hud.notice(`🚔 ARREST! +$${m.stars * 200}`, 1800); vrui.setNotice('ARREST!', 1.8); audio.playCash(); }
  if (m.id === G.room?.you) { G.arrestBar = null; audio.playCuffs(); }
});
net.on('arrestShort', (m) => { hud.notice(`🚔 ARRESTED! Holding cell for ${m.t}s`, 3000); vrui.setNotice(`ARRESTED! Holding cell ${m.t}s`, 3); prison.say('Under 3 stars: a short stay in the police station holding cell.', 5000); });
net.on('released', () => { hud.notice('Released. Stay out of trouble!', 2200); vrui.setNotice('Released!', 2); });
net.on('escaped', (m) => {
  const txt = `🔓 ${nameOf(m.id)} ESCAPED FROM PRISON (${m.how})!`;
  hud.feed(esc(txt), m.id === G.room?.you); vrui.addFeed(txt);
  if (m.id === G.room?.you) {
    prison.me = null; prison.hold = null;
    hud.notice('🔓 PRISON ESCAPE SUCCESSFUL!', 4000); vrui.setNotice('PRISON ESCAPE SUCCESSFUL!', 4);
    prison.say('★★★★★ Every cop in the city is looking for you. Hide and lose them!', 6000);
    audio.playWin(); audio.playSiren(null);
  }
});
net.on('arrestAttempt', (m) => { G.arrestBar = { start: performance.now() / 1000, dur: m.t }; vrInput.pulse('left', 0.8, 200); vrInput.pulse('right', 0.8, 200); audio.playCuffs(); });
net.on('arrestResist', () => { G.arrestBar = null; hud.notice('You resisted arrest! +1 ★', 1800); vrui.setNotice('RESISTED ARREST +1★', 1.8); });
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
    if (t - lastErrAt > 5000) { lastErrAt = t; reportError('frame: ' + (e && e.message || e), '', 0, e && e.stack); }
    try { desk.endFrame(); renderer.render(scene, camera); } catch {}
  }
}

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

  if (cut.active) runCutscene(dt, xr);
  else if (G.bcam) runBulletCam(dt, xr);
  else if (xr) {
    if (pendingVRTeleport) { teleport(pendingVRTeleport.p, pendingVRTeleport.yaw); pendingVRTeleport = null; rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera); }
    const s = vrInput.update();
    const L = s.left, R = s.right;
    if (!isGorillaBody()) trackRealHeight(); // Gorilla body has no feet, so no height offset to calibrate
    const head = headWorld(new THREE.Vector3());
    // menu
    if (L.pressed.b) { if (vrui.menuOpen) { vrui.closeMenu(); shopMenu.close(); G.vrMissions = false; G.vrEmotes = false; G.vrLeaders = false; } else if (inRoom) { G.vrMissions = false; G.vrEmotes = false; G.vrLeaders = false; vrui.openMenu(menuModel()); } }
    if (inRoom && G.me.alive) { const t2 = performance.now() / 1000; detectWave(handR.getWorldPosition(new THREE.Vector3()), head, t2); }
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
    } else if (inRoom && G.me.alive && G.ride && rideCar()) {
      // ---- VR passenger (getaway ride): the car carries you, you're free to look around and shoot
      const car = rideCar();
      if (G.lastCarYaw === undefined) G.lastCarYaw = car.yaw;
      const dyaw = Math.atan2(Math.sin(car.yaw - G.lastCarYaw), Math.cos(car.yaw - G.lastCarYaw)); G.lastCarYaw = car.yaw;
      if (dyaw) { const h = headWorld(new THREE.Vector3()); rig.position.sub(h).applyAxisAngle(UP, dyaw).add(h); rig.rotation.y += dyaw; rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera); }
      const seat = rideSeatWorld(car); const h2 = headWorld(new THREE.Vector3());
      rig.position.add(seat.sub(h2));
      vrMover.reset();
      G.vrSpeed = Math.abs(car.speed || 0);
    } else if (inRoom && G.me.alive) {
      const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const stick = new THREE.Vector3().addScaledVector(right, L.stick.x).addScaledVector(fwd, -L.stick.y);
      const before = rig.position.clone();
      vrMover.gorilla.capScale = boosts.speedMul();
      const ev = vrMover.update(dt, rig, head, hands, { mode: settings.moveMode, stick: settings.moveMode === 'gorilla' ? null : stick.multiplyScalar(boosts.speedMul()), jump: L.pressed.a, armBoost: settings.armBoost * boosts.speedMul(), floorOffset: vrFloorOffset(), gt: isGorillaBody() });
      for (const tp of ev.taps) { audio.playTap(tp.pos, tp.speed); vrInput.pulse(tp.i === 0 ? 'left' : 'right', Math.min(1, 0.15 + tp.speed * 0.1), 25); }
      if (ev.step) audio.playStep(null, 0.7);
      if (ev.landed > 5) audio.playStep(null, 1.4);
      clampRig();
      // safety net: if you ever end up under the map, go back to the last spot you stood safely
      { const h2 = headWorld(new THREE.Vector3());
        if (h2.y < fallY(h2.x, h2.y - 1.5, h2.z)) { rig.position.copy(G.vrSafe || rig.position); vrMover.reset(); }
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
    { const shown = inRoom && G.me.alive && !vrui.menuOpen ? phone.updateVR(lc && lc.grip, rc && rc.grip, headWorld(new THREE.Vector3()), dt) : phone.updateVR(null); vrui.wrist.mesh.visible = !shown && vrui.visible; if (typeof shown === 'string') vrInput.pulse('right', 0.5, 40); }
    // menu pointer
    if (shopMenu.vrOpen && !vrui.menuOpen) shopMenu.close();
    if (shopMenu.vrOpen) { shopMenu.update(head, G.me.alive); if (shopMenu.vrOpen) vrui.model = shopMenu.vrModel(); else vrui.closeMenu(); }
    if (vrui.menuOpen) {
      const act = vrui.updatePointer(R.pressed.trigger);
      if (act) menuAction(act);
    } else if (canAct && driving.active) {
      if (R.pressed.b) net.send({ type: 'exitCar' });
      if (R.pressed.a) audio.playHonk(null);
      if (L.pressed.x) radioNext();
      const pc = cars.get(driving.car.id);
      if (pc && pc.police && L.pressed.a) net.send({ type: 'siren', on: !pc.siren });
      G.prompt = `${pc && pc.police ? '🚓' : '🚗'} ${Math.round(Math.abs(driving.car.speed) * 3.6)} km/h · B: get out · A: honk${pc && pc.police ? ' · X: siren' : ''}`;
    } else if (canAct) {
      // weapons
      weapons.tryFire(R.trigger > 0.6, R.pressed.trigger);
      if (photocam.on) { photocam.input(R.trigger > 0.6, performance.now() / 1000, R.pressed.trigger); if (R.pressed.a) photocam.flip(); }
      else if (R.pressed.a) weapons.reload();
      if (R.pressed.b) { if (G.ride) net.send({ type: 'exitCar' }); else if (photocam.on) { photocam.setOn(false); camNote('📷 Camera put away'); } else weapons.cycle(1); }
      let prompt = null; G.arrestPrompt = false;
      // arrest: cops grab a wanted player with either hand
      if (isCop()) for (const [side, ctl, st] of [['left', lc, L], ['right', rc, R]]) {
        if (!ctl || prompt) continue; // arresting beats grabbing pickups
        const hp = ctl.grip.getWorldPosition(new THREE.Vector3());
        const q = arrestTarget(hp, 1.0, true);
        const crook = !q ? crookNear(hp, 1.1, true) : null;
        if (crook) {
          prompt = '🚔 Grip the robber to ARREST him'; G.arrestPrompt = true;
          if ((st.pressed.grip || st.held.grip) && t - (G.arrestAt || 0) > 0.8) { G.arrestAt = t; net.send({ type: 'arrestCrook', id: crook.id }); vrInput.pulse(side, 0.9, 120); }
          continue;
        }
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
        if (!car || G.ride || (car.driverKind === DRIVER.PLAYER && !canRide(car)) || hp.y > car.y + 2.2) continue;
        prompt = carPrompt(car, 'Grip');
        if ((st.pressed.grip || st.held.grip) && t - (G.hijackAt || 0) > 0.8) { G.hijackAt = t; net.send({ type: 'hijack', id: car.id }); vrInput.pulse(side, 0.6, 60); }
      }
      // CITY BANK vault (drill with grip held, grab the cash with grip)
      if (!prompt && !G.ride) { const v = vaultInteract(head, L.held.grip || R.held.grip, L.pressed.grip || R.pressed.grip, true, t); if (v) prompt = v; }
      if (!prompt && !G.ride) { const v = aptInteract(new THREE.Vector3(head.x, rig.position.y, head.z), L.pressed.grip || R.pressed.grip, true); if (v) prompt = v; }
      if (!prompt && !G.ride) { const v = giftInteract(new THREE.Vector3(head.x, rig.position.y, head.z), L.pressed.grip || R.pressed.grip, true); if (v) prompt = v; }
      // stores: squeeze grip near a shopkeeper to open the store (the Golden Sniper is sold in the GUN SHOP list)
      const store = !prompt && !G.ride && !vrui.menuOpen ? shopMenu.near(head) : null;
      if (store) {
        const why = shopMenu.status(store);
        prompt = why ? `🛒 ${why}` : shopMenu.promptFor(store.name, true);
        if (!why && (L.pressed.grip || R.pressed.grip) && t - (G.buyAt || 0) > 0.6) { G.buyAt = t; shopMenu.openVR(store.name); vrui.openMenu(shopMenu.vrModel()); vrInput.pulse('right', 0.3, 30); }
      }
      // Golden Sniper: flick the right stick up/down to change the scope zoom
      if (weapons.current && weapons.current.w === 'golden') {
        if (Math.abs(R.stick.y) > 0.75 && G.zoomReady !== false) { gold.zoom = R.stick.y < 0 ? 1 : 0; G.zoomReady = false; vrInput.pulse('right', 0.2, 20); }
        if (Math.abs(R.stick.y) < 0.3) G.zoomReady = true;
      }
      G.prompt = prompt;
    } else G.prompt = null;
  } else {
    // ---------------------------------------------------------------- desktop
    if (G.view === 'playing') {
      if (emoteWheel(desk.down('KeyG') && !!G.room && G.me.alive, desk.mouse.dx, desk.mouse.dy)) { desk.mouse.dx = 0; desk.mouse.dy = 0; }
      const zs = G.scoped ? camera.fov / settings.fov : 1; // slower aim while zoomed in
      G.yaw -= desk.mouse.dx * 0.0022 * settings.mouseSens * zs;
      G.pitch = THREE.MathUtils.clamp(G.pitch - desk.mouse.dy * 0.0022 * settings.mouseSens * zs, -1.5, 1.5);
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
      if (playing && desk.hit('KeyN')) radioNext();
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
      const ev = G.ride && rideCar() ? rideHold() : walker.update(dt, { wish: w, sprint: k('ShiftLeft') || k('ShiftRight'), jump: playing && desk.hit('Space'), jumpHeld: k('Space'), climb: k('KeyW') ? 1 : k('KeyS') ? -1 : (k('Space') ? 1 : 0), canClimb: !prisonView.active && !prison.prisoner });
      if (ev.step) audio.playStep(null, 0.8);
      if (ev.landed) audio.playStep(null, Math.min(1.6, ev.landed / 6));
      moving = wish.lengthSq() > 0.01 && walker.grounded;
      clampWalker();
      if (walker.feet.y < fallY(walker.feet.x, walker.feet.y, walker.feet.z)) { walker.feet.copy(G.deskSafe || walker.feet.set(0, 1, 0)); walker.vel.set(0, 0, 0); }
      else if (walker.grounded) (G.deskSafe ||= new THREE.Vector3()).copy(walker.feet);
      rig.position.copy(walker.feet); rig.rotation.set(0, G.yaw, 0);
      camera.position.set(0, walker.height - 0.05, 0);
      camera.rotation.set(G.pitch, 0, 0);
      if (playing && !G.matchEnd) {
        weapons.tryFire(desk.mouse.left, desk.mouse.leftPressed);
        if (desk.hit('KeyR')) weapons.reload();
        if (desk.hit('KeyC')) callMyCar();
        if (desk.hit('KeyP')) phone.toggle();
        if (desk.hit('KeyM')) { phone.el.classList.add('hidden'); bigMap.open(); }
        if (desk.hit('KeyV')) toggleCamera();
        if (photocam.on) { photocam.input(desk.mouse.left && !driving.active, performance.now() / 1000, desk.mouse.leftPressed && !driving.active); if (desk.hit('KeyF')) photocam.flip(); }
        if (photocam.on && !G.ew && (desk.hit('Digit1') || desk.hit('Digit2') || desk.hit('Digit3') || desk.hit('KeyQ'))) photocam.setOn(false);
        if (!G.ew && desk.hit('Digit1')) weapons.switchTo(0);
        if (!G.ew && desk.hit('Digit2')) weapons.switchTo(1);
        if (!G.ew && desk.hit('Digit3')) weapons.switchTo(2);
        if (desk.hit('KeyQ')) weapons.cycle(-1);
        if (desk.mouse.wheel && G.scoped) gold.zoom = desk.mouse.wheel < 0 ? 1 : 0;   // scroll = scope zoom
        else if (desk.mouse.wheel) weapons.cycle(desk.mouse.wheel > 0 ? 1 : -1);
        const eye = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
        const it = G.ride ? null : pickups.aimed(eye, dir, 3);
        let store = null, vault = null;
        G.prompt = it ? `Press E to pick up ${pickups.label(it)}` : photocam.on ? (photocam.recording ? '🔴 Recording · let go of the mouse to stop' : '📷 Click: photo · hold: video · F: selfie · V: put away') : null;
        const perp = isCop() ? arrestTarget(walker.feet.clone().setY(walker.feet.y + walker.height - 0.1), 2.4, false) : null;
        const crook = !perp && isCop() ? crookNear(walker.feet.clone().setY(walker.feet.y + walker.height - 0.1), 2.6) : null;
        if (perp) { G.prompt = `🚔 Press E to ARREST ${perp.info.name}`; if (desk.hit('KeyE')) net.send({ type: 'arrest', id: perp.info.id }); }
        else if (crook) { G.prompt = `🚔 Press E to ARREST the robber${crook.state === 2 ? ' (he gave up)' : ''}`; if (desk.hit('KeyE')) net.send({ type: 'arrestCrook', id: crook.id }); }
        else if (it) { it.highlight = 1; if (desk.hit('KeyE')) net.send({ type: 'pickup', id: it.def.id }); }
        else if (!G.ride && (vault = vaultInteract(eye, desk.down('KeyE'), desk.hit('KeyE'), false, t))) G.prompt = vault;
        else if (!G.ride && (vault = aptInteract(walker.feet, desk.hit('KeyE'), false))) G.prompt = vault;
        else if (!G.ride && (vault = giftInteract(walker.feet, desk.hit('KeyE'), false))) G.prompt = vault;
        else if (!G.ride && (store = shopMenu.near(eye))) {
          const why = shopMenu.status(store);
          G.prompt = shopMenu.isOpen() ? null : why ? `🛒 ${why}` : shopMenu.promptFor(store.name, false);
          if (!why && !shopMenu.isOpen() && desk.hit('KeyE') && performance.now() - (shopMenu.closedAt || 0) > 300) shopMenu.openPC(store.name);
        }
        else {
          const car = cars.nearest(walker.feet.clone().setY(walker.feet.y + 0.5), 3.9);
          if (G.ride) {
            G.prompt = '🚗 Getaway ride · click to shoot · E: get out';
            if (desk.hit('KeyE')) net.send({ type: 'exitCar' });
          } else if (car && (car.driverKind !== DRIVER.PLAYER || canRide(car))) {
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

  // ---- Golden Sniper: scope zoom (desktop right click), ESP outlines, lock-on
  const goldHeld = inRoom && G.me.alive && !G.matchEnd && weapons.current && weapons.current.w === 'golden' && !driving.active && !cut.active && !prison.prisoner && !G.bcam;
  const scopeFov = goldHeld ? WEAPONS.golden.scopeFov[gold.zoom] : null;
  G.scoped = !!(scopeFov && !xr && G.view === 'playing' && desk.mouse.right && !weapons.reloading);
  if (!xr) {
    const wantFov = G.scoped ? scopeFov : settings.fov;
    if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
  }
  if (G.scoped && goldHeld) camera.layers.enable(ESP_LAYER); else camera.layers.disable(ESP_LAYER);
  document.body.classList.toggle('scoped', G.scoped); scopeEl.classList.toggle('hidden', !G.scoped);
  weapons.lockCone = xr ? 3 : G.scoped ? Math.max(0.8, camera.fov * 0.18) : 2;
  { const o = new THREE.Vector3(), d = new THREE.Vector3(); if (goldHeld && weapons.model) weapons.aim(o, d);
    gold.update(dt, { held: goldHeld && !!weapons.model, o, d, cone: weapons.lockCone, show: xr || G.scoped }); }
  if (goldHeld && gold.lock) {
    const lk = `🎯 LOCKED: ${gold.lock.kind === 'p' ? (G.players.get(gold.lock.id)?.name || 'Player') : gold.lock.name} · ${Math.round(gold.lock.dist)} m`;
    if (G.scoped) document.getElementById('scopeLock').textContent = lk; else if (!G.prompt) G.prompt = lk;
  } else if (G.scoped) document.getElementById('scopeLock').textContent = '';
  if (G.scoped) document.getElementById('scopeZoom').textContent = `${Math.round(settings.fov / camera.fov)}x`;
  if (G.blink > 0) { G.blink = Math.max(0, G.blink - dt * 4); blink.visible = true; blink.material.opacity = Math.min(1, G.blink * 1.4); } else blink.visible = false;
  bulletCamEl.classList.toggle('hidden', !(G.bcam && !G.bcam.xr));
  if (xr) { const riding = !!(G.bcam && G.bcam.xr); vrHolder.visible = !riding; handL.visible = !riding; } // hands + gun stay behind while you ride the bullet
  if (weapons.model) weapons.model.visible = !driving.active && !cut.active && !G.scoped && !(G.bcam && G.bcam.xr);
  if (xr) { const sc = weapons.model && weapons.model.userData.scope; vrui.ammo.mesh.position.set(sc ? 0.085 : 0, sc ? 0.06 : 0.12, 0.06); } // keep the ammo badge out of the scope view
  if (!cut.active && inRoom) prisonInteract(dt, t, xr);
  weapons.update(dt, moving);
  if (G.death) G.death.t -= dt;
  boosts.tickBoost();
  bankView.update(dt, t);
  raceView.update(t);
  if (phone.isOpen()) phone.render();
  updateMinimap(t, xr);
  seasonView.update(dt, t, camera.getWorldPosition(_seasonCam));
  dayNight.update(dt, _seasonCam, cars.map, seasonView.on);
  Driving.weatherGrip = weather.update(dt, _seasonCam, weather.pick(Date.now() + dayNight.offset, G.fixedWeather, seasonView.on), dayNight, engine.sun, engine.hemi);
  aptView.update(xr ? headWorld(new THREE.Vector3()).setY(rig.position.y) : walker.feet);
  turfView.update(t);
  if (G.tutPending && canAct && !prison.prisoner && !cut.active && (xr || G.view === 'playing')) { G.tutPending = false; tut.start(xr, tutPos(xr)); }
  if (tut.active) { if (!inRoom) tut.stop(); else if (G.me.alive && !cut.active) tut.update({ pos: tutPos(xr), board: xr ? vrui.menuOpen : G.showBoard, shop: shopMenu.shop, t }); }
  if (raceView.target()) marker.show(raceView.target(), `🏁 ${raceView.cp + 1}`, 0x00e5ff);
  else if (G.job && G.job.target) marker.show(G.job.target, G.job.kind === 'taxi' ? (G.job.phase === 'pickup' ? '🙋 PASSENGER' : '🚕 STOP') : (G.job.phase === 'pickup' ? '🍔 PICK UP' : '📦 DELIVER'), G.job.phase === 'pickup' ? 0x3ae374 : 0xffd23f);
  else if (G.gps && Math.hypot(G.gps.p[0] - rig.position.x, G.gps.p[2] - rig.position.z) < 6 && !driving.active) { toast(`📍 You've arrived at ${G.gps.label}`); vrui.setNotice(`Arrived: ${G.gps.label}`, 2); G.gps = null; phone.gpsArrived(); marker.hide(); }
  else if (G.boss && npcs.map.get(G.boss.id)?.alive) { const n = npcs.map.get(G.boss.id); marker.show([n.x, n.y, n.z], '👑 BOSS', 0xffd23f); }
  else if (tut.target()) marker.show(tut.target(), '💼 JOBS', 0x00b4d8);
  else if (G.gps) marker.show(G.gps.p, '📍 ' + G.gps.label.split(' ').slice(1).join(' '), 0x8338ec);
  else if (G.carBeacon && t < G.carBeacon.until && !driving.active) { const c = cars.get(G.carBeacon.id); if (c && Math.hypot(c.x - rig.position.x, c.z - rig.position.z) < 4) G.carBeacon = null; else marker.show(c ? [c.x, c.y, c.z] : G.carBeacon.at, '🔑 YOUR CAR', 0xff4fa3); }
  else marker.hide();
  marker.update(t, camera.getWorldPosition(new THREE.Vector3()));
  // VR: the job / getaway line shows as a notice now and then (there's no HUD line in the headset)
  if (xr && inRoom) { const tl = taskLine(camera, true) || bossLine(); if (tl && (tl.split(' · ')[0] !== G.vrTaskKey || t - (G.vrTaskAt || 0) > 9)) { G.vrTaskKey = tl.split(' · ')[0]; G.vrTaskAt = t; vrui.setNotice(tl, 2.6); } }
  if (!xr && shopMenu.isOpen()) shopMenu.update(camera.getWorldPosition(new THREE.Vector3()), G.me.alive && inRoom && !driving.active && !G.ride);
  updateRobbery(t, canAct && !driving.active && !cut.active && !prison.prisoner && !(xr && vrui.menuOpen) && (xr || G.view === 'playing'));

  // send my pose 20x per second
  if (inRoom && !cut.active && !(G.bcam && G.bcam.xr) && t - G.lastSend > 1 / 20) { G.lastSend = t; sendState(xr); }

  remote.update(dt, net.serverNow());
  // friends riding in a car: pin their avatar to the seat of the (interpolated) car so they don't trail behind it
  for (const [pid, r] of G.riders) {
    const q = remote.players.get(pid), car = cars.get(r.id);
    if (!q || !car || !q.head) continue;
    const s = rideSeatWorld(car, r.seat);
    q.avatar.root.position.set(s.x - q.head[0], s.y - q.head[1], s.z - q.head[2]);
  }
  for (const [id, p] of remote.players) if (p.head) voice.setPosition(id, p.head[0], p.head[1], p.head[2]);
  const viewCam = G.bcam && !G.bcam.xr ? gold.cam : camera; // desktop bullet cam renders from its own camera
  const camPos = viewCam.getWorldPosition(new THREE.Vector3());
  pickups.update(dt, t, camPos);
  npcs.cull = G.scoped ? 320 : G.bcam ? 140 : goldHeld && xr ? 160 : xr ? 34 : 50; // far NPCs must show up in the scope
  npcs.rain = weather.w; npcs.update(dt, net.serverNow(), camPos);
  cars.rideId = G.ride ? G.ride.id : 0;
  cars.update(dt, net.serverNow(), camPos, driving.car, xr);
  city.update(camPos, net.serverNow(), dt);
  prisonView.update(dt, net.serverNow(), camPos, { prisoner: prison.prisoner, myBall: prison.ballHeld && xr, handPos: G.ballHandPos });
  if (prisonView.active) prison.tick(dt);
  effects.update(dt);
  sky.position.copy(camPos);
  engine.followSun(camPos);
  const camQ = viewCam.getWorldQuaternion(new THREE.Quaternion());
  audio.setListener(camPos, new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), new THREE.Vector3(0, 1, 0).applyQuaternion(camQ));

  if (inRoom) {
    const ws = weapons.current;
    const st = {
      dt, hp: G.me.hp, armor: G.me.armor || 0, boost: Math.ceil(boosts.boostLeft()), lvl: G.room ? levelProgress(myXp()) : null, weapon: ws, slots: weapons.slots, cur: weapons.cur, reloading: weapons.reloading, reloadP: weapons.reloadProgress(),
      timer: G.matchEnd ? fmt((G.matchResetAt - t)) : fmt(G.remaining), teams: MODES[G.room.mode].teams, teamScores: G.room.teamScores,
      kills: G.players.get(G.room.you)?.kills || 0, deaths: G.players.get(G.room.you)?.deaths || 0,
      prompt: G.prompt, death: G.death, driving: driving.active, cash: G.players.get(G.room.you)?.cash || 0, wanted: G.me.wanted,
      rob: G.arrestBar ? arrestBarState(t) : G.rob && t - G.rob.at < 0.9 ? G.rob : null,
      prison: prison.prisoner && !cut.active ? prison.panel(G.players.get(G.room.you)?.jail === 3) : null, sub: prison.sub && !cut.active ? prison.sub.text : null, showBoard: G.showBoard || !!G.matchEnd, board: boardModel(),
      task: inRoom ? taskLine(camera) : null, boss: inRoom && G.boss ? { line: bossLine(), hp: G.boss.hp, max: G.boss.max } : null,
      missions: G.missions && !prison.prisoner && !cut.active && (G.showBoard || G.view === 'paused' || performance.now() < (G.missionsShowUntil || 0)) ? missionsHtml(G.missions) + (G.showBoard || G.view === 'paused' ? weeklyHtml(G.weekly) + (seasonView.on ? `<div class="ms"><small>🎁 Holiday gifts found today: ${seasonView.count().got}/${seasonView.count().total}</small></div>` : '') : '') : null,
      matchEnd: G.matchEnd, matchResetIn: G.matchResetAt - t, showFps: settings.showFps, fps: G.fps, ping: Math.round(net.rtt * 1000),
      vignette: settings.vignette ? THREE.MathUtils.clamp(((G.vrSpeed || 0) - 1.5) / 5, 0, 0.85) : 0,
      teamText: MODES[G.room.mode].teams ? `RED ${G.room.teamScores[0]} : ${G.room.teamScores[1]} BLUE` : null
    };
    if (cut.active) { st.prompt = null; st.rob = null; st.death = null; st.prison = null; st.sub = null; }
    if (G.bcam) { st.prompt = null; st.rob = null; if (xr && settings.vignette) st.vignette = 0.55; }
    if (xr) vrui.update(dt, st); else if ((G.view === 'playing' || G.view === 'paused') && !cut.active) hud.update(st);
    if (!xr) hud.show((G.view === 'playing' || G.view === 'paused') && !cut.active && !G.bcam);
  }
  desk.endFrame();
  if (photocam.on) { photocam.weapons.vr = xr; photocam.update(dt, performance.now() / 1000); }
  if (xr && goldHeld && weapons.model) gold.renderScope(renderer, scene, weapons.model, camPos, true); // zoomed view on the scope glass
  // automated screenshot tests only: window.__camOverride = { p:[x,y,z], l:[x,y,z] } renders from a free camera
  if (window.__camOverride && !xr) {
    const o = window.__camOverride, c = G.tourCam || (G.tourCam = new THREE.PerspectiveCamera(60, 1, 0.1, 900));
    c.aspect = window.innerWidth / window.innerHeight; c.fov = o.fov || 60; c.updateProjectionMatrix();
    c.position.set(...o.p); c.lookAt(...o.l); c.updateMatrixWorld(true);
    if (city.update) city.update(c.position, net.serverNow(), 1 / 60);
    prisonView.setActive && prisonView.setActive(c.position.z > 285);
    renderer.render(scene, c); return;
  }
  renderer.render(scene, viewCam);
}

// ------------------------------------------------------------------ Golden Sniper: shop + bullet cam
function goldForSale() { return isCop() && G.gold && G.gold.unlocked && G.gold.avail && !G.gold.own && G.gold.at; }
function nearGoldCounter(p) { const a = G.gold.at; return Math.hypot(p.x - a[0], p.z - a[2]) < 2.4 && Math.abs(p.y - (a[1] + 1.5)) < 2.2; }
function startBulletCam(s) {
  const end = s.end || s.from.clone().addScaledVector(s.dir, WEAPONS.golden.range);
  const xr = renderer.xr.isPresenting;
  gold.fire({ from: s.from, dir: s.dir, lock: s.lock, end, cam: xr ? 'vr' : 'desk' }); // VR rides a bit closer (wider field of view)
  G.bcam = { xr, t: 0, turned: false, save: xr ? { pos: rig.position.clone(), rotY: rig.rotation.y } : null };
  if (xr) G.blink = 1;
  G.scoped = false; document.body.classList.remove('scoped'); scopeEl.classList.add('hidden');
}
function runBulletCam(dt, xr) {
  const bc = G.bcam; bc.t += dt;
  if (xr) { const s = vrInput.update(); if (s.right.pressed.b || s.left.pressed.b) gold.skip(); }
  else if (desk.hit('Space') || desk.hit('KeyE') || desk.mouse.rightPressed) gold.skip();
  if (!G.me.alive || !G.room || bc.t > 4 || bc.xr !== xr) gold.skip();
  const pose = gold.camPose();
  G.prompt = null;
  if (!pose) return endBulletCam();
  if (xr) {
    if (!bc.turned) {
      // face the way the bullet flies (done during the blink so it's comfortable)
      const head = headWorld(new THREE.Vector3());
      const camYaw = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      const d = pose.look.clone().sub(pose.pos), ang = Math.atan2(-d.x, -d.z) - camYaw;
      rig.position.sub(head).applyAxisAngle(UP, ang).add(head); rig.rotation.y += ang; bc.turned = true;
      rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera);
    }
    rig.position.add(pose.pos.clone().sub(headWorld(new THREE.Vector3())));
    rig.updateMatrixWorld(true); renderer.xr.updateCamera(camera);
  } else {
    gold.cam.aspect = window.innerWidth / window.innerHeight; gold.cam.updateProjectionMatrix();
    gold.cam.position.copy(pose.pos); gold.cam.lookAt(pose.look); gold.cam.updateMatrixWorld(true);
  }
}
function endBulletCam() {
  const bc = G.bcam; G.bcam = null; gold.skip();
  if (bc && bc.save) {
    rig.position.copy(bc.save.pos); rig.rotation.y = bc.save.rotY; rig.updateMatrixWorld(true);
    if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera);
    vrMover.reset(); vrMover.gorilla.hands.forEach(h => h.init = false);
    G.blink = 1;
  }
}

// Robbery: aim any gun at a shopkeeper from close range and hold it. The server checks
// distance + line of sight and decides when the register is emptied.
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
// an NPC robber close enough to cuff (cops only; not one driving a stolen car)
function crookNear(p, range, hand) {
  let best = null, bd = range;
  for (const n of npcs.map.values()) {
    if (n.type !== NPC_TYPE.CROOK || !n.alive || n.state === 3 || (n.flags & 32) || !n.buf.length) continue;
    const hy = n.y + 1.55;
    const d = hand ? Math.min(Math.hypot(p.x - n.x, p.y - hy, p.z - n.z), Math.hypot(p.x - n.x, p.y - (hy - 0.55), p.z - n.z))
                   : (Math.abs(p.y - hy) < 1.6 ? Math.hypot(p.x - n.x, p.z - n.z) : 99);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
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
// ------------------------------------------------------------------ getaway rides (passenger seats)
const RIDE_SEATS = [new THREE.Vector3(0.42, 1.28, 0.25), new THREE.Vector3(-0.42, 1.28, 1.05), new THREE.Vector3(0.42, 1.28, 1.05)];
const rideCar = () => (G.ride ? cars.get(G.ride.id) : null);
function rideSeatWorld(car, seat = G.ride ? G.ride.seat : 0) { const v = RIDE_SEATS[seat].clone().applyAxisAngle(UP, car.yaw); v.x += car.x; v.y += car.y; v.z += car.z; return v; }
function rideHold() {
  const car = rideCar(), seat = rideSeatWorld(car);
  walker.feet.set(seat.x, seat.y - (walker.height - 0.05), seat.z); walker.vel.set(0, 0, 0);
  return {};
}
// a friend with the same role is driving this car and there's room
function canRide(car) {
  if (car.driverKind !== DRIVER.PLAYER || car.pid === G.room?.you) return false;
  const d = G.players.get(car.pid);
  return !!d && (d.role || 'civilian') === myRole();
}
function carPrompt(car, verb) {
  if (car.driverKind === DRIVER.PLAYER) return `🚗 ${verb} to hop in with ${G.players.get(car.pid)?.name || 'your friend'} (getaway ride)`;
  if (car.owner) return car.owner === G.room?.you ? `🔑 ${verb} to drive your car` : `🔒 ${G.players.get(car.owner)?.name || 'Someone'}'s car (locked)`;
  if (car.police) return isCop() ? `🚓 ${verb} to drive the police car` : `🚓 ${verb} to steal the police car (+2★)`;
  if (car.driverKind === DRIVER.NPC) return isCop() ? `🚗 ${verb} to commandeer the car` : `🚗 ${verb} to hijack the car`;
  return `🚗 ${verb} to get in`;
}
function updateRobbery(t, active) {
  if (!active || !weapons.current || isCop() || shopMenu.shop) return;
  weapons.aim(_ro, _rd);
  const hit = npcs.ray(_ro, _rd, 6.5, NPC_TYPE.SHOP);
  if (!hit) return;
  // robbing takes a deliberate aim, so walking up to buy something never robs the store by accident:
  // PC = hold right click (aim) · VR = point the gun at arm's length
  const xr = renderer.xr.isPresenting, head = headWorld(new THREE.Vector3());
  const aiming = xr ? Math.hypot(_ro.x - head.x, _ro.z - head.z) > 0.38 : desk.mouse.right;
  if (!aiming) {
    if (!G.prompt || G.prompt.startsWith('🛒')) G.prompt = (G.prompt ? G.prompt + ' · ' : '') + (xr ? '🔫 point your gun at arm\'s length to rob' : '🔫 hold right click to rob');
    return;
  }
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

// ------------------------------------------------------------------ arrest cutscene + prison helpers
function runCutscene(dt, xr) {
  if (xr) {
    const s = vrInput.update();
    if (s.right.pressed.b || s.right.pressed.a || s.left.pressed.a) { if (cut.requestSkip()) net.send({ type: 'skipCut' }); }
  } else if (desk.hit('Space') || desk.hit('Enter') || desk.hit('KeyE')) { if (cut.requestSkip()) net.send({ type: 'skipCut' }); }
  G.prompt = null;
  if (!cut.update(dt)) endCutscene(xr);
}
function endCutscene(xr) {
  if (pendingTp) { applyTp(pendingTp); pendingTp = null; }
  if (!xr) { camera.position.set(0, walker.height - 0.05, 0); camera.rotation.set(0, 0, 0); }
  prisonView.snapDoors();
  hud.notice('🔒 YOU HAVE BEEN SENT TO PRISON', 3500); vrui.setNotice('SENT TO PRISON', 3);
  prison.say('Find a way out! Talk to other inmates (E) to learn the escape routes. Stay out of restricted areas.', 8000);
}
function applyTp(m) {
  if (driving.active) driving.exit();
  const p = new THREE.Vector3(...m.p);
  if (renderer.xr.isPresenting) pendingVRTeleport = { p, yaw: m.yaw || 0 }; else teleport(p, m.yaw || 0);
  G.deskSafe = null; G.vrSafe = null;
  prisonView.snapDoors();
}
function arrestBarState(t) {
  const a = G.arrestBar, k = (performance.now() / 1000 - a.start) / a.dur;
  if (k > 1.3) { G.arrestBar = null; return null; }
  return { text: "🚔 YOU'RE BEING ARRESTED! RUN OR FIGHT BACK!", p: Math.min(1, k) };
}
const prevGrip = { left: false, right: false };
function prisonInteract(dt, t, xr) {
  if (!prison.prisoner || !G.me.alive) { if (prison.hold) prison.hold = null; return; }
  const eye = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
  const hands = [];
  if (xr) {
    const s = vrInput.state;
    for (const side of ['left', 'right']) {
      const c = vrInput.get(side); if (!c) continue;
      const held = !!s[side].held.grip;
      hands.push({ side, pos: c.grip.getWorldPosition(new THREE.Vector3()), gripHeld: held, gripPressed: held && !prevGrip[side], gripReleased: !held && prevGrip[side] });
      prevGrip[side] = held;
    }
    const bh = hands.find(h => h.side === prison.ballHand); G.ballHandPos = bh ? bh.pos : null;
  }
  const playing = xr || G.view === 'playing';
  const key = { eDown: playing && desk.down('KeyE'), eHit: playing && desk.hit('KeyE'), clickHit: playing && desk.mouse.leftPressed };
  const prompt = prison.update(dt, { xr, eye, dir, t, hands, key, myId: G.room.you });
  if (prompt) G.prompt = prompt;
  if (prison.progress) { G.rob = { ...prison.progress, at: t }; G.prompt = null; }
}

function clampWalker() {
  if (inPrisonArea(walker.feet.x, walker.feet.z)) { walker.feet.x = THREE.MathUtils.clamp(walker.feet.x, PRISON.x0 + 0.6, PRISON.x1 - 0.6); walker.feet.z = THREE.MathUtils.clamp(walker.feet.z, PRISON.z0 + 0.6, PRISON.z1 - 0.6); if (walker.feet.y > 60) walker.feet.y = 60; return; }
  const H = map.worldHalf - 0.6;
  walker.feet.x = THREE.MathUtils.clamp(walker.feet.x, -H, H); walker.feet.z = THREE.MathUtils.clamp(walker.feet.z, -H, H);
  if (walker.feet.y > 60) walker.feet.y = 60;
}
function clampRig() {
  const head = headWorld(new THREE.Vector3()), H = map.worldHalf - 0.5;
  if (inPrisonArea(head.x, head.z)) {
    if (head.x < PRISON.x0 + 0.5) rig.position.x += PRISON.x0 + 0.5 - head.x; if (head.x > PRISON.x1 - 0.5) rig.position.x -= head.x - (PRISON.x1 - 0.5);
    if (head.z < PRISON.z0 + 0.5) rig.position.z += PRISON.z0 + 0.5 - head.z; if (head.z > PRISON.z1 - 0.5) rig.position.z -= head.z - (PRISON.z1 - 0.5);
    return;
  }
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
    G.myPose = { h: hpose, l: pose(wheel(-0.18), cq), r: pose(wheel(0.18), cq) };
    net.send({ type: 'state', life: G.me.life, h: hpose, l: G.myPose.l, r: G.myPose.r, vr: xr, car: driving.stateArr() });
    return;
  }
  G.myPose = { h: pose(hp, hq), l, r };
  net.send({ type: 'state', life: G.me.life, h: G.myPose.h, l, r, vr: xr });
}

function menuModel() {
  return { settings, camera: photocam.on, tutorial: tut.active, hasCar: !!(G.garage && G.garage.sel), gang: myGang(), party: G.party && G.party.code ? `${G.party.code} · ${G.party.members.length} in party` : '', missions: G.missions ? `${G.missions.list.filter(q => q.done).length}/3` : '', role: myRole(), mic: G.mic, code: G.room?.code || '', teams: G.room && MODES[G.room.mode].teams, isHost: G.room && G.room.hostId === G.room.you && !G.room.isPublic, mode: G.room?.mode };
}
function menuAction(act) {
  if (act === 'tutskip') { tut.skip(); vrui.closeMenu(); }
  else if (act === 'carcall') { callMyCar(); vrui.closeMenu(); }
  else if (act === 'camera') { toggleCamera(); vrui.closeMenu(); }
  else if (act === 'partyleave') { partyAction('leave'); vrui.closeMenu(); vrui.setNotice('You left the party', 2); }
  else if (act === 'gang') { setGang((myGang() + 1) % GANGS.length); }
  else if (act === 'bug') { sendBug('(reported from VR: no text, check the position and what was going on)'); vrui.closeMenu(); }
  else if (act === 'missions') G.vrMissions = true;
  else if (act === 'emotes') G.vrEmotes = true;
  else if (act === 'leaders') { G.vrLeaders = true; loadBoards(); }
  else if (act === 'leaders:back') G.vrLeaders = false;
  else if (act === 'leaders:next') { LB.key = BOARDS[(BOARDS.findIndex(x => x.key === LB.key) + 1) % BOARDS.length].key; }
  else if (act === 'emotes:back') G.vrEmotes = false;
  else if (act.startsWith('emote:')) { sendEmote(+act.slice(6)); G.vrEmotes = false; vrui.closeMenu(); }
  else if (act === 'missions:back') G.vrMissions = false;
  else if (act.startsWith('shop:')) { if (act === 'shop:close') { shopMenu.close(); vrui.closeMenu(); } else if (act.startsWith('shop:buy:')) shopMenu.buy(act.slice(9)); }
  else if (act === 'resume') vrui.closeMenu();
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
  if (vrui.menuOpen) vrui.model = shopMenu.vrOpen ? shopMenu.vrModel() : G.vrMissions ? missionsVrModel() : G.vrEmotes ? emotesVrModel() : G.vrLeaders ? leadersVrModel() : menuModel();
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
  window.__npcMap = npcs.map; window.__cc = { cars, driving, menuAction: (a) => menuAction(a), G, desk, vrui, vrInput, net, walker, vrMover, weapons, remote, renderer, rig, camera, city, map, world, pickups, scene, prison, prisonView, cut, npcs, gold, boosts, shopMenu, bankView, marker, raceView, aptView, turfView, seasonView, phone, dayNight, weather, bigMap, cityMap, photocam };
}
start();
