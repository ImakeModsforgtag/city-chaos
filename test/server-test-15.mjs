// CITY BANK + jobs (in-process): deposits / withdrawals, interest, savings safe from knockouts + arrests,
// the vault heist (drill, alarm, open, grab, escape or lose it, lockdown), food delivery and taxi jobs.
import { Room } from '../server/room.js';
import { BANK, JOBS, jobPay, bankInterest } from '../public/shared/economy.js';
import { NPC_TYPE } from '../server/npcs.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('BANK', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
const run = (sec, until) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const q of room.players.values()) if (q.pose) q.lastStateAt = T; room.tick(0.1); if (until && until()) return true; } return false; };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
const M = room.npcs.map, B = M.bank;
const teller = room.npcs.list.find(n => n.type === NPC_TYPE.SHOP && n.shop === 'CITY BANK');
const atTeller = (p) => pose(p, teller.x - Math.sin(teller.yaw) * 3, teller.y + 1.6, teller.z - Math.cos(teller.yaw) * 3);
const buy = (p, shop, item) => { T += 0.5; room.handle(p, { type: 'shopBuy', shop, item }); return last(p, 'shopResult'); };

console.log('CITY CHAOS server test 15 (CITY BANK + jobs) - in-process');
const A = room.addPlayer(mk(), { name: 'Saver' });
const C = room.addPlayer(mk(), { name: 'Officer', role: 'cop' }); C.role = 'cop';
T += 3; room.tick(0.03); room.spawn(A); room.spawn(C); A.protectUntil = C.protectUntil = 0;

// ---------------------------------------------------------------- savings
ok(!!teller && !!B && !!M.jobBoard, 'the map has a CITY BANK teller, a vault and a JOBS kiosk');
atTeller(A); A.cash = 1000;
let r = buy(A, 'CITY BANK', 'dep500');
ok(r.ok === 1 && A.cash === 500 && A.prof.bank === 500 && r.bank === 500, 'deposit $500');
r = buy(A, 'CITY BANK', 'depall');
ok(r.ok === 1 && A.cash === 0 && A.prof.bank === 1000, 'deposit ALL');
r = buy(A, 'CITY BANK', 'dep100');
ok(r.ok === 0, 'can\'t deposit cash you don\'t have');
r = buy(A, 'CITY BANK', 'wd100');
ok(r.ok === 1 && A.cash === 100 && A.prof.bank === 900, 'withdraw $100');
run(6); ok(A.prof.stats.earned === 0 && A.prof.stats.spent === 0, 'moving money in and out of the bank isn\'t "earned" or "spent"');
ok(peekToken(last(A, 'save').token).bank === 900, 'savings are saved with your profile');
// interest
ok(bankInterest(1000, 86400000).gain === 20 && bankInterest(100000, 86400000).gain === 1000 && bankInterest(1000, 3600e3).gain === 0, 'interest: 2% a day, capped at $1000/day');
A.prof.bankAt -= 86400000 * 2;   // two days pass
const g = room.bank.accrue(A);
ok(g === Math.floor(900 * (1.02 ** 2 - 1)) && A.prof.bank === 900 + g, `2 days of interest: +$${g}`);
// far from the teller
pose(A, 0, 1.6, 0); r = buy(A, 'CITY BANK', 'wd100'); ok(r.ok === 0, 'you have to be at the teller');

// ---------------------------------------------------------------- savings are safe, pocket cash isn't
{
  A.cash = 1000; const bank0 = A.prof.bank, c0 = C.cash;
  room.kill(A, C, 'pistol', false);
  ok(A.cash === 1000 - 100 && last(C, 'cashGot') && A.prof.bank === bank0, 'knocked out: the killer grabs 10% of the cash you carry, your savings are safe');
  ok(last(A, 'cashLost').amt === 100 && last(C, 'cashGot').amt === 100, 'both players are told');
  room.spawn(A); A.protectUntil = 0;
  A.cash = 5000; room.kill(A, C, 'pistol', false);
  ok(A.cash === 5000 - BANK.deathLossMax, `at most $${BANK.deathLossMax} is grabbed`);
  room.spawn(A); A.protectUntil = 0;
  A.cash = 400; A.wanted = 2; pose(A, 0, 1.6, 0);
  const c1 = C.cash;
  room.prison.arrest(A, C, null);
  ok(A.cash === 300 && C.cash >= c1 + 50 + 0, 'arrested: police confiscate 25% (half to the cop)');
  run(40, () => !A.jail && !A.holding); A.jail = null; A.holding = null; room.spawn(A); A.protectUntil = 0; A.wanted = 0;
}

