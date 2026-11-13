// Levels + XP (in-process): XP for actions, level ups with cash bonus and unlocks, everyone sees your level,
// locked cosmetics show as the default until unlocked, XP saved and loaded, the level curve.
import { Room } from '../server/room.js';
import { XP, xpForLevel, levelFromXp, levelProgress, MAX_LEVEL, levelCash, lockCos, unlockLevel } from '../public/shared/levels.js';
import { peekToken } from '../public/shared/profile.js';
import { signProfile } from '../server/profiles.js';
import { newProfile } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const room = new Room('LVL', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room.now = () => T;
const run = (sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; room.tick(0.1); } };
const msgs = (p, type) => p.client.msgs.filter(m => m.type === type);
const last = (p, type) => msgs(p, type).pop();

console.log('CITY CHAOS server test 13 (levels + XP) - in-process');

// the curve
ok(xpForLevel(1) === 0 && xpForLevel(2) === 100 && levelFromXp(99) === 1 && levelFromXp(100) === 2, 'level 2 at 100 XP');
let mono = true; for (let l = 2; l <= MAX_LEVEL; l++) if (xpForLevel(l) - xpForLevel(l - 1) < xpForLevel(l - 1) - xpForLevel(Math.max(1, l - 2))) mono = false;
ok(mono, 'each level needs at least as much XP as the one before');
ok(levelFromXp(1e9) === MAX_LEVEL && levelProgress(1e9).frac === 1, `max level ${MAX_LEVEL}`);
ok(levelProgress(150).lvl === 2 && Math.abs(levelProgress(150).frac - 50 / 110) < 1e-9, 'progress inside a level');

// XP for actions
const A = room.addPlayer(mk(), { name: 'Grinder', cos: { hat: 4, back: 2, glasses: 1 } });
const B = room.addPlayer(mk(), { name: 'Target' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B); A.protectUntil = B.protectUntil = 0;
ok(A.lvl === 1 && A.prof.xp === 0, 'new players start at level 1');
ok(A.cos.hat === 0 && A.cos.back === 0 && A.cos.glasses === 1, 'locked Crown / Jetpack show as the default, free Shades stay');
ok(room.publicPlayer(A).lvl === 1, 'your level is part of your public info (name tags, scoreboard)');
room.kill(B, A, 'pistol', true);
const g = msgs(A, 'xp');
ok(g.some(m => m.gain === XP.kill && m.reason === 'Takedown') && g.some(m => m.gain === XP.headshot), `takedown + headshot XP (${A.prof.xp})`);

// level up
const cash0 = A.cash;
A.client.msgs.length = 0; B.client.msgs.length = 0;
room.saves.addXP(A, 100, 'kill');
const up = last(A, 'xp');
ok(up.up === 1 && up.lvl === 2 && A.lvl === 2, 'level up to 2');
ok(A.cash === cash0 + levelCash(2) && up.bonus === levelCash(2), `level-up cash bonus +$${up.bonus}`);
ok(up.unlocks.includes('Top Hat'), `unlocks announced: ${up.unlocks.join(', ')}`);
ok(last(B, 'levelUp') && last(B, 'levelUp').lvl === 2 && last(B, 'playerUpdate').p.lvl === 2, 'everyone sees your new level');
// big jumps: several levels at once
const c1 = A.cash;
room.saves.addXP(A, xpForLevel(5) - A.prof.xp, 'win');
const big = last(A, 'xp');
ok(big.lvl === 5 && big.bonus === levelCash(3) + levelCash(4) + levelCash(5) && A.cash === c1 + big.bonus, 'jumping several levels pays every level\'s bonus');

// unlocked cosmetics now allowed
room.handle(A, { type: 'cosmetics', cos: { hat: 4, back: 2, glasses: 1 } });
ok(A.cos.hat === 0, 'Crown still locked at level 5 (needs 12)');
ok(A.cos.back === 2, 'Jetpack unlocked at level 3 is now shown');
room.handle(A, { type: 'cosmetics', cos: { hat: 2 } });
ok(A.cos.hat === 2, 'Top Hat (level 2) allowed');
ok(lockCos({ hat: 6, body: 3 }, 1).hat === 0 && lockCos({ hat: 6, body: 3 }, 16).body === 3 && unlockLevel('hat', 1) === 1, 'lock rules');

// stats that give XP
const x0 = A.prof.xp;
room.saves.stat(A, 'robs'); room.saves.stat(A, 'crooks'); room.saves.stat(A, 'crooks', 1, 'crookArrest'); room.saves.stat(A, 'cars'); room.saves.stat(A, 'deaths');
ok(A.prof.xp - x0 === XP.rob + XP.crook + XP.crookArrest + XP.car, `robbery / robber stopped / robber arrested / car XP (+${A.prof.xp - x0}), no XP for dying`);
// time played
const x1 = A.prof.xp; run(61);
ok(A.prof.xp - x1 >= XP.minute, `XP for time played (+${A.prof.xp - x1} in a minute)`);
// match end
const x2 = A.prof.xp; A.kills = 99;
room.endMatch({ id: A.id, name: A.name });
ok(A.prof.xp - x2 === XP.match + XP.win, 'match played + won XP');

// saved and loaded
run(6);
const tok = last(A, 'save').token;
ok(peekToken(tok).xp === A.prof.xp, `XP is saved (${peekToken(tok).xp})`);
const room2 = new Room('LVL2', { mode: 'ffa', crooks: false, missions: false }, { tokens: new Map() }); room2.now = () => T;
const A2 = room2.addPlayer(mk(), { name: 'Grinder', profile: tok, cos: { back: 2 } });
ok(A2.lvl === A.lvl && A2.cos.back === 2 && last(A2, 'profile').lvl === A.lvl, `level loads back (level ${A2.lvl}) with your unlocked items`);
const rich = room2.addPlayer(mk(), { name: 'Vet', profile: signProfile({ ...newProfile(), xp: xpForLevel(20) }), cos: { hat: 4, body: 3 } });
ok(rich.lvl === 20 && rich.cos.hat === 4 && rich.cos.body === 3, 'a level 20 player can wear the Crown and Robot body');

console.log(failures ? `\n${failures} FAILED` : '\nALL LEVEL TESTS PASSED');
process.exit(failures ? 1 : 0);
