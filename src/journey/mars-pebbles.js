import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { PEBBLE_TIERS, createPebbleField } from './pebble-field.js';
import { createMarsRockMaterial } from './mars-rock-material.js';

// Visual only: no collision, no height change. Stones sit on the rendered terrain mesh.
const CAPACITY = [14000, 12000, 2000];
// sRGB base colours near the dust albedo (terrain dust ≈ .66/.47/.33): most stones are
// coated; the per-stone tint makes a third of them dark basalt.
const TIER_STYLE = [
  { detail: 0, color: [.60, .45, .34], lumpy: .22, cuts: 2 },   // grit
  { detail: 1, color: [.56, .43, .34], lumpy: .20, cuts: 4 },
  { detail: 2, color: [.52, .43, .36], lumpy: .16, cuts: 5 },   // cobbles, near the scattered rocks
];
const MAX_HEIGHT = 30;                                 // camera metres above ground

function hash3(x, y, z, s) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 17.3) * 43758.5453;
  return v - Math.floor(v);
}
function noise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    v += hash3(ix + dx, iy + dy, iz + dz, s) * (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
  }
  return v;
}
// Sub-angular: rounded lumps cut by a few flat breaks. Radius 1, centred on the origin.
function pebbleGeometry(detail, lumpy, cutCount, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const cuts = Array.from({ length: cutCount }, (_, i) => ({
    n: new THREE.Vector3(hash3(i, 1, 0, seed) - .5, hash3(i, 2, 0, seed) - .5, hash3(i, 3, 0, seed) - .5).normalize(),
    d: .72 + .16 * hash3(i, 4, 0, seed),
  }));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = 1 + lumpy * (noise3(x * 1.3 + 2, y * 1.3, z * 1.3, seed) - .5) * 2 + lumpy * .4 * (noise3(x * 3.1, y * 3.1 + 5, z * 3.1, seed + 1) - .5);
    for (const c of cuts) { const dot = x * c.n.x + y * c.n.y + z * c.n.z; if (dot > 0) n = Math.min(n, c.d / dot); }
    p.setXYZ(i, x * n, y * n, z * n);
  }
  return toCreasedNormals(g, .6);
}

// Shrink each stone into the ground towards the edge of its tier, so the field has no rim.
// While the terrain mesh blends from its old surface to a rebuilt one (terrain-follow.js), each stone
// rides the same blend: aLift is how much higher the old surface was under it.
function fadeShader(shader, u) {
  shader.uniforms.uPebbleFocus = u.focus; shader.uniforms.uPebbleFade = u.fade; shader.uniforms.uTerrainMorph = u.morph;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
uniform vec3 uPebbleFocus;
uniform vec2 uPebbleFade;
uniform float uTerrainMorph;
attribute float aLift;`).replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
mvPosition.xyz += ( viewMatrix * vec4( 0.0, aLift * uTerrainMorph, 0.0, 0.0 ) ).xyz;
gl_Position = projectionMatrix * mvPosition;
#endif`).replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 pebbleCentre = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  transformed *= 1.0 - smoothstep( uPebbleFade.x, uPebbleFade.y, distance( pebbleCentre.xz, uPebbleFocus.xz ) );
}
#endif`);
}

