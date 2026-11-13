// CITY CHAOS - signed save tokens (see public/shared/profile.js).
import crypto from 'crypto';
import { newProfile, cleanProfile, SAVE_EVERY } from '../public/shared/profile.js';
import { XP, XP_REASON, levelFromXp, levelCash, unlocksAt, lockCos } from '../public/shared/levels.js';
import { HATS, GLASSES, BACKS, HEADS, BODIES } from '../public/shared/constants.js';

import { missionsFor, dayKey, ALL_DONE_BONUS, TOWER_TOP, secondsToReset } from '../public/shared/missions.js';

const COS_NAMES = { hat: HATS, glasses: GLASSES, back: BACKS, head: HEADS, body: BODIES };
// stats that also give XP
const MISSION_EV = new Set(['kills', 'headshots', 'crooks', 'cars', 'matches', 'wins']);
const STAT_XP = { kills: 'kill', headshots: 'headshot', arrests: 'arrest', robs: 'rob', crooks: 'crook', cars: 'car', matches: 'match', wins: 'win' };

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
    p.lvl = levelFromXp(prof.xp); p.minAcc = 0;
    p.cos = lockCos(p.cos, p.lvl);   // cosmetics you haven't unlocked yet show as the default
    p.noSave = false; p.profLoaded = loaded; p.profBad = bad;
  }
  hello(p) {
    const interest = this.room.bank ? this.room.bank.accrue(p) : 0;   // savings interest since last time
    this.room.sendTo(p, this.missionsMsg(p));
    this.room.sendTo(p, { type: 'profile', loaded: p.profLoaded ? 1 : 0, reset: p.profBad ? 1 : 0, cash: p.cash, stats: p.prof.stats, xp: p.prof.xp, lvl: p.lvl, bank: p.prof.bank, interest, tut: p.prof.tut });
    this.save(p, true);
  }
  stat(p, k, n = 1, xpKey = null) {
    if (!p || !p.prof) return;
    p.prof.stats[k] = (p.prof.stats[k] || 0) + n; p.saveDirty = true;
    const x = xpKey || STAT_XP[k];
    if (x) this.addXP(p, XP[x] * n, x);
    if (MISSION_EV.has(k)) this.event(p, k, n);
  }

  // the tutorial: finishing it the first time pays $100 + 50 XP (skipping just marks it seen)
  tutorial(p, a) {
    if (!p.prof || p.prof.tut) return;
    p.prof.tut = 1; p.saveDirty = true;
    if (a === 'done') { p.cash = (p.cash || 0) + 100; this.addXP(p, 50, 'tutorial'); this.room.sendTo(p, { type: 'tutReward', cash: 100, xp: 50, total: p.cash }); this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) }); }
    this.save(p, true);
  }

  // ---------------------------------------------------------------- daily missions
  daily(p) {
    const today = dayKey(), d = p.prof.daily;
    if (d.day !== today) { d.day = today; d.prog = [0, 0, 0]; d.done = [0, 0, 0]; d.bonus = 0; p.saveDirty = true; p.missionsDirty = true; }
    return { d, list: missionsFor(today) };
  }
  missionsMsg(p, extra = {}) {
    const { d, list } = this.daily(p);
    return { type: 'missions', day: d.day, list: list.map((m, i) => ({ id: m.id, text: m.text, goal: m.goal, prog: Math.min(m.goal, d.prog[i]), done: d.done[i], cash: m.cash, xp: m.xp })),
             bonus: d.bonus, bonusCash: ALL_DONE_BONUS.cash, bonusXp: ALL_DONE_BONUS.xp, resetIn: secondsToReset(), ...extra };
  }
  // something happened that a mission might count (kills, shop, food, spend, earn, minutes, tower, ...)
  event(p, ev, n = 1) {
    if (!p || !p.prof || n <= 0 || !this.room.missionsOn) return;
    const { d, list } = this.daily(p);
    let changed = false, finished = null, xpGain = [];
    list.forEach((m, i) => {
      if (m.ev !== ev || d.done[i]) return;
      d.prog[i] = Math.min(m.goal, d.prog[i] + n); changed = true;
      if (d.prog[i] >= m.goal) {
        d.done[i] = 1; finished = finished || [];
        finished.push(i);
        p.cash = (p.cash || 0) + m.cash; p.lastCash = (p.lastCash || 0) + m.cash;   // reward cash doesn't count as "earned" for missions
        xpGain.push([m.xp, 'mission']);
      }
    });
    if (!changed) return;
    p.saveDirty = true;
    let bonus = 0;
    if (!d.bonus && d.done.every(Boolean)) {
      d.bonus = 1; bonus = 1;
      p.cash += ALL_DONE_BONUS.cash; p.lastCash += ALL_DONE_BONUS.cash;
      xpGain.push([ALL_DONE_BONUS.xp, 'missions']);
    }
    this.room.sendTo(p, this.missionsMsg(p, finished ? { just: finished, allDone: bonus, cash: p.cash } : {}));
    for (const [x, k] of xpGain) this.addXP(p, x, k);   // after the mission message, so MISSION COMPLETE shows before any LEVEL UP
    if (finished) this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
  }
  // XP + level ups (a level up pays cash and may unlock cosmetics)
  addXP(p, amount, key) {
    if (!p || !p.prof || amount <= 0 || !this.room.xpOn) return;
    const before = p.lvl || levelFromXp(p.prof.xp);
    p.prof.xp += Math.round(amount); p.saveDirty = true;
    const lvl = levelFromXp(p.prof.xp);
    const msg = { type: 'xp', gain: Math.round(amount), reason: XP_REASON[key] || '', xp: p.prof.xp, lvl };
    if (lvl > before) {
      let bonus = 0, unlocks = [];
      for (let l = before + 1; l <= lvl; l++) { bonus += levelCash(l); unlocks = unlocks.concat(unlocksAt(l, COS_NAMES)); }
      p.cash = (p.cash || 0) + bonus; p.lvl = lvl;
      Object.assign(msg, { up: 1, bonus, unlocks, cash: p.cash });
      this.room.sendTo(p, msg);
      this.room.broadcast({ type: 'levelUp', id: p.id, lvl });
      this.room.broadcast({ type: 'playerUpdate', p: this.room.publicPlayer(p) });
      return;
    }
    p.lvl = lvl;
    this.room.sendTo(p, msg);
  }
  // cash bookkeeping: anything that changed p.cash since the last check counts as earned / spent
  syncCash(p) {
    if (!p.prof) return;
    const d = (p.cash || 0) - (p.lastCash || 0);
    if (d > 0) p.prof.stats.earned += d; else if (d < 0) p.prof.stats.spent -= d;
    if (d) { p.lastCash = p.cash; p.saveDirty = true; }
    if (d > 0) this.event(p, 'earn', d);
  }
  save(p, force = false) {
    if (!p.prof || !p.connected || p.noSave) return;
    this.syncCash(p);
    const t = this.room.now();
    if (!force && (!p.saveDirty || t - p.lastSaveAt < SAVE_EVERY)) return;
    if (this.room.bank) { const g = this.room.bank.accrue(p); if (g) this.room.sendTo(p, { type: 'bankBal', bank: p.prof.bank, interest: g }); }
    p.prof.cash = Math.max(0, Math.floor(p.cash || 0));
    p.prof.updated = Date.now();
    p.saveDirty = false; p.lastSaveAt = t;
    this.room.sendTo(p, { type: 'save', token: signProfile(p.prof) });
  }
  tick(dt) {
    for (const p of this.room.players.values()) {
      if (!p.prof) continue;
      if (p.connected) {
        p.playAcc = (p.playAcc || 0) + dt; if (p.playAcc >= 10) { this.stat(p, 'playSec', Math.floor(p.playAcc)); p.playAcc -= Math.floor(p.playAcc); }
        p.minAcc = (p.minAcc || 0) + dt; if (p.minAcc >= 60) { p.minAcc -= 60; this.addXP(p, XP.minute, 'minute'); this.event(p, 'minutes', 1); }
        // standing on top of the Chaos Tower (checked about once a second)
        p.towerAcc = (p.towerAcc || 0) + dt;
        if (p.towerAcc >= 1) {
          p.towerAcc = 0;
          const h = p.pose && p.pose.h, T = TOWER_TOP;
          if (p.alive && h && h[1] > T.y + 0.4 && h[1] < T.y + 8 && h[0] > T.x0 && h[0] < T.x1 && h[2] > T.z0 && h[2] < T.z1) this.event(p, 'tower', 1);
          // a new day started while playing: fresh missions
          if (p.prof.daily.day !== dayKey()) this.room.sendTo(p, this.missionsMsg(p, { fresh: 1 }));
        }
      }
      this.save(p);
    }
  }
}
