// Metres; +Y up, +Z bow. All interlocks consume these same physical dimensions.
export const NX07 = Object.freeze({beam:74.15,length:85.47,bottom:-8.25,rest:10.5,stroke:6,deck:-5.75,port:{x:0,z:-8,width:7.84,length:12.64},exitZ:-51});
export const ARES = Object.freeze({width:5.105,height:5.407,length:9.967,minZ:-5.307,maxZ:4.660,radius:1.045});
export const FEET = Object.freeze([[-14,-4,-23,-15],[14,-4,23,-15],[-21,26,-29,33],[21,26,29,33]].map(([ax,az,x,z])=>({ax,az,x,z})));
// ARES drive-on loading pad: origin offset from the lift clamp point (ship-local, +z bow).
// Limits keep the truck on the 7.4 x 12.2 m deck and between guide posts at x ±3.5 m.
export const LOAD_PAD = Object.freeze({x:0,z:-8,tolX:.8,tolFront:1.3,tolBack:.8,tolYaw:.2,stopSpeed:.3});
export const ARES_FOOTPRINT = Object.freeze({hw:ARES.width/2,hl:ARES.length/2,oz:(ARES.minZ+ARES.maxZ)/2});
export function dockStatus(o,speed=0){
 const inZone=Math.abs(o.x)<=LOAD_PAD.tolX&&o.z<=LOAD_PAD.tolFront&&o.z>=-LOAD_PAD.tolBack&&Math.abs(o.yaw)<=LOAD_PAD.tolYaw;
 // Driver faces the bow: ship-local +x is the driver's left.
 return {inZone,ready:inZone&&Math.abs(speed)<LOAD_PAD.stopSpeed,ahead:-o.z,right:o.x,yawDeg:o.yaw*180/Math.PI};
}
export function worldXZ(p,x,z){const c=Math.cos(p.heading||0),s=Math.sin(p.heading||0);return {x:p.x+x*c+z*s,z:p.z-x*s+z*c};}
export function solveSupport(p,heightAt,blocked=()=>false){
 const world=(x,z)=>worldXZ(p,x,z),sample=(x,z)=>{const q=world(x,z);return heightAt(q.x,q.z);};
 let highest=-Infinity;
 for(let x=-36;x<=36;x+=4)for(let z=-42;z<=45;z+=4)highest=Math.max(highest,sample(x,z));
 const feet=FEET.map(f=>{const q=world(f.x,f.z),y=heightAt(q.x,q.z),dx=(heightAt(q.x+.6,q.z)-heightAt(q.x-.6,q.z))/1.2,dz=(heightAt(q.x,q.z+.6)-heightAt(q.x,q.z-.6))/1.2;return {...f,...q,localX:f.x,localZ:f.z,y,dx,dz,slope:Math.atan(Math.hypot(dx,dz))*180/Math.PI,blocked:[[-1,-1],[1,-1],[-1,1],[1,1],[0,0]].some(([x,z])=>blocked(q.x+x,q.z+z))};});
 const heights=feet.map(f=>f.y),spread=Math.max(...heights)-Math.min(...heights);
 const height=highest+NX07.rest;
 const valid=Number.isFinite(height)&&feet.every(f=>Number.isFinite(f.y)&&!f.blocked&&f.slope<=16)&&spread<=NX07.stroke&&height-Math.min(...heights)<=NX07.rest+NX07.stroke;
 return {height,feet,spread,valid,reason:valid?'四足触地 · 船体水平 · 支撑已锁定':feet.some(f=>f.blocked)?'支脚区域有障碍，请换位':feet.some(f=>f.slope>16)?'支脚下坡度过陡，请换位':'地面高差超过起落架行程，请换位'};
}
export function checkUnloadTerrain(p,heightAt,blocked=()=>false){
 const at=(x,z)=>{const q=worldXZ(p,x,z);return {h:heightAt(q.x,q.z),blocked:blocked(q.x,q.z)};};
 const corners=[[-3.2,-13.7],[3.2,-13.7],[-3.2,-2.3],[3.2,-2.3]].map(([x,z])=>at(x,z).h);
 if(corners.some(h=>!Number.isFinite(h))||Math.max(...corners)-Math.min(...corners)>.65)return {ok:false,reason:'升降平台下方地面高差过大，请换位'};
 let previous=null;
 for(let z=NX07.exitZ-5;z<=-1;z+=1.5){const row=[-3.2,0,3.2].map(x=>at(x,z)),hs=row.map(v=>v.h);
  if(row.some(v=>v.blocked))return {ok:false,reason:'升降平台或出车通道有障碍，请换位'};
  if(hs.some(h=>!Number.isFinite(h))||Math.max(...hs)-Math.min(...hs)>.8)return {ok:false,reason:'卸载通道横坡过大，请换位'};
  if(previous&&hs.some((h,i)=>Math.abs(h-previous[i])>1.5*Math.tan(16*Math.PI/180)))return {ok:false,reason:'卸载通道纵坡过大，请换位'};
  previous=hs;
 }
 return {ok:true,reason:'四足锁定 · 船体水平 · 卸载通道畅通'};
}
// Select a real nearby landing patch; never relax the support or unloading gates.
export function findLandingSite(origin,heightAt,blocked=()=>false){
 const yaw=origin.heading||0;
 function evaluate(x,z){
  for(const turn of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   const p={x:origin.x+x,z:origin.z+z,heading:yaw+turn};
   if(!checkUnloadTerrain(p,heightAt,blocked).ok||!solveSupport(p,heightAt,blocked).valid)continue;
   let occupied=false;
   for(let x=-36;x<=36&&!occupied;x+=8)for(let z=-42;z<=45;z+=8){const q=worldXZ(p,x,z);if(blocked(q.x,q.z)){occupied=true;break;}}
   if(!occupied)return p;
  }
  return null;
 }
 const first=evaluate(0,0);if(first)return first;
 // A coarse polar search misses small flat benches between procedural ridges.
 // Expanding 20 m grid rings keep the selected site close to the expedition.
 for(let ring=1;ring<=60;ring++){
  for(let edge=-ring;edge<=ring;edge++)for(const [x,z] of [[edge,-ring],[edge,ring],[-ring,edge],[ring,edge]]){
   const found=evaluate(x*20,z*20);if(found)return found;
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
