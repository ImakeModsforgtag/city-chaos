// NPC bad guys (in-process): robbers walking into every store and robbing it, car thieves stealing cars at
// red lights, police responding, bounties, arrests by cop players, surrendering, taking a stolen car back.
import { Room } from '../server/room.js';
import { NPC_TYPE, NPC_STATE } from '../server/npcs.js';
import { DRIVER } from '../server/vehicles.js';
import { CROOK } from '../server/crooks.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('CROOK', { mode: 'ffa', progress: false }, { tokens: new Map() });
room.now = () => T;
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; p.lastStateAt = T; };
const run = (sec, until) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const p of room.players.values()) if (p.pose) p.lastStateAt = T; room.tick(0.1); if (until && until()) return true; } return false; };
const msgs = (p, type) => p.client.msgs.filter(m => m.type === type);
const C = room.npcs.crooks;
const crooks = () => room.npcs.list.filter(n => n.type === NPC_TYPE.CROOK);
const clerk = (shop) => room.npcs.list.find(n => n.type === NPC_TYPE.SHOP && n.shop === shop);

console.log('CITY CHAOS server test 11 (NPC robbers + car thieves) - in-process');
const A = room.addPlayer(mk(1), { name: 'Watcher' });
T += 3; room.tick(0.03); room.spawn(A); A.protectUntil = 0;
pose(A, 115, 1.6, 115);   // far corner, out of the way
C.nextAt = Infinity; C.bossAt = Infinity;      // only the robbers this test starts (no boss crews here, see test 20)

// ---------------------------------------------------------------- every store can be robbed by an NPC
const realCops = C.sendCops; C.sendCops = () => {};
for (const [name] of C.routes) {
  const n = C.startRobbery(T, name);
  ok(!!n, `${name}: a robber shows up outside`);
  if (!n) continue;
  const reached = run(40, () => n.phase === 'rob');
  ok(reached, `${name}: walks in through the door to the counter (${Math.hypot(n.x - clerk(name).x, n.z - clerk(name).z).toFixed(1)} m from the clerk)`);
  run(0.5); ok(clerk(name).state === NPC_STATE.HANDSUP, `${name}: the clerk puts their hands up`);
  const done = run(10, () => n.phase === 'flee');
  ok(done && T < clerk(name).closedUntil && n.loot > 0, `${name}: register emptied ($${n.loot}), store closed`);
  run(60, () => n.remove || !room.npcs.list.includes(n));
  ok(!room.npcs.list.includes(n), `${name}: robber gets away and disappears`);
  clerk(name).closedUntil = 0;
}
ok(msgs(A, 'crook').some(m => m.ev === 'rob') && msgs(A, 'crook').some(m => m.ev === 'robbed') && msgs(A, 'crook').some(m => m.ev === 'escaped'), 'everyone is told: robbery started, store robbed, robber escaped');
C.sendCops = realCops;

// ---------------------------------------------------------------- shoot a robber: bounty + loot, no stars
{
  const n = C.startRobbery(T, 'GUN SHOP'); run(40, () => n.phase === 'rob'); C.sendCops = () => {};
  n.loot = 300;
  const c0 = A.cash || 0;
  room.npcs.damage(n, A, 30, false, 'pistol');
  ok(n.aggro && n.aggro.id === A.id, 'a robber you shoot turns on you');
  room.npcs.damage(n, A, 50, true, 'pistol');
  ok(n.state === NPC_STATE.DEAD, 'robber goes down');
  ok(A.cash === c0 + CROOK.bounty + 300, `bounty + his loot: +$${A.cash - c0}`);
  ok(!A.wanted, 'no wanted stars for shooting a robber');
  ok(!clerk('GUN SHOP').rob, 'the clerk is free again');
  run(6); ok(!room.npcs.list.includes(n), 'body cleared');
  C.sendCops = realCops;
}

