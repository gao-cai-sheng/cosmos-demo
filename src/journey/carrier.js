import {LOAD_PAD} from './landing-support.js';
import {SHIP_POWER} from './expedition-energy.js';
import {driveAllowance} from './ares-logistics.js';
import * as THREE from 'three';
import {createAres,ARES_SPEC as SPEC} from './ares-model.js';
import {makeDriveInput} from '../../tools/rover/输入.js';
import {createTyreTracks} from './tyre-tracks.js';
import {createCameraBoom} from './camera-boom.js';

/** Manual drive speeds (m/s). Throttle is a speed command: W → CRUISE, Shift+W → BOOST. */
export const ARES_DRIVE={cruise:14,boost:22,substep:.5};
/** Parking/driving footprint rule: nine samples at ±halfWidth across, -rear…+front along (m), may differ by at most rise (m). */
export const ARES_FOOTPRINT={halfWidth:3,front:4.75,rear:5.4,rise:3.2};
/** 规划路线时把 rise 收紧这么多（米，调试值）。规划的是一条折线，车跟着它开会切弯、偏开几米；
 *  实测高差沿路每米变 0.05–0.1 m，所以留 0.4 m：贴着上限的坡规划时就绕开（D82）。 */
export const ARES_ROUTE_MARGIN=.4;

