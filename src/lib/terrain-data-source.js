/**
 * COSMOS terrain data foundation.
 *
 * A terrain source answers one question consistently: elevation at a Mars
 * latitude/longitude, plus enough provenance to say where that number came
 * from.  The current MOLA 4 px/degree grid is adapted into this interface;
 * finer MOLA/HRSC/HiRISE sources can be layered later without teaching flight,
 * weather or navigation about individual file formats.
 */

export const MARS_RADIUS_KM = 3396.2;
const D2R = Math.PI / 180;
const LEGACY_CACHE = new WeakMap();

export function wrapLon360(lon) {
  const n = Number(lon);
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : NaN;
}

export function normalizeBounds(bounds = {}) {
  const west = Number.isFinite(+bounds.west) ? +bounds.west : 0;
  const east = Number.isFinite(+bounds.east) ? +bounds.east : 360;
  const south = Number.isFinite(+bounds.south) ? +bounds.south : -90;
  const north = Number.isFinite(+bounds.north) ? +bounds.north : 90;
  if (!(east > west) || !(north > south)) throw new Error('非法地形范围');
  return { west, east, south, north };
}

function resolutionAtEquatorM(width, bounds, radiusKm = MARS_RADIUS_KM) {
  const span = bounds.east - bounds.west;
  return 2 * Math.PI * radiusKm * 1000 * (span / 360) / width;
}

function lonInside(lon, bounds, wrapLongitude) {
  if (wrapLongitude && Math.abs((bounds.east - bounds.west) - 360) < 1e-6) return true;
  const x = Number(lon);
  return Number.isFinite(x) && x >= bounds.west && x <= bounds.east;
}

function rasterCoords(lat, lon, source) {
  const { W, H, bounds, wrapLongitude } = source;
  const la = Number(lat);
  if (!Number.isFinite(la) || la < bounds.south || la > bounds.north || !lonInside(lon, bounds, wrapLongitude)) return null;

  const lonSpan = bounds.east - bounds.west;
  let lo = Number(lon);
  if (wrapLongitude && Math.abs(lonSpan - 360) < 1e-6) {
    lo = bounds.west + (((lo - bounds.west) % lonSpan) + lonSpan) % lonSpan;
  }
  const fx0 = (lo - bounds.west) * W / lonSpan - 0.5;
  const fy0 = (bounds.north - la) * H / (bounds.north - bounds.south) - 0.5;
  const fx = wrapLongitude ? fx0 : Math.max(0, Math.min(W - 1.001, fx0));
  const fy = Math.max(0, Math.min(H - 1.001, fy0));
  return { fx, fy };
}

export function createRasterTerrainSource({
  id,
  label,
  width,
  height,
  elevationsKm,
  bounds,
  wrapLongitude = true,
  resolutionM = null,
  priority = 0,
  datum = 'unknown',
  projection = 'simple-cylindrical',
  provenance = {},
  bodyRadiusKm = MARS_RADIUS_KM,
} = {}) {
  const W = Number(width), H = Number(height);
  if (!id) throw new Error('地形数据源缺少 id');
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 2 || H < 2) throw new Error(`${id}: 非法栅格尺寸`);
  if (!elevationsKm || elevationsKm.length !== W * H) throw new Error(`${id}: 高程数组尺寸不匹配`);

  const B = normalizeBounds(bounds);
  const source = {
    id,
    label: label || id,
    W,
    H,
    E: elevationsKm,
    bounds: B,
    wrapLongitude: !!wrapLongitude,
    priority: Number(priority) || 0,
    resolutionM: Number.isFinite(+resolutionM) ? +resolutionM : resolutionAtEquatorM(W, B, bodyRadiusKm),
    datum,
    projection,
    provenance: { ...provenance },
    bodyRadiusKm,
    covers(lat, lon) {
      return Number.isFinite(+lat) && +lat >= B.south && +lat <= B.north && lonInside(lon, B, source.wrapLongitude);
    },
    elevationKm(lat, lon) {
      const p = rasterCoords(lat, lon, source);
      if (!p) return NaN;
      const { fx, fy } = p;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = source.wrapLongitude ? (x0 + W) % W : Math.max(0, Math.min(W - 1, x0));
      const xb = source.wrapLongitude ? (x0 + 1 + W) % W : Math.max(0, Math.min(W - 1, x0 + 1));
      const y1 = Math.min(H - 1, y0 + 1);
      const a = elevationsKm[y0 * W + xa], b = elevationsKm[y0 * W + xb];
      const c = elevationsKm[y1 * W + xa], d = elevationsKm[y1 * W + xb];
      if (![a, b, c, d].every(Number.isFinite)) return NaN;
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
    sampleInfo(lat, lon) {
      const elevationKm = source.elevationKm(lat, lon);
      if (!Number.isFinite(elevationKm)) return null;
      return {
        elevationKm,
        sourceId: source.id,
        sourceLabel: source.label,
        resolutionM: source.resolutionM,
        datum: source.datum,
        projection: source.projection,
        provenance: source.provenance,
      };
    },
  };
  return source;
}

export function decodeSigned16BEBase64({ b64, w, h }) {
  if (!b64) throw new Error('缺少 16 位高程数据');
  const W = Number(w), H = Number(h);
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1) throw new Error('非法高程尺寸');
  const bin = atob(b64);
  if (bin.length < W * H * 2) throw new Error('高程数据长度不足');
  const E = new Float32Array(W * H);
  for (let i = 0; i < E.length; i++) {
    let v = (bin.charCodeAt(i * 2) << 8) | bin.charCodeAt(i * 2 + 1);
    if (v & 0x8000) v -= 0x10000;
    E[i] = v / 1000;
  }
  return E;
}

