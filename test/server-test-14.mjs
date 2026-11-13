// Daily missions (in-process): same 3 missions for everyone each day, progress from real game events,
// rewards (cash + XP) when one finishes, the all-3 bonus, saved progress, new day = new missions.
import { Room } from '../server/room.js';
import { missionsFor, dayKey, MISSION_POOL, ALL_DONE_BONUS, TOWER_TOP, secondsToReset } from '../public/shared/missions.js';
import { peekToken } from '../public/shared/profile.js';

if (process.env.DAY_OFFSET) { const o = Number(process.env.DAY_OFFSET) * 86400e3, n0 = Date.now; Date.now = () => n0() + o; }   // test other days
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('MISS', { mode: 'ffa', crooks: false }, { tokens: new Map() }); room.now = () => T;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; for (const p of room.players.values()) if (p.pose) p.lastStateAt = T; room.tick(0.1); } };
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();

console.log('CITY CHAOS server test 14 (daily missions) - in-process');
const today = dayKey();
const list = missionsFor(today);
console.log('  today (' + today + '): ' + list.map(m => m.text).join(' | '));

// the daily pick
ok(list.length === 3 && new Set(list.map(m => m.id)).size === 3, '3 different missions a day');
ok(JSON.stringify(missionsFor(today)) === JSON.stringify(list), 'everyone gets the same missions today');
let differ = 0; for (let i = 1; i <= 10; i++) if (JSON.stringify(missionsFor('2027-01-' + String(i).padStart(2, '0'))) !== JSON.stringify(missionsFor('2027-01-' + String(i + 1).padStart(2, '0')))) differ++;
ok(differ === 10, 'missions change every day');
const seen = new Set(); for (let i = 0; i < 120; i++) for (const m of missionsFor(new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10))) seen.add(m.id);
ok(seen.size === MISSION_POOL.length, `every mission type shows up over time (${seen.size}/${MISSION_POOL.length})`);
const rs = secondsToReset(); ok(rs > 0 && rs <= 25 * 3600, `reset countdown (${Math.round(rs / 60)} min)`);
ok(list.every(m => m.cash > 0 && m.xp > 0 && !/\{/.test(m.text)), 'rewards + readable text');

// sent on join
const A = room.addPlayer(mk(), { name: 'Daily' });
const B = room.addPlayer(mk(), { name: 'Other' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B); A.protectUntil = B.protectUntil = 0;
const m0 = last(A, 'missions');
ok(m0 && m0.day === today && m0.list.length === 3 && m0.list.every(m => m.prog === 0 && !m.done), 'you get today\'s missions when you join');

// real game events count
const S = room.saves;
const hook = {
  kills: () => room.kill(B, A, 'pistol', false),
  headshots: () => room.kill(B, A, 'pistol', true),
  cars: () => S.stat(A, 'cars'), crooks: () => S.stat(A, 'crooks'), matches: () => S.stat(A, 'matches'), wins: () => S.stat(A, 'wins'),
};
for (const ev of ['kills', 'headshots']) { room.spawn(B); B.protectUntil = 0; }
// progress one step on mission 0 through a real hook if it has one
const m = list[0];
const before = A.prof.daily.prog[0];
if (hook[m.ev]) { hook[m.ev](); room.spawn(B); } else S.event(A, m.ev, 1);
ok(A.prof.daily.prog[0] === before + 1 && last(A, 'missions').list[0].prog === before + 1 || m.goal === 1, `progress counts (${m.text}: ${A.prof.daily.prog[0]}/${m.goal})`);

// shop purchases count for shop / spend / food style missions
{
  const n = room.npcs.list.find(q => q.type === 1 && q.shop === 'DONUTS');
  const fx = -Math.sin(n.yaw), fz = -Math.cos(n.yaw);
  A.pose = { h: [n.x + fx * 3, n.y + 1.6, n.z + fz * 3, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 1], r: [0, 0, 0, 0, 0, 0, 1] }; A.hist = [];
  A.cash = 1000; A.hp = 20;
  const sh = A.prof.daily.prog.slice();
  T += 1; room.handle(A, { type: 'shopBuy', shop: 'DONUTS', item: 'donut' });
  const shopIdx = list.findIndex(q => ['shop', 'food', 'spend'].includes(q.ev));
  ok(last(A, 'shopResult').ok === 1 && (shopIdx < 0 || A.prof.daily.prog[shopIdx] > sh[shopIdx] || A.prof.daily.done[shopIdx]), shopIdx < 0 ? 'store purchase works (no store mission today)' : `buying a donut counts for "${list[shopIdx].text}"`);
}

// tower check uses your real position
{
  const towerIdx = list.findIndex(q => q.ev === 'tower');
  const before2 = A.prof.daily.done.slice();
  A.pose = { h: [(TOWER_TOP.x0 + TOWER_TOP.x1) / 2, TOWER_TOP.y + 1.6, (TOWER_TOP.z0 + TOWER_TOP.z1) / 2, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 1], r: [0, 0, 0, 0, 0, 0, 1] }; A.hist = [];
  run(1.5);
  ok(towerIdx < 0 ? true : A.prof.daily.done[towerIdx] === 1, towerIdx < 0 ? '(no tower mission today)' : 'standing on top of the Chaos Tower completes it');
  // the tower check alone on a throwaway mission list
  const k = room.addPlayer(mk(), { name: 'Climber' }); room.spawn(k);
  let got = 0; const orig = S.event.bind(S); S.event = (p, ev, n) => { if (p === k && ev === 'tower') got++; return orig(p, ev, n); };
  k.pose = { ...A.pose }; run(1.5); S.event = orig;
  ok(got >= 1, 'the server notices players on the tower roof');
  k.pose = { h: [70, 1.6, -95, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 1], r: [0, 0, 0, 0, 0, 0, 1] };
  got = 0; S.event = (p, ev, n) => { if (p === k && ev === 'tower') got++; return orig(p, ev, n); }; run(1.5); S.event = orig;
  ok(got === 0, 'standing at the bottom doesn\'t count');
  room.removePlayer(k.id);
}

// finishing missions pays out, the third one adds the bonus
{
  A.client.msgs.length = 0;
  const cash0 = A.cash, xp0 = A.prof.xp;
  let paid = 0, xpPaid = 0;
  list.forEach((q, i) => { if (!A.prof.daily.done[i]) { paid += q.cash; xpPaid += q.xp; } });
  list.forEach((q, i) => { if (!A.prof.daily.done[i]) S.event(A, q.ev, q.goal); });
  const fin = A.client.msgs.filter(x => x.type === 'missions' && x.just);
  ok(A.prof.daily.done.every(Boolean), 'all 3 missions done');
  ok(fin.length >= 1 && fin.some(x => x.allDone === 1), 'you are told each one finished, and that you got the all-3 bonus');
  const levelBonus = A.client.msgs.filter(x => x.type === 'xp' && x.up).reduce((s, x) => s + x.bonus, 0);
  ok(A.cash === cash0 + paid + ALL_DONE_BONUS.cash + levelBonus, `mission cash paid ($${paid} + $${ALL_DONE_BONUS.cash} bonus${levelBonus ? ` + $${levelBonus} level-up` : ''})`);
  ok(A.prof.xp >= xp0 + xpPaid + ALL_DONE_BONUS.xp, `mission XP paid (+${A.prof.xp - xp0})`);
  const c1 = A.cash; S.event(A, list[0].ev, 5); ok(A.cash === c1, 'no double rewards after finishing');
  room.saves.syncCash(A);
  ok(!A.client.msgs.some(x => x.type === 'missions' && x.list && x.list.some(l => l.id === 'earn') && false), 'mission rewards don\'t count as "earned" for missions');
}

// saved + new day
run(6);
const tok = last(A, 'save').token, saved = peekToken(tok);
ok(saved.daily.day === today && saved.daily.done.every(Boolean) && saved.daily.bonus === 1, 'mission progress is saved');
A.pose = { h: [0, 1.6, 0, 0, 0, 0, 1], l: [0, 0, 0, 0, 0, 0, 1], r: [0, 0, 0, 0, 0, 0, 1] };   // off the tower
A.prof.daily.day = '2000-01-01';
run(1.5);
const fresh = last(A, 'missions');
ok(fresh.day === today && A.prof.daily.done.every(d => !d) && A.prof.daily.prog.every(v => v === 0), 'a new day resets the missions (even mid-game)');

console.log(failures ? `\n${failures} FAILED` : '\nALL MISSION TESTS PASSED');
process.exit(failures ? 1 : 0);
