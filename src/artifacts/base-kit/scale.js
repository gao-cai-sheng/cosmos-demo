import { OUTPOST_LENGTH, OUTPOST_WIDTH, OUTPOST_HEIGHT } from '../../journey/outpost-layout.js';
import { AIRLOCK } from '../../journey/outpost-interior-layout.js';

// Existing game geometry is the scale reference, never the generated image.
// New base >= current outpost; human fittings stay at ordinary human scale.
export const BASE_SCALE = Object.freeze({
  outpost: Object.freeze([OUTPOST_LENGTH, OUTPOST_HEIGHT, OUTPOST_WIDTH]),
  domeDiameter: 260, domeCrown: 64, skirtHeight: 10,
  doorWidth: 1.4, doorHeight: 2.4,
  airlockWidth: 2 * AIRLOCK.span + .6,
  airlockHeight: AIRLOCK.height + .6,
  airlockLength: AIRLOCK.outerZ - AIRLOCK.innerZ,
});
