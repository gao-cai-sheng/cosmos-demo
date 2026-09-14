/**
 * MOLA 4 px/° 全球高程（data/mola_4ppd.js 定义的 window.MOLA）解码与采样。
 * 16 位有符号大端，单位米，简单圆柱投影 0–360°E / 90N–90S。
 */
const D2R = Math.PI / 180;

export function decodeMola(mola = globalThis.MOLA) {
  if (!mola?.b64) throw new Error('缺少 MOLA 数据：请先加载 data/mola_4ppd.js');
  const W = mola.w, H = mola.h, bin = atob(mola.b64), E = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { let v = (bin.charCodeAt(i * 2) << 8) | bin.charCodeAt(i * 2 + 1); if (v & 0x8000) v -= 0x10000; E[i] = v / 1000; }
  function elevationKm(lat, lon) {
    const fx = (((lon % 360) + 360) % 360) * W / 360 - .5, fy = Math.max(0, Math.min(H - 1.001, (90 - lat) * H / 180 - .5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, xa = (x0 + W) % W, xb = (x0 + 1 + W) % W, y1 = Math.min(H - 1, y0 + 1);
    return (E[y0 * W + xa] * (1 - tx) + E[y0 * W + xb] * tx) * (1 - ty) + (E[y1 * W + xa] * (1 - tx) + E[y1 * W + xb] * tx) * ty;
  }
  return { W, H, E, elevationKm };
}

/** 暗色航图风格的晕渲底图（含 1 km / 5 km 等高线）。*/
export function shadedReliefCanvas({ W, H, E }, doc = document) {
  const stops = [[-8.5, 10, 24, 38], [-5, 15, 34, 48], [-2.5, 24, 44, 52], [0, 36, 50, 50], [2, 52, 56, 48], [5, 70, 62, 50], [9, 90, 74, 58], [14, 114, 96, 78], [21.2, 158, 148, 138]];
  const ramp = h => { for (let i = 0; i < stops.length - 1; i++) { const a = stops[i], b = stops[i + 1]; if (h <= b[0]) { const t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0]))); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; } } return stops.at(-1).slice(1); };
  const c = doc.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, dy = (180 / H) * D2R * 3389.5;
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + .5) * 180 / H, dx = dy * Math.max(.08, Math.cos(lat * D2R));
    for (let x = 0; x < W; x++) {
      const i = y * W + x, h = E[i], xe = (x + 1) % W, xw = (x - 1 + W) % W, yn = Math.max(0, y - 1), ys = Math.min(H - 1, y + 1);
      const nx = -(E[y * W + xe] - E[y * W + xw]) / (2 * dx) * 40, ny = -(E[ys * W + x] - E[yn * W + x]) / (2 * dy) * 40, il = 1 / Math.hypot(nx, ny, 1);
      const sh = Math.max(.45, Math.min(1.45, (nx * il * -.55 + ny * il * -.62 + il * .56) * 1.2 + .45));
      let [r, gg, b] = ramp(h);
      if (Math.floor(h) !== Math.floor(E[y * W + xe]) || Math.floor(h) !== Math.floor(E[ys * W + x])) {
        const k = Math.floor(h / 5) !== Math.floor(E[y * W + xe] / 5) || Math.floor(h / 5) !== Math.floor(E[ys * W + x] / 5) ? 1.55 : 1.2; r *= k; gg *= k; b *= k;
      }
      const o = i * 4; d[o] = Math.min(255, r * sh); d[o + 1] = Math.min(255, gg * sh); d[o + 2] = Math.min(255, b * sh); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
