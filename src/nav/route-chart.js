/**
 * 游隼航线图（由 tools/flight-nav.html 原型移植）。独立页与游戏覆盖层共用。
 * plan 模式：编辑航线并发送；transit 模式：巡航转场中显示本机沿线移动，可改航或中止。
 * 依赖 globalThis.MOLA（data/mola_4ppd.js），ES 模块需 http 打开。
 */
import { CRZ_KMH, CRZ_MAX_KM, R_MARS_KM, distanceKm as dist, courseDeg as course, interpolate as interp, destination as dest, buildLegs, legMinutes, routeTotals, wrapLon } from './flight-plan.js';
import { decodeMola, shadedReliefCanvas } from '../lib/mola-grid.js';
import * as WXM from '../weather/mars-weather.js';
import * as WXW from '../weather/weather-widgets.js';
import { PLACES } from '../journey/landmarks.js';

const D2R = Math.PI / 180, MAXS = 48, WX_KEY = 'cosmos.weather.view.v1';

/* 真实历史探测器：坐标为行星中心东经 0–360°。*/
export const RELICS = [
  { id:'MRS3', cn:'火星3号', en:'Mars 3 Lander', org:'苏联', year:1971, kind:'着陆器', lat:-45.00, lon:202.00, where:'塞壬高地 · 托勒密坑', status:'人类首次火星软着陆，落地后不到 20 秒失联（坐标近似）' },
  { id:'MRS2', cn:'火星2号', en:'Mars 2 Lander', org:'苏联', year:1971, kind:'坠毁点', lat:-44.20, lon:46.80, where:'希腊平原西侧', status:'首个抵达火星表面的人造物体，下降时坠毁（坐标近似）' },
  { id:'MRS6', cn:'火星6号', en:'Mars 6 Lander', org:'苏联', year:1974, kind:'坠毁点', lat:-23.90, lon:340.58, where:'珍珠高地', status:'下降段失联，推定撞击地表' },
  { id:'VKG1', cn:'海盗1号', en:'Viking 1 Lander', org:'NASA · 美国', year:1976, kind:'着陆器', lat:22.27, lon:312.05, where:'克律塞平原', status:'1982 年 11 月通信中断' },
  { id:'VKG2', cn:'海盗2号', en:'Viking 2 Lander', org:'NASA · 美国', year:1976, kind:'着陆器', lat:47.64, lon:134.29, where:'乌托邦平原', status:'1980 年 4 月电池失效' },
  { id:'PTHF', cn:'探路者 / 旅居者', en:'Mars Pathfinder + Sojourner', org:'NASA · 美国', year:1997, kind:'着陆器', lat:19.13, lon:326.78, where:'阿瑞斯谷', status:'着陆器与首辆火星车，1997 年 9 月失联' },
  { id:'BGL2', cn:'猎兔犬2号', en:'Beagle 2', org:'英国 · ESA', year:2003, kind:'着陆器', lat:11.53, lon:90.43, where:'伊西底斯平原', status:'太阳翼未完全展开而失联，2015 年轨道图像确认位置' },
  { id:'SPRT', cn:'勇气号', en:'Spirit (MER-A)', org:'NASA · 美国', year:2004, kind:'巡视器', lat:-14.57, lon:175.47, where:'古谢夫坑', status:'2009 年陷入软沙，2010 年失联（坐标为着陆点）' },
  { id:'OPRT', cn:'机遇号', en:'Opportunity (MER-B)', org:'NASA · 美国', year:2004, kind:'巡视器', lat:-1.95, lon:354.47, where:'子午高原', status:'行驶约 45 km，2018 年沙尘暴后失联（坐标为着陆点）' },
  { id:'PHNX', cn:'凤凰号', en:'Phoenix', org:'NASA · 美国', year:2008, kind:'着陆器', lat:68.22, lon:234.25, where:'北方大平原', status:'2008 年 11 月失联，随后被冬季二氧化碳霜覆盖' },
  { id:'CURI', cn:'好奇号', en:'Curiosity (MSL)', org:'NASA · 美国', year:2012, kind:'巡视器', lat:-4.59, lon:137.44, where:'盖尔坑', status:'截至 2025 年仍在夏普山工作（坐标为着陆点）' },
  { id:'SCHP', cn:'斯基亚帕雷利', en:'Schiaparelli EDM', org:'ESA · 俄罗斯', year:2016, kind:'坠毁点', lat:-2.05, lon:353.79, where:'子午高原', status:'下降时降落伞过早分离，坠毁' },
  { id:'INSG', cn:'洞察号', en:'InSight', org:'NASA · 美国', year:2018, kind:'着陆器', lat:4.50, lon:135.62, where:'埃律西昂平原', status:'太阳能板积尘，2022 年 12 月结束任务' },
  { id:'PERS', cn:'毅力号', en:'Perseverance (Mars 2020)', org:'NASA · 美国', year:2021, kind:'巡视器', lat:18.44, lon:77.45, where:'耶泽罗坑', status:'截至 2025 年仍在工作（坐标为着陆点）' },
  { id:'INGN', cn:'机智号', en:'Ingenuity', org:'NASA · 美国', year:2021, kind:'直升机', lat:18.47, lon:77.40, where:'耶泽罗坑', status:'2024 年 1 月旋翼受损结束飞行（坐标近似）' },
  { id:'ZHRG', cn:'祝融号', en:'Zhurong (Tianwen-1)', org:'CNSA · 中国', year:2021, kind:'巡视器', lat:25.07, lon:109.93, where:'乌托邦平原', status:'2022 年 5 月进入休眠后未再唤醒' },
];
const ORIGIN = { id:'PPOS', cn:'游隼当前位置', en:'Present Position · NX07', kind:'营地' };
const KIND = { '着陆器':['lander','#f5a524'], '巡视器':['rover','#22d3ee'], '坠毁点':['crash','#ff6b5b'], '直升机':['heli','#34d399'], '营地':['camp','#34d399'], '航路点':['user','#22d3ee'] };

