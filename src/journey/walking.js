// Metres, feet on the scene's terrain datum. These are gameplay limits.
export const WALK_SPEED = 2.1;
export const RUN_SPEED = 3.8;
export const MAX_WALK_SLOPE = Math.tan(32 * Math.PI / 180);

export function walkStep(position, dx, dz, heightAt, blocked = () => false) {
  const length = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(length / .12));
  let { x, z } = position;
  for (let i = 0; i < steps; i++) {
    const nx = x + dx / steps, nz = z + dz / steps;
    const h = heightAt(nx, nz), old = heightAt(x, z);
    if (!Number.isFinite(h) || Math.abs(nx) > 180000 || Math.abs(nz) > 180000 ||
        blocked(nx, nz) || Math.abs(h - old) > MAX_WALK_SLOPE * length / steps + .005) break;
    x = nx; z = nz;
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