// ---------------------------------------------------------------- the heist
{
  ok(room.bank.door.off !== true, 'the vault door starts closed (solid)');
  const room2 = new Room('B2', { mode: 'ffa', crooks: false }, { tokens: new Map() });
  ok(room2.bank.door !== room.bank.door, 'every room has its own vault door');
  // a cop can't drill
  pose(C, B.drill[0], B.drill[1] + 1.6, B.drill[2]);
  room.handle(C, { type: 'heist', a: 'drill' });
  ok(room.bank.state === 'closed', 'cops can\'t crack the vault');
  pose(C, 0, 1.6, 40);
  // drilling
  A.wanted = 0; pose(A, B.drill[0], B.drill[1] + 1.6, B.drill[2]);
  room.handle(A, { type: 'heist', a: 'drill' });
  ok(room.bank.state === 'drilling' && A.wanted === BANK.heist.wantedDrill, `drilling sets off the alarm: ${A.wanted} stars`);
  ok(last(C, 'robAlert') && last(C, 'robAlert').bank === 1 && last(C, 'bankAlarm'), 'cops get the alarm');
  // stop drilling: the progress drains
  run(0.3); for (let i = 0; i < 10; i++) { T += 0.3; room.handle(A, { type: 'heist', a: 'drill' }); }
  const prog = room.bank.progress;
  run(3);
  ok(room.bank.progress < prog, 'stop drilling and the progress drains');
  // drill all the way (keep NPC cops away for the test)
  room.npcs.list = room.npcs.list.filter(n => n.type !== NPC_TYPE.COP); room.npcs.spawnCopsFor = () => {};
  for (let i = 0; i < 120 && room.bank.state !== 'open'; i++) { T += 0.3; A.lastStateAt = T; room.handle(A, { type: 'heist', a: 'drill' }); room.tick(0.01); }
  ok(room.bank.state === 'open' && room.bank.door.off === true, 'after 20 s the vault door opens (you can walk in)');
  ok(last(C, 'bank').ev === 'open' && last(C, 'bank').loot.join() === '1,1,1', 'everyone sees it open with 3 cash stacks');
  // grab
  room.handle(A, { type: 'heist', a: 'grab', i: 0 });
  ok(!A.heistLoot, 'too far from the stack: nothing');
  pose(A, B.loot[0][0], B.loot[0][1] + 1.6, B.loot[0][2]);
  const w0 = A.wanted;
  room.handle(A, { type: 'heist', a: 'grab', i: 0 });
  ok(A.heistLoot >= BANK.heist.loot[0] && A.wanted === Math.min(5, w0 + 1) && room.bank.loot[0] === 0, `grabbed a $${A.heistLoot} stack (+1 star)`);
  room.handle(A, { type: 'heist', a: 'grab', i: 1 });
  ok(room.bank.loot[1] > 0, 'one stack at a time');
  // escape
  const cash0 = A.cash, loot = A.heistLoot;
  pose(A, B.center[0] + 60, 1.6, B.center[2]); run(0.5);
  ok(A.heistLoot === loot, 'still carrying it at 60 m');
  pose(A, B.center[0] + BANK.heist.escape + 5, 1.6, B.center[2]); run(0.5);
  ok(!A.heistLoot && A.cash >= cash0 + loot && last(A, 'heist').paid === loot, `escaped ${BANK.heist.escape} m away: +$${loot}`);
  ok(A.prof.stats.heists === 1 && last(C, 'heistEnd').ok === 1, 'heist counted, everyone hears about it');
  // a second robber gets caught
  const D = room.addPlayer(mk(), { name: 'Unlucky' }); room.spawn(D); D.protectUntil = 0;
  pose(D, B.loot[2][0], B.loot[2][1] + 1.6, B.loot[2][2]);
  room.handle(D, { type: 'heist', a: 'grab', i: 2 });
  const dl = D.heistLoot, dc = D.cash;
  ok(dl > 0, 'someone else grabs another stack');
  room.kill(D, C, 'pistol', false); run(0.5);
  ok(!D.heistLoot && D.cash <= dc && last(D, 'heist').lost === 1, 'knocked out on the way: the stolen cash is gone');
  // vault closes, lockdown
  pose(A, 0, 1.6, 0); pose(D, 0, 1.6, 0);
  run(BANK.heist.openTime + 2);
  ok(room.bank.state === 'lockdown' && room.bank.door.off === false, 'the vault closes and the bank goes on lockdown');
  pose(A, B.drill[0], B.drill[1] + 1.6, B.drill[2]); A.wanted = 0;
  room.handle(A, { type: 'heist', a: 'drill' });
  ok(room.bank.state === 'lockdown' && last(A, 'bank').lock > 0, `no drilling during lockdown (${last(A, 'bank').lock}s left)`);
  T += BANK.heist.cooldown + 1; room.tick(0.1);
  ok(room.bank.state === 'closed', 'after the lockdown the vault can be cracked again');
  const E = room.addPlayer(mk(), { name: 'Late' });
  ok(E.client.msgs.some(m => m.type === 'bank' && m.state === 'closed'), 'new players get the vault state when they join');
}

