/**
 * 火星天气组件：纯数据，不依赖 DOM / three，可被任何交互界面调用。
 *
 * 这是游戏模拟，不是天气预报。量级取自真实观测：
 * - τ（光学厚度）平时约 0.3–0.9，全球尘暴 4–10；光伏按 exp(-0.3τ) 衰减，与机遇号尘暴期供电下降量级一致。
 * - 气压 ≈ 560 Pa × e^(−高度/11.1 km)（按海盗1号、好奇号实测年均值反推的等效基准），叠加约 ±10% 季节变化（极冠二氧化碳冻结/升华）与日潮。
 * - 尘暴沿北方锋面路径（阿西达利亚、乌托邦、阿卡狄亚）和南半球区域（希腊盆地、诺亚、太阳高原）在尘暴季出现；
 *   北极螺旋冰云气旋、峡谷晨雾、火山午后山地云、中午前后尘卷风均为真实现象的简化。
 * 时间由调用方传入：{ sol, dayFraction, refLon, ls? }。dayFraction 是参考经度 refLon 处的当地时间（0 = 午夜）。
 */
export const MARS = Object.freeze({ radiusKm: 3389.5, solsPerYear: 668.6, obliquityDeg: 25.19, scaleHeightKm: 11.1, meanDatumPa: 560 });
export const HAZARD_LABELS = Object.freeze(['正常', '注意', '警戒', '危险']);
export const SCENARIOS = Object.freeze({ auto: '按季节', clear: '晴空', regional: '区域尘暴', global: '全球尘暴' });

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = v => v - Math.floor(v);
const wrap360 = v => ((v % 360) + 360) % 360;

export function hash01(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) { h = Math.imul(h ^ (Math.round(p * 1000) | 0), 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; }
  return (h >>> 0) / 4294967296;
}

/* ---------- 球面几何 ---------- */
export function distanceKm(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * MARS.radiusKm * Math.asin(Math.min(1, Math.sqrt(x)));
}
export function bearingDeg(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return wrap360(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R);
}
export function destination(p, brg, km) {
  const p1 = p.lat * D2R, l1 = p.lon * D2R, t = brg * D2R, d = km / MARS.radiusKm;
  const p2 = Math.asin(clamp(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t), -1, 1));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / D2R, lon: wrap360(l2 / D2R) };
}
/** 大圆采样，返回 [{lat, lon, km}]，含起终点。*/
export function greatCircle(a, b, stepKm = 50) {
  const total = distanceKm(a, b), n = Math.max(1, Math.ceil(total / stepKm));
  const la1 = a.lat * D2R, lo1 = a.lon * D2R, la2 = b.lat * D2R, lo2 = b.lon * D2R;
  const v1 = [Math.cos(la1) * Math.cos(lo1), Math.cos(la1) * Math.sin(lo1), Math.sin(la1)];
  const v2 = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
  const om = Math.acos(clamp(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2], -1, 1)), out = [];
  for (let j = 0; j <= n; j++) {
    const f = j / n;
    if (om < 1e-9) { out.push({ lat: a.lat, lon: wrap360(a.lon), km: 0 }); continue; }
    const k1 = Math.sin((1 - f) * om) / Math.sin(om), k2 = Math.sin(f * om) / Math.sin(om);
    const x = k1 * v1[0] + k2 * v2[0], y = k1 * v1[1] + k2 * v2[1], z = k1 * v1[2] + k2 * v2[2];
    out.push({ lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: wrap360(Math.atan2(y, x) / D2R), km: total * f });
  }
  return out;
}

