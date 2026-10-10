import * as THREE from 'three';
import { SURFACE_ZONE as Z } from './pebble-field.js';
import { WIND } from './mars-wind.js';

const f = v => Number.isInteger(v) ? v.toFixed(1) : String(v);   // GLSL float literal

// Decimetre wind ripples in the dust (D66 step 4). Metres; height is a multiple of `bump`.
// Crest sits at 72 % of the wavelength: long gentle upwind face, short steep lee face.
export const RIPPLE = { lambda: .17, crest: .72, height: 1.1, sheet: 7.5 };

// Metres, deterministic world coordinates. Shading only: no vertex displacement.
// Zone numbers live in pebble-field.js so the scattered stones follow the same gravel patches.
// nearShadow: createNearShadow() handle; aprons: createSandAprons().uniforms (both optional).
// follow: { uTerrainMorph } — the terrain mesh is rebuilt around the viewer (terrain-follow.js, D68); for 0.6 s after a swap
// the vertices blend from the old surface (attributes aPrevY / aPrevNormal / aPrevColor) to the new one, so the ground does not pop.
export function createMarsSurfaceMaterial({ debug = 'beauty', enabled = true, nearShadow = null, aprons = null, ripples = true, follow = null } = {}) {
  const modes = { beauty: 0, identity: 1, roughness: 2, normal: 3, ripple: 4, apron: 5 };
  const controls = {
    enabled: { value: enabled ? 1 : 0 },
    debug: { value: modes[debug] || 0 },
    scale: { value: 1 },
    bump: { value: 0.010 },
    ripples: { value: ripples ? 1 : 0 },
    wind: { value: new THREE.Vector2(WIND.x, WIND.z) },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  material.name = 'Mars dust / gravel / exposed rock';
  material.userData.surface = controls;
  if (!enabled) return material;
  material.customProgramCacheKey = () => 'mars-surface-v2' + (aprons ? 'a' : '') + (follow ? 'f' : '') + (nearShadow ? nearShadow.key() : '');
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uSurfaceEnabled: controls.enabled, uSurfaceDebug: controls.debug,
      uSurfaceScale: controls.scale, uSurfaceBump: controls.bump,
      uSurfaceRipples: controls.ripples, uSurfaceWind: controls.wind,
    }, aprons || {}, follow || {});
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;${follow ? `
attribute float aPrevY;
attribute vec3 aPrevNormal;
attribute vec3 aPrevColor;
uniform float uTerrainMorph;` : ''}`).replace('#include <color_vertex>', `#include <color_vertex>${follow ? `
vColor.rgb = mix(vColor.rgb, aPrevColor, uTerrainMorph);` : ''}`).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>${follow ? `
objectNormal = normalize(mix(objectNormal, aPrevNormal, uTerrainMorph));` : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>${follow ? `
transformed.y = mix(transformed.y, aPrevY, uTerrainMorph);` : ''}
vSurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSurfaceNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;
uniform float uSurfaceEnabled, uSurfaceDebug, uSurfaceScale, uSurfaceBump, uSurfaceRipples;
uniform vec2 uSurfaceWind;${aprons ? `
#define SURFACE_APRONS
uniform sampler2D uApronMap;
uniform vec2 uApronCentre;
uniform float uApronRadius, uApronMaxHeight, uApronOn, uApronSize;
// Cubic B-spline from four bilinear taps: the height slope is smooth across texels, so the
// shading shows no grid lines where it bends (plain bilinear has a kink every texel).
vec4 apronSample(vec2 uv) {
  vec2 st = uv*uApronSize-.5, i = floor(st), t = fract(st), t2 = t*t, t3 = t2*t;
  vec2 w0 = (1.0-3.0*t+3.0*t2-t3)/6.0, w1 = (4.0-6.0*t2+3.0*t3)/6.0;
  vec2 w2 = (1.0+3.0*t+3.0*t2-3.0*t3)/6.0, w3 = t3/6.0;
  vec2 g0 = w0+w1, g1 = w2+w3;
  vec2 p0 = (i-.5+w1/g0)/uApronSize, p1 = (i+1.5+w3/g1)/uApronSize;
  return g0.y*(g0.x*texture2D(uApronMap,vec2(p0.x,p0.y))+g1.x*texture2D(uApronMap,vec2(p1.x,p0.y)))
       + g1.y*(g0.x*texture2D(uApronMap,vec2(p0.x,p1.y))+g1.x*texture2D(uApronMap,vec2(p1.x,p1.y)));
}` : ''}
float surfaceHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float surfaceNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),
    mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);
}
vec2 surfaceGradient(vec2 p) {
  return normalize(vec2(surfaceHash(p),surfaceHash(p+vec2(71,39)))*2.0-1.0+vec2(.0001));
}
float surfaceMicroNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), w = f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(dot(surfaceGradient(i),f),dot(surfaceGradient(i+vec2(1,0)),f-vec2(1,0)),w.x),
    mix(dot(surfaceGradient(i+vec2(0,1)),f-vec2(0,1)),dot(surfaceGradient(i+vec2(1,1)),f-vec2(1,1)),w.x),w.y);
}
// Each band fades before its spatial period becomes smaller than a few pixels.
float surfaceBand(vec2 p, float footprint, float period) {
  return (surfaceNoise(p / period)-.5) * (1.0-smoothstep(.16,.5,footprint/period));
}
float surfaceMicroBand(vec2 p, float footprint, float period) {
  return surfaceMicroNoise(p/period)*(1.0-smoothstep(.16,.5,footprint/period));
}
// Wind ripple height 0–1. Phase runs downwind; crests bend over metres and kink over
// decimetres so they wander and fork instead of ruling straight lines.
float surfaceRipple(vec2 p, float footprint) {
  vec2 side = vec2(-uSurfaceWind.y, uSurfaceWind.x);
  float along = dot(p, uSurfaceWind), across = dot(p, side);
  float bend = (surfaceNoise(vec2(across/2.3, along/3.1)+vec2(11.0,5.0))-.5)*2.2
    + (surfaceNoise(vec2(across/.45, along/.7)+vec2(3.0,17.0))-.5)*.6;
  float t = fract(along/${f(RIPPLE.lambda)} + bend);
  float h = t < ${f(RIPPLE.crest)} ? t/${f(RIPPLE.crest)} : (1.0-t)/${f(+(1 - RIPPLE.crest).toFixed(4))};
  h = h*h*(3.0-2.0*h);
  // Crests rise and die out along their length instead of running at one height.
  h *= .3 + .7*smoothstep(.2,.8,surfaceNoise(vec2(across/1.1, along/.9)+vec2(7.0,41.0)));
  // Gone by ~4 px per wavelength: a sharp-crested wave any finer turns into moiré.
  return .5 + (h-.5)*(1.0-smoothstep(.07,.25,footprint/${f(RIPPLE.lambda)}));
}
vec3 surfacePerturb(vec3 p, vec3 n, float h) {
  vec3 sx = dFdx(p), sy = dFdy(p);
  vec3 r1 = cross(sy,n), r2 = cross(n,sx);
  float det = dot(sx,r1);
  vec3 gradient = sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
  return normalize(max(abs(det),1e-10)*n-gradient);
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec2 surfaceXZ = vSurfacePosition.xz / uSurfaceScale;
float surfaceFootprint = max(length(dFdx(surfaceXZ)),length(dFdy(surfaceXZ)));
float surfacePatch = .5 + surfaceBand(surfaceXZ+vec2(${f(Z.offsetX)},${f(Z.offsetZ)}),surfaceFootprint,${f(Z.period)});
float surfaceSlope = 1.0-clamp(normalize(vSurfaceNormal).y,0.0,1.0);
float surfaceRock = smoothstep(${f(Z.rockLo)},${f(Z.rockHi)},surfaceSlope) * mix(.55,1.0,surfacePatch);
float surfaceGravel = (1.0-surfaceRock)*smoothstep(${f(Z.gravelLo)},${f(Z.gravelHi)},surfacePatch)*${f(Z.gravelMax)};
float surfaceDust = 1.0-surfaceRock-surfaceGravel;
// Sand piled round rocks and trailing downwind (sand-aprons.js); zero without the map.
float apronHeight = 0.0, apronCover = 0.0;
#ifdef SURFACE_APRONS
vec2 apronUV = (vSurfacePosition.xz-uApronCentre)/(2.0*uApronRadius)+.5;
vec4 apronTexel = apronSample(clamp(apronUV,0.0,1.0));
vec2 apronEdge = min(apronUV,1.0-apronUV);
float apronIn = uApronOn*smoothstep(0.0,.08,min(apronEdge.x,apronEdge.y));
apronHeight = apronTexel.r*uApronMaxHeight*apronIn;
apronCover = apronTexel.g*apronIn;
#endif
vec2 surfaceMicroXZ = mat2(.8,-.6,.6,.8)*surfaceXZ;
float surfaceClods = surfaceMicroBand(surfaceMicroXZ,surfaceFootprint,.24);
float surfaceGrain = surfaceMicroBand(surfaceMicroXZ+vec2(19,4),surfaceFootprint,.045);
// Ripples cover sheets of the dusty ground, not gravel lag, and fade on fresh sand tails.
float rippleSheet = smoothstep(.32,.62,surfaceNoise(surfaceXZ/${f(RIPPLE.sheet)}+vec2(53.0,29.0)));
float rippleMask = uSurfaceRipples*surfaceDust*rippleSheet*(1.0-apronCover);
float rippleH = surfaceRipple(surfaceXZ,surfaceFootprint);
float surfaceSmooth = 1.0-max(rippleMask*.75,apronCover*.8);     // sand buries the lumpy grain
float surfaceDetail = (surfaceClods*.65+surfaceGrain*.35)*surfaceSmooth;
vec3 surfaceTint = surfaceDust*vec3(1.06,1.025,.97)
  +surfaceGravel*vec3(.77,.80,.82)+surfaceRock*vec3(.66,.70,.74);
surfaceTint = mix(surfaceTint,vec3(1.06,1.025,.97)*1.1,apronCover*.85);   // fine bright drift sand
// Coarse grains collect on crests: a touch darker and greyer there.
surfaceTint *= 1.0-(rippleH-.5)*.08*rippleMask;
diffuseColor.rgb *= mix(vec3(1),surfaceTint*(1.0+surfaceDetail*.32),uSurfaceEnabled);
float surfaceRoughness = clamp(mix(surfaceDust*.97+surfaceGravel*.88+surfaceRock*.79,.97,apronCover)
  +surfaceDetail*.06,.76,1.0);
// Gravel lag: the real pebbles (mars-pebbles.js) now carry it, so the painted grain there
// drops from .4 to .1 — at 4.5 cm it was the orange-peel look under a low sun.
float surfaceHeight = uSurfaceBump * ((surfaceClods*(surfaceGravel+surfaceRock*.7)*.7
  +surfaceGrain*(.22+surfaceGravel*.1))*surfaceSmooth + rippleH*rippleMask*${f(RIPPLE.height)})
  + apronHeight;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor,surfaceRoughness,uSurfaceEnabled);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = surfacePerturb(-vViewPosition,normal,surfaceHeight*uSurfaceEnabled);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
if(uSurfaceDebug > .5 && uSurfaceDebug < 1.5) outgoingLight = vec3(surfaceRock,surfaceGravel,surfaceDust);
if(uSurfaceDebug > 1.5 && uSurfaceDebug < 2.5) outgoingLight = vec3(surfaceRoughness);
if(uSurfaceDebug > 2.5 && uSurfaceDebug < 3.5) outgoingLight = normal*.5+.5;
if(uSurfaceDebug > 3.5 && uSurfaceDebug < 4.5) outgoingLight = vec3(rippleMask,rippleH*rippleMask,surfaceGravel);
if(uSurfaceDebug > 4.5) outgoingLight = vec3(apronCover,apronHeight/.1,0.0);
#include <opaque_fragment>`);
    nearShadow?.patch(shader);
  };
  return material;
}
