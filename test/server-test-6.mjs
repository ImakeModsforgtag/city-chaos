// Prison test (runs the server room in-process with a controllable clock, so every escape route,
// guard, camera, alarm and schedule rule can be checked step by step).
// Run: node test/server-test-6.mjs   (no server needed)
import { Room } from '../server/room.js';
import { PHASE } from '../public/shared/prison.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });

let T = 1000;
function newRoom() {
  const room = new Room('TEST' + Math.floor(Math.random() * 99), { mode: 'ffa', crimes: false }, { tokens: new Map() });
  room.now = () => T;
  return room;
}
const msgs = (p, type) => p.client.msgs.filter(m => m.type === type);
const last = (p, type) => { const a = msgs(p, type); return a[a.length - 1]; };
const pose = (p, x, y, z, yaw = 0) => { p.pose = { h: [x, y, z, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.lastStateAt = T; };
const tick = (room, secs, dt = 0.1) => { for (let s = 0; s < secs; s += dt) { T += dt; room.prison.tick(dt); } };
function hold(room, p, id, secs, atPose) {
  for (let s = 0; s <= secs + 0.6; s += 0.25) { if (atPose) pose(p, ...atPose); T += 0.25; room.handle(p, { type: 'pAct', id }); }
}
const it = (room, id) => room.prison.P.interacts.find(i => i.id === id);
const at = (room, id, dy = 0.5) => { const p = it(room, id).p; return [p[0], p[1] + dy, p[2]]; };
// park every mobile guard far away in a corner so a test step isn't interrupted
const benchGuards = (room) => { for (const g of room.prison.guards) if (!g.tower && !g.static) { g.x = -45; g.z = 446; g.y = 0; g.mode = 'static'; g.static = true; g.homeYaw = 0; g.home = [g.x, 0, g.z]; } for (const g of room.prison.guards) if (g.tower) g.y = -50; };
function jail(room, p, stars = 3) {
  p.wanted = stars;
  pose(p, 10, 1.6, 10);
  room.prison.arrest(p, null, null);
  T += 2; room.handle(p, { type: 'skipCut' });
}

console.log('CITY CHAOS server test 6 (arrests, prison, guards, escapes) - in-process');

// ------------------------------------------------------------------ arrests + cutscene
{
  const room = newRoom();
  const A = room.addPlayer(mk(1), { name: 'Robber' }), C = room.addPlayer(mk(2), { name: 'Officer', role: 'cop' });
  T += 3; room.tick(0.03);
  room.npcs.addWanted(A, 3, 'test');
  ok(A.wanted === 3, 'wanted stars go up to 3');
  room.npcs.addWanted(A, 5, 'test');
  ok(A.wanted === 5, 'wanted level caps at 5 stars');
  A.wanted = 3;
  pose(A, 10, 1.6, 10); pose(C, 11, 1.6, 10);
  room.handle(C, { type: 'arrest', id: A.id });
  const ar = last(C, 'arrested');
  ok(ar && ar.prison === true && ar.stars === 3, 'arresting a 3-star player sends them to prison');
  const cut = last(A, 'arrestCut');
  ok(cut && cut.dur > 30 && Array.isArray(cut.from) && cut.bed, 'the arrested player gets the cinematic arrest cutscene');
  ok(A.slots.length === 0 && last(A, 'inv').slots.length === 0, 'weapons are removed during the arrest');
  ok(room.publicPlayer(A).jail === 1, 'other players see the prisoner as "in cutscene"');
  ok(A.wanted === 0, 'stars cleared once arrested');
  // state updates are ignored while the cutscene plays
  const before = A.pose.h[0];
  room.onState(A, { type: 'state', life: A.life, h: [before + 1, 1.6, 10, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 1], r: [0, 0, 0, 0, 0, 0, 1] });
  ok(A.pose.h[0] === before, 'movement is frozen during the cutscene');
  T += 3; room.handle(A, { type: 'skipCut' });
  const js = last(A, 'jailStart');
  ok(js && A.jail.state === 'in', 'skipping the cutscene drops you in prison');
  const tp = last(A, 'tp'); const bed = room.prison.P.cells[A.jail.cell].bed;
  ok(tp && Math.hypot(tp.p[0] - bed[0], tp.p[2] - bed[2]) < 0.1, 'you wake up on the bed in your own cell');
  ok(room.publicPlayer(A).jail === 2, 'prisoners show up in a prison uniform to others');
  ok(room.prison.guards.length >= 10 && room.prison.inmates.length === 8, `prison staffed: ${room.prison.guards.length} guards, ${room.prison.inmates.length} prisoner NPCs`);
  // cutscene timer finishes by itself too
  const B = room.addPlayer(mk(3), { name: 'Second' }); T += 3;
  B.wanted = 4; pose(B, 12, 1.6, 10); room.handle(C, { type: 'arrest', id: B.id });
  ok(B.jail && B.jail.state === 'cut', 'a friend can be arrested too (own cutscene)');
  tick(room, 46);
  ok(B.jail.state === 'in' && B.jail.cell !== A.jail.cell, 'cutscene ends on its own; friends get separate cells');
  // prisoners respawn in their cell
  B.protectUntil = 0; room.damage(B, null, 200, 'shock', false, null);
  ok(!B.alive, 'prisoner can be knocked out');
  B.respawnAt = 0; room.spawn(B);
  const rs = last(B, 'respawn'); const bb = room.prison.P.cells[B.jail.cell].bed;
  ok(rs && Math.hypot(rs.p[0] - bb[0], rs.p[2] - bb[2]) < 0.1 && B.slots.length === 0, 'knocked-out prisoners wake up in their cell, still unarmed');
}

// ------------------------------------------------------------------ NPC cop arrests, resisting, SWAT, 1-star investigate
{
  const room = newRoom();
  const A = room.addPlayer(mk(1), { name: 'Runner' });
  T += 3; room.tick(0.03);
  A.wanted = 3; A.wantedSeenAt = T; pose(A, 6, 1.6, 4);
  const cop = room.npcs.spawnCopAt(7, 4, A, {});
  cop.x = 7; cop.z = 4; cop.y = room.npcs.floorAt(7, 4, 0.2);
  room.npcs.updateCop(cop, 0.1, T);
  ok(!!last(A, 'arrestAttempt') && A.arrestBy, 'at 3+ stars an NPC cop walks up and tries to arrest you');
  pose(A, 12, 1.6, 4); room.npcs.updateCop(cop, 0.1, T + 0.2);
  ok(!!last(A, 'arrestResist') && A.wanted === 4, 'running away resists arrest (+1 star)');
  T += 6; pose(A, 6, 1.6, 4); cop.x = 7; cop.z = 4;
  room.npcs.updateCop(cop, 0.1, T);
  ok(A.arrestBy, 'cops try again');
  for (let s = 0; s < 3.4; s += 0.1) { T += 0.1; pose(A, 6, 1.6, 4); room.npcs.updateCop(cop, 0.1, T); }
  ok(A.jail && A.jail.state === 'cut', 'staying put for 3 seconds = arrested by the NPC cop -> prison');
  // SWAT at 4+
  const S = room.addPlayer(mk(2), { name: 'Swat bait' }); T += 3; S.alive = true; pose(S, -60, 1.6, -60);
  S.wanted = 5; for (let i = 0; i < 30; i++) room.npcs.spawnCopsFor(S, 1);
  const cops = room.npcs.list.filter(n => n.type === 2);
  ok(cops.some(n => n.swat) && cops.length <= 12, `SWAT units join at 4-5 stars (${cops.filter(n => n.swat).length} SWAT of ${cops.length} cops, max 12)`);
  // 1 star: police investigate but don't shoot
  room.npcs.list = room.npcs.list.filter(n => n.type !== 2);
  const I = room.addPlayer(mk(3), { name: 'Suspicious' }); T += 3; room.tick(0.03); I.wanted = 1; pose(I, 30, 1.6, 30);
  const c2 = room.npcs.spawnCopAt(32, 30, I, {}); c2.x = 32; c2.z = 30; c2.y = room.npcs.floorAt(32, 30, 0.2);
  const hp0 = I.hp; I.client.msgs = [];
  for (let s = 0; s < 4; s += 0.1) { T += 0.1; room.npcs.updateCop(c2, 0.1, T); }
  ok(I.hp === hp0 && !I.client.msgs.some(m => m.type === 'npcShot'), '1 star: police investigate but hold their fire');
  I.wanted = 2;
  for (let s = 0; s < 4; s += 0.1) { T += 0.1; c2.nextShot = 0; room.npcs.updateCop(c2, 0.1, T); }
  ok(I.client.msgs.some(m => m.type === 'npcShot'), '2 stars: police open fire');
  // police SUV for 3+ stars
  const V = room.addPlayer(mk(4), { name: 'Vip' }); T += 3; V.wanted = 3; pose(V, 60, 1.6, 60);
  room.vehicles.cars = room.vehicles.cars.filter(c => !c.route);
  room.vehicles.dispatch(V);
  const disp = room.vehicles.cars.find(c => c.route);
  ok(disp && disp.color === 9, '3+ stars: the police send a stronger vehicle (SUV)');
}

// ------------------------------------------------------------------ schedule, doors, guards, cameras, fence
{
  const room = newRoom();
  const A = room.addPlayer(mk(1), { name: 'Inmate' }), B = room.addPlayer(mk(2), { name: 'Buddy' });
  T += 3; room.tick(0.03);
  jail(room, A); jail(room, B);
  const P = room.prison;
  tick(room, 0.3);
  const ps = last(A, 'pState');
  ok(ps && ps.phase === 0 && ps.doors.includes('cell0') === !!P.doorOpen.cell0, 'prison state (schedule + doors) syncs to players');
  ok(P.doorOpen['cell' + A.jail.cell], 'cell doors open during free time');
  P.phase = PHASE.LOCKDOWN; P.phaseLeft = 18; tick(room, 0.2);
  ok(!P.doorOpen['cell' + A.jail.cell], 'cell doors lock during LOCKDOWN');
  ok(room.world.boxes.filter(b => b.door === 'cell0').every(b => !b.off), 'locked cell doors block movement on the server');
  P.phase = PHASE.WORK; P.phaseLeft = 40; tick(room, 0.2);
  ok(P.doorOpen.laundry && P.doorOpen.workshop, 'laundry + workshop open for WORK DUTY');
  P.phase = PHASE.FREE; P.phaseLeft = 40; tick(room, 0.2);
  ok(!P.doorOpen.laundry, 'and close again afterwards');
  // phase change announcement
  A.client.msgs = []; P.phaseLeft = 0.05; tick(room, 0.2);
  ok(msgs(A, 'pAnnounce').length > 0 && P.phase === PHASE.BREAKFAST, 'schedule advances with a prison announcement');
  // guard sees a prisoner in a restricted area -> chase -> caught
  benchGuards(room);
  const g = P.guards.find(q => q.route === 4); // admin corridor guard
  g.static = false; g.mode = 'patrol'; g.x = 0; g.z = 381; g.y = 0; g.yaw = Math.PI; g.wp = 0;
  A.jail.items.add('SPOON');
  pose(A, 0, 1.6, 386);
  tick(room, 0.2);
  ok(g.mode === 'chase' && g.target === A.id, 'guards spot prisoners in restricted areas and give chase');
  tick(room, 3);
  ok(msgs(A, 'pCaught').length > 0 && A.jail.items.size === 0, 'caught: dragged back to the cell, items confiscated');
  const tp = last(A, 'tp'); const bed = P.P.cells[A.jail.cell].bed;
  ok(Math.hypot(tp.p[0] - bed[0], tp.p[2] - bed[2]) < 0.1, 'caught prisoners are returned to their cell');
  // noise makes guards investigate
  const g2 = P.guards.find(q => q.route === 1); g2.static = false; g2.mode = 'patrol'; g2.x = -30; g2.z = 420; g2.y = 0;
  P.noise(-40, 0, 430, 15);
  ok(g2.mode === 'investigate', 'guards investigate unusual noises');
  // camera alarm
  benchGuards(room); P.endAlarm();
  pose(A, 0, 1.6, 362, 0); B.client.msgs = [];
  for (let k = 0; k < 40 && !(P.alarm.until > T); k++) tick(room, 0.2);
  ok(P.alarm.until > T && msgs(B, 'pAlarm').some(m => m.on), 'security camera spots a prisoner in the sally port -> alarm for everyone');
  P.endAlarm();
  // camera loop disables cameras
  P.camsOffUntil = T + 60; P.camCool = {};
  pose(A, 0, 1.6, 362, 0); tick(room, 3);
  ok(!(P.alarm.until > T), 'looped camera feeds stop camera alarms');
  P.camsOffUntil = 0;
  // electric fence
  pose(A, 30, 8.6, 455.0); A.client.msgs = []; A.protectUntil = 0; const hp0 = A.hp;
  tick(room, 0.2);
  ok(msgs(A, 'pShock').length && A.hp < hp0, 'touching the powered fence shocks you and raises the alarm');
  P.endAlarm();
  // multiplayer sync: B opening a door shows for A
  P.permOpen.add('vent'); P.updateDoors(T); A.client.msgs = []; tick(room, 1.1);
  ok(last(A, 'pState').doors.includes('vent'), 'escape progress (opened doors) syncs to every prisoner');
}

// ------------------------------------------------------------------ escape routes
function escaped(p, how, label) {
  const e = msgs(p, 'escaped').pop();
  ok(e && e.how === how && !p.jail && p.wanted === 5 && p.slots.length > 0, `${label}: escaped (${e && e.how}), 5 stars, weapons back`);
}
{ // 1 SEWER
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Mole' }); T += 3; room.tick(0.03); jail(room, A); tick(room, 0.3); benchGuards(room);
  const P = room.prison;
  hold(room, A, 'tile', 11, at(room, 'tile'));
  ok(!P.doorOpen.tile, 'sewer: the loose tile needs the know-how first');
  P.phase = PHASE.BREAKFAST; P.phaseLeft = 40;
  hold(room, A, 'tray', 1.2, at(room, 'tray'));
  ok(A.jail.items.has('TRAY'), 'sewer: grab a food tray at breakfast');
  const doc = P.inmates.find(n => n.name === 'DOC'); doc.x = 30; doc.z = 399; doc.talkUntil = T + 99;
  pose(A, 30, 1.6, 400); room.handle(A, { type: 'pTalk', id: doc.id });
  ok(A.jail.pflags.has('tileKnown') && !A.jail.items.has('TRAY') && last(A, 'pTalkMsg'), 'sewer: mission - DOC trades the tray for the secret');
  hold(room, A, 'spoon', 1.6, at(room, 'spoon'));
  ok(A.jail.items.has('SPOON'), 'sewer: swipe a spoon');
  hold(room, A, 'tile', 11, at(room, 'tile'));
  ok(P.doorOpen.tile, 'sewer: dig out the loose tile (takes 10 s)');
  hold(room, A, 'valveA', 3.2, at(room, 'valveA'));
  ok(!P.doorOpen.grate, 'sewer: one valve is not enough');
  hold(room, A, 'valveB', 3.2, at(room, 'valveB'));
  ok(P.doorOpen.grate, 'sewer: both valves drain the water and open the grate');
  pose(A, -67, -3, 437.4); tick(room, 0.2); ok(!!A.jail, 'sewer: still underground = not out yet');
  pose(A, -67, 0.2, 437.4); tick(room, 0.2);
  escaped(A, 'sewer', 'sewer');
}
{ // 2 MAINTENANCE
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Fixer' }); T += 3; room.tick(0.03); jail(room, A); tick(room, 0.3); benchGuards(room);
  const P = room.prison;
  hold(room, A, 'vent', 6, at(room, 'vent'));
  ok(!P.doorOpen.vent, 'maintenance: panel needs a screwdriver');
  P.phase = PHASE.WORK; P.phaseLeft = 50; tick(room, 0.1);
  hold(room, A, 'screwdriver', 1.2, at(room, 'screwdriver'));
  ok(A.jail.items.has('SCREWDRIVER') && P.holders.SCREWDRIVER === A.id, 'maintenance: take the screwdriver (only one exists)');
  hold(room, A, 'vent', 5.2, at(room, 'vent'));
  ok(P.doorOpen.vent, 'maintenance: unscrew the maintenance panel');
  hold(room, A, 'tgate', 6.2, at(room, 'tgate'));
  ok(!P.doorOpen.tgate, 'maintenance: tunnel gate needs bolt cutters');
  hold(room, A, 'cutters', 1.2, at(room, 'cutters'));
  hold(room, A, 'tgate', 6.2, at(room, 'tgate'));
  ok(P.doorOpen.tgate, 'maintenance: cut through the tunnel gate');
  pose(A, 23, 0.3, 466); tick(room, 0.2);
  escaped(A, 'maintenance', 'maintenance');
  ok(!P.holders.SCREWDRIVER, 'unique items go back when their holder escapes');
}
{ // 3 GUARD DISGUISE (+ basketball mission)
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Actor' }); T += 3; room.tick(0.03); jail(room, A); tick(room, 0.3); benchGuards(room);
  const P = room.prison;
  hold(room, A, 'drawer', 4.2, at(room, 'drawer'));
  ok(!A.jail.items.has('KEYCARD'), 'disguise: the drawer has a code lock');
  // basketball: a real throw from the free-throw spot, then two more baskets
  pose(A, 0, 1.6, 419.5, 0);
  P.ball.x = 0; P.ball.y = 1; P.ball.z = 419.8; room.handle(A, { type: 'ballGrab' });
  ok(P.ball.holder === A.id, 'basketball: pick up the ball');
  let scored = false;
  for (let vy = 4.5; vy <= 9 && !scored; vy += 0.25) for (let vz = -3; vz >= -7 && !scored; vz -= 0.25) {
    P.ball.holder = A.id; room.handle(A, { type: 'ballThrow', v: [0, vy, vz] });
    for (let s = 0; s < 2.2; s += 0.1) { T += 0.1; P.tickBall(0.1); }
    if (A.jail.baskets > 0) scored = true;
  }
  ok(scored, 'basketball: a real throw goes through the hoop and scores');
  while (A.jail.baskets < 3) { Object.assign(P.ball, { holder: 0, thrower: A.id, x: 0, y: 3.4, z: 415.47, vx: 0, vy: -1, vz: 0 }); for (let s = 0; s < 0.5; s += 0.1) { T += 0.1; P.tickBall(0.1); } }
  const mike = P.inmates.find(n => n.name === 'BIG MIKE'); mike.x = 1; mike.z = 419; mike.talkUntil = T + 99;
  room.handle(A, { type: 'pTalk', id: mike.id });
  ok(A.jail.pflags.has('code'), 'disguise: mission - sink 3 baskets and BIG MIKE gives you the drawer code');
  hold(room, A, 'drawer', 4.2, at(room, 'drawer'));
  ok(A.jail.items.has('KEYCARD'), 'disguise: open the medical drawer -> keycard');
  hold(room, A, 'card_adminS', 0.8, [0, 1.6, 391]);
  ok(P.doorOpen.adminS, 'disguise: keycard opens the admin door');
  hold(room, A, 'card_locker', 0.8, [-7, 1.6, 384]);
  ok(P.doorOpen.locker, 'disguise: keycard opens the staff lockers');
  T += 7; tick(room, 0.2);
  ok(!P.doorOpen.adminS, 'keycard doors close again after a few seconds');
  A.jail.disguise = false;
  hold(room, A, 'uniform', 3.2, at(room, 'uniform'));
  ok(A.jail.disguise && room.publicPlayer(A).jail === 3, 'disguise: put on a guard uniform (others see a guard)');
  // walking through the admin building in uniform: cameras + guards don't react from a distance
  P.endAlarm(); pose(A, 0, 1.6, 372); tick(room, 1);
  ok(!(P.alarm.until > T), 'disguise: cameras ignore you in uniform');
  const g = P.guards.find(q => q.role === 'checkpoint'); g.x = 0; g.z = 376.8; g.y = 0; g.static = true; g.mode = 'static';
  pose(A, 0.5, 1.6, 376); tick(room, 3.2);
  ok(!A.jail.disguise && msgs(A, 'pMsg').some(m => /blown/.test(m.text)), 'disguise: hang around a guard too long and your cover is blown');
  // second try: keep moving
  ok(msgs(A, 'pCaught').length > 0 && !A.jail.items.has('KEYCARD'), 'disguise: ...and the guard drags you back to your cell (keycard confiscated)');
  P.endAlarm(); benchGuards(room); A.jail.disguise = true; A.jail.items.add('KEYCARD'); P.holders.KEYCARD = A.id;
  hold(room, A, 'card_adminN', 0.8, [0, 1.6, 367]);
  hold(room, A, 'card_pedgate', 0.8, [8, 1.6, 346]);
  ok(P.doorOpen.pedgate, 'disguise: badge through the staff gate');
  pose(A, 8, 1.6, 342); tick(room, 0.2);
  escaped(A, 'disguise', 'guard disguise');
}
{ // 4 ROOFTOP
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Climber' }); T += 3; room.tick(0.03); jail(room, A); tick(room, 0.3); benchGuards(room);
  const P = room.prison;
  P.phase = PHASE.WORK; P.phaseLeft = 50; tick(room, 0.1);
  hold(room, A, 'rope', 6.2, at(room, 'rope'));
  ok(A.jail.items.has('ROPE'), 'rooftop: tie bedsheets into a rope (laundry, work duty)');
  hold(room, A, 'anchor', 4.2, at(room, 'anchor', 1.1));
  ok(!!A.jail && msgs(A, 'pMsg').some(m => /electrified/.test(m.text)), 'rooftop: can\'t go over the wall while the fence is live');
  hold(room, A, 'fuse', 6.2, at(room, 'fuse', 0.9));
  ok(P.fenceOffUntil > T, 'rooftop: cut the fence power at the fuse box');
  hold(room, A, 'anchor', 4.2, at(room, 'anchor', 1.1));
  escaped(A, 'rooftop', 'rooftop');
}
{ // 5 VEHICLE
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Driver' }), F = room.addPlayer(mk(2), { name: 'Friend' });
  T += 3; room.tick(0.03); jail(room, A); jail(room, F); tick(room, 0.3); benchGuards(room);
  const P = room.prison, V = room.vehicles;
  const van = V.cars.find(c => c.van);
  pose(A, van.x + 1.5, 1.6, van.z); V.onHijack(A, van.id);
  ok(!A.inCar && msgs(A, 'pMsg').some(m => /VAN KEYS/.test(m.text)), 'vehicle: the van is locked without keys');
  A.jail.items.add('KEYCARD'); P.holders.KEYCARD = A.id;
  hold(room, A, 'card_control', 0.8, [7, 1.6, 372]);
  ok(P.doorOpen.control, 'vehicle: keycard into the control room');
  hold(room, A, 'vankeys', 1.2, at(room, 'vankeys'));
  ok(A.jail.items.has('VANKEYS'), 'vehicle: grab the van keys');
  // the friend opens the gate (co-op)
  F.jail.items.add('KEYCARD');
  hold(room, F, 'gatebtn', 3.2, at(room, 'gatebtn'));
  ok(P.doorOpen.gate && P.gateUntil > T, 'vehicle (co-op): a friend opens the main gate from the control room');
  pose(A, van.x + 1.5, 1.6, van.z); V.onHijack(A, van.id);
  ok(A.inCar === van.id, 'vehicle: get in the van with the keys');
  let x = van.x, z = van.z;
  for (let k = 0; k < 60 && A.jail; k++) {
    x += (0 - x) * 0.15; z -= 0.6; T += 0.05;
    V.onCarState(A, [van.id, x, 0, z, 0, 10]);
    pose(A, x, 1.3, z); if (k % 2 === 0) tick(room, 0.1);
  }
  escaped(A, 'vehicle', 'vehicle');
  T += 9; tick(room, 0.2);
  ok(P.alarm.until > 0 || msgs(F, 'pAlarm').length > 0, 'opening the gate trips the alarm a few seconds later');
}
{ // caught again after escaping -> back to prison
  const room = newRoom(); const A = room.addPlayer(mk(1), { name: 'Repeat' }), C = room.addPlayer(mk(2), { name: 'Cop', role: 'cop' });
  T += 3; room.tick(0.03); jail(room, A); tick(room, 0.3);
  pose(A, 46, 5.4, 445.6); A.jail.items.add('ROPE'); room.prison.fenceOffUntil = T + 40;
  hold(room, A, 'anchor', 4.2, at(room, 'anchor', 1.1));
  ok(!A.jail && A.wanted === 5, 'escaped with 5 stars');
  const tp = last(A, 'tp'); pose(A, tp.p[0], 1.6, tp.p[2]); pose(C, tp.p[0] + 1, 1.6, tp.p[2]);
  room.handle(C, { type: 'arrest', id: A.id });
  ok(A.jail && A.jail.state === 'cut', 'caught again with 3+ stars = straight back to prison');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PRISON TESTS PASSED');
process.exit(failures ? 1 : 0);
