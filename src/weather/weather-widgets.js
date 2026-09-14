/**
 * 火星天气界面小件：任何页面都能挂载，不依赖框架。
 * - mountWeatherCard：天气卡片（完整 / 紧凑两种，紧凑版适合 HUD）
 * - drawStormLayer：在任意等距圆柱投影的 canvas 地图上画尘暴 / 冰云气旋
 * - nightShadeCanvas：昼夜分界阴影贴图（按真实太阳高度逐格计算）
 * - drawDiurnalChart：某地一个火星日的气温、地温、光伏可用度曲线
 */
import { HAZARD_LABELS, MARS, lmst, sunElevationDeg, normalizeTime } from './mars-weather.js';

export const HAZARD_COLORS = Object.freeze(['#34d399', '#e8d44d', '#f5a524', '#ff5b5b']);
const D2R = Math.PI / 180;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtVis = v => v >= 79.5 ? '>80 km' : v < 10 ? `${v.toFixed(1)} km` : `${Math.round(v)} km`;
const risk = r => r > .6 ? '高' : r > .3 ? '中' : '低';

const CSS = `
.cw-card{--cw-lv:#34d399;font:12px/1.4 "JetBrains Mono","SF Mono",Menlo,Consolas,"PingFang SC","Noto Sans SC",monospace;color:#c7d2dc;background:rgba(3,7,11,.94);border:1px solid #1f2c3a;border-left:3px solid var(--cw-lv);border-radius:3px;padding:9px 11px 10px;min-width:0;box-sizing:border-box}
.cw-head{display:flex;align-items:center;gap:8px;min-width:0}
.cw-badge{flex:none;font-size:10.5px;font-weight:700;color:#050a0f;background:var(--cw-lv);border-radius:2px;padding:1px 6px}
.cw-title{color:#e8eef4;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.cw-sim{flex:none;font-size:9.5px;color:#5d6d7d;border:1px solid #1f2c3a;border-radius:2px;padding:0 4px}
.cw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px 10px;margin-top:8px}
.cw-grid small{display:block;font-size:9.5px;color:#5d6d7d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cw-grid b{display:block;color:#e8eef4;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
.cw-bar{display:block;height:3px;background:#1f2c3a;margin-top:3px;border-radius:2px;overflow:hidden}
.cw-bar i{display:block;height:100%;background:linear-gradient(90deg,#34d399,#f5a524 45%,#ff5b5b)}
.cw-arrow{display:inline-block;color:#22d3ee}
.cw-reasons{margin:8px 0 0;font-size:10.5px;color:var(--cw-lv)}
.cw-foot{margin:4px 0 0;font-size:9.5px;color:#5d6d7d}
.cw-compact{padding:7px 9px}
.cw-compact .cw-grid{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:6px}
.cw-compact .cw-full{display:none}
`;
function ensureCss(doc = document) {
  if (doc.getElementById('cw-style')) return;
  const s = doc.createElement('style'); s.id = 'cw-style'; s.textContent = CSS; doc.head.append(s);
}

