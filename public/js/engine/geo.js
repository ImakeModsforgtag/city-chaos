// Geometry batching helper: everything with the same material is merged into ONE mesh
// with vertex colors. This keeps draw calls tiny, which is the #1 performance win on Quest.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color(), _nm = new THREE.Matrix3();

export class GeoBatch {
  constructor() { this.pos = []; this.nor = []; this.col = []; }

  // axis aligned box; skipBottom avoids hidden faces on ground-level boxes
  box(x0, y0, z0, x1, y1, z1, color, { skipBottom = false, topTint = 1.06, sideJitter = 0 } = {}) {
    _c.set(color);
    const r = _c.r, g = _c.g, b = _c.b;
    const P = this.pos, N = this.nor, C = this.col;
    const face = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, k) => {
      P.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 6; i++) { N.push(nx, ny, nz); C.push(Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)); }
    };
    const j = 1 + sideJitter;
    face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, topTint);          // top
    if (!skipBottom) face(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, 0.8);
    face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, 1.0 * j);           // +z
    face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, 0.97 * j);         // -z
    face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, 0.94 * j);          // +x
    face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, 0.9 * j);          // -x
  }

  // vertical quad facing a given axis direction (for windows / stripes)
  quad(cx, cy, cz, w, h, axis, sign, color) {
    _c.set(color);
    const P = this.pos, N = this.nor, C = this.col;
    const hw = w / 2, hh = h / 2;
    let a, b, c, d, n;
    if (axis === 'z') {
      const s = sign;
      a = [cx - hw * s, cy - hh, cz]; b = [cx + hw * s, cy - hh, cz]; c = [cx + hw * s, cy + hh, cz]; d = [cx - hw * s, cy + hh, cz]; n = [0, 0, s];
    } else {
      const s = sign;
      a = [cx, cy - hh, cz + hw * s]; b = [cx, cy - hh, cz - hw * s]; c = [cx, cy + hh, cz - hw * s]; d = [cx, cy + hh, cz + hw * s]; n = [s, 0, 0];
    }
    P.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { N.push(...n); C.push(_c.r, _c.g, _c.b); }
  }

  // add any three.js geometry transformed by a matrix, painted one color
  geom(geometry, matrix, color, colorFn = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pa = g.attributes.position, na = g.attributes.normal;
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z); this.nor.push(_n.x, _n.y, _n.z);
      if (colorFn) { const cc = colorFn(i, _v, _n); this.col.push(cc.r, cc.g, cc.b); }
      else this.col.push(_c.r, _c.g, _c.b);
    }
    if (g !== geometry) g.dispose();
  }

  // flat up-facing rectangle (road markings, tiles, lawns): 2 triangles
  floor(x0, z0, x1, z1, y, color) {
    _c.set(color);
    this.pos.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0);
    for (let i = 0; i < 6; i++) { this.nor.push(0, 1, 0); this.col.push(_c.r, _c.g, _c.b); }
  }
  // one triangle (counter-clockwise when seen from the outside); normal computed from the points
  tri(a, b, c, color) {
    _c.set(color);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.nor.push(nx, ny, nz); this.col.push(_c.r, _c.g, _c.b); }
  }
  // flat polygon (convex, points in counter-clockwise order seen from the front)
  poly(pts, color) { for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], color); }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get count() { return this.pos.length / 3; }
}

// Textured quads that all share one atlas texture (signs, decals): one draw call for all of them.
export class TexBatch {
  constructor(cols, rows) { this.cols = cols; this.rows = rows; this.pos = []; this.nor = []; this.uv = []; }
  // vertical quad centered at (x,y,z), facing direction (nx,nz), w x h meters, showing atlas cell
  wall(x, y, z, nx, nz, w, h, cell, flipU = false) {
    const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;            // right vector (when looking at the front)
    const A = [x - rx * hw, y - hh, z - rz * hw], B = [x + rx * hw, y - hh, z + rz * hw], C = [x + rx * hw, y + hh, z + rz * hw], D = [x - rx * hw, y + hh, z - rz * hw];
    this._push(A, B, C, D, [nx, 0, nz], cell, flipU);
  }
  // flat quad on the ground/roof, rotated by yaw
  flat(x, y, z, w, d, yaw, cell) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2;
    const P = (u, v) => [x + u * c + v * s, y, z - u * s + v * c];
    this._push(P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd), [0, 1, 0], cell, false);
  }
  _push(A, B, C, D, n, cell, flipU) {
    const cu = cell % this.cols, cv = Math.floor(cell / this.cols), u0 = cu / this.cols, u1 = (cu + 1) / this.cols, v1 = 1 - cv / this.rows, v0 = 1 - (cv + 1) / this.rows;
    const ua = flipU ? u1 : u0, ub = flipU ? u0 : u1;
    this.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    for (let i = 0; i < 6; i++) this.nor.push(...n);
    this.uv.push(ua, v0, ub, v0, ub, v1, ua, v0, ub, v1, ua, v1);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere(); return g;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Simple cartoony material helpers shared across the game
export const MAT = {
  lambert: (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts }),
  basic: (opts = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, ...opts })
};

// Text label on a canvas (signs, name tags, panels)
export function textCanvas(text, { w = 512, h = 128, bg = '#222244', fg = '#ffffff', font = 'bold 72px Trebuchet MS, sans-serif', border = '#1d1442', radius = 28 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) {
    x.fillStyle = border; roundRect(x, 0, 0, w, h, radius); x.fill();
    x.fillStyle = bg; roundRect(x, 8, 8, w - 16, h - 16, radius - 6); x.fill();
  }
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = border; x.strokeText(text, w / 2, h / 2 + 4);
  x.fillStyle = fg; x.fillText(text, w / 2, h / 2 + 4);
  return c;
}
export function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
