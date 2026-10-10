/**
 * Lazy tiled terrain source for high-resolution Mars DEMs.
 *
 * Tiles store signed metre elevations in PNG R/G bytes:
 *   unsigned16 = R * 256 + G
 *   metres = unsigned16 - 32768
 *
 * The class is deliberately cache-first: elevationKm() is synchronous and
 * returns NaN until the required tiles have been loaded. This lets a
 * createTerrainSourceStack() fall through to the coarse global MOLA source
 * while high-resolution data streams in.
 */

import { MARS_RADIUS_KM, normalizeBounds } from './terrain-data-source.js';

const DEFAULT_ENCODING = { type: 'signed-int16-m-rg', offset: 32768, nodata: -32768 };

function levelResolutionM(level, bounds, radiusKm) {
  if (Number.isFinite(+level.resolutionM)) return +level.resolutionM;
  return 2 * Math.PI * radiusKm * 1000 * ((bounds.east - bounds.west) / 360) / level.width;
}

function normalizeManifest(manifest) {
  if (!manifest || manifest.version !== 1) throw new Error('不支持的地形瓦片 manifest');
  if (!manifest.id) throw new Error('地形瓦片 manifest 缺少 id');
  const bounds = normalizeBounds(manifest.bounds);
  const tileSize = Number(manifest.tileSize || 256);
  if (!Number.isInteger(tileSize) || tileSize < 16) throw new Error('非法 terrain tileSize');
  const bodyRadiusKm = Number.isFinite(+manifest.bodyRadiusKm) ? +manifest.bodyRadiusKm : MARS_RADIUS_KM;
  const levels = (manifest.levels || []).map((level, index) => {
    const width = Number(level.width), height = Number(level.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error(`非法地形层尺寸: ${index}`);
    const ppd = Number.isFinite(+level.ppd) ? +level.ppd : width / (bounds.east - bounds.west);
    return {
      ...level,
      id: level.id ?? String(index),
      width,
      height,
      ppd,
      cols: Number(level.cols || Math.ceil(width / tileSize)),
      rows: Number(level.rows || Math.ceil(height / tileSize)),
      resolutionM: levelResolutionM({ ...level, width }, bounds, bodyRadiusKm),
      path: level.path || `${level.id ?? index}/{x}/{y}.png`,
    };
  }).sort((a, b) => a.ppd - b.ppd);
  if (!levels.length) throw new Error('地形瓦片 manifest 没有 levels');
  return {
    ...manifest,
    bounds,
    tileSize,
    bodyRadiusKm,
    encoding: { ...DEFAULT_ENCODING, ...(manifest.encoding || {}) },
    levels,
  };
}

function joinUrl(base, relative) {
  try { return new URL(relative, base).href; }
  catch {
    if (!base) return relative;
    return `${String(base).replace(/\/$/, '')}/${String(relative).replace(/^\//, '')}`;
  }
}

function tilePath(level, tx, ty) {
  return level.path.replaceAll('{z}', String(level.id)).replaceAll('{x}', String(tx)).replaceAll('{y}', String(ty));
}

function pixelCoords(lat, lon, manifest, level) {
  const B = manifest.bounds;
  const la = Number(lat), lo0 = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo0) || la < B.south || la > B.north) return null;
  const lonSpan = B.east - B.west;
  const globalWrap = Math.abs(lonSpan - 360) < 1e-6;
  let lo = lo0;
  if (globalWrap) lo = B.west + (((lo - B.west) % lonSpan) + lonSpan) % lonSpan;
  else if (lo < B.west || lo > B.east) return null;
  const fx0 = (lo - B.west) * level.width / lonSpan - 0.5;
  const fy0 = (B.north - la) * level.height / (B.north - B.south) - 0.5;
  return {
    fx: globalWrap ? fx0 : Math.max(0, Math.min(level.width - 1.001, fx0)),
    fy: Math.max(0, Math.min(level.height - 1.001, fy0)),
    wrapX: globalWrap,
  };
}

async function defaultLoadTile(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res?.ok) throw new Error(`地形瓦片加载失败 ${res?.status ?? ''}: ${url}`);
  const blob = await res.blob();
  if (typeof createImageBitmap !== 'function') throw new Error('当前环境没有 PNG 图像解码器');
  const image = await createImageBitmap(blob);
  let canvas;
  if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(image.width, image.height);
  else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  } else throw new Error('当前环境没有 Canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  image.close?.();
  return { width: canvas.width, height: canvas.height, data };
}

export class TerrainTileSource {
  constructor(manifest, {
    baseUrl = '',
    priority = null,
    cacheTiles = 96,
    fetchFn = globalThis.fetch,
    loadTile = null,
  } = {}) {
    this.manifest = normalizeManifest(manifest);
    this.id = this.manifest.id;
    this.label = this.manifest.label || this.id;
    this.bounds = this.manifest.bounds;
    this.priority = priority != null && Number.isFinite(+priority) ? +priority : Number(this.manifest.priority ?? 10);
    this.datum = this.manifest.datum || 'unknown';
    this.projection = this.manifest.projection || 'simple-cylindrical';
    this.provenance = { ...(this.manifest.provenance || {}), tiled: true };
    this.resolutionM = this.manifest.levels.at(-1).resolutionM;
    this.baseUrl = baseUrl;
    this.cacheTiles = Math.max(4, Number(cacheTiles) || 96);
    this.fetchFn = fetchFn;
    this.loadTile = loadTile || ((url) => defaultLoadTile(url, this.fetchFn));
    this.cache = new Map();
    this.pending = new Map();
  }