/** 挂载天气卡片。update(sample, { title }) 传入 createMarsWeather().sample() 的结果。*/
export function mountWeatherCard(host, { title = '当前位置', compact = false } = {}) {
  ensureCss(host.ownerDocument);
  const el = host.ownerDocument.createElement('div');
  el.className = `cw-card${compact ? ' cw-compact' : ''}`;
  el.setAttribute('role', 'status');
  host.append(el);
  let name = title;
  function update(s, opts = {}) {
    if (opts.title) name = opts.title;
    const lv = s.hazard.level;
    el.style.setProperty('--cw-lv', HAZARD_COLORS[lv]);
    el.innerHTML = `<div class="cw-head"><span class="cw-badge">${HAZARD_LABELS[lv]}</span><span class="cw-title">${esc(name)}</span><span class="cw-sim" title="游戏模拟，不是天气预报">模拟</span></div>
      <div class="cw-grid">
        <div><small>光学厚度 τ</small><b>${s.tau.toFixed(2)}</b><span class="cw-bar"><i style="width:${Math.min(100, s.tau / 6 * 100).toFixed(0)}%"></i></span></div>
        <div><small>光伏系数</small><b>${Math.round(s.solarFactor * 100)}%</b></div>
        <div><small>能见度</small><b>${fmtVis(s.visibilityKm)}</b></div>
        <div><small>风 · 吹向</small><b><span class="cw-arrow" style="transform:rotate(${Math.round((s.windFromDeg + 180) % 360)}deg)">↑</span> ${Math.round(s.windMs)} m/s</b></div>
        <div class="cw-full"><small>气压</small><b>${Math.round(s.pressurePa)} Pa</b></div>
        <div class="cw-full"><small>气温 / 地温</small><b>${Math.round(s.airC)} / ${Math.round(s.groundC)}°C</b></div>
      </div>
      <p class="cw-reasons">${s.hazard.reasons.length ? esc(s.hazard.reasons.join(' · ')) : '无明显天气限制'}</p>
      <p class="cw-foot cw-full">LMST ${s.lmst} · 太阳高度 ${Math.round(s.sunElevationDeg)}° · Ls ${Math.round(s.ls)}° · 尘卷风${risk(s.dustDevilRisk)}</p>`;
  }
  return { el, update, destroy() { el.remove(); } };
}

/**
 * 画尘暴图层。toScreen(lat, lon) 返回该点在屏幕上的所有副本 [[x, y], ...]（支持经度环绕）；
 * pxPerDeg 为纬度方向每度像素数；spin 为动画相位（秒）。
 */
export function drawStormLayer(ctx, storms, { toScreen, pxPerDeg, width, height, spin = 0, highlightId = null, font = '10px monospace' }) {
  for (const s of storms) {
    if (s.kind === 'global') { ctx.fillStyle = 'rgba(196,112,58,.24)'; ctx.fillRect(0, 0, width, height); continue; }
    const ry = s.radiusKm / (MARS.radiusKm * D2R) * pxPerDeg, rx = ry / Math.max(.18, Math.cos(s.lat * D2R)), hot = s.id === highlightId;
    for (const [x, y] of toScreen(s.lat, s.lon)) {
      if (x + rx * 1.3 < 0 || x - rx * 1.3 > width || y + ry * 1.3 < 0 || y - ry * 1.3 > height) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry * 1.25);
      if (s.iceCloud) { g.addColorStop(0, 'rgba(214,236,255,.34)'); g.addColorStop(.7, 'rgba(170,210,240,.13)'); g.addColorStop(1, 'rgba(170,210,240,0)'); }
      else { const a = Math.min(.55, .12 + s.tauPeak * .11); g.addColorStop(0, `rgba(226,128,62,${a})`); g.addColorStop(.55, `rgba(200,110,55,${a * .55})`); g.addColorStop(1, 'rgba(200,110,55,0)'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry * 1.25, 0, Math.PI * 2); ctx.fill();
      const arms = s.iceCloud ? 3 : 2, dir = s.lat >= 0 ? -1 : 1;
      ctx.strokeStyle = s.iceCloud ? 'rgba(224,242,255,.55)' : 'rgba(245,165,36,.5)'; ctx.lineWidth = 1.2 * ry / rx;
      for (let arm = 0; arm < arms; arm++) {
        ctx.beginPath();
        for (let t = 0; t <= 1.0001; t += .04) {
          const ang = dir * (spin * .5 + arm * 2 * Math.PI / arms) + dir * t * 4.6, rr = ry * (.1 + .95 * t);
          const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr; t ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = hot ? '#ff4fd8' : s.iceCloud ? 'rgba(200,230,255,.5)' : 'rgba(245,165,36,.6)'; ctx.lineWidth = (hot ? 2 : 1) * ry / rx;
      ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      if (s.speedKmSol > 0) {
        const len = Math.min(56, 14 + s.speedKmSol / 30), a = s.heading * D2R, ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
        ctx.strokeStyle = s.iceCloud ? '#d6ecff' : '#f5a524'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.sin(a - .45) * 7, ey + Math.cos(a - .45) * 7); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.sin(a + .45) * 7, ey + Math.cos(a + .45) * 7); ctx.stroke();
      }
      const label = `${s.id} ${s.iceCloud ? '冰云' : `τ峰 ${s.tauPeak.toFixed(1)}`}`;
      ctx.font = font; ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(3,6,10,.9)'; ctx.strokeText(label, x, y - ry - 6);
      ctx.fillStyle = hot ? '#ff4fd8' : s.iceCloud ? '#d6ecff' : '#f5c36b'; ctx.fillText(label, x, y - ry - 6);
    }
  }
}

