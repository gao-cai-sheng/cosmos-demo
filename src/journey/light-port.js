import * as THREE from 'three';
import {createAresLight,ARES_LIGHT_SPEC} from './ares-model.js';
import {createCarrier} from './carrier.js';
import {findExit} from './walking.js';
// Measured exported bounds, metres. Experimental second vehicle; no role equipment or mainline ledger.
export const LIGHT_BOUNDS={width:5.90445,length:8.519553,height:5.406203,minZ:-3.86,maxZ:4.659553};
export const LIGHT_FOOTPRINT={halfWidth:3,front:4.7,rear:3.9,rise:3.2};
export const LIGHT_PORT=3; // Port 4: one of the two equal smallest openings.
export function mountLightPort({scene,camera,canvas,flyer,heightAt,blocked,astronaut,notify,canBoard,stopOther,walkBlocked,frozen,saveKey}){
 const ship=flyer.asset,port=ship.ports[LIGHT_PORT],offset=-(LIGHT_BOUNDS.minZ+LIGHT_BOUNDS.maxZ)/2;
 ship.allowVehiclePort(LIGHT_PORT);
 const ghost=createAresLight();ship.registerPortPayload(LIGHT_PORT,ghost,LIGHT_BOUNDS);
 let phase='stowed',clock=0,from=null,capture=false,armed=false,saveDue=0,wasPaused=null,assetsReady=false,restoreAttempted=false,emergency=false;
 const key=saveKey+':light04';let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{}
 const persist=()=>{if(phase==='outside')localStorage.setItem(key,JSON.stringify({outside:true,x:car.position.x,z:car.position.z,heading:car.heading}));else if(phase==='stowed')localStorage.setItem(key,JSON.stringify({outside:false}));};
 const floor=(x,z)=>ship.deckAt(x,z)??heightAt(x,z);
 const footprintBlocked=(x,z,yaw,low,high)=>ship.rectHits(x,z,yaw,{hw:3,hl:LIGHT_BOUNDS.length/2,oz:-offset},low,high,LIGHT_BOUNDS.height)||blocked(x,z);
 const car=createCarrier({scene,camera,canvas,heightAt:floor,blocked,footprintBlocked,solidAt:(x,y,z)=>ship.solidAt(x,y,z),vehicleSpec:ARES_LIGHT_SPEC,modelFactory:createAresLight,footprintSpec:LIGHT_FOOTPRINT,controlId:'light-touch-controls',dustId:'ares-light',cargoEnabled:false,notify,onSave:persist,onBoard(){stopOther();astronaut.stop();},driveControl(input){
  if(emergency){if(Math.abs(car.speed)<.05&&Math.abs(input.throttle)<.01)emergency=false;return {...input,throttle:0,steer:0,brake:1};}
  if(canCapture()){capture=true;return {...input,throttle:0,steer:0,brake:1,dockBrake:true};}return input;
 }});
 function local(){const p=car.position,dx=p.x-flyer.position.x,dz=p.z-flyer.position.z,c=Math.cos(flyer.heading),s=Math.sin(flyer.heading);return {x:dx*c-dz*s,z:dx*s+dz*c,yaw:Math.atan2(Math.sin(car.heading-flyer.heading),Math.cos(car.heading-flyer.heading))};}
 const zone=()=>{const q=local();return Math.abs(q.x-port.x)<=1.2&&Math.abs(q.z-port.z-offset)<=2;};
 const canCapture=()=>armed&&phase==='outside'&&car.active&&flyer.grounded&&ship.supportReady&&ship.portState(LIGHT_PORT).ready&&zone();
 const idle=()=>!frozen()&&flyer.grounded&&ship.supportReady&&!flyer.active&&!flyer.landing&&!flyer.transferring;
 function leave(){if(frozen()||Math.abs(car.speed)>.4){notify('按空格停稳后下车。');return false;}const p=findExit({...car.position,heading:car.heading},7,floor,walkBlocked);if(!p){notify('车旁没有安全落脚点，请驶离后重试。');return false;}if(car.leave()){astronaut.start(p);return true;}return false;}
 function board(){if(phase!=='outside'||!canBoard()||frozen())return false;if(Math.hypot(astronaut.position.x-car.position.x,astronaut.position.z-car.position.z)>8){notify('请步行到 L04 8 米内登车。');return false;}car.start();return car.active;}
 function open(){if(!assetsReady){notify('L04模型加载中，请稍候。');return false;}if(!idle()||!ship.checkPort(LIGHT_PORT).ok){notify(ship.checkPort(LIGHT_PORT).reason||'请先着陆并停稳。');return false;}if(astronaut.active&&ship.underPort(LIGHT_PORT,astronaut.position.x,astronaut.position.z,.8)){notify('请离开 4 号平台下方再收放。');return false;}if(phase==='stowed'){phase='unloading';ship.setPort(LIGHT_PORT,true);notify('4号舱口打开，L04随升降台下降。');return true;}if(phase==='outside'){if(ship.underPort(LIGHT_PORT,car.position.x,car.position.z,5)&&!ship.portState(LIGHT_PORT).ready){notify('请先驶离平台下方，再打开舱口。');return false;}return ship.setPort(LIGHT_PORT,true);}return false;}
 function recover(){if(!idle()||phase!=='outside')return false;if(!ship.portState(LIGHT_PORT).ready){open();notify('平台降到底后，驶入青色内框即可自动回收。');return false;}if(!zone()){notify('驾驶 L04 进入 4号平台中央青色内框，任意朝向均可自动接管。');return false;}armed=true;capture=true;return true;}
 const panel=document.createElement('section');panel.id='light-port-controls';panel.setAttribute('aria-label','L04四轮车实验');panel.style.cssText='position:fixed;left:12px;top:164px;z-index:70;width:min(290px,calc(100vw - 24px));padding:12px;background:#11212aeb;color:#e0eff2;border:1px solid #e79546;border-radius:8px;font:13px system-ui';
 panel.innerHTML='<strong>ARES L04 · 四轮封闭车</strong><p data-status style="margin:8px 0"></p><div style="display:flex;gap:6px;flex-wrap:wrap"><button data-action="release">4号舱口放车</button><button data-action="board">登车 · F</button><button data-action="recover">回收车辆</button></div><small style="display:block;margin-top:8px">WASD驾驶 · 空格刹车 · C视角<br>进入青色内框自动接管；原ARES保留。<br>自由探索试验，专业内装与独立能源未接入。</small>';
 const css=document.createElement('style');css.textContent='@media(max-width:600px){#light-port-controls{top:280px!important;width:min(260px,calc(100vw - 24px))!important;padding:9px!important;font-size:12px!important}#light-port-controls small{display:none!important}}';document.head.append(css);
 document.body.append(panel);const status=panel.querySelector('[data-status]'),release=panel.querySelector('[data-action="release"]'),boarding=panel.querySelector('[data-action="board"]'),recovery=panel.querySelector('[data-action="recover"]');
 release.onclick=open;boarding.onclick=()=>car.active?leave():board();recovery.onclick=recover;
 const glow=new THREE.Group();glow.name='L04 automatic capture region';ship.platforms[LIGHT_PORT].group.add(glow);const mat=new THREE.MeshBasicMaterial({color:0x46e6ff,fog:false,toneMapped:false});for(const [w,d,x,z] of [[2.4,.08,0,2+offset],[2.4,.08,0,-2+offset],[.08,4,1.2,offset],[.08,4,-1.2,offset]]){const m=new THREE.Mesh(new THREE.BoxGeometry(w,.035,d),mat);m.position.set(x,.13,z);glow.add(m);}
 const ready=Promise.all([car.asset.ready,ghost.ready,ship.ready]).then(()=>{assetsReady=true;});

 function update(dt){const halt=frozen();if(halt!==wasPaused){car.setPaused(halt);wasPaused=halt;}if(halt)dt=0;car.update(dt);glow.visible=phase==='outside'&&ship.portState(LIGHT_PORT).ready;
  if(dt>0){if(assetsReady&&saved?.outside&&!restoreAttempted&&idle()){restoreAttempted=true;ghost.group.visible=false;ship.update(0);if(car.park(saved)){phase='outside';}else{ghost.group.visible=true;notify('旧停车位不可通行，L04保留在4号舱内。');}}if(phase==='outside'&&car.active&&!zone())armed=true;if(phase==='unloading'&&ship.portState(LIGHT_PORT).ready){const centre=ship.deckCentre(LIGHT_PORT),p={x:centre.x+Math.sin(centre.heading)*offset,z:centre.z+Math.cos(centre.heading)*offset,heading:centre.heading};ghost.group.visible=false;ship.update(0);if(car.park(p)){phase='outside';armed=false;persist();notify('L04已落在4号升降台上；靠近8米内登车。驶离后再驶回青框测试自动回收。');}else{ghost.group.visible=true;phase='stowed';ship.setPort(LIGHT_PORT,false);notify('平台停车位置受阻，已保留在舱内，可移开障碍后重试。');}}
   if(capture){if(!idle()||!zone()){capture=false;}else if(Math.abs(car.speed)<.3){if(car.active&&!leave()){capture=false;}else{from=local();car.remote=null;if(car.stow()){phase='centering';clock=0;ghost.group.visible=true;ghost.group.position.set(from.x,ship.platforms[LIGHT_PORT].group.position.y+.04,from.z);ghost.group.rotation.y=from.yaw;capture=false;notify('已自动接管：对中 → 转正 → 升舱。');}}}}
   if(phase==='centering'||phase==='aligning'){clock+=Math.min(dt,.1);const t=Math.min(1,clock/2),e=t*t*(3-2*t);if(phase==='centering'){ghost.group.position.x=THREE.MathUtils.lerp(from.x,port.x,e);ghost.group.position.z=THREE.MathUtils.lerp(from.z,port.z+offset,e);}else ghost.group.rotation.y=from.yaw*(1-e);if(t===1){clock=0;if(phase==='centering')phase='aligning';else{phase='loading';ship.setPort(LIGHT_PORT,false);}}}
   if(phase==='loading'&&ship.portState(LIGHT_PORT).closed){phase='stowed';persist();notify('L04已收入最小4号舱口，升降台归位、舱门闭合。');}
   if(phase==='outside'){saveDue+=dt;if(saveDue>2){saveDue=0;persist();}}
  }
  release.textContent=phase==='stowed'?'4号舱口放车':phase==='outside'?'打开4号平台':'收放进行中';release.disabled=halt||!['stowed','outside'].includes(phase);boarding.textContent=car.active?'下车 · F':'登车 · F';boarding.disabled=halt||phase!=='outside';recovery.disabled=halt||phase!=='outside';status.textContent=({stowed:'在4号舱内 · 可放车',unloading:'开门、下降中',outside:car.active?'驾驶中 · 进入青框自动回收':'地面停放 · 靠近后登车',centering:'自动对中',aligning:'自动转正',loading:'升台、关门中'})[phase]+(phase==='outside'&&!car.active?' · 距车 '+Math.round(Math.hypot(astronaut.position.x-car.position.x,astronaut.position.z-car.position.z))+' m，8m内登车':'')+(halt?' · 已暂停':'');
 }
 addEventListener('pagehide',persist);
 return {car,ghost,ready,update,brake(){emergency=true;},setPaused(v){wasPaused=!!v;car.setPaused(v);},board,leave,open,recover,get phase(){return phase;},get active(){return car.active;},get busy(){return !['stowed','outside'].includes(phase);},get inZone(){return zone();},contains:(x,z)=>car.contains(x,z),persist};
}
