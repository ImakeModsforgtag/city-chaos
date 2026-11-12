// Mod menu test (in-process): nothing works before the secret unlock; then infinite ammo, auto fire on any gun,
// custom gun damage, god mode, explosive bullets, cops ignore me, give / cash / heal / teleport, and MODS=off.
import { Room } from '../server/room.js';
import { MOD_PLACES } from '../public/shared/mods.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
const mk = (id) => ({ id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } });
let T = 1000;
const room = new Room('MOD1', { mode: 'ffa', crimes: false }, { tokens: new Map() });
room.now = () => T;
const last = (p, type) => p.client.msgs.filter(m => m.type === type).pop();
const pose = (p, x, y, z) => { p.pose = { h: [x, y, z, 0, 0, 0, 1], l: [x, y - 0.5, z, 0, 0, 0, 1], r: [x, y - 0.5, z, 0, 0, 0, 1] }; p.hist = []; p.lastStateAt = T; };
const shoot = (p, d) => { const s = p.slots[p.cur]; room.handle(p, { type: 'shoot', w: s.w, o: p.pose.h.slice(0, 3), d: [d] }); };
const mod = (p, k, v) => room.handle(p, { type: 'mod', k, v });

console.log('CITY CHAOS server test 9 (mod menu) - in-process');
const A = room.addPlayer(mk(1), { name: 'Modder' });
const B = room.addPlayer(mk(2), { name: 'Target' });
T += 3; room.tick(0.03);
for (const p of [A, B]) { room.spawn(p); p.protectUntil = 0; }
pose(A, 0, 60, 0); pose(B, 0, 60, -20);

// locked until the code is entered
mod(A, 'inf', true); mod(A, 'god', true);
ok(!A.mods, 'mods do nothing before the secret unlock');
mod(A, 'unlock');
ok(A.mods && A.mods.on && last(A, 'modState').on === 1, 'unlock works and the server confirms');

// infinite ammo + auto fire on a pistol
mod(A, 'inf', true); mod(A, 'auto', true);
A.lastShot = -100;
const s = A.slots[A.cur], mag0 = s.mag;
shoot(A, [0, 0, -1]);
ok(s.mag === mag0, `infinite ammo: magazine stays full (${s.mag})`);
const pistolGap = 0.1; // auto fire rate (a pistol is normally much slower)
const fastShots = () => { let n = 0; for (let i = 0; i < 10; i++) { const prev = performance.now() / 1000 - pistolGap; A.lastShot = prev; shoot(A, [0, 0, -1]); if (A.lastShot !== prev) n++; } return n; };
const withAuto = fastShots();
ok(withAuto === 10, `auto fire: the server accepts a pistol shot every ${pistolGap}s (${withAuto}/10)`);
mod(A, 'auto', false); const without = fastShots(); mod(A, 'auto', true);
ok(without === 0, `without the mod the normal pistol fire rate still applies (${without}/10)`);

// custom gun: damage + base
mod(A, 'auto', false);
mod(A, 'custom', { base: 'sniper', dmg: 777, scope: 'sniper', skin: 'galaxy', rate: 'auto' });
ok(A.slots[A.cur].w === 'custom', 'custom gun is put in your hands');
ok(room.publicPlayer(A).cg && room.publicPlayer(A).cg.skin === 'galaxy', 'other players get the custom look (skin/scope/base)');
B.hp = 100; B.alive = true; B.protectUntil = 0; A.lastShot = -100;
shoot(A, [0, -0.0075, -1]);
ok(!B.alive, 'custom gun 777 damage kills in one body shot');
const k = last(B, 'kill'); ok(k && k.w === 'custom', 'kill feed shows the custom gun');
mod(A, 'custom', { base: 'pistol', dmg: 99999, scope: 'nope', skin: 'hacker' });
ok(A.mods.custom.dmg === 999 && A.mods.custom.scope === 'none' && A.mods.custom.skin === 'default', 'bad custom values are cleaned up (max 999 damage)');

// god mode
room.spawn(B); B.protectUntil = 0; pose(B, 0, 60, -20);
mod(A, 'god', true);
room.damage(A, B, 500, 'pistol', false, null);
ok(A.alive && A.hp === 100, 'god mode: no damage');

// explosive bullets: a shot into the ground blows up
mod(A, 'boom', true);
B.client.msgs.length = 0; A.lastShot = -100;
pose(A, 30, 1.6, 30); shoot(A, [0, -1, 0]);
ok(B.client.msgs.some(m => m.type === 'explode'), 'explosive bullets explode where they hit');
ok(A.alive && A.hp === 100, 'your own explosions never hurt you');

// cops ignore me
mod(A, 'ghost', true);
room.npcs.addWanted(A, 3, 'test');
ok(!A.wanted, 'cops ignore me: you can\'t get wanted stars');

// give / cash / heal / teleport
mod(A, 'give', 'rocket'); ok(A.slots[A.cur].w === 'rocket', 'give weapon');
// Golden Sniper from the Give list: still one per game, and the giver becomes its owner
B.slots = [{ w: 'golden', mag: 5, reserve: 15 }, { w: 'smg', mag: 30, reserve: 90 }]; B.cur = 0; room.gold.owner = B.id;
const bMsgs = B.client.msgs.length;
mod(A, 'give', 'golden');
ok(A.slots[A.cur].w === 'golden' && room.gold.owner === A.id, 'Give: Golden Sniper puts it in your hands and makes you the owner');
ok(!B.slots.some(s => s.w === 'golden') && B.slots[B.cur].w === 'smg', 'the old owner loses it (only one per game)');
ok(!B.client.msgs.slice(bMsgs).some(m => JSON.stringify(m).includes('olden') && m.type !== 'inv'), 'nobody is told who took it');
ok(last(A, 'goldInfo') && last(A, 'goldInfo').own === 1, 'you get the owner info (scope, bullet cam work)');
mod(A, 'give', 'golden'); ok(A.slots.filter(s => s.w === 'golden').length === 1, 'giving it twice doesn\'t duplicate it');
room.kill(A, B, 'pistol', false); room.spawn(A);
ok(A.slots.some(s => s.w === 'golden'), 'it comes back when you respawn, like a bought one');
const c0 = A.cash || 0; mod(A, 'cash'); ok(A.cash === c0 + 1000, '+$1000');
mod(A, 'god', false); A.hp = 20; mod(A, 'heal'); ok(A.hp === 100, 'heal');
mod(A, 'tp', 1); const tp = last(A, 'tp');
ok(tp && Math.hypot(tp.p[0] - MOD_PLACES[1].p[0], tp.p[2] - MOD_PLACES[1].p[2]) < 0.01, `teleport to ${MOD_PLACES[1].name}`);

// a fresh player can't use mods without the code
const C = room.addPlayer(mk(3), { name: 'Normal' }); room.spawn(C);
mod(C, 'inf', true); ok(!C.mods, 'other players don\'t get mods');

// MODS=off turns it all off
process.env.MODS = 'off';
const D = room.addPlayer(mk(4), { name: 'Off' }); mod(D, 'unlock');
ok(!D.mods && last(D, 'modState').off === 1, 'MODS=off on the server disables the mod menu');
delete process.env.MODS;

console.log(failures ? `\n${failures} FAILED` : '\nALL MOD MENU TESTS PASSED');
process.exit(failures ? 1 : 0);