// ---------------------------------------------------------------- robbers shoot back at whoever attacks them
{
  pose(A, -42, 1.6, -66);   // outside the GUN SHOP, in view
  const n = C.startRobbery(T, 'GUN SHOP'); C.sendCops = () => {};
  run(40, () => n.phase === 'rob');
  A.hp = 100; room.npcs.damage(n, A, 5, false, 'pistol');
  const shots0 = msgs(A, 'npcShot').filter(m => m.id === n.id).length;
  run(8);
  const shots = msgs(A, 'npcShot').filter(m => m.id === n.id).length - shots0;
  ok(shots >= 3, `the robber shoots back (${shots} shots, your hp ${A.hp})`);
  n.remove = true; run(0.2); clerk('GUN SHOP').rob = null; clerk('GUN SHOP').closedUntil = 0; A.hp = 100;
  pose(A, 115, 1.6, 115); C.sendCops = realCops;
}

// ---------------------------------------------------------------- police respond to an NPC robbery
{
  const n = C.startRobbery(T, 'DONUTS');
  run(40, () => n.phase === 'rob');
  ok(!room.npcs.list.some(c => c.type === NPC_TYPE.COP && c.crook === n.id), 'police aren\'t there instantly (players get a chance first)');
  run(9);
  const cops = room.npcs.list.filter(c => c.type === NPC_TYPE.COP && c.crook === n.id);
  ok(cops.length === 2, `2 NPC cops sent after the robber (${cops.length})`);
  const ended = run(90, () => !room.npcs.list.includes(n) || n.state === NPC_STATE.DEAD);
  const shotsAt = msgs(A, 'npcShot').filter(m => cops.some(c => c.id === m.id)).length;
  ok(ended, `the robber is taken down, arrested or escapes (cops fired ${shotsAt} shots, robber hp ${n.hp}${n.surrender ? ', surrendered' : ''})`);
  const got = msgs(A, 'crook').some(m => (m.ev === 'down' || m.ev === 'arrested') && m.id === n.id) || msgs(A, 'npcDie').some(m => m.id === n.id);
  ok(got || msgs(A, 'crook').some(m => m.ev === 'escaped' && m.id === n.id), got ? 'the police got him' : 'he outran the police this time (they don\'t always win)');
  run(20);
  ok(!room.npcs.list.some(c => c.type === NPC_TYPE.COP && c.crook === n.id), 'cops go off duty afterwards');
  for (const c of room.npcs.list) if (c.type === NPC_TYPE.COP) c.remove = true;
  clerk('DONUTS').closedUntil = 0; clerk('DONUTS').rob = null;
}

// ---------------------------------------------------------------- cop player arrests a robber; surrender
{
  const B = room.addPlayer(mk(2), { name: 'Officer', role: 'cop' }); B.role = 'cop'; room.spawn(B); B.protectUntil = 0;
  C.sendCops = () => {};
  const n = C.startRobbery(T, 'SNAX'); run(40, () => n.phase === 'rob');
  pose(B, n.x + 1.2, n.y + 1.6, n.z);
  const c0 = B.cash || 0;
  room.handle(B, { type: 'arrestCrook', id: n.id }); run(0.2);
  ok(!room.npcs.list.includes(n), 'cop player cuffs the robber (E / grip)');
  ok(B.cash === c0 + CROOK.arrestPay, `arrest pays $${B.cash - c0}`);
  ok(msgs(A, 'crook').some(m => m.ev === 'arrested' && m.by === B.id), 'everyone sees the arrest');
  const A2 = room.handle(A, { type: 'arrestCrook', id: 999 }); void A2;
  // a civilian can't arrest
  clerk('SNAX').closedUntil = 0; pose(B, 115, 1.6, 100);
  const m = C.startRobbery(T, 'SNAX'); run(40, () => m.phase === 'rob');
  pose(A, m.x + 1, m.y + 1.6, m.z); room.handle(A, { type: 'arrestCrook', id: m.id });
  ok(room.npcs.list.includes(m), 'civilians can\'t arrest robbers (shoot them instead)');
  // badly hurt with a cop close by: he gives up
  pose(B, m.x + 4, m.y + 1.6, m.z);
  room.npcs.damage(m, A, 45, false, 'pistol');
  ok(m.surrender && m.state === NPC_STATE.HANDSUP, 'badly hurt robber with a cop nearby surrenders (hands up)');
  run(3); ok(room.npcs.list.includes(m) && m.state === NPC_STATE.HANDSUP && !msgs(A, 'npcShot').some(s => s.id === m.id && s.o && T - 3 < T), 'he stays put with his hands up');
  pose(B, m.x + 1, m.y + 1.6, m.z); room.handle(B, { type: 'arrestCrook', id: m.id }); run(0.2);
  ok(!room.npcs.list.includes(m), 'and gets arrested');
  B.client.msgs.length = 0; room.removePlayer ? room.removePlayer(B) : null;
  pose(A, 115, 1.6, 115); clerk('SNAX').closedUntil = 0; clerk('SNAX').rob = null;
  C.sendCops = realCops;
}

