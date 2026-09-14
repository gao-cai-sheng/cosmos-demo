import * as THREE from 'three';
import {makeDriveInput} from '../../tools/rover/输入.js';
import {createKestrel} from './kestrel-model.js';
import {localToGeo} from './route.js';
import {NX07,solveSupport} from './landing-support.js';

export function createFlyer({scene,camera,canvas,heightAt,blocked,ceilingAt,site,onBoard,onLand,onOrbit,notify}){
 let auto=null,active=false,paused=false,landing=false,transfer=null,speed=0,vertical=0,yaw=0,camYaw=.4,camPitch=.24,distance=110,view=0,grounded=true;
 const pos=new THREE.Vector3(),look=new THREE.Vector3(),asset=createKestrel(),craft=asset.group;craft.visible=false;scene.add(craft);
 const ctl=makeDriveInput(window,{canvas,enabled:false,touch:false,flight:true}),held=new Set();
 const touch=document.createElement('div');touch.className='flight-touch';touch.hidden=true;
 for(const [code,label] of [['forward','前进'],['back','后退'],['left','左转'],['right','右转'],['up','上升'],['down','下降'],['brake','悬停']]){
  const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label','飞行器'+label);b.onpointerdown=e=>{e.preventDefault();held.add(code);b.setPointerCapture(e.pointerId);};for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>held.delete(code));touch.append(b);
 }
 document.body.append(touch);const reset=()=>{held.clear();ctl.reset();};addEventListener('blur',reset);
 const isTouch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
 function syncInput(){ctl.setEnabled(active&&!paused&&!transfer&&!landing);touch.hidden=!(isTouch&&active&&!paused&&!transfer&&!landing);}
 function park(p){if(active||auto)return false;yaw=p.heading||0;craft.position.set(p.x,0,p.z);craft.rotation.set(0,yaw,0);const fit=asset.fitGround(heightAt,blocked,{snap:true});pos.copy(craft.position);grounded=true;craft.visible=true;asset.update(0);return fit.valid;}
 // fromCargo: the crew arrived aboard ARES through the belly lift; takeoff still waits for door closure.
 function start({fromCargo=false}={}){
  if(active)return false;
  if(auto){notify('NX07 正在无人飞行召唤中，请等它降落后再登船。');return false;}
  if(craft.userData.assetState!=='ready'){notify('NX07 模型加载中，请稍候。');return false;}
  if(!asset.doorClosed&&!fromCargo){notify('请先关闭腹舱，等升降平台收妥后登船。');return false;}
  onBoard();active=true;landing=false;if(grounded)speed=vertical=0;transfer=null;camYaw=.4;syncInput();if(!fromCargo)notify('NX07 已就绪。E 垂直起飞，离地后起落架自动收回。');return true;
 }
 function land(){
  if(!active||transfer)return false;
  if(auto?.crewed&&!landing)cancelPilot();
  const fit=solveSupport({x:pos.x,z:pos.z,heading:yaw},heightAt,blocked);
  if(!fit.valid){notify(fit.reason);return false;}
  landing=true;speed=0;asset.prepareLanding?.(heightAt,blocked);asset.deployGear();syncInput();notify('起落架展开，正在垂直降落；四足触地找平后解除舱门锁。');return true;
 }
 function orbit(target=null){if(!active||landing||transfer)return;if(auto?.crewed)cancelPilot();if(pos.y-heightAt(pos.x,pos.z)<600){notify('先上升到离地 600 m，再启动轨道转移。');return;}if(!asset.doorClosed||asset.gearProgress>.001){notify('舱门及起落架尚未收妥。');return;}transfer={elapsed:0,from:pos.y,target};reset();syncInput();}
 // Unmanned summon flight: same interlocks, takeoff, cruise and vertical landing as crewed flight.
 const CRUISE=70,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 // track() is polled every frame: {x,z,heading} = landing spot, {x,z,hover:true,radius} = follow and hold near the operator.
 function fly(track,done){
  if(active||auto||!grounded)return false;
  if(!asset.doorClosed){notify('请先关闭腹舱，再召唤 NX07。');return false;}
  auto={track,done,target:track(0),phase:'lift',wait:0};return !!auto.target;
 }
 // Crewed autopilot (flight plan): same takeoff, terrain following and landing as the summon flight.
 // Any pilot input hands control back. Extra target: {climb:m, heading} holds position, climbs, turns, then calls done.
 function pilot(track,done){
  if(!active||auto||landing||transfer)return false;
  if(grounded&&!asset.doorClosed){notify('请先关闭腹舱，等升降平台收妥。');return false;}
  auto={track,done,target:track(0),phase:grounded?'lift':'cruise',wait:0,crewed:true};
  if(!auto.target){auto=null;return false;}
  return true;
 }
 function cancelPilot(message){if(!auto?.crewed)return false;auto=null;if(message)notify(message);return true;}
 // Arriving from a flight-plan cruise: the ship enters the scene in flight with the gear stowed.
 function spawnAirborne({x,z,heading=0,altitude=600,speed:initial=0}){
  if(active||auto)return false;
  yaw=heading;pos.set(x,heightAt(x,z)+altitude,z);grounded=false;landing=false;transfer=null;speed=initial;vertical=0;
  asset.setFlightPose(0);craft.position.copy(pos);craft.rotation.set(0,yaw,0);craft.visible=true;asset.update(0);return true;
 }
 function autoStep(dt,rest){
  const next=auto.track(dt);if(next)auto.target=next;
  const t=auto.target,dx=t.x-pos.x,dz=t.z-pos.z,dist=Math.hypot(dx,dz);
  if(auto.phase==='lift'){
   if(grounded){if(asset.requestTakeoff()){grounded=false;pos.y=rest+.10;notify(auto.crewed?'按航线自动起飞 · 起落架收回中':'NX07 无人起飞 · 起落架收回中');}else if((auto.wait+=dt)>20){const crewed=auto.crewed;auto=null;notify(crewed?'起飞联锁未解除，自动航线取消。':'NX07 起飞联锁未解除，召唤取消。');}return;}
   vertical=THREE.MathUtils.damp(vertical,30,1.5,dt);pos.y+=vertical*dt;
   if(asset.gearProgress<.001&&pos.y-rest>(t.climb?Math.min(CRUISE,t.climb):t.skim?Math.min(CRUISE,t.agl*.6):CRUISE))auto.phase='cruise';return;
  }
  // Terrain skim (flight-plan departure): hold a heading at speed, following the ground at agl metres.
  if(t.skim){
   yaw+=THREE.MathUtils.clamp(wrap(t.heading-yaw),-.5*dt,.5*dt);
   const aligned=Math.max(0,Math.cos(wrap(t.heading-yaw)));
   speed=THREE.MathUtils.damp(speed,t.speed*aligned,.35,dt);
   pos.x+=Math.sin(yaw)*speed*dt;pos.z+=Math.cos(yaw)*speed*dt;
   followTerrain(dt,rest,t.agl);return;
  }
  if(t.climb){
   const wantY=heightAt(pos.x,pos.z)+t.climb;
   vertical=THREE.MathUtils.damp(vertical,THREE.MathUtils.clamp((wantY-pos.y)*1.2,-40,40),2.4,dt);pos.y+=vertical*dt;
   speed=THREE.MathUtils.damp(speed,0,1.4,dt);pos.x+=Math.sin(yaw)*speed*dt;pos.z+=Math.cos(yaw)*speed*dt;
   yaw+=THREE.MathUtils.clamp(wrap(t.heading-yaw),-.6*dt,.6*dt);
   if(Math.abs(wantY-pos.y)<8&&Math.abs(wrap(t.heading-yaw))<.03){const done=auto.done;auto=null;vertical=0;done?.();}
   return;
  }
  if(t.approach&&dist>=300){
   // Fast skim approach: brake along v = 0.8·√(2·a·d) and ease the skim height down toward the pad
   // (25 m at 300 m, matching the final hover of landing rest + 15 m below).
   const a=t.approach;yaw+=THREE.MathUtils.clamp(wrap(Math.atan2(dx,dz)-yaw),-.6*dt,.6*dt);
   const aligned=Math.max(0,Math.cos(wrap(Math.atan2(dx,dz)-yaw)));
   speed=THREE.MathUtils.damp(speed,Math.min(a.speed,.8*Math.sqrt(2*a.decel*dist))*aligned,3,dt);
   pos.x+=Math.sin(yaw)*speed*dt;pos.z+=Math.cos(yaw)*speed*dt;auto.phase='approach';
   followTerrain(dt,rest,THREE.MathUtils.clamp(dist*.08,25,a.agl));return;
  }
  // Terrain following: look ahead along the track and keep clearance over ground and structures.
  const ahead=Math.min(dist,160),ax=pos.x+Math.sin(yaw)*ahead,az=pos.z+Math.cos(yaw)*ahead;
  const floor=Math.max(rest,landingHeight(ax,az),ceilingAt(ax,az)+NX07.rest,ceilingAt(pos.x,pos.z)+NX07.rest);
  const wantY=floor+(t.hover?40:t.approach?15:auto.phase==='cruise'&&dist>=200?CRUISE:Math.max(15,Math.min(CRUISE,dist*.5)));
  vertical=THREE.MathUtils.damp(vertical,THREE.MathUtils.clamp((wantY-pos.y)*1.2,-40,40),2.4,dt);
  pos.y=Math.max(rest+3,pos.y+vertical*dt);
  if(t.hover){
   // Follow the walking operator; hold station once within the operating radius.
   const away=dist-(t.radius||0);
   if(away>2)yaw+=THREE.MathUtils.clamp(wrap(Math.atan2(dx,dz)-yaw),-.6*dt,.6*dt);
   const aligned=Math.cos(wrap(Math.atan2(dx,dz)-yaw));
   speed=THREE.MathUtils.damp(speed,away>2?Math.min(90,away*.5)*Math.max(0,aligned):0,1.4,dt);
   pos.x+=Math.sin(yaw)*speed*dt;pos.z+=Math.cos(yaw)*speed*dt;auto.phase=dist<200?'approach':'cruise';return;
  }
  const face=dist>3?Math.atan2(dx,dz):t.heading;
  yaw+=THREE.MathUtils.clamp(wrap(face-yaw),-.6*dt,.6*dt);
  const aligned=Math.cos(wrap(Math.atan2(dx,dz)-yaw));
  speed=THREE.MathUtils.damp(speed,dist>3?(t.approach?Math.min(.8*Math.sqrt(2*t.approach.decel*dist),dist*.4):Math.min(90,dist*.4))*Math.max(0,aligned):0,t.approach?3:1.4,dt);
  if(dist>3){pos.x+=Math.sin(yaw)*speed*dt;pos.z+=Math.cos(yaw)*speed*dt;}
  else{const k=Math.min(1,dt*(t.approach?2.5:.8));pos.x+=dx*k;pos.z+=dz*k;speed=0;}
  auto.phase=dist<200?'approach':'cruise';
  if(dist<.3&&Math.abs(wrap(t.heading-yaw))<.01&&Math.abs(pos.y-wantY)<3){
   pos.x=t.x;pos.z=t.z;yaw=t.heading;
   const fit=solveSupport({x:pos.x,z:pos.z,heading:yaw},heightAt,blocked);
   if(!fit.valid){auto.target={x:pos.x,z:pos.z,hover:true,radius:0};notify('NX07 着陆点失效：'+fit.reason+'，继续悬停等待。');return;}
   landing=true;speed=vertical=0;asset.prepareLanding?.(heightAt,blocked);asset.deployGear();syncInput();notify(auto.crewed?'到达着陆点上空，展开起落架垂直降落。':'NX07 到达上空，展开起落架垂直降落。');
  }
 }
 // Hold agl over the highest ground (and structures) ahead: a climb gradient of 0.3 starts the pull-up early.
 function followTerrain(dt,rest,agl){
  // Samples bunch up near the nose (d ∝ i^1.6) where a missed bump matters most.
  const look=Math.max(300,speed*5),grade=.3,ground=heightAt(pos.x,pos.z);let want=ground+agl;
  for(let i=1;i<=16;i++){
   const d=look*Math.pow(i/16,1.6),x=pos.x+Math.sin(yaw)*d,z=pos.z+Math.cos(yaw)*d;
   want=Math.max(want,heightAt(x,z)+agl-d*grade,ceilingAt(x,z)+NX07.rest+agl*.5-d*grade);
  }
  vertical=THREE.MathUtils.damp(vertical,THREE.MathUtils.clamp((want-pos.y)*2,-50,80),4,dt);
  // Never sag below 45 % of the skim height, however sharp the rise.
  pos.y=Math.max(rest+3,ground+agl*.45,pos.y+vertical*dt);
 }
 let cachedGround=null;
 function landingHeight(x,z){if(cachedGround&&Math.hypot(x-cachedGround.x,z-cachedGround.z)<.5&&Math.abs(yaw-cachedGround.yaw)<.01)return cachedGround.y;const y=asset.landingHeight(heightAt,x,z,yaw);cachedGround={x,z,yaw,y};return y;}
 function finishTouchdown(){
  craft.position.copy(pos);craft.rotation.set(0,yaw,0);const fit=asset.fitGround(heightAt,blocked);pos.copy(craft.position);grounded=true;speed=vertical=0;
  if(asset.supportReady){landing=false;reset();syncInput();const crewed=!auto||auto.crewed;if(auto){const done=auto.done;auto=null;done?.();}if(crewed){onLand({x:pos.x,z:pos.z,heading:yaw});notify('四足支撑已锁定，船体找平完成。可离船操作腹舱。');}}
  return fit;
 }
 function update(dt){
  if(paused||document.hidden)return;dt=Math.min(.05,Math.max(0,dt));asset.update(dt);if(!active&&!auto)return;
  const rest=landingHeight(pos.x,pos.z);
  if(auto&&!landing&&!auto.crewed){autoStep(dt,rest);craft.position.copy(pos);craft.rotation.set(grounded?0:THREE.MathUtils.clamp(-speed/650,-.10,.10),yaw,0);return;}
  if(auto?.crewed&&!landing&&!transfer){
   const c=ctl.update(dt);if(c.camCycle)view=1-view;
   camYaw-=c.lookX*.003;camPitch=THREE.MathUtils.clamp(camPitch+c.lookY*.003,-.2,1.2);if(!view&&c.zoom)distance=THREE.MathUtils.clamp(distance*Math.exp(c.zoom*.12),55,750);
   // The input layer reports brake=1 while the window is unfocused, so Space only counts with focus.
   const manual=Math.abs(c.throttle)>.05||Math.abs(c.steer)>.05||c.up||c.down||(c.brake&&document.hasFocus())||held.size>0;
   if(manual)cancelPilot('已转为手动飞行，自动航线取消。');else autoStep(dt,rest);
  }
  else if(transfer){transfer.elapsed+=dt;const t=Math.min(1,transfer.elapsed/7);pos.y=THREE.MathUtils.lerp(transfer.from,160000,t*t*(3-2*t));if(t===1){const target=transfer.target;transfer=null;paused=true;onOrbit({...localToGeo(pos,site),target});return;}}
  else if(landing){
   vertical=-Math.min(110,Math.max(1.2,(pos.y-rest)*.8));pos.y=Math.max(rest,pos.y+vertical*dt);
   if(pos.y<=rest+.01)finishTouchdown();
  }else{
   const c=ctl.update(dt);if(c.camCycle)view=1-view;
   camYaw-=c.lookX*.003;camPitch=THREE.MathUtils.clamp(camPitch+c.lookY*.003,-.2,1.2);if(!view&&c.zoom)distance=THREE.MathUtils.clamp(distance*Math.exp(c.zoom*.12),55,750);
   const up=(c.up&&!c.brake)||held.has('up'),down=c.down||held.has('down'),brake=c.brake||held.has('brake'),boost=c.boost?3:1;
   if(grounded){
    speed=vertical=0;
    if(up&&!brake){if(asset.requestTakeoff()){grounded=false;pos.y=rest+.10;notify('垂直起飞 · 起落架自动收回');}else notify('请等待平台收妥、舱门关闭、起落架完成找平。');}
   }
   if(!grounded){
    const throttle=held.has('forward')?1:held.has('back')?-1:c.throttle,steering=held.has('right')?1:held.has('left')?-1:c.steer;
    // No lateral travel until the splayed legs clear the ground and have retracted.
    const cruise=asset.gearProgress<.001&&pos.y-rest>3;
    if(cruise)yaw-=steering*dt*.6;
    speed=THREE.MathUtils.damp(speed,!cruise||brake?0:throttle*90*boost,brake?4:1.4,dt);
    vertical=THREE.MathUtils.damp(vertical,brake?0:((up?1:0)-(down?1:0))*80*boost,2.4,dt);
    if(down&&pos.y-rest<24){const fit=solveSupport({x:pos.x,z:pos.z,heading:yaw},heightAt,blocked);if(fit.valid){landing=true;asset.prepareLanding?.(heightAt,blocked);asset.deployGear();speed=0;syncInput();}else {vertical=Math.max(0,vertical);notify(fit.reason);}}
    const nx=pos.x+Math.sin(yaw)*speed*dt,nz=pos.z+Math.cos(yaw)*speed*dt,surface=Math.max(landingHeight(nx,nz),ceilingAt(nx,nz)+NX07.rest);
    if(Math.abs(nx)<180000&&Math.abs(nz)<180000&&pos.y+vertical*dt>=surface){pos.x=nx;pos.z=nz;}else speed=0;
    pos.y=Math.max(rest+.10,Math.min(180000,pos.y+vertical*dt));
   }
  }
  craft.position.copy(pos);craft.rotation.set(grounded?0:THREE.MathUtils.clamp(-speed/650,-.10,.10),yaw,0);
  if(!active)return;
  const az=yaw+camYaw;
  camera.position.set(pos.x-Math.sin(az)*distance*Math.cos(camPitch),pos.y+Math.sin(camPitch)*distance+10,pos.z-Math.cos(az)*distance*Math.cos(camPitch));camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+2);look.copy(pos).y+=3;
  if(view){camera.position.set(pos.x+Math.sin(yaw)*36,pos.y+12,pos.z+Math.cos(yaw)*36);look.set(camera.position.x+Math.sin(az)*100,camera.position.y-Math.sin(camPitch-.24)*80,camera.position.z+Math.cos(az)*100);}
  camera.lookAt(look);camera.fov=view?68:60;camera.updateProjectionMatrix();
 }
 return {asset,start,park,fly,pilot,cancelPilot,spawnAirborne,get summoning(){return !!auto&&!auto.crewed;},get piloting(){return !!auto?.crewed;},land,orbit,update,cycle(){view=1-view;},hold(id,value){if(!value)held.delete(id);else if(active&&!paused&&!landing&&!transfer&&['up','down','brake'].includes(id))held.add(id);},hover(){if(active&&!paused&&!landing&&!transfer){cancelPilot('已转为手动飞行，自动航线取消。');reset();speed=vertical=0;notify('主动悬停：已制动水平与垂直速度。');}},get verticalSpeed(){return vertical;},get grounded(){return grounded&&asset.supportReady;},get view(){return view?'前向视野':'跟随视野';},get active(){return active;},get position(){return pos;},get heading(){return yaw;},get speed(){return speed;},get altitude(){return grounded?0:Math.max(0,pos.y-heightAt(pos.x,pos.z));},get transferring(){return !!transfer;},get landing(){return landing;},setPaused(v){paused=v;reset();syncInput();},leave(){if(!active||landing||transfer||!grounded||!asset.supportReady||Math.abs(speed)>.5)return false;active=false;reset();syncInput();return true;}};
}