/** ARES runtime. Model states remain deterministic; motion belongs to integration. */
export function createCarrier({vehicleSpec=SPEC,modelFactory=createAres,footprintSpec=ARES_FOOTPRINT,controlId="carrier-touch-controls",dustId="ares",cargoEnabled=true,scene,camera,canvas,heightAt,blocked,footprintBlocked=()=>false,solidAt=()=>false,rover,notify,onBoard,onSave=()=>{},driveControl=c=>c,cargoOccupied=()=>false,getGrid=()=>null,getShipPoint=()=>null,getCargo=()=>({label:'货位空',massKg:0})}){
 const asset=modelFactory();const root=asset.group;root.visible=false;scene.add(root);
 // Cockpit camera: the seated driver's eye (D46), still looking along the ARES frame rather than the reclined seat.
 const seat=asset.sockets['mount.driver'],eye=new THREE.Vector3().fromArray(vehicleSpec.driver.eye).applyQuaternion(seat.quaternion).add(seat.position);
 const ctl=makeDriveInput(window,{canvas,enabled:false,controlId,shiftBrake:false});
 const position=new THREE.Vector3();let remote=null,active=false,ready=false,paused=false,speed=0,heading=0,orbit=.55,pitch=.27,zoom=17,view=0,loaded=false,savedParent=null,spin=0,saveTime=0,cargoFit=null;
 let charging=false,chargingSource='camp',emptyWarned=false,lowWarned=false;
 const grid=()=>getGrid?.();
 function chargeStatus(source='camp'){
  const g=grid();if(!g?.drive)return {ready:false,reason:'自由探索未启用有限能源账本。'};
  if(!ready||Math.abs(speed)>=.4)return {ready:false,reason:'先按空格停稳ARES。'};
  if(g.drive.energy>=30)return {ready:false,reason:'ARES驾驶电池已充满。'};
  if(source==='ship'){
   const ship=getShipPoint();if(!ship)return {ready:false,reason:'NX07需落地、找平并停稳后供电。'};
   if(Math.hypot(position.x-ship.x,position.z-ship.z)>SHIP_POWER.reach)return {ready:false,reason:'驾驶ARES到NX07供电范围90 m内并停稳。'};
   if(!g.ship||g.ship.energy<=24)return {ready:false,reason:'船电已到24 kWh应急储备；先恢复船载核电补充电量。'};
  }else{
   if(!g.home||Math.hypot(position.x-g.home.x,position.z-g.home.z)>14)return {ready:false,reason:'驾驶ARES到营地配电箱14 m内并停稳。'};
   if(!g.online||g.energy<=8)return {ready:false,reason:'营地需投运且电量高于8 kWh生活储备。'};
  }
  return {ready:true,reason:''};
 }
 function toggleCharge(source='camp'){
  if(paused||document.hidden)return false;
  if(charging){charging=false;notify('ARES供电连接已断开，可以驾驶或起飞。');return true;}
  const status=chargeStatus(source);if(!status.ready){notify(status.reason);return false;}
  chargingSource=source;charging=true;notify(source==='ship'?'NX07 → ARES供电已连接，保留24 kWh船电储备；起飞前须断开。':'营地 → ARES充电已连接；保留8 kWh生活储备。');return true;
 }
 const cameraBoom=createCameraBoom(),cameraProbe=new THREE.Vector3();
 const cargoMin=new THREE.Vector3(...(vehicleSpec.roverCargo||vehicleSpec.cargo).min),cargoMax=new THREE.Vector3(...(vehicleSpec.roverCargo||vehicleSpec.cargo).max),cargoCenter=cargoMin.clone().add(cargoMax).multiplyScalar(.5),cargoSize=cargoMax.clone().sub(cargoMin),cargoPad=new THREE.Vector3(.10,.08,.14);
 const boundsIn=(object,reference)=>{object.updateMatrixWorld(true);reference.updateMatrixWorld(true);const box=new THREE.Box3(),inv=new THREE.Matrix4().copy(reference.matrixWorld).invert(),mat=new THREE.Matrix4();object.traverse(o=>{if(!o.isMesh||!o.visible)return;for(let p=o.parent;p&&p!==object;p=p.parent)if(!p.visible)return;o.geometry.computeBoundingBox();mat.copy(inv).multiply(o.matrixWorld);box.union(o.geometry.boundingBox.clone().applyMatrix4(mat));});return box;};
 const fitCargo=(m,localBox)=>{const size=localBox.getSize(new THREE.Vector3()),usable=cargoSize.clone().sub(cargoPad.clone().multiplyScalar(2));if(size.x>usable.x||size.y>usable.y||size.z>usable.z)return {ok:false,size:size.toArray(),usable:usable.toArray()};const center=localBox.getCenter(new THREE.Vector3());m.root.position.set(cargoCenter.x-center.x,cargoMin.y+cargoPad.y-localBox.min.y,cargoCenter.z-center.z);root.updateMatrixWorld(true);const placed=boundsIn(m.root,root),eps=.015,ok=placed.min.x>=cargoMin.x+cargoPad.x-eps&&placed.max.x<=cargoMax.x-cargoPad.x+eps&&placed.min.y>=cargoMin.y+cargoPad.y-eps&&placed.max.y<=cargoMax.y-cargoPad.y+eps&&placed.min.z>=cargoMin.z+cargoPad.z-eps&&placed.max.z<=cargoMax.z-cargoPad.z+eps;return {ok,min:placed.min.toArray(),max:placed.max.toArray(),size:size.toArray()};};
 const N=vehicleSpec.suspension.axles.length*2;
 const tracks=createTyreTracks({parent:scene,name:'ARES six-wheel tyre tracks',heightAt,wheels:N,width:.84}),wheelWorld=new THREE.Vector3();
 function updateTracks(){const moving=Math.abs(speed)>.05;for(let i=0;i<N;i++){asset.parts['wheel.'+i].getWorldPosition(wheelWorld);tracks.step(i,wheelWorld.x,wheelWorld.z,moving);}}
 const zero={throttle:0,steer:0,brake:1,tc:true};
 const point=(x,z)=>({x:position.x+x*Math.cos(heading)+z*Math.sin(heading),z:position.z-x*Math.sin(heading)+z*Math.cos(heading)});
 function footprint(x,z,yaw=heading,ignoreShip=false,margin=0){
  const F=footprintSpec,heights=[];for(const dx of [-F.halfWidth,0,F.halfWidth])for(const dz of [-F.rear,0,F.front]){const px=x+dx*Math.cos(yaw)+dz*Math.sin(yaw),pz=z-dx*Math.sin(yaw)+dz*Math.cos(yaw);if(blocked(px,pz)||Math.abs(px)>180000||Math.abs(pz)>180000)return null;heights.push(heightAt(px,pz));}
  const low=Math.min(...heights),high=Math.max(...heights);if(high-low>F.rise-margin||(!ignoreShip&&footprintBlocked(x,z,yaw,low,high)))return null;return heights;
 }
 // Quasi-static double-wishbone suspension (D31): each wheel is a preloaded spring that carries
 // one sixth of the weight at ride height, stiffens 40x on the bump stop and lets go past full droop.
 // Solve the body plane (height + roll/pitch slopes) where the wheel forces balance weight and torque.
 const SUS=vehicleSpec.suspension,R=SUS.wheelY,SINK=.035,STOP=40,wheels=[];for(const sg of [1,-1])for(const z of SUS.axles)wheels.push({x:sg*SUS.wheelX,z});
 const meanZ=wheels.reduce((a,w)=>a+w.z,0)/N,travel=new Float64Array(N),wheelCentre=new THREE.Vector3(),ground=new Float64Array(N);
 function contactHeight(w){let h=-Infinity;for(const dx of [-.4,0,.4]){const p=point(w.x+dx,w.z);h=Math.max(h,heightAt(p.x,p.z));}return h+R+SINK;}
 function solveBody(){
  const {bump:B,droop:D}=SUS;let plane=null,modes=Array(N).fill(0);
  for(let it=0;it<8;it++){
   const A=[0,0,0,0,0,0,0,0,0],v=[-N*D,0,-N*D*meanZ];
   for(let i=0;i<N;i++){const m=modes[i];if(m<0)continue;const a=m>0?STOP:1,b=m>0?D+B-STOP*B:D,r=[1,wheels[i].x,wheels[i].z];
    for(let j=0;j<3;j++){v[j]+=(a*ground[i]+b)*r[j];for(let k=0;k<3;k++)A[j*3+k]+=a*r[j]*r[k];}}
   const next=solve3(A,v);if(!next)break;plane=next;let changed=false;
   for(let i=0;i<N;i++){const d=ground[i]-(plane[0]+plane[1]*wheels[i].x+plane[2]*wheels[i].z),m=d>B?1:d<-D?-1:0;if(m!==modes[i]){modes[i]=m;changed=true;}}
   if(!changed)break;
  }
  return plane;
 }
 function solve3(A,v){
  const [a,b,c,d,e,f,g,h,k]=A,det=a*(e*k-f*h)-b*(d*k-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-6)return null;
  return [(v[0]*(e*k-f*h)-b*(v[1]*k-f*v[2])+c*(v[1]*h-e*v[2]))/det,(a*(v[1]*k-f*v[2])-v[0]*(d*k-f*g)+c*(d*v[2]-v[1]*g))/det,(a*(e*v[2]-v[1]*h)-b*(d*v[2]-v[1]*g)+v[0]*(d*h-e*g))/det];
 }
 function pose(){
  for(let i=0;i<N;i++)ground[i]=contactHeight(wheels[i]);
  // Fewer than three supporting wheels cannot hold a plane; keep the last attitude in that case.
  const plane=solveBody()||[position.y+R,Math.tan(root.rotation.z),-Math.tan(root.rotation.x)];
  position.y=plane[0]-R;root.position.copy(position);root.rotation.set(-Math.atan(plane[2]),heading,Math.atan(plane[1]),'YXZ');root.updateMatrixWorld(true);
  for(let i=0;i<N;i++){root.localToWorld(wheelCentre.set(wheels[i].x,R,wheels[i].z));travel[i]=ground[i]-wheelCentre.y;}
  asset.setSuspension(travel);
  if(loaded){const m=rover.model();m.root.getWorldPosition(m.pos);}
 }
 // `restore`: a saved spot was clear of NX07 when it was saved, so it is not checked against the ship
 // again. On a fresh load the hull field may not be baked yet and the check falls back to a box that
 // covers the tail overhang ARES was parked under; the truck then lost its place and its payload (D69).
 function park(p,{restore=false}={}){if(!footprint(p.x,p.z,p.heading||0,restore))return false;position.set(p.x,0,p.z);heading=p.heading||0;ready=true;root.visible=true;pose();tracks.reset();return true;}
 function save(){onSave({x:position.x,z:position.z,heading,loaded});}
 function start(){if(!ready||active)return;remote=null;if(asset.group.userData.assetState!=='ready'){notify('ARES 模型加载中，请稍候。');return;}active=true;cameraBoom.reset();onBoard();ctl.setEnabled(!paused);save();}
 function leave(){if(!active||Math.abs(speed)>.4)return false;active=false;speed=0;ctl.setEnabled(false);save();return true;}
 function dock({restore=false}={}){
  if(!cargoEnabled)return false;
  if(charging)return false;
  if(cargoOccupied()){notify('货位内有水务设备或原料，请先到营地卸货。');return false;}
  const m=rover.model();if(!m||loaded||active&&Math.abs(speed)>.4)return false;
  if(!restore&&(Math.hypot(m.pos.x-position.x,m.pos.z-position.z)>13||Math.abs(m.speed)>.5)){notify('将 MU-7 遥控至运输车 13 m 内并停稳后，再装载。');return false;}
  rover.exit();for(let i=0;i<60;i++)m.step(1/60,zero,m.terrain);
  // Transport configuration: fold every deployable before measuring the payload.
  m.panelTarget=0;m.panelDeploy=0;m.armOut=0;m.armDeploy=0;m.armYaw=0;m.drilling=false;m.mastYaw=0;m.mastPitch=0;m.updateVisuals(0,zero);m.stowWheels?.();m.root.updateMatrixWorld(true);
  const localBox=boundsIn(m.root,m.root);localBox.min.multiply(m.root.scale);localBox.max.multiply(m.root.scale);const localSize=localBox.getSize(new THREE.Vector3()),usable=cargoSize.clone().sub(cargoPad.clone().multiplyScalar(2));
  if(localSize.x>usable.x||localSize.y>usable.y||localSize.z>usable.z){cargoFit={ok:false,size:localSize.toArray(),usable:usable.toArray()};notify('MU-7 当前运输构型超出 ARES 货舱净空，装载已取消。');return false;}
  savedParent=m.root.parent;root.add(m.root);m.root.position.set(0,0,0);m.root.quaternion.identity();root.updateMatrixWorld(true);cargoFit=fitCargo(m,localBox);
  if(!cargoFit.ok){(savedParent||scene).add(m.root);m.placeAt(position.x,position.z,heading);notify('MU-7 未能安全固定在货舱内，装载已取消。');return false;}
  loaded=true;pose();save();notify('MU-7 已切换运输构型并固定在货舱内，可以直接驾驶运输车。');return true;
 }
 function unload(){
  if(!loaded||Math.abs(speed)>.4)return false;const p=point(0,-13);
  for(const dx of [-2.5,0,2.5])for(const dz of [-2.5,0,2.5])if(blocked(p.x+dx,p.z+dz)){notify('车尾没有足够卸载空间，请换一处开阔地。');return false;}
  if(Math.abs(heightAt(p.x+2,p.z)-heightAt(p.x-2,p.z))>1.8||Math.abs(heightAt(p.x,p.z+2)-heightAt(p.x,p.z-2))>1.8){notify('车尾坡度过大，请在平地卸载。');return false;}
  const m=rover.model();(savedParent||scene).add(m.root);loaded=false;cargoFit=null;m.panelDeploy=1;m.panelTarget=1;m.placeAt(p.x,p.z,heading);
  for(let i=0;i<90;i++)m.step(1/60,zero,m.terrain);m.updateVisuals(0,zero);save();notify('探测车已卸至车尾，太阳翼展开，可重新遥控。');return true;
 }
 function cycle(){view=1-view;orbit=view?0:.55;pitch=view?0:.27;cameraBoom.reset();}
 function update(dt){
  if(paused||document.hidden||!Number.isFinite(dt)||dt<=0)return;const energyDt=dt;dt=Math.min(dt,.05);
  if(charging){const status=chargeStatus(chargingSource);if(!status.ready){charging=false;notify('ARES充电停止：'+status.reason);}else{const kwh=chargingSource==='ship'?grid()?.chargeShip?.(energyDt,true):grid()?.chargeDrive?.(energyDt);if(!kwh){charging=false;notify('ARES充电停止：电池已满或供电到达储备底线。');}return;}}
  if(!(active||remote))return;
  // Unmanned summon: an external controller supplies normal drive inputs; no camera takeover.
  const c=active?driveControl(ctl.update(dt),dt):remote(dt,{x:position.x,z:position.z,heading,speed});
  if(active){if(c.camCycle)cycle();orbit-=c.lookX*.003;pitch=THREE.MathUtils.clamp(pitch+c.lookY*.003,-.05,1.1);if(view===0&&c.zoom)zoom=THREE.MathUtils.clamp(zoom*Math.exp(c.zoom*.12),5,240);}
  speed=THREE.MathUtils.damp(speed,c.brake?0:c.throttle*(c.boost?ARES_DRIVE.boost:ARES_DRIVE.cruise),c.brake?(c.dockBrake?LOAD_PAD.brakeRate:8):2,dt);
  // Sub-step at speed so a slow frame cannot hop over a thin obstacle such as the platform guide posts.
  const power=grid()?.drive,manifest=getCargo(),allowed=power?driveAllowance(power,energyDt,manifest.massKg):Infinity;
  if(allowed<=0){speed=0;if(!emptyWarned){notify('ARES驾驶电池耗尽，请用营地或NX07供电补电；不能继续驾驶或召唤。');emptyWarned=true;}}else emptyWarned=false;
  if(Math.abs(speed)*dt>allowed)speed=Math.sign(speed)*allowed/dt;
  let travelled=0;
  const steps=Math.max(1,Math.ceil(Math.abs(speed*dt)/ARES_DRIVE.substep)),h=dt/steps;
  for(let i=0;i<steps;i++){const nextHeading=heading-c.steer*h*.65*Math.min(1,Math.abs(speed)/2),x=position.x+Math.sin(nextHeading)*speed*h,z=position.z+Math.cos(nextHeading)*speed*h;
   if(footprint(x,z,nextHeading)){travelled+=Math.hypot(x-position.x,z-position.z);position.x=x;position.z=z;heading=nextHeading;}else{speed=0;break;}}
  if(power){grid()?.consumeDrive?.(travelled,energyDt,manifest.massKg);const low=grid().drive.energy<6;if(low&&!lowWarned)notify('ARES驾驶电池低于6 kWh，请返回营地或NX07充电。');lowWarned=low;}
  spin=(spin+-speed*dt/1.045)%(Math.PI*2);for(let i=0;i<N;i++)asset.parts['wheel.'+i].rotation.x=spin;pose();updateTracks();
  if(!active){saveTime+=dt;if(saveTime>2){saveTime=0;save();}return;}
  if(view===1){camera.position.copy(root.localToWorld(eye.clone()));const target=root.localToWorld(new THREE.Vector3(eye.x+Math.sin(orbit)*12,eye.y-pitch*4,eye.z+Math.cos(orbit)*12));camera.lookAt(target);camera.fov=68;}
  else{const a=heading+orbit;camera.position.set(position.x-Math.sin(a)*zoom*Math.cos(pitch),position.y+3+Math.sin(pitch)*zoom,position.z-Math.cos(a)*zoom*Math.cos(pitch));camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+1);
   // Driving under the NX07: shorten the boom before it enters the hull or landing gear.
   const look=new THREE.Vector3(position.x,position.y+2.4,position.z),want=camera.position.clone();let safe=1;
   for(let i=1;i<=24;i++){
    cameraProbe.lerpVectors(look,want,i/24);
    if(!solidAt(cameraProbe.x,cameraProbe.y,cameraProbe.z))continue;
    let low=(i-1)/24,high=i/24;
    for(let j=0;j<4;j++){
     const mid=(low+high)/2;cameraProbe.lerpVectors(look,want,mid);
     if(solidAt(cameraProbe.x,cameraProbe.y,cameraProbe.z))high=mid;else low=mid;
    }
    safe=low;break;
   }
   camera.position.lerpVectors(look,want,cameraBoom.update(dt,safe));
   camera.lookAt(position.x,position.y+2.4,position.z);camera.fov=55;}
  camera.updateProjectionMatrix();saveTime+=dt;if(saveTime>2){saveTime=0;save();}
 }
 return {asset,spec:vehicleSpec,footprint:footprintSpec,dustId,park,start,toggleCharge,get charging(){return charging;},get chargingSource(){return chargingSource;},get shipConnected(){return charging&&chargingSource==='ship';},get chargeReady(){return chargeStatus('camp').ready;},chargeStatus,get shipPower(){return grid()?.ship||null;},get drivePower(){return grid()?.drive||null;},get manifest(){return getCargo();},get remote(){return remote;},set remote(fn){remote=active?null:fn||null;if(!remote)speed=Math.abs(speed)<.05?0:speed;},leave,stow(){if(charging||active||Math.abs(speed)>.4)return false;ready=false;root.visible=false;tracks.reset();return true;},canTraverse:(x,z,yaw=heading,margin=0)=>!!footprint(x,z,yaw,false,margin),update,dock,unload,point,save,get active(){return active;},get ready(){return ready;},get position(){return position;},get heading(){return heading;},get speed(){return speed;},get loaded(){return loaded;},get cargoFit(){return cargoFit;},get trackCount(){return tracks.count;},get view(){return view?'驾驶舱':'跟车';},cycle,setPaused(v){paused=v;ctl.setEnabled(active&&!paused);},get travel(){return travel;},get contactHeights(){return ground;},contains(x,z){if(!ready)return false;const dx=x-position.x,dz=z-position.z;return Math.abs(dx*Math.cos(heading)-dz*Math.sin(heading))<footprintSpec.halfWidth+.35&&Math.abs(dx*Math.sin(heading)+dz*Math.cos(heading))<Math.max(footprintSpec.front,footprintSpec.rear)+.15;}};
}
