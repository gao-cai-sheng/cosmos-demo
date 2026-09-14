import { createRoverOperations } from './rover-operations.js';
import * as THREE from 'three';
import { PLACES } from './landmarks.js';
import { planTerrainRoute, pointSegmentDistance, localToGeo, geoToLocal } from './route.js';
import { createFlyer } from './flight.js';
import { createAutopilot } from './autopilot.js';
import { createCarrier } from './carrier.js';
import { createAstronaut } from './astronaut.js';
import { findExit } from './walking.js';
import { getJourney, sceneURL, resumeScene, deliveryPod } from './state.js';
import { LOCAL_KM } from '../nav/flight-plan.js';
import { createSurfaceRefuge, REFUGE_SITE } from './surface-refuge.js';
import {findLandingSite,solveSupport,worldXZ,ARES,ARES_FOOTPRINT,LOAD_PAD,dockStatus} from './landing-support.js';
// Column heights (m) for passing under the NX07 hull: suit with helmet; MU-7 with mast head.
const EVA_HEIGHT=1.95,EVA_RADIUS=.35,MU7_HEIGHT=3.2;
import {mountMobilityDeck} from './mobility-deck.js';
import {createRouteFlight} from './route-flight.js';

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
export function mountMobility(options) {
  const {site,scene,camera,canvas,heightAt,getPlayer,getLandmarks=()=>[],getObstacles=()=>[],onBoard,onBlock,notify:deliver=()=>{},onOrbit}=options;
  const notice=el('div','mobility-toast');notice.setAttribute('role','status');notice.hidden=true;document.body.append(notice);let noticeTimer;
  let commandDeck=null,overlayOpen=false,uiBrake=false,emergencyBrake=false;
  const notify=message=>{deliver(message);commandDeck?.notify(message);if(!commandDeck&&!document.body.classList.contains('journey-mode')){notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},4200);}};
  const autopilot=createAutopilot(notify);
  const link=el('link');link.rel='stylesheet';link.href=new URL('./mobility.css',import.meta.url).href;document.head.append(link);
  let paused=false,mapOpen=false,mode='local',selected=null,route=null,routeLine=null,routeIndex=0,lastPaint=0,pending=false,routeObstacles='';
  let refuge=null;
  const obstacles=()=>[...getObstacles(),...(refuge?.ready?[{x:refuge.position.x,z:refuge.position.z,radius:3.8,height:5.6},{x:refuge.position.x,z:refuge.position.z+4,radius:1.15,height:3.2}]:[])];
  const blocked=(x,z)=>obstacles().some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
  const ceilingAt=(x,z)=>heightAt(x,z)+Math.max(0,...obstacles().filter(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132)).map(o=>o.height||70));
  const rover=options.rover;
  // MU-7 always arrives inside ARES, and ARES inside NX07. Until ARES is unloaded MU-7 has no ground position.
  const roverAboardShip=()=>!delivered;
  const roverOnGround=()=>delivered&&!carrier.loaded&&!!rover?.ready();
  const roverPoint=()=>roverAboardShip()&&shipReady?{x:flyer.position.x,z:flyer.position.z,heading:flyer.heading}:rover?.position()||getPlayer();
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  // Preserve the landing refuge where possible; a built campus may occupy that
  // coordinate in the park view, so choose a clear service-area position there.
  const safeRefuge=p=>[[-4,-4],[4,-4],[-4,6],[4,6],[0,0],[0,6.3]].every(([x,z])=>!blocked(p.x+x,p.z+z));
  // The pod is delivered only at the first landing; scenes reached by NX07 travel show it only if that site is in range.
  const pod=options.travel?deliveryPod(site,REFUGE_SITE,LOCAL_KM*1000):{home:site,position:REFUGE_SITE};
  let refugeSite=pod.position;
  if(refugeSite&&!safeRefuge(refugeSite))refugeSite=findExit(options.travel?refugeSite:getPlayer(),24,heightAt,(x,z)=>!safeRefuge({x,z}));
  if(refugeSite)refuge=createSurfaceRefuge({scene,camera,heightAt,sitePosition:refugeSite,arriving:!!options.arriving,saveKey:`cosmos.refuge.v1:${options.kind}:${pod.home.lat}:${pod.home.lon}:${getJourney()?.startedAt||'free'}`});
  const outsideOccupied=(x,z)=>blocked(x,z)||(roverOnGround()&&distance({x,z},roverPoint())<2.3)||(shipReady&&flyer.asset.contains(x,z,EVA_RADIUS,EVA_HEIGHT))||carrier.contains(x,z);
  // ARES carrying MU-7 stands taller than the bare truck.
  const carrierHeight=()=>carrier.loaded?5.9:ARES.height;
  const walkBlocked=(x,z)=>refuge?.inside?refuge.blocked(x,z):outsideOccupied(x,z)||!!refuge?.blocked(x,z);
  const astronaut=createAstronaut({scene,camera,canvas,heightAt:(x,z)=>refuge?.floor(x,z)??heightAt(x,z),ceilingAt:(x,z)=>refuge?.ceiling(x,z)??Infinity,solidAt:(x,y,z)=>shipReady&&flyer.asset.solidAt(x,y,z),blocked:walkBlocked});
  let changing=false, shipReady=false, operatorPlaced=false;
  const flyer=createFlyer({scene,camera,canvas,heightAt,blocked,ceilingAt,site,getPlayer,
    onBoard:()=>{astronaut.stop();onBoard();document.body.classList.add('is-flying');},
    onLand:()=>{},onOrbit,notify});
  const saveKey=`cosmos.carrier.v1:${options.kind}:${site.lat}:${site.lon}:${getJourney()?.startedAt||'free'}`;
  let carrierSave=null;try{carrierSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch{}
  const carrier=createCarrier({scene,camera,canvas,heightAt,blocked,footprintBlocked:(x,z,yaw,low,high)=>shipReady&&flyer.asset.rectHits(x,z,yaw,ARES_FOOTPRINT,low,high,carrierHeight()),solidAt:(x,y,z)=>shipReady&&flyer.asset.solidAt(x,y,z),rover,notify,
    driveControl:(input,dt)=>driveControl(input,dt,'carrier'),
    onBoard:()=>{rover.exit();astronaut.stop();astronaut.seat(carrier.asset.group);onBoard();},
    onSave:value=>{try{localStorage.setItem(saveKey,JSON.stringify({...value,unloadedFromKestrel:delivered===true}));}catch{}}});
  addEventListener('pagehide',()=>{if(carrier.ready)carrier.save();});
  const operations=createRoverOperations({scene,canvas,heightAt,rover:{...rover,carrier:()=>carrier},
    enabled:()=>rover.driving()&&!paused&&!mapOpen&&!overlayOpen&&!document.hidden,loaded:()=>carrier.loaded,
    findHome:p=>findExit(p,24,heightAt,blocked),saveKey:saveKey.replace('carrier','rover-ops'),notify,stopAuto:()=>{if(autopilot.active)autopilot.stop('仪器操作已接管，自动驾驶结束。');},photo:()=>rover.photo?.(),openMap:()=>open()});
  function driveControl(input,dt,vehicle='rover'){
    if(uiBrake||emergencyBrake)input={...input,throttle:0,steer:0,brake:1};
    if(emergencyBrake&&Math.abs(vehicle==='carrier'?carrier.speed:rover.speed())<.05)emergencyBrake=false;
    const m=rover.model(),forward=m?.forward;
    const p=vehicle==='carrier'?{...carrier.position,heading:carrier.heading,speed:carrier.speed}:{...roverPoint(),heading:forward?Math.atan2(forward.x,forward.z):0,speed:rover.speed()};
    const control=autopilot.drive(input,p,vehicle,dt,blocked);
    return vehicle==='rover'?operations.drive(control,dt):control;
  }
  let delivered=carrierSave?.unloadedFromKestrel===true;flyer.asset.setDelivered(delivered);
  function prepareCarrier(){
    if(changing)return;
    if(!delivered){const m=rover.model();if(m)m.root.visible=false;return;}
    if(carrier.ready||!rover.ready())return;
    if(carrierSave&&Number.isFinite(carrierSave.x)&&Number.isFinite(carrierSave.z)&&Number.isFinite(carrierSave.heading)&&carrier.park(carrierSave)){
      if(carrierSave.loaded===true)carrier.dock({restore:true});return;
    }
    const p=findExit(roverPoint(),32,heightAt,(x,z)=>blocked(x,z)||flyer.asset.contains(x,z,2));
    if(p&&carrier.park(p))carrier.save();
  }
  function boardCarrier(){
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||!astronaut.active||!carrier.ready)return;
    if(distance(astronaut.position,carrier.position)>8){notify('请步行至 ARES 8 m 内登车。');return;}carrier.start();
  }
  function leaveCarrier(){
    if(paused||mapOpen)return;
    if(Math.abs(carrier.speed)>.4){notify('请按空格停稳，再下车。');return;}
    const p=findExit({...carrier.position,heading:carrier.heading},7,heightAt,walkBlocked);
    if(!p){notify('车旁没有安全落脚点，请驶至开阔地。');return;}
    if(carrier.leave()){astronaut.start(p);operatorPlaced=true;}
  }
  function cargoAction(){
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||flyer.active||(!carrier.active&&(!astronaut.active||distance(astronaut.position,carrier.position)>10)))return;
    if(carrier.loaded)carrier.unload();else carrier.dock();
  }

  // channel: ARES is driven along the stern corridor by the unload/walk-load animation.
  function checkShipDoor({channel=false}={}){
    if(!flyer.grounded||flyer.active)return {ok:false,reason:'请先着陆并停机，再操作腹舱'};
    const ramp=flyer.asset.checkRamp(blocked);if(!ramp.ok)return ramp;
    const yaw=flyer.heading,c=Math.cos(yaw),s=Math.sin(yaw),at=p=>{const dx=p.x-flyer.position.x,dz=p.z-flyer.position.z;return {x:dx*c-dz*s,z:dx*s+dz*c};};
    const within=channel?p=>{const l=at(p);return Math.abs(l.x)<6&&l.z<-1&&l.z>-44;}:p=>{const l=at(p);return Math.abs(l.x)<4.5&&l.z<-1.2&&l.z>-14.8;};
    const onBay=carrier.ready&&(channel?within(carrier.position):flyer.asset.overBay(carrier.position.x,carrier.position.z,carrier.heading,ARES_FOOTPRINT));
    if(astronaut.active&&within(astronaut.position))return {ok:false,reason:channel?'请站到升降平台侧面，避开腹舱门展开区':'请离开主升降平台下方'};
    if(onBay)return {ok:false,reason:'ARES 在主升降平台区域：停稳在装载位上会自动装船；否则请驶离后操作舱门'};
    if(roverOnGround()&&within(roverPoint()))return {ok:false,reason:'MU-7 占用升降平台区域，请先移开'};
    const freight=p=>flyer.asset.underFreight(p.x,p.z,1.5);
    if(astronaut.active&&freight(astronaut.position))return {ok:false,reason:'请离开两侧货运平台下方，平台会随舱门降下'};
    if(carrier.ready&&flyer.asset.underFreight(carrier.position.x,carrier.position.z,5))return {ok:false,reason:'ARES 停在货运平台下方，请驶离后操作舱门'};
    if(roverOnGround()&&flyer.asset.underFreight(roverPoint().x,roverPoint().z,2))return {ok:false,reason:'MU-7 停在货运平台下方，请先移开'};
    return ramp;
  }
  async function unloadShip(){
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||delivered||flyer.active)return;
    const checks=checkShipDoor({channel:true});if(!checks.ok){notify(checks.reason);return;}
    changing=true;
    try{
      notify(checks.reason);
      if(!flyer.asset.doorReady){
        if(!flyer.asset.doorOpen)flyer.asset.setDoor(true);
        notify('正在打开NX07腹舱；舱门完全打开后将自动卸载 ARES。');
        const started=performance.now();
        await new Promise((resolve,reject)=>{
          const check=()=>{
            if(flyer.asset.doorReady){resolve();return;}
            if(paused||mapOpen||document.hidden){requestAnimationFrame(check);return;}
            if(performance.now()-started>120000){reject(new Error('腹舱升降平台未能在预期时间内展开。'));return;}
            requestAnimationFrame(check);
          };
          check();
        });
      }
      if(!await ensureRover())return;
      const p=flyer.asset.exitPoint();
      if(!carrier.canTraverse(p.x,p.z,p.heading)){notify('腹舱卸载区有障碍或坡度过大，请换一处开阔地。');return;}
      notify('正在降下腹部平台，随后驶出 ARES…');await flyer.asset.unload();
      if(!carrier.park(p))return;
      const m=rover.model();if(m)m.root.visible=true;
      carrier.dock({restore:true});
      delivered=true;flyer.asset.setDelivered(true);carrier.save();notify('ARES 已卸至腹舱后方，MU-7 与初始生存包随车装载。靠近 ARES 点“卸载 MU-7”即可放下探测车。');
    }catch(error){notify(error.message||'卸载中断，请重试。');}finally{changing=false;}
  }
  const dockState=()=>dockStatus(flyer.asset.dockOffset(carrier.position.x,carrier.position.z,carrier.heading),carrier.speed);
  const dockHint=st=>st.inZone?(st.ready?'已停在装载位 · 正在夹紧 ARES…':'已驶上装载位 · 按空格停稳即装船登舰')
    :`装载位 ${st.ahead>=0?'前方':'后方'} ${Math.abs(st.ahead).toFixed(1)} m · ${Math.abs(st.right)<.1?'左右居中':(st.right>0?'向右 ':'向左 ')+Math.abs(st.right).toFixed(1)+' m'} · 航向差 ${Math.round(st.yawDeg)}°`;
  let dockHold=0;
  // Driver aboard: drive onto the lowered lift, stop, and the lift carries crew and truck into NX07.
  async function dockCarrier({board=true}={}){
    if(changing||!flyer.asset.padReady)return;
    const check=flyer.asset.checkRamp(blocked);if(!check.ok){notify(check.reason);return;}
    const pose={x:carrier.position.x,z:carrier.position.z,heading:carrier.heading},wasActive=carrier.active;
    if(autopilot.active)autopilot.stop('已驶上装载位，自动驾驶结束。');
    if(wasActive&&!carrier.leave()){notify('请按空格停稳后再装船。');return;}
    if(!carrier.stow()){notify('请按空格停稳后再装船。');if(wasActive)carrier.start();return;}
    changing=true;flyer.asset.setRoverCargoVisible(carrier.loaded);
    const loading=flyer.asset.loadFromPad(pose.x,pose.z,pose.heading);
    try{
      if(!flyer.asset.unloading)await loading;
      if(board&&wasActive){flyer.start({fromCargo:true});notify('ARES 已夹紧，主升降平台上升中；已进入 NX07 操控，腹舱关闭后 E 起飞。');}
      else notify('ARES 已夹紧，正在通过主升降平台装回NX07…');
      await loading;
      delivered=false;flyer.asset.setDelivered(false);carrier.save();flyer.asset.setDoor(false);
      notify(board&&wasActive?'ARES 已固定在腹舱，腹舱关闭中；关闭后 E 垂直起飞。':'ARES 与随车物资已固定在腹舱，腹舱关闭中。');
    }catch(error){
      notify(error.message||'装船中断，请重试。');
      if(flyer.active)flyer.leave();
      if(carrier.park(pose)&&wasActive)carrier.start();
    }finally{changing=false;}
  }
  function driveLoad(){
    if(paused||mapOpen||changing||!carrier.active||!delivered)return;
    if(!shipReady||!flyer.grounded||flyer.active){notify('NX07 需着陆并完成支撑锁定后才能装船。');return;}
    if(!flyer.asset.doorOpen){const check=checkShipDoor();if(!check.ok){notify(check.reason);return;}flyer.asset.setDoor(true);notify('NX07 腹舱开启中：主升降平台会降到地面并高亮。沿舰尾灯带驶上平台停稳，即自动装船登舰。');return;}
    if(!flyer.asset.padReady){notify('主升降平台下降中，请稍候…');return;}
    const st=dockState();if(st.ready)dockCarrier();else notify(dockHint(st));
  }
  async function loadShip(){
    if(carrier.active)return driveLoad();
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||!delivered||flyer.active)return;
    if(flyer.asset.padReady&&dockState().inZone){dockCarrier({board:false});return;}
    const a=flyer.heading,target=flyer.asset.exitPoint();
    if(distance(carrier.position,target)>3||Math.abs(Math.atan2(Math.sin(carrier.heading-a),Math.cos(carrier.heading-a)))>.3){notify('驾驶 ARES 时：打开腹舱后驶上高亮的主升降平台停稳即可装船登舰。步行装船：将 ARES 停到舰尾中心线后方约51 m、车头朝向NX07。');return;}
    const checks=checkShipDoor({channel:true});if(!checks.ok){notify(checks.reason);return;}
    changing=true;
    try{flyer.asset.setDoor(true);await new Promise(resolve=>{const tick=()=>flyer.asset.doorReady?resolve():requestAnimationFrame(tick);tick();});
      if(!carrier.stow())return;flyer.asset.setRoverCargoVisible(carrier.loaded);notify('正在通过升降平台将 ARES 装回NX07…');await flyer.asset.load();delivered=false;flyer.asset.setDelivered(false);carrier.save();notify('ARES 与随车物资已固定在腹舱，可关闭升降平台。');
    }catch(error){notify(error.message);}finally{changing=false;}
  }
  const toolbar=el('nav','mobility-tools');toolbar.setAttribute('aria-label','当前模式操作');
  const mapButton=el('button','','地图导航 · M'),flyButton=el('button','','登上NX07飞行器'),orbitButton=el('button','','进入火星轨道');
  const shipLoad=el('button','','装载 ARES 回NX07');shipLoad.onclick=loadShip;
  const shipDoor=el('button','','打开NX07腹舱'),shipUnload=el('button','','卸载 ARES 与物资');
  shipDoor.onclick=()=>{if(paused||mapOpen||flyer.active||changing)return;const check=checkShipDoor();if(!check.ok){notify(check.reason);return;}notify(check.reason);flyer.asset.setDoor(!flyer.asset.doorOpen);};shipUnload.onclick=unloadShip;
  toolbar.append(shipDoor,shipUnload,shipLoad);
  orbitButton.hidden=true;toolbar.append(mapButton,flyButton,orbitButton);document.body.append(toolbar);
  const groundButton=el('button','mobility-rover','开始探索 · F');
  const viewButton=el('button','','第三人称 · C');
  const refugeButton=el('button','refuge-enter','进入生活舱 · F'),restButton=el('button','refuge-rest','坐下休息');
  function useRefuge(){if(paused||mapOpen||changing||!astronaut.active)return;refuge?.enterOrExit(astronaut,notify,outsideOccupied);}
  refugeButton.onclick=useRefuge;restButton.onclick=()=>{if(!paused&&!mapOpen)refuge?.rest(astronaut);};
  const leaveButton=el('button','','离船步行 · F');
  const overviewButton=el('button','','返回建设视角');
  const carrierButton=el('button','carrier-board','登上 ARES · F'),doorButton=el('button','carrier-door','打开货舱'),cargoButton=el('button','carrier-cargo','装载 MU-7');
  carrierButton.onclick=()=>carrier.active?leaveCarrier():boardCarrier();doorButton.onclick=()=>{if(!paused&&!mapOpen)carrier.toggleDoor();};cargoButton.onclick=cargoAction;
  toolbar.prepend(groundButton,carrierButton,viewButton,refugeButton,restButton);toolbar.append(leaveButton,doorButton,cargoButton);
  const hud=el('section','vehicle-console');hud.setAttribute('aria-label','当前载具与操作');
  hud.innerHTML='<header><div><small class="console-mode"></small><h2 class="console-title"></h2></div><span class="console-state"></span></header><dl class="console-metrics"></dl><p class="console-hint"></p>';
  document.body.append(hud);const shipChecks=el('small','ship-checks');hud.append(shipChecks);const modeLabel=hud.querySelector('.console-mode'),titleLabel=hud.querySelector('.console-title'),stateLabel=hud.querySelector('.console-state'),metrics=hud.querySelector('.console-metrics'),hint=hud.querySelector('.console-hint');
  const metricNodes=Array.from({length:3},()=>{const row=el('div'),label=el('dt'),value=el('dd');row.append(label,value);metrics.append(row);return {label,value};});
  const help=el('details','console-help');help.innerHTML='<summary>操作说明</summary><p></p>';hud.append(operations.panel,help,toolbar);
  const taskDrawer=el('aside','console-mission');taskDrawer.setAttribute('aria-label','任务详情');
  const closeTask=el('button','console-mission-close','收起任务 ×');taskDrawer.append(closeTask);document.body.append(taskDrawer);
  const taskButton=el('button','console-task','任务详情');taskButton.setAttribute('aria-expanded','false');
  taskButton.onclick=()=>{for(const selector of ['.journey-objective','.journey-actions']){const node=document.querySelector(selector);if(node)taskDrawer.append(node);}const show=document.body.classList.toggle('show-mission');taskButton.setAttribute('aria-expanded',String(show));};
  closeTask.onclick=()=>{document.body.classList.remove('show-mission');taskButton.setAttribute('aria-expanded','false');taskButton.focus();};toolbar.append(taskButton);
  document.body.classList.add('mobility-unified');
  const autoStop=el('button','autopilot-stop','停止自动驾驶');autoStop.hidden=true;autoStop.onclick=()=>autopilot.stop('自动驾驶已取消，请手动驾驶。');toolbar.append(autoStop);
  const pauseButton=el('button','console-pause','暂停');toolbar.append(pauseButton);
  const pauseDialog=el('dialog','transport-pause');pauseDialog.innerHTML='<small>COSMOS</small><h2>探索已暂停</h2><p>继续后恢复当前操作模式。</p><button class="resume">继续探索</button><a href="../index.html">返回指挥台</a>';document.body.append(pauseDialog);
  const resume=()=>{pauseDialog.close();paused=false;onBlock(false);flyer.setPaused(false);carrier.setPaused(false);astronaut.setPaused(!!refuge?.busy||!!refuge?.resting);};
  pauseButton.onclick=()=>{const menu=document.querySelector('.journey-menu');if(menu){menu.click();return;}paused=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);astronaut.setPaused(true);pauseDialog.showModal();};
  pauseDialog.querySelector('.resume').onclick=resume;pauseDialog.addEventListener('cancel',e=>{e.preventDefault();resume();});
  const evaStatus=el('div','eva-status');evaStatus.hidden=true;document.body.append(evaStatus);
  async function ensureRover(){await rover?.ensure();return !!rover?.ready();}
  function prepareShip(){
    if(shipReady||routeFlight.arriving)return;
    const r=roverPoint();
    const p=findLandingSite({x:r.x-90,z:r.z-30},heightAt,(x,z)=>blocked(x,z)||Math.hypot(x-r.x,z-r.z)<4);
    if(p)shipReady=flyer.park(p);
  }
  async function walk(){
    if(paused||mapOpen||changing||refuge?.busy||flyer.active||carrier.active||astronaut.active)return;
    changing=true;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      prepareShip();prepareCarrier();
      // Ending remote control brakes the rover; the operator never travels with it.
      const p=refuge?.inside?{...refuge.target(),heading:Math.PI}:operatorPlaced?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:startPoint();
      if(!p){rover.exit();notify('当前没有安全的操作员站位，请换一处开阔地。');return;}
      rover.exit();astronaut.start(p);refuge?.restore(astronaut);operatorPlaced=true;
      notify('已结束遥控，返回操作员位置。WASD 步行；F 遥控探测车，靠近NX07时 F 登船。');
    }finally{changing=false;}
  }
  // Crew who have not stepped out yet start beside whatever still carries MU-7: NX07, then ARES.
  function startPoint(){
    if(roverAboardShip()&&shipReady)return findExit({...flyer.position,heading:flyer.heading},55,heightAt,walkBlocked);
    return findExit(carrier.loaded?{...carrier.position,heading:carrier.heading}:roverPoint(),carrier.loaded?7:3.5,heightAt,walkBlocked);
  }
  async function boardRover(){
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||flyer.active||carrier.active)return;
    changing=true;let stepOut=false;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      prepareShip();prepareCarrier();
      // A resumed save may still have MU-7 stowed: put the operator on the ground instead of leaving no one in control.
      if(!delivered){rover.exit();stepOut=!astronaut.active;notify('MU-7 随 ARES 装在 NX07 腹舱内：先打开腹舱卸下 ARES，再从 ARES 卸下 MU-7。');return;}
      if(carrier.loaded){rover.exit();stepOut=!astronaut.active;notify('MU-7 位于 ARES 货舱内，请靠近 ARES 卸载后再连接遥控。');return;}
      if(!operatorPlaced&&!astronaut.active){
        const p=findExit(roverPoint(),3.5,heightAt,walkBlocked);
        if(!p){rover.exit();notify('没有安全的操作员站位，无法开始遥控。');return;}
        astronaut.start(p);
      }
      if(!rover.driving())await rover.enter();
      if(rover.driving()){
        operatorPlaced=true;astronaut.standby();
        notify('MU-7 无人探测车遥控已连接。操作员留在原地；F 控制车灯，C 切换观察机位；面板按钮结束遥控。');
      }
    }finally{changing=false;if(stepOut)walk();}
  }
  function leaveShip(){
    if(paused||mapOpen)return;
    const p=findExit({...flyer.position,heading:flyer.heading},55,heightAt,walkBlocked);
    if(!p){notify('舱门旁没有安全落脚点，请换一处开阔地降落。');return;}
    if(!flyer.leave()){notify('请先降落并停稳，再离船步行。');return;}
    document.body.classList.remove('is-flying');astronaut.start(p);operatorPlaced=true;
  }
  function boardShip(){
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||carrier.active)return;
    if(flyer.active){flyer.land();return;}
    if(!astronaut.active){notify('请先结束遥控，再步行靠近NX07登船。');return;}
    if(!shipReady||distance(astronaut.position,flyer.position)>64){notify('请步行到NX07旁，64 m 内可登船；地图标有停泊位置。');return;}
    flyer.start();
  }
  groundButton.onclick=()=>astronaut.active?boardRover():walk();
  viewButton.onclick=()=>{if(refuge?.busy||refuge?.resting)return;carrier.active?carrier.cycle():flyer.active?flyer.cycle():rover.driving()?rover.cycle?.():astronaut.cycle();};leaveButton.onclick=leaveShip;
  if(options.kind==='park'){
    const builder=el('button','builder-map-toggle','建设面板');
    builder.onclick=()=>{document.body.classList.toggle('show-build-panel');};toolbar.append(builder,overviewButton);
    overviewButton.onclick=()=>{if(paused||mapOpen||flyer.active||carrier.active)return;astronaut.stop();rover.exit();options.onOverview?.();};
  }
  if (getJourney() && !document.body.classList.contains('journey-mode')) {
    const back=el('button','','返回先遣任务');back.onclick=()=>{location.href=sceneURL(resumeScene());};toolbar.append(back);
  }
  const flightStatus=el('div','flight-status');flightStatus.hidden=true;document.body.append(flightStatus);
  const guidance=el('button','mobility-guidance');guidance.hidden=true;document.body.append(guidance);
  const dialog=el('dialog','mars-map');dialog.setAttribute('aria-label','火星平面地图导航');
  dialog.innerHTML=`<header><div><span>COSMOS / NAVIGATION</span><h2>火星地图</h2></div><button class="map-close" aria-label="关闭地图">关闭 / ESC</button></header>
    <div class="map-layout"><section class="map-chart"><nav><button data-mode="local" class="active">周边地形</button><button data-mode="planet">火星全图</button><button id="map-center">定位当前位置</button></nav><canvas id="mars-map-canvas" aria-label="可点击选择目标的火星平面地图"></canvas><p class="map-legend">青色：建筑与信标 · 白色：当前位置 · 绿色：规划路线 · 棕色：地形高程</p></section>
    <aside><label for="map-search">查找地标或建筑</label><input id="map-search" placeholder="名称 / 地标 / 温室" autocomplete="off"><div class="map-place-list" role="list"></div><div class="map-destination"><h3>选择一个目的地</h3><p>点击地图或右侧地标。规划会避开过陡地面、穹顶和连廊。</p></div><label for="map-slope">允许最大坡度 <b id="map-slope-label">26°</b></label><input id="map-slope" type="range" min="12" max="32" step="2" value="26"><button id="map-plan" class="map-primary" disabled>规划驾驶路线</button><button id="map-orbit" hidden>在轨道上定位此处</button><button id="map-auto" class="map-primary" disabled>开始自动驾驶</button><p class="map-auto-hint"></p><button id="map-clear">清除导航路线</button><p class="map-result" role="status"></p></aside></div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s),map=q('canvas'),ctx=map.getContext('2d'),list=q('.map-place-list'),search=q('#map-search'),result=q('.map-result');
  const worldData=globalThis.MOLA,raw=worldData?atob(worldData.b64):null;
  function mola(lat,lon){if(!raw)return 0;const x=Math.floor(((lon%360+360)%360)/360*worldData.w),y=Math.max(0,Math.min(worldData.h-1,Math.floor((90-lat)/180*worldData.h))),i=(y*worldData.w+x)*2;let h=(raw.charCodeAt(i)<<8)|raw.charCodeAt(i+1);return h&32768?h-65536:h;}
  const planet=el('canvas');planet.width=720;planet.height=360;
  const pi=planet.getContext('2d').createImageData(720,360);
  for(let y=0;y<360;y++)for(let x=0;x<720;x++){const h=mola(90-y*.5,x*.5),t=Math.max(0,Math.min(1,(h+7000)/15000)),i=(y*720+x)*4;pi.data[i]=45+t*130;pi.data[i+1]=49+t*69;pi.data[i+2]=47+t*37;pi.data[i+3]=255;}
  planet.getContext('2d').putImageData(pi,0,0);
  let chart={cx:0,cz:0,span:900},terrainImage=null;
  const catalog=()=>[
    ...(operations.state.home?[{id:'rover-home',name:operations.gridAvailable?'营地电网 · MU-7充电 / 维修':'补给基地 · 自动充电 / 维修',...operations.state.home,...localToGeo(operations.state.home,site),local:true,type:operations.gridAvailable?'营地电网':'补给基地'}]:[]),
    ...(carrier.ready?[{id:"atlas",name:"ARES · 载人运输车",x:carrier.position.x,z:carrier.position.z,...localToGeo(carrier.position,site),local:true,type:"运输车"}]:[]),
    ...(refuge?.ready?[{id:'refuge',name:'生活舱 · 临时居住',...refuge.target(),...localToGeo(refuge.target(),site),local:true,type:'生活舱气闸'}]:[]),
    ...(operatorPlaced?[{id:'eva-operator',name:'操作员 · 留驻位置',x:astronaut.position.x,z:astronaut.position.z,...localToGeo(astronaut.position,site),local:true,type:'人员'}]:[]),
    {id:'eva-rover',name:!delivered?'MU-7 · 随 ARES 在 NX07 内':carrier.loaded?'MU-7 · 在 ARES 货舱':'MU-7 · 无人遥控车',...roverPoint(),...localToGeo(roverPoint(),site),local:true,type:'载具'},
    ...(shipReady?[{id:'eva-ship',name:'NX07 · 停泊位置',x:flyer.position.x,z:flyer.position.z,...localToGeo(flyer.position,site),local:true,type:'飞船'}]:[]),
    ...getLandmarks().map(p=>({...p,...localToGeo(p,site),local:true})),
    ...((options.kind !== 'park' || Math.abs((getJourney()?.site.lat ?? site.lat)-site.lat) > .001 || Math.abs((getJourney()?.site.lon ?? site.lon)-site.lon) > .001) ? (getJourney()?.campuses || []).map((p,i)=>{
      const geo=localToGeo(p,getJourney().site);return {id:'saved-campus-'+i,name:p.name+' · 已建先遣站',...geo,...geoToLocal(geo,site),type:'穹顶',local:true};
    }) : []),
    ...PLACES.map(([name,english,lat,lon,rank,type])=>({id:english,name,english,lat,lon,rank,type,...geoToLocal({lat,lon},site)}))
  ];
  const player=()=>carrier.active?{x:carrier.position.x,z:carrier.position.z,heading:carrier.heading}:flyer.active?{x:flyer.position.x,z:flyer.position.z,heading:flyer.heading}:astronaut.active?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:getPlayer();
  const loc=p=>mode==='planet'?{x:p.lon/360*map.width,y:(90-p.lat)/180*map.height}:{x:(p.x-chart.cx)/chart.span*map.height+map.width/2,y:(p.z-chart.cz)/chart.span*map.height+map.height/2};
  function center(){const p=player();chart={cx:p.x,cz:p.z,span:900};terrainImage=null;drawMap();}
  function terrain(){
    const c=el('canvas');c.width=160;c.height=160;const data=c.getContext('2d').createImageData(160,160),heights=new Float64Array(25600);let lo=Infinity,hi=-Infinity;
    for(let y=0;y<160;y++)for(let x=0;x<160;x++){const h=heightAt(chart.cx+(x/159-.5)*chart.span*map.width/map.height,chart.cz+(y/159-.5)*chart.span);heights[y*160+x]=h;lo=Math.min(lo,h);hi=Math.max(hi,h);}
    for(let y=0;y<160;y++)for(let x=0;x<160;x++){const i=y*160+x,t=(heights[i]-lo)/Math.max(25,hi-lo),shade=x&&y?Math.max(-25,Math.min(25,(heights[i-1]-heights[i]+heights[i-160]-heights[i])*2)):0;data.data[i*4]=50+t*80+shade;data.data[i*4+1]=54+t*44+shade;data.data[i*4+2]=48+t*22+shade;data.data[i*4+3]=255;}
    c.getContext('2d').putImageData(data,0,0);terrainImage=c;
  }
  function drawMap(){
    if(!mapOpen)return;
    const box=map.getBoundingClientRect();const w=Math.round(box.width),h=Math.round(box.height);if(!w||!h)return;
    if(map.width!==w||map.height!==h){map.width=w;map.height=h;terrainImage=null;}
    ctx.clearRect(0,0,w,h);
    if(mode==='planet')ctx.drawImage(planet,0,0,w,h);else{if(!terrainImage)terrain();ctx.drawImage(terrainImage,0,0,w,h);}
    ctx.lineWidth=1;ctx.strokeStyle='#d2e4dc18';ctx.fillStyle='#d2e4dcaa';ctx.font='10px ui-monospace,monospace';
    for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h*i/6);ctx.lineTo(w,h*i/6);ctx.stroke();}
    if(mode==='planet'){for(let i=0;i<6;i++)ctx.fillText(i*60+'°E',i*w/6+5,15);ctx.fillText('90°N',5,32);ctx.fillText('0°',5,h/2-5);ctx.fillText('90°S',5,h-8);}
    else{
      ctx.fillText('北 ↑',12,20);ctx.fillText(Math.round(chart.span*w/h)+' m × '+Math.round(chart.span)+' m · 滚轮缩放',12,h-12);
      for(const o of obstacles()){ctx.fillStyle='#89c5c42e';ctx.strokeStyle='#9cdddaa0';ctx.beginPath();if(o.type==='line'){const a=loc(o.a),b=loc(o.b);ctx.lineWidth=Math.max(3,(o.radius||6)*2/chart.span*h);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}else{const p=loc(o);ctx.arc(p.x,p.y,(o.radius||130)/chart.span*h,0,Math.PI*2);ctx.fill();ctx.lineWidth=1;ctx.stroke();}}
    }
    if(mode==='local'&&operations.state.path.length){ctx.strokeStyle='#e5b07e';ctx.lineWidth=1.5;ctx.beginPath();operations.state.path.forEach((p,i)=>{const s=loc(p);if(i===0)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);});ctx.stroke();}
    if(route){ctx.strokeStyle='#acffd4';ctx.lineWidth=2.5;ctx.beginPath();let lastX=null;route.path.forEach((p,i)=>{const s=loc({...p,...localToGeo(p,site)});if(i===0||mode==='planet'&&Math.abs(s.x-lastX)>w/2)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);lastX=s.x;});ctx.stroke();}
    const labels=[];
    for(const p of catalog()){
      const s=loc(p);if(s.x<0||s.y<0||s.x>w||s.y>h)continue;
      ctx.fillStyle=p.local?'#a7e3dd':'#ecd8b5';ctx.beginPath();ctx.arc(s.x,s.y,p===selected?5:p.local?3:2,0,Math.PI*2);ctx.fill();
      const selectedHere=selected?.id===p.id;
      if(selectedHere||!labels.some(r=>Math.abs(r.x-s.x)<85&&Math.abs(r.y-s.y)<17)) {ctx.fillStyle=selectedHere?'#fff':'#d8e6e3';ctx.font='11px -apple-system,sans-serif';ctx.fillText(p.name,s.x+7,s.y-5);labels.push(s);}
    }
    if(selected){const p=loc(selected);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(p.x-8,p.y-8,16,16);}
    const p=player(),s=loc({...p,...localToGeo(p,site)});ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.PI-(p.heading||0));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();
  }
  function refreshList(){
    const value=search.value.trim().toLowerCase();
    const all=catalog().filter(p=>(p.name+' '+(p.english||'')).toLowerCase().includes(value));
    all.sort((a,b)=>Number(!!b.local)-Number(!!a.local));
    list.replaceChildren(...all.map(p=>{const b=el('button',selected?.id===p.id?'selected':'');const n=el('span','',p.name),d=el('small','',p.local?'本地 · '+(p.type||'建筑'):Math.abs(p.lat).toFixed(1)+(p.lat<0?'°S':'°N')+' / '+p.lon.toFixed(1)+'°E');b.append(n,d);b.onclick=()=>select(p);return b;}));
    if(!all.length)list.append(el('p','','没有找到对应地标。'));
  }
  function select(p){
    selected=p;q('.map-destination h3').textContent=p.name;
    const d=Math.hypot(p.x-player().x,p.z-player().z);
    q('.map-destination p').textContent=p.approach?'导航到建筑外的巡视车接驳点；加压穹顶内部暂不能驶入。':`距当前位置 ${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}。`;
    q('#map-plan').disabled=d>6400||flyer.active;
    q('#map-orbit').hidden=d<6400;
    result.textContent=d>6400?'此目标超出本地规划范围。先搭乘NX07进入轨道定位，在目的地降落后规划驾驶路线。':flyer.active?'请先降落离船，再规划地面路线。':'';
    if(mode==='local'&&d<6400){chart={cx:(p.x+player().x)/2,cz:(p.z+player().z)/2,span:Math.max(500,d*1.6)};terrainImage=null;}
    refreshList();drawMap();
  }
  function setMode(next){mode=next;dialog.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));drawMap();}
  function close(){dialog.close();mapOpen=false;flyer.setPaused(paused);carrier.setPaused(paused);astronaut.setPaused(paused||!!refuge?.busy||!!refuge?.resting);onBlock(false);}
  function open(){if(paused||overlayOpen)return;mapOpen=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);astronaut.setPaused(true);dialog.showModal();center();refreshList();drawMap();}
  q('.map-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  mapButton.onclick=open;guidance.onclick=open;
  q('#map-center').onclick=center;search.oninput=refreshList;
  dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  map.onclick=e=>{const box=map.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;let near=null,best=20;for(const p of catalog()){const s=loc(p),d=Math.hypot(s.x-x,s.y-y);if(d<best){near=p;best=d;}}
    if(near)select(near);else if(mode==='local'){const p={x:chart.cx+(x-map.width/2)/map.height*chart.span,z:chart.cz+(y/map.height-.5)*chart.span};select({id:'custom',name:'自选地面位置',...p,...localToGeo(p,site)});}
    else{const p={lon:x/map.width*360,lat:90-y/map.height*180};select({id:'custom-planet',name:'自选着陆位置',...p,...geoToLocal(p,site)});}
  };
  map.addEventListener('wheel',e=>{e.preventDefault();if(mode==='local'){chart.span=THREE.MathUtils.clamp(chart.span*Math.exp(e.deltaY*.001),200,8000);terrainImage=null;drawMap();}},{passive:false});
  q('#map-slope').oninput=()=>q('#map-slope-label').textContent=q('#map-slope').value+'°';
  q('#map-auto').onclick=()=>{
    if(!route||(!carrier.active&&!rover.driving())){result.textContent='请先连接 MU-7 遥控或登上 ARES，再规划并启动自动驾驶。';return;}
    const vehicle=carrier.active?'carrier':'rover';
    if(route.vehicle&&route.vehicle!==vehicle||Math.hypot(player().x-route.path[0].x,player().z-route.path[0].z)>20){result.textContent='载具或起点已改变，请重新规划路线。';return;}
    if(carrier.active&&carrier.doorOpen){result.textContent='请先关闭 ARES 货舱。';return;}
    if(autopilot.start(route.path,carrier.active?'carrier':'rover')){close();notify('自动驾驶已启动。WASD、空格或触屏方向键可立即接管。');}
  };
  q('#map-plan').onclick=async()=>{
    if(!selected||pending)return;clearRoute();pending=true;q('#map-plan').disabled=true;result.textContent='正在检查地形坡度与建筑间隙…';await new Promise(r=>setTimeout(r,30));
    try{
      const goal=selected.approach||selected;
      const solid=obstacles();const obstacleAt=(x,z)=>solid.some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
      const answer=planTerrainRoute({start:player(),goal,heightAt,blocked:(x,z)=>obstacleAt(x,z)||(carrier.active&&!carrier.canTraverse(x,z)),maxSlope:Number(q('#map-slope').value)});
      if(!answer.ok){result.textContent=answer.reason;return;}
      clearRoute();route={...answer,target:selected.name,vehicle:carrier.active?'carrier':rover.driving()?'rover':null};routeIndex=0;
      routeObstacles=JSON.stringify(solid);
      routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.path.map(p=>new THREE.Vector3(p.x,heightAt(p.x,p.z)+.8,p.z))),new THREE.LineBasicMaterial({color:0xa7ffca,depthTest:false,transparent:true,opacity:.7}));routeLine.renderOrder=100;scene.add(routeLine);
      result.textContent=`已规划 ${Math.round(route.length)} m · 累计上升 ${Math.round(route.climb)} m · 最大坡度 ${route.maxSlope.toFixed(1)}°。可点击“开始自动驾驶”，或关闭地图手动驾驶。`;
      drawMap();notify('驾驶路线已生成，绿色引导线将带你到达目的地。');
    }finally{pending=false;q('#map-plan').disabled=false;}
  };
  function clearRoute(){autopilot.stop('路线已清除，自动驾驶结束。');route=null;routeIndex=0;guidance.hidden=true;if(routeLine){scene.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}}
  q('#map-clear').onclick=()=>{clearRoute();result.textContent='导航已清除。';drawMap();};
  q('#map-orbit').onclick=()=>{
    if(!flyer.active){result.textContent='关闭地图，登上NX07，上升至 600 m，再从这里进入轨道。';return;}
    if(flyer.altitude<600){result.textContent='飞行器尚未达到 600 m 入轨高度，请继续上升。';return;}
    const target={lat:selected.lat,lon:selected.lon,name:selected.name};close();flyer.orbit(target);
  };
  flyButton.onclick=boardShip;
  orbitButton.onclick=()=>flyer.orbit();
  addEventListener('keydown',e=>{
    if(overlayOpen||e.repeat||e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(e.code==='KeyF'&&!rover.driving()&&!paused&&!mapOpen&&!changing&&!refuge?.busy){
      e.preventDefault();
      if(refuge?.resting)refuge.rest(astronaut);
      else if(astronaut.active&&refuge?.ready&&(refuge.inside||refuge.distance(astronaut.position)<=2.3))useRefuge();
      else if(carrier.active)leaveCarrier();
      else if(flyer.active)leaveShip();
      else if(astronaut.active){
        if(carrier.ready&&distance(astronaut.position,carrier.position)<=8)boardCarrier();
        else if(shipReady&&distance(astronaut.position,flyer.position)<=64)boardShip();
        else boardRover();
      }else walk();
    }
    if(e.code==='Escape'&&!document.querySelector('.journey-menu')&&!mapOpen&&!pauseDialog.open){e.preventDefault();pauseButton.click();}
    if(e.code==='KeyM'){e.preventDefault();mapOpen?close():open();}
  });
  addEventListener('resize',()=>drawMap());
  function setOverlay(value){
    overlayOpen=!!value;uiBrake=false;operations.setInteract(false);
    const frozen=paused||mapOpen||overlayOpen;
    onBlock(frozen);flyer.setPaused(frozen);carrier.setPaused(frozen);astronaut.setPaused(frozen||!!refuge?.busy||!!refuge?.resting);
  }
  // Summon a vehicle beside the walking operator: it stops at exactly its nearest operating distance (+0 m).
  const SUMMON={ship:{name:'NX07',gap:55},carrier:{name:'ARES',gap:7},rover:{name:'MU-7',gap:3.5}};
  function summonSpot(gap,test){
    const o=astronaut.position;
    for(const r of [gap,gap+.5,gap+1])for(let i=0;i<24;i++){
      const a=astronaut.heading+i*Math.PI/12,x=o.x+Math.sin(a)*r,z=o.z+Math.cos(a)*r;
      if(!Number.isFinite(heightAt(x,z)))continue;
      const p=test(x,z,Math.atan2(o.x-x,o.z-z));if(p)return p;
    }
    return null;
  }
  // Spot finders read the operator's live position every call, so they also serve retargeting.
  function findSpot(kind){
    const cfg=SUMMON[kind],o=astronaut.position;
    if(kind==='ship'){
      const shipBlocked=(x,z)=>blocked(x,z)||carrier.contains(x,z)||Math.hypot(x-roverPoint().x,z-roverPoint().z)<3||!!refuge?.blocked(x,z);
      return summonSpot(cfg.gap,(x,z,heading)=>{const q={x,z,heading};if(!solveSupport(q,heightAt,shipBlocked).valid)return null;
        for(let lx=-36;lx<=36;lx+=6)for(let lz=-42;lz<=45;lz+=6){const w=worldXZ(q,lx,lz);if(shipBlocked(w.x,w.z)||Math.hypot(w.x-o.x,w.z-o.z)<2)return null;}return q;});
    }
    if(kind==='carrier')return summonSpot(cfg.gap,(x,z,a)=>{const q={x,z,heading:a+Math.PI/2};
      if((shipReady&&flyer.asset.contains(x,z,6))||(!carrier.loaded&&Math.hypot(x-roverPoint().x,z-roverPoint().z)<7)||!carrier.canTraverse(x,z,q.heading))return null;return q;});
    return summonSpot(cfg.gap,(x,z,a)=>{if(blocked(x,z)||carrier.contains(x,z)||(shipReady&&flyer.asset.contains(x,z,2))||refuge?.blocked(x,z))return null;
      const h=heightAt(x,z);if([[-2,0],[2,0],[0,-2],[0,2]].some(([dx,dz])=>blocked(x+dx,z+dz)||Math.abs(heightAt(x+dx,z+dz)-h)>.8))return null;return {x,z,heading:a};});
  }
  function summon(kind){
    if(paused||mapOpen||overlayOpen||changing||refuge?.busy||refuge?.inside||!astronaut.active||flyer.active||carrier.active||rover.driving())return notify('请在舱外步行状态下召唤载具。');
    const cfg=SUMMON[kind];
    if(kind==='ship'){
      if(!shipReady)return notify('NX07 尚未部署。');
      if(flyer.summoning)return notify('NX07 已在飞来途中。');
      if(!flyer.asset.doorClosed||flyer.asset.unloading)return notify('请先关闭 NX07 腹舱，再召唤。');
      shipTrack={still:0,key:'',spot:null};
      if(!flyer.fly(shipTarget,()=>{shipTrack=null;notify(`NX07 已降落，距你 ${Math.round(distance(flyer.position,astronaut.position))} m，可以登船。`);}))return notify('NX07 无法起飞，请检查腹舱与起落架。');
      return notify('NX07 无人起飞，跟随你的实时位置飞来；你停下后在身旁选平地降落。');
    }
    if(kind==='carrier'){
      if(!carrier.ready)return notify('ARES 尚在 NX07 内，请先卸车。');
      if(Math.abs(carrier.speed)>.4)return notify('ARES 仍在移动。');
      if(carrier.doorOpen)return notify('请先关闭 ARES 货舱，再召唤。');
      return driveSummon('carrier',cfg);
    }
    if(!delivered)return notify('MU-7 随 ARES 在 NX07 腹舱内，请先卸载 ARES。');
    if(!rover.ready())return notify('MU-7 尚未就绪。');
    if(carrier.loaded)return notify('MU-7 在 ARES 货舱内，请先卸载。');
    if(!rover.model())return notify('MU-7 尚未就绪。');
    return driveSummon('rover',cfg);
  }
  // NX07 target, polled every flight frame: follow while the operator walks; pick a landing spot once they stand still.
  let shipTrack=null;
  function shipTarget(dt=0){
    const o=astronaut.position;if(!shipTrack)return null;
    shipTrack.still=astronaut.speed>.2||!astronaut.active?0:shipTrack.still+dt;
    if(shipTrack.still>1.2){
      const key=Math.round(o.x)+','+Math.round(o.z);
      if(shipTrack.key!==key){shipTrack.key=key;shipTrack.spot=findSpot('ship');if(!shipTrack.spot)notify('你身旁 55 m 没有 NX07 可着陆的平地，NX07 在附近悬停等待，请走到开阔地。');}
      if(shipTrack.spot)return shipTrack.spot;
    }
    return {x:o.x,z:o.z,hover:true,radius:SUMMON.ship.gap};
  }
  // Ground summons: the route goal IS the operator's live position; it is replanned as they walk.
  const summonDrives={};
  function planSummonRoute(kind){
    const carrierKind=kind==='carrier',start=carrierKind?{x:carrier.position.x,z:carrier.position.z}:roverPoint(),o=astronaut.position,goal={x:o.x,z:o.z};
    const plan=planTerrainRoute({start,goal,heightAt,maxSlope:carrierKind?22:26,
      blocked:(x,z)=>Math.hypot(x-goal.x,z-goal.z)<SUMMON[kind].gap?false:blocked(x,z)||(shipReady&&flyer.asset.contains(x,z,carrierKind?6:2,carrierKind?carrierHeight():MU7_HEIGHT))||(carrierKind?Math.hypot(x-start.x,z-start.z)>7&&!carrier.canTraverse(x,z):carrier.contains(x,z))||!!refuge?.blocked(x,z)});
    return {ok:plan.ok,path:plan.ok&&plan.path.length>1?plan.path:[start,goal],length:plan.ok&&plan.length||Math.hypot(goal.x-start.x,goal.z-start.z),goal};
  }
  function driveSummon(kind,cfg){
    const r=planSummonRoute(kind);
    summonDrives[kind]={path:r.path,index:1,cfg,plannedFor:r.goal,clock:0,anchor:null,stalled:0};
    if(kind==='carrier')carrier.remote=(dt,p)=>summonControl(kind,p,dt);
    notify(`${cfg.name} 正在驶来，跟随你的实时位置${r.ok?'':'（暂无完整地形路线，直线试行）'}，约 ${Math.round(r.length)} m。`);
  }
  // Pure-pursuit along the route; the gap is measured to the operator's live position every frame.
  function summonControl(kind,p,dt){
    const d=summonDrives[kind],idle={throttle:0,steer:0,brake:0,tc:true,boost:false},brake={...idle,brake:1};
    if(!d)return brake;
    const o=astronaut.position,gapLeft=Math.hypot(o.x-p.x,o.z-p.z)-d.cfg.gap;
    if(gapLeft<=.1||(d.recoveries||0)>4){if(Math.abs(p.speed)<.08)finishSummon(kind);return brake;}
    const look=kind==='carrier'?5:3,path=d.path;
    while(d.index<path.length-1&&Math.hypot(path[d.index].x-p.x,path[d.index].z-p.z)<look)d.index++;
    // Near the operator (or at the route end) head straight at their live position.
    const t=gapLeft<6||d.index>=path.length-1?o:path[d.index],bearing=Math.atan2(t.x-p.x,t.z-p.z),angle=Math.atan2(Math.sin(bearing-p.heading),Math.cos(bearing-p.heading));
    if(!d.anchor||Math.hypot(p.x-d.anchor.x,p.z-d.anchor.z)>.3){d.anchor={x:p.x,z:p.z};d.stalled=0;}else d.stalled+=dt;
    // Stuck against terrain or an obstacle: back up with opposite lock, then resume the route.
    if(d.stalled>6&&!d.recover){d.recover=2.5;d.recoveries=(d.recoveries||0)+1;}
    if(d.recover>0){d.recover-=dt;if(d.recover<=0){d.recover=0;d.anchor=null;}return {...idle,throttle:-.6,steer:angle>0?1:-1};}
    // Far off the nose: a full-lock driving turn (measured ~4× faster than MU-7's on-the-spot pivot).
    // If the target sits inside the turning circle (still turning after 12 s), fall back to the on-the-spot pivot.
    if(kind==='rover'&&Math.abs(angle)>.6&&gapLeft>3){d.anchor=null;d.turning=(d.turning||0)+dt;return d.turning<12?{...idle,throttle:p.speed>1.5?0:.8,steer:angle>0?-1:1}:Math.abs(p.speed)>.3?brake:{...idle,steer:angle>0?-1:1};}
    d.turning=0;
    const desired=Math.min(kind==='carrier'?4:2.5,Math.max(.3,gapLeft*.4))/(1+Math.abs(angle)*1.5);
    // ARES throttle is a speed command (×8 m/s); MU-7 throttle is hub torque, so it needs real authority on grades.
    const throttle=kind==='carrier'?Math.min(.7,desired/8+Math.max(0,desired-p.speed)*.08):p.speed<desired?Math.min(1,.45+(desired-p.speed)*1.5):0;
    return {...idle,throttle,steer:Math.max(-1,Math.min(1,-angle*1.8)),brake:p.speed>desired+.5?1:0};
  }
  function finishSummon(kind){
    const d=summonDrives[kind];if(!d)return;delete summonDrives[kind];
    if(kind==='carrier'){carrier.remote=null;carrier.save();}
    const who=kind==='carrier'?carrier.position:roverPoint();
    notify(`${d.cfg.name} 已到位，距你 ${Math.round(distance(who,astronaut.position)*10)/10} m，可以等车。`);
  }
  function cancelSummon(kind,msg){const d=summonDrives[kind];if(!d)return;delete summonDrives[kind];if(kind==='carrier')carrier.remote=null;if(msg)notify(msg);}
  function trackOperator(dt){
    const o=astronaut.position;
    for(const kind of Object.keys(summonDrives)){
      const d=summonDrives[kind];d.clock+=dt;
      if(d.clock<.7||d.recover>0||Math.hypot(o.x-d.plannedFor.x,o.z-d.plannedFor.z)<2)continue;
      d.clock=0;const r=planSummonRoute(kind);Object.assign(d,{path:r.path,index:1,plannedFor:r.goal});
    }
  }
  function updateSummons(dt){
    if(summonDrives.carrier&&(carrier.active||!carrier.ready))cancelSummon('carrier');
    const walking=astronaut.active&&!refuge?.inside&&!flyer.active&&!carrier.active&&!rover.driving();
    if(!walking){for(const kind of Object.keys(summonDrives))cancelSummon(kind,`操作员已离开步行状态，${SUMMON[kind].name} 召唤取消。`);return;}
    if(dt)trackOperator(dt);
    const d=summonDrives.rover;if(!d)return;
    if(carrier.loaded||!rover.ready())return cancelSummon('rover','MU-7 召唤已由操作接管。');
    const m=rover.model();if(!m||!dt)return;
    const f=m.forward,input=summonControl('rover',{...roverPoint(),heading:f?Math.atan2(f.x,f.z):0,speed:rover.speed()},dt);
    m.step(dt,input,m.terrain);m.updateVisuals(dt,input);
  }
  // Flight plan (游隼航线图): open from the deck any time; NX07 flies it (see route-flight.js).
  const routeFlight=createRouteFlight({flyer,site,notify,setOverlay,arrival:options.routeArrival||null,shipReady:()=>shipReady,
    findLandingSpot:near=>findLandingSite(near,heightAt,(x,z)=>blocked(x,z)||carrier.contains(x,z)||!!refuge?.blocked(x,z)||Math.hypot(x-roverPoint().x,z-roverPoint().z)<4),
    onShipReady:()=>{shipReady=true;},onDepart:()=>{if(carrier.ready)carrier.save();options.onDepart?.();}});
  const deckButtons={ground:groundButton,view:viewButton,map:mapButton,fly:flyButton,orbit:orbitButton,leave:leaveButton,carrier:carrierButton,door:doorButton,cargo:cargoButton,shipDoor,shipUnload,shipLoad,refuge:refugeButton,rest:restButton,overview:overviewButton,mission:taskButton,pause:pauseButton};
  function deckCommand(id,pressed){
    if(pressed===false){if(id==='brake')uiBrake=false;if(id==='interact')operations.setInteract(false);flyer.hold(id,false);return;}
    if(paused||mapOpen||overlayOpen||changing||refuge?.busy)return;
    if(id==='brake'){if(flyer.active)flyer.hold('brake',true);else uiBrake=true;return;}
    if(id==='up'||id==='down'){flyer.hold(id,true);return;}
    if(id==='interact'){operations.setInteract(true);return;}
    if(id.startsWith('summon:'))return summon(id.slice(7));
    if(id==='route')return routeFlight.open();
    if(id==='route-fly')return routeFlight.active?routeFlight.cancel():routeFlight.start();
    if(id==='stop-remote')return walk();
    if(id==='emergency-brake'){autopilot.stop('紧急制动已接管。');emergencyBrake=true;return;}
    if(id==='emergency-hover')return flyer.hover();
    if(id==='auto'){if(autopilot.active)autopilot.stop('自动驾驶已停止。');else{open();if(route&&!q('#map-auto').disabled)q('#map-auto').click();}return;}
    if(id==='return-home'){const home=catalog().find(x=>x.id==='refuge');if(home){open();select(home);notify('已标记生活舱气闸。可规划地形路线，按 WASD 返回；不会自动移动人物。');}return;}
    if(id.startsWith('mission:'))return [...document.querySelectorAll('.journey-actions button')].find(b=>b.dataset.action===id.slice(8))?.click();
    if(id==='mode:walk'){if(carrier.active)return leaveCarrier();if(flyer.active)return leaveShip();return walk();}
    if(id==='mode:remote'){if(carrier.active||flyer.active){notify('请先停稳离开当前载具，再连接 MU-7。');return;}return boardRover();}
    if(id==='mode:carrier'){if(!carrier.ready){notify('ARES 尚在 NX07 内，请先卸车。');return;}if(!astronaut.active){notify('先切换为步行，再靠近 ARES 8 m 内登车。');return;}return boardCarrier();}
    if(id==='mode:flight'){if(flyer.active)return;return boardShip();}
  }
  commandDeck=mountMobilityDeck({heightAt,renderer:options.renderer,buttons:deckButtons,command:deckCommand,setOverlay,read:()=>({
    current:carrier.active?'carrier':flyer.active?'flight':rover.driving()?'remote':astronaut.active?'walk':'overview',player:player(),carrier,flyer,astronaut,operations,roverModel:rover.model(),roverSpeed:rover.speed(),roverPoint:roverPoint(),autopilot,route,routeFlight,refuge,site,shipReady,delivered,inRefuge:!!refuge?.inside,summons:Object.keys(summonDrives).concat(flyer.summoning?['ship']:[]),
    landmarks:catalog(),title:titleLabel.textContent,subtitle:modeLabel.textContent,status:stateLabel.textContent+' · '+hint.textContent,view:carrier.active?carrier.view:flyer.active?flyer.view:rover.driving()?rover.view?.():astronaut.view,paused:paused||mapOpen||overlayOpen||changing||document.hidden
  })});
  addEventListener('keydown',e=>{
    if(paused||mapOpen||overlayOpen||e.repeat||e.target.closest?.('input,textarea,select,dialog'))return;
    const action=carrier.active?{KeyN:'auto',KeyT:'door',KeyL:'cargo'}[e.code]:flyer.active?{KeyG:'fly',KeyO:'orbit'}[e.code]:null;
    if(action){e.preventDefault();deckButtons[action]?deckButtons[action].click():deckCommand(action);}
  });
  return {
    arrivalSite(p){flyer.park(p);shipReady=true;refuge?.landed();},get refuge(){return refuge;},unloadShip,loadShip,driveControl,get autopilot(){return autopilot;},
    get remote(){return !!rover?.driving();},get roverStowed(){return !delivered?'ship':carrier.ready&&carrier.loaded?'carrier':'';},get roverPosition(){return {...roverPoint()};},get active(){return flyer.active||carrier.active;},get carrier(){return carrier;},boardCarrier,leaveCarrier,boardShip,cargoAction,summon,get summons(){return Object.keys(summonDrives).concat(flyer.summoning?["ship"]:[]);},get walking(){return astronaut.active;},get astronaut(){return astronaut;},walk,boardRover,get blocked(){return mapOpen;},get flyer(){return flyer;},openMap:open,routeFlight,
    setPaused(value){paused=value;flyer.setPaused(paused||mapOpen||overlayOpen);carrier.setPaused(paused||mapOpen||overlayOpen);astronaut.setPaused(paused||mapOpen||overlayOpen||!!refuge?.busy||!!refuge?.resting);},
    operations,
    update(dt,now=performance.now()){
      routeFlight.tick(paused||mapOpen||overlayOpen||document.hidden?0:dt,{now,halted:paused||document.hidden});
      operations.update(paused||mapOpen||overlayOpen||document.hidden?0:dt);updateSummons(paused||mapOpen||overlayOpen||document.hidden?0:Math.min(dt,.05));
      if(autopilot.active&&((autopilot.owner==='carrier'&&!carrier.active)||(autopilot.owner==='rover'&&!rover.driving())))autopilot.stop('操作模式已切换，自动驾驶结束。');
      autoStop.hidden=!autopilot.active;
      q('.map-auto-hint').textContent=autopilot.active?'自动驾驶暂停于地图；关闭地图后继续。':!carrier.active&&!rover.driving()?'先连接 MU-7 遥控或登上 ARES，再启动自动驾驶。':carrier.active&&carrier.doorOpen?'关闭货舱后才能启动自动驾驶。':!route?'先选择目的地并规划路线。':'到达后自动停车；WASD / 空格可手动接管。';
      q('#map-auto').disabled=!route||autopilot.active||(!carrier.active&&!rover.driving())||carrier.active&&carrier.doorOpen;
      flyer.update(mapOpen?0:dt);carrier.update(mapOpen?0:dt);
      if(carrier.active&&!changing&&shipReady&&flyer.asset.padReady&&dockState().ready){dockHold+=paused||mapOpen||overlayOpen||document.hidden?0:dt;if(dockHold>=.8){dockHold=0;dockCarrier();}}else dockHold=0;
      astronaut.update(mapOpen||changing?0:dt);if(carrier.active)astronaut.seatView(carrier.view==='驾驶舱');
      refuge?.update(paused||mapOpen||overlayOpen||document.hidden?0:dt);
      if(rover?.ready()){prepareShip();prepareCarrier();}
      if(now-lastPaint<150)return;lastPaint=now;
      if(route&&JSON.stringify(obstacles())!==routeObstacles){clearRoute();notify('基地布局已改变，请重新规划驾驶路线。');}
      flyButton.textContent=flyer.active?(flyer.landing?'正在垂直降落…':'垂直降落'):'登上NX07飞行器';
      flyButton.disabled=paused||mapOpen||changing||flyer.transferring||flyer.landing;
      const driving=rover?.driving();
      groundButton.textContent=astronaut.active?'遥控 MU-7':driving?'结束遥控':'开始探索 · F';
      groundButton.disabled=paused||mapOpen||changing||flyer.active;
      document.body.classList.toggle('rover-driving',!!driving);
      viewButton.hidden=!astronaut.active;viewButton.textContent=astronaut.view+' · C';viewButton.disabled=paused||mapOpen;
      leaveButton.hidden=!flyer.active;leaveButton.disabled=paused||mapOpen||flyer.altitude>2.5||Math.abs(flyer.speed)>.5||flyer.landing||flyer.transferring;
      overviewButton.hidden=!astronaut.active;
      evaStatus.hidden=!astronaut.active&&!driving;
      const rd=distance(astronaut.position,roverPoint()),sd=distance(astronaut.position,flyer.position);
      evaStatus.textContent=`舱外步行 · ${astronaut.view} · ${astronaut.speed.toFixed(1)} m/s\nWASD 移动 · Shift 快走 · 拖动环视 · C 切换视角\nMU-7 ${Math.round(rd)} m · NX07 ${shipReady?Math.round(sd)+' m':'待部署'} · ${shipReady&&sd<=64?'F 登船':'F 遥控 · M 地图'}`;
      if(driving)evaStatus.textContent=`MU-7 · 无人遥控连接中\n操作员距探测车 ${Math.round(rd)} m · 面板结束遥控返回原位\nC 切换机位 · 桅杆视角为相机回传`;
      orbitButton.hidden=!flyer.active;orbitButton.disabled=flyer.altitude<600||flyer.transferring||flyer.landing;
      orbitButton.textContent=flyer.transferring?'轨道转移中…':flyer.altitude<600?'上升至 600 m 可入轨':'进入火星轨道';
      flightStatus.hidden=!flyer.active;
      flightStatus.textContent=`NX07 VTOL · 离地 ${Math.round(flyer.altitude)} m · ${Math.abs(flyer.speed*3.6).toFixed(0)} km/h${routeFlight.active?' · '+routeFlight.status:''}\nW/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速\n拖动环视 · 滚轮调整视距`;
      const current=carrier.active?'carrier':flyer.active?'flight':driving?'remote':astronaut.active?'walk':'overview';
      document.body.dataset.mobilityMode=current;
      const nearCarrier=carrier.ready&&astronaut.active&&distance(astronaut.position,carrier.position)<=10;
      const canBoardCarrier=nearCarrier&&distance(astronaut.position,carrier.position)<=8;
      const inRefuge=astronaut.active&&(!!refuge?.inside||!!refuge?.busy);
      document.body.classList.toggle('in-refuge',inRefuge&&astronaut.active);
      const helmetLabel=document.querySelector('.eva-helmet small');if(helmetLabel)helmetLabel.textContent=inRefuge?'临时生活舱':'舱外步行';
      const nearShip=shipReady&&astronaut.active&&!inRefuge&&sd<=72;
      const nearShipDriving=shipReady&&carrier.active&&delivered&&distance(carrier.position,flyer.position)<=95;
      shipChecks.hidden=!nearShip;shipChecks.textContent=nearShip?`腹舱检查 · ${flyer.asset.status} · ${checkShipDoor().reason}`:'';
      shipUnload.hidden=!nearShip;shipDoor.hidden=!(nearShip||nearShipDriving);shipLoad.hidden=!(nearShip||nearShipDriving)||!delivered;shipLoad.disabled=changing||paused||mapOpen;shipLoad.textContent=!carrier.active?'装载 ARES 回NX07':!flyer.asset.doorOpen?'开舱 · 驶入装船':!flyer.asset.padReady?'装载位下降中…':'装船登舰';shipDoor.textContent=flyer.asset.doorOpen?'关闭NX07腹舱':'打开NX07腹舱';shipDoor.disabled=changing||paused||mapOpen||!flyer.asset.supportReady;
      shipUnload.disabled=changing||delivered||paused||mapOpen;
      shipUnload.textContent=delivered?'物资已卸载':changing?'正在处理…':!flyer.asset.doorOpen?'打开腹舱并卸载 ARES':!flyer.asset.doorReady?'升降平台展开中…':'卸载 ARES 与物资';
      carrierButton.hidden=!(carrier.active||canBoardCarrier);carrierButton.textContent=carrier.active?'下车 · F':'登上 ARES · F';carrierButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      groundButton.hidden=carrier.active||flyer.active||inRefuge;groundButton.disabled=paused||mapOpen||changing||(astronaut.active&&(carrier.loaded||!delivered));
      flyButton.hidden=!flyer.active&&!nearShip;
      leaveButton.hidden=!flyer.active;
      viewButton.hidden=current==='overview';viewButton.textContent='视角 · C';
      doorButton.hidden=cargoButton.hidden=!(carrier.active||nearCarrier);
      doorButton.disabled=cargoButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      doorButton.textContent=carrier.doorOpen?'关闭货舱':'打开货舱';cargoButton.textContent=carrier.loaded?'卸载 MU-7':'装载 MU-7';
      overviewButton.hidden=!(options.kind==='park'&&astronaut.active);
      taskButton.hidden=!document.querySelector('.journey-objective');pauseButton.hidden=!!document.querySelector('.journey-menu');
      const info={
        carrier:['SURFACE TRANSPORT','ARES · 载人运输车',carrier.doorOpen?'货舱开启 · 驱动锁定':'地面驾驶', [['速度',(Math.abs(carrier.speed)*3.6).toFixed(0)+' km/h'],['货舱',carrier.loaded?'MU-7 + 生存包':'初始生存包'],['视角',carrier.view]],Math.abs(carrier.speed)>.4?'按空格停稳后可下车、装卸。':'货舱开启时无法行驶；关闭货舱后 W 前进。','W/S 前进倒车 · A/D 转向 · 空格制动 · C 驾驶舱/跟车 · F 下车 · 拖动环视 / 滚轮缩放'],
        flight:['FLIGHT CONTROL','NX07 · 飞行器',flyer.transferring?'轨道转移':flyer.landing?'自动降落':flyer.altitude<3?'已着陆':'飞行中', [['速度',(Math.abs(flyer.speed)*3.6).toFixed(0)+' km/h'],['起落架',flyer.asset.status],['视角',flyer.view]],flyer.altitude>2.5?'离船需先降落；离地 600 m 可转入轨道。':'E 垂直起飞；F 离船步行。','W/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速 · C 视角 · F 离船'],
        remote:['REMOTE LINK','MU-7 · 无人探测车','遥控已连接', [['速度',(Math.abs(rover.speed())*3.6).toFixed(0)+' km/h'],['电量',operations.state.power.toFixed(1)+'%'],['视角',rover.view?.()||'跟车']], '操作员留在原地。点击结束遥控返回操作员；F 控制车灯。','W/S 前进倒车 · A/D 转向 · 空格制动 · C 机位 · E 任务勘测 · G 雷达 · R 机械臂（WASD 瞄准） · T 太阳翼 · Y 牵引控制 · F 车灯 · B 中继器 · P 摄影 · K 拍照 · X 扶正 · Tab 图鉴 · H 隐藏界面 · 按住 E 交互'],
        walk:['EXTRAVEHICULAR','舱外步行','宇航员', [['速度',astronaut.speed.toFixed(1)+' m/s'],['运输车',carrier.ready?Math.round(distance(astronaut.position,carrier.position))+' m':'待部署'],['NX07',shipReady?Math.round(sd)+' m':'待部署']], canBoardCarrier?'F 登上 ARES；可在此装卸探测车。':nearCarrier?'再靠近至 8 m 内登车；当前可装卸探测车。':nearShip?'F 登上NX07。':'F 遥控 MU-7；在地图查看载具停放位置。','WASD 步行 · Shift 快走 · C 第一/第三人称 · 拖动环视 · F 交互 · M 地图'],
        overview:['EXPEDITION','火星探索','场景总览', [['探测车','MU-7'],['运输车',carrier.ready?'已部署':'待部署'],['NX07',shipReady?'已部署':'待部署']], '开始探索，靠近载人车或飞船登乘。','F 进入步行 · M 地图导航']
      }[current];
      modeLabel.textContent=info[0];titleLabel.textContent=info[1];stateLabel.textContent=autopilot.active?'自动驾驶中':info[2];info[3].forEach(([label,value],i)=>{metricNodes[i].label.textContent=label;metricNodes[i].value.textContent=value;});hint.textContent=current==='carrier'&&nearShipDriving?(changing?'装船进行中…':flyer.asset.padReady?dockHint(dockState()):flyer.asset.doorOpen?'主升降平台下降中，落地后高亮。':'靠近NX07 · 打开腹舱后沿舰尾灯带驶上主升降平台，停稳即装船登舰。'):info[4];help.querySelector('p').textContent=info[5];
      refugeButton.hidden=!refuge?.ready||!astronaut.active||(!inRefuge&&refuge.distance(astronaut.position)>8);
      refugeButton.textContent=refuge?.busy?'气闸循环中…':refuge?.inside?'通过气闸出舱 · F':'进入生活舱 · F';
      refugeButton.disabled=paused||mapOpen||changing||!!refuge?.busy||!!refuge?.resting||(!!refuge&&refuge.distance(astronaut.position)>2.3);
      restButton.hidden=!refuge?.inside||!!refuge?.busy||!astronaut.active;restButton.textContent=refuge?.resting?'起身 · F':'坐下休息';restButton.disabled=paused||mapOpen;
      if(inRefuge&&astronaut.active){
        modeLabel.textContent='SURFACE REFUGE';titleLabel.textContent='单体生活舱';stateLabel.textContent=refuge.busy?'气闸循环':refuge.resting?'休息中':'已入舱';hint.textContent=refuge.label;
        [['环境',refuge.busy?'气闸隔离':'舱内'],['舱门',refuge.busy?Math.round(refuge.progress*100)+'%':'双门锁闭'],['状态',refuge.resting?'休息':'暂时居住']].forEach(([label,value],i)=>{metricNodes[i].label.textContent=label;metricNodes[i].value.textContent=value;});
        help.querySelector('p').textContent='WASD 舱内走动 · 拖动环视 · C 视角 · 走近气闸 F 出舱 · 坐下休息后 F 起身';
        for(const b of [carrierButton,flyButton,shipDoor,shipUnload,shipLoad,doorButton,cargoButton,overviewButton])b.hidden=true;
        viewButton.disabled=!!refuge.busy||!!refuge.resting||paused||mapOpen;
      }
      if(route&&!flyer.active){
        const p=player();while(routeIndex<route.path.length-1&&Math.hypot(p.x-route.path[routeIndex].x,p.z-route.path[routeIndex].z)<Math.max(8,route.cell*1.6))routeIndex++;
        const t=route.path[routeIndex],d=Math.hypot(p.x-t.x,p.z-t.z),end=route.path.at(-1),done=Math.hypot(p.x-end.x,p.z-end.z)<12;
        let angle=Math.atan2(t.x-p.x,t.z-p.z)-(p.heading||0);angle=Math.atan2(Math.sin(angle),Math.cos(angle));
        guidance.hidden=false;guidance.textContent=done?`已到达 · ${route.target}`:`${Math.abs(angle)<.3?'↑':angle>0?'←':'→'} ${route.target} · 下一路点 ${Math.round(d)} m${d>Math.max(70,route.cell*5)?' · 已偏离，点击重新规划':''}`;
      }else guidance.hidden=true;
      commandDeck.update();
      if(mapOpen)drawMap();
    }
  };
}
