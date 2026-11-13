// Tutorial reward (in-process): finishing the tutorial pays $100 + 50 XP once per save; skipping pays nothing;
// the "seen it" flag survives in the signed save so it never pays twice.
import { Room } from '../server/room.js';
import { peekToken } from '../public/shared/profile.js';
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('TUTO', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
console.log('CITY CHAOS server test 16 (tutorial reward) - in-process');

const A = room.addPlayer(mk(), { name: 'Newbie' });
T += 3; room.tick(0.03);
const hello = last(A, 'profile');
ok(hello && !hello.tut, 'a new save has not seen the tutorial');
const cash0 = A.cash, xp0 = A.prof.xp;
room.handle(A, { type: 'tutorial', a: 'done' });
const r = last(A, 'tutReward');
ok(r && r.cash === 100 && A.cash === cash0 + 100, `finishing pays $100 (${cash0} -> ${A.cash})`);
ok(A.prof.xp === xp0 + 50, `and 50 XP (${xp0} -> ${A.prof.xp})`);
room.handle(A, { type: 'tutorial', a: 'done' });
ok(A.cash === cash0 + 100 && A.client.msgs.filter(m => m.type === 'tutReward').length === 1, 'it only pays once');
const tok = last(A, 'save');
const saved = tok && peekToken(tok.token || tok.t || tok.profile);
ok(saved ? saved.tut === 1 : A.prof.tut === 1, 'the save remembers it');

// rejoin with that save: still marked, no second reward
const B = room.addPlayer(mk(), { name: 'Back', profile: tok && (tok.token || tok.t || tok.profile) });
T += 3; room.tick(0.03);
ok(last(B, 'profile')?.tut === 1, 'coming back with the save: tutorial already done');
room.handle(B, { type: 'tutorial', a: 'done' });
ok(!last(B, 'tutReward'), 'no second reward with the same save');

// skipping marks it seen but pays nothing
const C = room.addPlayer(mk(), { name: 'Skipper' });
T += 3; room.tick(0.03);
const c0 = C.cash;
room.handle(C, { type: 'tutorial', a: 'skip' });
ok(C.prof.tut === 1 && C.cash === c0 && !last(C, 'tutReward'), 'skipping marks it seen, no reward');
room.handle(C, { type: 'tutorial', a: 'done' });
ok(C.cash === c0, 'and you can\'t claim it after skipping');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
