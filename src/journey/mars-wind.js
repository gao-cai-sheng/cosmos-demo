// Prevailing surface wind for the landing plain: one direction shared by the metre-scale
// ripples in the terrain height, the decimetre ripples in the ground material and the sand
// tails behind rocks, so the bedforms agree with each other. A game setting, not a measured
// local wind. WIND points downwind; crests run across it.
export const WIND_DEG = 112;
const a = WIND_DEG * Math.PI / 180;
export const WIND = Object.freeze({ x: Math.cos(a), z: Math.sin(a) });
