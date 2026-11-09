// Road routing shared by the server (police dispatch cars) and the client (arrest cutscene).
// Builds a Manhattan path along the road center lines, then shifts it into the right-hand lane.
export const GRID = [-112, -56, 0, 56, 112];
const snapG = (v) => GRID.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);

export function roadRoute(sx, sz, tx, tz) {
  const clampR = (v) => Math.max(-112, Math.min(112, v));
  const sH = Math.abs(sz - snapG(sz)) <= Math.abs(sx - snapG(sx));
  const S = sH ? [clampR(sx), snapG(sz)] : [snapG(sx), clampR(sz)];
  const eH = Math.abs(tz - snapG(tz)) <= Math.abs(tx - snapG(tx));
  const E = eH ? [clampR(tx), snapG(tz)] : [snapG(tx), clampR(tz)];
  let pts;
  if (sH && !eH) pts = [S, [E[0], S[1]], E];
  else if (!sH && eH) pts = [S, [S[0], E[1]], E];
  else if (sH && eH) {
    if (S[1] === E[1]) pts = [S, E];
    else { const g = GRID.reduce((a, b) => (Math.abs(b - S[0]) + Math.abs(b - E[0]) < Math.abs(a - S[0]) + Math.abs(a - E[0]) ? b : a)); pts = [S, [g, S[1]], [g, E[1]], E]; }
  } else {
    if (S[0] === E[0]) pts = [S, E];
    else { const g = GRID.reduce((a, b) => (Math.abs(b - S[1]) + Math.abs(b - E[1]) < Math.abs(a - S[1]) + Math.abs(a - E[1]) ? b : a)); pts = [S, [S[0], g], [E[0], g], E]; }
  }
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
  // lane offset (right side, 3m) with mitered corners
  const R = (d) => [-d[1], d[0]];
  const nrm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  return pts.map((p, i) => {
    const din = i > 0 ? nrm(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : null;
    const dout = i < pts.length - 1 ? nrm(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]) : null;
    let o;
    if (din && dout) { const dot = din[0] * dout[0] + din[1] * dout[1]; const a = R(din), b = R(dout); o = 1 + dot < 0.2 ? [b[0] * 3, b[1] * 3] : [(a[0] + b[0]) * 3 / (1 + dot), (a[1] + b[1]) * 3 / (1 + dot)]; }
    else { const r = R(din || dout); o = [r[0] * 3, r[1] * 3]; }
    return [p[0] + o[0], p[1] + o[1]];
  });
}
