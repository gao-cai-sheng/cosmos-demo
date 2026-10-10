// Metres; +Y up, +Z bow. All interlocks consume these same physical dimensions.
import {NX07_EXPORT_SCALE,NX07_PORTS} from './nx07-dimensions.js';
import {HOME_APRON_EDGE_X,HOME_SITE} from './outpost-layout.js';
// Hull size relative to the original 8 m/unit export. D87: every aperture and lift
// clears a 1.2x ARES envelope. Must equal NX07_UNIT/8 in export_assets.py.
// Ship geometry scales with it; vehicle-sized limits (ARES lane, dock tolerances) do not.
export const NX07_SCALE = NX07_EXPORT_SCALE;
const K = NX07_SCALE;
// How close the operator must walk before NX07 answers; scales with the hull.
export const SHIP_BOARD = 64 * NX07_SCALE;
// stroke: leg levelling range, 10 m at 1x as evaluated in D24. With the 1.5x hull the old 6 m left no
// landing site near the default and test starts (D29 measurement), so the D24 value is adopted.
// deck: stowed main lift top, above the thickest closed hinged door under its footprint
// (manifest skin_max_under_platform -4.268 + door 0.15 + gap 0.10 + deck plate 0.18).
export const NX07 = Object.freeze({beam:74.15*K,length:85.47*K,bottom:-8.25*K,rest:10.5*K,stroke:10*K,deck:NX07_PORTS[0].deck,port:{x:0,z:NX07_PORTS[0].z,width:NX07_PORTS[0].w,length:NX07_PORTS[0].d},exitZ:-51*K});
// Scene NX07 base for the first landing and route arrivals. The outpost stands at HOME_SITE with its
// door facing west (surface-refuge.js); NX07 sets down due west of it, level with the door, with
// 40 m of open ground between its hull side (38 m half-width at 1x) and the edge of the outpost's
// graded apron. That edge is the fixed anchor (HOME_APRON_EDGE_X): the outpost grows away from it
// (D61, D69), so this point has not moved since D61. Crew step out on that side.
export const SHIP_APRON_GAP = 40;
export const ARRIVAL_BASE = Object.freeze({x:HOME_APRON_EDGE_X-SHIP_APRON_GAP-38*K,z:HOME_SITE.z,heading:0});
// width: tyre outer faces at ride height after the D31 double-wishbone widening (was 5.105).
export const ARES = Object.freeze({width:6.444,height:5.407,length:9.967,minZ:-5.307,maxZ:4.660,radius:1.045});
export const FEET = Object.freeze([[-14,-4,-23,-15],[14,-4,23,-15],[-21,26,-29,33],[21,26,29,33]].map(([ax,az,x,z])=>({ax:ax*K,az:az*K,x:x*K,z:z*K})));
// ARES drive-on loading pad: origin offset from the lift clamp point (ship-local, +z bow).
// Vehicle-sized docking tolerances stay fixed as the main deck grows.
export const LOAD_PAD = Object.freeze({x:0,z:NX07.port.z,tolX:2,tolFront:4,tolBack:4,stopSpeed:.3,brakeRate:18});
export const ARES_FOOTPRINT = Object.freeze({hw:ARES.width/2,hl:ARES.length/2,oz:(ARES.minZ+ARES.maxZ)/2});
export function dockStatus(o,speed=0){
 const inZone=Number.isFinite(o.x)&&Number.isFinite(o.z)&&Number.isFinite(o.yaw)&&Math.abs(o.x)<=LOAD_PAD.tolX&&o.z<=LOAD_PAD.tolFront&&o.z>=-LOAD_PAD.tolBack;
 // Driver faces the bow: ship-local +x is the driver's left.
 return {inZone,ready:inZone&&Math.abs(speed)<LOAD_PAD.stopSpeed,ahead:-o.z,right:o.x,yawDeg:o.yaw*180/Math.PI};
}
export function worldXZ(p,x,z){const c=Math.cos(p.heading||0),s=Math.sin(p.heading||0);return {x:p.x+x*c+z*s,z:p.z-x*s+z*c};}
export function solveSupport(p,heightAt,blocked=()=>false){
 const world=(x,z)=>worldXZ(p,x,z),sample=(x,z)=>{const q=world(x,z);return heightAt(q.x,q.z);};
 let highest=-Infinity;
 for(let x=-36*K;x<=36*K;x+=4*K)for(let z=-42*K;z<=45*K;z+=4*K)highest=Math.max(highest,sample(x,z));
 const feet=FEET.map(f=>{const q=world(f.x,f.z),y=heightAt(q.x,q.z),dx=(heightAt(q.x+.6,q.z)-heightAt(q.x-.6,q.z))/1.2,dz=(heightAt(q.x,q.z+.6)-heightAt(q.x,q.z-.6))/1.2;return {...f,...q,localX:f.x,localZ:f.z,y,dx,dz,slope:Math.atan(Math.hypot(dx,dz))*180/Math.PI,blocked:[[-1,-1],[1,-1],[-1,1],[1,1],[0,0]].some(([x,z])=>blocked(q.x+x,q.z+z))};});
 const heights=feet.map(f=>f.y),spread=Math.max(...heights)-Math.min(...heights);
 const height=highest+NX07.rest;
 const valid=Number.isFinite(height)&&feet.every(f=>Number.isFinite(f.y)&&!f.blocked&&f.slope<=16)&&spread<=NX07.stroke&&height-Math.min(...heights)<=NX07.rest+NX07.stroke;
 return {height,feet,spread,valid,reason:valid?'四足触地 · 船体水平 · 支撑已锁定':feet.some(f=>f.blocked)?'支脚区域有障碍，请换位':feet.some(f=>f.slope>16)?'支脚下坡度过陡，请换位':'地面高差超过起落架行程，请换位'};
}
export function checkUnloadTerrain(p,heightAt,blocked=()=>false){
 const at=(x,z)=>{const q=worldXZ(p,x,z);return {h:heightAt(q.x,q.z),blocked:blocked(q.x,q.z)};};
 // Lift deck corners scale with the ship; the corridor rows below stay ARES-lane wide.
 const pz=NX07.port.z,corners=[[-3.2*K,pz-5.7*K],[3.2*K,pz-5.7*K],[-3.2*K,pz+5.7*K],[3.2*K,pz+5.7*K]].map(([x,z])=>at(x,z).h);
 if(corners.some(h=>!Number.isFinite(h))||Math.max(...corners)-Math.min(...corners)>.65)return {ok:false,reason:'升降平台下方地面高差过大，请换位'};
 let previous=null;
 for(let z=NX07.exitZ-5;z<=-K;z+=1.5){const row=[-3.2,0,3.2].map(x=>at(x,z)),hs=row.map(v=>v.h);
  if(row.some(v=>v.blocked))return {ok:false,reason:'升降平台或出车通道有障碍，请换位'};
  if(hs.some(h=>!Number.isFinite(h))||Math.max(...hs)-Math.min(...hs)>.8)return {ok:false,reason:'卸载通道横坡过大，请换位'};
  if(previous&&hs.some((h,i)=>Math.abs(h-previous[i])>1.5*Math.tan(16*Math.PI/180)))return {ok:false,reason:'卸载通道纵坡过大，请换位'};
  previous=hs;
 }
 return {ok:true,reason:'四足锁定 · 船体水平 · 卸载通道畅通'};
}
// The enlarged secondary lifts need their own level patches; do not relax the 1.2 m gate.
export function checkCrewLiftTerrain(p,index,heightAt){
 const port=NX07_PORTS[index];if(!port||index===0)return {ok:false,reason:'没有这个舱口'};
 const w=port.w-.4,d=port.d-.4;let low=Infinity,high=-Infinity;
 for(const x of [-w*.45,0,w*.45])for(const z of [-d*.45,0,d*.45]){const q=worldXZ(p,port.x+x,port.z+z),h=heightAt(q.x,q.z);low=Math.min(low,h);high=Math.max(high,h);}
 if(!Number.isFinite(low)||!Number.isFinite(high))return {ok:false,reason:`${index+1} 号平台下方没有地形数据`};
 if(high-low>1.2)return {ok:false,reason:`${index+1} 号平台下方地面高差 ${(high-low).toFixed(1)} m，平台无法放平`};
 return {ok:true,reason:`${index+1} 号舱口可开启`};
}
// Select a real nearby landing patch; never relax the support or unloading gates.
export function findLandingSite(origin,heightAt,blocked=()=>false){
 const yaw=origin.heading||0;
 function evaluate(x,z){
  for(const turn of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   const p={x:origin.x+x,z:origin.z+z,heading:yaw+turn};
   if(!checkUnloadTerrain(p,heightAt,blocked).ok||!solveSupport(p,heightAt,blocked).valid||NX07_PORTS.some((_,i)=>i>0&&!checkCrewLiftTerrain(p,i,heightAt).ok))continue;
   let occupied=false;
   for(let x=-36*K;x<=36*K&&!occupied;x+=8*K)for(let z=-42*K;z<=45*K;z+=8*K){const q=worldXZ(p,x,z);if(blocked(q.x,q.z)){occupied=true;break;}}
   if(!occupied)return p;
  }
  return null;
 }
 const first=evaluate(0,0);if(first)return first;
 // A coarse polar search misses small flat benches between procedural ridges.
 // Expanding grid rings keep the selected site close to the expedition. Ring spacing scales with
 // the hull (20 m at 1x) so a larger ship searches proportionally farther for the same cost.
 for(let ring=1;ring<=60;ring++){
  for(let edge=-ring;edge<=ring;edge++)for(const [x,z] of [[edge,-ring],[edge,ring],[-ring,edge],[ring,edge]]){
   const found=evaluate(x*20*K,z*20*K);if(found)return found;
  }
 }

 return null;
}
/** Deterministic gear/door interlock; flight never inherits a parked leg pose. */
export function createLandingInterlock(){
 let gear=0,door=0,gearTarget=0,doorTarget=0,grounded=false,valid=false,busy=false;
 const api={
  get gear(){return gear;},get door(){return door;},get grounded(){return grounded;},
  get stable(){return grounded&&valid&&gear>=.999;},get closed(){return door<.001&&doorTarget===0&&!busy;},
  get ready(){return api.stable&&door>=.999&&doorTarget===1;},get busy(){return busy;},
  get label(){return !grounded?(gear>.001?'起落架收放中':'起落架已收回'):!valid?'地形超出找平范围':gear<.999?'起落架展开 / 找平中':door>0?'起落架锁定 · 舱门开启':'起落架锁定 · 舱门关闭';},
  ground(v,fit=true){grounded=v;valid=fit;if(v)gearTarget=1;else{doorTarget=0;if(!busy&&door===0)gearTarget=0;}},
  deploy(){gearTarget=1;},
  open(v){if(v&&!api.stable||busy)return false;doorTarget=v?1:0;return true;},
  lockCargo(v){if(v&&!api.ready)return false;busy=v;return true;},
  takeoff(){if(!api.closed||!api.stable)return false;grounded=false;valid=false;gearTarget=0;return true;},
  snapPark(fit=true){grounded=true;valid=fit;gear=gearTarget=1;door=doorTarget=0;busy=false;},
  flightPose(fraction=0){if(busy)return false;grounded=false;valid=false;door=doorTarget=0;gear=gearTarget=Math.max(0,Math.min(1,fraction));return true;},
  update(dt){dt=Math.max(0,Math.min(dt,.1));const move=(v,t,s)=>Math.abs(t-v)<=dt*s?t:v+Math.sign(t-v)*dt*s;gear=move(gear,gearTarget,1/3);if(!grounded&&door===0&&!busy&&gearTarget!==1)gearTarget=0;door=move(door,doorTarget,1/2.5);}
 };return api;
}
