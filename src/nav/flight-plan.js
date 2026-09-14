/**
 * NX07（游隼）航线计算与存档。纯函数，无 DOM，Node 可测。
 * 坐标为行星中心纬度 / 东经 0–360°；距离单位 km；航向为真北顺时针度数。
 */
export const R_MARS_KM = 3389.5, CRZ_KMH = 972, CRZ_MAX_KM = 400, LOCAL_KM = 6.4;
/** 起飞与降落两段实时掠地飞行（设计规则，DISCUSSION_LOG D16）：离地 100 m、按 CRZ 速度 972 km/h；
 * 起飞后掠地 25 s 再转航线图；终点从着陆点前方 6 km 进场，按 12 m/s² 减速曲线降速。*/
export const SKIM = Object.freeze({ aglM: 100, speedMs: CRZ_KMH / 3.6, departSeconds: 25, approachM: 6000, decel: 12 });
export const PLAN_KEY = 'cosmos.kestrel.flightplan.v1', NAV_KEY = 'cosmos.kestrel.nav.v1';
/** 没有游戏存档时的起点：先遣营地（原型固定起点）。*/
export const CAMP = Object.freeze({ lat: -13.4, lon: 300.6 });
const MODES = ['auto', 'CRZ', 'ORB'], ORIGIN_IDS = ['PPOS', 'CAMP'];
const D2R = Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 单次取余：((x%360)+360)%360 会把 312.05 变成 312.049999…
export const wrapLon = lon => { const r = lon % 360; return r < 0 ? r + 360 : r + 0; };

export function distanceKm(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_MARS_KM * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function courseDeg(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R + 360) % 360;
}
export function interpolate(a, b, f) {
  const la1 = a.lat * D2R, lo1 = a.lon * D2R, la2 = b.lat * D2R, lo2 = b.lon * D2R;
  const x1 = Math.cos(la1) * Math.cos(lo1), y1 = Math.cos(la1) * Math.sin(lo1), z1 = Math.sin(la1);
  const x2 = Math.cos(la2) * Math.cos(lo2), y2 = Math.cos(la2) * Math.sin(lo2), z2 = Math.sin(la2);
  const om = Math.acos(clamp(x1 * x2 + y1 * y2 + z1 * z2, -1, 1));
  if (om < 1e-9) return { lat: a.lat, lon: wrapLon(a.lon) };
  const s = Math.sin(om), k1 = Math.sin((1 - f) * om) / s, k2 = Math.sin(f * om) / s;
  const x = k1 * x1 + k2 * x2, y = k1 * y1 + k2 * y2, z = k1 * z1 + k2 * z2;
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: wrapLon(Math.atan2(y, x) / D2R) };
}
export function destination(p, brg, d) {
  const p1 = p.lat * D2R, l1 = p.lon * D2R, t = brg * D2R, dl = d / R_MARS_KM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dl) * Math.cos(p1), Math.cos(dl) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / D2R, lon: wrapLon(l2 / D2R) };
}

/** 航段飞行方式：手动指定优先；auto 时 400 km 内大气巡航，超过入轨转移。*/
export const legMode = (mode, d) => mode === 'CRZ' || mode === 'ORB' ? mode : d <= CRZ_MAX_KM ? 'CRZ' : 'ORB';
export function buildLegs(route) {
  const legs = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], d = distanceKm(a, b);
    legs.push({ i, a, b, d, crs: courseDeg(a, b), mode: legMode(b.mode, d) });
  }
  return legs;
}
/** CRZ 按 972 km/h 估算；ORB 用时是游戏转场抽象（约 2 分钟）。*/
export const legMinutes = L => L.mode === 'CRZ' ? L.d / CRZ_KMH * 60 : 2;
export function routeTotals(legs) {
  const orb = legs.filter(L => L.mode === 'ORB').length;
  return { km: legs.reduce((s, L) => s + L.d, 0), minutes: legs.reduce((s, L) => s + legMinutes(L), 0), orb, crz: legs.length - orb };
}

/** 巡航转场的实际播放秒数（游戏时间压缩，设计规则）。*/
export const transitSeconds = km => clamp(8 + km / 125, 8, 40);
/** 按已飞比例 f（0–1，按距离匀速）求沿线位置。*/
export function transitState(legs, f) {
  if (!legs.length) return null;
  const total = legs.reduce((s, L) => s + L.d, 0), done = clamp(f, 0, 1) * total;
  let start = 0;
  for (const L of legs) {
    const last = L === legs[legs.length - 1];
    if (done <= start + L.d || last) {
      const k = L.d > 0 ? clamp((done - start) / L.d, 0, 1) : 1;
      const pos = k >= 1 ? { lat: L.b.lat, lon: wrapLon(L.b.lon) } : interpolate(L.a, L.b, k);
      const ahead = k >= 1 ? L.crs : courseDeg(pos, L.b);
      return { pos, course: ahead, leg: L.i, mode: L.mode, kmDone: done, kmLeft: Math.max(0, total - done) };
    }
    start += L.d;
  }
  return null;
}

/** 所有航路点都在起点 limitKm 内：当前地表场景里全程真飞，不转场。*/
export const isLocalRoute = (route, limitKm = LOCAL_KM) => route.length > 1 && route.slice(1).every(w => distanceKm(route[0], w) <= limitKm);
/** 航向（度）→ NX07 yaw：前向 (sin yaw, cos yaw)，场景 +z 指向南。*/
export const courseToYaw = c => Math.PI - c * D2R;

export function sanitizeWaypoint(w) {
  const lat = Number(w?.lat), lon = Number(w?.lon);
  if (typeof w?.id !== 'string' || !w.id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { id: w.id.slice(0, 16), lat: clamp(lat, -90, 90), lon: wrapLon(lon), mode: MODES.includes(w.mode) ? w.mode : 'auto' };
}
/** 读航线；起点永远替换为当前 NX07 位置。坏数据返回 null。*/
export function loadPlan(storage, ppos) {
  try {
    const raw = JSON.parse(storage.getItem(PLAN_KEY) || 'null');
    if (raw?.version !== 1 || !Array.isArray(raw.route)) return null;
    const rest = raw.route.filter((w, i) => !(i === 0 && ORIGIN_IDS.includes(w?.id))).map(sanitizeWaypoint).filter(Boolean);
    return { sent: raw.sent === true, route: [{ id: 'PPOS', lat: ppos.lat, lon: wrapLon(ppos.lon), mode: 'auto' }, ...rest] };
  } catch { return null; }
}
export function savePlan(storage, route, sent) {
  try {
    const rest = route.slice(1).map(sanitizeWaypoint).filter(Boolean);
    storage.setItem(PLAN_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), sent: !!sent, route: [{ id: 'PPOS', lat: route[0].lat, lon: wrapLon(route[0].lon) }, ...rest] }));
    return true;
  } catch { return false; }
}
export function loadPpos(storage) {
  try {
    const p = JSON.parse(storage.getItem(NAV_KEY) || 'null')?.ppos;
    if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) return { lat: clamp(p.lat, -90, 90), lon: wrapLon(p.lon) };
  } catch {}
  return { ...CAMP };
}
export function savePpos(storage, p) {
  try { storage.setItem(NAV_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ppos: { lat: p.lat, lon: wrapLon(p.lon) } })); return true; } catch { return false; }
}
