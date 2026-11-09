// Getaway rides: friends hop into a car another player is driving (in-process, no server needed).
// Run: node test/server-test-7.mjs
import { Room } from '../server/room.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();

console.log('CITY CHAOS server test 7 (getaway rides)');
const room = new Room('RIDE01', { mode: 'ffa', crimes: false }, { tokens: new Map() });
room.now = () => T;
const [A, B, C, D, E, K] = ['Driver', 'Buddy', 'Pal', 'Third', 'Fourth', 'Cop'].map((n, i) => room.addPlayer(mk(i + 1), { name: n, role: n === 'Cop' ? 'cop' : 'civilian' }));
const V = room.vehicles;
const car = V.cars.find(c => !c.police && !c.van);
car.driver = 2; car.pid = 0; car.speed = 0; car.x = 40; car.z = 40; car.y = 0;   // park it
pose(A, 41.5, 1.6, 40); V.onHijack(A, car.id);
ok(A.inCar === car.id, 'driver gets in');
for (const q of [B, C, D, E, K]) pose(q, 41.5, 1.6, 41);
V.onHijack(B, car.id);
ok(B.ride && B.ride.car === car.id && last(A, 'carRide')?.pid === B.id, 'a civilian friend hops in as a passenger (everyone is told)');
ok(car.pid === A.id && A.inCar === car.id, 'the driver keeps driving');
V.onHijack(K, car.id);
ok(!K.ride && /cop|civilian/i.test(last(K, 'pMsg')?.text || ''), 'a cop can\'t ride in a civilian\'s getaway car');
V.onHijack(C, car.id); V.onHijack(D, car.id); V.onHijack(E, car.id);
ok(C.ride && D.ride && !E.ride && /full/.test(last(E, 'pMsg')?.text || ''), '3 passengers max, the 4th is told the car is full');
ok(new Set([B.ride.seat, C.ride.seat, D.ride.seat]).size === 3, 'each passenger gets their own seat');
// passengers aren't run over by their own car / other cars
const hp0 = B.hp; car.speed = 15; V.runOver(car, A, 40, 40, T);
ok(B.hp === hp0, 'passengers are not "run over" by the car they ride in');
car.speed = 0;
// driver gets out: passengers stay, car stops
V.onExit(A);
ok(!A.inCar && B.ride && car.driver === 2, 'driver gets out: passengers stay seated, car stops');
pose(A, 41.5, 1.6, 40); V.onHijack(A, car.id);
ok(A.inCar === car.id && B.ride, 'driver can get back in with the passengers still aboard');
// passenger gets out
room.handle(C, { type: 'exitCar' });
ok(!C.ride && last(C, 'carRide')?.on === false && A.inCar === car.id, 'a passenger can get out on their own');
// passenger dies -> removed
D.protectUntil = 0; room.damage(D, null, 200, 'test', false, null);
ok(!D.ride, 'a passenger who is knocked out leaves the car');
// prison van: friend rides along and both escape
const P = room.prison;
for (const q of [A, B]) { q.inCar && V.onExit(q); q.ride && V.removeRider(q); q.wanted = 3; pose(q, 10, 1.6, 10); P.arrest(q, null, null); T += 2; room.handle(q, { type: 'skipCut' }); }
const van = V.cars.find(c => c.van);
A.jail.items.add('VANKEYS'); P.holders.VANKEYS = A.id;
pose(A, van.x + 1.5, 1.6, van.z); V.onHijack(A, van.id);
pose(B, van.x + 1.5, 1.6, van.z + 1); V.onHijack(B, van.id);
ok(A.inCar === van.id && B.ride && B.ride.car === van.id, 'prison: a friend rides along in the escape van');
P.gateUntil = T + 30; P.updateDoors(T);
let x = van.x, z = van.z;
for (let k = 0; k < 60 && A.jail; k++) { x += (0 - x) * 0.15; z -= 0.6; T += 0.05; V.onCarState(A, [van.id, x, 0, z, 0, 10]); pose(A, x, 1.3, z); pose(B, x + 0.4, 1.3, z + 0.8); if (k % 2 === 0) P.tick(0.1); }
ok(!A.jail && !B.jail && last(B, 'escaped')?.how === 'vehicle', 'driver and passenger escape together in the van');
console.log(failures ? `\n${failures} FAILED` : '\nALL RIDE TESTS PASSED');
process.exit(failures ? 1 : 0);
