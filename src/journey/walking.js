// Metres, feet on the scene's terrain datum. These are gameplay limits.
// The three speeds are also what the EVA animation clips are played back against: each one is close
// to a clip's own authored stride speed, so the boots do not skate. See src/journey/locomotion.js
// before changing them - a faster walk here is a faster step cadence on screen, not a longer stride.
export const WALK_SPEED = 1.3;
// 7.4 是从步频倒推的：跑用的慢跑片段名义速度 4.721 m/s、一个循环 0.933 s（每分钟 129 步），
// 7.4 / 4.721 = 1.57 倍速，约每分钟 200 步。3.8 m/s（103 步）看着发飘，5.9 m/s（160 步）
// 用户看过仍嫌慢。步频只能靠速度抬，见 docs/DISCUSSION_LOG.md D75。
export const RUN_SPEED = 7.4;
export const CROUCH_SPEED = .66;
export const MAX_WALK_SLOPE = Math.tan(32 * Math.PI / 180);
export const MAX_AIR_SLOPE = Math.tan(72 * Math.PI / 180);

/** slope: the steepest rise a step may take. Walking uses MAX_WALK_SLOPE; a jump passes
 * MAX_AIR_SLOPE so the arc can carry the suit over a ledge it could never walk up. */
export function walkStep(position, dx, dz, heightAt, blocked = () => false, slope = MAX_WALK_SLOPE) {
  const length = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(length / .12));
  const sx = dx / steps, sz = dz / steps, rise = slope * length / steps + .005;
  let { x, z } = position;
  // share：这一小段实际走了整段的几分之几。只走一个分量时容许的高差按同样比例缩——否则那 5 mm
  // 余量不跟着步长变短，贴着陡坡斜着蹭，每帧都能爬上去一点。
  const open = (nx, nz, share = 1) => {
    const h = heightAt(nx, nz);
    return Number.isFinite(h) && Math.abs(nx) <= 180000 && Math.abs(nz) <= 180000 &&
      !blocked(nx, nz) && !(Math.abs(h - heightAt(x, z)) > rise * share);
  };
  const shareX = Math.abs(dx) / length, shareZ = Math.abs(dz) / length;
  for (let i = 0; i < steps; i++) {
    if (open(x + sx, z + sz)) { x += sx; z += sz; continue; }
    // 整段被拒：只走一个分量试试，人就顺着墙滑，不会贴着墙一点朝墙的分量就钉死（D78）。
    // 先试大的那个分量。一小段只走一个分量，不两个接着走（接着走等于绕过了整段的坡度检查）。
    if (!sx || !sz) break;
    const tryX = () => open(x + sx, z, shareX) && (x += sx, true);
    const tryZ = () => open(x, z + sz, shareZ) && (z += sz, true);
    if (!(shareX >= shareZ ? tryX() || tryZ() : tryZ() || tryX())) break;
  }
  return { x, z, y: heightAt(x, z) };
}

export function findExit(origin, radius, heightAt, blocked = () => false) {
  for (const r of [radius, radius + 1, radius + 2]) {
    for (let i = 0; i < 16; i++) {
      const angle = (origin.heading || 0) + Math.PI / 2 + i * Math.PI / 8;
      const x = origin.x + Math.sin(angle) * r, z = origin.z + Math.cos(angle) * r;
      const h = heightAt(x, z);
      if (!Number.isFinite(h) || blocked(x, z)) continue;
      if ([[-.5,0],[.5,0],[0,-.5],[0,.5]].every(([dx,dz]) =>
        !blocked(x+dx,z+dz) && Math.abs(heightAt(x+dx,z+dz)-h) <= MAX_WALK_SLOPE*.5)) {
        return {x, z, heading: origin.heading || 0};
      }
    }
  }
  return null;
}
