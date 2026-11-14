// CITY CHAOS - which leaderboards there are (shared by the server and the 🏆 screen)
export const BOARDS = [
  { key: 'wealth', icon: '💰', name: 'Richest', fmt: (v) => '$' + v.toLocaleString() },
  { key: 'xp', icon: '⭐', name: 'Highest level', fmt: (v, r) => `Lv ${r.lvl}` },
  { key: 'heists', icon: '🏦', name: 'Bank heists', fmt: (v) => String(v) },
  { key: 'crooks', icon: '🦹', name: 'Robbers stopped', fmt: (v) => String(v) },
  { key: 'raceWins', icon: '🏁', name: 'Street race wins', fmt: (v) => String(v) },
  { key: 'loop', icon: '⏱', name: 'Fastest CITY LOOP', low: true, fmt: (v) => fmtT(v) },
  { key: 'tour', icon: '⏱', name: 'Fastest GRAND TOUR', low: true, fmt: (v) => fmtT(v) },
  { key: 'turfs', icon: '🏴', name: 'Turf taken', fmt: (v) => String(v) },
  { key: 'bosses', icon: '👑', name: 'Bosses taken down', fmt: (v) => String(v) },
  { key: 'kills', icon: '💥', name: 'Takedowns', fmt: (v) => String(v) }
];
function fmtT(s) { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`; }
