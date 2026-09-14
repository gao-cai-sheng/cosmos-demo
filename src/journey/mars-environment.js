import {daylightClock} from './daylight-clock.js';
import * as THREE from 'three';
import {clamp} from './rover-power.js';
// Artistic 20-minute sol, explicitly accelerated. One direction drives sky, shadows and PV.
export function createMarsEnvironment({scene,state,getPosition}){
 const sun=scene.children.find(o=>o.isDirectionalLight),fills=scene.children.filter(o=>o.isHemisphereLight||o.isAmbientLight);
 const initial=sun?sun.position.clone().sub(sun.target.position).normalize():new THREE.Vector3(-.894,.309,.325);
 const start=Math.PI-Math.asin(clamp(initial.y/.65,-1,1));let phase=start;
 const sky=[];scene.traverse(o=>{if(o.material?.uniforms&&(o.material.uniforms.uHorizon||o.material.uniforms.horizonColor))sky.push(o);});
 const dayTop=new THREE.Color('#55403b'),nightTop=new THREE.Color('#060a13'),dayHorizon=new THREE.Color('#ca8964'),dusk=new THREE.Color('#6d5362'),night=new THREE.Color('#101521');
 const disc=scene.getObjectByName('Sun Disc');
 const spriteCanvas=document.createElement('canvas');spriteCanvas.width=spriteCanvas.height=128;const c=spriteCanvas.getContext('2d'),g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(208,226,255,.45)');g.addColorStop(.12,'rgba(174,208,255,.2)');g.addColorStop(.5,'rgba(154,179,207,.06)');g.addColorStop(1,'rgba(130,160,180,0)');c.fillStyle=g;c.fillRect(0,0,128,128);
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(spriteCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.name='Mars twilight forward scattering';glow.scale.set(6500,6500,1);scene.add(glow);
 const labels={dawn:'晨曦',noon:'正午',dusk:'黄昏',night:'夜晚',auto:'自动晨昏'};
 function set(mode){state.environment=labels[mode]?mode:'auto';}
 function update(dt){if(!sun)return;state.elapsed+=dt;const mode=state.environment||'auto';
  phase=mode==='dawn'?.1:mode==='noon'?Math.PI/2:mode==='dusk'?Math.PI-.1:mode==='night'?Math.PI*1.5:start+state.elapsed/1200*Math.PI*2;
  const elevation=Math.asin(.65*Math.sin(phase)),az=Math.atan2(initial.x,initial.z)+(phase-start)*.7;
  const direction=new THREE.Vector3(Math.sin(az)*Math.cos(elevation),Math.sin(elevation),Math.cos(az)*Math.cos(elevation));
  const daylight=clamp((direction.y+.07)/.35,0,1),twilight=1-clamp(Math.abs(direction.y)/.25,0,1),visible=clamp((direction.y+.025)/.07,0,1);
  const p=getPosition()||{x:0,y:0,z:0};const origin=new THREE.Vector3(p.x,p.y||0,p.z);sun.target.position.copy(origin);sun.position.copy(origin).addScaledVector(direction,1400);sun.shadow.camera.far=3200;sun.shadow.camera.updateProjectionMatrix();sun.intensity=(1.2+daylight*2)*visible;
  sun.color.set('#fff0db').lerp(new THREE.Color('#b8d7ff'),twilight*.35);for(const fill of fills)fill.intensity=.06+daylight*.8;
  const horizon=night.clone().lerp(dayHorizon,daylight).lerp(dusk,twilight*.35),top=nightTop.clone().lerp(dayTop,daylight);
  for(const mesh of sky){const u=mesh.material.uniforms;if(u.uSun)u.uSun.value.copy(direction);if(u.uHorizon)u.uHorizon.value.copy(horizon);if(u.uZenith)u.uZenith.value.copy(top);if(u.horizonColor)u.horizonColor.value.copy(horizon);if(u.topColor)u.topColor.value.copy(top);if(u.floorColor)u.floorColor.value.copy(horizon).multiplyScalar(.45);}
  if(scene.fog)scene.fog.color.copy(horizon);if(disc){disc.position.copy(origin).addScaledVector(direction,330000);disc.visible=direction.y>-.025;}
  glow.position.copy(origin).addScaledVector(direction,28000);glow.material.opacity=twilight*visible;
 }
 return {set,update,get clock(){return daylightClock(phase,state.environment||'auto');},get label(){return labels[state.environment||'auto'];},get elevation(){return Math.asin(.65*Math.sin(phase))*180/Math.PI;}};
}
