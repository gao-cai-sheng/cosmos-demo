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

/* ---- 视角向量：星下点方向 up + 航向 fwd ----
   和 buildOrbitBasis 用同一套 east / north 约定，互为反函数。 */
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const wrap360 = v => ((v % 360) + 360) % 360;

export function latLonVector(latDeg, lonDeg) {
  const la = latDeg * D2R, lo = lonDeg * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
}

export function orbitViewVectors(latDeg, lonDeg, headingDeg) {
  const up = latLonVector(latDeg, lonDeg);
  const lo = lonDeg * D2R, h = headingDeg * D2R;
  const east = [-Math.sin(lo), 0, Math.cos(lo)];
  const north = cross3(up, east);
  const fwd = [
    north[0] * Math.cos(h) + east[0] * Math.sin(h),
    north[1] * Math.cos(h) + east[1] * Math.sin(h),
    north[2] * Math.cos(h) + east[2] * Math.sin(h),
  ];
  return { up, fwd };
}

export function orbitViewFromVectors(upIn, fwdIn) {
  const up = norm3(upIn);
  const lat = Math.asin(Math.max(-1, Math.min(1, up[1]))) * R2D;
  const lon = wrap360(Math.atan2(up[2], up[0]) * R2D);
  const lo = lon * D2R;
  const east = [-Math.sin(lo), 0, Math.cos(lo)];
  const north = cross3(up, east);
  const k = dot3(fwdIn, up);
  const fwd = norm3([fwdIn[0] - up[0] * k, fwdIn[1] - up[1] * k, fwdIn[2] - up[2] * k]);
  const heading = wrap360(Math.atan2(dot3(fwd, east), dot3(fwd, north)) * R2D);
  return { lat, lon, heading };
}

export function rotateVector(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), kv = cross3(axis, v), kd = dot3(axis, v) * (1 - c);
  return [v[0] * c + kv[0] * s + axis[0] * kd, v[1] * c + kv[1] * s + axis[1] * kd, v[2] * c + kv[2] * s + axis[2] * kd];
}

/* 拖拽转动星球：手往哪拖，地表就跟着往哪走（相机反向绕球心转）。
   横向沿画面右轴，纵向沿航向 —— 俯仰 0 时画面上方就是航向。
   航向随位置一起转（平行移动），所以越过极点时画面不会打转。 */
export function dragOrbitView(view, dxPx, dyPx, radPerPx) {
  const len = Math.hypot(dxPx, dyPx);
  if (!len || !(radPerPx > 0)) return { lat: view.lat, lon: view.lon, heading: view.heading };
  const { up, fwd } = orbitViewVectors(view.lat, view.lon, view.heading);
  const right = norm3(cross3(up, fwd));
  const dir = norm3([
    -right[0] * dxPx + fwd[0] * dyPx,
    -right[1] * dxPx + fwd[1] * dyPx,
    -right[2] * dxPx + fwd[2] * dyPx,
  ]);
  const axis = norm3(cross3(up, dir));
  const angle = len * radPerPx;
  return orbitViewFromVectors(rotateVector(up, axis, angle), rotateVector(fwd, axis, angle));
}

/* 把视角从当前星下点沿大圆转到目标点，t = 0…1。降落时镜头先飞到标记上方。 */
export function slerpOrbitView(view, targetLat, targetLon, t) {
  const { up, fwd } = orbitViewVectors(view.lat, view.lon, view.heading);
  const target = latLonVector(targetLat, targetLon);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot3(up, target))));
  if (angle < 1e-9) return { lat: view.lat, lon: view.lon, heading: view.heading };
  let axis = cross3(up, target);
  axis = Math.hypot(...axis) < 1e-9 ? norm3(cross3(up, fwd)) : norm3(axis);
  const a = angle * Math.max(0, Math.min(1, t));
  return orbitViewFromVectors(rotateVector(up, axis, a), rotateVector(fwd, axis, a));
}

/* 屏幕点选地表：沿视线在 [rMin, rMax] 壳层里步进，碰到地形面后二分。
   radiusAt(lat, lon) 返回该点地形半径（行星半径 = 1，已含夸张）。
   和着色器一样是光线步进，点到的就是画面上看到的那块地。 */
export function pickOrbitSurface(origin, dirIn, radiusAt, rMin, rMax, steps = 600) {
  const rd = norm3(dirIn);
  const b = dot3(origin, rd);
  const hitSphere = r => {
    const disc = b * b - (dot3(origin, origin) - r * r);
    return disc <= 0 ? null : [-b - Math.sqrt(disc), -b + Math.sqrt(disc)];
  };
  const outer = hitSphere(rMax);
  if (!outer || outer[1] <= 0) return null;
  const t0 = Math.max(0, outer[0]);
  let t1 = outer[1];
  const inner = hitSphere(rMin);
  if (inner && inner[0] > t0) t1 = Math.min(t1, inner[0]);
  const sample = t => {
    const p = [origin[0] + rd[0] * t, origin[1] + rd[1] * t, origin[2] + rd[2] * t];
    const r = Math.hypot(p[0], p[1], p[2]);
    const lat = Math.asin(Math.max(-1, Math.min(1, p[1] / r))) * R2D;
    const lon = wrap360(Math.atan2(p[2], p[0]) * R2D);
    return { gap: r - radiusAt(lat, lon), lat, lon };
  };
  let lo = t0, prev = sample(t0);
  if (prev.gap <= 0) return { lat: prev.lat, lon: prev.lon, t: t0 };
  for (let i = 1; i <= steps; i++) {
    const t = t0 + (t1 - t0) * i / steps;
    const cur = sample(t);
    if (cur.gap <= 0) {
      let a = lo, z = t;
      for (let j = 0; j < 24; j++) { const m = (a + z) / 2; if (sample(m).gap > 0) a = m; else z = m; }
      const hit = sample(z);
      return { lat: hit.lat, lon: hit.lon, t: z };
    }
    lo = t;
  }
  return null;
}
