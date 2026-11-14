// Gang turf (in-process): joining a gang (saved), capturing a zone alone and faster with friends, contested zones,
// progress fading when you leave, taking a zone from another gang, cops clearing turf, turf income, no gang = nothing.
import { Room } from '../server/room.js';
import { TURFS, TURF, GANGS } from '../public/shared/turf.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('TURF', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
room.npcs.noCops = true;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const q of room.players.values()) if (q.pose) q.lastStateAt = T; room.tick(0.1); } };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; };
const Z = room.turf.zones, park = Z[0], court = Z[1];
const at = (p, z, dx = 0) => pose(p, z.p[0] + dx, 1.75, z.p[1]);
const away = (p) => pose(p, 0, 1.75, 0);
console.log('CITY CHAOS server test 19 (gang turf) - in-process');
const A = room.addPlayer(mk(), { name: 'Fang1' }), B = room.addPlayer(mk(), { name: 'Fang2' }), C = room.addPlayer(mk(), { name: 'Shark' }), D = room.addPlayer(mk(), { name: 'Cop', role: 'cop' }), E = room.addPlayer(mk(), { name: 'Loner' });
D.role = 'cop';
T += 3; room.tick(0.03); for (const p of [A, B, C, D, E]) { room.spawn(p); p.protectUntil = 0; away(p); }
ok(Z.length === 6 && Z.every(z => z.owner === 0), 'six neutral turf zones');
ok(last(A, 'turf') && last(A, 'turf').z.length === 6, 'new players get the turf map');

// no gang: standing in a zone does nothing
at(E, park); run(25);
ok(park.owner === 0 && park.prog === 0, 'no gang: you can\'t take turf');
away(E);
// joining gangs
room.handle(A, { type: 'setGang', g: 1 }); room.handle(B, { type: 'setGang', g: 1 }); room.handle(C, { type: 'setGang', g: 2 });
ok(A.gang === 1 && A.prof.gang === 1 && last(A, 'gangSet').g === 1, 'joined the RED FANGS');
room.handle(A, { type: 'setGang', g: 9 }); ok(A.gang === 1, 'junk gang numbers are ignored');
// solo capture takes ~20 s
const c0 = A.cash;
at(A, park); run(10);
ok(park.by === 1 && park.prog > 40 && park.prog < 60 && park.owner === 0, `capturing alone: about half way after 10 s (${Math.round(park.prog)}%)`);
run(11);
ok(park.owner === 1 && A.cash === c0 + TURF.capCash, `captured CHAOS PARK for the RED FANGS (+$${TURF.capCash})`);
ok(A.prof.stats.turfs === 1, 'turf counted in your stats');
ok(last(E, 'turfTaken') && /RED FANGS took over CHAOS PARK/.test(last(E, 'turfTaken').text), 'everyone hears about it');
// two members are twice as fast
at(A, court); at(B, court, 2); run(10.5);
ok(court.owner === 1, 'two gang members take a zone in about half the time');
away(A); away(B);
// contested
at(C, park); run(5); const p1 = park.prog;
at(A, park, 1); run(5);
ok(park.contested && Math.abs(park.prog - p1) < 0.01, 'a rival in the ring: CONTESTED, progress stops');
away(A); run(20);
ok(park.owner === 2, 'BLUE SHARKS take CHAOS PARK from the FANGS');
// leaving halfway: progress fades
away(C); at(A, park); run(8); away(A); const half = park.prog; run(5);
ok(park.prog < half && park.owner === 2, 'leave halfway and the progress fades');
run(20);
ok(park.prog === 0 && park.by === 0, 'all the way back to nothing');
// in a car doesn't count
// cops clear turf
const d0 = D.cash;
at(D, court); run(21);
ok(court.owner === 0 && D.cash === d0 + TURF.clearCash, `a cop clears the FANGS' turf back to neutral (+$${TURF.clearCash})`);
at(D, Z[2]); run(25);
ok(Z[2].owner === 0, 'cops can\'t take neutral turf for themselves');
away(D);
// income
const a0 = A.cash, c1 = C.cash, e0 = E.cash;
at(A, court); run(21); away(A);   // FANGS own court again (1 zone); SHARKS own the park (1 zone)
const a1 = A.cash; run(TURF.payEvery + 1);
ok(A.cash - a1 === TURF.payPer * room.turf.count(1) || A.cash - a1 === TURF.payPer * room.turf.count(1) * 2, `turf pays your gang every minute ($${A.cash - a1} for ${room.turf.count(1)} zone)`);
ok(last(C, 'turfPay') && last(C, 'turfPay').n === 1, 'the SHARKS get paid for theirs');
ok(E.cash === e0, 'no gang, no turf money');
// saved
run(6);
ok(peekToken(last(A, 'save').token).gang === 1, 'your gang is in your save');
room.handle(A, { type: 'setGang', g: 0 }); ok(A.gang === 0, 'you can leave your gang');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
