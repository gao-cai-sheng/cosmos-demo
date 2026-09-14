const PITCH_MIN = 0;
const PITCH_MAX = 112;
const PITCH_DRAG_DEG_PER_PX = 0.18;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function dragOrbitPitch(pitch, deltaY, maxPitch = PITCH_MAX) {
  return Math.max(PITCH_MIN, Math.min(maxPitch, pitch + deltaY * PITCH_DRAG_DEG_PER_PX));
}

export function orbitPitchLimit(altKm, radiusKm = 3396.2, fovScalar = 0.62, marginDeg = 1.5) {
  const radius = Math.max(1, radiusKm);
  const altitude = Math.max(0, altKm);
  const limbFromNadir = Math.asin(radius / (radius + altitude)) * R2D;
  const verticalHalfFov = Math.atan(Math.max(0, fovScalar)) * R2D;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, limbFromNadir + verticalHalfFov - marginDeg));
}

export function buildOrbitBasis(latDeg, lonDeg, headingDeg, pitchDeg) {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const up = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  const east = [-Math.sin(lo), 0, Math.cos(lo)];
  const north = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ];
  const h = headingDeg * D2R;
  const fwd = [
    north[0] * Math.cos(h) + east[0] * Math.sin(h),
    north[1] * Math.cos(h) + east[1] * Math.sin(h),
    north[2] * Math.cos(h) + east[2] * Math.sin(h),
  ];
  const p = pitchDeg * D2R;
  const F = [
    -up[0] * Math.cos(p) + fwd[0] * Math.sin(p),
    -up[1] * Math.cos(p) + fwd[1] * Math.sin(p),
    -up[2] * Math.cos(p) + fwd[2] * Math.sin(p),
  ];

  // Stable at exact nadir: up × F degenerates when pitch === 0, while
  // up × fwd is the same normalized right axis for every non-zero pitch.
  let R = [
    up[1] * fwd[2] - up[2] * fwd[1],
    up[2] * fwd[0] - up[0] * fwd[2],
    up[0] * fwd[1] - up[1] * fwd[0],
  ];
  const rl = Math.hypot(...R) || 1;
  R = R.map(v => v / rl);
  const U = [
    F[1] * R[2] - F[2] * R[1],
    F[2] * R[0] - F[0] * R[2],
    F[0] * R[1] - F[1] * R[0],
  ];
  return [R[0], R[1], R[2], U[0], U[1], U[2], F[0], F[1], F[2]];
}
