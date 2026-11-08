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