/* ---------- 时间与太阳 ---------- */
export function normalizeTime(time = {}) {
  const sol = Number.isFinite(time.sol) ? time.sol : 0;
  const dayFraction = frac(Number.isFinite(time.dayFraction) ? time.dayFraction : .5);
  const refLon = wrap360(Number.isFinite(time.refLon) ? time.refLon : 0);
  const ls = Number.isFinite(time.ls) ? wrap360(time.ls) : lsFromSol(sol, time.ls0 || 0);
  return { sol, dayFraction, refLon, ls, t: Math.floor(sol) + dayFraction };
}
/** 太阳经度 Ls 的线性近似：真实火星轨道偏心，季节长短不等。*/
export const lsFromSol = (sol, ls0 = 0) => wrap360(ls0 + sol * 360 / MARS.solsPerYear);
export const solFromLs = (ls, ls0 = 0) => wrap360(ls - ls0) / 360 * MARS.solsPerYear;
export const localFraction = (time, lon) => { const T = normalizeTime(time); return frac(T.dayFraction + (wrap360(lon) - T.refLon) / 360); };
/** LMST：一个火星日分为 24 个“火星小时”，因此永远在 00:00–23:59。*/
export function lmst(fraction) { const m = Math.floor(frac(fraction) * 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
export function seasonOf(ls) {
  const north = ['春', '夏', '秋', '冬'][Math.floor(wrap360(ls) / 90)];
  const dusty = inWindow(wrap360(ls), [180, 330]);
  return { north, south: { 春: '秋', 夏: '冬', 秋: '春', 冬: '夏' }[north], dusty, label: `北半球${north} · 南半球${{ 春: '秋', 夏: '冬', 秋: '春', 冬: '夏' }[north]}${dusty ? ' · 尘暴季' : ''}` };
}
export function subsolarPoint(time) {
  const T = normalizeTime(time);
  return { lat: Math.asin(Math.sin(MARS.obliquityDeg * D2R) * Math.sin(T.ls * D2R)) / D2R, lon: wrap360(T.refLon + (.5 - T.dayFraction) * 360) };
}
export function sunElevationDeg(lat, lon, time) {
  const T = normalizeTime(time), dec = Math.asin(Math.sin(MARS.obliquityDeg * D2R) * Math.sin(T.ls * D2R));
  const h = (localFraction(T, lon) - .5) * 2 * Math.PI;
  return Math.asin(clamp(Math.sin(lat * D2R) * Math.sin(dec) + Math.cos(lat * D2R) * Math.cos(dec) * Math.cos(h), -1, 1)) / D2R;
}

/* ---------- 大气量 ---------- */
export function surfacePressurePa(elevKm, ls = 0, localF = null) {
  const season = 1 + .10 * Math.cos((ls - 260) * D2R) + .04 * Math.cos(2 * (ls - 50) * D2R);
  const tide = localF == null ? 1 : 1 + .025 * Math.cos(2 * Math.PI * (localF - .28)) + .012 * Math.cos(4 * Math.PI * (localF - .40));
  return MARS.meanDatumPa * Math.exp(-elevKm / MARS.scaleHeightKm) * season * tide;
}
/** 光伏输出相对同一太阳位置晴空值的比例（不含太阳高度本身）。*/
export const solarFactor = tau => Math.exp(-.3 * Math.max(0, tau));
/** 水平能见度：尘埃越浓，尘层越贴地。*/
export function visibilityKm(tau) {
  const dustH = MARS.scaleHeightKm / (1 + .15 * Math.max(0, tau));
  return clamp(3.912 / (Math.max(1e-3, tau) / dustH), .2, 80);
}

/* ---------- 天气系统 ---------- */
export const STORM_TRACKS = Object.freeze([
  { id: 'ACD', name: '阿西达利亚锋面尘暴', kind: 'frontal', lat: 50, lon: 330, heading: 195, window: [180, 30] },
  { id: 'UTP', name: '乌托邦锋面尘暴', kind: 'frontal', lat: 50, lon: 115, heading: 185, window: [180, 30] },
  { id: 'ARC', name: '阿卡狄亚锋面尘暴', kind: 'frontal', lat: 50, lon: 185, heading: 175, window: [180, 30] },
  { id: 'HLS', name: '希腊盆地边缘尘暴', kind: 'regional', lat: -35, lon: 60, heading: 40, window: [150, 330] },
  { id: 'NOA', name: '诺亚高地尘暴', kind: 'regional', lat: -45, lon: 345, heading: 70, window: [180, 300] },
  { id: 'SOL', name: '太阳高原尘暴', kind: 'regional', lat: -25, lon: 265, heading: 310, window: [200, 320] },
  { id: 'NPC', name: '北极螺旋冰云气旋', kind: 'polar', lat: 70, lon: 0, heading: 90, window: [100, 170] },
]);
const VOLCANOES = [['奥林帕斯山', 18.65, 226.2], ['阿斯克劳山', 11.8, 255.5], ['帕弗尼斯山', 1.48, 247.0], ['阿尔西亚山', -8.35, 239.9]];
function inWindow(ls, [a, b]) { return a <= b ? ls >= a && ls <= b : ls >= a || ls <= b; }
const PERIOD = 16;

export function createMarsWeather({ seed = 1, scenario = 'auto', elevationKm = null } = {}) {
  let mode = SCENARIOS[scenario] ? scenario : 'auto';
  let cacheKey = '', cache = [];

  function storms(time) {
    const T = normalizeTime(time), key = `${mode}|${T.t.toFixed(4)}|${T.ls.toFixed(3)}`;
    if (key === cacheKey) return cache;
    const out = [];
    STORM_TRACKS.forEach((track, ti) => {
      for (let k = Math.floor((T.t - 14) / PERIOD); k <= Math.floor(T.t / PERIOD); k++) {
        const r = i => hash01(seed, ti, k, i);
        const polar = track.kind === 'polar', start = k * PERIOD + r(1) * (PERIOD - 4), duration = polar ? 3 + r(2) * 3 : 4 + r(2) * 8, age = T.t - start;
        if (age < 0 || age > duration) continue;
        const lsStart = wrap360(T.ls - age * 360 / MARS.solsPerYear);
        let p = inWindow(lsStart, track.window) ? (polar ? .45 : .55) : .06;
        if (mode === 'clear') p = 0;
        else if (mode === 'regional') p = polar ? .1 : Math.max(p, .7);
        else if (mode === 'global') p = polar ? 0 : .35;
        if (r(3) >= p) continue;
        const env = Math.sin(Math.PI * age / duration), heading = track.heading + (r(5) - .5) * 40;
        const speed = track.kind === 'frontal' ? 700 + r(4) * 600 : polar ? 150 + r(4) * 150 : 250 + r(4) * 350;
        const origin = { lat: track.lat + (r(6) - .5) * 10, lon: polar ? r(7) * 360 : track.lon + (r(7) - .5) * 20 };
        const c = destination(origin, heading, speed * age);
        out.push({
          id: `${track.id}-${String(((k % 100) + 100) % 100).padStart(2, '0')}`, track: track.id, name: track.name, kind: track.kind,
          lat: c.lat, lon: c.lon, heading, speedKmSol: speed, radiusKm: (polar ? 650 : 380) + r(8) * 600,
          tauPeak: (polar ? .25 : 1.4 + r(9) * 2.8) * env, windMs: (polar ? 14 + r(10) * 8 : 10 + r(10) * 16) * env,
          intensity: env, ageSols: age, remainingSols: duration - age, iceCloud: polar,
        });
      }
    });
    if (mode === 'global') out.unshift({ id: 'GDS', track: 'GDS', name: '全球环绕尘暴', kind: 'global', lat: -30, lon: 60, heading: 0, speedKmSol: 0, radiusKm: Math.PI * MARS.radiusKm, tauPeak: 0, windMs: 0, intensity: 1, ageSols: 0, remainingSols: 60, iceCloud: false });
    cacheKey = key; cache = out;
    return out;
  }

  function backgroundTau(lat, T) {
    const dusty = .5 + .5 * Math.cos((T.ls - 250) * D2R);
    if (mode === 'global') return 4.2 + 1.2 * Math.cos(lat * D2R);
    if (mode === 'clear') return .25 + .1 * dusty;
    return .3 + .55 * dusty + .12 * Math.abs(Math.sin(lat * D2R)) * dusty;
  }

  function fogAt(lat, lon, lf, ls) {
    if (lat < -16 || lat > -2 || lon < 255 || lon > 310) return 0;
    const morning = Math.exp(-((lf - .29) ** 2) / (2 * .035 ** 2)), aphelion = inWindow(ls, [20, 160]) ? 1 : .45;
    return clamp(morning * aphelion, 0, 1);
  }

  function phenomena(lat, lon, time, s = null) {
    const T = normalizeTime(time), lf = localFraction(T, lon), list = [];
    const fog = fogAt(lat, wrap360(lon), lf, T.ls);
    if (fog > .25) list.push({ kind: 'fog', label: '峡谷晨雾', detail: '水冰雾贴谷底，日出后数小时消散' });
    if (inWindow(T.ls, [40, 160]) && lf > .55 && lf < .78) for (const [name, la, lo] of VOLCANOES) if (distanceKm({ lat, lon }, { lat: la, lon: lo }) < 350) list.push({ kind: 'orographic', label: `${name}山地云`, detail: '午后水冰云沿火山坡生成' });
    const dd = s ? s.dustDevilRisk : sample(lat, lon, T).dustDevilRisk;
    if (dd > .45) list.push({ kind: 'dustDevils', label: '尘卷风活跃', detail: '中午前后最多；偶尔会顺带清扫光伏板积尘' });
    return list;
  }

  function sample(lat, lon, time, opts = {}) {
    const T = normalizeTime(time), lonW = wrap360(lon);
    const elev = Number.isFinite(opts.elevationKm) ? opts.elevationKm : elevationKm ? elevationKm(lat, lonW) : 0;
    const lf = localFraction(T, lonW), sunEl = sunElevationDeg(lat, lonW, T), day = Math.max(0, Math.sin(sunEl * D2R));
    let tau = backgroundTau(lat, T);
    let wind = 3 + 5 * day + 2 * hash01(seed, Math.floor(lat / 5), Math.floor(lonW / 5), Math.floor(T.t * 4));
    let windFrom = hash01(seed, Math.floor(lat / 10), Math.floor(lonW / 10), Math.floor(T.t)) * 360, stormWind = 0, storm = null, best = 0;
    for (const s of storms(T)) {
      if (s.kind === 'global') { storm = storm || { id: s.id, name: s.name, kind: s.kind, distanceKm: 0, inside: true, core: false, iceCloud: false }; wind += 8; continue; }
      const d = distanceKm({ lat, lon: lonW }, s), x = d / s.radiusKm;
      if (x > 1.4) continue;
      const f = Math.exp(-2.2 * x * x), w = s.windMs * f * (s.iceCloud && x < .2 ? x / .2 : 1);
      tau += s.tauPeak * f;
      if (w > stormWind) { stormWind = w; windFrom = wrap360(bearingDeg(s, { lat, lon: lonW }) + (lat >= 0 ? 90 : -90)); }
      if (f > best || storm?.kind === 'global') { best = f; storm = { id: s.id, name: s.name, kind: s.kind, distanceKm: d, inside: x <= 1, core: x < .5, iceCloud: s.iceCloud }; }
    }
    wind += stormWind;
    const fog = fogAt(lat, lonW, lf, T.ls);
    let vis = visibilityKm(tau);
    if (storm?.iceCloud && storm.inside) vis = Math.min(vis, 12 + 20 * (1 - best));
    if (fog > 0) vis = Math.min(vis, 80 - 79.2 * fog);
    const pv = solarFactor(tau) * (storm?.iceCloud && storm.inside ? .85 : 1);
    const seasonC = 6 * Math.sin(lat * D2R) * Math.sin(T.ls * D2R) + 3 * Math.cos((T.ls - 251) * D2R);
    const airC = Math.max(-125, -85 + 65 * day ** .8 / (1 + .25 * tau) + 3 * Math.min(tau, 6) - 1.5 * elev + seasonC);
    const groundC = Math.max(-128, -100 + 118 * day ** .8 / (1 + .35 * tau) + (day > 0 ? 0 : 4 * Math.min(tau, 6)) - elev + seasonC);
    const localSummer = .5 + .5 * Math.sign(lat || 1) * Math.sin(T.ls * D2R), hour = lf * 24;
    const dustDevilRisk = clamp(Math.exp(-((hour - 12.5) ** 2) / (2 * 1.8 ** 2)) * (.55 + .45 * localSummer) * (tau < 2 ? 1 : .35) * (sunEl > 20 ? 1 : .2), 0, 1);

    const reasons = [];
    let flight = 0, power = 0, eva = 0;
    if (vis < 8) flight = 1; if (vis < 3) flight = 2; if (vis < 1) flight = 3;
    if (wind > 18) flight = Math.max(flight, 1); if (wind > 25) flight = Math.max(flight, 2); if (wind > 32) flight = 3;
    if (storm?.core && storm.kind !== 'polar' && storm.kind !== 'global') flight = Math.max(flight, 2);
    if (pv < .7) power = 1; if (pv < .35) power = 2; if (pv < .12) power = 3;
    eva = Math.max(vis < 2 ? 2 : vis < 6 ? 1 : 0, power >= 2 ? 1 : 0, dustDevilRisk > .6 ? 1 : 0);
    if (vis < 8) reasons.push(`能见度 ${vis < 10 ? vis.toFixed(1) : Math.round(vis)} km`);
    if (wind > 18) reasons.push(`风 ${Math.round(wind)} m/s`);
    if (pv < .7) reasons.push(`光伏降至 ${Math.round(pv * 100)}%`);
    if (storm?.inside) reasons.push(storm.kind === 'global' ? '处于全球尘暴中' : `位于 ${storm.id} ${storm.core ? '核心' : '范围'}`);
    if (fog > .25) reasons.push('晨雾');
    if (dustDevilRisk > .6) reasons.push('尘卷风高发时段');
    const level = Math.max(flight, power, eva);

    return {
      lat, lon: lonW, elevationKm: elev, lmst: lmst(lf), localFraction: lf, sunElevationDeg: sunEl, ls: T.ls,
      tau, pressurePa: surfacePressurePa(elev, T.ls, lf), airC, groundC, windMs: wind, windFromDeg: windFrom,
      visibilityKm: vis, solarFactor: pv, dustDevilRisk, fog, storm,
      hazard: { level, label: HAZARD_LABELS[level], flight, power, eva, reasons },
    };
  }

  function route(points, time, stepKm = 60) {
    const T = normalizeTime(time), samples = [], legs = [];
    let base = 0;
    for (let i = 1; i < points.length; i++) {
      const seg = greatCircle(points[i - 1], points[i], stepKm), leg = { index: i, maxTau: 0, worstLevel: 0, storms: [] };
      seg.forEach((p, j) => {
        if (i > 1 && j === 0) return;
        const s = sample(p.lat, p.lon, T);
        samples.push({ leg: i, km: base + p.km, lat: p.lat, lon: p.lon, tau: s.tau, level: s.hazard.flight, storm: s.storm });
        leg.maxTau = Math.max(leg.maxTau, s.tau); leg.worstLevel = Math.max(leg.worstLevel, s.hazard.flight);
        if (s.storm?.inside && !leg.storms.includes(s.storm.id)) leg.storms.push(s.storm.id);
      });
      base += seg[seg.length - 1].km; legs.push(leg);
    }
    const crossings = [];
    let cur = null;
    for (const s of samples) {
      const id = s.storm?.inside ? s.storm.id : null;
      if (!id) { cur = null; continue; }
      if (!cur || cur.id !== id) { cur = { id, name: s.storm.name, kind: s.storm.kind, leg: s.leg, fromKm: s.km, toKm: s.km, maxTau: s.tau, level: s.level }; crossings.push(cur); }
      else { cur.toKm = s.km; cur.maxTau = Math.max(cur.maxTau, s.tau); cur.level = Math.max(cur.level, s.level); }
    }
    return { samples, legs, crossings, maxTau: Math.max(0, ...legs.map(l => l.maxTau)), worstLevel: Math.max(0, ...legs.map(l => l.worstLevel)) };
  }

  return {
    get scenario() { return mode; },
    setScenario(next) { if (SCENARIOS[next]) { mode = next; cacheKey = ''; } return mode; },
    storms, sample, route, phenomena,
    summary(time) {
      const T = normalizeTime(time), list = storms(T);
      return { ls: T.ls, season: seasonOf(T.ls), scenario: mode, scenarioLabel: SCENARIOS[mode], storms: list.length, subsolar: subsolarPoint(T) };
    },
  };
}
