// The BOSS CREW (in-process): an armored boss + 2 guards walk into a store, the boss holds it up for 20 s while the
// guards watch the door, they shoot anyone who comes close, can't be cuffed until worn down, big bounties, a bonus
// for the last one, the crew running together, the alert + boss health updates, and the timer.
import { Room } from '../server/room.js';
import { NPC_TYPE, NPC_STATE } from '../server/npcs.js';
import { BOSS } from '../server/crooks.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('BOSS', { mode: 'ffa', progress: false }, { tokens: new Map() }); room.now = () => T;
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; p.lastStateAt = T; };
const run = (sec, until) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const p of room.players.values()) if (p.pose) p.lastStateAt = T; room.tick(0.1); if (until && until()) return true; } return false; };
const msgs = (p, type, ev) => p.client.msgs.filter(m => m.type === type && (!ev || m.ev === ev));
const C = room.npcs.crooks;
const crew = () => room.npcs.list.filter(n => n.type === NPC_TYPE.CROOK && (n.boss || n.guard) && !n.remove && n.state !== NPC_STATE.DEAD);
console.log('CITY CHAOS server test 20 (the BOSS CREW) - in-process');
const A = room.addPlayer(mk(1), { name: 'Hero' }), K = room.addPlayer(mk(2), { name: 'Officer', role: 'cop' }); K.role = 'cop';
T += 3; room.tick(0.03); room.spawn(A); room.spawn(K); A.protectUntil = K.protectUntil = 0;
pose(A, 115, 1.6, 115); pose(K, 114, 1.6, 115);
C.nextAt = Infinity; C.bossAt = Infinity; C.sendCops = () => {};

const boss = C.startBoss(T, 'GUN SHOP');
ok(boss && boss.boss && boss.hp === BOSS.hp, `the boss spawns with ${BOSS.hp} hp`);
ok(crew().length === 3 && crew().filter(n => n.guard).length === 2 && crew().every(n => n.guard ? n.hp === BOSS.guardHp : true), 'with 2 guards');
ok(msgs(A, 'boss', 'start').length === 1 && msgs(A, 'boss', 'start')[0].shop === 'GUN SHOP', 'EVERYONE gets the boss crew alert (not just cops)');
ok(msgs(K, 'robAlert').some(m => m.boss), 'cops get a robbery alert');
ok(room.npcs.list.find(n => n.type === NPC_TYPE.SHOP && n.shop === 'GUN SHOP'), 'they go for the GUN SHOP');
run(25, () => boss.phase === 'rob');
ok(boss.phase === 'rob', 'the boss reaches the counter and pulls a gun on the clerk');
const g = crew().filter(n => n.guard);
run(3);
ok(g.every(n => n.phase === 'watch'), 'the guards stand watch by the door');
ok(msgs(A, 'boss', 'state').length > 0 && msgs(A, 'boss', 'state').pop().hp === BOSS.hp, 'boss health is sent to everyone');
// a normal robber would be done by now (6 s); the boss takes 20 s
run(8); ok(boss.phase === 'rob', 'the boss crew takes longer (20 s hold up)');
// walking up gets you shot at
const hp0 = A.hp;
{ const d = C.routes.get('GUN SHOP').door; pose(A, d.x + d.nx * 3, 1.75, d.z + d.nz * 3); } run(6);
ok(A.hp < hp0 || msgs(A, 'npcShot').some(s => s.crook) , `the guards open fire on anyone who comes close (hp ${hp0} -> ${A.hp})`);
A.hp = 100; pose(A, 115, 1.6, 115);
// cuffing a healthy guard doesn't work
pose(K, g[0].x + 1, g[0].y + 1.6, g[0].z); room.handle(K, { type: 'arrestCrook', id: g[0].id });
ok(!g[0].remove && /too tough/.test(msgs(K, 'pMsg').pop()?.text || ''), 'the boss crew can\'t be cuffed at full health');
// wear him down then cuff
g[0].hp = 40; room.handle(K, { type: 'arrestCrook', id: g[0].id });
const k0 = K.cash;
ok(g[0].remove && msgs(K, 'crook', 'bounty').pop().cash === BOSS.guardBounty, `worn down: cuffed for $${BOSS.guardBounty}`);
pose(K, 114, 1.6, 115);
run(20, () => boss.phase === 'flee');
ok(boss.phase === 'flee' && boss.loot >= BOSS.loot[0] && boss.loot <= BOSS.loot[1], `the boss empties the register ($${boss.loot}) and runs`);
run(1);
ok(g[1].phase === 'flee' || g[1].phase === 'away', 'the last guard runs with him');
// take down the guard, then the boss (last one = bonus)
const a0 = A.cash;
room.npcs.damage(g[1], A, 999, false, 'pistol');
ok(A.cash - a0 === BOSS.guardBounty, `guard down: +$${BOSS.guardBounty}`);
const a1 = A.cash, loot = boss.loot;
room.npcs.damage(boss, A, BOSS.hp + 50, false, 'pistol');
ok(A.cash - a1 === BOSS.bounty + loot + BOSS.crewBonus, `BOSS down: +$${A.cash - a1} (bounty + the loot + crew bonus)`);
ok(msgs(A, 'boss', 'over').pop()?.why === 'down', 'crew defeated message');
ok(crew().length === 0, 'no crew left');

// the crew getting away
const b2 = C.startBoss(T, 'SNAX');
ok(!!b2, 'a second boss crew');
run(6); for (const n of crew()) { n.phase = 'flee'; C.runAway(n, T, true); n.born = -999; }
for (const n of crew()) C.escaped(n, T);
ok(msgs(A, 'boss', 'over').pop()?.why === 'escaped', 'if they all get away: "the boss crew escaped"');
run(1);
// timer: boss crews show up by themselves (rarely)
C.bossAt = T + 1; room.crooksOn = true; run(3);
ok(crew().length === 3, 'boss crews show up by themselves on a timer');
ok(C.bossAt - T > BOSS.every[0] - 10, `next one in ${Math.round(C.bossAt - T)} s`);
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