// MOLA 解码与底图只做一次，覆盖层反复开关不重算。
let GRID = null, BASE = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const km = d => d >= 100 ? Math.round(d).toLocaleString('en-US') : d.toFixed(1);
const deg3 = v => String(Math.round(v) % 360).padStart(3, '0');
const fmtLat = v => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = v => `${wrapLon(v).toFixed(2)}°E`;
const dur = m => m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;
const clock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.ceil(s % 60) % 60).padStart(2, '0')}`;
const relic = id => RELICS.find(r => r.id === id);

const TEMPLATE = `<div class="rc-app" data-tab="fpl">
  <header class="rc-bar">
    <span class="brand">COSMOS // NAV CHART</span>
    <span class="opt">游隼 NX07 · FMS</span>
    <span class="route" data-rc="hRoute">—</span>
    <span>DIST <span class="num" data-rc="hDist">—</span></span>
    <span class="opt">ETE <span class="num" data-rc="hEte">—</span></span>
    <span class="opt">WX <span class="num" data-rc="hWx">—</span></span>
    <span class="rc-transit" data-rc="hTransit" hidden></span>
    <span class="right opt">MOLA 4 px/° · 0–360°E</span>
    <button type="button" class="rc-close" data-rc="close" aria-label="关闭航线图">关闭 ✕</button>
  </header>
  <section class="rc-chart">
    <canvas data-rc="cv" aria-label="火星航线图：拖动平移，双指或滚轮缩放，点选遗迹，长按添加航路点"></canvas>
    <button type="button" class="rc-layer-toggle" data-rc="layerToggle" aria-expanded="false">图层 ▾</button>
    <div class="rc-layers" data-rc="layers" role="group" aria-label="图层">
      <button type="button" data-layer="topo" aria-pressed="true">▦ 地形</button>
      <button type="button" data-layer="relics" aria-pressed="true">◈ 遗迹</button>
      <button type="button" data-layer="names" aria-pressed="true">A 地名</button>
      <button type="button" data-layer="grid" aria-pressed="true"># 经纬</button>
      <button type="button" data-layer="rings" aria-pressed="true">◎ 距离</button>
      <button type="button" data-layer="weather" aria-pressed="true">☁ 天气</button>
    </div>
    <div class="rc-zoom">
      <button type="button" data-rc="zIn" aria-label="放大">+</button>
      <button type="button" data-rc="zOut" aria-label="缩小">−</button>
      <button type="button" data-rc="zOwn" aria-label="回到本机位置">⌖</button>
      <button type="button" data-rc="zFit" aria-label="显示全航线">⤢</button>
    </div>
    <div class="rc-card" data-rc="card" hidden></div>
    <div class="rc-readout" data-rc="readout">点击地图查看坐标与海拔</div>
    <div class="rc-hint">拖动平移 · 双指/滚轮缩放 · 点选遗迹 · 长按添加航路点 · 拖动 USR 点改航线</div>
    <div class="rc-busy" data-rc="busy">正在解码 MOLA 高程…</div>
  </section>
  <nav class="rc-tabs" role="tablist">
    <button type="button" data-tab="fpl" class="on">航线 FPL</button>
    <button type="button" data-tab="relics">遗迹 RELICS</button>
    <button type="button" data-tab="vsd" class="tab-vsd">剖面 VSD</button>
  </nav>
  <aside class="rc-side">
    <div class="rc-view" data-rc="fplView">
      <div class="rc-phead"><span><b>FLIGHT PLAN</b> · 点一段切换当前航段</span><span data-rc="fplCount"></span></div>
      <ol class="rc-list" data-rc="fpl"></ol>
      <div class="rc-tot" data-rc="tot"></div>
      <div class="rc-wxline" data-rc="wxline" hidden></div>
      <div class="rc-pacts"><button type="button" data-rc="bClr">清空</button><button type="button" class="abort" data-rc="bAbort" hidden>中止巡航 · 就近降落</button><button type="button" class="exec" data-rc="bExec">执行航线 ▶ 发送游隼</button></div>
      <p class="rc-fine" data-rc="fine">CRZ 大气巡航按游隼加速 972 km/h 估算；ORB 为入轨转移，用时是游戏转场抽象。超过 400 km 默认 ORB，点模式键可切换。起飞与降落为实时飞行，巡航段加速播放。</p>
    </div>
    <div class="rc-view" data-rc="relicView">
      <div class="rc-phead"><span><b>人类遗迹</b> · 按距本机排序</span><span data-rc="relCount"></span></div>
      <ul class="rc-list" data-rc="relics"></ul>
      <p class="rc-fine">坐标与状态为真实历史资料（截至 2025 年）；标“近似”的为估算位置。游戏时代这些设备的现状尚未设定。</p>
    </div>
  </aside>
  <section class="rc-vsd">
    <div class="rc-vhead"><b>VSD · 垂直剖面</b><span data-rc="vsdLeg">—</span><span data-rc="vsdWx"></span><span data-rc="vsdMsa"></span></div>
    <div class="rc-vwrap"><canvas data-rc="vsdCv" aria-label="当前航段地形剖面"></canvas></div>
  </section>
