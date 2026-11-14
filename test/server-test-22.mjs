// Apartments (in-process): buying (level + cash), going home (a private unit), the trophy shelf data, safe zone (no damage),
// no going home while wanted, friends visiting, the nap, leaving, units freeing up, owning it saved.
import { Room } from '../server/room.js';
import { APT, UNITS, aptAt } from '../public/shared/apartment.js';
import { xpForLevel } from '../public/shared/levels.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('HOME', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
room.npcs.noCops = true;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const q of room.players.values()) if (q.pose) q.lastStateAt = T; room.tick(0.1); } };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
const D = room.npcs.map.aptDoor;
const atDoor = (p) => pose(p, D.keeper[0], 1.75, D.keeper[2] - 1);
const door = (p, item) => { T += 0.5; room.handle(p, { type: 'shopBuy', shop: 'APARTMENTS', item }); return last(p, 'shopResult'); };
console.log('CITY CHAOS server test 22 (apartments) - in-process');
const A = room.addPlayer(mk(), { name: 'Owner' }), B = room.addPlayer(mk(), { name: 'Friend' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B); A.protectUntil = B.protectUntil = 0;
ok(!!D && UNITS.length === APT.units, `an APARTMENTS door and ${APT.units} units`);
ok(last(A, 'aptOwn').own === 0, 'new players don\'t own one');
atDoor(A); A.cash = 99999;
let r = door(A, 'buy');
ok(r.ok === 0 && /level 4/.test(r.why), 'apartments unlock at level 4');
A.prof.xp = xpForLevel(4); room.saves.addXP(A, 0); A.cash = 1000;
r = door(A, 'buy'); ok(r.ok === 0 && A.cash === 1000, `costs $${APT.price}`);
A.cash = 6000; r = door(A, 'buy');
ok(r.ok === 1 && A.prof.apt === 1 && A.cash === 6000 - APT.price && last(A, 'aptOwn').own === 1, 'bought an apartment');
ok(door(A, 'buy').ok === 0, 'can\'t buy two');
// wanted: can't go home
A.wanted = 2; r = door(A, 'home'); ok(r.ok === 0 && /cops/.test(r.why), 'no going home with wanted stars'); A.wanted = 0;
A.prof.stats.heists = 3; A.prof.stats.raceWins = 2;
r = door(A, 'home');
const ua = UNITS[r.i];
ok(r.ok === 1 && A.apt === r.i && last(A, 'tp') && aptAt(last(A, 'tp').p[0], last(A, 'tp').p[1], last(A, 'tp').p[2]) === r.i, 'GO HOME: teleported into your own unit');
pose(A, ua.spawn[0], ua.y + 1.6, ua.spawn[2]);
const ap = last(B, 'apts').units[r.i];
ok(ap && ap[0] === A.id && ap[2].heists === 3 && ap[2].raceWins === 2 && ap[2].lvl >= 4, 'everyone gets the trophy shelf info (3 heists, 2 race wins)');
// the CONTAINER YARD turf ring is right above unit 1: no capturing from home
room.handle(A, { type: 'setGang', g: 1 }); const yard = room.turf.zones.find(z => z.id === 'yard'); run(25);
ok(yard.owner === 0 && yard.prog === 0, 'standing at home under a turf ring doesn\'t capture it');
// safe zone
A.hp = 100; room.damage(A, B, 50, 'pistol', false, [0, 0, 0]); ok(A.hp === 100, 'nobody gets hurt at home');
// nap
A.hp = 30; pose(A, ua.bed[0], ua.y + 1.6, ua.bed[2]); room.handle(A, { type: 'aptRest' });
ok(A.hp === 100, 'a nap in your bed: full health');
A.hp = 50; room.handle(A, { type: 'aptRest' }); ok(A.hp === 50, 'not again right away');
// friend visits
B.cash = 0; atDoor(B);
r = door(B, 'buy'); ok(r.ok === 0, 'the friend can\'t buy one (too low level)');
r = door(B, 'visit:' + A.id);
ok(r.ok === 1 && B.apt === A.apt, 'a friend visits while you\'re home');
pose(B, ua.spawn[0] + 1, ua.y + 1.6, ua.spawn[2]); run(1);
ok(B.apt === A.apt, 'they stay while inside');
// owner leaves: guests are walked out, unit freed
room.handle(A, { type: 'aptLeave' }); run(0.5);
ok(A.apt === -1 && B.apt === -1 && !room.apts.units.some(u => u.owner), 'you leave: friends go back out too, the unit is free again');
ok(last(A, 'tp').p[2] < D.keeper[2], 'back outside the APARTMENTS door');
atDoor(B); r = door(B, 'visit:' + A.id); ok(r.ok === 0, 'can\'t visit when they\'re not home');
// walking out by teleport/respawn counts as leaving
r = door(A, 'home'); run(0.5); pose(A, 0, 1.75, 0); run(3);
ok(A.apt === -1 && !room.apts.units.some(u => u.owner), 'respawning / leaving any other way frees the unit');
run(6);
ok(peekToken(last(A, 'save').token).apt === 1, 'owning an apartment is saved');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
