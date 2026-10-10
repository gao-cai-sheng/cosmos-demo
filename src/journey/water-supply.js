import {ARES_LOGISTICS,cargoFits} from './ares-logistics.js';
// Finite first-water teaching scenario. All quantities are author parameters, not measured Elysium deposits.
export const WATER = Object.freeze({ kitId:'WATER-01', massKg:220, cargoLimitKg:ARES_LOGISTICS.limitKg,
  packed:[1.76,1.1,3.1], bay:ARES_LOGISTICS.bay, dropSeconds:15,
  fieldKg:100, feedKg:50, waterFraction:.02, capture:.8, yield:.9,
  extractSeconds:120, extractKW:4, purifySeconds:12, purifyKW:1,
  reserveKWh:8, tankL:5, filters:2 });
const n=(v,d=0,max=Infinity)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):d;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z}:null;
const near=(a,b,r)=>!!point(a)&&!!point(b)&&Math.hypot(a.x-b.x,a.z-b.z)<=r;
export function freshWater(){return {cargo:'orbit',requestedAt:null,confirmedAt:null,drop:null,stop:null,home:null,dropElapsed:0,field:null,priorIds:[],sampleId:null,reviewed:false,
  installed:false,collected:false,feedAboard:false,feedKg:0,fieldKg:WATER.fieldKg,
  rawL:0,treatedL:0,cleanL:0,wasteL:0,residueKg:0,filters:0,usedFilters:0,kwh:0,
  extracted:false,purified:false,tested:false,stored:false,job:null};}
