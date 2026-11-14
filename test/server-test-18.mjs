// Street races (in-process): opening a race at the start line, others joining in the lobby, the start,
// checkpoints in order (skipping doesn't count), places + prizes, solo target time, best times saved,
// dropping out (getting out of the car, leaving), timeouts and the cooldown.
import { Room } from '../server/room.js';
import { RACE, ROUTES, RACE_START, racePrize } from '../public/shared/races.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('RACE', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
room.npcs.noCops = true;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const q of room.players.values()) if (q.pose) q.lastStateAt = T; room.tick(0.1); } };
const msgs = (p, ev) => p.client.msgs.filter(m => m.type === 'race' && (!ev || m.ev === ev));
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
const V = room.vehicles;
// put a player behind the wheel of a car at x,z
function drive(p, x, z) {
  const car = V.spawnPersonal(p, 100, [x, 0.15, z, 0]);
  pose(p, x + 1, 1.75, z); room.handle(p, { type: 'hijack', id: car.id });
  return car;
}
const moveTo = (car, x, z) => { car.x = x; car.z = z; };
console.log('CITY CHAOS server test 18 (street races) - in-process');
const A = room.addPlayer(mk(), { name: 'Speedy' }), B = room.addPlayer(mk(), { name: 'Slowpoke' }), C = room.addPlayer(mk(), { name: 'Walker' });
T += 3; room.tick(0.03); for (const p of [A, B, C]) { room.spawn(p); p.protectUntil = 0; }

// walking into the start line does nothing
pose(C, RACE_START[0], 1.75, RACE_START[1]); run(1);
ok(room.races.state === 'idle', 'walking onto the start line doesn\'t start a race (you need a car)');
// A drives in: lobby opens
const ca = drive(A, RACE_START[0] + 30, RACE_START[1]); run(0.5);
ok(A.inCar === ca.id, 'A is driving');
moveTo(ca, RACE_START[0] + 2, RACE_START[1]); run(0.5);
ok(room.races.state === 'lobby' && room.races.racers.has(A.id), 'driving into the start line opens a race and joins it');
const route = room.races.route;
ok(msgs(C, 'join').length === 1, 'everyone hears about the new race');
// B joins in the lobby
const cb = drive(B, RACE_START[0] - 2, RACE_START[1] + 4); run(0.5);
ok(room.races.racers.size === 2, 'a second driver joins');
// nobody can start early: checkpoints don't count in the lobby
moveTo(ca, ...route.cps[0]); run(0.3);
ok(room.races.state === 'lobby' && !room.races.racers.has(A.id), 'driving off before the start drops you out of the lobby');
moveTo(ca, RACE_START[0], RACE_START[1]); run(0.3);
ok(room.races.racers.has(A.id), 'coming back to the line joins again');
run(RACE.lobby + 0.5);
ok(room.races.state === 'running' && msgs(A, 'go').length === 1, 'after the lobby the race starts (GO)');
// skipping checkpoints doesn't count
moveTo(ca, ...route.cps[2]); run(0.3);
ok(room.races.racers.get(A.id).cp === 0, 'skipping a checkpoint doesn\'t count');
// A drives the route
for (let i = 0; i < route.cps.length; i++) { moveTo(ca, ...route.cps[i]); run(0.6); if (i === 0) ok(msgs(A, 'cp').length === 1, 'hitting the first checkpoint'); }
const fa = msgs(A, 'finish').pop();
const cashA = A.cash;
ok(fa && fa.place === 1 && fa.prize === racePrize(1, 2) && fa.prize === RACE.prizes[0] + RACE.perRacer, `A finishes 1st and wins $${fa && fa.prize}`);
ok(A.prof.stats.races === 1 && A.prof.stats.raceWins === 1, 'race + win counted in stats');
ok(A.prof.raceBest[route.id] > 0, 'best time saved');
// B gets out of the car and drops out
room.handle(B, { type: 'exitCar' }); run(RACE.outOfCar + 1);
ok(msgs(B, 'dnf').length >= 1 && room.races.state === 'idle', 'B got out of the car too long: out of the race, race over');
ok(msgs(C, 'end').length === 1, 'race end announced');
run(6);
ok(peekToken(A.client.msgs.filter(m => m.type === 'save').pop().token).raceBest[route.id] === A.prof.raceBest[route.id], 'best time is in your save');

// cooldown, then a solo race
moveTo(ca, RACE_START[0], RACE_START[1]); run(0.3);
ok(room.races.state === 'idle', 'short cooldown between races');
run(RACE.cooldown);
ok(room.races.state === 'lobby', 'after the cooldown a new race opens');
const r2 = room.races.route;
ok(r2.id !== route.id, 'the next race uses the other route');
run(RACE.lobby + 0.5);
const c0 = A.cash;
for (const cp of r2.cps) { moveTo(ca, ...cp); run(0.5); }
const solo = msgs(A, 'finish').pop();
ok(solo.solo && solo.beat && solo.prize === RACE.soloPrize && A.cash >= c0 + RACE.soloPrize, 'solo race under the target time pays the solo prize');
// slow solo race: no prize
run(RACE.cooldown + 0.5); moveTo(ca, RACE_START[0], RACE_START[1]); run(RACE.lobby + 1);
const r3 = room.races.route, c1 = A.cash;
for (const cp of r3.cps) { moveTo(ca, ...cp); run(r3.par / r3.cps.length + 2); }
const slow = msgs(A, 'finish').pop();
ok(slow.solo && !slow.beat && slow.prize === 0 && A.cash === c1, 'too slow for the target: no prize (still XP)');
// timeout
run(RACE.cooldown + 0.5); moveTo(ca, RACE_START[0], RACE_START[1]); run(RACE.lobby + 1);
ok(room.races.state === 'running', 'another race running');
run(RACE.timeout + 1);
ok(room.races.state !== 'running' && msgs(A, 'dnf').pop().why === 'ran out of time', 'a race that takes too long ends (DNF)');
// leaving the game mid race
run(RACE.cooldown + 0.5); moveTo(ca, RACE_START[0], RACE_START[1]); run(RACE.lobby + 1);
room.removePlayer(A.id); run(1);
ok(room.races.state === 'idle', 'the only racer leaving ends the race');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
