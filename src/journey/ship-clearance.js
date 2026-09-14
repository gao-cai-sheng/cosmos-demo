// Height-aware NX07 collision in ship-local metres (+Y up, +Z bow).
// The hull is a baked underside/top heightfield; landing gear, hatch leaves and
// elevator decks are live solids. Objects are vertical columns [bottom, top].
export const CLEARANCE_MARGIN = .15;

/** Rasterise triangles into per-cell lowest and highest hull surface. */
export function bakeHullField(meshes, {cell = .5, x0 = -38, z0 = -43, x1 = 38, z1 = 46} = {}) {
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const low = new Float32Array(nx * nz).fill(Infinity), high = new Float32Array(nx * nz).fill(-Infinity);
  const put = (x, z, y) => {
    const i = Math.floor((x - x0) / cell), k = Math.floor((z - z0) / cell);
    if (i < 0 || i >= nx || k < 0 || k >= nz) return;
    const c = i + k * nx; if (y < low[c]) low[c] = y; if (y > high[c]) high[c] = y;
  };
  for (const {positions, index, matrix} of meshes) {
    const count = index ? index.length : positions.length / 3, e = matrix;
    const vx = new Float32Array(3), vy = new Float32Array(3), vz = new Float32Array(3);
    for (let t = 0; t < count; t += 3) {
      for (let j = 0; j < 3; j++) {
        const o = (index ? index[t + j] : t + j) * 3, px = positions[o], py = positions[o + 1], pz = positions[o + 2];
        if (e) { vx[j] = e[0]*px + e[4]*py + e[8]*pz + e[12]; vy[j] = e[1]*px + e[5]*py + e[9]*pz + e[13]; vz[j] = e[2]*px + e[6]*py + e[10]*pz + e[14]; }
        else { vx[j] = px; vy[j] = py; vz[j] = pz; }
        put(vx[j], vz[j], vy[j]);
      }
      const [ax, bx, cx] = vx, [ay, by, cy] = vy, [az, bz, cz] = vz;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / cell));
      const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell));
      for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
        const px = x0 + (i + .5) * cell, pz = z0 + (k + .5) * cell;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d, l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) put(px, pz, l1 * ay + l2 * by + l3 * cy);
      }
    }
  }
  return {cell, x0, z0, nx, nz, low, high, dilated: new Map()};
}

// Lowest hull within a square window of `pad` metres; cached per pad.
function lowWithin(field, x, z, pad) {
  const i = Math.floor((x - field.x0) / field.cell), k = Math.floor((z - field.z0) / field.cell);
  const w = Math.ceil(Math.max(0, pad) / field.cell);
  if (i < -w || i >= field.nx + w || k < -w || k >= field.nz + w) return Infinity;
  let grid = field.dilated.get(w);
  if (!grid) {
    const {nx, nz, low} = field, rows = new Float32Array(nx * nz);
    grid = new Float32Array(nx * nz);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
      let m = Infinity; for (let q = Math.max(0, c - w); q <= Math.min(nx - 1, c + w); q++) m = Math.min(m, low[q + r * nx]);
      rows[c + r * nx] = m;
    }
    for (let c = 0; c < nx; c++) for (let r = 0; r < nz; r++) {
      let m = Infinity; for (let q = Math.max(0, r - w); q <= Math.min(nz - 1, r + w); q++) m = Math.min(m, rows[c + q * nx]);
      grid[c + r * nx] = m;
    }
    field.dilated.set(w, grid);
  }
  const ci = Math.min(field.nx - 1, Math.max(0, i)), ck = Math.min(field.nz - 1, Math.max(0, k));
  if (ci !== i || ck !== k) {
    // Outside the baked grid but within pad: only the clamped edge can reach.
    if (Math.abs(ci - i) > w || Math.abs(ck - k) > w) return Infinity;
  }
  return grid[ci + ck * field.nx];
}

function segmentXZDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
  const t = len > 1e-12 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/**
 * Does a vertical column at local (x,z), radius `pad`, spanning local heights
 * [bottom, top], touch the hull or any live solid? top=Infinity asks for the
 * plan-view silhouette (used where nothing may park under the ship).
 */
export function columnHitsShip({field, rods = [], boxes = []}, x, z, pad = 0, bottom = -Infinity, top = Infinity) {
  const reach = top + CLEARANCE_MARGIN;
  if (field && reach > lowWithin(field, x, z, pad)) return true;
  for (const b of boxes) {
    if (Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad && reach > b.bottom && bottom < b.top) return true;
  }
  for (const {a, b, r} of rods) {
    // Keep only the part of the rod inside the column's height band.
    const lo = bottom - r, hi = reach + r, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    if (Math.abs(dy) < 1e-9) { if (a.y < lo || a.y > hi) continue; }
    else {
      const ta = (lo - a.y) / dy, tb = (hi - a.y) / dy;
      t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
      if (t0 > t1) continue;
    }
    const ax = a.x + (b.x - a.x) * t0, az = a.z + (b.z - a.z) * t0, bx = a.x + (b.x - a.x) * t1, bz = a.z + (b.z - a.z) * t1;
    if (segmentXZDistance(x, z, ax, az, bx, bz) < r + pad) return true;
  }
  return false;
}

