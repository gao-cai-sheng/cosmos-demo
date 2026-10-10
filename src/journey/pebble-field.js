// Near-field ground debris: grit, pebbles and cobbles around the viewer.
// Pure data (no three.js) so placement can be unit-tested. The world is cut into
// PEBBLE_CELL-metre squares and each square's stones are a pure function of
// (square, tier, seed): walk away and come back and the same stones are there.

export const PEBBLE_CELL = 4;

// Zone mask shared with mars-surface-material.js (the GLSL is built from these numbers),
// so stones gather where the ground material already paints gravel. Metres.
export const SURFACE_ZONE = { period: 6, offsetX: 37, offsetZ: 91, gravelLo: .46, gravelHi: .72, gravelMax: .8, rockLo: .035, rockHi: .24 };

// Diameters in metres. density: stones per m² in each zone before clustering.
// power: cumulative count N(>d) ∝ d^-power inside the tier, so small stones dominate.
// radius: how far from the focus the tier is kept; ahead: focus shift along the view.
export const PEBBLE_TIERS = [
  { name: 'grit', min: .008, max: .025, power: 2.6, radius: 9, ahead: 3, rebuild: .25, density: { dust: 8, gravel: 45, rock: 14 } },
  { name: 'pebble', min: .025, max: .07, power: 2.4, radius: 22, ahead: 6, rebuild: .5, density: { dust: 1.2, gravel: 7, rock: 3.5 } },
  { name: 'cobble', min: .07, max: .2, power: 2.0, radius: 28, ahead: 6, rebuild: .8, density: { dust: .05, gravel: .3, rock: .6 } },
];

const CLUSTER_PERIOD = 1.7, CLUSTER_LO = .3, CLUSTER_SPAN = 1.4, DARK_SHARE = .34;
// Floats per stone: 16 matrix (column-major, three.js order) + 3 tint.
export const STONE_STRIDE = 19;

const fract = v => v - Math.floor(v);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Same arithmetic as surfaceHash / surfaceNoise in the GLSL (float32 there, so the last
// digit can differ; the zone boundaries match to well under a centimetre).
function hash2(px, py) {
  let qx = fract(px * .1031), qy = fract(py * .1031), qz = fract(px * .1031);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract((qx + qy) * qz);
}
export function valueNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), e = hash2(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}

