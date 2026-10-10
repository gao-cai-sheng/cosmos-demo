/**
 * Compatibility facade for the original MOLA helpers.
 *
 * New code should depend on terrain-data-source.js. Existing callers keep the
 * same decodeMola()/shadedReliefCanvas() API while the legacy 4 px/degree grid
 * is now just one terrain source implementation.
 */
import { createLegacyMolaSource, shadedReliefCanvas } from './terrain-data-source.js';

export function decodeMola(mola = globalThis.MOLA) {
  return createLegacyMolaSource(mola);
}

export { shadedReliefCanvas };