/** Point-in-solid test for camera booms. */
export function pointInShip({field, rods = [], boxes = []}, x, y, z, margin = .3) {
  if (field) {
    const i = Math.floor((x - field.x0) / field.cell), k = Math.floor((z - field.z0) / field.cell);
    if (i >= 0 && i < field.nx && k >= 0 && k < field.nz) {
      const c = i + k * field.nx;
      if (y > field.low[c] - margin && y < field.high[c] + margin) return true;
    }
  }
  for (const b of boxes) {
    if (Math.abs(x - b.x) < b.hw + margin && Math.abs(z - b.z) < b.hd + margin && y > b.bottom - margin && y < b.top + margin) return true;
  }
  for (const {a, b, r} of rods) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = dx * dx + dy * dy + dz * dz;
    const t = len > 1e-12 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / len)) : 0;
    if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t, z - a.z - dz * t) < r + margin) return true;
  }
  return false;
}

// Oriented rectangle (centre x,z; yaw; half width/length) against a ship-local AABB.
export function rectOverlapsBox({x, z, yaw, hw, hl}, b, margin = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ac = Math.abs(c), as = Math.abs(s);
  const W = hw + margin, L = hl + margin, dx = b.x - x, dz = b.z - z;
  if (Math.abs(dx) > W * ac + L * as + b.hw) return false;
  if (Math.abs(dz) > W * as + L * ac + b.hd) return false;
  if (Math.abs(dx * c - dz * s) > W + b.hw * ac + b.hd * as) return false;
  return Math.abs(dx * s + dz * c) <= L + b.hw * as + b.hd * ac;
}

// Segment (rect frame) against [-A,A]x[-B,B] by Liang-Barsky clipping.
function segmentHitsAabb(u0, v0, u1, v1, A, B) {
  let t0 = 0, t1 = 1;
  const du = u1 - u0, dv = v1 - v0;
  for (const [p, q] of [[-du, u0 + A], [du, A - u0], [-dv, v0 + B], [dv, B - v0]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/**
 * Vehicle footprint as an oriented rectangle spanning local heights [bottom, top].
 * Point samples with a large pad cannot thread a truck between lift guide posts.
 */
export function rectHitsShip({field, rods = [], boxes = []}, rect, bottom, top, margin = .1) {
  const {x, z, yaw, hw, hl} = rect, c = Math.cos(yaw), s = Math.sin(yaw), reach = top + CLEARANCE_MARGIN;
  if (field) {
    const m = margin + field.cell * .5, ex = Math.abs((hw + m) * c) + Math.abs((hl + m) * s), ez = Math.abs((hw + m) * s) + Math.abs((hl + m) * c);
    const i0 = Math.max(0, Math.floor((x - ex - field.x0) / field.cell)), i1 = Math.min(field.nx - 1, Math.floor((x + ex - field.x0) / field.cell));
    const k0 = Math.max(0, Math.floor((z - ez - field.z0) / field.cell)), k1 = Math.min(field.nz - 1, Math.floor((z + ez - field.z0) / field.cell));
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      if (!(reach > field.low[i + k * field.nx])) continue;
      const dx = field.x0 + (i + .5) * field.cell - x, dz = field.z0 + (k + .5) * field.cell - z;
      if (Math.abs(dx * c - dz * s) <= hw + m && Math.abs(dx * s + dz * c) <= hl + m) return true;
    }
  }
  for (const b of boxes) if (reach > b.bottom && bottom < b.top && rectOverlapsBox(rect, b, margin)) return true;
  for (const {a, b, r} of rods) {
    const lo = bottom - r, hi = reach + r, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    if (Math.abs(dy) < 1e-9) { if (a.y < lo || a.y > hi) continue; }
    else {
      const ta = (lo - a.y) / dy, tb = (hi - a.y) / dy;
      t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
      if (t0 > t1) continue;
    }
    const toRect = t => { const dx = a.x + (b.x - a.x) * t - x, dz = a.z + (b.z - a.z) * t - z; return [dx * c - dz * s, dx * s + dz * c]; };
    const [u0, v0] = toRect(t0), [u1, v1] = toRect(t1);
    if (segmentHitsAabb(u0, v0, u1, v1, hw + margin + r, hl + margin + r)) return true;
  }
  return false;
}
