/* 按真实网格算走路的人能不能站在这儿（D13、D63：不做空气墙）。
 * 做法同前哨仓的 hullFootprint：每个三角形按半格间距撒点，落在「脚下地面 +low ~ 头顶」之间的格子记为实心，
 * 再按人的半径膨胀一圈。遗迹小、不整平地面，脚下地面取模型底面 y=0（floor 可换）。
 *
 * meshes：[{position, index?, matrix?}]，position 是 xyz 连续数组；matrix 是 16 位列主序
 * （three 的 Matrix4.elements），把顶点换到遗迹本地坐标（米）。 */
export function meshFootprint(meshes, { cell = .25, radius = .35, head = 1.95, low = .12, floor = () => 0 } = {}) {
  const tri = [];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const { position: P, index: I, matrix: M } of meshes) {
    const at = i => {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      return M ? [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]] : [x, y, z];
    };
    const n = I ? I.length : P.length / 3;
    for (let t = 0; t < n; t += 3) {
      const A = at(I ? I[t] : t), B = at(I ? I[t + 1] : t + 1), C = at(I ? I[t + 2] : t + 2);
      if (Math.max(A[1], B[1], C[1]) < low || Math.min(A[1], B[1], C[1]) > head) continue;
      tri.push(A, B, C);
      for (const p of [A, B, C]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    }
  }
  if (!tri.length) return { cell, cells: new Uint8Array(0), count: 0, blocked: () => false };
  const pad = radius + cell;
  x0 -= pad; z0 -= pad;
  const w = Math.ceil((x1 + pad - x0) / cell), h = Math.ceil((z1 + pad - z0) / cell);
  const solid = new Uint8Array(w * h);
  for (let t = 0; t < tri.length; t += 3) {
    const [A, B, C] = [tri[t], tri[t + 1], tri[t + 2]];
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const k = Math.max(1, Math.ceil(Math.max(Math.hypot(...e1), Math.hypot(...e2)) / (cell / 2)));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const u = i / k, v = j / k, x = A[0] + e1[0] * u + e2[0] * v, y = A[1] + e1[1] * u + e2[1] * v, z = A[2] + e1[2] * u + e2[2] * v;
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      if (gx < 0 || gx >= w || gz < 0 || gz >= h || solid[gz * w + gx]) continue;
      const f = floor(x, z);
      if (y >= f + low && y <= f + head) solid[gz * w + gx] = 1;
    }
  }
  // 按人的半径膨胀：人站的点离实心格中心不到 radius+半格，就算碰上。
  const reach = radius + cell / 2, r = Math.ceil(reach / cell), cells = new Uint8Array(w * h), ring = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dz) * cell <= reach) ring.push([dx, dz]);
  let count = 0;
  for (let gz = 0; gz < h; gz++) for (let gx = 0; gx < w; gx++) {
    if (!solid[gz * w + gx]) continue;
    for (const [dx, dz] of ring) { const x = gx + dx, z = gz + dz; if (x >= 0 && x < w && z >= 0 && z < h && !cells[z * w + x]) { cells[z * w + x] = 1; count++; } }
  }
  return {
    cell, x0, z0, w, h, cells, count,
    blocked(x, z) {
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      return gx >= 0 && gx < w && gz >= 0 && gz < h && cells[gz * w + gx] === 1;
    },
  };
}
