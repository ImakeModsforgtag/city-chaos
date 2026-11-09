// Lightweight AABB collision world with a spatial hash grid.
// Used by: client movement (sphere push-out), client + server raycasts (bullets, line of sight).

export class CollisionWorld {
  constructor(boxes, cell = 8) {
    this.cell = cell;
    this.boxes = boxes.filter(b => b.s);
    this.grid = new Map();
    this.stamp = new Uint32Array(this.boxes.length);
    this.curStamp = 1;
    this.boxes.forEach((b, i) => {
      const cx0 = Math.floor(b.min[0] / cell), cx1 = Math.floor(b.max[0] / cell);
      const cz0 = Math.floor(b.min[2] / cell), cz1 = Math.floor(b.max[2] / cell);
      for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
        const k = x * 4096 + z;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, arr = []);
        arr.push(i);
      }
    });
    this._out = [];
  }

  // collect candidate box indices overlapping XZ rect
  query(x0, z0, x1, z1) {
    const c = this.cell, out = this._out; out.length = 0;
    const s = ++this.curStamp;
    if (s > 4e9) { this.stamp.fill(0); this.curStamp = 1; }
    const cx0 = Math.floor(x0 / c), cx1 = Math.floor(x1 / c), cz0 = Math.floor(z0 / c), cz1 = Math.floor(z1 / c);
    for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
      const arr = this.grid.get(x * 4096 + z);
      if (!arr) continue;
      for (const i of arr) if (this.stamp[i] !== s) { this.stamp[i] = s; if (!this.boxes[i].off) out.push(i); } // .off = open door
    }
    return out;
  }

  // Push a sphere out of all boxes. p = {x,y,z} (mutated). Returns null or {nx,ny,nz} accumulated normal.
  pushSphere(p, r, iterations = 3) {
    let hit = false, nx = 0, ny = 0, nz = 0;
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      const cand = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
      for (const i of cand) {
        const b = this.boxes[i];
        const qx = Math.max(b.min[0], Math.min(p.x, b.max[0]));
        const qy = Math.max(b.min[1], Math.min(p.y, b.max[1]));
        const qz = Math.max(b.min[2], Math.min(p.z, b.max[2]));
        let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d > 1e-6) {
          dx /= d; dy /= d; dz /= d;
          const push = r - d;
          p.x += dx * push; p.y += dy * push; p.z += dz * push;
        } else {
          // center inside box: push along smallest penetration axis
          const pen = [p.x - b.min[0], b.max[0] - p.x, p.y - b.min[1], b.max[1] - p.y, p.z - b.min[2], b.max[2] - p.z];
          let m = 0; for (let k = 1; k < 6; k++) if (pen[k] < pen[m]) m = k;
          dx = dy = dz = 0;
          if (m === 0) { p.x = b.min[0] - r; dx = -1; } else if (m === 1) { p.x = b.max[0] + r; dx = 1; }
          else if (m === 2) { p.y = b.min[1] - r; dy = -1; } else if (m === 3) { p.y = b.max[1] + r; dy = 1; }
          else if (m === 4) { p.z = b.min[2] - r; dz = -1; } else { p.z = b.max[2] + r; dz = 1; }
        }
        nx += dx; ny += dy; nz += dz; hit = true; moved = true;
      }
      if (!moved) break;
    }
    if (!hit) return null;
    const l = Math.hypot(nx, ny, nz) || 1;
    return { nx: nx / l, ny: ny / l, nz: nz / l };
  }

  sphereOverlaps(x, y, z, r) {
    const cand = this.query(x - r, z - r, x + r, z + r);
    for (const i of cand) {
      const b = this.boxes[i];
      const qx = Math.max(b.min[0], Math.min(x, b.max[0]));
      const qy = Math.max(b.min[1], Math.min(y, b.max[1]));
      const qz = Math.max(b.min[2], Math.min(z, b.max[2]));
      const dx = x - qx, dy = y - qy, dz = z - qz;
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    return false;
  }

  // Sweep a sphere from a to b (both {x,y,z}); returns resolved position (object) and whether it hit.
  // Moves in sub-steps so fast hands/bodies can't tunnel through thin walls.
  sweepSphere(a, b, r) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    // safety: never loop forever on bad input (NaN/Infinity from a tracking glitch)
    if (!Number.isFinite(len) || !Number.isFinite(a.x + a.y + a.z)) return { p: { x: a.x, y: a.y, z: a.z }, hit: null };
    const steps = Math.min(400, Math.max(1, Math.ceil(len / (r * 0.5))));
    const p = { x: a.x, y: a.y, z: a.z };
    let hit = null;
    for (let i = 1; i <= steps; i++) {
      p.x += dx / steps; p.y += dy / steps; p.z += dz / steps;
      const n = this.pushSphere(p, r);
      if (n) { hit = n; }
    }
    return { p, hit };
  }

  // Ray vs all solid boxes. Returns hit distance (Infinity if none) and normal in this.lastNormal.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist, bestN = null;
    const step = this.cell * 0.5;
    const s = ++this.curStamp;
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
    for (let t = 0; t <= best + step; t += step) {
      const px = ox + dx * t, pz = oz + dz * t;
      const cx = Math.floor(px / this.cell), cz = Math.floor(pz / this.cell);
      for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
        const arr = this.grid.get((cx + ax) * 4096 + (cz + az));
        if (!arr) continue;
        for (const i of arr) {
          if (this.stamp[i] === s) continue;
          this.stamp[i] = s;
          const b = this.boxes[i];
          if (b.off) continue;
          let t1 = (b.min[0] - ox) * ix, t2 = (b.max[0] - ox) * ix;
          let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
          let sgn = t1 < t2 ? -1 : 1;
          t1 = (b.min[1] - oy) * iy; t2 = (b.max[1] - oy) * iy;
          let a = Math.min(t1, t2);
          if (a > tmin) { tmin = a; axis = 1; sgn = t1 < t2 ? -1 : 1; }
          tmax = Math.min(tmax, Math.max(t1, t2));
          t1 = (b.min[2] - oz) * iz; t2 = (b.max[2] - oz) * iz;
          a = Math.min(t1, t2);
          if (a > tmin) { tmin = a; axis = 2; sgn = t1 < t2 ? -1 : 1; }
          tmax = Math.min(tmax, Math.max(t1, t2));
          if (tmax >= Math.max(tmin, 0) && tmin < best && tmin >= 0) {
            best = tmin;
            bestN = axis === 0 ? [sgn, 0, 0] : axis === 1 ? [0, sgn, 0] : [0, 0, sgn];
          }
        }
      }
      if (t > best) break;
    }
    this.lastNormal = bestN;
    return bestN ? best : Infinity;
  }
}

// Ray vs sphere: returns distance or Infinity. Direction must be normalized.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  const t = tca - thc;
  if (t >= 0) return t;
  return tca + thc >= 0 ? 0 : Infinity;
}

// Ray vs vertical capsule (segment from (cx,y0,cz) to (cx,y1,cz), radius r)
export function rayCapsule(ox, oy, oz, dx, dy, dz, cx, y0, y1, cz, r) {
  // infinite cylinder in XZ first
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  let best = Infinity;
  if (a > 1e-9) {
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0) continue;
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) { best = Math.min(best, t); break; }
      }
    }
  }
  best = Math.min(best, raySphere(ox, oy, oz, dx, dy, dz, cx, y0, cz, r));
  best = Math.min(best, raySphere(ox, oy, oz, dx, dy, dz, cx, y1, cz, r));
  return best;
}