export function normalizeWater(raw){
 const s=freshWater(),r=raw||{};
 s.cargo=['orbit','falling','ground','aboard','home'].includes(r.cargo)?r.cargo:'orbit';
 s.requestedAt=Number.isFinite(r.requestedAt)?Math.max(0,r.requestedAt):null;s.confirmedAt=Number.isFinite(r.confirmedAt)?Math.max(0,r.confirmedAt):null;
 s.drop=point(r.drop);s.stop=point(r.stop);s.home=point(r.home);s.field=point(r.field);
 if(!s.drop||!s.stop)s.cargo='orbit';
 s.dropElapsed=n(r.dropElapsed,0,WATER.dropSeconds);
 s.priorIds=Array.isArray(r.priorIds)?r.priorIds.filter(x=>typeof x==='string').slice(0,64):[];
 s.sampleId=typeof r.sampleId==='string'?r.sampleId.slice(0,128):null;
 s.reviewed=!!s.field&&!!s.sampleId&&r.reviewed===true;
 s.installed=s.cargo==='home'&&r.installed===true;
 s.collected=s.reviewed&&r.collected===true;s.feedAboard=s.collected&&r.feedAboard===true;
 s.fieldKg=s.collected?WATER.fieldKg-WATER.feedKg:WATER.fieldKg;
 for(const k of ['feedKg','rawL','treatedL','cleanL','wasteL','residueKg','filters','usedFilters','kwh'])s[k]=n(r[k],0,{feedKg:50,rawL:5,treatedL:5,cleanL:5,wasteL:5,residueKg:50,filters:2,usedFilters:2}[k]);
 s.extracted=s.installed&&s.collected&&!s.feedAboard&&r.extracted===true;
 s.purified=s.extracted&&r.purified===true;s.tested=s.purified&&r.tested===true;s.stored=s.tested&&r.stored===true;
 if(s.installed&&s.collected&&!s.feedAboard&&['extract','purify'].includes(r.job?.type)){
  const type=r.job.type;
  if(!(type==='extract'&&s.extracted)&&!(type==='purify'&&(!s.extracted||s.purified)))s.job={type,elapsed:n(r.job.elapsed,0,type==='extract'?WATER.extractSeconds:WATER.purifySeconds)};
 }
 // Prerequisite normalization never fabricates input stock or finished water.
 if(!s.collected){s.feedKg=0;s.feedAboard=false;}
 if(!s.installed){s.filters=0;s.job=null;}
 if(!s.extracted){s.rawL=s.treatedL=s.cleanL=s.wasteL=0;s.purified=s.tested=s.stored=false;}
 if(!s.purified){s.treatedL=s.cleanL=s.wasteL=0;s.tested=s.stored=false;}
 if(!s.stored)s.cleanL=0;
 return s;
}
export function waterPayload(s){return s.cargo==='aboard'||s.feedAboard;}
export function waterSample(s,samples){return samples.find(r=>r.id===s.sampleId&&r.source==='MU-7'&&near(r,s.field,6)&&!s.priorIds.includes(r.id));}
export function observeWaterSample(raw,sample){const s=normalizeWater(raw);
 if(s.cargo!=='orbit'&&s.field&&!s.sampleId&&sample?.source==='MU-7'&&near(sample,s.field,6)&&!s.priorIds.includes(sample.id))s.sampleId=sample.id;
 return s;
}
export function applyWaterAction(raw,type,c={}){
 const s=normalizeWater(raw),result=(ok,reason='',changed=false)=>({state:s,ok,reason,changed});
 const fail=x=>result(false,x);
 if(!c.eligible)return fail('先完成第七章返营与艾琳简报。');
 if(c.frozen)return fail('先关闭面板或恢复游戏。');
 const foot=c.mode==='walk',outside=foot&&!c.inHome,car=c.mode==='carrier'&&c.carrierReady;
 const parked=c.carrierReady&&Math.abs(c.speed)<.4;
 const lab=foot&&c.inHome&&near(c.player,c.lab,2.6);
 const home=parked&&near(c.carrier,c.home,12);
 if(type==='request'){
  if(s.cargo!=='orbit')return result(true);
  if(!outside||!c.powerOnline)return fail('投运电网后，在家门外申请有限水务补给。');
  if(!point(c.drop)||!point(c.stop)||!point(c.field)||!c.routeOK)return fail('尚未找到安全落点和陆路，请重新检查投送区。');
  s.drop=point(c.drop);s.stop=point(c.stop);s.home=point(c.home);s.field=point(c.field);s.priorIds=(c.samples||[]).map(r=>r.id);s.cargo='falling';s.requestedAt=Number.isFinite(c.now)?c.now:Date.now();s.confirmedAt=null;
 }else if(type==='load'){
  if(s.cargo==='aboard'||s.cargo==='home')return result(true);
  if(s.cargo!=='ground'||!car||!parked||!near(c.carrier,s.stop,10))return fail('开ARES到接货停车点，停稳后装货。');
  if(c.roverLoaded)return fail('货位里有MU-7。先安全卸下小车，再装水务设备。');
  const fit=cargoFits({massKg:WATER.massKg,size:WATER.packed});if(!fit.ok)return fail(fit.reason);
  s.cargo='aboard';
 }else if(type==='unload'){
  if(s.cargo==='home')return result(true);
  if(s.cargo!=='aboard'||!car||!home)return fail('载货ARES需停在营地卸货区12米内。');
  s.cargo='home';
 }else if(type==='review'){
  if(s.reviewed)return result(true);
  if(!lab)return fail('步行到舱内化验台，复核新取样品。');
  const sample=waterSample(s,c.samples||[]);
  if(!sample?.archived)return fail('在标记勘探点新钻取样品，并交回ARES归档。');
  s.reviewed=true;
 }else if(type==='collect'){
  if(s.collected)return result(true);
  if(!s.reviewed||s.cargo!=='home')return fail('先完成补给入库和水源工程复核。');
  if(!car||!parked||!near(c.carrier,s.field,12))return fail('驾驶ARES到取料点12米内并停稳。');
  if(c.roverLoaded||waterPayload(s))return fail('先腾空货位，再装50千克试验原料。');
  const fit=cargoFits({massKg:WATER.feedKg,size:WATER.packed});if(!fit.ok)return fail(fit.reason);
  if(s.fieldKg<WATER.feedKg)return fail('本试验区剩余原料不足。');
  s.collected=true;s.feedAboard=true;s.feedKg=WATER.feedKg;s.fieldKg-=WATER.feedKg;
 }else if(type==='deliver-feed'){
  if(s.collected&&!s.feedAboard)return result(true);
  if(!s.feedAboard||!car||!home)return fail('把原料运回营地卸货区，停稳后卸料。');
  s.feedAboard=false;
 }else if(type==='install'){
  if(s.installed)return result(true);
  if(s.cargo!=='home'||!lab||!c.powerOnline)return fail('设备到货后，在舱内化验工位接入提取和净化模块。');
  s.installed=true;s.filters=WATER.filters;
 }else if(type==='extract'){
  if(s.extracted||s.job?.type==='extract')return result(true);
  if(!s.installed||!lab||!s.reviewed||s.feedAboard||s.feedKg<WATER.feedKg||s.job)return fail('先安装设备、复核样品，并把50千克原料送入驻地。');
  if(!c.powerOnline||c.energy<WATER.reserveKWh+WATER.extractKW*WATER.extractSeconds/120)return fail('先充电：启动提取至少需12 kWh，作业保留8 kWh生活储备。');
  if(s.rawL+WATER.feedKg*WATER.waterFraction*WATER.capture>WATER.tankL)return fail('原水罐已满。');
  s.job={type:'extract',elapsed:0};
 }else if(type==='purify'){
  if(s.purified||s.job?.type==='purify')return result(true);
  if(!lab||!s.extracted||s.rawL<=0||s.job||!s.installed)return fail('提取完成后，到化验工位启动净化。');
  if(s.filters<1)return fail('没有剩余滤材，不能净化。');
  if(!c.powerOnline||c.energy<WATER.reserveKWh+.1)return fail('先充电，为净化和生活保障留电。');
  s.filters--;s.usedFilters++;s.job={type:'purify',elapsed:0};
 }else if(type==='test'){
  if(s.tested)return result(true);
  if(!lab||!s.purified||s.treatedL<=0)return fail('先完成净化，再在化验台检测本批水。');
  s.tested=true;
 }else if(type==='store'){
  if(s.stored)return result(true);
  if(!lab||!s.tested||s.treatedL<=0||s.cleanL+s.treatedL>WATER.tankL)return fail('本批处理水通过模拟检测后才能进入净水罐。');
  s.cleanL+=s.treatedL;s.treatedL=0;s.stored=true;
 }else return fail('未知水务操作。');
 return result(true,'',true);
}
/** Single clock: dt seconds at 120 s/sim-hour. Critical grid loads settle before this function.
 * Jobs pause on low power; incomplete batches never produce usable output; paid progress survives refresh. */
