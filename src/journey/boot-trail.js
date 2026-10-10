/** Boot prints in the regolith. Same bargain as the tyre tracks (DISCUSSION_LOG D33): visual only,
 *  the height field is never deformed and nothing in the walk solver reads them back.
 *
 *  A print is one quad stamped at the moment a boot touches down, not a ribbon dragged behind the
 *  foot - a walker leaves discrete marks where the sole lands, and the gap between them IS the
 *  stride. That is why the caller feeds each foot's own world point: the prints then come out of the
 *  animation, so a longer stride at a run really does space them further apart.
 *
 *  Bounded ring buffer, oldest print overwritten. No three.js here, so node can test it. */
export function createBootTrail({heightAt, capacity = 2048, lift = .02, length = .34, width = .145,
                                 contact = .06, minStep = .18, maxJump = 4, onWrite = () => {}}) {
  const positions = new Float32Array(capacity * 18), uvs = new Float32Array(capacity * 12);
  // corners: 0 back-right, 1 back-left, 2 front-right, 3 front-left, wound as two triangles.
  const order = [0, 1, 2, 2, 1, 3], UV = [[1, 0], [0, 0], [1, 1], [1, 1], [0, 0], [0, 1]];
  const feet = [];
  let cursor = 0, count = 0;

  function foot(i) {
    // `last` is where the boot was a frame ago (spots a reload); `mark` is where it last printed.
    return feet[i] || (feet[i] = {down: false, lx: NaN, lz: NaN, mx: NaN, mz: NaN});
  }

  /** One boot-sized quad centred on (x,z), long axis along `heading`. `side` 1 mirrors the tread. */
  function stamp(x, z, heading = 0, side = 0) {
    const fx = Math.sin(heading) * length / 2, fz = Math.cos(heading) * length / 2;
    const rx = Math.cos(heading) * width / 2, rz = -Math.sin(heading) * width / 2;
    const corner = [x - fx + rx, z - fz + rz, x - fx - rx, z - fz - rz,
                    x + fx + rx, z + fz + rz, x + fx - rx, z + fz - rz];
    const base = cursor * 18, uvBase = cursor * 12;
    for (let i = 0; i < 6; i++) {
      const k = order[i] * 2, cx = corner[k], cz = corner[k + 1], o = base + i * 3;
      positions[o] = cx; positions[o + 1] = heightAt(cx, cz) + lift; positions[o + 2] = cz;
      uvs[uvBase + i * 2] = side ? 1 - UV[i][0] : UV[i][0];
      uvs[uvBase + i * 2 + 1] = UV[i][1];
    }
    cursor = (cursor + 1) % capacity;
    count = Math.min(capacity, count + 1);
    onWrite(count);
  }

  /**
   * Feed one boot's world point every frame.
   * @param {number} i which foot, 0 or 1
   * @param {{x:number,z:number,clearance:number,moving:boolean,heading?:number}} sole
   *        clearance is metres of air under the sole - zero when the boot is flat on the ground.
   */
  function step(i, {x, z, clearance, moving, heading = 0}) {
    const f = foot(i), down = clearance <= contact;
    // A reload or a teleport moves the boot kilometres between frames; that is not a footstep.
    const jumped = Number.isFinite(f.lx) && Math.hypot(x - f.lx, z - f.lz) > maxJump;
    f.lx = x; f.lz = z;
    if (jumped) { f.down = down; f.mx = f.mz = NaN; return; }
    const far = !Number.isFinite(f.mx) || Math.hypot(x - f.mx, z - f.mz) >= minStep;
    if (down && !f.down && moving && far) { stamp(x, z, heading, i & 1); f.mx = x; f.mz = z; }
    f.down = down;
  }

  function reset() {
    feet.length = 0;
  }

  return {positions, uvs, stamp, step, reset, get count() { return count; }, get cursor() { return cursor; }};
}