export function createLegacyMolaSource(mola = globalThis.MOLA) {
  if (!mola?.b64) throw new Error('缺少 MOLA 数据：请先加载 data/mola_4ppd.js');
  if (typeof mola === 'object' && LEGACY_CACHE.has(mola)) return LEGACY_CACHE.get(mola);
  const W = Number(mola.w), H = Number(mola.h);
  const ppd = W / 360;
  const source = createRasterTerrainSource({
    id: `mola-megdr-${Number.isInteger(ppd) ? ppd : ppd.toFixed(2)}ppd`,
    label: `MOLA MEGDR ${Number.isInteger(ppd) ? ppd : ppd.toFixed(2)} px/°`,
    width: W,
    height: H,
    elevationsKm: decodeSigned16BEBase64(mola),
    bounds: { west: 0, east: 360, south: -90, north: 90 },
    wrapLongitude: true,
    priority: 0,
    datum: 'MOLA planetary radius datum',
    projection: 'simple-cylindrical',
    provenance: {
      family: 'MGS MOLA MEGDR',
      legacyGlobal: true,
      ppd,
      sourceFile: mola.source || null,
    },
    bodyRadiusKm: Number.isFinite(+mola.radius_km) ? +mola.radius_km : MARS_RADIUS_KM,
  });
  if (typeof mola === 'object') LEGACY_CACHE.set(mola, source);
  return source;
}

function sourceOrder(a, b) {
  if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  const ar = Number.isFinite(a.resolutionM) ? a.resolutionM : Infinity;
  const br = Number.isFinite(b.resolutionM) ? b.resolutionM : Infinity;
  return ar - br;
}

export function createTerrainSourceStack(initial = []) {
  const sources = [];
  const api = {
    add(source) {
      if (!source?.id || typeof source.elevationKm !== 'function') throw new Error('非法地形数据源');
      const i = sources.findIndex(s => s.id === source.id);
      if (i >= 0) sources.splice(i, 1);
      sources.push(source);
      sources.sort(sourceOrder);
      return api;
    },
    remove(id) {
      const i = sources.findIndex(s => s.id === id);
      if (i >= 0) sources.splice(i, 1);
      return api;
    },
    get sources() { return sources.slice(); },
    sampleInfo(lat, lon) {
      for (const source of sources) {
        if (source.covers && !source.covers(lat, lon)) continue;
        const info = source.sampleInfo ? source.sampleInfo(lat, lon) : null;
        if (info && Number.isFinite(info.elevationKm)) return info;
        const elevationKm = source.elevationKm(lat, lon);
        if (Number.isFinite(elevationKm)) {
          return {
            elevationKm,
            sourceId: source.id,
            sourceLabel: source.label || source.id,
            resolutionM: source.resolutionM ?? null,
            datum: source.datum ?? null,
            projection: source.projection ?? null,
            provenance: source.provenance || {},
          };
        }
      }
      return null;
    },
    elevationKm(lat, lon) {
      return api.sampleInfo(lat, lon)?.elevationKm ?? NaN;
    },
  };
  initial.forEach(source => api.add(source));
  return api;
}

/** Dark navigation-chart relief for a raster source. */
export function shadedReliefCanvas({ W, H, E, bodyRadiusKm = MARS_RADIUS_KM }, doc = document) {
  const stops = [[-8.5, 10, 24, 38], [-5, 15, 34, 48], [-2.5, 24, 44, 52], [0, 36, 50, 50], [2, 52, 56, 48], [5, 70, 62, 50], [9, 90, 74, 58], [14, 114, 96, 78], [21.2, 158, 148, 138]];
  const ramp = h => {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (h <= b[0]) {
        const t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0])));
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      }
    }
    return stops.at(-1).slice(1);
  };

  const c = doc.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const dy = (180 / H) * D2R * bodyRadiusKm;
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + .5) * 180 / H, dx = dy * Math.max(.08, Math.cos(lat * D2R));
    for (let x = 0; x < W; x++) {
      const i = y * W + x, h = E[i], xe = (x + 1) % W, xw = (x - 1 + W) % W;
      const yn = Math.max(0, y - 1), ys = Math.min(H - 1, y + 1);
      const nx = -(E[y * W + xe] - E[y * W + xw]) / (2 * dx) * 40;
      const ny = -(E[ys * W + x] - E[yn * W + x]) / (2 * dy) * 40;
      const il = 1 / Math.hypot(nx, ny, 1);
      const sh = Math.max(.45, Math.min(1.45, (nx * il * -.55 + ny * il * -.62 + il * .56) * 1.2 + .45));
      let [r, gg, b] = ramp(h);
      if (Math.floor(h) !== Math.floor(E[y * W + xe]) || Math.floor(h) !== Math.floor(E[ys * W + x])) {
        const k = Math.floor(h / 5) !== Math.floor(E[y * W + xe] / 5) || Math.floor(h / 5) !== Math.floor(E[ys * W + x] / 5) ? 1.55 : 1.2;
        r *= k; gg *= k; b *= k;
      }
      const o = i * 4;
      d[o] = Math.min(255, r * sh); d[o + 1] = Math.min(255, gg * sh); d[o + 2] = Math.min(255, b * sh); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
