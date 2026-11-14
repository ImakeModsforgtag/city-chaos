// Living city test (in-process, controllable clock): the day/night clock + weather, more robbers at night,
// pedestrians answering emotes, race fans cheering, and peds jumping out of the way of speeding cars.
// Run: node test/server-test-27.mjs   (no server needed)
import { Room } from '../server/room.js';
import { NPC_TYPE, NPC_STATE } from '../server/npcs.js';
import { gameHour, isNight, daylight, weatherAt, fmtHour, DAY_MINUTES } from '../public/shared/daynight.js';
import { RACE_START } from '../public/shared/races.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('ALIVE', { mode: 'ffa' }, { tokens: new Map() });
room.now = () => T;
const peds = () => room.npcs.list.filter(n => n.type === NPC_TYPE.PED && n.state !== NPC_STATE.DEAD);
const run = (secs, dt = 0.05) => { for (let s = 0; s < secs; s += dt) { T += dt; room.npcs.tick(dt); } };

console.log('CITY CHAOS server test 27 (living city) - in-process');

// ---- the shared clock
ok(DAY_MINUTES > 0, `a full day lasts ${DAY_MINUTES} real minutes`);
const h0 = gameHour(0), h1 = gameHour(DAY_MINUTES * 60000);
ok(Math.abs(h0 - h1) < 1e-6, 'the clock wraps after one full day');
ok(daylight(12) > 0.95 && daylight(0) < 0.05, 'noon is bright, midnight is dark');
ok(isNight(23) && isNight(3) && !isNight(12), 'night is 11pm/3am, not noon');
ok(/AM|PM/.test(fmtHour(13.5)), `hours print nicely (${fmtHour(13.5)})`);
const kinds = new Set(); for (let i = 0; i < 400; i++) kinds.add(weatherAt(i * 3600000));
ok(kinds.has('clear') && kinds.has('rain') && kinds.has('storm'), 'the weather cycles through clear, rain and storms');
const clock = room.clockMsg();
ok(clock.type === 'clock' && Number.isFinite(clock.ms), 'the server sends a clock message');

// ---- more robbers at night
room.fixedHour = 2; ok(isNight(room.hour()), 'the test clock can be pinned to 2 AM');
room.fixedHour = 12; ok(!isNight(room.hour()), 'and to noon');
room.fixedHour = null;

// ---- emotes: pedestrians answer
const A = room.addPlayer(mk(1), { name: 'Dancer' });
T += 3; room.spawn(A); A.protectUntil = 0;
const ped = peds().find(n => n.loop && !n.runner);
ok(!!ped, 'there are pedestrians walking the sidewalks');
const putNear = (p, n) => { const x = n.x + 2, y = n.y + 1.6, z = n.z; p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.inCar = 0; };
putNear(A, ped);
let answered = room.npcs.emote(A, 2);
ok(answered >= 1 && ped.state === NPC_STATE.DANCE, 'a pedestrian dances when you dance next to them');
const px = ped.x, pz = ped.z; run(1);
ok(Math.hypot(ped.x - px, ped.z - pz) < 0.01 && ped.state === NPC_STATE.DANCE, 'they stop walking while they dance');
run(6);
ok(ped.state === NPC_STATE.WALK, 'then go back to walking');
putNear(A, ped); room.npcs.emote(A, 0);
ok(ped.state === NPC_STATE.WAVE, 'a wave gets waved back');
const faceYaw = Math.atan2(-(A.pose.h[0] - ped.x), -(A.pose.h[2] - ped.z));
ok(Math.abs(Math.atan2(Math.sin(ped.yaw - faceYaw), Math.cos(ped.yaw - faceYaw))) < 0.01, 'and they turn to face you');
run(4);
A.pose.h[0] = ped.x + 40; ok(room.npcs.emote(A, 2) === 0 || ped.state !== NPC_STATE.DANCE, 'peds far away ignore your emote');
// through the room message handler too
A.client.msgs = []; putNear(A, ped); A.emoteAt = -9;
room.handle(A, { type: 'emote', e: 2 });
ok(A.client.msgs.some(m => m.type === 'emote') && ped.state === NPC_STATE.DANCE, 'the emote message makes nearby peds dance');
run(7);

// ---- gunfire still beats everything
putNear(A, ped); room.npcs.emote(A, 2);
room.npcs.noise(ped.x, ped.z);
ok(ped.state === NPC_STATE.PANIC, 'a gunshot makes a dancing ped run');

// ---- race fans
run(8);
const fans = room.npcs.addSpectators(RACE_START[0], RACE_START[1]);
ok(fans.length >= 4, `fans gather at the race start (${fans.length})`);
ok(fans.every(f => Math.hypot(f.x - RACE_START[0], f.z - RACE_START[1]) < 26), 'they stand near the start line');
ok(room.npcs.addSpectators(RACE_START[0], RACE_START[1]).length === fans.length, 'a second race doesn\'t double the crowd');
const fx = fans[0].x; run(2);
ok(fans.every(f => !f.remove && f.state === NPC_STATE.IDLE) && fans[0].x === fx, 'fans stand still and wait');
const cheered = room.npcs.cheer(RACE_START[0], RACE_START[1], 45, 4);
ok(cheered >= fans.length, `everyone near the line cheers on GO (${cheered})`);
ok(fans.every(f => f.state === NPC_STATE.CHEER), 'fans are cheering');
run(6);
ok(fans.every(f => f.state === NPC_STATE.IDLE), 'then settle down again');
room.npcs.noise(fans[0].x, fans[0].z);
ok(fans[0].runner && fans[0].state === NPC_STATE.PANIC, 'gunfire scatters the fans');
room.npcs.clearSpectators(1); run(10);
ok(!room.npcs.list.some(n => n.spectator || (fans.includes(n))), 'fans go home after the race');
const snap = room.npcs.snapshot();
ok(Array.isArray(snap) && snap.every(a => Number.isFinite(a[2]) && Number.isFinite(a[4])), 'NPC snapshot is clean');

// ---- jumping out of the way of a speeding car
run(3);
const walker = peds().find(n => n.loop && !n.runner && n.state === NPC_STATE.WALK);
const car = room.vehicles.cars.find(c => !c.police);
car.driver = 2; car.pid = A.id; car.yaw = 0; car.speed = 18; car.x = walker.x; car.z = walker.z + 6; car.y = walker.y;
const before = [walker.x, walker.z];
room.npcs.dodgeCars(T);
ok(!!walker.dodge, 'a ped sees a fast car heading at them');
for (let i = 0; i < 12; i++) { T += 0.05; room.npcs.updatePed(walker, 0.05, T); }
ok(Math.abs(walker.x - before[0]) > 0.8, `and leaps sideways (${Math.abs(walker.x - before[0]).toFixed(2)}m)`);
car.speed = 3; walker.dodge = null; walker.dodgeAt = 0; car.x = walker.x; car.z = walker.z + 5;
room.npcs.dodgeCars(T + 5);
ok(!walker.dodge, 'slow cars don\'t make anyone jump');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
