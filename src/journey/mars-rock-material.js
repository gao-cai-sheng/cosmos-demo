import * as THREE from 'three';

// Static instanced rocks: metre-based 3D fields have no UV seams or camera swimming.
// nearShadow: createNearShadow() handle; onShader: extra edits (pebble fade); key: cache name.
// ground: { offset, color } — the ground sits `offset` × the instance's vertical scale above
// the instance origin; the bottom of the stone takes the ground's dust colour there (D66).
export function createMarsRockMaterial({ color = '#736255', debug = 'beauty', nearShadow = null, onShader = null, key = '', ground = null } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: 0 });
  const debugUniform = { value: ({ identity: 1, roughness: 2, normal: 3 })[debug] || 0 };
  material.name = 'Mars fractured rock / dust';
  material.userData.rockDebug = debugUniform;
  material.customProgramCacheKey = () => 'mars-rock-v1' + key + (ground ? 'g' : '') + (nearShadow ? nearShadow.key() : '');
  const groundUniforms = ground ? { uRockGroundOffset: { value: ground.offset }, uRockGroundColor: { value: new THREE.Color(ground.color) } } : {};
  material.onBeforeCompile = shader => {
    shader.uniforms.uRockDebug = debugUniform;
    Object.assign(shader.uniforms, groundUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vRockPosition;
varying vec3 vRockNormal;
varying float vRockGround;
uniform float uRockGroundOffset;`).replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
vRockNormal = inverseTransformDirection(transformedNormal, viewMatrix);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 rockPosition = vec4(position,1.0);
#ifdef USE_INSTANCING
rockPosition = instanceMatrix * rockPosition;
#endif
vRockPosition = (modelMatrix * rockPosition).xyz;
vRockGround = 1e3;
#if defined( USE_INSTANCING ) && ${ground ? 1 : 0}
{
  vec3 rockOrigin = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
  float rockUp = length((modelMatrix * instanceMatrix * vec4(0.0,1.0,0.0,0.0)).xyz);
  // Height above the ground, in units of the stone's own vertical size.
  vRockGround = (vRockPosition.y - rockOrigin.y) / rockUp - uRockGroundOffset;
}
#endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRockPosition;
varying vec3 vRockNormal;
uniform float uRockDebug;
varying float vRockGround;${ground ? `
uniform vec3 uRockGroundColor;` : ''}
float rockHash(vec3 p) {
  p = fract(p*.1031); p += dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float rockNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),
    mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),
    mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float rockBand(vec3 p,float footprint,float period) {
  return (rockNoise(p/period)-.5)*(1.0-smoothstep(.16,.5,footprint/period));
}
vec3 rockPerturb(vec3 p,vec3 n,float h) {
  vec3 sx=dFdx(p),sy=dFdy(p),r1=cross(sy,n),r2=cross(n,sx);
  float det=dot(sx,r1);
  return normalize(max(abs(det),1e-10)*n-sign(det)*(dFdx(h)*r1+dFdy(h)*r2));
}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float rockFootprint=max(length(dFdx(vRockPosition)),length(dFdy(vRockPosition)));
float rockStructure=rockBand(vRockPosition+vec3(17,4,31),rockFootprint,.42);
float rockGrain=rockBand(vRockPosition,rockFootprint,.035);
float rockDust=smoothstep(.15,.8,normalize(vRockNormal).y)*.65;
float rockFissure=(1.0-smoothstep(.01,.045,abs(rockStructure)))
  *(1.0-smoothstep(.03,.13,rockFootprint));
vec3 rockTint=mix(vec3(.88,.94,1.02),vec3(1.20,1.04,.85),rockDust);
diffuseColor.rgb *= rockTint*(1.0+rockStructure*.32+rockGrain*.16)*(1.0-rockFissure*.13);
float rockRoughness=clamp(mix(.83,.97,rockDust)+rockGrain*.08,.78,.98);
float rockHeight=(rockStructure*.004+rockGrain*.0015-rockFissure*.001)*(1.0-rockDust*.6);${ground ? `
// Dust skirt: the lowest ~30 % of the stone above the ground is coated like the ground.
float rockSkirt=1.0-smoothstep(0.0,.3,vRockGround);
diffuseColor.rgb=mix(diffuseColor.rgb,uRockGroundColor,rockSkirt*.8);
rockRoughness=mix(rockRoughness,.97,rockSkirt);
rockHeight*=1.0-rockSkirt*.7;` : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=rockRoughness;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal=rockPerturb(-vViewPosition,normal,rockHeight);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
if(uRockDebug>.5 && uRockDebug<1.5) outgoingLight=vec3(1.0-rockDust,rockDust,0);
if(uRockDebug>1.5 && uRockDebug<2.5) outgoingLight=vec3(rockRoughness);
if(uRockDebug>2.5) outgoingLight=normal*.5+.5;
#include <opaque_fragment>`);
    nearShadow?.patch(shader);
    onShader?.(shader);
  };
  return material;
}