</div>
<div class="rc-toast" data-rc="toast" role="status"></div>`;

/**
 * @param {HTMLElement} host
 * @param {{getOwnship:()=>({lat:number,lon:number,heading?:number}), getPlan?:()=>Array|null,
 *   onSend?:(route:Array)=>string|void, onClose?:()=>void, onAbort?:()=>void, closable?:boolean}} options
 */
export function mountRouteChart(host, { getOwnship, getPlan = () => null, onSend = () => {}, onClose = () => {}, onAbort = () => {}, closable = true } = {}) {
  if (!document.querySelector('link[data-route-chart]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.routeChart = '1';
    link.href = new URL('./route-chart.css', import.meta.url).href; document.head.append(link);
  }
  const root = document.createElement('dialog'); root.className = 'route-chart'; root.setAttribute('aria-label', '游隼航线图');
  root.innerHTML = TEMPLATE; host.append(root);
  const $ = name => root.querySelector(`[data-rc="${name}"]`);
  const cv = $('cv'), app = root.querySelector('.rc-app');
  const MONO = getComputedStyle(root).getPropertyValue('--mono') || 'monospace';

  let route = [], legs = [], active = 1, sel = null, userSeq = 0, loaded = false, dirtyPlan = false, transit = null, remainingKey = '';
  const layers = { topo: true, relics: true, names: true, grid: true, rings: true, weather: true };
  let weather = null, wxTime = { sol: 454, dayFraction: .55, refLon: 0 }, wxRoute = null, wxShade = null, wxShadeKey = '';
  const W = () => GRID.W, H = () => GRID.H, PPD = () => GRID.W / 360;
  const elevAt = (lat, lon) => GRID.elevationKm(lat, lon);

  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
  function origin(p) { return { ...ORIGIN, lat: p.lat, lon: wrapLon(p.lon), ref: ORIGIN, user: false, mode: 'auto' }; }
  function loadWxTime() {
    let v = null; try { v = JSON.parse(localStorage.getItem(WX_KEY) || 'null'); } catch {}
    wxTime = { sol: Number.isFinite(v?.sol) ? v.sol : 454, dayFraction: Number.isFinite(v?.dayFraction) ? v.dayFraction : .55, refLon: route[0]?.lon ?? 0 };
    if (weather && v?.scenario) weather.setScenario(v.scenario);
  }
  const wxBrief = p => { if (!weather) return '—'; const w = weather.sample(p.lat, p.lon, wxTime); return `${w.hazard.label} · τ ${w.tau.toFixed(2)} · 能见度 ${w.visibilityKm >= 79.5 ? '>80' : w.visibilityKm.toFixed(w.visibilityKm < 10 ? 1 : 0)} km · 光伏 ${Math.round(w.solarFactor * 100)}% · LMST ${w.lmst}`; };

  const wp = o => ({ id: o.id, cn: o.cn, lat: o.lat, lon: o.lon, ref: o, user: !!o.user, mode: o.mode || 'auto' });
  const fromSaved = w => relic(w.id) ? { ...wp(relic(w.id)), mode: w.mode || 'auto' } : { id: w.id, cn: '用户航路点', lat: +w.lat, lon: +w.lon, ref: null, user: true, mode: w.mode || 'auto' };
  function loadRoute() {
    const own = getOwnship(), saved = getPlan();
    route = [origin(own), ...(Array.isArray(saved) ? saved.slice(1).map(fromSaved) : [])];
    loaded = true; dirtyPlan = false;
  }
  function syncOrigin() { if (transit) return; const own = getOwnship(); route[0] = origin(own); }
  function nextUserId() { const used = new Set(route.map(w => w.id)); do userSeq++; while (used.has(`USR${String(userSeq).padStart(2, '0')}`)); return `USR${String(userSeq).padStart(2, '0')}`; }
  function toBase(lat, lon) { return [wrapLon(lon) * PPD(), (90 - lat) * PPD()]; }

  let wxAt = 0;
  function computeLegs({ throttleWeather = false } = {}) {
    legs = buildLegs(route); let ref = null;
    for (const L of legs) {
      const n = clamp(Math.ceil(L.d / 40), 12, 240), pts = [];
      for (let j = 0; j <= n; j++) {
        const p = interp(L.a, L.b, j / n); let [bx, by] = toBase(p.lat, p.lon);
        if (ref !== null) { while (bx - ref > W() / 2) bx -= W(); while (ref - bx > W() / 2) bx += W(); }
        ref = bx; pts.push([bx, by]);
      }
      L.pts = pts;
    }
    active = clamp(active, 1, Math.max(1, route.length - 1));
    // 巡航中每帧重算几何，天气沿线采样最多每秒一次。
    const now = performance.now();
    if (!throttleWeather || now - wxAt > 1000) { wxAt = now; wxRoute = weather && route.length > 1 ? weather.route(route, wxTime, 80) : null; }
    legs.forEach((L, j) => { L.wx = wxRoute?.legs[j] || null; });
  }
  const legEte = L => L.mode === 'CRZ' ? dur(legMinutes(L)) : '≈2 min';

  /* ---------- 视图 ---------- */
  const view = { s: 1, ox: 0, oy: 0 };
  let cw = 0, ch = 0, dpr = 1, vw = 0, vh = 0, raf = 0;
  const minS = () => Math.max(ch / H(), .2);
  function clampView() {
    view.s = clamp(view.s, minS(), MAXS);
    const bw = W() * view.s; view.ox = ((view.ox % bw) + bw) % bw - bw;
    view.oy = clamp(view.oy, ch - H() * view.s, 0);
  }
  function screenToGeo(sx, sy) { const bx = (sx - view.ox) / view.s, by = (sy - view.oy) / view.s; return { lat: clamp(90 - by / PPD(), -90, 90), lon: wrapLon(bx / PPD()) }; }
  function copies(bx, by, pad = 60) {
    const bw = W() * view.s, out = [], y = view.oy + by * view.s;
    let x = view.ox + bx * view.s; x = ((x % bw) + bw) % bw;
    for (let xx = x - bw; xx < cw + pad; xx += bw) if (xx > -pad) out.push([xx, y]);
    return out;
  }
  function zoomAt(sx, sy, f) { const s2 = clamp(view.s * f, minS(), MAXS), k = s2 / view.s; view.ox = sx - (sx - view.ox) * k; view.oy = sy - (sy - view.oy) * k; view.s = s2; clampView(); dirty(); }
  function fitPoints(pts, pad = 70) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [x, y] of pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
    const padX = Math.min(pad + 76, cw / 3), padY = Math.min(pad, ch / 3);
    view.s = clamp(Math.min((cw - padX * 2) / Math.max(4, b - a), (ch - padY * 2) / Math.max(4, d - c)), minS(), 14);
    view.ox = cw / 2 - (a + b) / 2 * view.s; view.oy = ch / 2 - (c + d) / 2 * view.s; clampView(); dirty();
  }
  function fitRoute() { const pts = legs.flatMap(L => L.pts); if (pts.length < 2) { centerOn(route[0], 6); return; } fitPoints(pts); }
  function centerOn(p, s) { if (s) view.s = clamp(s, minS(), MAXS); const [bx, by] = toBase(p.lat, p.lon); view.ox = cw / 2 - bx * view.s; view.oy = ch / 2 - by * view.s; clampView(); dirty(); }

  /* ---------- 绘制：航图 ---------- */
  function dirty() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!root.open || !GRID) return; drawChart(); drawVsd(); }); }
  function strokePoly(g, pts) {
    let a = Infinity, b = -Infinity; for (const [x] of pts) { a = Math.min(a, x); b = Math.max(b, x); }
    const s = view.s, k0 = Math.floor((-view.ox / s - b) / W()), k1 = Math.ceil(((cw - view.ox) / s - a) / W());
    for (let k = k0; k <= k1; k++) { g.beginPath(); pts.forEach(([x, y], j) => { const X = view.ox + (x + k * W()) * s, Y = view.oy + y * s; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); }
  }
  function haloText(g, t, x, y, font, color, align = 'left') {
    g.font = font; g.textAlign = align; g.lineWidth = 3.5; g.strokeStyle = 'rgba(3,6,10,.9)'; g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y);
  }

  function drawChart() {
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#060b10'; g.fillRect(0, 0, cw, ch);
    const s = view.s, bw = W() * s, bh = H() * s, placed = [], ppd = PPD();
    const hits = r => placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
    function place(t, x, y, px, color, { align = 'left', bold = false, force = false } = {}) {
      const font = `${bold ? '700 ' : ''}${px}px ${MONO}`; g.font = font;
      const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, r = [x0 - 2, y - px, x0 + w + 2, y + 3];
      if (!force && (hits(r) || r[2] < 0 || r[0] > cw)) return false;
      placed.push(r); haloText(g, t, x, y, font, color, align); return true;
    }
    // Bilingual labels: lines are placed as one unit ([text, px, color, bold]), so a second line
    // can never be rejected by the box of the line above it.
    function placeLines(lines, x, y, { align = 'left', force = false } = {}) {
      let line = y;
      const rows = lines.map(([t, px, color, bold]) => {
        const font = `${bold ? '700 ' : ''}${px}px ${MONO}`; g.font = font;
        const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        const row = { t, font, color, y: line, r: [x0 - 2, line - px, x0 + w + 2, line + 3] }; line += px + 1; return row;
      });
      if (!force && rows.some(({ r }) => hits(r) || r[2] < 0 || r[0] > cw)) return false;
      for (const row of rows) { placed.push(row.r); haloText(g, row.t, x, row.y, row.font, row.color, align); }
      return true;
    }
    const reserve = (x, y, rad) => placed.push([x - rad, y - rad, x + rad, y + rad]);

    if (layers.topo) { g.imageSmoothingEnabled = true; for (let x = view.ox; x < cw; x += bw) g.drawImage(BASE, x, view.oy, bw, bh); }

    if (layers.grid) {
      const step = s < 1.6 ? 30 : s < 5 ? 10 : 5;
      g.lineWidth = 1;
      const k0 = Math.floor(-view.ox / bw), k1 = Math.ceil((cw - view.ox) / bw);
      for (let k = k0; k <= k1; k++) for (let lon = 0; lon < 360; lon += step) {
        const X = view.ox + (lon * ppd + k * W()) * s; if (X < -2 || X > cw + 2) continue;
        g.strokeStyle = 'rgba(160,210,230,.10)'; g.beginPath(); g.moveTo(X, Math.max(0, view.oy)); g.lineTo(X, Math.min(ch, view.oy + bh)); g.stroke();
        if (X > 28 && X < cw - 90) haloText(g, `${lon}°E`, X + 3, 13, `10px ${MONO}`, 'rgba(160,190,205,.7)');
      }
      for (let lat = -90 + step; lat < 90; lat += step) {
        const Y = view.oy + (90 - lat) * ppd * s; if (Y < 0 || Y > ch) continue;
        g.strokeStyle = lat === 0 ? 'rgba(160,210,230,.22)' : 'rgba(160,210,230,.10)';
        g.beginPath(); g.moveTo(0, Y); g.lineTo(cw, Y); g.stroke();
        if (Y > 24 && Y < ch - 40) haloText(g, lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`, 4, Y - 3, `10px ${MONO}`, 'rgba(160,190,205,.7)');
      }
    }

    if (layers.weather && weather) {
      const key = `${wxTime.sol}|${wxTime.dayFraction.toFixed(3)}`;
      if (key !== wxShadeKey) { wxShade = WXW.nightShadeCanvas(wxTime, { alpha: .45 }); wxShadeKey = key; }
      for (let x = view.ox; x < cw; x += bw) g.drawImage(wxShade, x, view.oy, bw, bh);
      WXW.drawStormLayer(g, weather.storms(wxTime), { toScreen: (la, lo) => copies(...toBase(la, lo), 600), pxPerDeg: ppd * s, width: cw, height: ch, font: `10px ${MONO}` });
    }

    const own = route[0], ringLabels = [];
    if (layers.rings) {
      g.setLineDash([4, 6]); g.lineWidth = 1; g.strokeStyle = 'rgba(34,211,238,.38)';
      for (const r of [CRZ_MAX_KM, 1000, 2500]) {
        const pts = []; let ref = null;
        for (let j = 0; j <= 120; j++) { const p = dest(own, j * 3, r); let [bx, by] = toBase(p.lat, p.lon); if (ref !== null) { while (bx - ref > W() / 2) bx -= W(); while (ref - bx > W() / 2) bx += W(); } ref = bx; pts.push([bx, by]); }
        strokePoly(g, pts);
        const top = dest(own, 0, r); ringLabels.push([r === CRZ_MAX_KM ? `${r} km · CRZ` : `${r.toLocaleString('en-US')} km`, ...toBase(top.lat, top.lon)]);
      }
      g.setLineDash([]);
    }

    // 航线：当前航段洋红，ORB 虚线
    legs.forEach(L => {
      const on = L.i === active;
      g.setLineDash(L.mode === 'ORB' ? [10, 7] : []);
      if (on) { g.lineWidth = 7; g.strokeStyle = 'rgba(255,79,216,.18)'; strokePoly(g, L.pts); }
      g.lineWidth = on ? 3 : 1.8; g.strokeStyle = on ? '#ff4fd8' : 'rgba(232,238,244,.82)'; strokePoly(g, L.pts);
    });
    g.setLineDash([]);

    // 符号：遗迹 → 航路点 → 本机
    const inRoute = new Set(route.map(w => w.ref).filter(Boolean)), relicPos = [];
    if (layers.relics) for (const r of RELICS) {
      const [cls, col] = KIND[r.kind] || KIND['着陆器'], [bx, by] = toBase(r.lat, r.lon);
      for (const [X, Y] of copies(bx, by)) {
        g.lineWidth = 1.8; g.strokeStyle = col; g.fillStyle = '#060b10';
        g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fill(); g.stroke();
        if (cls === 'crash') { g.beginPath(); g.moveTo(X - 3.5, Y - 3.5); g.lineTo(X + 3.5, Y + 3.5); g.moveTo(X + 3.5, Y - 3.5); g.lineTo(X - 3.5, Y + 3.5); g.stroke(); }
        else { g.fillStyle = col; g.beginPath(); g.moveTo(X, Y - 4); g.lineTo(X + 4, Y); g.lineTo(X, Y + 4); g.lineTo(X - 4, Y); g.closePath(); g.fill(); }
        reserve(X, Y, 9); relicPos.push([r, X, Y]);
      }
    }
    const wptPos = [];
    route.forEach((w, i) => {
      if (i === 0) return;
      const [bx, by] = toBase(w.lat, w.lon), on = i === active, isSel = sel && ((sel.type === 'wpt' && sel.i === i) || sel.obj === w.ref);
      for (const [X, Y] of copies(bx, by)) {
        if (w.user) { g.fillStyle = on ? '#ff4fd8' : '#22d3ee'; g.beginPath(); g.moveTo(X, Y - 8); g.lineTo(X + 7, Y + 5); g.lineTo(X - 7, Y + 5); g.closePath(); g.fill(); g.strokeStyle = '#03060a'; g.lineWidth = 1; g.stroke(); }
        else if (!layers.relics) { g.fillStyle = '#060b10'; g.strokeStyle = '#e8eef4'; g.lineWidth = 2; g.beginPath(); g.arc(X, Y, 5, 0, 7); g.fill(); g.stroke(); }
        if (w.ref) { g.strokeStyle = on ? '#ff4fd8' : 'rgba(232,238,244,.85)'; g.lineWidth = on ? 2.4 : 1.4; g.beginPath(); g.arc(X, Y, 12, 0, 7); g.stroke(); }
        if (isSel) { g.setLineDash([3, 3]); g.strokeStyle = '#f5a524'; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, 18, 0, 7); g.stroke(); g.setLineDash([]); }
        reserve(X, Y, 13); wptPos.push([w, i, X, Y, on]);
      }
    });
    const [obx, oby] = toBase(own.lat, own.lon), hdg = transit ? transit.course : legs[0] ? legs[0].crs : (getOwnship().heading || 0), ownPos = copies(obx, oby);
    for (const [X, Y] of ownPos) {
      if (!transit) { g.fillStyle = '#062016'; g.strokeStyle = '#34d399'; g.lineWidth = 2; g.fillRect(X - 6, Y - 6, 12, 12); g.strokeRect(X - 6, Y - 6, 12, 12); }
      g.save(); g.translate(X, Y); g.rotate(hdg * D2R);
      g.fillStyle = transit ? '#ff4fd8' : '#22d3ee'; g.strokeStyle = '#03060a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -17); g.lineTo(9, 6); g.lineTo(0, 1); g.lineTo(-9, 6); g.closePath(); g.fill(); g.stroke();
      g.restore(); reserve(X, Y, 16);
    }

    // 标签：重要的先放，放不下的让位
    for (const [X, Y] of ownPos) place(transit ? `NX07 · ${transit.mode}` : 'NX07', X, Y + 28, 10, transit ? '#ff4fd8' : '#22d3ee', { align: 'center', bold: true, force: true });
    for (const [w, i, X, Y, on] of wptPos) {
      const color = on ? '#ff4fd8' : '#ffffff', lines = [[w.id, 11, color, true], ...(w.ref ? [[w.cn, 10, '#93a6b4']] : [])];
      if (!placeLines(lines, X + 15, Y + 4) && !placeLines(lines, X - 15, Y + 4, { align: 'right' })) placeLines(lines, X, Y - 16 - (lines.length - 1) * 11, { align: 'center', force: true });
    }
    for (const [r, X, Y] of relicPos) {
      if (inRoute.has(r)) continue;
      const lines = [[r.id, 11, '#dfe6ec', true], [r.cn, 10, '#93a6b4']];
      placeLines(lines, X + 13, Y + 4) || placeLines(lines, X - 13, Y + 4, { align: 'right' });
    }
    legs.forEach(L => {
      const a = L.pts[0], b = L.pts[L.pts.length - 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) * view.s < 150) return;
      const t = `${deg3(L.crs)}° ${km(L.d)} km ${L.mode}`; g.font = `10px ${MONO}`; const w = g.measureText(t).width + 10;
      for (const f of [.5, .38, .62, .28, .72]) {
        const m = L.pts[Math.floor((L.pts.length - 1) * f)];
        const spot = copies(((m[0] % W()) + W()) % W(), m[1]).find(([X, Y]) => X - w / 2 > 0 && X + w / 2 < cw && !hits([X - w / 2, Y - 18, X + w / 2, Y - 3]));
        if (!spot) continue;
        const [X, Y] = spot; placed.push([X - w / 2, Y - 18, X + w / 2, Y - 3]);
        g.fillStyle = 'rgba(3,6,10,.88)'; g.strokeStyle = L.i === active ? '#ff4fd8' : 'rgba(232,238,244,.4)'; g.lineWidth = 1;
        g.fillRect(X - w / 2, Y - 18, w, 15); g.strokeRect(X - w / 2, Y - 18, w, 15);
        g.fillStyle = L.mode === 'CRZ' ? '#34d399' : '#f5a524'; g.textAlign = 'center'; g.fillText(t, X, Y - 7);
        break;
      }
    });
    for (const [t, bx, by] of ringLabels) for (const [X, Y] of copies(bx, by)) place(t, X, Y - 4, 10, 'rgba(34,211,238,.8)', { align: 'center' });
    if (layers.names) {
      for (const [cn, en, lat, lon, prio, kind] of PLACES) {
        if (kind === 'site' || (prio === 1 && s < .75) || (prio === 2 && s < 2.2) || (prio === 3 && s < 4.5)) continue;
        const lines = [[cn, prio === 1 ? 11 : 10, prio === 1 ? 'rgba(200,214,222,.62)' : 'rgba(170,186,196,.5)'], [en, 9, prio === 1 ? 'rgba(200,214,222,.5)' : 'rgba(170,186,196,.42)']];
        for (const [X, Y] of copies(...toBase(lat, lon))) placeLines(lines, X, Y, { align: 'center' });
      }
    }

    if (sel && sel.type === 'point') for (const [X, Y] of copies(...toBase(sel.lat, sel.lon))) {
      g.strokeStyle = '#f5a524'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X - 12, Y); g.lineTo(X - 4, Y); g.moveTo(X + 4, Y); g.lineTo(X + 12, Y); g.moveTo(X, Y - 12); g.lineTo(X, Y - 4); g.moveTo(X, Y + 4); g.lineTo(X, Y + 12); g.stroke();
    }

    // 比例尺
    const c = screenToGeo(cw / 2, ch / 2), kpp = (1 / ppd) * D2R * R_MARS_KM * Math.max(.05, Math.cos(c.lat * D2R)) / view.s;
    const nice = [20, 50, 100, 200, 500, 1000, 2000, 5000].find(v => v / kpp >= 70) || 5000, px = nice / kpp;
    const sx = 12, sy = ch - 40;
    g.strokeStyle = '#e8eef4'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy - 5); g.lineTo(sx, sy); g.lineTo(sx + px, sy); g.lineTo(sx + px, sy - 5); g.stroke();
    haloText(g, `${nice.toLocaleString('en-US')} km`, sx + px + 6, sy + 1, `10px ${MONO}`, '#e8eef4');
  }

  /* ---------- 绘制：垂直剖面 ---------- */
  function drawVsd() {
    const c = $('vsdCv'); if (!vw || !vh) return;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, vw, vh);
    const L = legs[active - 1];
    if (!L) { $('vsdLeg').textContent = '至少需要两个航路点'; $('vsdMsa').textContent = ''; $('vsdWx').textContent = ''; haloText(g, '在航图上点选遗迹或长按添加航路点', 16, 28, `11px ${MONO}`, '#5d6d7d'); return; }
    const N = 260, el = [];
    let maxT = -99, minT = 99, maxJ = 0;
    for (let j = 0; j <= N; j++) { const p = interp(L.a, L.b, j / N), v = elevAt(p.lat, p.lon); el.push(v); if (v > maxT) { maxT = v; maxJ = j; } if (v < minT) minT = v; }
    const crz = L.mode === 'CRZ', msa = Math.ceil((maxT + 1) * 2) / 2;
    const lo = Math.floor(minT - 1), hi = crz ? Math.ceil(msa + 1.5) : Math.ceil(maxT + 5);
    const PL = 44, PR = 14, PT = 12, PB = 22, pw = vw - PL - PR, ph = vh - PT - PB;
    const X = f => PL + f * pw, Y = v => PT + (hi - v) / (hi - lo) * ph;
    $('vsdLeg').textContent = `LEG ${L.i} · ${L.a.id} → ${L.b.id} · ${deg3(L.crs)}° · ${km(L.d)} km · ${crz ? '大气巡航' : '入轨转移'}`;
    $('vsdMsa').textContent = crz ? `MSA ${msa.toFixed(1)} km` : `航段最高地形 ${maxT.toFixed(1)} km`;

    const step = hi - lo > 14 ? 5 : hi - lo > 6 ? 2 : 1;
    g.font = `10px ${MONO}`; g.textAlign = 'right';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      g.strokeStyle = v === 0 ? '#1d2d3a' : '#101922'; g.lineWidth = 1; g.beginPath(); g.moveTo(PL, Y(v)); g.lineTo(vw - PR, Y(v)); g.stroke();
      g.fillStyle = '#5d6d7d'; g.fillText(`${v}`, PL - 6, Y(v) + 3);
    }
    g.textAlign = 'left'; g.fillText('km', 6, PT + 8);

    const grad = g.createLinearGradient(0, PT, 0, PT + ph); grad.addColorStop(0, '#6a4128'); grad.addColorStop(1, '#170f0b');
    g.beginPath(); g.moveTo(X(0), Y(lo)); el.forEach((v, j) => g.lineTo(X(j / N), Y(v))); g.lineTo(X(1), Y(lo)); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); el.forEach((v, j) => j ? g.lineTo(X(j / N), Y(v)) : g.moveTo(X(0), Y(v))); g.strokeStyle = '#c47d4e'; g.lineWidth = 1.3; g.stroke();

    const hx = X(maxJ / N), hy = Y(maxT);
    g.fillStyle = '#f5a524'; g.beginPath(); g.moveTo(hx, hy - 3); g.lineTo(hx + 5, hy - 11); g.lineTo(hx - 5, hy - 11); g.closePath(); g.fill();
    haloText(g, `最高 ${maxT.toFixed(1)} km`, clamp(hx, PL + 40, vw - PR - 40), hy - 15, `10px ${MONO}`, '#f5a524', 'center');

    if (crz) {
      g.setLineDash([5, 4]); g.strokeStyle = 'rgba(245,165,36,.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(PL, Y(msa)); g.lineTo(vw - PR, Y(msa)); g.stroke(); g.setLineDash([]);
      haloText(g, `MSA ${msa.toFixed(1)}`, vw - PR - 4, Y(msa) - 4, `10px ${MONO}`, '#f5a524', 'right');
      g.strokeStyle = '#ff4fd8'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(X(0), Y(el[0])); g.lineTo(X(.1), Y(msa)); g.lineTo(X(.9), Y(msa)); g.lineTo(X(1), Y(el[N])); g.stroke();
      haloText(g, 'TOC', X(.1), Y(msa) - 6, `10px ${MONO}`, '#ff4fd8', 'center');
      haloText(g, 'TOD', X(.9), Y(msa) - 6, `10px ${MONO}`, '#ff4fd8', 'center');
    } else {
      g.strokeStyle = '#ff4fd8'; g.lineWidth = 2.2; g.setLineDash([8, 5]);
      g.beginPath(); g.moveTo(X(0), Y(el[0])); g.bezierCurveTo(X(.04), Y(el[0]) - ph * .4, X(.08), PT, X(.14), PT - 4); g.stroke();
      g.beginPath(); g.moveTo(X(.86), PT - 4); g.bezierCurveTo(X(.92), PT, X(.96), Y(el[N]) - ph * .4, X(1), Y(el[N])); g.stroke();
      g.setLineDash([]);
      const narrow = vw < 620;
      haloText(g, narrow ? '↑ 入轨' : '↑ 入轨 160 km', X(.15), PT + 12, `10px ${MONO}`, '#ff4fd8');
      haloText(g, '再入 ↓', X(.85), PT + 12, `10px ${MONO}`, '#ff4fd8', 'right');
      haloText(g, narrow ? '轨道段 · 下方为地面轨迹' : '轨道段 · 不贴地飞行，下方为地面轨迹剖面', X(.5), PT + (narrow ? 28 : 12), `10px ${MONO}`, '#8fa3b1', 'center');
    }
    $('vsdWx').textContent = L.wx?.storms.length ? `☁ ${L.wx.storms.join(' ')} τ${L.wx.maxTau.toFixed(1)}` : '';
    if (wxRoute) {
      const start = legs.slice(0, L.i - 1).reduce((a, x) => a + x.d, 0);
      const segs = wxRoute.samples.filter(p => p.leg === L.i && p.storm?.inside);
      for (const p of segs) { const f = clamp((p.km - start) / Math.max(1, L.d), 0, 1); g.fillStyle = p.level >= 3 ? 'rgba(255,91,91,.3)' : 'rgba(245,165,36,.2)'; g.fillRect(X(f) - Math.max(2, pw * 40 / Math.max(1, L.d)), PT, Math.max(4, pw * 80 / Math.max(1, L.d)), ph); }
      if (segs.length) haloText(g, `☁ ${[...new Set(segs.map(p => p.storm.id))].join(' ')} 尘暴段`, clamp(X(clamp((segs[0].km - start) / Math.max(1, L.d), 0, 1)), PL + 60, vw - PR - 60), PT + ph - 8, `10px ${MONO}`, '#f5a524', 'center');
    }
    g.textAlign = 'center'; g.fillStyle = '#5d6d7d'; g.font = `10px ${MONO}`;
    [0, .25, .5, .75, 1].forEach(q => g.fillText(q === 0 ? L.a.id : q === 1 ? L.b.id : `${km(L.d * q)} km`, clamp(X(q), PL + 16, vw - PR - 16), vh - 6));
  }

  /* ---------- 面板 ---------- */
  function renderPanel() {
    const own = route[0];
    $('fpl').innerHTML = route.map((w, i) => {
      if (i === 0) return `<li class="rc-row origin"><div><b>${w.id}</b><small>${w.cn} · ${transit ? '巡航中' : '起点'}</small></div><div class="c2"><small>—</small></div><div class="c3"><small>${fmtLat(w.lat)}</small></div><span></span><span></span></li>`;
      const L = legs[i - 1];
      const wxl = L.wx?.storms.length ? `<small class="wx lv${L.wx.worstLevel}">☁ 穿越 ${L.wx.storms.join(' ')} · τ ${L.wx.maxTau.toFixed(1)}</small>` : '';
      return `<li class="rc-row${i === active ? ' on' : ''}${L.wx?.worstLevel >= 2 ? ' wxwarn' : ''}" data-i="${i}">
        <div><b>${w.id}</b><small>${w.cn}</small>${wxl}</div>
        <div class="c2"><span>${deg3(L.crs)}°</span><small>DTK</small></div>
        <div class="c3"><span>${km(L.d)}</span><small>${legEte(L)}</small></div>
        <button type="button" class="rc-mode ${L.mode.toLowerCase()}" data-act="mode" aria-label="切换 ${w.id} 航段飞行方式">${L.mode}</button>
        <div class="rc-ops"><button type="button" data-act="up" ${i <= 1 ? 'disabled' : ''} aria-label="上移">↑</button><button type="button" data-act="dn" ${i >= route.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button><button type="button" data-act="del" aria-label="删除 ${w.id}">×</button></div>
      </li>`;
    }).join('');
    renderTotals();
    $('fplCount').textContent = `${route.length} 点 · ${legs.length} 段`;
    const wxEl = $('wxline'); wxEl.hidden = !weather;
    if (weather) {
      const lv = wxRoute ? wxRoute.worstLevel : 0, color = WXW.HAZARD_COLORS[lv], cross = wxRoute?.crossings || [];
      const link = new URL('../../tools/mars-weather.html', import.meta.url).href;
      wxEl.innerHTML = `☁ SOL ${wxTime.sol} · 本机 LMST ${WXM.lmst(WXM.localFraction(wxTime, own.lon))} · 航线最差 <b style="color:${color}">${WXM.HAZARD_LABELS[lv]}</b>${cross.length ? ` · 穿越 ${cross.map(c => `${c.id}（LEG ${c.leg}，τ ${c.maxTau.toFixed(1)}）`).join('、')}` : ' · 未穿越尘暴'} · 天气只作提示，不拦截飞行 · <a href="${link}" target="_blank" rel="noopener">气象视角 ↗</a>`;
      $('hWx').textContent = WXM.HAZARD_LABELS[lv]; $('hWx').style.color = color;
    }
    $('hRoute').textContent = route.map(w => w.id).join(' › ');
    $('relics').innerHTML = RELICS.map(r => ({ r, d: dist(own, r) })).sort((a, b) => a.d - b.d).map(({ r, d }) => {
      const inRoute = route.some(w => w.ref === r);
      return `<li class="rc-rel${sel?.obj === r ? ' on' : ''}" data-id="${r.id}"><i class="rc-sym ${KIND[r.kind][0]}"></i><div><b>${r.id}</b> ${r.cn}<small>${r.year} · ${r.kind} · ${r.where}</small></div><span>${km(d)} km</span><button type="button" data-act="${inRoute ? 'remove' : 'add'}" aria-label="${inRoute ? '移出航线' : '加入航线'}">${inRoute ? '−' : '+'}</button></li>`;
    }).join('');
    $('relCount').textContent = `${RELICS.length} 处`;
    renderChrome();
    renderCard();
  }
  let panelKey = '', panelAt = 0;
  function renderTotals() {
    const t = routeTotals(legs), ete = legs.length ? dur(t.minutes) : '—';
    $('tot').innerHTML = `<div><small>总距离</small><b>${legs.length ? km(t.km) + ' km' : '—'}</b></div><div><small>预计用时</small><b>${ete}</b></div><div><small>巡航 / 入轨</small><b>${t.crz} / ${t.orb}</b></div>`;
    $('hDist').textContent = legs.length ? `${km(t.km)} km` : '—';
    $('hEte').textContent = ete;
  }
  function renderChrome() {
    $('close').hidden = !closable || !!transit;
    $('bClr').hidden = !!transit; $('bAbort').hidden = !transit;
    $('bExec').textContent = transit ? '改航 ▶ 发送游隼' : '执行航线 ▶ 发送游隼';
    const tr = $('hTransit'); tr.hidden = !transit;
    if (transit) tr.textContent = `CRUISE · LEG ${transit.leg} ${transit.mode} · 剩余 ${km(transit.kmLeft)} km · ${clock(transit.secondsLeft)}${dirtyPlan ? ' · 航线已改，未发送' : ''}`;
  }
  function renderCard() {
    const c = $('card');
    if (!sel) { c.hidden = true; return; }
    c.hidden = false;
    const own = route[0];
    const p = sel.type === 'point' ? sel : sel.type === 'wpt' ? route[sel.i] : sel.obj;
    if (!p) { sel = null; c.hidden = true; return; }
    const d = dist(own, p), elev = elevAt(p.lat, p.lon).toFixed(2);
    const far = `${km(d)} km · 航向 ${deg3(course(own, p))}° · ${d <= CRZ_MAX_KM ? '可大气巡航' : '需入轨转移'}`;
    if (sel.type === 'relic' || (sel.type === 'wpt' && route[sel.i].ref && route[sel.i].ref !== ORIGIN)) {
      const r = sel.obj || route[sel.i].ref, inRoute = route.some(w => w.ref === r), [cls, col] = KIND[r.kind];
      c.style.borderLeftColor = col;
      c.innerHTML = `<header><i class="rc-sym ${cls}"></i><b>${r.id}</b><span class="en">${r.en}</span><button type="button" class="x" data-act="close" aria-label="关闭">×</button></header>
        <h3>${r.cn}</h3>
        <dl><dt>来源</dt><dd>${r.org} · ${r.year} · ${r.kind}</dd><dt>状态</dt><dd>${r.status}</dd>
        <dt>位置</dt><dd>${fmtLat(r.lat)} ${fmtLon(r.lon)} · ${r.where}</dd><dt>海拔</dt><dd>${elev} km（MOLA）</dd><dt>距本机</dt><dd>${far}</dd><dt>天气</dt><dd>${wxBrief(p)}</dd></dl>
        <div class="rc-cardacts"><button type="button" class="go" data-act="direct">直飞 DIRECT →</button><button type="button" data-act="${inRoute ? 'remove' : 'add'}">${inRoute ? '移出航线' : '加入航线 +'}</button></div>`;
    } else if (sel.type === 'wpt' && sel.i === 0) {
      c.style.borderLeftColor = '#34d399';
      c.innerHTML = `<header><i class="rc-sym camp"></i><b>PPOS</b><span class="en">${ORIGIN.en}</span><button type="button" class="x" data-act="close" aria-label="关闭">×</button></header>
        <h3>${ORIGIN.cn}</h3><dl><dt>位置</dt><dd>${fmtLat(p.lat)} ${fmtLon(p.lon)}</dd><dt>海拔</dt><dd>${elev} km（MOLA）</dd><dt>天气</dt><dd>${wxBrief(p)}</dd></dl>
        <p class="rc-fine">航线起点固定为 NX07 当前位置。</p>`;
    } else if (sel.type === 'wpt') {
      c.style.borderLeftColor = '#22d3ee';
      c.innerHTML = `<header><i class="rc-sym user"></i><b>${p.id}</b><span class="en">用户航路点 · 可拖动</span><button type="button" class="x" data-act="close" aria-label="关闭">×</button></header>
        <h3>${fmtLat(p.lat)} ${fmtLon(p.lon)}</h3><dl><dt>海拔</dt><dd>${elev} km（MOLA）</dd><dt>距本机</dt><dd>${far}</dd><dt>天气</dt><dd>${wxBrief(p)}</dd></dl>
        <div class="rc-cardacts"><button type="button" class="go" data-act="direct">直飞 DIRECT →</button><button type="button" data-act="remove">删除航路点</button></div>`;
    } else {
      c.style.borderLeftColor = '#f5a524';
      c.innerHTML = `<header><i class="rc-sym user"></i><b>POINT</b><span class="en">地图选点</span><button type="button" class="x" data-act="close" aria-label="关闭">×</button></header>
        <h3>${fmtLat(p.lat)} ${fmtLon(p.lon)}</h3><dl><dt>海拔</dt><dd>${elev} km（MOLA）</dd><dt>距本机</dt><dd>${far}</dd><dt>天气</dt><dd>${wxBrief(p)}</dd></dl>
        <div class="rc-cardacts"><button type="button" class="go" data-act="direct">直飞 DIRECT →</button><button type="button" data-act="addpoint">添加航路点 +</button></div>`;
    }
  }
  function update({ fit = false } = {}) { computeLegs(); renderPanel(); if (fit) fitRoute(); dirty(); }
  const edited = () => { dirtyPlan = true; };

  /* ---------- 航线操作 ---------- */
  function targetOfSel() {
    if (!sel) return null;
    if (sel.type === 'relic') return sel.obj;
    if (sel.type === 'wpt') return route[sel.i];
    return { id: nextUserId(), cn: '用户航路点', lat: sel.lat, lon: sel.lon, user: true };
  }
  function indexOf(t) { return route.findIndex(w => w === t || (t.ref === undefined && w.ref === t) || (t.id && w.id === t.id && !w.user && !t.user)); }
  function addTarget(t) {
    if (indexOf(t) > 0) { toast(`${t.id} 已在航线中`); return; }
    const w = t.ref !== undefined ? t : wp(t); route.push(w); active = route.length - 1;
    if (w.user) sel = { type: 'wpt', i: route.length - 1 };
    edited(); update(); toast(`已加入 ${w.id} · ${km(dist(route[route.length - 2], w))} km`);
  }
  function directTo(t) {
    const idx = indexOf(t);
    if (idx === 0) return;
    if (idx > 0) route = [route[0], ...route.slice(idx)];
    else route.splice(1, 0, t.ref !== undefined ? t : wp(t));
    active = 1; sel = null; edited(); update();
    toast(`直飞 ${route[1].id} · ${deg3(legs[0].crs)}° · ${km(legs[0].d)} km`);
  }
  function removeTarget(t) {
    const idx = indexOf(t); if (idx <= 0) return;
    const [w] = route.splice(idx, 1); sel = null; edited(); update(); toast(`已移出 ${w.id}`);
  }
  function addUserWaypoint(g) {
    const w = { id: nextUserId(), cn: '用户航路点', lat: g.lat, lon: g.lon, ref: null, user: true, mode: 'auto' };
    route.push(w); active = route.length - 1; sel = { type: 'wpt', i: route.length - 1 };
    navigator.vibrate?.(12); edited(); update(); toast(`长按添加 ${w.id} · 可拖动调整`);
  }

  /* ---------- 交互：航图 ---------- */
  const coarse = matchMedia('(pointer:coarse)').matches;
  function hitTest(x, y) {
    const R = coarse ? 26 : 18; let best = null, bd = R;
    route.forEach((w, i) => { for (const [X, Y] of copies(...toBase(w.lat, w.lon))) { const d = Math.hypot(X - x, Y - y); if (d < bd) { bd = d; best = { type: 'wpt', i }; } } });
    if (best) return best;
    if (layers.relics) for (const r of RELICS) for (const [X, Y] of copies(...toBase(r.lat, r.lon))) { const d = Math.hypot(X - x, Y - y); if (d < bd) { bd = d; best = { type: 'relic', obj: r }; } }
    return best;
  }
  function readout(x, y) {
    if (!GRID) return; const g = screenToGeo(x, y);
    $('readout').innerHTML = `<b>${fmtLat(g.lat)} ${fmtLon(g.lon)}</b> · 海拔 <b>${elevAt(g.lat, g.lon).toFixed(2)} km</b> <span class="far">· 距本机 <b>${km(dist(route[0], g))} km</b></span>`;
  }
  const ptrs = new Map(); let gesture = null, press = null, longTimer = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    if (!GRID) return;
    try { cv.setPointerCapture(e.pointerId); } catch {}
    const p = pos(e); ptrs.set(e.pointerId, p);
    clearTimeout(longTimer);
    if (ptrs.size === 1) {
      const hit = hitTest(p.x, p.y);
      press = { x0: p.x, y0: p.y, moved: false, hit, long: false };
      gesture = hit?.type === 'wpt' && route[hit.i].user ? { type: 'drag', i: hit.i } : { type: 'pan', ox: view.ox, oy: view.oy };
      if (!hit) longTimer = setTimeout(() => { if (press && !press.moved && ptrs.size === 1) { press.long = true; addUserWaypoint(screenToGeo(press.x0, press.y0)); } }, 550);
    } else if (ptrs.size === 2) {
      if (press) press.moved = true;
      const [a, b] = [...ptrs.values()];
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: view.ox, oy: view.oy };
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') readout(p.x, p.y); return; }
    ptrs.set(e.pointerId, p);
    if (gesture?.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const s2 = clamp(gesture.s0 * d / gesture.d0, minS(), MAXS), k = s2 / gesture.s0;
      view.s = s2; view.ox = mx - (gesture.mx - gesture.ox) * k; view.oy = my - (gesture.my - gesture.oy) * k; clampView(); dirty(); return;
    }
    if (!press) return;
    const dx = p.x - press.x0, dy = p.y - press.y0;
    if (!press.moved && Math.hypot(dx, dy) > 7) { press.moved = true; clearTimeout(longTimer); cv.classList.add('dragging'); }
    if (!press.moved) return;
    if (gesture?.type === 'pan') { view.ox = gesture.ox + dx; view.oy = gesture.oy + dy; clampView(); dirty(); }
    else if (gesture?.type === 'drag') { const g = screenToGeo(p.x, p.y), w = route[gesture.i]; w.lat = g.lat; w.lon = g.lon; active = gesture.i; edited(); update(); }
    readout(p.x, p.y);
  });
  function endPointer(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); clearTimeout(longTimer);
    if (ptrs.size === 1 && gesture?.type === 'pinch') { const [p] = [...ptrs.values()]; press = { x0: p.x, y0: p.y, moved: true, hit: null }; gesture = { type: 'pan', ox: view.ox, oy: view.oy }; return; }
    if (ptrs.size) return;
    cv.classList.remove('dragging');
    if (press && !press.moved && !press.long && e.type === 'pointerup') onTap(press);
    if (gesture?.type === 'drag' && press?.moved) toast(`${route[gesture.i].id} 已移动 · 航线已重算`);
    press = null; gesture = null;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * .0016)); }, { passive: false });
  cv.addEventListener('dblclick', e => { const p = pos(e); zoomAt(p.x, p.y, 2); });
  function onTap({ x0, y0, hit }) {
    readout(x0, y0);
    if (hit?.type === 'wpt') { sel = { type: 'wpt', i: hit.i }; if (hit.i > 0) active = hit.i; }
    else if (hit?.type === 'relic') sel = { type: 'relic', obj: hit.obj };
    else sel = { type: 'point', ...screenToGeo(x0, y0) };
    renderPanel(); dirty();
  }

  /* ---------- 交互：面板与按钮 ---------- */
  $('card').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    if (act === 'close') { sel = null; renderPanel(); dirty(); return; }
    const t = targetOfSel(); if (!t) return;
    if (act === 'direct') directTo(t);
    else if (act === 'add' || act === 'addpoint') addTarget(t);
    else if (act === 'remove') removeTarget(t);
  });
  $('fpl').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i, act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'mode') {
      const L = legs[i - 1], next = L.mode === 'CRZ' ? 'ORB' : 'CRZ';
      route[i].mode = next; active = i; edited(); update();
      toast(next === 'CRZ' && L.d > CRZ_MAX_KM ? `巡航 ${km(L.d)} km 约 ${dur(L.d / CRZ_KMH * 60)}，超过建议的 ${CRZ_MAX_KM} km` : `${route[i].id} 航段改为 ${next}`);
    } else if (act === 'up' && i > 1) { [route[i - 1], route[i]] = [route[i], route[i - 1]]; active = i - 1; sel = null; edited(); update(); }
    else if (act === 'dn' && i < route.length - 1) { [route[i + 1], route[i]] = [route[i], route[i + 1]]; active = i + 1; sel = null; edited(); update(); }
    else if (act === 'del') { const [w] = route.splice(i, 1); sel = null; edited(); update(); toast(`已删除 ${w.id}`); }
    else { active = i; const L = legs[i - 1]; sel = null; renderPanel(); fitPoints(L.pts, 90); }
  });
  $('relics').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const r = relic(li.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') addTarget(r);
    else if (act === 'remove') removeTarget(r);
    else { sel = { type: 'relic', obj: r }; renderPanel(); centerOn(r, Math.max(view.s, 3)); }
  });
  root.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.layer; layers[k] = !layers[k]; b.setAttribute('aria-pressed', layers[k]);
    dirty();
  }));
  root.querySelectorAll('.rc-tabs [data-tab]').forEach(b => b.addEventListener('click', () => {
    app.dataset.tab = b.dataset.tab;
    root.querySelectorAll('.rc-tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b));
    requestAnimationFrame(resize);
  }));
  $('layerToggle').onclick = () => { const open = $('layers').classList.toggle('open'); $('layerToggle').setAttribute('aria-expanded', open); };
  $('zIn').onclick = () => zoomAt(cw / 2, ch / 2, 1.6);
  $('zOut').onclick = () => zoomAt(cw / 2, ch / 2, 1 / 1.6);
  $('zOwn').onclick = () => centerOn(route[0], Math.max(view.s, 4));
  $('zFit').onclick = () => fitRoute();
  $('bClr').onclick = () => { route = [route[0]]; sel = null; active = 1; edited(); update(); toast('航线已清空，起点保留'); };
  $('bAbort').onclick = () => onAbort();
  $('bExec').onclick = () => {
    if (route.length < 2) { toast('至少需要一个目的地'); return; }
    const message = onSend(route.map(w => ({ id: w.id, lat: w.lat, lon: w.lon, mode: w.mode })));
    dirtyPlan = false; renderChrome();
    if (message) toast(message);
  };
  $('close').onclick = () => close();
  root.addEventListener('cancel', e => { e.preventDefault(); if (closable && !transit) close(); });
  // 场景快捷键（M、F、WASD…）不应穿透到覆盖层下面的游戏。
  root.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });

  /* ---------- 尺寸 ---------- */
  function resize() {
    if (!root.open) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = cv.parentElement.getBoundingClientRect(), keep = cw && GRID ? screenToGeo(cw / 2, ch / 2) : null, keepS = view.s;
    cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const v = $('vsdCv').parentElement.getBoundingClientRect(); vw = v.width; vh = v.height;
    $('vsdCv').width = Math.round(vw * dpr); $('vsdCv').height = Math.round(vh * dpr);
    if (!GRID) return;
    if (keep) centerOn(keep, keepS); else { clampView(); dirty(); }
  }
  new ResizeObserver(() => resize()).observe(cv.parentElement);
  new ResizeObserver(() => resize()).observe($('vsdCv').parentElement);
  addEventListener('storage', e => { if (e.key === WX_KEY && weather && root.open) { loadWxTime(); wxShadeKey = ''; update(); } });

  function ready() {
    if (!weather) { weather = WXM.createMarsWeather({ seed: 1, elevationKm: (la, lo) => elevAt(la, lo) }); }
    if (!loaded) loadRoute(); else syncOrigin();
    loadWxTime(); resize(); computeLegs(); renderPanel(); fitRoute();
    $('busy').hidden = true;
  }
  function open() {
    if (root.open) return;
    try { root.showModal(); } catch { root.setAttribute('open', ''); }
    if (GRID) { ready(); return; }
    if (!globalThis.MOLA) { $('busy').textContent = '缺少 data/mola_4ppd.js，无法加载地形'; return; }
    $('busy').hidden = false;
    setTimeout(() => { GRID = GRID || decodeMola(); BASE = BASE || shadedReliefCanvas(GRID); if (root.open) ready(); }, 30);
  }
  function close() {
    if (!root.open) return;
    root.close(); sel = null; onClose();
  }
  /** 巡航转场：state = {pos, course, leg, mode, kmLeft, secondsLeft, remaining:[{id,lat,lon,mode}], legStart} 或 null。*/
  function setTransit(state) {
    const was = !!transit;
    transit = state;
    if (!state) { if (was) { syncOrigin(); if (GRID && root.open) update(); } return; }
    const key = state.remaining.map(w => w.id).join('>');
    if (!was || (!dirtyPlan && key !== remainingKey)) {
      route = [origin(state.pos), ...state.remaining.map(fromSaved)]; active = 1; sel = null; dirtyPlan = false; loaded = true;
    } else route[0] = origin(state.pos);
    remainingKey = key;
    if (!GRID || !root.open) return;
    // 本机移动每帧重画；航线列表只在航段变化或首帧重建（避免吞掉正在进行的点击），合计半秒刷新一次。
    const now = performance.now();
    if (!was || key !== panelKey) { panelKey = key; panelAt = now; update({ fit: !was }); return; }
    computeLegs({ throttleWeather: true }); renderChrome();
    if (now - panelAt > 500) { panelAt = now; renderTotals(); }
    dirty();
  }
  return {
    open, close, setTransit,
    /** 外部发送或到达后重读存档航线（未在编辑时）。*/
    reload() { if (!transit) { loadRoute(); if (GRID && root.open) update({ fit: true }); } },
    get isOpen() { return root.open; },
    get route() { return route.map(w => ({ id: w.id, lat: w.lat, lon: w.lon, mode: w.mode })); },
    element: root,
  };
}