// follow: { uTerrainMorph, liftAt(x, z) } from the terrain follower (optional).
export function createPebbles({ heightAt, nearShadow = null, seed = 1, debug = 'beauty', groundColor = null, follow = null }) {
  const morph = follow?.uTerrainMorph || { value: 0 };
  const group = new THREE.Group(); group.name = 'near-pebbles';
  const field = createPebbleField({ heightAt, seed });
  const fwd = new THREE.Vector3(), eye = new THREE.Vector3();
  const tiers = PEBBLE_TIERS.map((tier, ti) => {
    const style = TIER_STYLE[ti];
    const u = { focus: { value: new THREE.Vector3() }, fade: { value: new THREE.Vector2() }, morph };
    // Fade ends one rebuild step inside the radius: a stone the last rebuild left out is
    // already fully shrunk wherever the focus has moved since.
    u.fade.value.set(tier.radius * .7, tier.radius - tier.rebuild - .1);
    const color = new THREE.Color().setRGB(...style.color, THREE.SRGBColorSpace);
    // Stones are buried 28–58 % (pebble-field.js): on average the ground is 0.14 of the
    // vertical radius below the centre.
    const material = createMarsRockMaterial({ color, debug, nearShadow, key: 'pebble', onShader: s => fadeShader(s, u), ground: groundColor ? { offset: -.14, color: groundColor } : null });
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = s => fadeShader(s, u);
    depth.customProgramCacheKey = () => 'pebble-depth-fade-lift';
    const mesh = new THREE.InstancedMesh(pebbleGeometry(style.detail, style.lumpy, style.cuts, seed + ti * 31), material, CAPACITY[ti]);
    mesh.name = 'pebbles-' + tier.name;
    mesh.frustumCulled = false;                        // always around the camera
    mesh.receiveShadow = true;
    mesh.castShadow = !!nearShadow;
    mesh.customDepthMaterial = depth;
    // The far sun map is 20 cm per texel: a pebble there is a random dark blotch.
    // Draw stones into the near map only.
    if (nearShadow) {
      mesh.onBeforeShadow = (r, o, c, shadowCamera, geometry) => { if (shadowCamera !== nearShadow.camera) geometry.drawRange.count = 0; };
      mesh.onAfterShadow = (r, o, c, s, geometry) => { geometry.drawRange.count = Infinity; };
    }
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.geometry.setAttribute('aLift', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY[ti]), 1));
    mesh.count = 0;
    group.add(mesh);
    return { tier, mesh, u, tints: new Float32Array(CAPACITY[ti] * 3), last: null, count: 0 };
  });

  const focus = new THREE.Vector3();
  let rebuilds = 0;
  /** Call once per frame before rendering. Returns the pebble focus (world). */
  function update(camera) {
    camera.getWorldPosition(eye); camera.getWorldDirection(fwd);
    const above = eye.y - heightAt(eye.x, eye.z);
    group.visible = above < MAX_HEIGHT;
    for (const t of tiers) {
      const fx = eye.x + fwd.x * t.tier.ahead, fz = eye.z + fwd.z * t.tier.ahead;
      t.u.focus.value.set(fx, 0, fz);
      if (!group.visible) continue;
      if (t.last && Math.hypot(fx - t.last.x, fz - t.last.z) < t.tier.rebuild) continue;
      const m = t.mesh, cap = CAPACITY[PEBBLE_TIERS.indexOf(t.tier)];
      const n = field.collect(PEBBLE_TIERS.indexOf(t.tier), fx, fz, m.instanceMatrix.array, t.tints, cap);
      m.instanceColor.array.set(t.tints.subarray(0, n * 3));
      m.count = n; t.count = n; t.last = { x: fx, z: fz };
      const lift = m.geometry.attributes.aLift, M = m.instanceMatrix.array;
      for (let k = 0; k < n; k++) lift.array[k] = follow ? follow.liftAt(M[k * 16 + 12], M[k * 16 + 14]) : 0;
      for (const attr of [m.instanceMatrix, m.instanceColor, lift]) {
        attr.clearUpdateRanges(); attr.addUpdateRange(0, n * attr.itemSize); attr.needsUpdate = true;
      }
      rebuilds++;
    }
    const p = tiers[1].u.focus.value;
    return focus.set(p.x, heightAt(p.x, p.z), p.z);
  }
  function stats() {
    return { visible: group.visible, counts: Object.fromEntries(tiers.map(t => [t.tier.name, t.count])), cells: field.generated, rebuilds,
      triangles: tiers.reduce((s, t) => s + t.count * t.mesh.geometry.attributes.position.count / 3, 0) };
  }
  /** The ground mesh under the stones was rebuilt (terrain-follow.js): sit them on the new surface. */
  function regrade() { field.clear(); for (const t of tiers) t.last = null; }
  function dispose() {
    for (const t of tiers) { t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.mesh.customDepthMaterial.dispose(); t.mesh.dispose(); }
    field.clear();
  }
  return { group, update, stats, regrade, dispose };
}
