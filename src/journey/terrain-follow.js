/**
 * 地面网格跟着镜头走（D68）。
 *
 * 画面地面是一张极坐标网：NT 条射线 × NR 圈，圈距按比例递增，中心最密。它原来钉在场景原点上，
 * 人一走远脚下的格子就变大（1 km 处 14.5 m，7.4 km 处约 107 m），画出来的地面和玩法用的
 * terrainY 分开，车和人浮空或陷地（D67）。这里让同一张网换个中心重建：
 *   - 重建约 0.6 s 计算量，切成小块，每帧只做几毫秒，做完整张换上；
 *   - 新顶点带上「旧地面在这里的高度和法线」，着色器按 morph 从旧到新过渡，换的那一下不跳。
 * 只管数组，不依赖 three：几何体和着色器由场景接（tools/mars-vista.html）。Node 可测。
 */

/** 极坐标网的几何。顶点 0 是中心；顶点 1 + ri·NT + ti 在 (cos a · r, sin a · r)，a = ti/NT·2π。 */
export function polarGrid({ NT, NR, R0, RMAX }) {
  const GROWTH = Math.exp(Math.log(RMAX / R0) / (NR - 1)), LOG = Math.log(GROWTH), count = NT * NR + 1;
  const radius = new Float64Array(NR), cell = new Float64Array(NR), cos = new Float64Array(NT), sin = new Float64Array(NT);
  for (let ri = 0; ri < NR; ri++) { radius[ri] = R0 * Math.pow(GROWTH, ri); cell[ri] = Math.max(.02, radius[ri] * (GROWTH - 1)); }
  for (let ti = 0; ti < NT; ti++) { const a = ti / NT * Math.PI * 2; cos[ti] = Math.cos(a); sin[ti] = Math.sin(a); }

  function indices() {
    const idx = new Uint32Array(NT * 3 + (NR - 1) * NT * 6);
    let k = 0;
    for (let ti = 0; ti < NT; ti++) { idx[k++] = 0; idx[k++] = 1 + (ti + 1) % NT; idx[k++] = 1 + ti; }   // 中心扇面
    for (let ri = 0; ri < NR - 1; ri++) {
      const a0 = 1 + ri * NT, b0 = a0 + NT;
      for (let ti = 0; ti < NT; ti++) {
        const tn = (ti + 1) % NT;
        idx[k++] = a0 + ti; idx[k++] = b0 + tn; idx[k++] = b0 + ti;
        idx[k++] = a0 + ti; idx[k++] = a0 + tn; idx[k++] = b0 + tn;
      }
    }
    return idx;
  }

  /** 相对网格中心的 (dx, dz) 落在哪个三角面上：out.i 三个顶点，out.w 三个重心权重（和为 1）。
   * 权重按三角面的真实顶点算，不拿极坐标的比例凑：陡坡上后者会差出几厘米到十几厘米。
   * 紧贴外圈弦线外侧的那一丝（半径的十万分之一）按本格外推。 */
  function locate(dx, dz, out) {
    const r = Math.hypot(dx, dz), I = out.i, W = out.w;
    let a = Math.atan2(dz, dx); if (a < 0) a += Math.PI * 2;
    const ti = Math.floor(a / (Math.PI * 2) * NT) % NT, tn = (ti + 1) % NT;
    if (r < R0) {
      I[0] = 0; I[1] = 1 + ti; I[2] = 1 + tn;
      return weights(dx, dz, 0, 0, cos[ti] * R0, sin[ti] * R0, cos[tn] * R0, sin[tn] * R0, W), out;
    }
    const ri = Math.min(NR - 2, Math.max(0, Math.floor(Math.log(r / R0) / LOG))), r0 = radius[ri], r1 = radius[ri + 1];
    const a0 = 1 + ri * NT, b0 = a0 + NT;
    const ax = cos[ti] * r0, az = sin[ti] * r0, cx = cos[tn] * r1, cz = sin[tn] * r1;
    // 每格两个三角面，对角线从内 ti 到外 tn：(内ti, 外ti, 外tn) 和 (内ti, 内tn, 外tn)。看点在对角线哪一侧。
    const side = (cx - ax) * (dz - az) - (cz - az) * (dx - ax);
    I[0] = a0 + ti; I[2] = b0 + tn;
    if (side <= 0) { I[1] = b0 + ti; weights(dx, dz, ax, az, cos[ti] * r1, sin[ti] * r1, cx, cz, W); }
    else { I[1] = a0 + tn; weights(dx, dz, ax, az, cos[tn] * r0, sin[tn] * r0, cx, cz, W); }
    return out;
  }
  const hit = { i: new Int32Array(3), w: new Float64Array(3) };
  /** pos 这张网在 (dx, dz) 处画出来的高度。 */
  function heightAt(pos, dx, dz) {
    locate(dx, dz, hit);
    return pos[hit.i[0] * 3 + 1] * hit.w[0] + pos[hit.i[1] * 3 + 1] * hit.w[1] + pos[hit.i[2] * 3 + 1] * hit.w[2];
  }
  return { NT, NR, R0, RMAX, GROWTH, count, radius, cell, cos, sin, indices, locate, heightAt };
}

