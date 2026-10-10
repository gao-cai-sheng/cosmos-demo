/**
 * Default Mars terrain stack for COSMOS.
 *
 * The legacy 4 px/degree MOLA grid stays the synchronous global fallback.
 * Regional tiled DEMs are loaded opportunistically and inserted at higher
 * priority once their manifest and first warm tile are ready.
 */
import { createLegacyMolaSource, createTerrainSourceStack } from './terrain-data-source.js';
import { loadTerrainTileSource } from './terrain-tile-source.js';

export const DEFAULT_MARS_TERRAIN_MANIFESTS = Object.freeze([
  new URL('../../data/terrain/mola-128ppd-camp/manifest.json', import.meta.url).href,
]);

function centreOf(bounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

export function createDefaultMarsTerrain({
  mola = globalThis.MOLA,
  manifests = DEFAULT_MARS_TERRAIN_MANIFESTS,
  fetchFn = globalThis.fetch,
  loadTile = null,
  onSource = null,
  onError = null,
} = {}) {
  const global = createLegacyMolaSource(mola);
  const stack = createTerrainSourceStack([global]);
  stack.label = global.label;
  stack.globalSource = global;

  const jobs = (manifests || []).map(async manifestUrl => {
    try {
      const source = await loadTerrainTileSource(manifestUrl, { fetchFn, loadTile });
      const warm = centreOf(source.bounds);
      await source.ensure(warm.lat, warm.lon);
      stack.add(source);
      stack.label = `${global.label} + ${source.label}`;
      onSource?.(source, stack);
      return source;
    } catch (error) {
      onError?.(error, manifestUrl);
      return null;
    }
  });

  stack.ready = Promise.all(jobs).then(items => items.filter(Boolean));
  return stack;
}
