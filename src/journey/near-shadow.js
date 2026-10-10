import * as THREE from 'three';

/*
 * A second, small sun shadow that follows the viewer.
 * The scene sun keeps its ±420 m map (about 20 cm per texel) for the far field. Near the
 * viewer this ±30 m map (about 1.5 cm per texel) takes over, so pebbles, rock edges and
 * boots cast shadows you can read. The light has zero intensity: only its shadow map is
 * used, and only by materials that call patch(). Everything else keeps the old shadow.
 */
const DIR_SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

// UNROLLED_LOOP_INDEX is replaced by the literal light index when three.js unrolls the
// loop, so these #if lines pick the sun and the near map at compile time. The braces keep
// the local per unrolled copy.
const PATCHED_LINE = `#if ( UNROLLED_LOOP_INDEX == NEAR_SHADOW_MAP )
		directLight.color = vec3( 0.0 );
		#else
		{
		float nearFarShadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#if ( UNROLLED_LOOP_INDEX == NEAR_SHADOW_SUN ) && ( NUM_DIR_LIGHT_SHADOWS > NEAR_SHADOW_MAP )
		nearFarShadow = nearShadowBlend( nearFarShadow );
		#endif
		directLight.color *= nearFarShadow;
		}
		#endif`;

export function createNearShadow({ scene, sun, renderer, radius = 30, distance = 500 }) {
  const mapSize = Math.min(4096, renderer?.capabilities?.maxTextureSize || 4096);
  const light = new THREE.DirectionalLight(0xffffff, 0);
  light.name = 'near-sun-shadow';
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  const cam = light.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = 1; cam.far = distance + 60;
  // Stones are 1–20 cm: a centimetre of bias eats their whole shadow. Depth range is
  // ~560 m, so -0.00001 is about 6 mm; the ground itself casts nothing, so the only
  // acne risk is on rock faces, which PCF softens.
  light.shadow.bias = -0.00001; light.shadow.normalBias = 0.004;
  scene.add(light); scene.add(light.target);

  const uniforms = { uNearShadowOn: { value: 0 } };
  const fragmentOK = THREE.ShaderChunk.lights_fragment_begin.includes(DIR_SHADOW_LINE);
  if (!fragmentOK) console.warn('near-shadow: three.js light loop changed; near shadow disabled');
  const lightsBegin = fragmentOK ? THREE.ShaderChunk.lights_fragment_begin.replace(DIR_SHADOW_LINE, PATCHED_LINE) : null;

  // Directional shadow index = order among visible shadow-casting directional lights,
  // the same order three.js uses (shadow casters are sorted first, stable).
  function indices() {
    const list = [];
    scene.traverseVisible(o => { if (o.isDirectionalLight && o.castShadow) list.push(o); });
    return { sun: list.indexOf(sun), near: list.indexOf(light) };
  }
  const key = () => { const i = indices(); return `near${i.sun}.${i.near}`; };

  function patch(shader) {
    const i = indices();
    if (!lightsBegin || i.sun < 0 || i.near < 0) return;
    shader.uniforms.uNearShadowOn = uniforms.uNearShadowOn;
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', `#include <shadowmap_pars_fragment>
#define NEAR_SHADOW_SUN ${i.sun}
#define NEAR_SHADOW_MAP ${i.near}
uniform float uNearShadowOn;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > NEAR_SHADOW_MAP
float nearShadowBlend( float farShadow ) {
  vec4 c = vDirectionalShadowCoord[ NEAR_SHADOW_MAP ];
  vec2 uv = c.xy / c.w;
  float edge = min( min( uv.x, 1.0 - uv.x ), min( uv.y, 1.0 - uv.y ) );
  float w = uNearShadowOn * smoothstep( 0.0, 0.1, edge );
  if ( w <= 0.0 || ! receiveShadow ) return farShadow;
  DirectionalLightShadow s = directionalLightShadows[ NEAR_SHADOW_MAP ];
  return mix( farShadow, getShadow( directionalShadowMap[ NEAR_SHADOW_MAP ], s.shadowMapSize, s.shadowBias, s.shadowRadius, c ), w );
}
#endif`).replace('#include <lights_fragment_begin>', lightsBegin);
  }

  const up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const sunPos = new THREE.Vector3(), sunTarget = new THREE.Vector3(), snapped = new THREE.Vector3();
  const texel = 2 * radius / mapSize;
  /** focus: world point to centre on. weight 0–1 hands the ground back to the far map. */
  function update(focus, weight = 1) {
    sun.getWorldPosition(sunPos); sun.target.getWorldPosition(sunTarget);
    az.subVectors(sunPos, sunTarget).normalize();
    // Same basis Matrix4.lookAt gives the shadow camera; snapping the focus to whole
    // texels in that plane stops the shadow edges crawling while the viewer moves.
    ax.crossVectors(up, az); if (ax.lengthSq() < 1e-10) ax.set(1, 0, 0); ax.normalize();
    ay.crossVectors(az, ax);
    const fx = Math.round(focus.dot(ax) / texel) * texel, fy = Math.round(focus.dot(ay) / texel) * texel;
    snapped.copy(ax).multiplyScalar(fx).addScaledVector(ay, fy).addScaledVector(az, focus.dot(az));
    light.target.position.copy(snapped);
    light.position.copy(snapped).addScaledVector(az, distance);
    uniforms.uNearShadowOn.value = weight;
  }

  return { light, camera: cam, radius, mapSize, texel, uniforms, patch, key, indices, update };
}
