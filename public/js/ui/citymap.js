// CITY CHAOS - 🗺️ the city map. One top-down picture of the city (drawn once from the same map data the game
// uses), shown three ways: the PC minimap in the corner (turns with you), the big map (press M, or the phone's
// MAP app: click anywhere to drop a GPS pin) and the MAP page on the VR wrist phone.
// Blips: you (arrow), your GPS / job / race target (pin, stuck to the edge when it's off the minimap), places,
// gang turf rings, other players (blue = cops, red = wanted), police chasing you, holiday gifts.

const S = 3;                    // pixels per meter in the base picture
const shade = (hex, k) => {     // k > 0 lightens, k < 0 darkens
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

export class CityMap {
  constructor(map) {
    this.map = map; this.half = (map.worldHalf || 120) + 6;
    const W = Math.round(this.half * 2 * S);
    const c = document.createElement('canvas'); c.width = c.height = W; this.base = c;
    const x = c.getContext('2d');
    x.fillStyle = '#3d4250'; x.fillRect(0, 0, W, W);
    const H = this.half, px = (v) => (v + H) * S;
    // every box seen from above, lowest first so roofs end up on top
    const boxes = map.boxes.filter(b => !b.h && b.max[1] > -0.5 && b.min[1] < 60 && b.max[0] > -H && b.min[0] < H && b.max[2] > -H && b.min[2] < H
                                     && (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]) > 0.05)
                           .sort((a, b) => a.max[1] - b.max[1]);
    for (const b of boxes) {
      const top = b.max[1], tall = top > 3;
      x.fillStyle = shade(b.c || 0x888888, tall ? Math.min(0.3, top / 90) : -0.05);
      const x0 = px(b.min[0]), z0 = px(b.min[2]), w = (b.max[0] - b.min[0]) * S, d = (b.max[2] - b.min[2]) * S;
      x.fillRect(x0, z0, w, d);
      if (tall && w > 6 && d > 6) { x.strokeStyle = 'rgba(20,14,50,0.55)'; x.lineWidth = 1.5; x.strokeRect(x0 + 0.75, z0 + 0.75, w - 1.5, d - 1.5); }
    }
    // district names, faint, for the big map
    this.labels = [];
    const names = { shopping: 'SHOPPING', services: 'SERVICES', downtown: 'DOWNTOWN', park: 'PARK', industrial: 'INDUSTRIAL', residential: 'HOMES' };
    (map.districts || []).forEach((row, r) => row.forEach((d, col) => {
      const bx = map.blockStarts[col] + map.block / 2, bz = map.blockStarts[r] + map.block / 2;
      this.labels.push({ x: bx, z: bz, text: names[d] || d.toUpperCase() });
    }));
  }

  // world -> canvas point for the current view
  _pt(v, x, z) {
    const dx = (x - v.cx) * v.k, dz = (z - v.cz) * v.k, c = Math.cos(v.rot), s = Math.sin(v.rot);
    return [v.size / 2 + dx * c - dz * s, v.size / 2 + dx * s + dz * c];
  }
  // canvas point -> world (for clicking a pin on the big map)
  toWorld(v, sx, sy) {
    const dx = sx - v.size / 2, dy = sy - v.size / 2, c = Math.cos(-v.rot), s = Math.sin(-v.rot);
    return [v.cx + (dx * c - dy * s) / v.k, v.cz + (dx * s + dy * c) / v.k];
  }

  // draw onto a 2D context. o: { size, cx, cz, radius (m shown from center to edge), rot, round, me:{x,z,yaw}, blips, labels }
  draw(ctx, o) {
    const size = o.size, v = { size, cx: o.cx, cz: o.cz, rot: o.rot || 0, k: size / 2 / o.radius };
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    if (o.round) { ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.clip(); }
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2); ctx.rotate(v.rot); ctx.scale(v.k, v.k); ctx.translate(-o.cx, -o.cz);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, -this.half, -this.half, this.half * 2, this.half * 2);
    ctx.restore();
    if (o.night) { ctx.fillStyle = `rgba(8,10,40,${0.35 * o.night})`; ctx.fillRect(0, 0, size, size); }
    if (o.labels) {
      ctx.font = `900 ${Math.max(10, size / 46)}px Trebuchet MS, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const l of this.labels) { const [a, b] = this._pt(v, l.x, l.z); ctx.fillText(l.text, a, b - size / 14); }
    }
    const edge = size / 2 - 12;
    const icon = Math.max(13, size / (o.labels ? 34 : o.round ? 13 : 24));
    for (const b of o.blips || []) {
      let [a, c] = this._pt(v, b.x, b.z);
      const dx = a - size / 2, dz = c - size / 2, d = o.round ? Math.hypot(dx, dz) : Math.max(Math.abs(dx), Math.abs(dz));
      if (d > edge) { if (!b.pin) continue; a = size / 2 + dx / d * edge; c = size / 2 + dz / d * edge; }   // targets stick to the edge
      if (b.ring) {
        ctx.beginPath(); ctx.arc(a, c, Math.max(4, b.ring * v.k), 0, Math.PI * 2);
        ctx.fillStyle = b.color + '44'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = b.color; ctx.stroke();
      } else if (b.pin) {
        const r = Math.max(6, size / 30);
        ctx.beginPath(); ctx.arc(a, c - r, r, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(a, c); ctx.closePath();
        ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.beginPath(); ctx.arc(a, c - r, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      } else if (b.icon) {
        ctx.font = `${icon}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(29,20,66,0.75)'; ctx.beginPath(); ctx.arc(a, c, icon * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(b.icon, a, c + 1);
      } else {
        ctx.beginPath(); ctx.arc(a, c, b.r || 4, 0, Math.PI * 2); ctx.fillStyle = b.color || '#fff'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#1d1442'; ctx.stroke();
      }
      if (o.labels && b.label) {
        ctx.font = `800 ${Math.max(10, size / 60)}px Trebuchet MS, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.lineWidth = 3; ctx.strokeStyle = '#1d1442'; ctx.strokeText(b.label, a, c + icon * 0.7); ctx.fillStyle = '#fff'; ctx.fillText(b.label, a, c + icon * 0.7);
      }
    }
    // you: an arrow pointing where you face
    if (o.me) {
      const [a, c] = this._pt(v, o.me.x, o.me.z), r = Math.max(7, size / (o.round ? 17 : 34));
      ctx.save(); ctx.translate(a, c); ctx.rotate(v.rot - o.me.yaw);
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.72, r * 0.8); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.72, r * 0.8); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#1d1442'; ctx.stroke();
      ctx.restore();
    }
    // a little N on the minimap so you know which way is north
    if (o.round) {
      const nx = size / 2 + Math.sin(v.rot) * edge, ny = size / 2 - Math.cos(v.rot) * edge;
      ctx.font = `900 ${Math.max(11, size / 14)}px Trebuchet MS, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#1d1442'; ctx.strokeText('N', nx, ny); ctx.fillStyle = '#ff4fa3'; ctx.fillText('N', nx, ny);
    }
    ctx.restore();
    return v;
  }
}