/** Surface zones at a ground point. slope is 1 − normal.y, like the material. */
export function surfaceZoneAt(x, z, slope = 0) {
  const Z = SURFACE_ZONE;
  const patch = valueNoise2((x + Z.offsetX) / Z.period, (z + Z.offsetZ) / Z.period);
  const rock = smoothstep(Z.rockLo, Z.rockHi, slope) * (.55 + .45 * patch);
  const gravel = (1 - rock) * smoothstep(Z.gravelLo, Z.gravelHi, patch) * Z.gravelMax;
  return { rock, gravel, dust: 1 - rock - gravel, patch };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cellSeed(cx, cz, tier, seed) {
  let h = Math.imul(cx | 0, 73856093) ^ Math.imul(cz | 0, 19349663) ^ Math.imul(tier + 1, 83492791) ^ Math.imul(seed | 0, 2654435761);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return (h ^ (h >>> 13)) >>> 0;
}

/** Stones per m² at a point for one tier (zones × clustering). */
export function stoneDensity(tier, x, z, slope, seed = 0) {
  const zone = surfaceZoneAt(x, z, slope);
  const d = tier.density;
  const cluster = CLUSTER_LO + CLUSTER_SPAN * valueNoise2(x / CLUSTER_PERIOD + seed % 997, z / CLUSTER_PERIOD - seed % 541);
  return (zone.dust * d.dust + zone.gravel * d.gravel + zone.rock * d.rock) * cluster;
}

/**
 * Stones of one tier in one square. heightAt(x,z): the rendered ground height.
 * Returns a Float32Array of STONE_STRIDE floats per stone.
 */
export function generateCell({ cx, cz, tierIndex, seed = 0, heightAt }) {
  const tier = PEBBLE_TIERS[tierIndex];
  const random = mulberry(cellSeed(cx, cz, tierIndex, seed));
  const x0 = cx * PEBBLE_CELL, z0 = cz * PEBBLE_CELL;
  const d = tier.density;
  const peak = Math.max(d.dust, d.gravel, d.rock) * (CLUSTER_LO + CLUSTER_SPAN);
  const expected = peak * PEBBLE_CELL * PEBBLE_CELL;
  const tries = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
  const out = [];
  const k = tier.power, q = 1 - Math.pow(tier.min / tier.max, k);
  // One slope per square: the rock zone only changes over metres.
  const h00 = heightAt(x0, z0), h10 = heightAt(x0 + PEBBLE_CELL, z0), h01 = heightAt(x0, z0 + PEBBLE_CELL), h11 = heightAt(x0 + PEBBLE_CELL, z0 + PEBBLE_CELL);
  const gx = (h10 + h11 - h00 - h01) / (2 * PEBBLE_CELL), gz = (h01 + h11 - h00 - h10) / (2 * PEBBLE_CELL);
  const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
  for (let i = 0; i < tries; i++) {
    // Draw every number up front so rejecting one stone never shifts the next.
    const rx = random(), rz = random(), accept = random(), size = random(), bury = random();
    const yaw = random(), tx = random(), tz = random(), sa = random(), sb = random(), sc = random(), tone = random(), hue = random();
    const x = x0 + rx * PEBBLE_CELL, z = z0 + rz * PEBBLE_CELL;
    if (accept * peak > stoneDensity(tier, x, z, slope, seed)) continue;
    const h = heightAt(x, z);
    const diameter = tier.min * Math.pow(1 - size * q, -1 / k);
    const r = diameter / 2;
    // Radii: pebbles lie flat, so the vertical axis is the short one.
    const sx = r * (.85 + .4 * sa), sy = r * (.45 + .35 * sb), sz = r * (.85 + .4 * sc);
    const b = .28 + .3 * bury;                     // fraction of the height below ground
    const y = h + sy * (1 - 2 * b);
    writeMatrix(out, x, y, z, yaw * Math.PI * 2, (tx - .5) * .6, (tz - .5) * .6, sx, sy, sz);
    // Two populations: dust-coated stones close to the ground colour, and a third of
    // darker grey basalt. Relative tint; the material holds the base colour.
    const dark = hue < DARK_SHARE;
    const t = dark ? .5 + .28 * tone : .92 + .28 * tone, warm = dark ? -.05 : .08;
    out.push(t * (1 + warm), t, t * (1 - warm));
  }
  return new Float32Array(out);
}

// R = Ry(yaw)·Rx(tiltX)·Rz(tiltZ), scaled per axis, translated. Column-major.
function writeMatrix(out, x, y, z, yaw, tiltX, tiltZ, sx, sy, sz) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(tiltX), sb = Math.sin(tiltX), cc = Math.cos(tiltZ), sc = Math.sin(tiltZ);
  // Ry·Rx
  const m00 = ca, m01 = sa * sb, m02 = sa * cb;
  const m10 = 0, m11 = cb, m12 = -sb;
  const m20 = -sa, m21 = ca * sb, m22 = ca * cb;
  // (Ry·Rx)·Rz
  const r00 = m00 * cc + m01 * sc, r01 = -m00 * sc + m01 * cc, r02 = m02;
  const r10 = m10 * cc + m11 * sc, r11 = -m10 * sc + m11 * cc, r12 = m12;
  const r20 = m20 * cc + m21 * sc, r21 = -m20 * sc + m21 * cc, r22 = m22;
  out.push(r00 * sx, r10 * sx, r20 * sx, 0, r01 * sy, r11 * sy, r21 * sy, 0, r02 * sz, r12 * sz, r22 * sz, 0, x, y, z, 1);
}

/**
 * Keeps generated squares in a small cache and gathers the stones of one tier
 * within its radius of a focus point.
 */
export function createPebbleField({ heightAt, seed = 0, maxCells = 900 }) {
  const caches = PEBBLE_TIERS.map(() => new Map());
  let generated = 0;
  function cell(tierIndex, cx, cz) {
    const cache = caches[tierIndex], key = cx + ',' + cz;
    let stones = cache.get(key);
    if (stones) { cache.delete(key); cache.set(key, stones); return stones; }
    stones = generateCell({ cx, cz, tierIndex, seed, heightAt });
    generated++;
    cache.set(key, stones);
    if (cache.size > maxCells) cache.delete(cache.keys().next().value);
    return stones;
  }
  /** Writes up to capacity stones into matrices / tints; returns how many. */
  function collect(tierIndex, fx, fz, matrices, tints, capacity) {
    const tier = PEBBLE_TIERS[tierIndex], R = tier.radius, R2 = R * R;
    const c0x = Math.floor((fx - R) / PEBBLE_CELL), c1x = Math.floor((fx + R) / PEBBLE_CELL);
    const c0z = Math.floor((fz - R) / PEBBLE_CELL), c1z = Math.floor((fz + R) / PEBBLE_CELL);
    let n = 0;
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      // Skip squares whose nearest point is out of range.
      const nx = Math.max(cx * PEBBLE_CELL, Math.min(fx, (cx + 1) * PEBBLE_CELL)) - fx;
      const nz = Math.max(cz * PEBBLE_CELL, Math.min(fz, (cz + 1) * PEBBLE_CELL)) - fz;
      if (nx * nx + nz * nz > R2) continue;
      const stones = cell(tierIndex, cx, cz);
      for (let o = 0; o < stones.length && n < capacity; o += STONE_STRIDE) {
        const dx = stones[o + 12] - fx, dz = stones[o + 14] - fz;
        if (dx * dx + dz * dz > R2) continue;
        matrices.set(stones.subarray(o, o + 16), n * 16);
        tints.set(stones.subarray(o + 16, o + 19), n * 3);
        n++;
      }
    }
    return n;
  }
  return { collect, get generated() { return generated; }, clear() { caches.forEach(c => c.clear()); } };
}