export function tickWater(raw,dt,{frozen=false,energy=0,powerOnline=false,dropClear=true,now=Date.now()}={}){
 const s=normalizeWater(raw);let spent=0,reason='';
 if(frozen||!Number.isFinite(dt)||dt<=0)return {state:s,spent,reason};
 if(s.cargo==='falling'){
  if(dropClear){s.dropElapsed=Math.min(WATER.dropSeconds,s.dropElapsed+dt);if(s.dropElapsed>=WATER.dropSeconds){s.cargo='ground';s.confirmedAt=now;}}
  else reason='投送区被占用，请离开货物落点。';
 }
 if(s.job){
  const job=s.job,type=job.type,duration=type==='extract'?WATER.extractSeconds:WATER.purifySeconds,kw=type==='extract'?WATER.extractKW:WATER.purifyKW;
  const step=powerOnline?Math.max(0,Math.min(dt,duration-job.elapsed,(energy-WATER.reserveKWh)*120/kw)):0;
  job.elapsed+=step;spent=kw*step/120;s.kwh+=spent;
  if(step<=0)reason='水务作业暂停：先恢复供电并充到生活储备以上。';
  if(job.elapsed>=duration-1e-8){
   if(type==='extract'){const rawL=WATER.feedKg*WATER.waterFraction*WATER.capture;s.feedKg-=WATER.feedKg;s.rawL+=rawL;s.residueKg+=WATER.feedKg-rawL;s.extracted=true;}
   else{const input=s.rawL;s.treatedL+=input*WATER.yield;s.wasteL+=input*(1-WATER.yield);s.rawL=0;s.purified=true;}
   s.job=null;
  }
 }
 return {state:s,spent,reason};
}
