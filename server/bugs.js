// CITY CHAOS - bug reports from players + automatic error reports from browsers.
// Every report is printed to the server log (Render: your service > Logs, search for "[BUG]" or "[CLIENT ERROR]")
// and the last 300 are kept in memory. If you set ADMIN_KEY on the server you can read them at
//   https://your-game.onrender.com/bugs?key=YOUR_ADMIN_KEY
const MAX = 300;
export const reports = [];
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

export function addReport(kind, p, room, m) {
  const t = Date.now();
  // rate limits: a bug report every 20 s, at most 8 automatic error reports per player session
  if (kind === 'bug') { if (t - (p.lastBugAt || 0) < 20000) return false; p.lastBugAt = t; }
  else { p.errCount = (p.errCount || 0) + 1; if (p.errCount > 8) return false; }
  const info = m.info && typeof m.info === 'object' ? m.info : {};
  const r = {
    kind, at: new Date(t).toISOString(), room: room.code, player: clip(p.name, 24), role: p.role, vr: !!p.vr,
    pos: p.pose ? p.pose.h.slice(0, 3).map(v => Math.round(v * 10) / 10) : null,
    text: clip(m.text || m.msg, kind === 'bug' ? 1000 : 400), where: clip(m.src || '', 160) + (m.line ? ':' + (m.line | 0) : ''),
    stack: kind === 'error' ? clip(m.stack, 900) : '', fps: Number(info.fps) || 0, ua: clip(info.ua, 160), view: clip(info.view, 20), version: clip(info.version, 20)
  };
  reports.push(r); if (reports.length > MAX) reports.shift();
  console.log(kind === 'bug' ? '[BUG]' : '[CLIENT ERROR]', JSON.stringify(r));
  return true;
}

// GET /bugs?key=... (only if ADMIN_KEY is set)
export function bugsPage(req, res) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.query.key !== key) return res.status(404).send('Not found');
  if (req.query.json) return res.json(reports);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = reports.slice().reverse().map(r => `<tr class="${r.kind}"><td>${esc(r.at.replace('T', ' ').slice(0, 19))}</td><td>${r.kind === 'bug' ? '🐞 report' : '⚠️ error'}</td><td>${esc(r.player)} (${esc(r.role)}${r.vr ? ', VR' : ''})<br><small>room ${esc(r.room)} · ${r.pos ? r.pos.join(', ') : '-'} · ${r.fps} fps</small></td><td>${esc(r.text)}${r.where ? `<br><small>${esc(r.where)}</small>` : ''}${r.stack ? `<pre>${esc(r.stack)}</pre>` : ''}</td><td><small>${esc(r.ua)}</small></td></tr>`).join('');
  res.send(`<!doctype html><meta charset="utf-8"><title>CITY CHAOS bug reports</title><style>body{font-family:sans-serif;background:#1d1442;color:#fff;margin:20px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #fff3;padding:6px;vertical-align:top}tr.bug td:nth-child(2){color:#7dff9a}tr.error td:nth-child(2){color:#ff9b9b}pre{white-space:pre-wrap;font-size:11px;color:#cfc8ff}small{opacity:.75}</style><h1>🐞 CITY CHAOS bug reports (${reports.length}, newest first)</h1><p>Kept in memory since the server last started. Also in the server log.</p><table>${rows || '<tr><td>No reports yet 🎉</td></tr>'}</table>`);
}
