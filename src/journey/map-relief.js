// Shaded relief for the local navigation map. Metres in, RGBA out.
//
// The map draws the REAL game height field, not a satellite raster, so what the
// operator reads here is what the wheels will meet. The old version sampled a
// fixed 160x160 grid and stretched it across the whole canvas, which threw away
// everything finer than a few hundred metres per pixel.
//
// Two rules make a denser grid actually pay off:
//   1. Shade from SLOPE, not from the raw height difference between neighbours.
//      A finer grid has smaller steps between samples, so a difference-based
//      hillshade flattens out exactly when you ask it for more detail.
//   2. Sample at the canvas aspect ratio. A square grid on a 16:9 panel spends
//      its budget on the short axis.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

// Light from the north-west, the cartographic convention: north is up (-z) and
// west is left (-x), so shadows fall toward the reader's lower right.
const SUN = (() => {
  const x = -.55, y = .62, z = -.55, n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
})();

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

// Contour interval that puts roughly 6-14 lines across the visible relief.
export function contourStep(range) {
  if (!(range > 0)) return 0;
  for (const s of STEPS) if (range / s <= 14) return s;
  return STEPS[STEPS.length - 1];
}

// Mars soil ramp, low ground to high ground. Matches the map's existing palette
// (the planet-wide view uses the same browns) so the two modes read as one map.
function soil(t, out, i) {
  const u = clamp(t);
  out[i] = 46 + u * 128;
  out[i + 1] = 50 + u * 70;
  out[i + 2] = 47 + u * 40;
}

/**
 * Paint one relief tile.
 * @param heights  Float64Array of gw*gh samples, row-major, north row first.
 * @param dx,dz    Ground metres between neighbouring samples.
 * @param dxRow    Optional per-row east-west spacing, for a lat/lon grid whose
 *                 columns crowd together toward the poles. Overrides `dx`.
 * @param relief   Vertical exaggeration for the shading only, never for the
 *                 colour ramp. At a 15 km grid a real slope is a fraction of a
 *                 degree and shades as a flat plate; the cartographic answer is
 *                 to exaggerate. Local views want 1 — the ground is steep enough.
 * Returns the RGBA bytes plus the height range actually found.
 */
export function shadeRelief({ heights, gw, gh, dx, dz, dxRow = null, relief = 1, contours = true }) {
  const rgba = new Uint8ClampedArray(gw * gh * 4);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < heights.length; i++) { const h = heights[i]; if (h < lo) lo = h; if (h > hi) hi = h; }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  // A dead-flat patch must not blow the colour ramp up into pure noise.
  const range = Math.max(hi - lo, 4), step = contours ? contourStep(hi - lo) : 0;
  const at = (x, y) => heights[Math.min(gh - 1, Math.max(0, y)) * gw + Math.min(gw - 1, Math.max(0, x))];

  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x, o = i * 4, h = heights[i];
    // Central differences in METRES PER METRE: the gradient is what the eye
    // reads as steepness, and it does not change when the grid gets finer.
    const gx = relief * (at(x + 1, y) - at(x - 1, y)) / (2 * (dxRow ? dxRow[y] : dx));
    const gz = relief * (at(x, y + 1) - at(x, y - 1)) / (2 * dz);
    const inv = 1 / Math.hypot(gx, 1, gz);
    const lambert = clamp((-gx * SUN.x + SUN.y - gz * SUN.z) * inv, 0, 1);
    soil((h - lo) / range, rgba, o);
    // Ambient floor keeps shadowed slopes readable instead of crushing to black.
    const light = .42 + .78 * lambert;
    rgba[o] *= light; rgba[o + 1] *= light; rgba[o + 2] *= light;
    if (step) {
      // A contour wherever the band index changes against the north or west
      // neighbour: one pixel wide at any zoom, no line-tracing pass needed.
      const band = Math.floor(h / step);
      if (band !== Math.floor(at(x - 1, y) / step) || band !== Math.floor(at(x, y - 1) / step)) {
        const major = band % 5 === 0, k = major ? .42 : .22;
        rgba[o] += (214 - rgba[o]) * k; rgba[o + 1] += (228 - rgba[o + 1]) * k; rgba[o + 2] += (220 - rgba[o + 2]) * k;
      }
    }
    rgba[o + 3] = 255;
  }
  return { rgba, lo, hi, step };
}