/** 镜头离网格中心多远就该重建（米）。走得越快、飞得越高，脚下那几格粗一点越看不出来。
 * 步行约 65 m，ARES 巡航约 115 m；速度项封顶 600 m，掠地飞行时就是一直在补。 */
export const followThreshold = (speed, above) => Math.max(Math.min(60 + 4 * speed, 600), 2 * above);

const MORPH_MS = 600, CUT_SPEED = 400, LEAD_MAX = 2000, AHEAD = .8;
const smooth = k => k * k * (3 - 2 * k);

/**
 * sample(i, x, z, cell, pos, col)：在世界坐标 (x, z) 按格距 cell 取样，写 pos[i*3+1]（高度）和 col[i*3..]。
 * 返回的 surface = { pos, nrm, col, prevY, prevNrm, prevCol, centre }：pos 的 x、z 相对 centre（网格摆在 centre 上，
 * 这样离原点几公里时顶点坐标还是小数，不抖）；prev* 是换面之前那张面在每个新顶点处的高度、法线和顶点色。
 */
export function createTerrainFollower({ grid, sample, now = () => performance.now() }) {
  const { NT, NR, count, radius, cell, cos, sin } = grid, n3 = count * 3;
  // 两套：前台那套正画着、也给查高度用，后台那套在建。prev* 只有一套（显卡里有自己的副本）。
  const sets = [0, 1].map(() => ({ pos: new Float32Array(n3), nrm: new Float32Array(n3), col: new Float32Array(n3) }));
  const prevY = new Float32Array(count), prevNrm = new Float32Array(n3), prevCol = new Float32Array(n3);
  const hit = { i: new Int32Array(3), w: new Float64Array(3) };
  let front = -1, centre = { x: 0, z: 0 }, job = null;
  let morphStart = -Infinity, rebuilds = 0, jobSeconds = 2.5, lastCpuMs = 0, maxSliceMs = 0;
  let last = null, vx = 0, vz = 0, hurry = false, prevBusy = false;

  const ringStart = ri => ri < 0 ? 0 : 1 + ri * NT, ringCount = ri => ri < 0 ? 1 : NT;

  // 四段，每段按圈推进（ring −1 是中心顶点 / 中心扇面）：
  const STAGES = [
    { first: -1, last: NR - 1, run(j, ri) {                       // 取样：高度和顶点色
      const { pos, col } = sets[j.set], { x: cx, z: cz } = j.centre;
      if (ri < 0) { pos[0] = 0; pos[2] = 0; sample(0, cx, cz, .02, pos, col); return; }
      const r = radius[ri], c = cell[ri];
      for (let ti = 0, i = 1 + ri * NT; ti < NT; ti++, i++) {
        const lx = cos[ti] * r, lz = sin[ti] * r;
        pos[i * 3] = lx; pos[i * 3 + 2] = lz;
        sample(i, cx + lx, cz + lz, c, pos, col);
      }
    } },
    { first: -1, last: NR - 2, run(j, ri) {                       // 法线：面法线累加到三个顶点，和 computeVertexNormals 同一算法
      const { pos, nrm } = sets[j.set];
      if (ri < 0) { nrm.fill(0); for (let ti = 0; ti < NT; ti++) face(pos, nrm, 0, 1 + (ti + 1) % NT, 1 + ti); return; }
      const a0 = 1 + ri * NT, b0 = a0 + NT;
      for (let ti = 0; ti < NT; ti++) {
        const tn = (ti + 1) % NT;
        face(pos, nrm, a0 + ti, b0 + tn, b0 + ti);
        face(pos, nrm, a0 + ti, a0 + tn, b0 + tn);
      }
    } },
    { first: -1, last: NR - 1, run(j, ri) {                       // 归一
      const { nrm } = sets[j.set];
      for (let i = ringStart(ri), end = i + ringCount(ri); i < end; i++) {
        const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
        nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
      }
    } },
    { first: -1, last: NR - 1, run(j, ri) {                       // 旧面在每个新顶点处的高度、法线和顶点色
      const { pos, nrm, col } = sets[j.set], old = front < 0 ? null : sets[front];
      prevBusy = true;
      const ox = j.centre.x - centre.x, oz = j.centre.z - centre.z;
      for (let i = ringStart(ri), end = i + ringCount(ri); i < end; i++) {
        if (!old) { prevY[i] = pos[i * 3 + 1]; for (let k = i * 3; k < i * 3 + 3; k++) { prevNrm[k] = nrm[k]; prevCol[k] = col[k]; } continue; }
        grid.locate(pos[i * 3] + ox, pos[i * 3 + 2] + oz, hit);
        const [a, b, c] = hit.i, [u, v, w] = hit.w, P = old.pos, N = old.nrm, C = old.col;
        prevY[i] = P[a * 3 + 1] * u + P[b * 3 + 1] * v + P[c * 3 + 1] * w;
        const nx = N[a * 3] * u + N[b * 3] * v + N[c * 3] * w, ny = N[a * 3 + 1] * u + N[b * 3 + 1] * v + N[c * 3 + 1] * w,
          nz = N[a * 3 + 2] * u + N[b * 3 + 2] * v + N[c * 3 + 2] * w, l = Math.hypot(nx, ny, nz) || 1;
        prevNrm[i * 3] = nx / l; prevNrm[i * 3 + 1] = ny / l; prevNrm[i * 3 + 2] = nz / l;
        for (let k = 0; k < 3; k++) prevCol[i * 3 + k] = C[a * 3 + k] * u + C[b * 3 + k] * v + C[c * 3 + k] * w;
      }
    } },
  ];

  const begin = (c, lead = 0) => ({ centre: { x: c.x, z: c.z }, lead, set: front === 0 ? 1 : 0, stage: 0, ring: STAGES[0].first, cpu: 0, t0: now() });
  /** 推进到 deadline（毫秒时刻）为止；整张做完返回 true。每圈问一次时钟。 */
  function advance(j, deadline) {
    for (;;) {
      const stage = STAGES[j.stage];
      stage.run(j, j.ring);
      if (++j.ring > stage.last) { if (++j.stage === STAGES.length) return true; j.ring = STAGES[j.stage].first; }
      if (now() >= deadline) return false;
    }
  }
  function finish(j, blend) {
    front = j.set; centre = j.centre; job = null; hurry = false; prevBusy = false; rebuilds++; lastCpuMs = j.cpu;
    if (blend) { morphStart = now(); jobSeconds += (Math.min(6, Math.max(.3, (morphStart - j.t0) / 1000)) - jobSeconds) * .5; }
    return surface();
  }
  function surface() {
    return front < 0 ? null : { ...sets[front], prevY, prevNrm, prevCol, centre: { x: centre.x, z: centre.z } };
  }

  return {
    /** 一次做完（首次建场景用），不过渡。 */
    rebuildNow(c) { const j = begin(c), t0 = now(); advance(j, Infinity); j.cpu = now() - t0; return finish(j, false); },
    /** 每帧调一次：x、z 是镜头的水平位置，above 是离地高度。换面的那一帧返回新 surface，其余返回 null。 */
    update({ x, z, above = 0, fps = 60 }) {
      const t = now();
      if (last) {
        const dt = (t - last.t) / 1000, dx = x - last.x, dz = z - last.z;
        if (dt > 0) {
          // 比什么载具都快，就是镜头被切到别处了，不是在走。
          if (Math.hypot(dx, dz) / dt > CUT_SPEED) { vx = vz = 0; hurry = true; }
          else { const k = 1 - Math.exp(-dt / .5); vx += (dx / dt - vx) * k; vz += (dz / dt - vz) * k; }
        }
      }
      last = { x, z, t };
      const threshold = followThreshold(Math.hypot(vx, vz), above), off = Math.hypot(x - centre.x, z - centre.z);
      // 镜头被切到别处（换了操控对象、传送）：在建的那张已经没用，从这里重开。提前量本身不算走远。
      if (job && Math.hypot(x - job.centre.x, z - job.centre.z) > job.lead + Math.max(3 * threshold, 500)) { job = null; prevBusy = false; }
      if (!job && off > threshold) {
        // 新中心放在「做完的时候人会在的地方」再往前 0.8 个阈值：人从后往前穿过最密的中间，
        // 一个来回里离中心最远只有原地等它追上来的一半多一点，重建次数也更少。停着不动就不往前放。
        const speed = Math.hypot(vx, vz), reach = speed > 1 ? jobSeconds + AHEAD * threshold / speed : 0;
        let lx = vx * reach, lz = vz * reach, l = Math.hypot(lx, lz);
        if (l > LEAD_MAX) { lx *= LEAD_MAX / l; lz *= LEAD_MAX / l; l = LEAD_MAX; }
        job = begin({ x: x + lx, z: z + lz }, l);
      }
      if (!job) return null;
      // 镜头刚被切过来、或者离得太远：脚下是粗格子，多花点时间尽快补上。平时每帧 3.5 ms（帧率低时 2 ms）。
      const budget = hurry || off > 3 * threshold ? 10 : fps < 40 ? 2 : 3.5, t0 = now(), j = job, done = advance(j, t0 + budget), spent = now() - t0;
      j.cpu += spent; maxSliceMs = Math.max(maxSliceMs, spent);
      return done ? finish(j, true) : null;
    },
    surface,
    /** 当前这张面在世界坐标 (x, z) 处画出来的高度。 */
    heightAt: (x, z) => grid.heightAt(sets[front].pos, x - centre.x, z - centre.z),
    /** 过渡期间，旧面比新面在 (x, z) 处高多少：贴在地上的小东西（碎石）乘上 morph 加到自己身上，就跟着地面一起动。 */
    liftAt(x, z) {
      if (front < 0 || prevBusy || now() - morphStart >= MORPH_MS) return 0;
      grid.locate(x - centre.x, z - centre.z, hit);
      const [a, b, c] = hit.i, P = sets[front].pos;
      return (prevY[a] - P[a * 3 + 1]) * hit.w[0] + (prevY[b] - P[b * 3 + 1]) * hit.w[1] + (prevY[c] - P[c * 3 + 1]) * hit.w[2];
    },
    get centre() { return { x: centre.x, z: centre.z }; },
    /** 1 = 还是旧面的样子，0 = 新面。 */
    get morph() { const k = (now() - morphStart) / MORPH_MS; return k >= 1 ? 0 : 1 - smooth(Math.max(0, k)); },
    get building() { return !!job; },
    stats: () => ({ centre: { x: centre.x, z: centre.z }, rebuilds, building: !!job, jobSeconds: +jobSeconds.toFixed(2), lastCpuMs: +lastCpuMs.toFixed(1), maxSliceMs: +maxSliceMs.toFixed(2) }),
  };
}

// 点 P 在三角面 ABC（都在水平面上）里的重心权重。
function weights(px, pz, ax, az, bx, bz, cx, cz, W) {
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  W[0] = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
  W[1] = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
  W[2] = 1 - W[0] - W[1];
}

// 面 (a, b, c) 的法线 (C−B)×(A−B)（长度 = 面积的两倍，天然按面积加权），加到三个顶点上。
function face(pos, nrm, a, b, c) {
  const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
  const ux = pos[c * 3] - bx, uy = pos[c * 3 + 1] - by, uz = pos[c * 3 + 2] - bz;
  const vx = pos[a * 3] - bx, vy = pos[a * 3 + 1] - by, vz = pos[a * 3 + 2] - bz;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  nrm[a * 3] += nx; nrm[a * 3 + 1] += ny; nrm[a * 3 + 2] += nz;
  nrm[b * 3] += nx; nrm[b * 3 + 1] += ny; nrm[b * 3 + 2] += nz;
  nrm[c * 3] += nx; nrm[c * 3 + 1] += ny; nrm[c * 3 + 2] += nz;
}
