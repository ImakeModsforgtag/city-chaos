// CITY CHAOS - signed save tokens (see public/shared/profile.js).
import crypto from 'crypto';
import { newProfile, cleanProfile, SAVE_EVERY } from '../public/shared/profile.js';

const DEV_SECRET = 'city-chaos-dev-secret-change-me';
const SECRET = process.env.PROFILE_SECRET || DEV_SECRET;
if (SECRET === DEV_SECRET) console.warn('[profiles] PROFILE_SECRET is not set: using the built-in key (set one on your server so saves can\'t be forged)');

const sig = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

export function signProfile(prof) {
  const body = Buffer.from(JSON.stringify(prof), 'utf8').toString('base64url');
  return body + '.' + sig(body);
}
// returns the saved profile, or a brand new one if the token is missing / tampered with
export function loadProfile(token) {
  if (typeof token === 'string' && token.length < 8000) {
    const [body, s] = token.split('.');
    if (body && s && s.length === sig(body).length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(body)))) {
      try { return { prof: cleanProfile(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))), loaded: true }; } catch {}
    }
  }
  return { prof: newProfile(), loaded: false, bad: typeof token === 'string' && token.length > 0 };
}

// per player bookkeeping, called by the room
export class Saves {
  constructor(room) { this.room = room; }
  attach(p, token) {
    const { prof, loaded, bad } = loadProfile(token);
    p.prof = prof; p.cash = prof.cash; p.lastCash = prof.cash; p.saveDirty = true; p.lastSaveAt = -99;
    p.noSave = false; p.profLoaded = loaded; p.profBad = bad;
  }
  hello(p) { this.room.sendTo(p, { type: 'profile', loaded: p.profLoaded ? 1 : 0, reset: p.profBad ? 1 : 0, cash: p.cash, stats: p.prof.stats }); this.save(p, true); }
  stat(p, k, n = 1) { if (p && p.prof) { p.prof.stats[k] = (p.prof.stats[k] || 0) + n; p.saveDirty = true; } }
  // cash bookkeeping: anything that changed p.cash since the last check counts as earned / spent
  syncCash(p) {
    if (!p.prof) return;
    const d = (p.cash || 0) - (p.lastCash || 0);
    if (d > 0) p.prof.stats.earned += d; else if (d < 0) p.prof.stats.spent -= d;
    if (d) { p.lastCash = p.cash; p.saveDirty = true; }
  }
  save(p, force = false) {
    if (!p.prof || !p.connected || p.noSave) return;
    this.syncCash(p);
    const t = this.room.now();
    if (!force && (!p.saveDirty || t - p.lastSaveAt < SAVE_EVERY)) return;
    p.prof.cash = Math.max(0, Math.floor(p.cash || 0));
    p.prof.updated = Date.now();
    p.saveDirty = false; p.lastSaveAt = t;
    this.room.sendTo(p, { type: 'save', token: signProfile(p.prof) });
  }
  tick(dt) {
    for (const p of this.room.players.values()) {
      if (!p.prof) continue;
      if (p.connected) { p.playAcc = (p.playAcc || 0) + dt; if (p.playAcc >= 10) { this.stat(p, 'playSec', Math.floor(p.playAcc)); p.playAcc -= Math.floor(p.playAcc); } }
      this.save(p);
    }
  }
}
