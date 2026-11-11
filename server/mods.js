// CITY CHAOS - mod menu (server side). The server is still the referee: mods only do what's handled here.
// Turn the whole thing off on a server with the environment variable MODS=off.
import { cleanCustom, MOD_GIVE, MOD_PLACES } from '../public/shared/mods.js';
import { MAX_HEALTH } from '../public/shared/constants.js';

const FLAGS = ['inf', 'auto', 'god', 'boom', 'ghost'];
export const modsAllowed = () => process.env.MODS !== 'off';

export function onMod(room, p, m) {
  if (!modsAllowed()) return room.sendTo(p, { type: 'modState', off: 1 });
  const k = String(m.k || '');
  if (k === 'unlock') { p.mods = p.mods || { on: true, custom: null }; p.mods.on = true; return send(room, p); }
  if (!p.mods || !p.mods.on) return;
  const mods = p.mods;
  if (FLAGS.includes(k)) {
    mods[k] = !!m.v;
    if (k === 'ghost' && mods.ghost && p.wanted) room.npcs.clearWanted(p);
  } else if (k === 'custom') {
    mods.custom = cleanCustom(m.v);
    if (p.alive && !p.jail) { room.giveWeapon(p, 'custom', true); room.sendInventory(p); }
    room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
  } else if (k === 'give') {
    const w = String(m.v);
    if (MOD_GIVE.includes(w) && p.alive && !p.jail) { room.giveWeapon(p, w, true); room.sendInventory(p); }
  } else if (k === 'cash') {
    p.cash = (p.cash || 0) + 1000;
    room.broadcast({ type: 'playerUpdate', p: room.publicPlayer(p) });
  } else if (k === 'heal') {
    if (p.alive) { p.hp = MAX_HEALTH; room.broadcast({ type: 'hp', id: p.id, hp: p.hp }); }
  } else if (k === 'clear') {
    if (p.wanted) room.npcs.clearWanted(p);
  } else if (k === 'tp') {
    const place = MOD_PLACES[Math.floor(Number(m.v))];
    if (place && p.alive && !p.jail && !p.holding && !p.inCar && !p.ride) room.teleport(p, place.p, place.yaw);
  }
  send(room, p);
}
function send(room, p) {
  const m = p.mods; room.sendTo(p, { type: 'modState', on: 1, inf: !!m.inf, auto: !!m.auto, god: !!m.god, boom: !!m.boom, ghost: !!m.ghost, custom: m.custom });
}