  covers(lat, lon) {
    const B = this.bounds, la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la < B.south || la > B.north) return false;
    return Math.abs((B.east - B.west) - 360) < 1e-6 || (lo >= B.west && lo <= B.east);
  }

  chooseLevel({ ppd = null, resolutionM = null } = {}) {
    const levels = this.manifest.levels;
    if (Number.isFinite(+ppd)) return levels.find(level => level.ppd >= +ppd) || levels.at(-1);
    if (Number.isFinite(+resolutionM)) {
      // Resolution is metres/pixel: first layer fine enough, otherwise finest.
      return levels.slice().reverse().find(level => level.resolutionM <= +resolutionM) || levels.at(-1);
    }
    return levels.at(-1);
  }

  _key(level, tx, ty) { return `${level.id}/${tx}/${ty}`; }

  _touch(key, tile) {
    this.cache.delete(key);
    this.cache.set(key, tile);
    while (this.cache.size > this.cacheTiles) this.cache.delete(this.cache.keys().next().value);
  }

  async _ensureTile(level, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) return null;
    const key = this._key(level, tx, ty);
    if (this.cache.has(key)) {
      const tile = this.cache.get(key); this._touch(key, tile); return tile;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const url = joinUrl(this.baseUrl, tilePath(level, tx, ty));
    const promise = Promise.resolve(this.loadTile(url, level, tx, ty)).then(tile => {
      if (!tile?.data || !Number.isInteger(tile.width) || !Number.isInteger(tile.height)) throw new Error(`非法地形瓦片: ${key}`);
      this._touch(key, tile);
      this.pending.delete(key);
      return tile;
    }, err => { this.pending.delete(key); throw err; });
    this.pending.set(key, promise);
    return promise;
  }

  _corners(lat, lon, level) {
    const p = pixelCoords(lat, lon, this.manifest, level);
    if (!p) return null;
    const x0 = Math.floor(p.fx), y0 = Math.floor(p.fy), tx = p.fx - x0, ty = p.fy - y0;
    const wrap = x => p.wrapX ? (x + level.width) % level.width : Math.max(0, Math.min(level.width - 1, x));
    return { x0: wrap(x0), x1: wrap(x0 + 1), y0, y1: Math.min(level.height - 1, y0 + 1), tx, ty };
  }

  async ensure(lat, lon, options = {}) {
    const level = this.chooseLevel(options), c = this._corners(lat, lon, level);
    if (!c) return false;
    const ts = this.manifest.tileSize;
    const tiles = new Map();
    for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) {
      const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
      tiles.set(`${tx}/${ty}`, [tx, ty]);
    }
    await Promise.all([...tiles.values()].map(([tx, ty]) => this._ensureTile(level, tx, ty)));
    return true;
  }

  _pixelMeters(level, x, y) {
    const ts = this.manifest.tileSize, tx = Math.floor(x / ts), ty = Math.floor(y / ts);
    const key = this._key(level, tx, ty), tile = this.cache.get(key);
    if (!tile) return NaN;
    const lx = x - tx * ts, ly = y - ty * ts;
    if (lx < 0 || ly < 0 || lx >= tile.width || ly >= tile.height) return NaN;
    const i = (ly * tile.width + lx) * 4;
    const u = (tile.data[i] << 8) | tile.data[i + 1];
    const metres = u - Number(this.manifest.encoding.offset ?? 32768);
    if (metres === Number(this.manifest.encoding.nodata ?? -32768)) return NaN;
    return metres;
  }

  elevationKm(lat, lon, options = {}) {
    const level = this.chooseLevel(options), c = this._corners(lat, lon, level);
    if (!c) return NaN;
    const a = this._pixelMeters(level, c.x0, c.y0), b = this._pixelMeters(level, c.x1, c.y0);
    const d = this._pixelMeters(level, c.x0, c.y1), e = this._pixelMeters(level, c.x1, c.y1);
    if (![a, b, d, e].every(Number.isFinite)) return NaN;
    return ((a * (1 - c.tx) + b * c.tx) * (1 - c.ty) + (d * (1 - c.tx) + e * c.tx) * c.ty) / 1000;
  }

  sampleInfo(lat, lon, options = {}) {
    const level = this.chooseLevel(options), elevationKm = this.elevationKm(lat, lon, options);
    if (!Number.isFinite(elevationKm)) return null;
    return {
      elevationKm,
      sourceId: this.id,
      sourceLabel: this.label,
      resolutionM: level.resolutionM,
      datum: this.datum,
      projection: this.projection,
      levelId: level.id,
      provenance: this.provenance,
    };
  }

  async sample(lat, lon, options = {}) {
    if (!(await this.ensure(lat, lon, options))) return null;
    return this.sampleInfo(lat, lon, options);
  }

  clear() {
    this.cache.clear();
    this.pending.clear();
  }
}

export async function loadTerrainTileSource(manifestUrl, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const res = await fetchFn(manifestUrl);
  if (!res?.ok) throw new Error(`地形 manifest 加载失败 ${res?.status ?? ''}: ${manifestUrl}`);
  const manifest = await res.json();
  return new TerrainTileSource(manifest, { ...options, fetchFn, baseUrl: options.baseUrl || manifestUrl });
}