// ---------------------------------------------------------------- car thief
{
  const V = room.vehicles;
  C.sendCops = () => {};
  let n = null;
  for (let tries = 0; tries < 20 && !n; tries++) { n = C.startCarTheft(T); if (!n) run(1); }
  ok(!!n, 'a car thief shows up on the sidewalk next to a car');
  const car = V.cars.find(c => c.id === n.carTarget);
  const stole = run(25, () => n.car);
  ok(stole && car.crook === n.id && car.driver === DRIVER.NPC, `he gets to the car and steals it (${(T % 1000).toFixed(0)})`);
  ok(room.npcs.list.some(q => q.runner), 'the driver runs away screaming');
  ok(msgs(A, 'crook').some(m => m.ev === 'car'), 'everyone is told a car was stolen');
  let top = 0; run(8, () => { top = Math.max(top, car.speed); return false; });
  ok(top > 9 * 1.2, `he floors it (top ${top.toFixed(1)} m/s vs 9 normal)`);
  ok(Math.hypot(n.x - car.x, n.z - car.z) < 1.2, 'the thief sits in the driver seat (hittable through the window)');
  ok(room.vehicles.snapshot().find(c => c[0] === car.id)[11] === 1, 'clients are told the car is driven by a thief');
  // take the car back from him
  pose(A, car.x + 2, 1.6, car.z); A.wanted = 0;
  room.handle(A, { type: 'hijack', id: car.id });
  ok(A.inCar === car.id && !car.crook && !A.wanted, 'taking the car back: no wanted stars');
  ok(!n.car && n.phase === 'flee', 'the thief jumps out and runs');
  room.handle(A, { type: 'exitCar' });
  n.remove = true; run(0.2);
  // a second thief joyrides and vanishes into traffic
  let m = null;
  for (let tries = 0; tries < 20 && !m; tries++) { m = C.startCarTheft(T); if (!m) run(1); }
  const car2 = V.cars.find(c => c.id === m.carTarget);
  pose(A, 115, 1.6, 115);
  run(25, () => m.car);
  run(CROOK.driveTime + 15, () => !room.npcs.list.includes(m));
  ok(!room.npcs.list.includes(m) && !car2.crook && car2.driver === DRIVER.NPC, 'after the joyride the thief is gone and the car rejoins traffic');
  // a thief shot dead while driving: the car stops
  let k = null;
  for (let tries = 0; tries < 20 && !k; tries++) { k = C.startCarTheft(T); if (!k) run(1); }
  const car3 = V.cars.find(c => c.id === k.carTarget);
  run(25, () => k.car); run(1);
  room.npcs.damage(k, A, 200, true, 'sniper');
  ok(car3.driver === DRIVER.NONE && !car3.crook, 'shooting the driver stops the stolen car');
  C.sendCops = realCops;
}

// ---------------------------------------------------------------- they keep coming on their own
{
  C.nextAt = null;
  const seen = new Set();
  for (let i = 0; i < 2400; i++) { T += 0.1; A.lastStateAt = T; room.tick(0.1); for (const c of crooks()) seen.add(c.id); if (crooks().length > CROOK.max) break; }
  ok(seen.size >= 3, `robbers show up by themselves every so often (${seen.size} in 4 minutes)`);
  ok(crooks().length <= CROOK.max, `never more than ${CROOK.max} at once`);
  const r2 = new Room('OFF', { mode: 'ffa', crooks: false }, { tokens: new Map() });
  ok(!r2.crooksOn, 'can be turned off (room option / CROOKS=off)');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL CROOK TESTS PASSED');
process.exit(failures ? 1 : 0);
