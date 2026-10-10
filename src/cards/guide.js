// 沿路线指路（D70）：箭头不指终点本身，而是指「沿路线往前 ahead 米」的那个点。
// 家里（前哨仓）有墙和走廊，直指通信台会让人撞墙；路线由 journey/route.js 的规划器给出。
const seg = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l)) : 0;
  const x = a.x + dx * t, z = a.z + dz * t;
  return { t, x, z, d: Math.hypot(p.x - x, p.z - z), len: Math.sqrt(l) };
};
/** 折线上离 p 最近的点：落在第 i 段（path[i-1] → path[i]），t 是这一段走了几成。 */
function nearest(path, p) {
  let best = null;
  for (let i = 1; i < path.length; i++) {
    const s = seg(p, path[i - 1], path[i]);
    if (!best || s.d < best.d - 1e-9) best = { ...s, i };
  }
  return best;
}

/** 先要路线离墙远（margin 米，走廊正中间最好），算不出来再放宽；同一档里换几种格子密度——
 * 规划器把地面切成格子，起点或终点正好落在家具旁边的格子里就会说「处于建筑范围」，换个密度常常就行了。 */
export const ROUTE_ATTEMPTS = Object.freeze([1.5, .8, 0].flatMap(margin =>
  [101, 161, 81, 131, 61].map(resolution => Object.freeze({ resolution, margin }))));

/** 依次试 attempts，第一个成功的路线就用；都不行返回 null。plan({resolution, margin}) 返回规划器的结果。 */
export function firstRoute(plan, attempts = ROUTE_ATTEMPTS) {
  for (const attempt of attempts) { const r = plan(attempt); if (r?.ok) return r.path; }
  return null;
}

/** p 离路线多远（米）。没有路线返回 Infinity。 */
export function offPath(path, p) {
  return path?.length > 1 ? nearest(path, p).d : Infinity;
}

/** 返回 { point, remaining }：point 是从 p 最近的路线点再往前 ahead 米的位置，remaining 是从那里走到终点还剩多少米。 */
export function lookahead(path, p, ahead = 5) {
  if (!path || path.length < 2) return null;
  const n = nearest(path, p);
  let remaining = n.len * (1 - n.t);
  for (let k = n.i + 1; k < path.length; k++) remaining += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
  let left = ahead, x = n.x, z = n.z, i = n.i;
  for (;;) {
    if (left <= 0) return { point: { x, z }, remaining };
    const b = path[i], d = Math.hypot(b.x - x, b.z - z);
    if (d >= left) { const r = left / d; return { point: { x: x + (b.x - x) * r, z: z + (b.z - z) * r }, remaining }; }
    left -= d; x = b.x; z = b.z;
    if (i === path.length - 1) return { point: { x, z }, remaining };
    i++;
  }
}