// ---------------------------------------------------------------- jobs
{
  const J = room.addPlayer(mk(), { name: 'Worker' }); room.spawn(J); J.protectUntil = 0; J.wanted = 0;
  const jb = M.jobBoard;
  pose(J, 0, 1.6, 0);
  r = buy(J, 'JOB BOARD', 'delivery'); ok(r.ok === 0, 'you take jobs at the JOBS kiosk');
  pose(J, jb[0], jb[1] + 1.6, jb[2]);
  r = buy(J, 'JOB BOARD', 'delivery');
  ok(r.ok === 1 && J.job && J.job.phase === 'pickup' && last(J, 'job').kind === 'delivery', `delivery job started: "${J.job.text}"`);
  const pick = J.job.target;
  pose(J, pick[0], pick[1] + 1.6, pick[2]); run(0.5);
  ok(J.job.phase === 'drop' && J.job.until > T && J.job.pay > 0, `picked up: "${J.job.text}" for $${J.job.pay} within ${Math.round(J.job.until - T)}s`);
  const drop = J.job.target, pay = J.job.pay, c0 = J.cash, x0 = J.prof.xp;
  pose(J, drop[0], drop[1] + 1.6, drop[2]); run(0.5);
  ok(!J.job && J.cash === c0 + pay && last(J, 'job').result === 'paid', `delivered on time: +$${pay}`);
  ok(J.prof.stats.jobs === 1 && J.prof.xp > x0, 'job counted + XP');
  // late
  pose(J, jb[0], jb[1] + 1.6, jb[2]); buy(J, 'JOB BOARD', 'delivery');
  pose(J, J.job.target[0], J.job.target[1] + 1.6, J.job.target[2]); run(0.5);
  const lateT = J.job.until - T + 5, lp = J.job.pay, c1 = J.cash;
  T += lateT; pose(J, J.job.target[0], J.job.target[1] + 1.6, J.job.target[2]); run(0.5);
  ok(J.cash - c1 === Math.round(lp / 2 / 5) * 5 && last(J, 'job').result === 'late', 'late delivery: half pay');
  // too late
  pose(J, jb[0], jb[1] + 1.6, jb[2]); buy(J, 'JOB BOARD', 'delivery');
  pose(J, J.job.target[0], J.job.target[1] + 1.6, J.job.target[2]); run(0.5);
  T += J.job.until - T + 40; run(0.5);
  ok(!J.job && last(J, 'job').result === 'timeout', 'way too late: the customer cancels');
  // quit
  pose(J, jb[0], jb[1] + 1.6, jb[2]); buy(J, 'JOB BOARD', 'delivery');
  room.handle(J, { type: 'jobQuit' }); ok(!J.job && last(J, 'job').result === 'quit', 'quit a job any time');

  // taxi
  buy(J, 'JOB BOARD', 'taxi');
  ok(J.job && J.job.phase === 'needcar', 'taxi job: first get a car');
  const car = room.vehicles.cars.find(c => c.driver === 1 && !c.police) || room.vehicles.cars[0];
  pose(J, car.x + 2, 1.6, car.z); room.handle(J, { type: 'hijack', id: car.id });
  run(0.5);
  ok(J.inCar === car.id && J.job.phase === 'pickup' && J.job.fareId, 'in a car: a passenger waits on the sidewalk');
  const fare = room.npcs.list.find(n => n.id === J.job.fareId);
  ok(fare && fare.fare === J.id, 'the passenger is a real person in the city');
  // drive there (teleport the car next to them, stopped)
  const pt = J.job.target;
  car.x = pt[0] + 3; car.z = pt[2]; car.speed = 0; run(0.5);
  ok(J.job.phase === 'drop' && !room.npcs.list.includes(fare), 'stop next to them: they get in');
  const tp = J.job.pay, tc = J.cash;
  car.x = J.job.target[0] + 2; car.z = J.job.target[2]; car.speed = 10; run(0.3);
  ok(J.job && J.job.phase === 'drop', 'driving past at speed doesn\'t count, you have to stop');
  car.speed = 0; run(0.5);
  ok(!J.job && J.cash >= tc + tp && last(J, 'job').paid === tp, `dropped off: +$${tp}`);
  // leave the car too long with a passenger
  room.handle(J, { type: 'exitCar' }); run(0.3);
  pose(J, jb[0], jb[1] + 1.6, jb[2]); buy(J, 'JOB BOARD', 'taxi');
  pose(J, car.x + 2, 1.6, car.z); room.handle(J, { type: 'hijack', id: car.id }); run(0.5);
  ok(J.job && J.job.phase === 'pickup', 'back in a car: off to the next passenger');
  room.handle(J, { type: 'exitCar' });
  run(17);
  ok(!J.job && last(J, 'job').result === 'failed', 'out of the car too long: the job is off');
  ok(!room.npcs.list.some(n => n.fare === J.id), 'the waiting passenger leaves');
  ok(jobPay('taxi', 100) === Math.round((JOBS.taxi.base + JOBS.taxi.perM * 100) / 5) * 5, 'pay grows with the distance');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL BANK + JOB TESTS PASSED');
process.exit(failures ? 1 : 0);
