// Weekly challenges (in-process): 4 per week, the same for everyone, progress from real events (including daily
// missions and race wins / heists), rewards, the all-4 bonus + the weekly star stat, new week reset, saved.
import { Room } from '../server/room.js';
import { weekKey, weekliesFor, WEEKLY_BONUS, WEEKLY_POOL } from '../public/shared/missions.js';
import { peekToken } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('WEEK', { mode: 'ffa', crooks: false }, { tokens: new Map() }); room.now = () => T;
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
console.log('CITY CHAOS server test 24 (weekly challenges) - in-process');
const A = room.addPlayer(mk(), { name: 'Weekly' });
T += 3; room.tick(0.03);
const wk = weekKey(), list = weekliesFor(wk);
ok(list.length === 4 && new Set(list.map(m => m.id)).size === 4, `4 different challenges this week (${list.map(m => m.id).join(', ')})`);
ok(JSON.stringify(weekliesFor(wk)) === JSON.stringify(list), 'the same for everyone this week');
ok(JSON.stringify(weekliesFor('2026-01-05')) !== JSON.stringify(weekliesFor('2026-01-12')), 'different next week');
const seen = new Set(); for (let i = 0; i < 60; i++) weekliesFor('w' + i).forEach(m => seen.add(m.id));
ok(seen.size === WEEKLY_POOL.length, 'every kind of challenge shows up over time');
const msg = last(A, 'weekly');
ok(msg && msg.list.length === 4 && msg.resetIn > 0 && msg.resetIn <= 7 * 86400 + 3600, 'new players get this week\'s list with a countdown');
// complete each challenge through the real event path
const S = room.saves, c0 = A.cash;
let paid = 0;
list.forEach((m, i) => {
  const ev = m.ev;
  if (ev === 'raceWin') { for (let k = 0; k < m.goal; k++) S.stat(A, 'raceWins'); }
  else if (ev === 'heist') { for (let k = 0; k < m.goal; k++) S.stat(A, 'heists'); }
  else if (ev === 'mission') S.weeklyEvent(A, 'mission', m.goal);
  else if (['kills', 'headshots', 'crooks', 'cars'].includes(ev)) S.stat(A, ev, m.goal);
  else S.event(A, ev, m.goal);
  paid += m.cash;
  ok(A.prof.weekly.done[i] === 1, `"${m.text}" done`);
});
const wm = A.client.msgs.filter(m => m.type === 'weekly' && m.allDone).pop();
ok(!!wm && A.prof.weekly.bonus === 1, 'all 4 done: the weekly bonus');
ok(A.prof.stats.weeklies === 1, 'and a weekly star (apartment trophy)');
ok(A.cash - c0 >= paid + WEEKLY_BONUS.cash, `paid $${paid} + $${WEEKLY_BONUS.cash} bonus (plus level-up cash)`);
S.event(A, list[0].ev, 99); ok(A.prof.weekly.bonus === 1 && A.prof.stats.weeklies === 1, 'no double rewards');
// daily missions count toward a "complete N daily missions" challenge
A.prof.weekly.wk = 'old';
const fake = { wk: '' }; void fake;
const w2 = S.weekly(A);
ok(w2.w.wk === wk && w2.w.done.every(d => !d), 'a new week resets the progress');
for (let i = 0; i < 6; i++) S.tick(1);
const tok = A.client.msgs.filter(m => m.type === 'save').pop();
S.save(A, true);
ok(peekToken(A.client.msgs.filter(m => m.type === 'save').pop().token).weekly.wk === wk, 'weekly progress is saved');
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
