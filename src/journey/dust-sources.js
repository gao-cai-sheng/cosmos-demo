import * as THREE from 'three';
import {NX07_SCALE,ARES} from './landing-support.js';

// Source: exploration-starship/reactor_module.py and README_使用说明.md §05.
// One downward-facing ventral propulsion assembly, NOT four legacy Kestrel engines or five cargo ports.
// Blender centre (0,-1.55,-1.03), aperture radius ~1.3; export maps (x,z,-y)*8*NX07_SCALE.
// The source calls it a field reactor: its gas/plume response remains a visual proxy, not a physical engine model.
export const NX07_DUST_DATUM=Object.freeze({position:[0,-1.03*8*NX07_SCALE,1.55*8*NX07_SCALE],radius:1.3*8*NX07_SCALE});
const origin=new THREE.Vector3(),direction=new THREE.Vector3(),wheel=new THREE.Vector3();
export function emitShipDust(dust,craft,thrust,dt,heightAt){
 if(!(dt>0)||!(thrust>0)||!craft.visible)return;
 craft.updateWorldMatrix(true,false);direction.set(0,-1,0).transformDirection(craft.matrixWorld);
 if(direction.y>-.25)return;
 // Seven samples cover the ONE wide aperture. They are sampling sites, not invented nozzles.
 for(let i=0;i<7;i++){
  const angle=(i-1)*Math.PI/3,r=i?NX07_DUST_DATUM.radius*.62:0;
  origin.fromArray(NX07_DUST_DATUM.position);origin.x+=Math.cos(angle)*r;origin.z+=Math.sin(angle)*r;origin.applyMatrix4(craft.matrixWorld);
  let t=(origin.y-heightAt(origin.x,origin.z))/-direction.y;
  for(let j=0;j<3;j++)t=(origin.y-heightAt(origin.x+direction.x*t,origin.z+direction.z*t))/-direction.y;
  if(t<0||t>120)continue;
  dust.plume('nx07:'+i,{x:origin.x+direction.x*t,y:origin.y,z:origin.z+direction.z*t,height:t,thrust,rateScale:.7,vx:direction.x*12,vz:direction.z*12},dt);
 }
}
export function createVehicleDustSources({dust,heightAt}){
 const histories=new WeakMap();
 return function update(dt,{carrier,carriers=[],rover,roverOnGround,flyer}){
  if(!(dt>0))return;
  for(const craft of [carrier,...carriers].filter(Boolean)){
   if(!craft.ready){histories.delete(craft);continue;}
   const last=histories.get(craft),speed=craft.speed,yaw=craft.heading;
   const turn=last?Math.abs(Math.atan2(Math.sin(yaw-last.heading),Math.cos(yaw-last.heading)))/dt:0;
   const slip=Math.min(1,Math.abs(speed-(last?.speed??speed))/dt*.025+turn*Math.abs(speed)*.06),sign=Math.sign(speed);
   craft.asset.group.updateMatrixWorld(true);
   const count=craft.travel.length,radius=craft.spec?.suspension.wheelY??ARES.radius;
   for(let i=0;i<count;i++){
    craft.asset.parts['wheel.'+i].getWorldPosition(wheel);
    const floor=heightAt(wheel.x,wheel.z),gap=wheel.y-radius-floor;
    dust.wheel((craft.dustId||'ares')+':'+i,{x:wheel.x,y:floor,z:wheel.z,contact:gap<.24&&gap>-.5,speed,slip,load:1,width:.84,vx:Math.sin(yaw)*speed,vz:Math.cos(yaw)*speed,dirX:-Math.sin(yaw)*sign,dirZ:-Math.cos(yaw)*sign},dt);
   }
   histories.set(craft,{speed,heading:yaw});
  }
  if(rover&&roverOnGround){
   rover.root.updateMatrixWorld(true);
   for(let i=0;i<rover.wheels.length;i++){
    const w=rover.wheels[i];w.obj.getWorldPosition(wheel);
    const sign=Math.sign(w.spinVel)||Math.sign(rover.speed),slip=Math.max(w.slipLong,w.slipLat);
    dust.wheel('mu7:'+i,{x:wheel.x,y:wheel.y,z:wheel.z,contact:w.contact,speed:Math.hypot(rover.vel.x,rover.vel.z),spin:Math.abs(w.spinVel)*.335,slip,load:Math.min(1.5,w.load/560),width:.44,vx:rover.vel.x,vz:rover.vel.z,dirX:-rover.forward.x*sign,dirZ:-rover.forward.z*sign},dt);
   }
  }
  emitShipDust(dust,flyer.asset.group,flyer.dustThrust,dt,heightAt);
 };
}