/** 返回一张 cols×rows 的夜间阴影贴图（0–360°E，90N–90S），按真实太阳高度逐格计算，画到地图矩形上即可。*/
export function nightShadeCanvas(time, { cols = 180, rows = 90, alpha = .72, doc = document } = {}) {
  const c = doc.createElement('canvas'); c.width = cols; c.height = rows;
  const g = c.getContext('2d'), img = g.createImageData(cols, rows), d = img.data, T = normalizeTime(time);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const el = sunElevationDeg(90 - (y + .5) * 180 / rows, (x + .5) * 360 / cols, T), k = Math.max(0, Math.min(1, (6 - el) / 12));
    const o = (y * cols + x) * 4; d[o] = 2; d[o + 1] = 6; d[o + 2] = 16; d[o + 3] = Math.round(k * alpha * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 某地一个火星日的曲线。weather 为 createMarsWeather() 实例。*/
export function drawDiurnalChart(canvas, weather, { lat, lon, time, elevationKm = 0, dpr = 1 }) {
  const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const T = normalizeTime(time), N = 96, pts = [], offset = ((lon % 360) + 360) % 360 - T.refLon;
  for (let i = 0; i <= N; i++) {
    const lf = i / N, s = weather.sample(lat, lon, { ...T, dayFraction: lf - offset / 360 }, { elevationKm });
    pts.push({ lf, air: s.airC, ground: s.groundC, pv: s.solarFactor * Math.max(0, Math.sin(s.sunElevationDeg * D2R)) });
  }
  const L = 34, R = 8, top = 16, B = 18, pw = w - L - R, ph = h - top - B, lo = -130, hi = 30;
  const X = f => L + f * pw, Y = c => top + (hi - c) / (hi - lo) * ph;
  g.font = '10px "JetBrains Mono",Menlo,monospace';
  for (const c of [-120, -80, -40, 0]) { g.strokeStyle = c === 0 ? '#1d2d3a' : '#101922'; g.beginPath(); g.moveTo(L, Y(c)); g.lineTo(w - R, Y(c)); g.stroke(); g.fillStyle = '#5d6d7d'; g.textAlign = 'right'; g.fillText(`${c}°`, L - 4, Y(c) + 3); }
  g.beginPath(); g.moveTo(X(0), top + ph); pts.forEach(p => g.lineTo(X(p.lf), top + ph - p.pv * ph * .45)); g.lineTo(X(1), top + ph); g.closePath(); g.fillStyle = 'rgba(52,211,153,.16)'; g.fill();
  const line = (key, color, dash = []) => { g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.6; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p.lf), Y(p[key])) : g.moveTo(X(p.lf), Y(p[key]))); g.stroke(); g.setLineDash([]); };
  line('ground', '#c47d4e', [4, 3]); line('air', '#f5a524');
  const now = ((T.dayFraction + offset / 360) % 1 + 1) % 1;
  g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(now), top - 4); g.lineTo(X(now), top + ph); g.stroke();
  g.fillStyle = '#ff4fd8'; g.textAlign = 'center'; g.fillText(lmst(now), Math.min(w - R - 18, Math.max(L + 18, X(now))), top - 5);
  g.fillStyle = '#5d6d7d'; ['00', '06', '12', '18', '24'].forEach((t, i) => g.fillText(t, X(i / 4), h - 5));
  g.textAlign = 'left'; g.fillStyle = '#f5a524'; g.fillText('气温', L + 4, top + 10); g.fillStyle = '#c47d4e'; g.fillText('地温', L + 38, top + 10); g.fillStyle = '#34d399'; g.fillText('光伏可用度', L + 72, top + 10);
}
