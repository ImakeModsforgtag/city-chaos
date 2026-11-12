// Saved progress (in-process): signed save tokens, cash + stats carrying over between games and server
// restarts, tampering rejected, new players start with START_CASH.
import { Room } from '../server/room.js';
import { signProfile, loadProfile } from '../server/profiles.js';
import { START_CASH, peekToken, newProfile } from '../public/shared/profile.js';

let failures = 0;
const ok = (c, msg) => { console.log((c ? '  PASS ' : '  FAIL ') + msg); if (!c) failures++; };
let nextId = 1;
const mk = () => { const id = nextId++; return { id, token: 't' + id, msgs: [], send(m) { this.msgs.push(m); }, sendRaw(d) { this.msgs.push(JSON.parse(d)); } }; };
let T = 1000;
const newRoom = () => { const r = new Room('SAVE' + nextId, { mode: 'ffa', crooks: false }, { tokens: new Map() }); r.now = () => T; return r; };
const run = (room, sec) => { for (let i = 0; i < sec * 10; i++) { T += 0.1; room.tick(0.1); } };
const lastSave = (p) => p.client.msgs.filter(m => m.type === 'save').pop();
const msg = (p, type) => p.client.msgs.filter(m => m.type === type).pop();

console.log('CITY CHAOS server test 12 (saved progress) - in-process');

// new player
let room = newRoom();
let A = room.addPlayer(mk(), { name: 'Saver' });
ok(A.cash === START_CASH, `new players start with $${START_CASH}`);
ok(msg(A, 'profile') && msg(A, 'profile').loaded === 0, 'told it\'s a fresh profile');
ok(!!lastSave(A), 'gets a save right away');
const joined = A.client.msgs.find(m => m.type === 'joined');
ok(joined && joined.players.find(q => q.id === A.id).cash === START_CASH, 'the joined state shows the starting cash');

// earn, spend, stats -> save
const B = room.addPlayer(mk(), { name: 'Target' });
T += 3; room.tick(0.03); room.spawn(A); room.spawn(B); A.protectUntil = B.protectUntil = 0;
A.cash += 500;                     // e.g. a robbery
room.kill(B, A, 'pistol', true);   // headshot takedown
run(room, 6);
let tok = lastSave(A).token, p = peekToken(tok);
ok(p.cash === START_CASH + 500, `cash saved ($${p.cash})`);
ok(p.stats.kills === 1 && p.stats.headshots === 1, 'takedowns + headshots counted');
ok(p.stats.earned === 500, `cash earned counted ($${p.stats.earned})`);
ok(peekToken(lastSave(B).token).stats.deaths === 1, 'the other player\'s knockout counted');
A.cash -= 200; run(room, 6);
p = peekToken(lastSave(A).token);
ok(p.cash === START_CASH + 300 && p.stats.spent === 200, `spending is saved too ($${p.cash}, spent $${p.stats.spent})`);
const saves0 = A.client.msgs.filter(m => m.type === 'save').length; run(room, 12);
ok(A.client.msgs.filter(m => m.type === 'save').length - saves0 <= 2, 'no save spam when nothing changes');
run(room, 20);
p = peekToken(lastSave(A).token);
ok(p.stats.playSec >= 40, `play time counted (${p.stats.playSec}s)`);

// the match resets but your wallet doesn't
room.endMatch({ id: A.id, name: A.name }); room.resetMatch();
ok(A.cash === START_CASH + 300 && A.kills === 0, 'a new match resets takedowns but keeps your cash');
p = peekToken(lastSave(A).token);
ok(p.stats.matches === 1 && p.stats.wins === 1, 'matches played + won counted');

// "server restart": a brand new room, join with the saved token
tok = lastSave(A).token;
room = newRoom();
A = room.addPlayer(mk(), { name: 'Saver', profile: tok });
ok(A.cash === START_CASH + 300 && A.prof.stats.kills === 1, 'joining another game (or after a server restart) brings your cash + stats back');
ok(msg(A, 'profile').loaded === 1, 'told the progress was loaded');

// tampering
const body = JSON.parse(Buffer.from(tok.split('.')[0], 'base64url').toString());
body.cash = 999999;
const forged = Buffer.from(JSON.stringify(body)).toString('base64url') + '.' + tok.split('.')[1];
const C = room.addPlayer(mk(), { name: 'Cheater', profile: forged });
ok(C.cash === START_CASH && msg(C, 'profile').reset === 1, 'an edited save is rejected (fresh start, no free cash)');
ok(loadProfile('junk.junk').loaded === false && loadProfile(null).loaded === false && loadProfile('x'.repeat(9000)).loaded === false, 'junk tokens are rejected');
ok(loadProfile(signProfile({ ...newProfile(), cash: -50, stats: { kills: 'lots' } })).prof.cash === 0, 'weird numbers are cleaned up');

// the mod menu is gone: old mod messages do nothing
const cash0 = A.cash;
room.handle(A, { type: 'mod', k: 'unlock' }); room.handle(A, { type: 'mod', k: 'cash' }); room.handle(A, { type: 'mod', k: 'god', v: 1 });
run(room, 1);
ok(A.cash === cash0 && !A.mods && !A.client.msgs.some(m => m.type === 'modState'), 'mod menu messages are ignored (no free cash, no god mode)');

// leaving saves right away
const D = room.addPlayer(mk(), { name: 'Leaver' });
D.cash += 77; room.removePlayer(D.id);
ok(peekToken(lastSave(D).token).cash === START_CASH + 77, 'leaving the room saves immediately');

console.log(failures ? `\n${failures} FAILED` : '\nALL SAVE TESTS PASSED');
process.exit(failures ? 1 : 0);