/**
 * Progressive relief renderer.
 *
 * `heightAt` costs ~0.8 us per call, so a canvas-resolution grid is a few
 * hundred milliseconds — far too long to block a wheel-zoom. Every request
 * paints a coarse pass immediately, then refines in timer slices that each
 * stay under a millisecond budget. A newer request abandons the one in flight.
 */
export function createMapRelief({ heightAt, budgetMs = 7, coarse = 220, maxDetail = 1280, contours = true, schedule } = {}) {
  // NOT requestAnimationFrame: a hidden or throttled pane runs rAF at ~2 Hz, which
  // would stretch a refine pass over half a minute. A timer keeps its own clock.
  const later = schedule || (fn => { const id = setTimeout(fn, 0); return () => clearTimeout(id); });
  let job = null, stop = null;
  const cancel = () => { if (stop) stop(); stop = null; job = null; };

  // Sample at the canvas aspect ratio; a square grid on a wide panel wastes its budget.
  function grid(view, base) {
    const aspect = Math.max(.05, view.spanX / view.spanZ);
    const gh = Math.max(24, Math.round(base / Math.sqrt(aspect)));
    return { gw: Math.max(24, Math.round(gh * aspect)), gh };
  }
  // One relief sample per canvas pixel is the point where more sampling stops
  // showing anything new, so the refine pass targets exactly that.
  function detailGrid(view) {
    const w = Math.round(view.pxW || 0), h = Math.round(view.pxH || 0);
    if (!(w > 0 && h > 0)) return grid(view, 720);
    const k = Math.min(1, maxDetail / Math.max(w, h));
    return { gw: Math.max(24, Math.round(w * k)), gh: Math.max(24, Math.round(h * k)) };
  }

  function paint(view, gw, gh, heights) {
    const { rgba, lo, hi, step } = shadeRelief({
      heights, gw, gh, dx: view.spanX / (gw - 1), dz: view.spanZ / (gh - 1), contours,
    });
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    c.getContext('2d').putImageData(new ImageData(rgba, gw, gh), 0, 0);
    return { canvas: c, lo, hi, step, gw, gh };
  }

  function sample(view, gw, gh, heights, from, rows) {
    const to = Math.min(gh, from + rows);
    for (let y = from; y < to; y++) {
      const z = view.cz + (y / (gh - 1) - .5) * view.spanZ;
      for (let x = 0; x < gw; x++) heights[y * gw + x] = heightAt(view.cx + (x / (gw - 1) - .5) * view.spanX, z);
    }
    return to;
  }

  return {
    cancel,
    /**
     * @param view  {cx, cz, spanX, spanZ} in world metres, plus the canvas
     *              pixel size {pxW, pxH} the tile will be stretched across.
     * @param onTile called with the coarse tile, then once more when refined.
     */
    request(view, onTile) {
      cancel();
      const c = grid(view, coarse);
      const coarseHeights = new Float64Array(c.gw * c.gh);
      sample(view, c.gw, c.gh, coarseHeights, 0, c.gh);
      const first = paint(view, c.gw, c.gh, coarseHeights);
      onTile(first, false);

      const d = detailGrid(view);
      if (d.gw * d.gh <= c.gw * c.gh * 1.2) return;
      const heights = new Float64Array(d.gw * d.gh);
      job = { view, ...d, heights, row: 0 };
      // Rows per slice is re-estimated from the measured cost of the last slice,
      // so a slow machine takes more frames instead of dropping them.
      let rows = Math.max(4, Math.round(d.gh / 16));
      const tick = () => {
        if (!job) return;
        stop = null;
        const t0 = performance.now();
        job.row = sample(job.view, job.gw, job.gh, job.heights, job.row, rows);
        const ms = performance.now() - t0;
        // Re-estimate the slice from what the last one actually cost, so a slow
        // machine takes more slices instead of freezing the map.
        if (ms > 0) rows = Math.max(2, Math.min(job.gh, Math.round(rows * budgetMs / ms)));
        if (job.row >= job.gh) {
          const done = paint(job.view, job.gw, job.gh, job.heights);
          job = null;
          onTile(done, true);
        } else stop = later(tick);
      };
      stop = later(tick);
    },
  };
}
