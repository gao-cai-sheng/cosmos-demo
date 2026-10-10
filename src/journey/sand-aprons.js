import * as THREE from 'three';
import { WIND } from './mars-wind.js';
import { apronRocksNear, APRON } from './sand-apron-field.js';

/*
 * Sand piled around rock bases and the wind tail behind each rock, drawn into a small
 * top-down map that follows the viewer (±radius metres). The ground material reads it for
 * colour, roughness and shading slope; the terrain height and all contact stay as they are.
 * R: sand height / APRON.maxHeight, G: sand cover 0–1. Max-blended, so overlaps merge.
 */
export function createSandAprons({ renderer, rocks = new Float32Array(0), radius = 24, size = 1024 }) {
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  target.texture.name = 'sand-aprons';
  const cap = 4096;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const rock = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);   // x, z, radius
  geometry.setAttribute('rock', rock);
  geometry.instanceCount = 0;
  const uniforms = {
    uCentre: { value: new THREE.Vector2() }, uRadius: { value: radius },
    uWind: { value: new THREE.Vector2(WIND.x, WIND.z) },
    uTail: { value: APRON.tail }, uApron: { value: APRON.apron }, uHeight: { value: APRON.height / APRON.maxHeight },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `
      attribute vec3 rock;
      uniform vec2 uCentre, uWind;
      uniform float uRadius, uTail, uApron, uHeight;
      varying vec2 vLocal;
      varying float vHeight;
      void main() {
        vHeight = min(1.0, rock.z * uHeight);            // sand height scales with the rock
        // Quad covers the apron all round plus the tail downwind, in rock radii.
        vec2 side = vec2(-uWind.y, uWind.x);
        float front = uApron, back = max(uApron, uTail);
        vec2 l = vec2(position.x < 0.0 ? -front : back, position.y * uApron);   // (along, across)
        vLocal = l;
        vec2 world = rock.xy + (uWind * l.x + side * l.y) * rock.z;
        gl_Position = vec4((world - uCentre) / uRadius, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform float uTail, uApron;
      varying vec2 vLocal;
      varying float vHeight;
      void main() {
        float along = vLocal.x, across = vLocal.y, d = length(vLocal);
        // Apron: fills to the rock edge (d = 1) and fades out by uApron radii.
        float apron = 1.0 - smoothstep(0.85, uApron, d);
        // Tail: starts at the rock, narrows and thins downwind over uTail radii.
        float t = clamp(along / uTail, 0.0, 1.0);
        float width = 0.95 * pow(1.0 - t, 0.55) + 0.05;
        float tail = step(0.0, along) * (1.0 - smoothstep(0.35 * width, width, abs(across))) * pow(1.0 - t, 1.3);
        float h = max(apron * 0.8, tail * 0.55);
        float cover = max(apron, tail * 0.9);
        gl_FragColor = vec4(h * vHeight, cover, 0.0, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const texel = 2 * radius / size;
  const shared = {
    uApronMap: { value: target.texture }, uApronCentre: { value: new THREE.Vector2(1e9, 1e9) },
    uApronRadius: { value: radius }, uApronMaxHeight: { value: APRON.maxHeight }, uApronOn: { value: 1 }, uApronSize: { value: size },
  };
  let last = null, redraws = 0, count = 0;
  const clear = new THREE.Color(), was = new THREE.Color();

  /** focus: world point to centre on. Redraws only after moving a few metres. */
  function update(focus) {
    // Whole texels, so a redraw lands every splat on the same grid and nothing shimmers.
    const cx = Math.round(focus.x / texel) * texel, cz = Math.round(focus.z / texel) * texel;
    if (last && Math.hypot(cx - last.x, cz - last.z) < 2) return;
    count = apronRocksNear(rocks, cx, cz, radius, rock.array, cap);
    rock.needsUpdate = true; geometry.instanceCount = count;
    uniforms.uCentre.value.set(cx, cz);
    const oldTarget = renderer.getRenderTarget(), oldAlpha = renderer.getClearAlpha(), oldAuto = renderer.autoClear;
    renderer.getClearColor(was);
    renderer.setRenderTarget(target); renderer.setClearColor(clear.setRGB(0, 0, 0), 0); renderer.clear(true, false, false);
    if (count) { renderer.autoClear = false; renderer.render(scene, camera); }
    renderer.setRenderTarget(oldTarget); renderer.setClearColor(was, oldAlpha); renderer.autoClear = oldAuto;
    shared.uApronCentre.value.set(cx, cz);
    last = { x: cx, z: cz }; redraws++;
  }
  /** New rock list [x, z, radius, ...] (world rebuilt); forces a redraw. */
  function setRocks(list) { rocks = list; last = null; }
  function stats() { return { rocks: count, redraws, texel: +texel.toFixed(4), centre: last }; }
  function dispose() { target.dispose(); geometry.dispose(); material.dispose(); }
  return { uniforms: shared, update, setRocks, stats, dispose };
}
