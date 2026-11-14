// Your own cars (in-process): buying at the CAR LOT, level locks, paint, picking a car, calling it to the street,
// only the owner can drive it, friends can ride along, it's saved, and it goes away after the owner leaves.
import { Room } from '../server/room.js';
import { CAR_MODELS, PAINTS, PAINT_PRICE, carCode, decodeCar } from '../public/shared/garage.js';
import { xpForLevel } from '../public/shared/levels.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('CARS', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const q of room.players.values()) if (q.pose) q.lastStateAt = T; room.tick(0.1); } };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
const M = room.npcs.map, L = M.carLot;
const atLot = (p) => pose(p, L[0] + 1.5, 1.75, L[2]);
const lot = (p, item) => { T += 0.5; room.handle(p, { type: 'shopBuy', shop: 'CAR LOT', item }); return last(p, 'shopResult'); };
const V = room.vehicles;

console.log('CITY CHAOS server test 17 (your own cars) - in-process');
const A = room.addPlayer(mk(), { name: 'Driver' });
const B = room.addPlayer(mk(), { name: 'Buddy' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B); A.protectUntil = B.protectUntil = 0;
ok(!!L && M.carShow.length === 4, 'the map has a CAR LOT kiosk with 4 show cars');
ok(last(A, 'garage') && last(A, 'garage').cars.length === 0, 'new players own no cars');

// calling with no car
pose(A, 0, 1.75, 0); T += 20; room.handle(A, { type: 'carCall' });
ok(last(A, 'carCallResult').ok === false, 'can\'t call a car you don\'t own');

// buying
atLot(A); A.cash = 500;
let r = lot(A, 'buy:compact');
ok(r.ok === 0 && A.cash === 500, 'too poor for the Pocket Rocket ($1000)');
A.cash = 50000;
r = lot(A, 'buy:sports');
ok(r.ok === 0 && /level 8/.test(r.why), 'the Viper GT is locked until level 8');
r = lot(A, 'buy:compact');
ok(r.ok === 1 && A.cash === 49000 && A.prof.garage.cars.includes('compact') && A.prof.garage.sel === 'compact', 'bought the Pocket Rocket for $1000');
ok(last(A, 'garage').cars[0] === 'compact', 'the client is told what you own');
r = lot(A, 'buy:compact');
ok(r.ok === 0, 'can\'t buy the same car twice');
A.prof.xp = xpForLevel(8); room.saves.addXP(A, 0);
r = lot(A, 'buy:sports');
ok(r.ok === 1 && A.prof.garage.cars.length === 2 && A.prof.garage.sel === 'sports', 'at level 8 the Viper GT can be bought (and becomes the car you drive)');
const p0 = A.prof.garage.paint.sports;
r = lot(A, 'paint');
ok(r.ok === 1 && A.prof.garage.paint.sports === (p0 + 1) % PAINTS.length && A.cash === 49000 - 8000 - PAINT_PRICE, `repaint for $${PAINT_PRICE}`);
r = lot(A, 'use:compact');
ok(r.ok === 1 && A.prof.garage.sel === 'compact', 'pick which of your cars to drive');
B.cash = 0; atLot(B);
ok(lot(B, 'use:compact').ok === 0, 'can\'t pick a car you don\'t own');
pose(B, 0, 1.75, 0);
ok(lot(A, 'buy:gold').ok === 0, 'the Gold Rush needs level 12');
// too far from the kiosk
pose(A, L[0] + 20, 1.75, L[2]);
ok(lot(A, 'buy:pickup').ok === 0, 'you have to be at the kiosk');

// saved
run(6);
const tok = last(A, 'save').token, saved = peekToken(tok);
ok(saved.garage.cars.join() === 'compact,sports' && saved.garage.sel === 'compact', 'your cars are in your save');

// calling it
const street = M.trafficLoops[0][0];
pose(A, street[0] + 3, 1.75, street[1] + 3);
room.handle(A, { type: 'carCall' });
r = last(A, 'carCallResult');
const car = V.cars.find(c => c.owner === A.id);
ok(r.ok && car && Math.hypot(car.x - street[0], car.z - street[1]) < 40, 'C calls your car to a street near you');
ok(decodeCar(car.color).model.id === 'compact', 'it\'s the car you picked, in your paint');
room.handle(A, { type: 'carCall' });
ok(last(A, 'carCallResult').ok === false && /again/.test(last(A, 'carCallResult').why), 'calling again too soon is refused');
// only the owner can drive it
pose(B, car.x + 1, 1.75, car.z); room.handle(B, { type: 'hijack', id: car.id });
ok(!B.inCar && /Driver's car/.test(last(B, 'pMsg').text), 'someone else can\'t take your car');
pose(A, car.x + 1, 1.75, car.z); room.handle(A, { type: 'hijack', id: car.id });
ok(A.inCar === car.id, 'the owner gets in');
ok(!A.prof.stats.cars, 'getting in your own car isn\'t a carjacking');
ok(!A.wanted, 'no wanted stars for driving your own car');
room.handle(B, { type: 'hijack', id: car.id });
ok(B.ride && B.ride.car === car.id || B.ride === car.id || !!B.ride, 'a friend can ride along');
room.handle(B, { type: 'exitCar' }); room.handle(A, { type: 'exitCar' });
// repaint while it's out
atLot(A); lot(A, 'use:sports');
ok(decodeCar(car.color).model.id === 'sports' && last(A, 'carColor'), 'switching cars changes the one that\'s out too');
// it stays parked (doesn't rejoin traffic) ...
pose(A, 0, 1.75, 0); run(70);
ok(V.cars.includes(car) && car.driver === 2, 'your parked car stays where you left it');
// a second call moves it (old one goes away)
pose(A, street[0] + 3, 1.75, street[1] + 3); room.handle(A, { type: 'carCall' });
run(1);
ok(V.cars.filter(c => c.owner === A.id).length === 1, 'you only ever have one car out');
// owner leaves -> car removed after a minute
const mine = V.cars.find(c => c.owner === A.id);
room.removePlayer(A.id); run(30);
ok(V.cars.includes(mine), 'your car waits a bit after you leave');
run(40);
ok(!V.cars.includes(mine), 'then it goes away');

// coming back with the save keeps the cars
const A2 = room.addPlayer(mk(), { name: 'Driver', profile: tok });
T += 3; room.tick(0.03);
ok(last(A2, 'garage').cars.length === 2, 'back with your save: you still own both cars');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
