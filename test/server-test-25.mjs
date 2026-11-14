// Leaderboards: the Leaderboard class (sorting, fastest times low-to-high, ranks, one row per player), and against the
// running server: a real game save shows up on /api/leaderboard, a signed save sent on connect counts, a forged one doesn't.
// Run: node test/server-test-25.mjs   (server must be running on PORT or 3000)
import WebSocket from 'ws';
import { Leaderboard } from '../server/leaderboard.js';
import { signProfile } from '../server/profiles.js';
import { newProfile } from '../public/shared/profile.js';
const URL = process.env.URL || 'ws://localhost:3000/ws', HTTP = URL.replace('ws://', 'http://').replace('/ws', '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
console.log('CITY CHAOS server test 25 (leaderboards)');
// ---- unit
const L = new Leaderboard({ persist: false });
const mkp = (pid, cash, xp, loop, heists) => { const p = newProfile(); p.pid = pid; p.cash = cash; p.xp = xp; p.raceBest = loop ? { loop } : {}; p.stats.heists = heists; return p; };
L.update(mkp('aaaaaaaa1', 500, 100, 41.5, 1), 'Ann'); L.update(mkp('bbbbbbbb2', 9000, 5000, 38.2, 0), 'Bob'); L.update(mkp('cccccccc3', 100, 50, 0, 3), 'Cat');
let t = L.top();
ok(t.boards.wealth.map(r => r.name).join() === 'Bob,Ann,Cat', 'richest first');
ok(t.boards.loop.map(r => r.name).join() === 'Bob,Ann', 'fastest race time first (and no time = not listed)');
ok(t.boards.heists.map(r => r.name).join() === 'Cat,Ann', 'zero heists = not on the heist board');
L.update(mkp('aaaaaaaa1', 20000, 100, 41.5, 1), 'Ann');
t = L.top();
ok(t.players === 3 && t.boards.wealth[0].name === 'Ann', 'an update replaces your row (one row per player)');
ok(L.rankOf('cccccccc3').wealth === 3 && L.rankOf('bbbbbbbb2').loop === 1, 'your rank on each board');
// ---- live server
const name = 'Board' + Math.floor(Math.random() * 9999);
const ws = new WebSocket(URL); const msgs = [];
await new Promise(r => ws.on('open', r)); ws.on('message', d => msgs.push(JSON.parse(d)));
ws.send(JSON.stringify({ type: 'hello', name, cos: {} })); await sleep(200);
ws.send(JSON.stringify({ type: 'create', mode: 'ffa', name })); await sleep(300);
let pid = null;
for (let i = 0; i < 40 && !pid; i++) { await sleep(250); const s = msgs.filter(m => m.type === 'save').pop(); if (s) pid = JSON.parse(Buffer.from(s.token.split('.')[0], 'base64url')).pid; }
ok(!!pid, 'the game\'s save has a permanent player id');
let board = null;
for (let i = 0; i < 20; i++) { board = await (await fetch(`${HTTP}/api/leaderboard?pid=${pid}`)).json(); if (board.me && board.me.wealth) break; await sleep(300); }
ok(board.me && board.me.wealth >= 1, 'a real game save gets you onto the RICHEST board');
ok(board.players >= 1 && typeof board.me.wealth === 'number' && board.me.wealth <= board.players, `and the API tells you your rank (#${board.me && board.me.wealth} of ${board.players})`);
// a signed save sent on connect (like after a server restart)
const p2 = newProfile(); p2.pid = 'zzzztest' + Date.now().toString(36); p2.cash = 7777777; p2.stats.heists = 99;
ws.send(JSON.stringify({ type: 'lbSubmit', token: signProfile(p2), name: 'Comeback' })); await sleep(300);
board = await (await fetch(`${HTTP}/api/leaderboard`)).json();
ok(board.boards.wealth[0].name === 'Comeback' && board.boards.heists[0].v === 99, 'a signed save sent on connect counts (the board refills after restarts)');
// forged
const body = Buffer.from(JSON.stringify({ ...p2, pid: 'forgedforged', cash: 99999999 })).toString('base64url');
ws.send(JSON.stringify({ type: 'lbSubmit', token: body + '.fakesignature', name: 'Cheater' })); await sleep(300);
board = await (await fetch(`${HTTP}/api/leaderboard`)).json();
ok(!board.boards.wealth.some(r => r.name === 'Cheater'), 'a forged save is ignored');
ws.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
