import * as THREE from 'three';
import {WATER,applyWaterAction,tickWater,observeWaterSample,waterPayload} from './water-supply.js';
import {createPowerPallet} from '../survival/world.js';
import {pickHomePark} from '../cards/world.js';
import {planTerrainRoute} from './route.js';

const aliases={requestWater:'request',loadWater:'load',unloadWater:'unload',reviewWater:'review',collectFeed:'collect',deliverFeed:'deliver-feed',installWater:'install',extractWater:'extract',purifyWater:'purify',testWater:'test',storeWater:'store'};
const labels={request:'申请水务补给',load:'装水务设备',unload:'设备入库',review:'复核水源',collect:'装50千克原料','deliver-feed':'原料入库',install:'接入水务模块',extract:'启动原水提取',purify:'启动净化',test:'检测本批水',store:'转入净水罐'};
const near=(a,b,r)=>a&&b&&Math.hypot(a.x-b.x,a.z-b.z)<=r;
/** Reuses an unchanged packed teaching pallet at unit scale, and the existing indoor lab.
 * No new precision equipment geometry: pallet is a labelled placeholder for the shipment/feed. */
export function mountWaterSupply({scene,mobility,heightAt,getJourney,state,save,replace,notify}){
 const pallet=createPowerPallet();pallet.name='Water shipment · reused teaching pallet';pallet.visible=false;scene.add(pallet);
 let modal=null,planning=false,reason='',sitePlan=null,renderClock=0;
 const floor=(x,z)=>mobility.padFloor?.(x,z)??heightAt(x,z);
 const current=()=>state().water;
 const mode=()=>mobility.carrier.active?'carrier':mobility.flyer.active?'flight':mobility.remote?'remote':mobility.walking?'walk':'overview';
 function context(){const s=state(),c=mobility.carrier,r=mobility.refuge;
  const home=s.water.home||(!r?.inside&&r?.ready?supportHome(r.target()):null);
  return {eligible:!!state().analysis?.read,mode:mode(),frozen:mobility.frozen||!!modal,inHome:!!r?.inside,player:mobility.astronaut.position,
   lab:r?.stationPoint('lab'),home,carrier:c.position,carrierReady:c.ready&&mobility.roverStowed!=='ship',speed:c.speed,roverLoaded:c.loaded,
   samples:s.samples,powerOnline:s.power.online,energy:s.power.energy,...sitePlan};
 }
 const obstacle=(x,z)=>mobility.refuge?.blocked(x,z)||mobility.flyer.asset.contains(x,z,6,7);
 function supportHome(door){const clear=p=>!!p&&!obstacle(p.x,p.z)&&mobility.carrier.canTraverse(p.x,p.z);const preferred=pickHomePark(door,mobility.flyer.position,(x,z)=>clear({x,z}));if(clear(preferred))return preferred;for(const d of [36,50,70,95,120])for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:door.x+Math.cos(a)*d,z:door.z+Math.sin(a)*d};if(clear(p))return p;}return null;}

 function route(start,goal){return planTerrainRoute({start,goal,heightAt:floor,blocked:obstacle,canTraverse:(x,z,yaw)=>mobility.carrier.canTraverse(x,z,yaw),sampleStep:.5,maxSlope:22,maxSpan:5000});}
 async function plan(){
  if(sitePlan)return sitePlan;if(planning)return null;planning=true;notify('正在核对投送区、货位和陆路，请稍候。');
  await new Promise(r=>setTimeout(r,40));
  try{
   const c=context();if(c.frozen||c.mode!=='walk'||c.inHome||!c.home){reason=c.frozen?'请关闭面板后重新申请。':!c.home?'营地卸货点尚未就绪，请稍候再申请。':'先步行出舱再申请。';notify(reason);return null;}
   // Deterministic finite candidates in the initial map. Landing uncertainty is a teaching abstraction.
   const angle=((getJourney()?.startedAt||0)%360)*Math.PI/180;
   for(let i=0;i<8;i++){
    const a=angle+i*Math.PI/4,d=750+(i%3)*75,stop={x:c.home.x+Math.cos(a)*d,z:c.home.z+Math.sin(a)*d},drop={x:stop.x+16,z:stop.z};
    if(!mobility.carrier.canTraverse(stop.x,stop.z)||!mobility.carrier.canTraverse(drop.x,drop.z)||obstacle(drop.x,drop.z))continue;
    const clear=[[-2,-2],[2,-2],[-2,2],[2,2]].map(([x,z])=>floor(drop.x+x,drop.z+z));if(Math.max(...clear)-Math.min(...clear)>.5)continue;
    const path=route(c.home,stop);if(!path.ok)continue;
    // Use an accessible off-pad prospecting field. It is a simulation, not an orbital ice map.
    for(const [dx,dz] of [[-130,-170],[-170,-90],[-100,-220],[130,-170]]){
     const field={x:c.home.x+dx,z:c.home.z+dz};if(!route(c.home,field).ok)continue;
     sitePlan={drop,stop,field,routeOK:true};return sitePlan;
    }
   }
   reason='没有找到货舱与取料区的可达陆路；本批尚未发运，可重新申请检查。';notify(reason);return null;
  }finally{planning=false;}
 }
 function commit(w){const s=state();save({...s,water:w});}
 async function action(name){
  const type=aliases[name]||name;
  if(type==='request'&&current().cargo==='orbit'){
   if(planning)return false;const c=context();if(!c.eligible||c.frozen||c.mode!=='walk'||c.inHome){reason=c.frozen?'请关闭面板后重新申请。':!c.eligible?'先听完艾琳第七章简报。':'先步行出舱，在家门外申请水务设备。';notify(reason);return false;}
   if(!await plan())return false;
  }
  const result=applyWaterAction(current(),type,context());reason=result.reason;
  if(result.changed)commit(result.state);
  notify(reason||(result.changed?`${labels[type]}已完成${['extract','purify'].includes(type)?'，作业进行中。':'。'}`:'这一步已经完成。'));
  render();return result.ok;
 }
 function labStep(){const w=current();if(w.cargo!=='home')return null;
  return !w.reviewed?'review':!w.installed?'install':w.job?null:!w.extracted?'extract':!w.purified?'purify':!w.tested?'test':!w.stored?'store':null;
 }
 function drawPallet(){const w=current(),c=mobility.carrier;const visible=['falling','ground','aboard'].includes(w.cargo)||w.feedAboard||w.cargo==='home'&&!w.installed;
  pallet.visible=visible;if(!visible)return;
  if(waterPayload(w)){
   if(pallet.parent!==c.asset.group)c.asset.group.add(pallet);
   pallet.position.set(0,2.88,-2.405);pallet.rotation.set(0,Math.PI/2,0);
  }else{
   if(pallet.parent!==scene)scene.add(pallet);
   const p=w.cargo==='home'?w.home&&{x:w.home.x+16,z:w.home.z}:w.drop;
   if(p){pallet.position.set(p.x,floor(p.x,p.z)+.08+(w.cargo==='falling'?120*(1-w.dropElapsed/WATER.dropSeconds):0),p.z);pallet.rotation.set(0,Math.PI/2,0);}
  }
 }
 function close(){if(!modal)return;modal.remove();modal=null;mobility.setOverlay(false);removeEventListener('keydown',key,true);}
 function key(e){if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}}
 function open(){
  if(modal)return;if(!context().eligible)return;modal=document.createElement('dialog');modal.className='water-dialog';modal.setAttribute('aria-label','有限水务与货物账本');
  modal.innerHTML='<header><small>WATER / BATCH 01</small><h2>首批本地水</h2><button class="water-close">关闭 · Esc</button></header><p class="water-status" role="status"></p><div class="water-tanks"></div><div class="water-job"></div><details open><summary>原料、能量与耗材</summary><p class="water-ledger"></p></details><details><summary>货单与工程复核</summary><p class="water-report"></p></details><div class="water-actions"></div><footer>教学模拟：含水量2%、提取捕集80%、净化回收90%；不是埃律西昂实测矿藏或现实饮水认证。复用现有货物白模与舱内工位，没有完整采掘、吊装或水处理设备动画。<br>本面板打开时暂停世界；启动作业后关闭，回到游戏观察。</footer>';
  modal.querySelector('.water-close').onclick=close;
  for(const [type,label] of Object.entries(labels)){const b=document.createElement('button');b.dataset.waterAction=type;b.textContent=label;b.onclick=()=>{close();void action(type);};modal.querySelector('.water-actions').append(b);}
  document.body.append(modal);mobility.setOverlay(true);modal.showModal();addEventListener('keydown',key,true);render();
 }
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./water-supply.css',import.meta.url).href;document.head.append(css);
 function render(){drawPallet();if(!modal)return;const w=current(),c={...context(),frozen:false};const $=s=>modal.querySelector(s);
  $('.water-status').textContent=reason|| (w.stored?'本批模拟检测合格，0.72 L 已转入净水罐。':w.job?'作业进度已保存；关闭面板继续。':planning?'正在检查陆路。':'按艾琳的卡逐步完成。');
  $('.water-tanks').textContent=`原水 ${w.rawL.toFixed(2)} L　待检测 ${w.treatedL.toFixed(2)} L　净水 ${w.cleanL.toFixed(2)} L　废液 ${w.wasteL.toFixed(2)} L`;
  $('.water-ledger').textContent=`试验区剩余 ${w.fieldKg.toFixed(1)} kg / ${WATER.fieldKg} kg；本批原料 ${w.feedKg.toFixed(1)} kg${w.feedAboard?'（车载）':'（入库）'}；固体残余 ${w.residueKg.toFixed(1)} kg；水务用电 ${w.kwh.toFixed(2)} kWh；生活储备底线 ${WATER.reserveKWh} kWh；滤材剩余 ${w.filters}，已用 ${w.usedFilters}。提取4 kW、120秒；净化1 kW、12秒。营地2 kW持续负载另行扣账。`;
  $('.water-report').textContent=`有限补给 ${WATER.kitId}：提取模块×1、净化模块×1、5 L密封罐×3、滤材×2。总质量220 kg，打包1.76×1.10×3.1 m；本轮货位教学上限250 kg，MU-7互斥。状态：${({orbit:'轨道待命',falling:'下降中',ground:'地面待接',aboard:'ARES车载',home:'营地入库'})[w.cargo]}。复核样品：${w.sampleId||'尚未取得'}；${w.reviewed?'已归档并通过工程模拟复核，试验原料含水2%；不代表地下冰矿。':'还需试验区新钻取与归档。'}`;
  const job=$('.water-job');job.textContent=w.job?`${w.job.type==='extract'?'提取':'净化'} · ${Math.round(w.job.elapsed/(w.job.type==='extract'?120:12)*100)}%（面板暂停）`:'';
  for(const b of $('.water-actions').children){const type=b.dataset.waterAction,r=applyWaterAction(w,type,c);b.disabled=!r.ok||!r.changed;b.title=r.reason||'已完成或作业中';b.hidden=type==='request'?w.cargo!=='orbit':type==='load'?w.cargo!=='ground':type==='unload'?w.cargo!=='aboard':type==='collect'?w.collected:type==='deliver-feed'?!w.feedAboard:type==='review'?w.reviewed:type==='install'?w.installed:type==='extract'?w.extracted:type==='purify'?w.purified:type==='test'?w.tested:type==='store'?w.stored:false;}
 }
 return {action,open,actionStatus(name){const type=aliases[name];if(!type)return null;const c=context();
   if(type==='request'&&current().cargo==='orbit'){const ready=c.eligible&&c.mode==='walk'&&!c.inHome&&!c.frozen&&!planning;return {ready,reason:planning?'正在检查投送区与陆路，请稍候。':ready?'':'先步行出舱，再申请本批设备。'};}
   const r=applyWaterAction(current(),type,c);return {ready:r.ok&&r.changed,reason:r.reason||(!r.changed?'当前步骤已完成或作业正在进行。':'')};
  },open,get isOpen(){return !!modal;},get payload(){return waterPayload(current());},get loadKW(){const w=current();return w.job&&!mobility.frozen&&state().power.online&&state().power.energy>WATER.reserveKWh?(w.job.type==='extract'?4:1):0;},
  snapshot(){const w=current();return {state:w,targets:{drop:w.cargo==='falling'?null:w.drop,stop:w.cargo==='falling'?null:w.stop,home:w.home,field:w.field},planning,reason};},
  onSample(sample){commit(observeWaterSample(current(),sample));},
  interact(){const c=context();if(!c.eligible||!c.inHome||c.mode!=='walk'||!near(c.player,c.lab,2.6)||current().cargo!=='home')return false;const step=labStep();if(step)void action(step);else open();return true;},
  update(dt){const w=current();if(!mobility.frozen&&dt>0){const drop=w.drop,occupied=drop&&(near(mobility.astronaut.position,drop,5)&&mobility.walking&&!mobility.refuge?.inside||mobility.carrier.ready&&near(mobility.carrier.position,drop,8)||near(mobility.flyer.position,drop,80));
    const r=tickWater(w,dt,{energy:state().power.energy,powerOnline:state().power.online,dropClear:!occupied});if(r.reason)reason=r.reason;
    if(JSON.stringify(r.state)!==JSON.stringify(w)){const s=state();const next={...s,water:r.state,power:{...s.power,energy:Math.max(0,s.power.energy-r.spent)}};
     if(w.cargo!==r.state.cargo||!!w.job!==!!r.state.job)save(next);else replace(next);if(w.cargo==='falling'&&r.state.cargo==='ground'){mobility.sound?.radio();notify('WATER-01 已落稳，信标定位收到。打开支援或地图，开ARES去核单接货。');}
     if(w.job&&!r.state.job)notify(w.job.type==='extract'?'原水收集完成：0.80 L；还需净化与检测。':'净化完成：0.72 L待检测水；尚未进入净水库存。');}
   }
   renderClock+=dt;if(renderClock>=.1||dt===0){renderClock=0;render();}
  },blocked(x,z){const w=current();const p=w.cargo==='ground'?w.drop:w.cargo==='home'&&!w.installed&&w.home?{x:w.home.x+16,z:w.home.z}:null;return !!p&&Math.abs(x-p.x)<1.15&&Math.abs(z-p.z)<1.85;},
 };
}
