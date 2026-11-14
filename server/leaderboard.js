// CITY CHAOS - leaderboards. There's no database: every save carries a permanent player id ("pid") and is signed by
// the server, so the board is built from verified saves. It's updated whenever a save is made in a game, and every
// game re-sends its save when it connects, so after a server restart the board fills back up as players come online.
// It's also written to data/leaderboard.json (kept between restarts on hosts with a disk).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { levelFromXp } from '../public/shared/levels.js';
import { BOARDS } from '../public/shared/leaderboard.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'leaderboard.json');
const MAX_ENTRIES = 5000, TOP = 10;
export class Leaderboard {
  constructor({ file = FILE, persist = true } = {}) {
    this.file = file; this.persist = persist; this.rows = new Map(); this.dirty = false; this.cache = null;
    if (persist) { try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); for (const r of d.rows || []) if (r && r.pid) this.rows.set(r.pid, r); } catch {} }
    if (persist) setInterval(() => this.flush(), 30000).unref?.();
  }
  // a verified profile (from a save made by the server, or a signed token a game sent back)
  update(prof, name) {
    if (!prof || !prof.pid) return;
    const s = prof.stats || {};
    const row = { pid: prof.pid, name: String(name || 'Player').slice(0, 16), lvl: levelFromXp(prof.xp || 0), xp: prof.xp || 0,
                  wealth: (prof.cash || 0) + (prof.bank || 0), heists: s.heists || 0, crooks: s.crooks || 0, raceWins: s.raceWins || 0,
                  turfs: s.turfs || 0, kills: s.kills || 0, bosses: s.bosses || 0, loop: (prof.raceBest && prof.raceBest.loop) || 0, tour: (prof.raceBest && prof.raceBest.tour) || 0,
                  at: Date.now() };
    const old = this.rows.get(prof.pid);
    if (old && old.at > row.at - 2000 && JSON.stringify({ ...old, at: 0 }) === JSON.stringify({ ...row, at: 0 })) return;
    this.rows.set(prof.pid, row); this.dirty = true; this.cache = null;
    if (this.rows.size > MAX_ENTRIES) { const oldest = [...this.rows.values()].sort((a, b) => a.at - b.at)[0]; this.rows.delete(oldest.pid); }
  }
  top() {
    if (this.cache) return this.cache;
    const all = [...this.rows.values()], out = {};
    for (const b of BOARDS) {
      const list = all.filter(r => r[b.key] > 0).sort((x, y) => b.low ? x[b.key] - y[b.key] : y[b.key] - x[b.key]).slice(0, TOP);
      out[b.key] = list.map(r => ({ pid: r.pid, name: r.name, v: r[b.key], lvl: r.lvl }));
    }
    return (this.cache = { boards: out, players: this.rows.size });
  }
  rankOf(pid) {
    const r = this.rows.get(pid); if (!r) return null;
    const all = [...this.rows.values()], out = {};
    for (const b of BOARDS) { if (!(r[b.key] > 0)) continue; out[b.key] = 1 + all.filter(x => x[b.key] > 0 && (b.low ? x[b.key] < r[b.key] : x[b.key] > r[b.key])).length; }
    return out;
  }
  flush() {
    if (!this.dirty || !this.persist) return;
    this.dirty = false;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ rows: [...this.rows.values()] })); } catch (e) { console.error('[leaderboard] could not save:', e.message); }
  }
}
