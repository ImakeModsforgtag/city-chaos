// Parties (real WebSocket clients against the running server): making a party, joining by code, wrong codes,
// the leader creating a room pulls everyone in, joining a party while the leader is already in a room,
// quick match with a party, a new leader when the leader leaves, reconnecting keeps your spot.
// Run: node test/server-test-23.mjs   (server must be running on PORT or 3000)
import WebSocket from 'ws';
const URL = process.env.URL || 'ws://localhost:3000/ws';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
class Bot {
  constructor(name) { this.name = name; this.msgs = []; }
  connect() { return new Promise((res) => { this.ws = new WebSocket(URL); this.ws.on('open', () => { this.send({ type: 'hello', name: this.name, cos: {} }); res(); });
    this.ws.on('message', (d) => { const m = JSON.parse(d); this.msgs.push(m); if (m.type === 'joined') this.room = m.room?.code || m.code || m.room; if (m.type === 'partyKey') this.pk = m;
      // auto-follow like the real client does
      if (m.type === 'partyGo' && this.follow !== false) this.send({ type: 'join', code: m.room, name: this.name }); }); }); }
  send(m) { this.ws.send(JSON.stringify(m)); }
  last(type) { return this.msgs.filter(m => m.type === type).pop(); }
  async until(f, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = f(); if (r) return r; await sleep(40); } return f(); }
  close() { this.ws.close(); }
}
const roomOf = (b) => { const j = b.msgs.filter(m => m.type === 'joined').pop(); return j && (j.room && j.room.code || j.code); };
console.log('CITY CHAOS server test 23 (parties) - WebSocket');
const A = new Bot('Leader'), B = new Bot('Buddy'), C = new Bot('Late'), D = new Bot('Stranger');
for (const b of [A, B, C, D]) await b.connect();
await sleep(200);
A.send({ type: 'partyCreate', name: 'Leader' });
const pa = await A.until(() => A.last('party'));
ok(pa && /^[A-Z0-9]{5}$/.test(pa.code) && pa.leader && pa.members.length === 1, `made a party (code ${pa && pa.code})`);
const code = pa.code;
D.send({ type: 'partyJoin', code: 'ZZZZZ' });
ok(!!(await D.until(() => D.last('partyError'))), 'a wrong code gets an error');
B.send({ type: 'partyJoin', code, name: 'Buddy' });
await B.until(() => B.last('party'));
ok(B.last('party').members.length === 2 && !B.last('party').leader, 'a friend joins with the code');
ok((await A.until(() => A.msgs.filter(m => m.type === 'party').pop().members.length === 2)), 'the leader sees them');
// leader creates a room -> B follows
A.send({ type: 'create', mode: 'ffa', name: 'Leader' });
const ra = await A.until(() => roomOf(A));
const go = await B.until(() => B.last('partyGo'));
ok(go && go.room === ra, `the leader made room ${ra}: the party is sent there`);
ok(await B.until(() => roomOf(B) === ra), 'and the friend lands in the same room');
// C joins the party late: goes straight to the leader's room
C.send({ type: 'partyJoin', code, name: 'Late' });
ok(await C.until(() => roomOf(C) === ra), 'joining the party while the leader is in a room takes you there');
ok(!roomOf(D), 'someone not in the party stays put');
// the party screen shows where everyone is
const st = await A.until(() => { const p = A.last('party'); return p && p.members.length === 3 && p.members.every(m => m.room === ra) && p; });
ok(!!st, 'the party list shows everyone in the room');
// leader does a quick match -> everyone follows
A.send({ type: 'quick', name: 'Leader' });
const rq = await A.until(() => { const r = roomOf(A); return r !== ra && r; });
ok(rq && await B.until(() => roomOf(B) === rq) && await C.until(() => roomOf(C) === rq), 'quick match: the whole party goes together');
// a member (not leader) moving rooms doesn't drag anyone
B.send({ type: 'create', mode: 'ffa', name: 'Buddy' });
const rb = await B.until(() => { const r = roomOf(B); return r !== rq && r; });
await sleep(500);
ok(rb && roomOf(A) === rq && roomOf(C) === rq, 'only the leader pulls the party');
// leader leaves the party: new leader
A.send({ type: 'partyLeave' });
await A.until(() => A.msgs.filter(m => m.type === 'party').pop().code === null);
const nl = await B.until(() => { const p = B.last('party'); return p && p.members.length === 2 && p; });
ok(nl && nl.members.some(m => m.leader) && !nl.members.some(m => m.name === 'Leader'), 'the leader leaves: someone else becomes leader');
// reconnect keeps your spot
const key = C.pk; C.close(); await sleep(400);
const C2 = new Bot('Late'); await C2.connect(); C2.send({ type: 'partyRejoin', code: key.code, key: key.key, name: 'Late' });
ok(await C2.until(() => { const p = C2.last('party'); return p && p.code === code; }), 'reconnecting (page reload) puts you back in your party');
for (const b of [A, B, C2, D]) b.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
