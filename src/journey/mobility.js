import {mountSupportUI} from './support-ui.js';
import {normalizeSupport,rescueInScene} from './support.js';
import { mountMarsSound } from './sound.js';
import {mountLightPort} from './light-port.js';
import {SHIP_POWER,expeditionBudget,budgetText,budgetStatus,returnPowerAvailable} from './expedition-energy.js';
import { createRoverOperations } from './rover-operations.js';
import {getMarsDust} from './mars-dust.js';
import {createVehicleDustSources} from './dust-sources.js';
import * as THREE from 'three';
import { PLACES } from './landmarks.js';
import { planTerrainRoute, pointSegmentDistance, localToGeo, geoToLocal } from './route.js';
import { createFlyer } from './flight.js';
import { createAutopilot, AUTO_SPEED, lookAhead } from './autopilot.js';
import { createCarrier, ARES_DRIVE, ARES_ROUTE_MARGIN } from './carrier.js';
import { createAstronaut } from './astronaut.js';
import { findExit } from './walking.js';
import { getJourney, updateJourney, getSettings, sceneURL, resumeScene, deliveryPod } from './state.js';
import {readCarrierSave} from './carrier-save.js';
import { LOCAL_KM, CRZ_MAX_KM } from '../nav/flight-plan.js';
import { RELICS } from '../nav/route-chart.js';
import { createSurfaceRefuge, REFUGE_SITE, REFUGE_HEADING } from './surface-refuge.js';
import { mountOutpostStationUI } from './outpost-station-ui.js';
import { OUTPOST_LENGTH, OUTPOST_WIDTH, OUTPOST_HEIGHT, padExtent, mapping } from './outpost-layout.js';
import {findLandingSite,solveSupport,worldXZ,NX07,NX07_SCALE,ARES,ARES_FOOTPRINT,LOAD_PAD,dockStatus,SHIP_BOARD,ARRIVAL_BASE} from './landing-support.js';
// Ship-sized walking radii (exit, boarding, summon hover) follow the hull scale.
const SHIP_EXIT=55*NX07_SCALE,SHIP_DRIVE_DOCK=95*NX07_SCALE;
// Stepping out on foot: just clear of the hull's side (38 m half-width at 1x), not 27 m past it.
// SHIP_EXIT stays the fallback ring when that side is blocked.
const SHIP_STEP_OUT=38*NX07_SCALE+6;
// Within this distance of the outpost a fresh load parks NX07 at its home spot in front of the door.
const SHIP_HOME_RANGE=400;
// Working distance for belly-bay tasks: under the hull, closer in than SHIP_BOARD.
const SHIP_SERVICE=72;
// Column heights (m) for passing under the NX07 hull: suit with helmet; MU-7 with mast head.
const EVA_HEIGHT=1.95,EVA_RADIUS=.35,MU7_HEIGHT=3.2;
import {mountMobilityDeck} from './mobility-deck.js';
import {createMapRelief,shadeRelief} from './map-relief.js';
import {createRouteFlight} from './route-flight.js';
import {createRangeRing} from './range-ring.js';
import {sfx} from './sfx.js';
import {createSfxWatch} from './sfx-watch.js';

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
export function mountMobility(options) {
  const {site,scene,camera,canvas,heightAt,getPlayer,getLandmarks=()=>[],getObstacles=()=>[],onBoard,onBlock,notify:deliver=()=>{},onOrbit}=options;
  const sound=mountMarsSound();
  const notice=el('div','mobility-toast');notice.setAttribute('role','status');notice.hidden=true;document.body.append(notice);let noticeTimer;
  let light=null;
  let commandDeck=null,overlayOpen=false,uiBrake=false,emergencyBrake=false;
  // 音效（D78）：watch 看每帧的状态决定什么时候响；按钮点击统一出声。
  const watch=createSfxWatch(sfx);sfx.bindButtons();
  // kind 'door'：舱门没关妥，响警号。没给 kind 的，照文字认出「被拒绝」的提示（请……、尚未……、无法……），轻轻一声。
  const notify=(message,kind)=>{if(kind||/^请|请先|尚未|无法|没有安全/.test(message))watch.refuse(kind||'deny');deliver(message);commandDeck?.notify(message);if(!commandDeck&&!document.body.classList.contains('journey-mode')){notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},4200);}};
  const autopilot=createAutopilot(notify);
  const link=el('link');link.rel='stylesheet';link.href=new URL('./mobility.css',import.meta.url).href;document.head.append(link);
  let paused=false,mapOpen=false,mode='local',selected=null,route=null,routeLine=null,routeIndex=0,lastPaint=0,pending=false,routeObstacles='';
  let refuge=null;
  // 前哨仓在这张粗障碍图里是一条和舱段串等长的线段，不再是旧那颗小舱的 3.8 m 圆——圆圈会把新舱门
  // 和坡道一起圈掉，人走到门口就被判成撞上建筑。线段给载具寻路和地图用；人步行的精确判定走
  // refuge.outsideBlocked（它知道坡道是留出来的），所以 outsideOccupied 不吃这一条。
  // The string runs along the outpost's local X, whatever way the outpost is turned.
  const hullSpan=()=>{
    if(!refuge?.ready)return [];
    const p=refuge.position,half=OUTPOST_LENGTH/2-2.4,ax=Math.cos(refuge.heading)*half,az=-Math.sin(refuge.heading)*half;
    return [{type:'line',height:OUTPOST_HEIGHT,radius:OUTPOST_WIDTH/2+.6,a:{x:p.x-ax,z:p.z-az},b:{x:p.x+ax,z:p.z+az}}];
  };
  const obstacles=()=>[...getObstacles(),...hullSpan()];
  const covers=(o,x,z)=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132);
  // 遗迹（src/relics）：载具按外接圆挡，人走路按真实占地图，降落另有 60 m 禁降圈。
  const relics=options.relics||null;
  const blocked=(x,z)=>!!options.extraBlocked?.(x,z)||obstacles().some(o=>covers(o,x,z))||!!relics?.vehicleBlocked(x,z);
  const worldBlocked=(x,z)=>getObstacles().some(o=>covers(o,x,z));
  const ceilingAt=(x,z)=>heightAt(x,z)+Math.max(0,...obstacles().filter(o=>covers(o,x,z)).map(o=>o.height||70));
  const rover=options.rover;
  // MU-7 always arrives inside ARES, and ARES inside NX07. Until ARES is unloaded MU-7 has no ground position.
  const roverAboardShip=()=>!delivered;
  const roverOnGround=()=>delivered&&!carrier.loaded&&!!rover?.ready();
  const roverPoint=()=>roverAboardShip()&&shipReady?{x:flyer.position.x,z:flyer.position.z,heading:flyer.heading}:rover?.position()||getPlayer();
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  // Preserve the landing refuge where possible; a built campus may occupy that
  // coordinate in the park view, so choose a clear service-area position there.
  // The outpost needs its whole graded pad clear, fill slope included — 265 x 129 m at scale 6.0,
  // not the 8 m the old pod took (D69). Sampled every 8 m: a tram line is 12 m across.
  const refugePad=padExtent(),toRefugePad=p=>mapping(p.x,p.z,REFUGE_HEADING);
  const safeRefuge=p=>{
    const world=toRefugePad(p);
    for(let lx=-refugePad.halfX;lx<=refugePad.halfX;lx+=8)for(let lz=refugePad.zNeg;lz<=refugePad.zPos;lz+=8){
      const w=world(lx,lz);if(!Number.isFinite(heightAt(w.x,w.z))||blocked(w.x,w.z))return false;
    }
    return true;
  };
  // Where NX07 stands relative to the outpost: the arrival base, carried along with the site.
  const shipBaseFor=p=>({x:p.x+ARRIVAL_BASE.x-REFUGE_SITE.x,z:p.z+ARRIVAL_BASE.z-REFUGE_SITE.z,heading:ARRIVAL_BASE.heading});
  const shipBaseClear=p=>{
    const b=shipBaseFor(p);
    for(let x=-36*NX07_SCALE;x<=36*NX07_SCALE;x+=12*NX07_SCALE)for(let z=-42*NX07_SCALE;z<=45*NX07_SCALE;z+=14.5*NX07_SCALE)if(blocked(b.x+x,b.z+z))return false;
    return true;
  };
  // Nearest clear site, searched outward in 30 m rings; a pad this size rarely fits within a short walk.
  // Sites that also leave NX07's place in front of the door free come first, so the ship is not sent
  // round the far side of a campus dome.
  const findRefugeSite=near=>{
    for(const withShip of [true,false])
      for(let ring=1;ring<=24;ring++)for(let edge=-ring;edge<=ring;edge++)for(const [x,z] of [[edge,-ring],[edge,ring],[-ring,edge],[ring,edge]]){
        const p={x:near.x+x*30,z:near.z+z*30};if(safeRefuge(p)&&(!withShip||shipBaseClear(p)))return p;
      }
    return null;
  };
  // The pod is delivered only at the first landing; scenes reached by NX07 travel show it only if that site is in range.
  const pod=options.travel?deliveryPod(site,REFUGE_SITE,LOCAL_KM*1000):{home:site,position:REFUGE_SITE};
  let refugeSite=pod.position;
  if(refugeSite&&!safeRefuge(refugeSite))refugeSite=findRefugeSite(options.travel?refugeSite:getPlayer());
  if(refugeSite)refuge=createSurfaceRefuge({scene,camera,heightAt,sitePosition:refugeSite,arriving:!!options.arriving,saveKey:`cosmos.refuge.v1:${options.kind}:${pod.home.lat}:${pod.home.lon}:${getJourney()?.startedAt||'free'}`});
  const outsideOccupied=(x,z)=>!!options.extraBlocked?.(x,z)||worldBlocked(x,z)||(roverOnGround()&&distance({x,z},roverPoint())<2.3)||(shipReady&&flyer.asset.contains(x,z,EVA_RADIUS,EVA_HEIGHT))||carrier.contains(x,z)||!!light?.contains(x,z)||!!relics?.walkBlocked(x,z);
  // ARES carrying MU-7 stands taller than the bare truck.
  const carrierHeight=()=>carrier.loaded?5.9:ARES.height;
  const walkBlocked=(x,z)=>refuge?.inside?refuge.blocked(x,z):outsideOccupied(x,z)||!!refuge?.blocked(x,z);
  // Boots stand on a crew lift deck that has left the hull, so the deck carries whoever is on it.
  // 舱外也踩前哨仓自己平整出来的场地和坡道（refuge.floor 在舱外就是 pad/ramp 高度），
  // 否则走到舱门口人还站在原始地形上，门在头顶 1.35 m。NX07 的升降平台优先。
  const walkFloor=(x,z)=>{
    if(refuge?.inside)return refuge.floor(x,z);
    const deck=shipReady?flyer.asset.deckAt(x,z):null;
    if(deck!=null)return deck;
    return refuge?.ready?refuge.floor(x,z):heightAt(x,z);
  };
  // Walking uses plan-view footprints, but the camera can pass above low obstacles.
  // Give its boom a height-aware query instead of treating every footprint as an
  // infinitely tall wall. NX07's articulated hull remains in solidAt below.
  const cameraBlocked=(x,y,z)=>{
    if(refuge?.inside)return refuge.blocked(x,z);
    if(refuge?.outsideBlocked(x,z)&&y<refuge.position.y+OUTPOST_HEIGHT)return true;
    if(getObstacles().some(o=>covers(o,x,z)&&y<heightAt(x,z)+(o.height||70)))return true;
    if(relics?.cameraBlocked(x,y,z))return true;
    if(roverOnGround()&&distance({x,z},roverPoint())<2.3&&y<heightAt(x,z)+2.6)return true;
    return (carrier.contains(x,z)&&y<carrier.position.y+carrierHeight())||(light?.contains(x,z)&&y<light.car.position.y+5.45);
  };
  const astronaut=createAstronaut({scene,camera,canvas,firstPersonFov:options.firstPersonFov,heightAt:walkFloor,ceilingAt:(x,z)=>refuge?.ceiling(x,z)??Infinity,solidAt:(x,y,z)=>shipReady&&flyer.asset.solidAt(x,y,z),blocked:walkBlocked,cameraBlocked,
    // Boots only print in soil: the shelter floor and a lowered NX07 deck are metal, and heightAt
    // hands both of those back as "the ground".
    printable:(x,z)=>!refuge?.inside&&!(shipReady&&flyer.asset.deckAt(x,z)!=null)});
  let changing=false, shipReady=false, operatorPlaced=false;
  const flyer=createFlyer({scene,camera,canvas,heightAt,blocked,ceilingAt,site,getPlayer,
    onBoard:()=>{astronaut.stop();onBoard();document.body.classList.add('is-flying');},
    onLand:()=>{},onOrbit:p=>{options.getGrid?.()?.flush?.();onOrbit?.(p);},notify,departureGuard:()=>carrier?.shipConnected?'先断开NX07 → ARES供电连接，再起飞或召唤。':options.getGrid?.()?.ship?.energy<=0?'船载电池耗尽；先恢复核电补电，再出发。':''});
  const shipRing=createRangeRing({scene,heightAt,radius:SHIP_BOARD});
  const savedCarrier=readCarrierSave(localStorage,options.kind,site,getJourney()?.startedAt||'free');
  const saveKey=savedCarrier.key;
  let carrierSave=savedCarrier.value;
  // ARES rides the outpost's graded pad, ramp and fill like the crew do. At scale 6.0 the deck stands
  // up to 3.5 m above the plain; on the raw terrain underneath, the truck drove about buried to its roof
  // (D64 left vehicles on the terrain when the drop was 0.9 m; D69).
  const padFloor=(x,z)=>refuge?.ready?refuge.drop.floorAt(x,z):null;
  const vehicleGround=(x,z)=>padFloor(x,z)??heightAt(x,z);
  const carrier=createCarrier({scene,camera,canvas,getShipPoint:()=>shipReady&&flyer.grounded&&!flyer.summoning&&!flyer.piloting&&!flyer.landing&&!flyer.transferring&&Math.abs(flyer.speed)<.4?flyer.position:null,getGrid:()=>options.getGrid?.(),getCargo:()=>options.cargoManifest?.()||{label:carrier?.loaded?'MU-7 · 已固定':'货位空',massKg:carrier?.loaded?null:0},cargoOccupied:()=>options.cargoOccupied?.()||false,heightAt:vehicleGround,blocked:(x,z)=>blocked(x,z)||!!light?.contains(x,z),footprintBlocked:(x,z,yaw,low,high)=>shipReady&&flyer.asset.rectHits(x,z,yaw,ARES_FOOTPRINT,low,high,carrierHeight()),solidAt:(x,y,z)=>shipReady&&flyer.asset.solidAt(x,y,z),rover,notify,
    driveControl:(input,dt)=>driveControl(input,dt,'carrier'),
    onBoard:()=>{rover.exit();astronaut.stop();astronaut.seat(carrier.asset.group,carrier.asset.sockets['mount.driver']);onBoard();},
    onSave:value=>{try{localStorage.setItem(saveKey,JSON.stringify({...value,unloadedFromKestrel:delivered===true}));}catch{}}});
  addEventListener('pagehide',()=>{if(carrier.ready)carrier.save();});
  const dust=getMarsDust({scene,camera,heightAt,surfaceAt:(x,z)=>{
    if(blocked(x,z))return 0;
    // Lowered metal lift decks are driveable floors, not exposed regolith.
    if(flyer.grounded)for(let i=0;i<5;i++)if(flyer.asset.portState(i).lift>=.999&&flyer.asset.underPort(i,x,z))return 0;
    return 1;
  }});
  const updateDustSources=createVehicleDustSources({dust,heightAt});
  const operations=createRoverOperations({audio:sound,scene,canvas,heightAt:vehicleGround,dust,rover:{...rover,carrier:()=>carrier},
    enabled:()=>rover.driving()&&!paused&&!mapOpen&&!overlayOpen&&!document.hidden,loaded:()=>carrier.loaded,
    findHome:p=>findExit(p,24,heightAt,blocked),saveKey:saveKey.replace('carrier','rover-ops'),morningStart:!!options.morningStart,holdDay:!!options.holdDay,onSample:sample=>options.onSample?.(sample),onArchive:sample=>options.onArchive?.(sample),getGrid:options.getGrid,notify,stopAuto:()=>{if(autopilot.active)autopilot.stop('仪器操作已接管，自动驾驶结束。');},photo:()=>rover.photo?.(),openMap:()=>open()});
  function driveControl(input,dt,vehicle='rover'){
    if(vehicle==='carrier'&&canCaptureDock()){
      if(!dockCapture&&dockState().inZone){dockCapture=true;if(autopilot.active)autopilot.stop('主平台已接管入库。');notify('已进入自动入库区：正在减速，随后自动对中、转正并升舱。');}
      if(dockCapture)return {...input,throttle:0,steer:0,brake:1,dockBrake:true};
    }
    if(uiBrake||emergencyBrake)input={...input,throttle:0,steer:0,brake:1};
    if(emergencyBrake&&Math.abs(vehicle==='carrier'?carrier.speed:rover.speed())<.05)emergencyBrake=false;
    const m=rover.model(),forward=m?.forward;
    const p=vehicle==='carrier'?{...carrier.position,heading:carrier.heading,speed:carrier.speed}:{...roverPoint(),heading:forward?Math.atan2(forward.x,forward.z):0,speed:rover.speed()};
    const control=autopilot.drive(input,p,vehicle,dt,blocked);
    return vehicle==='rover'?operations.drive(control,dt):control;
  }
  if(new URLSearchParams(location.search).get('light')==='1'&&!new URLSearchParams(location.search).has('journey'))light=mountLightPort({scene,camera,canvas,flyer,heightAt,blocked:(x,z)=>blocked(x,z)||carrier.contains(x,z)||(roverOnGround()&&distance({x,z},roverPoint())<2.5),astronaut,notify,walkBlocked,saveKey,
    frozen:()=>paused||mapOpen||overlayOpen||document.hidden||changing||!!refuge?.busy,
    canBoard:()=>astronaut.active&&!refuge?.inside&&!carrier.active&&!flyer.active&&!rover.driving(),stopOther:()=>{rover.exit();autopilot.stop();}});
  let delivered=carrierSave?.unloadedFromKestrel===true;flyer.asset.setDelivered(delivered);
  function prepareCarrier(){
    if(changing)return;
    if(!delivered){const m=rover.model();if(m)m.root.visible=false;return;}
    if(carrier.ready||!rover.ready())return;
    if(carrierSave&&Number.isFinite(carrierSave.x)&&Number.isFinite(carrierSave.z)&&Number.isFinite(carrierSave.heading)&&carrier.park(carrierSave,{restore:true})){
      if(carrierSave.loaded===true)carrier.dock({restore:true});return;
    }
    const p=findExit(roverPoint(),32,heightAt,(x,z)=>blocked(x,z)||flyer.asset.contains(x,z,2));
    if(p&&carrier.park(p))carrier.save();
  }
  function boardCarrier(){
    if(light?.active)return;
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
    if(!flyer.grounded)return {ok:false,reason:'请先着陆并停机，再操作腹舱'};
    const ramp=flyer.asset.checkRamp(blocked);if(!ramp.ok)return ramp;
    const yaw=flyer.heading,c=Math.cos(yaw),s=Math.sin(yaw),at=p=>{const dx=p.x-flyer.position.x,dz=p.z-flyer.position.z;return {x:dx*c-dz*s,z:dx*s+dz*c};};
    // Bay zone covers the lift deck and both hinged door leaves swinging out to one opening width either side.
    const bay=NX07.port,within=channel?p=>{const l=at(p);return Math.abs(l.x)<6&&l.z<-NX07_SCALE&&l.z>-44*NX07_SCALE;}:p=>{const l=at(p);return Math.abs(l.x)<bay.width&&l.z<bay.z+bay.length/2+.5&&l.z>bay.z-bay.length/2-.5;};
    const onBay=carrier.ready&&(channel?within(carrier.position):flyer.asset.overBay(carrier.position.x,carrier.position.z,carrier.heading,ARES_FOOTPRINT));
    if(astronaut.active&&within(astronaut.position))return {ok:false,reason:channel?'请站到升降平台侧面，避开腹舱门展开区':'请离开主升降平台和腹舱门下方'};
    if(onBay)return {ok:false,reason:'ARES 在主升降平台区域：停稳在装载位上会自动装船；否则请驶离后操作舱门'};
    if(roverOnGround()&&within(roverPoint()))return {ok:false,reason:'MU-7 占用升降平台区域，请先移开'};
    return ramp;
  }
  // Crew ports 2–5 (asset port index 1–4) open one at a time. A crew member standing on a lowered deck
  // rides it up into the hull, which is boarding; leaving the ship rides one back down.
  const CREW_PORTS=[1,2,3,4],waitFor=test=>new Promise(resolve=>{const tick=()=>test()?resolve():requestAnimationFrame(tick);tick();});
  let lastCrewPort=1;
  function checkCrewPort(i){
    if(!shipReady||!flyer.grounded)return {ok:false,reason:'请先着陆并停机，再操作舱口'};
    const base=flyer.asset.checkPort(i),no=i+1;if(!base.ok)return base;
    if(astronaut.active&&flyer.asset.underPort(i,astronaut.position.x,astronaut.position.z,.6))return {ok:false,reason:`请离开 ${no} 号平台下方，平台会降到地面`};
    if(carrier.ready&&flyer.asset.underPort(i,carrier.position.x,carrier.position.z,5))return {ok:false,reason:`ARES 停在 ${no} 号平台下方，请驶离后再开`};
    if(roverOnGround()&&flyer.asset.underPort(i,roverPoint().x,roverPoint().z,2))return {ok:false,reason:`MU-7 停在 ${no} 号平台下方，请先移开`};
    return base;
  }
  // Index of the lowered crew deck the walking operator stands on (feet inside its edge), or -1.
  function crewDeck(){
    if(!shipReady||!astronaut.active||refuge?.inside)return -1;
    const i=flyer.asset.portAt(astronaut.position.x,astronaut.position.z,.2);if(light&&i===3)return -1;return i>=0&&flyer.asset.portState(i).ready?i:-1;
  }
  function toggleCrewPort(i){
    if(light&&i===3)return notify("4号舱口由L04收放面板操作。");
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy)return;
    const s=flyer.asset.portState(i),no=i+1,p=astronaut.position;
    if(s.open){
      if(crewDeck()===i)return rideUp(i);
      if(astronaut.active&&flyer.asset.underPort(i,p.x,p.z,.6)){notify(`请站到 ${no} 号平台中间乘平台登船，或走开后再关闭`);return;}
      flyer.asset.setPort(i,false);notify(`${no} 号平台收回舱内，随后舱门关闭。`);return;
    }
    const check=checkCrewPort(i);if(!check.ok){notify(check.reason);return;}
    flyer.asset.setPort(i,true);notify(`${no} 号舱口开启：舱门打开后平台降到地面。走上平台按 F，平台升起即登船。`);
  }
  // Boarding: the deck rises; once the helmet passes the hull skin the operator is aboard and the port closes behind.
  async function rideUp(i){
    if(changing||crewDeck()!==i)return;
    const no=i+1;changing=true;flyer.asset.setPort(i,false);notify(`${no} 号平台上升中…`);
    try{
      await waitFor(()=>{const s=flyer.asset.portState(i);return s.lift===0||s.deckY+EVA_HEIGHT>=s.skinY;});
      if(flyer.start({fromCargo:true})){lastCrewPort=i;notify(`已从 ${no} 号舱口登上 NX07；舱口全部关闭后 E 起飞。`);}
      else flyer.asset.setPort(i,true);
    }finally{changing=false;}
  }
  // Leaving: the last used crew port first, then the others; null when none can open.
  function crewExitPort(){
    if(!shipReady||!flyer.active||!flyer.grounded||flyer.landing||flyer.transferring||Math.abs(flyer.speed)>.5)return -1;
    return [lastCrewPort,...CREW_PORTS.filter(i=>i!==lastCrewPort)].filter(i=>!light||i!==3).find(i=>checkCrewPort(i).ok)??-1;
  }
  async function rideDown(i){
    const no=i+1;changing=true;flyer.asset.setPort(i,true);notify(`${no} 号舱口开启，乘平台下降…`);
    try{
      // Step onto the deck once it hangs a full suit height below the hull skin.
      await waitFor(()=>{const s=flyer.asset.portState(i);return !s.open||s.lift>0&&s.deckY+EVA_HEIGHT<=s.skinY;});
      if(!flyer.asset.portState(i).open||!flyer.leave()){flyer.asset.setPort(i,false);notify('请先降落并停稳，再离船。');return;}
      document.body.classList.remove('is-flying');astronaut.start({...flyer.asset.deckCentre(i),heading:flyer.heading});operatorPlaced=true;lastCrewPort=i;
      await waitFor(()=>{const s=flyer.asset.portState(i);return s.ready||!s.open;});
      notify(`已乘 ${no} 号平台到达地面。走下平台即可；再走上平台按 F 可登船。`);
    }finally{changing=false;}
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
  const dockHint=st=>dockCapture?'自动入库接管中 · 减速后自动对中、转正':st.inZone?'已进入自动入库区 · 任意朝向均可装船'
    :`驶入平台中央内框即自动入库 · 不用对准车头 · 前后 ${Math.abs(st.ahead).toFixed(1)} m / 横向 ${Math.abs(st.right).toFixed(1)} m`;
  let dockCapture=false;
  const canCaptureDock=()=>carrier.active&&!carrier.charging&&!changing&&!paused&&!mapOpen&&!overlayOpen&&!document.hidden&&shipReady&&delivered&&!flyer.active&&flyer.grounded&&flyer.asset.padReady&&!options.cargoOccupied?.();

  // Enter from any heading: capture brakes, then centres and turns the payload before lifting.
  async function dockCarrier({board=true}={}){
    if(options.cargoOccupied?.()){notify('先到营地卸下本批水务货物，再装船。');return;}
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
    if(options.cargoOccupied?.()){notify('先到营地卸下本批水务货物，再装船。');return;}
    if(carrier.charging){notify('先断开ARES供电连接，再装船。');return;}
    if(paused||mapOpen||changing||!carrier.active||!delivered)return;
    if(!shipReady||!flyer.grounded||flyer.active){notify('NX07 需着陆并完成支撑锁定后才能装船。');return;}
    if(!flyer.asset.doorOpen){const check=checkShipDoor();if(!check.ok){notify(check.reason);return;}flyer.asset.setDoor(true);notify('NX07 腹舱开启中：主升降平台会降到地面并高亮。驶入平台中央内框即可自动减速、对中并装船，车头朝向不限。');return;}
    if(!flyer.asset.padReady){notify('主升降平台下降中，请稍候…');return;}
    const st=dockState();if(st.inZone){dockCapture=true;notify(dockHint(st));}else notify(dockHint(st));
  }
  async function loadShip(){
    if(carrier.charging){notify('先断开ARES供电连接，再装船。');return;}
    if(options.cargoOccupied?.()){notify('先到营地卸下本批水务货物，再装船。');return;}
    if(carrier.active)return driveLoad();
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||!delivered||flyer.active)return;
    if(flyer.asset.padReady&&dockState().inZone){dockCarrier({board:false});return;}
    notify('将 ARES 驶入主平台中央内框：任意车头朝向，自动接管减速、对中并升舱。');
  }
  const toolbar=el('nav','mobility-tools');toolbar.setAttribute('aria-label','当前模式操作');
  const mapButton=el('button','','地图导航 · M'),flyButton=el('button','','登上NX07飞行器'),orbitButton=el('button','','进入火星轨道');
  const shipLoad=el('button','','装载 ARES 回NX07');shipLoad.onclick=loadShip;
  const shipDoor=el('button','','打开NX07腹舱'),shipUnload=el('button','','卸载 ARES 与物资');
  shipDoor.onclick=()=>{if(paused||mapOpen||changing)return;const check=checkShipDoor();if(!check.ok){notify(check.reason);return;}notify(check.reason);flyer.asset.setDoor(!flyer.asset.doorOpen);};shipUnload.onclick=unloadShip;
  const crewPortButtons=CREW_PORTS.map(i=>{const b=el('button','crew-port',`打开 ${i+1} 号舱口`);b.dataset.port=String(i+1);b.onclick=()=>toggleCrewPort(i);return b;});
  const crewRideButton=el('button','crew-ride','乘平台登船 · F');crewRideButton.onclick=()=>{const i=crewDeck();if(i>=0&&!paused&&!mapOpen)rideUp(i);};
  toolbar.append(shipDoor,...crewPortButtons,shipUnload,shipLoad,crewRideButton);
  orbitButton.hidden=true;toolbar.append(mapButton,flyButton,orbitButton);document.body.append(toolbar);
  const groundButton=el('button','mobility-rover','开始探索 · F');
  const viewButton=el('button','','第三人称 · C');
  const refugeButton=el('button','refuge-enter','进入生活舱 · F'),restButton=el('button','refuge-rest','坐下休息');
  const stationButton=el('button','refuge-station','');
  function useRefuge(){if(paused||mapOpen||changing||!astronaut.active)return;refuge?.enterOrExit(astronaut,notify,outsideOccupied);}
  refugeButton.onclick=useRefuge;restButton.onclick=()=>{if(!paused&&!mapOpen)refuge?.rest(astronaut);};

  // 舱内工位。只有化验台是真开一套界面——tools/regolith-lab.html 已经是完整的 ARES-GEOCHEM
  // 化验台，没有必要在游戏里再实现一遍，直接把它挂进来，游戏同时冻结。
  // 其余工位开一块面板（宇航服自检接在舱外服架上），气闸循环有过场牌子：
  // 都是从先遣生存那套应急舱界面搬来的，见 outpost-station-ui.js（D73）。
  const stationUI=refuge?mountOutpostStationUI({setOverlay,notify,
    saveKey:`cosmos.outpost.suit.v1:${options.kind}:${pod.home.lat}:${pod.home.lon}:${getJourney()?.startedAt||'free'}`}):null;
  let labPanel=null;
  function openRegolithLab(){
    if(labPanel)return;
    labPanel=el('div','regolith-station');
    labPanel.innerHTML='<header><span>ARES-GEOCHEM · 设备舱化验室</span>'
      +'<button type="button" class="regolith-station-close">关闭 · Esc</button></header>'
      +'<iframe title="风化层化验台" src="'+new URL('../../tools/regolith-lab.html',import.meta.url).href+'"></iframe>';
    if(!document.getElementById('regolith-station-style')){
      const style=el('style');style.id='regolith-station-style';
      style.textContent='.regolith-station{position:fixed;inset:3vh 3vw;z-index:60;display:flex;flex-direction:column;'
        +'background:#10100e;border:1px solid #6b6256;border-radius:10px;box-shadow:0 24px 80px #000c;overflow:hidden}'
        +'.regolith-station header{display:flex;align-items:center;justify-content:space-between;gap:12px;'
        +'padding:10px 14px;background:#1a1814;color:#e8dfd0;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.06em}'
        +'.regolith-station-close{background:#3a332a;color:#f0e6d6;border:1px solid #6b6256;border-radius:6px;'
        +'padding:6px 12px;font:inherit;cursor:pointer}'
        +'.regolith-station-close:hover{background:#4c4438}'
        +'.regolith-station iframe{flex:1;width:100%;border:0;background:#faf7f2}'
        +'@media (max-width:640px){.regolith-station{inset:0;border-radius:0}}';
      document.head.append(style);
    }
    labPanel.querySelector('.regolith-station-close').onclick=closeRegolithLab;
    const frame=labPanel.querySelector('iframe');
    // 化验台是同源 iframe，焦点进去之后 Esc 就到不了游戏窗口了，所以两边都挂一次。
    frame.addEventListener('load',()=>{
      try{frame.contentWindow.addEventListener('keydown',labKey,true);}catch{}
    });
    document.body.append(labPanel);setOverlay(true);
    addEventListener('keydown',labKey,true);
  }
  function labKey(e){if(e.code==='Escape'){e.preventDefault();e.stopPropagation();closeRegolithLab();}}
  function closeRegolithLab(){
    if(!labPanel)return;
    removeEventListener('keydown',labKey,true);
    try{labPanel.querySelector('iframe').contentWindow.removeEventListener('keydown',labKey,true);}catch{}
    labPanel.remove();labPanel=null;setOverlay(false);
  }
  function useStation(){
    if(paused||mapOpen||changing||!astronaut.active)return false;
    const s=refuge?.nearestStation(astronaut.position);
    if(!s)return false;
    // 场景可以接管某个工位：通信台打开遗迹档案（src/relics，D65）。
    if(options.openStation?.(s.id))return true;
    if(s.id==='lab')openRegolithLab();
    else if(!stationUI?.open(s))notify(s.name+'：暂无可操作内容。');
    return true;
  }
  stationButton.onclick=useStation;
  const leaveButton=el('button','','离船步行 · F');
  const overviewButton=el('button','','返回建设视角');
  const carrierButton=el('button','carrier-board','登上 ARES · F'),cargoButton=el('button','carrier-cargo','装载 MU-7');
  carrierButton.onclick=()=>carrier.active?leaveCarrier():boardCarrier();cargoButton.onclick=cargoAction;
  toolbar.prepend(groundButton,carrierButton,viewButton,refugeButton,stationButton,restButton);toolbar.append(leaveButton,cargoButton);
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
  const pauseDialog=el('dialog','transport-pause');pauseDialog.innerHTML='<small>COSMOS</small><h2>探索已暂停</h2><p>继续后恢复当前操作模式。</p><button data-mars-sound type="button">音效</button><button class="resume">继续探索</button><a href="../index.html">返回指挥台</a>';document.body.append(pauseDialog);
  const resume=()=>{pauseDialog.close();paused=false;onBlock(false);flyer.setPaused(false);carrier.setPaused(false);light?.setPaused(false);astronaut.setPaused(!!refuge?.busy||!!refuge?.resting);};
  pauseButton.onclick=()=>{const sb=pauseDialog.querySelector('[data-mars-sound]');sb.textContent=getSettings().sound?'音效：开':'音效：关';sb.setAttribute('aria-pressed',String(getSettings().sound));const menu=document.querySelector('.journey-menu');if(menu){menu.click();return;}paused=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);light?.setPaused(true);astronaut.setPaused(true);pauseDialog.showModal();};
  pauseDialog.querySelector('.resume').onclick=resume;pauseDialog.addEventListener('cancel',e=>{e.preventDefault();resume();});
  const evaStatus=el('div','eva-status');evaStatus.hidden=true;document.body.append(evaStatus);
  async function ensureRover(){await rover?.ensure();return !!rover?.ready();}
  function prepareShip(){
    if(shipReady||routeFlight.arriving)return;
    const savedRescue=normalizeSupport(getJourney()?.support).rescue;
    if(rescueInScene(savedRescue,site)&&['landed','aboard'].includes(savedRescue.status)&&savedRescue.target){
      const fit=solveSupport(savedRescue.target,heightAt,(x,z)=>blocked(x,z)||!!refuge?.onPad(x,z)||carrier.contains(x,z));
      if(fit.valid){shipReady=flyer.park(savedRescue.target);if(shipReady)return;}
      updateJourney({support:{...normalizeSupport(getJourney()?.support),rescue:{...savedRescue,target:null,status:'requested'}}});
    }
    if(rescueInScene(savedRescue,site)&&savedRescue.status==='enroute')updateJourney({support:{...normalizeSupport(getJourney()?.support),rescue:{...savedRescue,target:null,status:'requested'}}});
    const r=roverPoint();
    // NX07's position is not saved. Near the outpost it stands where an arrival set it down — due west
    // of the door, clear of the graded pad — so a reload puts it back on the same spot instead of
    // re-deriving one from wherever MU-7 happens to be, which could be on top of a parked ARES (D69).
    // Out in the field it still comes down beside the rover.
    const atHome=refuge&&Math.hypot(r.x-refuge.position.x,r.z-refuge.position.z)<SHIP_HOME_RANGE;
    const base=atHome?shipBaseFor(refuge.position):{x:r.x-90,z:r.z-30};
    const p=findLandingSite(base,heightAt,(x,z)=>blocked(x,z)||!!refuge?.onPad(x,z)||Math.hypot(x-r.x,z-r.z)<4);
    if(p)shipReady=flyer.park(p);
  }
  async function walk(){
    if(light?.active)return light.leave();
    if(paused||mapOpen||changing||refuge?.busy||flyer.active||carrier.active||astronaut.active)return;
    changing=true;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      if(light)await light.ready;
      prepareShip();prepareCarrier();
      // Ending remote control brakes the rover; the operator never travels with it.
      const p=refuge?.inside?{...refuge.target(),heading:-Math.PI/2}:operatorPlaced?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:startPoint();
      if(!p){rover.exit();notify('当前没有安全的操作员站位，请换一处开阔地。');return;}
      rover.exit();astronaut.start(p);refuge?.restore(astronaut);operatorPlaced=true;
      notify('已结束遥控，返回操作员位置。WASD 步行；F 遥控探测车，靠近NX07时 F 登船。');
    }finally{changing=false;}
  }
  // Crew who have not stepped out yet start beside whatever still carries MU-7: NX07, then ARES.
  function startPoint(){
    if(light&&shipReady){const centre=flyer.asset.deckCentre(3),p=findExit(centre,12,heightAt,walkBlocked);if(p)return {...p,heading:Math.atan2(centre.x-p.x,centre.z-p.z)};}
    if(roverAboardShip()&&shipReady)return stepOutOfShip();
    return findExit(carrier.loaded?{...carrier.position,heading:carrier.heading}:roverPoint(),carrier.loaded?7:3.5,heightAt,walkBlocked);
  }
  // Beside the hull, facing the outpost's door when there is one to walk to.
  function stepOutOfShip(){
    const o={...flyer.position,heading:flyer.heading};
    const p=findExit(o,SHIP_STEP_OUT,heightAt,walkBlocked)||findExit(o,SHIP_EXIT,heightAt,walkBlocked);
    if(p&&refuge?.ready&&!refuge.inside){const d=refuge.target();p.heading=Math.atan2(d.x-p.x,d.z-p.z);}
    return p;
  }
  async function boardRover(){
    if(light?.active)return notify("请先停稳离开L04。");
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||flyer.active||carrier.active)return;
    changing=true;let stepOut=false;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      if(light)await light.ready;
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
    if(paused||mapOpen||changing)return;
    const port=crewExitPort();if(port>=0)return rideDown(port);
    // No crew port can open here (obstacle or ground under every deck): step out beside the ship as before.
    const p=stepOutOfShip();
    if(!p){notify('舱门旁没有安全落脚点，请换一处开阔地降落。');return;}
    if(!flyer.leave()){notify('请先降落并停稳，再离船步行。');return;}
    document.body.classList.remove('is-flying');astronaut.start(p);operatorPlaced=true;
  }
  function boardShip(){
    if(flyer.summoning)return notify('NX07尚在接应途中，等落稳后再登船。');
    if(light?.active||light?.busy)return notify("先停稳下车，等待L04收放完成。");
    if(paused||mapOpen||changing||refuge?.inside||refuge?.busy||carrier.active)return;
    if(flyer.active){flyer.land();return;}
    if(!astronaut.active){notify('请先结束遥控，再步行靠近NX07登船。');return;}
    if(!shipReady||distance(astronaut.position,flyer.position)>SHIP_BOARD){notify(`请步行到NX07旁，${SHIP_BOARD} m 内可登船；地图标有停泊位置。`);return;}
    const open=flyer.asset.openPorts;
    if(open.length&&flyer.grounded){notify(`${open.join('、')} 号舱口开着：走上放下的平台按 F 乘平台登船，或先关闭舱口。`,'door');return;}
    flyer.start();
  }
  groundButton.onclick=()=>astronaut.active?boardRover():walk();
  viewButton.onclick=()=>{if(refuge?.busy||refuge?.resting)return;light?.active?light.car.cycle():carrier.active?carrier.cycle():flyer.active?flyer.cycle():rover.driving()?rover.cycle?.():astronaut.cycle();};leaveButton.onclick=leaveShip;
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
    <aside><label for="map-search">查找地标或建筑</label><input id="map-search" placeholder="名称 / 地标 / 温室" autocomplete="off"><div class="map-place-list" role="list"></div><div class="map-destination"><h3>选择一个目的地</h3><p>点击地图或右侧地标。规划会避开过陡地面、穹顶和连廊。</p></div><label for="map-slope">允许最大坡度 <b id="map-slope-label">26°</b></label><input id="map-slope" type="range" min="12" max="32" step="2" value="26"><button id="map-plan" class="map-primary" disabled>规划驾驶路线</button><button id="map-fly" class="map-primary" hidden>乘 NX07 飞过去</button><button id="map-orbit" hidden>在轨道上定位此处</button><button id="map-auto" class="map-primary" disabled>开始自动驾驶</button><p class="map-auto-hint"></p><button id="map-clear">清除导航路线</button><p class="map-result" role="status"></p></aside></div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s),map=q('canvas'),ctx=map.getContext('2d'),list=q('.map-place-list'),search=q('#map-search'),result=q('.map-result');
  const worldData=globalThis.MOLA,raw=worldData?atob(worldData.b64):null;
  // MOLA ships at 1440x720; the old planet view decoded it at 720x360 and coloured
  // it by elevation alone, which reads as flat bands. Same shading as the local
  // view, at the data's own resolution, built on first use rather than on load.
  let planet=null;
  function planetRelief(){
   const w=worldData?.w||2,h=worldData?.h||2,heights=new Float64Array(w*h);
   if(raw)for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*2;const v=(raw.charCodeAt(i)<<8)|raw.charCodeAt(i+1);heights[y*w+x]=v&32768?v-65536:v;}
   // A lat/lon grid's columns crowd together toward the poles; without the cosine
   // the top and bottom rows would shade as near-vertical cliffs.
   const R=3389500,dz=Math.PI*R/h,dxRow=new Float64Array(h);
   for(let y=0;y<h;y++)dxRow[y]=Math.max(dz*.15,2*Math.PI*R*Math.cos((90-(y+.5)/h*180)*Math.PI/180)/w);
   const {rgba}=shadeRelief({heights,gw:w,gh:h,dx:dz,dz,dxRow,relief:16,contours:false});
   const c=el('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(rgba,w,h),0,0);
   return c;
  }
  let chart={cx:0,cz:0,span:900},terrainImage=null,drawing=false;
  // The local map draws the REAL height field, so what it shows is what the wheels meet.
  // Sampling it is ~0.8 us a point: a canvas-resolution grid is hundreds of ms, far too
  // long to block a wheel-zoom, so the renderer paints coarse first and refines in slices.
  const relief=createMapRelief({heightAt});
  const invalidate=()=>{relief.cancel();terrainImage=null;};
  function requestRelief(){
   const w=map.width,h=map.height;if(!w||!h)return;
   relief.request({cx:chart.cx,cz:chart.cz,spanX:chart.span*w/h,spanZ:chart.span,pxW:w,pxH:h},tile=>{terrainImage=tile;if(!drawing)drawMap();});
  }
  // 遗迹坐标只认航线图 RELICS 这一份（src/relics/catalog.js）。PLACES 里同名的着陆点是一位小数的近似，
  // 洞察号差 1.2 km，按它飞过去会落在机腹相机 400 m 拍照范围外；所以换成 RELICS，顺带补上猎兔犬 2 号、机智号。
  const RELIC_NAMES=new Set(RELICS.map(r=>r.cn.split(' / ')[0]));
  // 遗迹自己被载具碰撞圈挡着，不能当路线终点：停在遗迹朝来车方向 RELIC_STOP 米处。
  const RELIC_STOP=15,FLY_MIN=1000;
  const relicStop=p=>{const s=player(),d=Math.hypot(s.x-p.x,s.z-p.z)||1;return {x:p.x+(s.x-p.x)/d*RELIC_STOP,z:p.z+(s.z-p.z)/d*RELIC_STOP};};
  const catalog=()=>[
    ...supportMarkers(),
    ...(light?.car.ready?[{id:'ares-light',name:'ARES L04 · 四轮封闭车',x:light.car.position.x,z:light.car.position.z,...localToGeo(light.car.position,site),local:true,type:'载具'}]:[]),
    ...(operations.state.home?[{id:'rover-home',name:operations.gridAvailable?'营地电网 · MU-7充电 / 维修':'补给基地 · 自动充电 / 维修',...operations.state.home,...localToGeo(operations.state.home,site),local:true,type:operations.gridAvailable?'营地电网':'补给基地'}]:[]),
    ...(carrier.ready?[{id:"atlas",name:"ARES · 载人运输车",x:carrier.position.x,z:carrier.position.z,...localToGeo(carrier.position,site),local:true,type:"运输车"}]:[]),
    ...(refuge?.ready?[{id:'refuge',name:'前哨仓 · 居住与化验',...refuge.target(),...localToGeo(refuge.target(),site),local:true,type:'前哨仓气闸'}]:[]),
    ...(operatorPlaced?[{id:'eva-operator',name:'操作员 · 留驻位置',x:astronaut.position.x,z:astronaut.position.z,...localToGeo(astronaut.position,site),local:true,type:'人员'}]:[]),
    {id:'eva-rover',name:!delivered?'MU-7 · 随 ARES 在 NX07 内':carrier.loaded?'MU-7 · 在 ARES 货舱':'MU-7 · 无人遥控车',...roverPoint(),...localToGeo(roverPoint(),site),local:true,type:'载具'},
    ...(shipReady?[{id:'eva-ship',name:'NX07 · 停泊位置',x:flyer.position.x,z:flyer.position.z,...localToGeo(flyer.position,site),local:true,type:'飞船'}]:[]),
    ...getLandmarks().map(p=>({...p,...localToGeo(p,site),local:true})),
    ...((options.kind !== 'park' || Math.abs((getJourney()?.site.lat ?? site.lat)-site.lat) > .001 || Math.abs((getJourney()?.site.lon ?? site.lon)-site.lon) > .001) ? (getJourney()?.campuses || []).map((p,i)=>{
      const geo=localToGeo(p,getJourney().site);return {id:'saved-campus-'+i,name:p.name+' · 已建先遣站',...geo,...geoToLocal(geo,site),type:'穹顶',local:true};
    }) : []),
    ...PLACES.filter(([name])=>!RELIC_NAMES.has(name)).map(([name,english,lat,lon,rank,type])=>({id:english,name,english,lat,lon,rank,type,...geoToLocal({lat,lon},site)})),
    ...RELICS.map(r=>({id:r.id,relic:r.id,name:r.cn,english:r.en,lat:r.lat,lon:r.lon,type:'遗迹',...geoToLocal(r,site)}))
  ];
  // 给音效看的飞船状态：landed 起落架碰到地；locked 四足锁定；motion 起落架、舱门、平台的位置之和，变了就是有机构在动。
  const shipSound=()=>{const a=flyer.asset,ports=[];let motion=a.gearProgress;
    for(let i=0;i<=crewPortButtons.length;i++){const p=a.portState(i);ports.push(p.closed);motion+=p.door+p.lift;}
    return {x:flyer.position.x,z:flyer.position.z,landed:flyer.altitude===0,locked:flyer.grounded,thrust:flyer.dustThrust,speed:flyer.speed,transfer:flyer.transferring,ports,motion};};
  const player=()=>light?.active?{x:light.car.position.x,z:light.car.position.z,heading:light.car.heading}:carrier.active?{x:carrier.position.x,z:carrier.position.z,heading:carrier.heading}:flyer.active?{x:flyer.position.x,z:flyer.position.z,heading:flyer.heading}:astronaut.active?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:getPlayer();
  const loc=p=>mode==='planet'?{x:p.lon/360*map.width,y:(90-p.lat)/180*map.height}:{x:(p.x-chart.cx)/chart.span*map.height+map.width/2,y:(p.z-chart.cz)/chart.span*map.height+map.height/2};
  function center(){const p=player();chart={cx:p.x,cz:p.z,span:900};invalidate();drawMap();}
  function drawMap(){
    if(!mapOpen)return;
    const box=map.getBoundingClientRect();const w=Math.round(box.width),h=Math.round(box.height);if(!w||!h)return;
    if(map.width!==w||map.height!==h){map.width=w;map.height=h;invalidate();}
    ctx.clearRect(0,0,w,h);
    drawing=true;
    if(mode==='planet'){if(!planet)planet=planetRelief();ctx.drawImage(planet,0,0,w,h);}
    else{if(!terrainImage)requestRelief();if(terrainImage)ctx.drawImage(terrainImage.canvas,0,0,w,h);}
    ctx.lineWidth=1;ctx.strokeStyle='#d2e4dc18';ctx.fillStyle='#d2e4dcaa';ctx.font='10px ui-monospace,monospace';
    for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h*i/6);ctx.lineTo(w,h*i/6);ctx.stroke();}
    if(mode==='planet'){for(let i=0;i<6;i++)ctx.fillText(i*60+'°E',i*w/6+5,15);ctx.fillText('90°N',5,32);ctx.fillText('0°',5,h/2-5);ctx.fillText('90°S',5,h-8);}
    else{
      ctx.fillText('北 ↑',12,20);
      const t=terrainImage,scale=Math.round(chart.span*w/h)+' m × '+Math.round(chart.span)+' m · 滚轮缩放';
      ctx.fillText(t?scale+' · 等高线 '+t.step+' m · 高差 '+Math.round(t.hi-t.lo)+' m · 采样 '+t.gw+'×'+t.gh:scale,12,h-12);
      for(const o of obstacles()){ctx.fillStyle='#89c5c42e';ctx.strokeStyle='#9cdddaa0';ctx.beginPath();if(o.type==='line'){const a=loc(o.a),b=loc(o.b);ctx.lineWidth=Math.max(3,(o.radius||6)*2/chart.span*h);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}else{const p=loc(o);ctx.arc(p.x,p.y,(o.radius||130)/chart.span*h,0,Math.PI*2);ctx.fill();ctx.lineWidth=1;ctx.stroke();}}
    }
    if(mode==='local'&&operations.state.path.length){ctx.strokeStyle='#e5b07e';ctx.lineWidth=1.5;ctx.beginPath();operations.state.path.forEach((p,i)=>{const s=loc(p);if(i===0)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);});ctx.stroke();}
    if(route){ctx.strokeStyle='#acffd4';ctx.lineWidth=2.5;ctx.beginPath();let lastX=null;route.path.forEach((p,i)=>{const s=loc({...p,...localToGeo(p,site)});if(i===0||mode==='planet'&&Math.abs(s.x-lastX)>w/2)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);lastX=s.x;});ctx.stroke();}
    const labels=[];
    for(const p of catalog()){
      const s=loc(p);if(s.x<0||s.y<0||s.x>w||s.y>h)continue;
      if(p.regionRadius&&mode==='local'){ctx.save();ctx.strokeStyle='#e6c287';ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(s.x,s.y,p.regionRadius/chart.span*h,0,Math.PI*2);ctx.stroke();ctx.restore();}
      ctx.fillStyle=p.local?'#a7e3dd':'#ecd8b5';ctx.beginPath();ctx.arc(s.x,s.y,p===selected?5:p.local?3:2,0,Math.PI*2);ctx.fill();
      const selectedHere=selected?.id===p.id;
      if(selectedHere||!labels.some(r=>Math.abs(r.x-s.x)<85&&Math.abs(r.y-s.y)<17)) {ctx.fillStyle=selectedHere?'#fff':'#d8e6e3';ctx.font='11px -apple-system,sans-serif';ctx.fillText(p.name,s.x+7,s.y-5);labels.push(s);}
    }
    if(selected){const p=loc(selected);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(p.x-8,p.y-8,16,16);}
    const p=player(),s=loc({...p,...localToGeo(p,site)});ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.PI-(p.heading||0));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();
    drawing=false;
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
    const range=`距当前位置 ${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}。`;
    q('.map-destination p').textContent=p.approach?'导航到建筑外的巡视车接驳点；加压穹顶内部暂不能驶入。':p.relic?range+`路线停在遗迹旁 ${RELIC_STOP} m。`:range;
    // 本地范围（LOCAL_KM）以内车能规划路线开过去；更远的交给 NX07 按航线飞（同航线图：400 km 内大气巡航，再远入轨转移）。
    // 「乘 NX07 飞过去」1 km 以上就给：本地范围里也能飞，人在船上时这是唯一的走法。
    const far=d>LOCAL_KM*1000;
    q('#map-plan').disabled=far||flyer.active||!!p.regionRadius;
    q('#map-fly').hidden=d<FLY_MIN||!!p.regionRadius;
    q('#map-orbit').hidden=d<=CRZ_MAX_KM*1000||!!p.regionRadius;
    result.textContent=p.regionRadius?'这里只是预计落区，还没有落稳定位，请等信标确认。':far?`超出本地范围（${LOCAL_KM} km），车开不到。`+(flyer.active?'点「乘 NX07 飞过去」自动起飞，到了自动降落。':'点「乘 NX07 飞过去」把航线发给飞船，登上 NX07 后在操作台点「按航线飞行」。'):flyer.active?'请先降落离船，再规划地面路线'+(d>=FLY_MIN?'；或点「乘 NX07 飞过去」，到了自动降落。':'。'):'';
    if(mode==='local'&&!far){chart={cx:(p.x+player().x)/2,cz:(p.z+player().z)/2,span:Math.max(500,d*1.6)};invalidate();}
    refreshList();drawMap();
  }
  function setMode(next){mode=next;dialog.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));drawMap();}
  function close(){if(mapOpen)sfx.play('ui-close');dialog.close();mapOpen=false;flyer.setPaused(paused);carrier.setPaused(paused);light?.setPaused(paused);astronaut.setPaused(paused||!!refuge?.busy||!!refuge?.resting);onBlock(false);}
  function open(){if(paused||overlayOpen)return;if(!mapOpen)sfx.play('ui-open');mapOpen=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);light?.setPaused(true);astronaut.setPaused(true);dialog.showModal();center();refreshList();drawMap();}
  q('.map-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  mapButton.onclick=open;guidance.onclick=open;
  q('#map-center').onclick=center;search.oninput=refreshList;
  dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  map.onclick=e=>{const box=map.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;let near=null,best=20;for(const p of catalog()){const s=loc(p),d=Math.hypot(s.x-x,s.y-y);if(d<best){near=p;best=d;}}
    if(near)select(near);else if(mode==='local'){const p={x:chart.cx+(x-map.width/2)/map.height*chart.span,z:chart.cz+(y/map.height-.5)*chart.span};select({id:'custom',name:'自选地面位置',...p,...localToGeo(p,site)});}
    else{const p={lon:x/map.width*360,lat:90-y/map.height*180};select({id:'custom-planet',name:'自选着陆位置',...p,...geoToLocal(p,site)});}
  };
  // The coarse relief pass is synchronous (~50 ms). Resampling on every wheel tick
  // would drop the zoom to a stutter, so the scroll keeps the current tile and the
  // ground is re-sampled once the wheel stops.
  let zoomTimer=0;
  map.addEventListener('wheel',e=>{e.preventDefault();if(mode!=='local')return;
   chart.span=THREE.MathUtils.clamp(chart.span*Math.exp(e.deltaY*.001),200,LOCAL_KM*2500);
   relief.cancel();drawMap();
   clearTimeout(zoomTimer);zoomTimer=setTimeout(()=>{invalidate();drawMap();},90);
  },{passive:false});
  q('#map-slope').oninput=()=>q('#map-slope-label').textContent=q('#map-slope').value+'°';
  function chargingSources(){
    const g=options.getGrid?.(),sources=[];
    if(g?.home&&g.online&&g.energy>8)sources.push({name:'营地配电箱',point:g.home,reach:14,energy:g.energy,loadKW:g.campLoadKW||2});
    if(shipReady&&flyer.grounded&&!flyer.summoning&&!flyer.piloting&&!flyer.transferring&&!flyer.landing&&Math.abs(flyer.speed)<.4&&g?.ship?.energy>24)sources.push({name:'NX07',point:{x:flyer.position.x,z:flyer.position.z},reach:SHIP_POWER.reach,ship:g.ship});
    return sources;
  }
  function forecastRoute(){
    if(!carrier.active||!carrier.drivePower||!route)return null;
    const sources=chargingSources(),goal=route.path.at(-1),origin=route.path[0],solid=obstacles();
    const obstacleAt=(x,z)=>solid.some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
    let best=null;
    for(const source of sources){
      let back=null,recovering=distance(goal,source.point)<=source.reach;
      if(recovering)back=0;
      else{
        if(distance(origin,source.point)<=source.reach){
          const answer=planTerrainRoute({start:goal,goal:origin,heightAt,blocked:obstacleAt,canTraverse:(x,z,yaw)=>carrier.canTraverse(x,z,yaw,ARES_ROUTE_MARGIN),sampleStep:.5,maxSlope:Number(q('#map-slope').value),maxSpan:LOCAL_KM*1000/.8});
          if(answer.ok)back=answer.length;
        }
        const dx=goal.x-source.point.x,dz=goal.z-source.point.z,d=Math.hypot(dx,dz)||1;
        const angles=[0,Math.PI/2,-Math.PI/2];
        for(const angle of back===null?angles:[]){
          const x=(dx*Math.cos(angle)-dz*Math.sin(angle))/d,z=(dx*Math.sin(angle)+dz*Math.cos(angle))/d;
          const target={x:source.point.x+x*source.reach*.85,z:source.point.z+z*source.reach*.85};
          const answer=planTerrainRoute({start:goal,goal:target,heightAt,blocked:obstacleAt,canTraverse:(x,z,yaw)=>carrier.canTraverse(x,z,yaw,ARES_ROUTE_MARGIN),sampleStep:.5,maxSlope:Number(q('#map-slope').value),maxSpan:LOCAL_KM*1000/.8});
          if(answer.ok){back=answer.length;break;}
        }
      }
      const budget=expeditionBudget({outMetres:route.length,returnMetres:back,massKg:carrier.manifest.massKg,returnSource:source.name,recovering});
      if(budget.ok&&returnPowerAvailable(source,(route.length+budget.returnMetres)/10+(recovering?0:120))&&(!best||budget.total<best.total))best=budget;
    }
    return best||expeditionBudget();
  }
  function driveBudget(){
    if(!carrier.active||!carrier.drivePower||!route)return '';
    if(carrier.charging)return '先断开ARES充电，再出发。';
    route.budget=forecastRoute();
    return '';

  }
  function departureWarning(){return route?.budget&&(!route.budget.ok||carrier.drivePower.energy-route.budget.total<2)?budgetStatus(route.budget,carrier.drivePower.energy)+' 可继续行驶；需要时先下车，用EVA召唤NX07接应。':'';}
  q('#map-auto').onclick=()=>{
    if(!route||(!carrier.active&&!rover.driving())){result.textContent='请先连接 MU-7 遥控或登上 ARES，再规划并启动自动驾驶。';return;}
    const vehicle=carrier.active?'carrier':'rover';
    if(route.vehicle&&route.vehicle!==vehicle||Math.hypot(player().x-route.path[0].x,player().z-route.path[0].z)>20){result.textContent='载具或起点已改变，请重新规划路线。';return;}
    const budget=driveBudget();if(budget){result.textContent=budget;return;}
    if(autopilot.start(route.path,carrier.active?'carrier':'rover')){close();notify(departureWarning()||'自动驾驶已启动。WASD、空格或触屏方向键可立即接管。');}
  };
  // 规划一条驾驶路线并画出绿色引导线。成功返回 ''，否则返回给玩家看的原因。M 地图和任务卡（D76）共用。
  function planRoute(goal,name){
    if(goal.regionRadius)return '预计落区不是确认接货点，请等落稳信标。';
    const solid=obstacles();const obstacleAt=(x,z)=>solid.some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
    const answer=planTerrainRoute({start:player(),goal,heightAt,blocked:obstacleAt,canTraverse:carrier.active?(x,z,yaw)=>carrier.canTraverse(x,z,yaw,ARES_ROUTE_MARGIN):undefined,sampleStep:carrier.active?.5:5,maxSlope:Number(q('#map-slope').value),maxSpan:LOCAL_KM*1000/.8});
    if(!answer.ok)return answer.reason;
    clearRoute();route={...answer,target:name,vehicle:carrier.active?'carrier':rover.driving()?'rover':null};routeIndex=0;
    routeObstacles=JSON.stringify(solid);
    routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.path.map(p=>new THREE.Vector3(p.x,heightAt(p.x,p.z)+.8,p.z))),new THREE.LineBasicMaterial({color:0xa7ffca,depthTest:false,transparent:true,opacity:.7}));routeLine.renderOrder=100;scene.add(routeLine);
    route.budget=forecastRoute();
    return '';
  }
  q('#map-plan').onclick=async()=>{
    if(!selected||pending)return;clearRoute();pending=true;q('#map-plan').disabled=true;result.textContent='正在检查地形坡度与建筑间隙…';await new Promise(r=>setTimeout(r,30));
    try{
      const reason=planRoute(selected.approach||(selected.relic?relicStop(selected):selected),selected.name);
      if(reason){result.textContent=reason;return;}
      result.textContent=`已规划 ${Math.round(route.length)} m · 累计上升 ${Math.round(route.climb)} m · 最大坡度 ${route.maxSlope.toFixed(1)}°。可点击“开始自动驾驶”，或关闭地图手动驾驶。${route.budget?'\n'+budgetStatus(route.budget,carrier.drivePower?.energy)+' '+budgetText(route.budget):''}`;
      drawMap();notify(route.budget&&(!route.budget.ok||carrier.drivePower.energy-route.budget.total<2)?budgetStatus(route.budget,carrier.drivePower.energy):'驾驶路线已生成，绿色引导线将带你到达目的地。');
    }finally{pending=false;q('#map-plan').disabled=false;}
  };
  // 任务卡上的按钮用（D76）：规划路线并开始自动驾驶，就是 M 地图里「选目标 → 规划 → 开始」那三下。
  // t 是地图目录里的 id（遗迹就是 INSG 这种），或一个本地坐标 {x,z,name}。返回 ''（已出发）或给玩家看的原因。
  async function driveTo(t){
    if(pending)return '';
    if(paused||mapOpen||overlayOpen||changing)return '先关闭面板并恢复操作。';
    if(!carrier.active&&!rover.driving())return '先上车，再让车自己开。';
    const place=typeof t==='string'?catalog().find(c=>c.id===t):null;
    if(typeof t==='string'&&!place)return '地图上没有这个地方。';
    pending=true;await new Promise(r=>setTimeout(r,30));   // 规划要一秒左右，先让按钮按下去的样子画出来
    try{
      if(paused||mapOpen||overlayOpen||changing||(!carrier.active&&!rover.driving()))return '操作状态已改变，请重新出发。';
      const reason=planRoute(place?(place.relic?relicStop(place):place):{x:t.x,z:t.z},place?place.name:t.name||'目的地');
      if(reason)return reason;
      const budget=driveBudget();if(budget)return budget;
      const started=autopilot.start(route.path,carrier.active?'carrier':'rover');if(started&&departureWarning())notify(departureWarning());return started?'':'自动驾驶没能启动。';
    }finally{pending=false;}
  }
  function clearRoute(){autopilot.stop('路线已清除，自动驾驶结束。');route=null;routeIndex=0;guidance.hidden=true;if(routeLine){scene.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}}
  q('#map-clear').onclick=()=>{clearRoute();result.textContent='导航已清除。';drawMap();};
  // 直飞一段交给航线飞行（route-flight.js）：在船上立刻起飞，不在船上只把航线发给 NX07。遗迹的 id 就是 INSG 这种，航线图里认得出。
  q('#map-fly').onclick=()=>{
    if(!selected)return;
    const target={id:String(selected.id||'TGT').slice(0,16),lat:selected.lat,lon:selected.lon};
    close();
    const message=routeFlight.flyTo(target);
    if(message)notify(message);
  };
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
      if(options.onInteract?.()===true)return;
      if(refuge?.resting)refuge.rest(astronaut);
      // 舱内 46 m 长，所以出舱也要走回气闸；站在设备旁边时 F 操作设备。
      else if(astronaut.active&&refuge?.ready&&refuge.distance(astronaut.position)<=2.6)useRefuge();
      else if(refuge?.inside){if(!useStation())notify('走到气闸门前，按 F 出舱。');}
      else if(light?.active)light.leave();
      else if(carrier.active)leaveCarrier();
      else if(flyer.active)leaveShip();
      else if(astronaut.active){
        if(light?.car.ready&&distance(astronaut.position,light.car.position)<=8)light.board();
        else if(crewDeck()>=0)rideUp(crewDeck());
        else if(carrier.ready&&distance(astronaut.position,carrier.position)<=8)boardCarrier();
        else if(shipReady&&distance(astronaut.position,flyer.position)<=SHIP_BOARD)boardShip();
        else boardRover();
      }else walk();
    }
    if(e.code==='Escape'&&!document.querySelector('.journey-menu')&&!mapOpen&&!pauseDialog.open){e.preventDefault();pauseButton.click();}
    if(e.code==='KeyM'){e.preventDefault();mapOpen?close():open();}
  });
  addEventListener('resize',()=>drawMap());
  function setOverlay(value){
    if(!!value!==overlayOpen)sfx.play(value?'ui-open':'ui-close');
    overlayOpen=!!value;uiBrake=false;operations.setInteract(false);
    const frozen=paused||mapOpen||overlayOpen;
    onBlock(frozen);flyer.setPaused(frozen);carrier.setPaused(frozen);light?.setPaused(frozen);astronaut.setPaused(frozen||!!refuge?.busy||!!refuge?.resting);
  }
  // Summon a vehicle beside the walking operator: it stops at exactly its nearest operating distance (+0 m).
  const SUMMON={ship:{name:'NX07',gap:SHIP_EXIT},carrier:{name:'ARES',gap:7},rover:{name:'MU-7',gap:3.5}};
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
      const shipBlocked=(x,z)=>blocked(x,z)||carrier.contains(x,z)||!!light?.contains(x,z)||Math.hypot(x-roverPoint().x,z-roverPoint().z)<3||!!refuge?.blocked(x,z)||!!refuge?.onPad(x,z);
      return summonSpot(cfg.gap,(x,z,heading)=>{const q={x,z,heading};if(!solveSupport(q,heightAt,shipBlocked).valid)return null;
        for(let lx=-36;lx<=36;lx+=6)for(let lz=-42;lz<=45;lz+=6){const w=worldXZ(q,lx,lz);if(shipBlocked(w.x,w.z)||Math.hypot(w.x-o.x,w.z-o.z)<2)return null;}return q;});
    }
    if(kind==='carrier')return summonSpot(cfg.gap,(x,z,a)=>{const q={x,z,heading:a+Math.PI/2};
      if((shipReady&&flyer.asset.contains(x,z,6))||(!carrier.loaded&&Math.hypot(x-roverPoint().x,z-roverPoint().z)<7)||!carrier.canTraverse(x,z,q.heading))return null;return q;});
    return summonSpot(cfg.gap,(x,z,a)=>{if(blocked(x,z)||carrier.contains(x,z)||!!light?.contains(x,z)||(shipReady&&flyer.asset.contains(x,z,2))||refuge?.blocked(x,z))return null;
      const h=heightAt(x,z);if([[-2,0],[2,0],[0,-2],[0,2]].some(([dx,dz])=>blocked(x+dx,z+dz)||Math.abs(heightAt(x+dx,z+dz)-h)>.8))return null;return {x,z,heading:a};});
  }
  function summon(kind){
    if(paused||mapOpen||overlayOpen||changing||refuge?.busy||refuge?.inside||!astronaut.active||flyer.active||carrier.active||rover.driving())return notify('请在舱外步行状态下召唤载具。');
    const cfg=SUMMON[kind];
    if(kind==='ship'){
      if(!shipReady)return notify('NX07 尚未部署。');
      if(flyer.summoning)return notify('NX07 已在飞来途中。');
      if(!flyer.asset.doorClosed||flyer.asset.unloading)return notify('请先关闭 NX07 全部舱口，再召唤。','door');
      shipTrack={still:0,key:'',spot:null};
      if(!flyer.fly(shipTarget,()=>{shipTrack=null;notify(`NX07 已降落，距你 ${Math.round(distance(flyer.position,astronaut.position))} m，可以登船。`);}))return notify('NX07 无法起飞，请检查腹舱与起落架。');
      return notify('NX07 无人起飞，跟随你的实时位置飞来；你停下后在身旁选平地降落。');
    }
    if(kind==='carrier'){
      if(!carrier.ready)return notify('ARES 尚在 NX07 内，请先卸车。');
      if(Math.abs(carrier.speed)>.4)return notify('ARES 仍在移动。');
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
  const readSupport=()=>normalizeSupport(getJourney()?.support);
  const writeSupport=patch=>{const next={...readSupport(),...patch};updateJourney({support:next});return next;};
  const currentRescue=()=>{const r=readSupport().rescue;return rescueInScene(r,site)?r:null;};
  function supportMarkers(){
    const r=currentRescue(),w=options.waterSupport?.()?.snapshot().state,marks=[];
    if(w?.cargo==='falling'&&w.drop)marks.push({id:'water-expected',name:'WATER-01 · 预计落区（待信标）',x:Math.round(w.drop.x/100)*100,z:Math.round(w.drop.z/100)*100,regionRadius:150});
    if(w?.cargo==='ground'&&w.stop)marks.push({id:'water-support',name:'WATER-01 · 落稳确认接货点',...w.stop});
    if(r&&r.status!=='aboard'){marks.push({id:'rescue-wait',name:'接应 · 人员等待点',...r.origin});if(r.target)marks.push({id:'rescue-land',name:r.status==='landed'?'NX07 · 已落稳会合点':'NX07 · 确认接应落点',...r.target});}
    return marks.map(p=>({...p,...localToGeo(p,site),local:true,type:'支援定位'}));
  }
  function requestRescue(){
    if(paused||mapOpen||overlayOpen||changing||refuge?.busy||refuge?.inside||!astronaut.active||flyer.active||carrier.active||light?.active||rover.driving())return notify('先停稳下车，在舱外步行状态发送接应请求。');
    if(!shipReady)return notify('NX07 尚未部署，暂时无法接应。');
    if(flyer.summoning)return notify('NX07 正在接应途中。');
    const previous=currentRescue();
    if(previous?.status==='landed'&&previous.target&&flyer.grounded&&distance(flyer.position,previous.target)<3)return notify('接应船已落稳。按平台标记登船，不必重复起飞。');
    if(!flyer.asset.doorClosed||flyer.asset.unloading)return notify('先关闭NX07全部舱口，等待平台收妥，再请求接应。');
    const origin={x:astronaut.position.x,z:astronaut.position.z},target=findSpot('ship');
    const r={at:Date.now(),site:{lat:site.lat,lon:site.lon},origin,target,status:'requested',confirmedAt:null};
    writeSupport({rescue:r});
    if(!target)return notify('接应请求已保存，但附近没有可用落点。请到开阔地后再次请求，原车辆与货物保留。');
    const accepted=flyer.fly(()=>target,()=>{
      shipTrack=null;const live=currentRescue();if(live)writeSupport({rescue:{...live,status:'landed',confirmedAt:Date.now()}});
      sound.radio();supportUI.say('NX07 已落稳，接应定位已确认。现在可走近人员平台登船，车辆与货物仍在原处。');
    });
    if(!accepted)return notify('接应请求已保存，NX07暂时无法起飞。检查船电、供电连接、起落架和舱口后重试。');
    writeSupport({rescue:{...r,status:'enroute'}});sound.radio();invalidate();
    supportUI.say('定位已发送，NX07按确认落点接应。等待点和落点已标在地图上；落稳前留在等待点，避开机腹。');
  }
  function updateSupport(){const r=currentRescue();if(r?.status==='landed'&&flyer.active&&flyer.grounded&&r.target&&distance(flyer.position,r.target)<3){writeSupport({rescue:{...r,status:'aboard'}});supportUI.say('人员已登船。原车与货物位置保留；返航或收车请继续操作NX07。');}}
  const supportUI=mountSupportUI({
    read:()=>{const saved=readSupport(),water=options.waterSupport?.();return {water:water?.snapshot().state,waterAvailable:!!water&&!!getJourney()?.cards?.done?.['7-end']&&astronaut.active&&!refuge?.inside&&!!getJourney()?.mainlineSurvival?.power?.online,rescue:currentRescue(),crew:saved.crew,rescueFlying:flyer.summoning,canRescue:shipReady&&astronaut.active&&!refuge?.inside&&!carrier.active&&!light?.active&&!rover.driving()};},
    setOverlay,notify,requestWater:async()=>{const water=options.waterSupport?.(),ok=await water?.action('requestWater');if(ok)sound.radio();return ok;},requestRescue,
    requestCrew:id=>{const saved=readSupport();if(!saved.crew[id])writeSupport({crew:{...saved.crew,[id]:{at:Date.now(),status:'pending'}}});},
    locate:p=>{open();select({...p,...localToGeo(p,site),local:true,type:'支援定位'});},
  });
  // Ground summons: the route goal IS the operator's live position; it is replanned as they walk.
  const summonDrives={};
  function planSummonRoute(kind){
    const carrierKind=kind==='carrier',start=carrierKind?{x:carrier.position.x,z:carrier.position.z}:roverPoint(),o=astronaut.position,goal={x:o.x,z:o.z};
    const plan=planTerrainRoute({start,goal,heightAt,maxSlope:carrierKind?22:26,
      blocked:(x,z,yaw)=>Math.hypot(x-goal.x,z-goal.z)<SUMMON[kind].gap?false:blocked(x,z)||(shipReady&&flyer.asset.contains(x,z,carrierKind?6:2,carrierKind?carrierHeight():MU7_HEIGHT))||(carrierKind?Math.hypot(x-start.x,z-start.z)>7&&!carrier.canTraverse(x,z,yaw):carrier.contains(x,z))||!!refuge?.blocked(x,z)});
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
    const look=lookAhead(kind,p.speed),path=d.path;
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
    const desired=Math.min(AUTO_SPEED[kind],Math.max(.3,gapLeft*.4))/(1+Math.abs(angle)*1.5);
    // ARES throttle is a speed command (× cruise m/s); MU-7 throttle is hub torque, so it needs real authority on grades.
    const throttle=kind==='carrier'?Math.min(.9,desired/ARES_DRIVE.cruise+Math.max(0,desired-p.speed)*.08):p.speed<desired?Math.min(1,.45+(desired-p.speed)*1.5):0;
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
    home:pod.home,solarTime:()=>({dayFraction:operations.environment.dayFraction,refLon:site.lon}),
    findLandingSpot:near=>findLandingSite(near,heightAt,(x,z)=>blocked(x,z)||carrier.contains(x,z)||!!light?.contains(x,z)||!!refuge?.blocked(x,z)||!!refuge?.onPad(x,z)||!!relics?.landingBlocked(x,z)||Math.hypot(x-roverPoint().x,z-roverPoint().z)<4),
    onShipReady:()=>{shipReady=true;},onDepart:()=>{if(carrier.ready)carrier.save();options.getGrid?.()?.flush?.();options.onDepart?.();}});
  const deckButtons={ground:groundButton,view:viewButton,map:mapButton,fly:flyButton,orbit:orbitButton,leave:leaveButton,carrier:carrierButton,cargo:cargoButton,shipDoor,shipUnload,shipLoad,crewRide:crewRideButton,refuge:refugeButton,station:stationButton,rest:restButton,overview:overviewButton,mission:taskButton,pause:pauseButton,
    ...Object.fromEntries(crewPortButtons.map((b,k)=>['port'+(k+2),b]))};
  function deckCommand(id,pressed){
    if(pressed===false){if(id==='brake')uiBrake=false;if(id==='interact')operations.setInteract(false);flyer.hold(id,false);return;}
    if(paused||mapOpen||overlayOpen||changing||refuge?.busy)return;
    if(id==='brake'){if(flyer.active)flyer.hold('brake',true);else uiBrake=true;return;}
    if(id==='up'||id==='down'){flyer.hold(id,true);return;}
    if(id==='interact'){operations.setInteract(true);return;}
    if(id.startsWith('summon:'))return summon(id.slice(7));
    if(id==='charge-carrier')return carrier.toggleCharge();
    if(id==='charge-ship')return carrier.toggleCharge('ship');
    if(id==='disconnect-power')return carrier.charging&&carrier.toggleCharge();
    if(id==='ship-reactor'){if(carrier.shipPower&&shipReady&&flyer.grounded&&(flyer.active||carrier.active&&distance(carrier.position,flyer.position)<=90||astronaut.active&&!refuge?.inside&&distance(astronaut.position,flyer.position)<=90)){options.getGrid?.().toggleReactor();notify(carrier.shipPower.reactor?'船载核电已恢复，电池开始补充。':'船载核电已停机，基础负载使用船载电池。');}return;}
    if(id==='route')return routeFlight.open();
    if(id==='route-fly')return routeFlight.active?routeFlight.cancel():routeFlight.start();
    if(id==='stop-remote')return walk();
    if(id==='light-leave')return light?.leave();
    if(id==='light-recover')return light?.recover();
    if(id==='light-brake')return light?.brake();
    if(id==='emergency-brake'){autopilot.stop('紧急制动已接管。');emergencyBrake=true;return;}
    if(id==='emergency-hover')return flyer.hover();
    if(id==='auto'){if(autopilot.active)autopilot.stop('自动驾驶已停止。');else{open();if(route&&!q('#map-auto').disabled)q('#map-auto').click();}return;}
    // Away from the first landing site the outpost is not in this scene: send the player to the route chart's HOME instead.
    if(id==='return-home'&&!refuge)return routeFlight.openHome();
    if(id==='return-home'){const home=catalog().find(x=>x.id==='refuge');if(home){open();select(home);notify('已标记生活舱气闸。可规划地形路线，按 WASD 返回；不会自动移动人物。');}return;}
    if(id.startsWith('mission:'))return [...document.querySelectorAll('.journey-actions button')].find(b=>b.dataset.action===id.slice(8))?.click();
    if(id==='mode:walk'){if(carrier.active)return leaveCarrier();if(flyer.active)return leaveShip();return walk();}
    if(id==='mode:remote'){if(carrier.active||flyer.active){notify('请先停稳离开当前载具，再连接 MU-7。');return;}return boardRover();}
    if(id==='support'){supportUI.open();return;}
    if(id==='optional-relics'){options.openRelics?.();return;}
    if(id==='mode:carrier'){if(!carrier.ready){notify('ARES 尚在 NX07 内，请先卸车。');return;}if(!astronaut.active){notify('先切换为步行，再靠近 ARES 8 m 内登车。');return;}return boardCarrier();}
    if(id==='mode:flight'){if(flyer.active)return;return boardShip();}
  }
  commandDeck=mountMobilityDeck({heightAt,renderer:options.renderer,buttons:deckButtons,command:deckCommand,setOverlay,read:()=>({
    holdStatus:changing&&flyer.asset.unloading&&delivered&&!paused&&!mapOpen&&!overlayOpen&&!document.hidden?'自动入库中 · 对中、转正、升舱':undefined,shipPower:options.getGrid?.()?.ship,light,current:light?.active?'light':carrier.active?'carrier':flyer.active?'flight':rover.driving()?'remote':astronaut.active?'walk':'overview',player:player(),carrier,flyer,astronaut,operations,roverModel:rover.model(),roverSpeed:rover.speed(),roverPoint:roverPoint(),autopilot,route,routeFlight,refuge,site,shipReady,delivered,inRefuge:!!refuge?.inside,summons:Object.keys(summonDrives).concat(flyer.summoning?['ship']:[]),
    optionalRelics:!!getJourney()?.relics?.done?.INSG,landmarks:catalog(),title:light?.active?'ARES L04':titleLabel.textContent,subtitle:light?.active?'四轮封闭任务车':modeLabel.textContent,status:light?.active?'驾驶中 · 进入4号平台青框自动回收':stateLabel.textContent+' · '+hint.textContent,view:light?.active?light.car.view:carrier.active?carrier.view:flyer.active?flyer.view:rover.driving()?rover.view?.():astronaut.view,paused:paused||mapOpen||overlayOpen||changing||document.hidden
  })});
  addEventListener('keydown',e=>{
    if(paused||mapOpen||overlayOpen||e.repeat||e.target.closest?.('input,textarea,select,dialog'))return;
    const action=carrier.active?{KeyN:'auto',KeyL:'cargo'}[e.code]:flyer.active?{KeyG:'fly',KeyO:'orbit'}[e.code]:null;
    if(action){e.preventDefault();deckButtons[action]?deckButtons[action].click():deckCommand(action);}
  });
  return {
    get support(){return {state:readSupport(),requestRescue,open:()=>supportUI.open()};},arrivalSite(p){flyer.park(p);shipReady=true;refuge?.landed();},get refuge(){return refuge;},padFloor,unloadShip,loadShip,driveControl,driveTo,get autopilot(){return autopilot;},
    get sound(){return sound.audio;},get remote(){return !!rover?.driving();},get roverStowed(){return !delivered?'ship':carrier.ready&&carrier.loaded?'carrier':'';},get roverPosition(){return {...roverPoint()};},get active(){return flyer.active||carrier.active||!!light?.active;},get light(){return light;},get carrier(){return carrier;},boardCarrier,leaveCarrier,boardShip,cargoAction,summon,get summons(){return Object.keys(summonDrives).concat(flyer.summoning?["ship"]:[]);},get walking(){return astronaut.active;},get astronaut(){return astronaut;},get shipRing(){return shipRing;},walk,boardRover,get blocked(){return mapOpen;},get flyer(){return flyer;},openMap:open,routeFlight,
    // 挡得住视线的载具和建筑（遗迹拍照判定用，D71）：名字 + 场景里的模型。地基算前哨仓的一部分。
    get occluders(){return [{name:'L04',object:light?.car.asset.group},{name:'ARES',object:carrier.asset.group},{name:'MU-7',object:rover?.model()?.root},{name:'NX07',object:flyer.asset.group},{name:'前哨仓',object:refuge?.drop.group},{name:'前哨仓',object:refuge?.drop.padGroup}].filter(o=>o.object);},
    setOverlay,
    get frozen(){return paused||mapOpen||overlayOpen||document.hidden||!!refuge?.busy||!!operations.frozen;},
    toggleCrewPort,
    setPaused(value){paused=value;flyer.setPaused(paused||mapOpen||overlayOpen);carrier.setPaused(paused||mapOpen||overlayOpen);light?.setPaused(paused||mapOpen||overlayOpen);astronaut.setPaused(paused||mapOpen||overlayOpen||!!refuge?.busy||!!refuge?.resting);},
    operations,dust,
    update(dt,now=performance.now()){
      routeFlight.tick(paused||mapOpen||overlayOpen||document.hidden?0:dt,{now,halted:paused||document.hidden});
      operations.update(paused||mapOpen||overlayOpen||document.hidden?0:dt);updateSummons(paused||mapOpen||overlayOpen||document.hidden?0:Math.min(dt,.05));
      if(autopilot.active&&((autopilot.owner==='carrier'&&!carrier.active)||(autopilot.owner==='rover'&&!rover.driving())))autopilot.stop('操作模式已切换，自动驾驶结束。');
      autoStop.hidden=!autopilot.active;
      q('.map-auto-hint').textContent=route?.budget&&!autopilot.active?budgetStatus(route.budget,carrier.drivePower?.energy)+' '+budgetText(route.budget):autopilot.active?'自动驾驶暂停于地图；关闭地图后继续。':!carrier.active&&!rover.driving()?'先连接 MU-7 遥控或登上 ARES，再启动自动驾驶。':!route?'先选择目的地并规划路线。':'到达后自动停车；WASD / 空格可手动接管。';
      q('#map-auto').disabled=!route||autopilot.active||(!carrier.active&&!rover.driving());
      options.getGrid?.()?.tickShip?.(paused||mapOpen||overlayOpen||changing||document.hidden||refuge?.busy||operations.frozen?0:dt,shipReady);
      flyer.update(mapOpen?0:dt);updateSupport();carrier.update(mapOpen?0:dt);light?.update(dt);
      sound.update(dt,{frozen:paused||mapOpen||overlayOpen||changing||document.hidden||!!operations.frozen,rover:rover.driving()?rover.model():null,vehicle:light?.active?light.car:carrier.active?carrier:null,inside:!!refuge?.inside,alarm:operations.state.power<25?1:0});
      const dustDt=paused||mapOpen||overlayOpen||document.hidden?0:Math.min(dt,.05);
      updateDustSources(dustDt,{carrier,carriers:light?[light.car]:[],rover:rover.model(),roverOnGround:roverOnGround(),flyer});dust.update(dustDt);
      if(dockCapture&&!paused&&!mapOpen&&!overlayOpen&&!document.hidden){
        if(!canCaptureDock()){dockCapture=false;}
        else if(Math.abs(carrier.speed)<LOAD_PAD.stopSpeed){dockCapture=false;dockCarrier();}
      }
      astronaut.update(mapOpen||changing?0:dt);if(carrier.active)astronaut.seatView(carrier.view==='驾驶舱');
      const ringLive=shipReady&&flyer.grounded&&!flyer.active&&astronaut.active&&!refuge?.inside&&!mapOpen;
      shipRing.update(paused||document.hidden?0:dt,{visible:ringLive,x:flyer.position.x,z:flyer.position.z,
        within:ringLive&&distance(astronaut.position,flyer.position)<=SHIP_BOARD});
      refuge?.update(paused||mapOpen||overlayOpen||document.hidden?0:dt);
      stationUI?.update(refuge);
      watch.update(Math.min(dt,.05),{paused:paused||mapOpen||overlayOpen||document.hidden||!dt,
        mode:flyer.active?'flight':carrier.active?'carrier':rover?.driving()?'remote':astronaut.active?'walk':'overview',
        listener:player(),inside:!!refuge?.inside,airlock:refuge?.busy?refuge.progress*7.2:null,
        walk:astronaut.active?{speed:astronaut.speed,airborne:astronaut.motion.airborne}:null,
        ship:shipReady?shipSound():null,
        carrier:carrier.ready&&!carrier.active?{x:carrier.position.x,z:carrier.position.z,speed:carrier.speed}:null,
        rover:null // MU-7 uses the contact/load-aware procedural motor mix above.
      });
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
      leaveButton.hidden=!flyer.active;leaveButton.disabled=paused||mapOpen||changing||flyer.altitude>2.5||Math.abs(flyer.speed)>.5||flyer.landing||flyer.transferring;
      const exitPort=flyer.active?crewExitPort():-1;leaveButton.textContent=exitPort>=0?`从 ${exitPort+1} 号舱口离船 · F`:'离船步行 · F';
      overviewButton.hidden=!astronaut.active;
      evaStatus.hidden=!astronaut.active&&!driving;
      const rd=distance(astronaut.position,roverPoint()),sd=distance(astronaut.position,flyer.position),onDeck=crewDeck();
      evaStatus.textContent=`舱外步行 · ${astronaut.view} · ${astronaut.speed.toFixed(1)} m/s\nWASD 移动 · Shift 跑 · 空格跳 · Z 蹲 · 拖动环视 · C 切换视角\nMU-7 ${Math.round(rd)} m · NX07 ${shipReady?Math.round(sd)+' m':'待部署'} · ${onDeck>=0?`F 乘 ${onDeck+1} 号平台登船`:shipReady&&sd<=SHIP_BOARD?'F 登船':'F 遥控 · M 地图'}`;
      if(driving)evaStatus.textContent=`MU-7 · 无人遥控连接中\n操作员距探测车 ${Math.round(rd)} m · 面板结束遥控返回原位\nC 切换机位 · 桅杆视角为相机回传`;
      orbitButton.hidden=!flyer.active;orbitButton.disabled=flyer.altitude<600||flyer.transferring||flyer.landing;
      orbitButton.textContent=flyer.transferring?'轨道转移中…':flyer.altitude<600?'上升至 600 m 可入轨':'进入火星轨道';
      flightStatus.hidden=!flyer.active;
      flightStatus.textContent=`NX07 VTOL · 离地 ${Math.round(flyer.altitude)} m · ${Math.abs(flyer.speed*3.6).toFixed(0)} km/h${routeFlight.active?' · '+routeFlight.status:''}\nW/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速\n拖动环视 · 滚轮调整视距`;
      const current=light?.active?'light':carrier.active?'carrier':flyer.active?'flight':driving?'remote':astronaut.active?'walk':'overview';
      document.body.dataset.mobilityMode=current;
      const nearCarrier=carrier.ready&&astronaut.active&&distance(astronaut.position,carrier.position)<=10;
      const canBoardCarrier=nearCarrier&&distance(astronaut.position,carrier.position)<=8;
      const inRefuge=astronaut.active&&(!!refuge?.inside||!!refuge?.busy);
      document.body.classList.toggle('in-refuge',inRefuge&&astronaut.active);
      const helmetLabel=document.querySelector('.eva-helmet small');if(helmetLabel)helmetLabel.textContent=inRefuge?'临时生活舱':'舱外步行';
      const nearShip=shipReady&&astronaut.active&&!inRefuge&&sd<=SHIP_SERVICE;
      const canBoardShip=shipReady&&!flyer.summoning&&astronaut.active&&!inRefuge&&sd<=SHIP_BOARD;
      const nearShipDriving=shipReady&&carrier.active&&delivered&&distance(carrier.position,flyer.position)<=SHIP_DRIVE_DOCK;
      shipChecks.hidden=!nearShip;shipChecks.textContent=nearShip?`腹舱检查 · ${flyer.asset.status} · ${checkShipDoor().reason}`:'';
      // Ports answer the walking crew under the ship and the pilot of a landed ship.
      const portDesk=nearShip||shipReady&&flyer.active&&flyer.grounded,portsLocked=changing||paused||mapOpen||!flyer.asset.supportReady;
      shipUnload.hidden=!nearShip;shipDoor.hidden=!(portDesk||nearShipDriving);shipLoad.hidden=!(nearShip||nearShipDriving)||!delivered;shipLoad.disabled=changing||paused||mapOpen;shipLoad.textContent=!carrier.active?'装载 ARES 回NX07':!flyer.asset.doorOpen?'开舱 · 驶入装船':!flyer.asset.padReady?'装载位下降中…':'自动入库';shipDoor.textContent=flyer.asset.doorOpen?'关闭 1 号 ARES 舱口':'打开 1 号 ARES 舱口';shipDoor.disabled=portsLocked;
      crewPortButtons.forEach((b,k)=>{const s=flyer.asset.portState(k+1),no=k+2;b.hidden=!portDesk;b.disabled=portsLocked;
        b.textContent=s.open?(s.ready?`关闭 ${no} 号舱口`:`${no} 号舱口开启中…`):s.closed?`打开 ${no} 号舱口`:`${no} 号舱口关闭中…`;});
      const deck=crewDeck();crewRideButton.hidden=deck<0;crewRideButton.disabled=changing||paused||mapOpen;crewRideButton.textContent=`乘 ${deck+1} 号平台登船 · F`;
      shipUnload.disabled=changing||delivered||paused||mapOpen;
      shipUnload.textContent=delivered?'物资已卸载':changing?'正在处理…':!flyer.asset.doorOpen?'打开腹舱并卸载 ARES':!flyer.asset.doorReady?'升降平台展开中…':'卸载 ARES 与物资';
      carrierButton.hidden=!(carrier.active||canBoardCarrier);carrierButton.textContent=carrier.active?'下车 · F':'登上 ARES · F';carrierButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      groundButton.hidden=carrier.active||!!light?.active||flyer.active||inRefuge;groundButton.disabled=paused||mapOpen||changing||(astronaut.active&&(carrier.loaded||!delivered));
      flyButton.hidden=!flyer.active&&!canBoardShip;
      leaveButton.hidden=!flyer.active;
      viewButton.hidden=current==='overview'&&!light?.active;viewButton.textContent='视角 · C';
      cargoButton.hidden=!(carrier.active||nearCarrier);
      cargoButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      cargoButton.textContent=carrier.loaded?'卸载 MU-7':'装载 MU-7';
      overviewButton.hidden=!(options.kind==='park'&&astronaut.active);
      taskButton.hidden=!document.querySelector('.journey-objective');pauseButton.hidden=!!document.querySelector('.journey-menu');
      const info={
        light:light?['SURFACE TRANSPORT','ARES L04 · 四轮封闭车',light.phase==='outside'?'地面驾驶':'自动收放', [['速度',(Math.abs(light.car.speed)*3.6).toFixed(0)+' km/h'],['平台','4号最小舱口'],['视角',light.car.view]],Math.abs(light.car.speed)>.4?'按空格停稳后下车。':'驶离平台后，返回青色内框自动回收。','W/S 前进倒车 · A/D 转向 · Shift 加速 · 空格制动 · C 驾驶舱/跟车 · F 下车 · 拖动环视 / 滚轮缩放']:null,
        carrier:['SURFACE TRANSPORT','ARES · 载人运输车','地面驾驶', [['速度',(Math.abs(carrier.speed)*3.6).toFixed(0)+' km/h'],['货舱',carrier.manifest.label],['视角',carrier.view]],Math.abs(carrier.speed)>.4?'按空格停稳后可下车、装卸。':'W 前进；停稳后可下车、装卸 MU-7。','W/S 前进倒车 · A/D 转向 · Shift 加速 · 空格制动 · C 驾驶舱/跟车 · F 下车 · 拖动环视 / 滚轮缩放'],
        flight:['FLIGHT CONTROL','NX07 · 飞行器',flyer.transferring?'轨道转移':flyer.landing?'自动降落':flyer.altitude<3?'已着陆':'飞行中', [['速度',(Math.abs(flyer.speed)*3.6).toFixed(0)+' km/h'],['起落架',flyer.asset.status],['视角',flyer.view]],flyer.altitude>2.5?'离船需先降落；离地 600 m 可转入轨道。':'E 垂直起飞；F 离船步行。','W/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速 · C 视角 · F 离船'],
        remote:['REMOTE LINK','MU-7 · 无人探测车','遥控已连接', [['速度',(Math.abs(rover.speed())*3.6).toFixed(0)+' km/h'],['电量',operations.state.power.toFixed(1)+'%'],['视角',rover.view?.()||'跟车']], '操作员留在原地。点击结束遥控返回操作员；F 控制车灯。','W/S 前进倒车 · A/D 转向 · 空格制动 · C 机位 · E 任务勘测 · G 雷达 · R 机械臂（WASD 瞄准） · T 太阳翼 · Y 牵引控制 · F 车灯 · B 中继器 · P 摄影 · K 拍照 · X 扶正 · Tab 图鉴 · H 隐藏界面 · 按住 E 交互'],
        walk:['EXTRAVEHICULAR','舱外步行','宇航员', [['速度',astronaut.speed.toFixed(1)+' m/s'],['运输车',carrier.ready?Math.round(distance(astronaut.position,carrier.position))+' m':'待部署'],['NX07',shipReady?Math.round(sd)+' m':'待部署']], onDeck>=0?`F 乘 ${onDeck+1} 号平台升入 NX07，即登船。`:canBoardCarrier?'F 登上 ARES；可在此装卸探测车。':nearCarrier?'再靠近至 8 m 内登车；当前可装卸探测车。':canBoardShip?'F 登上NX07。':'F 遥控 MU-7；在地图查看载具停放位置。','WASD 步行 · Shift 跑 · 空格跳 · Z 蹲 · C 第一/第三人称 · 拖动环视 · F 交互 · M 地图'],
        overview:['EXPEDITION','火星探索','场景总览', [['探测车','MU-7'],['运输车',carrier.ready?'已部署':'待部署'],['NX07',shipReady?'已部署':'待部署']], '开始探索，靠近载人车或飞船登乘。','F 进入步行 · M 地图导航']
      }[current];
      modeLabel.textContent=info[0];titleLabel.textContent=info[1];stateLabel.textContent=dockCapture?'自动入库接管':autopilot.active?'自动驾驶中':info[2];info[3].forEach(([label,value],i)=>{metricNodes[i].label.textContent=label;metricNodes[i].value.textContent=value;});hint.textContent=current==='carrier'&&nearShipDriving?(changing?'装船进行中…':flyer.asset.padReady?dockHint(dockState()):flyer.asset.doorOpen?'主升降平台下降中，落地后高亮。':'打开腹舱，驶入平台中央内框即自动入库，车头朝向不限。'):info[4];help.querySelector('p').textContent=info[5];
      refugeButton.hidden=!refuge?.ready||!astronaut.active||(!inRefuge&&refuge.distance(astronaut.position)>8);
      refugeButton.textContent=refuge?.busy?'气闸循环中…':refuge?.inside?'通过气闸出舱 · F':'进入生活舱 · F';
      refugeButton.disabled=paused||mapOpen||changing||!!refuge?.busy||!!refuge?.resting||(!!refuge&&refuge.distance(astronaut.position)>2.6);
      restButton.hidden=!refuge?.inside||!!refuge?.busy||!astronaut.active;restButton.textContent=refuge?.resting?'起身 · F':'坐下休息';restButton.disabled=paused||mapOpen;
      const station=refuge?.inside&&!refuge.resting&&astronaut.active?refuge.nearestStation(astronaut.position):null;
      stationButton.hidden=!station;
      if(station){stationButton.textContent=(station.id==='lab'?'打开 '+station.name:'查看 '+station.name)+(refuge.distance(astronaut.position)<=2.6?'':' · F');
        stationButton.disabled=paused||mapOpen||!!labPanel||!!stationUI?.isOpen;}
      if(inRefuge&&astronaut.active){
        modeLabel.textContent='FORWARD OUTPOST';titleLabel.textContent='前哨仓 · 舱内';stateLabel.textContent=refuge.busy?'气闸循环':refuge.resting?'休息中':'已入舱';hint.textContent=refuge.label;
        [['所在',refuge.busy?'气闸隔离':refuge.area(astronaut.position)||'舱内'],['舱门',refuge.busy?Math.round(refuge.progress*100)+'%':'双门锁闭'],['状态',refuge.resting?'休息':'暂时居住']].forEach(([label,value],i)=>{metricNodes[i].label.textContent=label;metricNodes[i].value.textContent=value;});
        help.querySelector('p').textContent='WASD 舱内走动 · 拖动环视 · C 视角 · 走近设备按 F 操作 · 走近气闸 F 出舱 · 坐下休息后 F 起身';
        for(const b of [carrierButton,flyButton,shipDoor,...crewPortButtons,crewRideButton,shipUnload,shipLoad,cargoButton,overviewButton])b.hidden=true;
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
