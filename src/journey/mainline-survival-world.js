import {mountSolarResearch} from './solar-research-world.js';
import {mountPowerResearch} from './power-research-world.js';
import {mountAssay} from './assay-world.js';
import {mountResearch} from './research-world.js';
import {createShipGrid} from './expedition-energy.js';
import {createDriveGrid} from './ares-logistics.js';
import {mountNursery} from './nursery-world.js';
import {mountWaterSupply} from './water-supply-world.js';
import * as THREE from 'three';
import {createPowerUI} from './power-ui.js';
import {solarOutput} from '../survival/solar-service.js';
import {createPowerWorld} from '../survival/power-world.js';
import {createPowerPallet} from '../survival/world.js';
import {SITES,survey} from '../survival/power.js';
import {normalizeMainlineSurvivalState,applyMainlineSurvivalAction,tickMainlinePower,ingestMainlineSample} from './mainline-survival.js';

/** Scene bridge: equipment is the existing teaching asset, translated to a surveyed site. */
export function mountMainlineSurvival({scene,heightAt,mobility,getJourney,updateJourney,surveyPoints=[],notify=()=>{}}){
 const environment=mobility.operations.environment,base=SITES[0];
 const translated=new THREE.Group();translated.name='Mainline surveyed power';scene.add(translated);
 const floor=(x,z)=>mobility.padFloor?.(x,z)??heightAt(x,z);
 const world=createPowerWorld(translated,(x,z)=>floor(x+translated.position.x,z+translated.position.z));
 const powerUI=createPowerUI({onWater:()=>water.open(),onNursery:()=>nursery.open(),onAssay:()=>assay.open(),onPowerResearch:()=>powerResearch.open(),onSolarResearch:()=>solarResearch.open(),onAction:action,onStep:()=>{const t=target();if(t)action(t.type);}});
 let modal=null,saveClock=0,pendingRelease=false,plannedSite=null,roverKW=0,roverChargeAt=-Infinity,renderClock=0;
 let persistedSignature=JSON.stringify(getJourney()?.mainlineSurvival),working=normalizeMainlineSurvivalState(getJourney()?.mainlineSurvival);
 const state=()=>{const raw=getJourney()?.mainlineSurvival,signature=JSON.stringify(raw);if(signature!==persistedSignature){persistedSignature=signature;working=normalizeMainlineSurvivalState(raw);}return working;};
 const save=s=>{working=s;updateJourney({mainlineSurvival:s});persistedSignature=JSON.stringify(getJourney()?.mainlineSurvival);};
 const identify=sample=>({...sample,id:sample.id||`mu7-legacy-${Number(sample.x).toFixed(4)}-${Number(sample.z).toFixed(4)}-${sample.type||'表层风化物'}`,type:sample.type||'表层风化物',source:'MU-7'});
 const flush=()=>{if(JSON.stringify(working)!==persistedSignature)save(working);};
 for(const sample of mobility.operations.state.samples||[])working=ingestMainlineSample(working,{...identify(sample),archived:false});
 const water=mountWaterSupply({scene,mobility,heightAt,getJourney,state,save,replace:s=>{working=s;},notify});
 const nursery=mountNursery({mobility,getJourney,state,save,replace:s=>{working=s;},notify,onPower:()=>powerUI.open()});
 const assay=mountAssay({mobility,getJourney,state,save,replace:s=>{working=s;},notify,onResearch:()=>research.open()});
 const research=mountResearch({mobility,getJourney,state,save,notify});
 const recordIdle=()=>!state().water.job&&!(state().nursery.sown&&!state().nursery.inspected&&state().nursery.elapsed<120)&&!state().assay.job&&!mobility.carrier.charging&&performance.now()-roverChargeAt>=250;
 const powerResearch=mountPowerResearch({mobility,getJourney,state,save,notify,idle:recordIdle});
 const solarResearch=mountSolarResearch({mobility,getJourney,state,save,notify,light:sunlight,onSolarAction:action});
 let resumeJob=!!working.power.solar.job;
 flush();window.addEventListener('pagehide',flush);
 // Reuse the original full-size packed energy pallet; deployed equipment stays separate.
 const cargo=createPowerPallet();cargo.name='NX07 mainline energy pallet';scene.add(cargo);
 const near=(p,q,reach=3)=>p&&q&&Math.hypot(p.x-q.x,p.z-q.z)<=reach;
 function candidate(){
  const known=state().power.site;if(known)return known;if(plannedSite)return plannedSite;
  const preferred=surveyPoints.find(p=>/power|energy/i.test(p.id))||surveyPoints[1];
  const home=mobility.refuge?.target();const seeds=[preferred,home&&{x:home.x+24,z:home.z+20},home&&{x:home.x-24,z:home.z+20}].filter(Boolean);
  for(const origin of seeds)for(const [dx,dz] of [[0,0],[12,0],[-12,0],[0,12],[0,-12],[24,0],[-24,0]]){
   const p={x:origin.x+dx,z:origin.z+dz};if(!survey(p,floor).ok)continue;
   if([p,{x:p.x+6,z:p.z+4},{x:p.x+6,z:p.z+10}].every(q=>mobility.carrier?.canTraverse?.(q.x,q.z)!==false&&!mobility.refuge?.outsideBlocked(q.x,q.z)))return plannedSite=p;
  }
  return null;
 }
 function context(){const r=mobility.refuge,s=state(),p=mobility.astronaut.position,site=candidate(),asset=mobility.flyer.asset;
  // Operate from the outboard edge, outside the descending deck's exclusion zone.
  // The enlarged platform centre is over 6 m from that safe standing area.
  const platform=asset.platforms?.[2];
  const tray=mobility.powerTrayPoint?.()||(platform&&platform.group.localToWorld(new THREE.Vector3(platform.w/2+1.5,0,0)));
  return {mode:mobility.carrier.active?'carrier':mobility.flyer.active?'flight':mobility.remote?'remote':mobility.walking?'walk':'overview',player:p,outside:!r?.inside,inHome:!!r?.inside,site,ship:mobility.flyer.position,tray,solar:site&&{x:site.x,z:site.z-1.5},battery:site&&{x:site.x+6,z:site.z+4},bus:site&&{x:site.x+6,z:site.z+10},galley:r?.stationPoint('galley'),bed:r?.stationPoint('bunk'),lab:r?.stationPoint('lab'),slope:site?survey(site,floor).slope:Infinity,secondsToDawn:environment.secondsToDawn??environment.clock.seconds,night:environment.clock.night,now:Date.now(),eligible:['soil','power','comms'].every(id=>getJourney()?.survey?.includes(id)),analysisEligible:!!getJourney()?.relics?.done?.INSG,power:s.power};
 }
 function action(name){
  if(mobility.frozen||modal){notify('先关闭面板或恢复游戏，再操作设备。');return false;}
  const c=context(),requested=typeof name==='string'?name:name.type;
  if(requested==='inspect-solar'){if(c.mode==='walk'&&c.outside&&near(c.player,c.solar)){powerUI.open();render();return true;}return false;}
  const type=({release:'release-power-cargo',select:'survey-site',install:'install-power',solar:'connect-solar',bus:'connect-bus',commission:'commission-power',return:'return-home',meal:'eat-meal',analyze:'analyze-sample'})[requested]||requested;
  if(type==='release-power-cargo'&&!state().power.released&&!mobility.flyer.asset.portState(2).ready){
   if(!c.eligible||c.mode!=='walk'||!c.outside||!near(c.player,c.tray,8)){notify('完成勘测，步行靠近 NX07 的 3 号能源平台。');return false;}
   const port=mobility.flyer.asset.portState(2);
   if(!port.open)mobility.toggleCrewPort(2);
   if(!mobility.flyer.asset.portState(2).open)return false;
   pendingRelease=true;notify('3 号能源平台下降中；在外侧操作点等待，落地后按 F 释放。');return true;
  }
  if((type==='analyze-sample'||type==='read-result')&&!c.analysisEligible){notify('先完成洞察号拍摄并返回驻地，再到化验台分析。');return false;}
  const result=applyMainlineSurvivalAction(state(),typeof name==='string'?type:{...name,type},c);
  if(result.changed)save(result.state);
  if(result.changed&&type==='release-power-cargo')notify('能源托盘已释放；教学简化运输：托盘随舱外步行移动，到选址点确认后停放。');
  notify(result.reason|| (result.ok?'操作已完成。':'当前条件未满足。'));
  if(result.ok&&result.changed&&type==='eat-meal')mobility.refuge?.rest(mobility.astronaut);
  if(result.ok&&result.changed&&type==='sleep'){if(mobility.carrier.charging)mobility.carrier.toggleCharge();environment.advanceToDawn();environment.holdDaylight?.("afternoon");notify('已在铺位休息至清晨；夜间关键负载已从主电池扣除。');}
  render();return result.ok;
 }
 function actionStatus(name){
  const solarStatus=solarResearch.actionStatus(name);if(solarStatus)return solarStatus;
  const powerStatus=powerResearch.actionStatus(name);if(powerStatus)return powerStatus;
  const assayStatus=assay.actionStatus(name);if(assayStatus)return assayStatus;
  const researchStatus=research.actionStatus(name);if(researchStatus)return researchStatus;
  const waterStatus=water.actionStatus(name);if(waterStatus)return waterStatus;
  const nurseryStatus=nursery.actionStatus(name);if(nurseryStatus)return nurseryStatus;
  const type=({releasePower:'release-power-cargo',selectPower:'survey-site',installPower:'install-power',expandSolar:'expand-solar',connectSolar:'connect-solar',connectBus:'connect-bus',commissionPower:'commission-power',eatMeal:'eat-meal',sleepNight:'sleep'})[name];
  if(!type)return null;const c=context();
  if(type==='release-power-cargo'&&!state().power.released&&!mobility.flyer.asset.portState(2).ready){const ready=c.eligible&&c.mode==='walk'&&c.outside&&near(c.player,c.tray,8);return {ready,reason:ready?'':'步行到NX07三号能源平台8 m内。'};}
  const r=applyMainlineSurvivalAction(state(),type,c);return {ready:r.ok&&r.changed,reason:r.reason||(!r.changed?'本步骤已完成。':'')};
 }
 function target(){const s=state(),c=context();if(c.mode!=='walk')return null;
  if(!c.outside){if(!s.night.meal&&near(c.player,c.galley,2.6))return {type:'eat-meal',label:'领取一份口粮 · F'};
   if(!s.night.slept&&near(c.player,c.bed,2.6))return {type:'sleep',label:'在铺位睡到清晨 · F'};return null;}
  if(!c.eligible)return null;
  return !s.power.released?{type:'release-power-cargo',point:c.tray,label:'释放 3 号能源托盘 · F'}:!s.power.site?{type:'survey-site',point:c.site,label:'确认供能选址 · F'}:!s.power.installed?{type:'install-power',point:c.site,label:'安装阵列支架与主电池 · F'}:!s.power.solar.expanded?{type:'expand-solar',point:c.solar,label:'展开太阳能板 · F'}:!s.power.links.includes('solar')?{type:'connect-solar',point:c.battery,label:'连接光伏输入 · F'}:!s.power.links.includes('bus')?{type:'connect-bus',point:c.bus,label:'连接配电输出 · F'}:!s.power.online?{type:'commission-power',point:c.bus,label:'检查并投运电网 · F'}:near(c.player,c.solar)?{type:'inspect-solar',point:c.solar,label:'查看太阳能阵列 · F'}:null;
 }
 function sunlight(){return Math.max(0,Math.min(1,Math.sin(environment.elevation*Math.PI/180)/.65));}
 function render(){const s=state(),c=context(),t=target();powerUI.render({...c,power:s.power,target:t,targetReach:t?.type==='release-power-cargo'&&!mobility.flyer.asset.portState(2).ready?8:3,frozen:mobility.frozen||!!modal,jobWaiting:resumeJob,generation:solarOutput(s.power.solar,sunlight(),s.power.links.includes('solar')),roverKW:performance.now()-roverChargeAt<250?roverKW:0,water:state().water,waterKW:water.loadKW,solarResearch:s.solarResearch,solarResearchEligible:!!s.powerResearch.read,powerResearch:s.powerResearch,powerResearchEligible:!!s.assay.read,assayKW:assay.loadKW,assayStatus:assay.snapshot(),nurseryKW:nursery.loadKW,nurseryStatus:nursery.snapshot(),aresKW:mobility.carrier.charging?6:0});}
 function close(){modal?.remove();modal=null;mobility.setOverlay(false);}
 function openStation(id){if(id==='lab'&&state().research.read&&!state().assay.read)return assay.interact();if(id==='lab'&&state().nursery.inspected&&!state().research.read)return research.interact();if(id==='garden')return nursery.open();if(!['lab','galley','bunk'].includes(id))return false;
  if(id!=='lab'){action(id==='galley'?'eat-meal':'sleep');return true;}
  const c=context();if(!c.analysisEligible){notify('先完成洞察号拍摄并返回驻地，化验任务才开放。');return true;}
  if(!c.inHome||!near(c.player,c.lab,2.6)){notify('走近驻地化验台至 2.6 m 内。');return true;}
  close();modal=document.createElement('dialog');modal.style.cssText='max-width:min(460px,calc(100vw - 32px));box-sizing:border-box;background:#142329;color:#e0ece8;border:1px solid #536b65;border-radius:12px';modal.setAttribute('aria-label','实采样品化验');
  const title=document.createElement('h2');title.textContent='风化层化验 · 游戏模拟';modal.append(title);
  const s=state();for(const sample of s.samples){const row=document.createElement('p');row.textContent=`${sample.id} · (${Number(sample.x).toFixed(1)}, ${Number(sample.z).toFixed(1)}) · ${sample.type||sample.kind||'风化层'} · ${sample.archived?'已归档':'仍在探测车'}`;
   const submit=document.createElement('button');submit.textContent='提交此样品';submit.disabled=!sample.archived;submit.onclick=()=>{close();action({type:'analyze-sample',sampleId:sample.id});openStation('lab');};row.append(submit);modal.append(row);}
  if(s.analysis){const info=document.createElement('p');info.textContent=`结果 ${s.analysis.sampleId}：${s.analysis.waterHint||s.analysis.result||s.analysis.summary||'模拟水迹线索，仅支持继续勘探；不能证明可开采矿藏或直接获得净水。'}`;modal.append(info);const read=document.createElement('button');read.textContent=s.analysis.read?'结果已读':'阅读并确认结果';read.onclick=()=>{close();action('read-result');};modal.append(read);}
  if(state().research.read){const b=document.createElement('button');b.textContent='查看定量提取对照';b.onclick=()=>{close();assay.open();};modal.append(b);}
  if(state().research.read){const report=document.createElement('button');report.textContent='查看地质科研报告';report.onclick=()=>{close();research.open();};modal.append(report);}
  const disclaimer=document.createElement('p');disclaimer.textContent='分析采用教学模拟数据，不是火星实测。未采集或未归档的样品不能提交。';modal.append(disclaimer);const exit=document.createElement('button');exit.textContent='关闭';exit.onclick=close;modal.append(exit);modal.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(modal);mobility.setOverlay(true);modal.showModal();return true;
 }
 function update(dt){const s=state(),c=context();
  // Before commissioning, lights use the finite starter reserve in the teaching ledger.
  mobility.refuge?.setPower?.(s.power.energy>0);
  cargo.visible=c.eligible&&!s.power.installed;
  if(cargo.visible){if(!s.power.released){const platform=mobility.flyer.asset.platforms?.[2]?.group;if(platform&&cargo.parent!==platform){platform.add(cargo);cargo.position.set(0,.13,0);}}else{if(cargo.parent!==scene)scene.attach(cargo);
    if(s.power.site){cargo.position.set(s.power.site.x,floor(s.power.site.x,s.power.site.z),s.power.site.z);}
    else if(c.mode==='walk'&&c.outside&&!mobility.frozen){const h=mobility.astronaut.position.heading||0,x=c.player.x+Math.cos(h)*2.4,z=c.player.z-Math.sin(h)*2.4;cargo.position.set(x,floor(x,z),z);cargo.rotation.y=h;}
   }}
  environment.holdDaylight?.(s.night.slept?"afternoon":!s.power.online);const site=s.power.site||candidate();
  if(site){translated.position.set(site.x-base.x,0,site.z-base.z);world.rebuild({...s.power,plan:s.power.installed?base.id:null,site:s.power.site?base.id:null});}
  if(!mobility.frozen&&!modal&&Number.isFinite(dt)&&dt>0){const onsite=c.mode==='walk'&&c.outside&&near(c.player,c.solar);if(onsite)resumeJob=false;let next=tickMainlinePower(s,dt,sunlight(),{onsite,jobWaiting:resumeJob,recordIdle:recordIdle()});if(s.power.solar.job&&!next.power.solar.job)notify(onsite?(s.power.solar.job.type==='expand'?'太阳能板已展开；下一步连接光伏输入。':'无水除尘完成；请手动恢复光伏并网。'):'已离开作业点，作业取消；光伏保持隔离。');if(context().inHome&&s.power.online&&!s.night.returned)next=applyMainlineSurvivalAction(next,'return-home',context()).state;working=next;saveClock+=dt;if(JSON.stringify(next)!==JSON.stringify(s)&&(saveClock>=1||next.night.returned!==s.night.returned||!!next.power.solar.job!==!!s.power.solar.job)){save(next);saveClock=0;}}
  water.update(mobility.frozen||modal?0:dt);
  nursery.update(mobility.frozen||modal?0:dt);
  assay.update(mobility.frozen||modal?0:dt);
  if(pendingRelease&&mobility.flyer.asset.portState(2).ready){pendingRelease=false;notify('3 号能源平台已触地，靠近按 F 释放托盘。');}renderClock+=dt;if(renderClock>=.1||dt===0){renderClock=0;render();}
 }
 const driveGrid=createDriveGrid({read:state,write:s=>{working=s;},online:()=>state().power.online,frozen:()=>mobility.frozen});
 const shipGrid=createShipGrid({read:state,write:s=>{working=s;},frozen:()=>mobility.frozen});
 const grid={
  ...driveGrid,...shipGrid,
  get ship(){return shipGrid.ship;},
  get drive(){return driveGrid.drive;},
  get available(){return true;},
  get home(){const site=state().power.site;return site?{x:site.x+6,z:site.z+10}:null;},
  get energy(){return state().power.energy;},
  get online(){return state().power.online;},
  get campLoadKW(){return 2+water.loadKW+nursery.loadKW+assay.loadKW+(performance.now()-roverChargeAt<250?roverKW:0);},
  charge(percent,dt){
   const roverPercent=Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):0,s=state();
   if(!s.power.online||mobility.frozen||!Number.isFinite(dt)||dt<=0)return {roverPercent,kwh:0};
   const kwh=Math.max(0,Math.min((100-roverPercent)/100*5,36*dt/120,s.power.energy));
   roverKW=kwh*120/dt;roverChargeAt=performance.now();
   if(kwh>0){const next=normalizeMainlineSurvivalState(s);next.power.energy-=kwh;save(next);}
   return {roverPercent:Math.min(100,roverPercent+kwh/5*100),kwh};
  },flush
 };
 render();return {update,action,actionStatus,flush,grid,water,nursery,research,assay,powerResearch,solarResearch,blocked(x,z){return water.blocked(x,z)||world.blocked(x-translated.position.x,z-translated.position.z);},interact(){if(solarResearch.interact())return true;if(powerResearch.interact())return true;if(!state().assay.read&&assay.interact())return true;if(!state().research.read&&research.interact())return true;if(nursery.interact())return true;if(water.interact())return true;const t=target();if(!t||t.point&&!near(context().player,t.point,t.type==='release-power-cargo'&&!mobility.flyer.asset.portState(2).ready?8:3))return false;action(t.type);return true;},openStation,snapshot(){const c=context();return {...state(),waterTargets:water.snapshot().targets,waterStatus:water.snapshot(),targets:{garden:mobility.refuge?.stationPoint('garden'),site:c.site,solar:c.solar,battery:c.battery,bus:c.bus,tray:c.tray,galley:c.galley,bed:c.bed,lab:c.lab},target:target(),pendingDelivery:pendingRelease,nightNow:c.night,eligibleLab:c.analysisEligible};},onSample(sample){const record={...identify(sample),archived:false};save(ingestMainlineSample(state(),record));water.onSample(record);},onArchive(sample){save(ingestMainlineSample(state(),{...identify(sample),archived:true}));}};
}
