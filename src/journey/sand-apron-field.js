// Shape constants and rock selection for sand-aprons.js. Pure (no three.js) for tests.
// Lengths are in rock radii except maxHeight (metres, the top of the 8-bit height range).
export const APRON = {
  apron: 1.9,       // sand around the base fades out by 1.9 radii
  tail: 4.5,        // wind tail length downwind
  height: .2,       // peak sand height = 0.2 × rock radius
  maxHeight: .3,
};

/**
 * rocks: flat [x, z, radius, ...]. Writes the rocks whose sand can reach the square of
 * half-size `radius` around (cx, cz) into out as [x, z, radius, ...]; returns the count.
 */
export function apronRocksNear(rocks, cx, cz, radius, out, cap) {
  let n = 0;
  const reach = Math.max(APRON.apron, APRON.tail);
  for (let i = 0; i < rocks.length && n < cap; i += 3) {
    const x = rocks[i], z = rocks[i + 1], r = rocks[i + 2], m = radius + r * reach;
    if (Math.abs(x - cx) > m || Math.abs(z - cz) > m) continue;
    out[n * 3] = x; out[n * 3 + 1] = z; out[n * 3 + 2] = r;
    n++;
  }
  return n;
}
