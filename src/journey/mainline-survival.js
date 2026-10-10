import {freshSolarResearch,normalizeSolarResearch,noteSolarCleaning} from './solar-research.js';
import {freshPowerResearch,normalizePowerResearch,recordPower} from './power-research.js';
import {freshAssay,normalizeAssay} from './assay.js';
import {freshResearch,normalizeResearch} from './research.js';
import {normalizeShip,tickShip} from './expedition-energy.js';
import {normalizeDrive} from './ares-logistics.js';
import {freshNursery,normalizeNursery} from './nursery.js';
import {freshWater,normalizeWater,waterSample} from './water-supply.js';
import {freshSolar,normalizeSolar,solarEnergy,solarServiceAction,tickSolar} from '../survival/solar-service.js';
// Teaching budgets, not empirical Mars engineering data. Time is simulated hours.
export const MAINLINE_POWER = Object.freeze({ solarKW:4, capacityKWh:60, loadKW:2, secondsPerHour:120 });
const finite = (v,d=0) => Number.isFinite(v) ? v : d;
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) ? {x:p.x,z:p.z} : null;
const nearby = (a,b,r=3) => !!point(a) && !!point(b) && Math.hypot(a.x-b.x,a.z-b.z)<=r;
function sampleRecord(s) {
 if(!s || typeof s.id!=='string' || !s.id || !point(s) || s.source!=='MU-7' || typeof s.type!=='string' || !s.type) return null;
 return {massKg:Number.isFinite(s.massKg)&&s.massKg>0&&s.massKg<=.5?s.massKg:null,id:s.id.slice(0,128),x:s.x,z:s.z,type:s.type.slice(0,80),source:'MU-7',archived:s.archived===true,status:s.status==='analyzed'?'analyzed':'pending'};
}
export function createMainlineSurvivalState() {
 return {solarResearch:freshSolarResearch(),powerResearch:freshPowerResearch(),ship:normalizeShip(),ares:normalizeDrive(),power:{released:false,site:null,installed:false,links:[],online:false,energy:48,hours:0,solar:freshSolar()},night:{returned:false,meal:false,slept:false,at:null},samples:[],analysis:null,research:freshResearch(),assay:freshAssay(),water:freshWater(),nursery:freshNursery()};
}
export function normalizeMainlineSurvivalState(raw) {
 const s=createMainlineSurvivalState(), p=raw?.power||{}, n=raw?.night||{};
 s.power.released=p.released===true;
 s.power.site=s.power.released?point(p.site):null;
 s.power.installed=!!s.power.site&&p.installed===true;
 s.power.links=s.power.installed?['solar','bus'].filter(x=>Array.isArray(p.links)&&p.links.includes(x)):[];
 s.power.solar=normalizeSolar(p.solar,{installed:s.power.installed,connected:s.power.links.includes('solar')});
 s.power.online=s.power.links.length===2&&s.power.solar.expanded&&p.online===true;
 s.power.energy=clamp(finite(p.energy,48),0,60); s.power.hours=Math.max(0,finite(p.hours));
 s.night.returned=s.power.online&&n.returned===true;
 s.night.meal=s.night.returned&&n.meal===true; s.night.slept=s.night.meal&&n.slept===true;
 s.night.at=s.night.slept?Math.max(0,finite(n.at)):null;
 const ids=new Set();
 for(const value of Array.isArray(raw?.samples)?raw.samples:[]) {const r=sampleRecord(value); if(r&&!ids.has(r.id)&&s.samples.length<64){ids.add(r.id);s.samples.push(r);}}
 const a=raw?.analysis, record=s.samples.find(r=>r.id===a?.sampleId&&r.archived&&r.status==='analyzed');
 if(record) s.analysis=analysisFor(record,a.read===true);
 s.ares=normalizeDrive(raw?.ares);
 s.ship=normalizeShip(raw?.ship);
 s.water=normalizeWater(raw?.water);
 s.nursery=normalizeNursery(raw?.nursery);
 const proof=waterSample(s.water,s.samples);
 if(!proof||s.water.reviewed&&!proof.archived)s.water=normalizeWater({...s.water,sampleId:proof?.id||null,reviewed:false});
 s.research=normalizeResearch(raw?.research,s);
 s.assay=normalizeAssay(raw?.assay,s);
 s.powerResearch=normalizePowerResearch(raw?.powerResearch);
 s.solarResearch=normalizeSolarResearch(raw?.solarResearch);
 return s;
}
function analysisFor(record,read=false) {
 return {sampleId:record.id,x:record.x,z:record.z,type:record.type,source:'游戏模拟',waterHint:'模拟水迹信号：仅支持继续勘探，不能证明可采矿藏或直接饮用。',read};
}
export function tickMainlinePower(raw,dtSeconds,daylightFactor,{frozen=false,onsite=true,jobWaiting=false,recordIdle=true}={}) {
 const s=normalizeMainlineSurvivalState(raw);
 if(frozen||!Number.isFinite(dtSeconds)||dtSeconds<=0) return s;
 s.powerResearch=recordPower(s,dtSeconds,daylightFactor,{idle:recordIdle});
 const hours=dtSeconds/120, sunlight=clamp(finite(daylightFactor),0,1);
 if(s.power.installed){const generated=solarEnergy(s.power.solar,dtSeconds,sunlight,s.power.links.includes('solar'));
 s.power.energy=clamp(s.power.energy+generated-(s.power.online?2:0)*hours,0,60);s.power.hours+=hours;
 const previousSolar=s.power.solar;
 s.power.solar=tickSolar(previousSolar,dtSeconds,{onsite,waiting:jobWaiting});
 s.solarResearch=noteSolarCleaning(s.solarResearch,previousSolar,s.power.solar,{onsite,waiting:jobWaiting});}return s;
}
export function ingestMainlineSample(raw,value) {
 const s=normalizeMainlineSurvivalState(raw), r=sampleRecord(value);
 const existing=r&&s.samples.find(x=>x.id===r.id);
 if(existing && existing.x===r.x && existing.z===r.z && existing.type===r.type && r.archived) existing.archived=true;
 else if(r&&!existing&&s.samples.length<64) s.samples.push({...r,status:'pending'});
 return s;
}
export function applyMainlineSurvivalAction(raw,action,context={}) {
 const aliases={'release-power-cargo':'release','survey-site':'select','install-power':'install','connect-solar':'solar','connect-bus':'bus','commission-power':'commission','return-home':'return','eat-meal':'meal','analyze-sample':'analyze'};
 const requested=typeof action==='string'?action:action?.type;
 const s=normalizeMainlineSurvivalState(raw), type=aliases[requested]||requested, p=s.power,n=s.night;
 const result=(ok,reason='',changed=false)=>({state:s,ok,reason,changed});
 const fail=reason=>result(false,reason);
 if(context.eligible===false) return fail('当前任务尚未满足前置条件');
 if(context.mode!=='walk') return fail('需要结束遥控或驾驶并步行操作');
 const home=()=>context.inHome===true&&context.outside!==true;
 const field=target=>context.outside===true&&nearby(context.player,target);
 if(['expand-solar','clean-solar','isolate-solar','reconnect-solar','cancel-solar-job'].includes(type)){
  const r=solarServiceAction(p,type,{near:field(context.solar)});return result(r.ok,r.reason||'',!!r.changed);
 }
 if(type==='release') {
  if(p.released)return result(true,'',false);
  if(!field(context.tray||context.ship))return fail('请到3号侧舱能源托盘旁');
  p.released=true;
 } else if(type==='select') {
  if(p.installed)return result(true,'',false);
  if(!p.released)return fail('先释放随船能源托盘');
  if(!field(context.site)||!Number.isFinite(context.slope)||context.slope>16||context.slope<0)return fail('请在坡度不超过16°的选址点现场确认');
  if(p.site&&nearby(p.site,context.site,0))return result(true,'',false);
  p.site=point(context.site);
 } else if(type==='install') {
  if(p.installed)return result(true,'',false);
  if(!p.released||!p.site||!field(p.site))return fail('需在已确认选址旁安装释放的设备');
  p.installed=true;
 } else if(type==='solar'||type==='bus') {
  if(p.links.includes(type))return result(true,'',false);
  if(type==='solar'&&(!p.solar.expanded||p.solar.job))return fail('先在阵列操作点完成太阳能板展开。');
  if(!p.installed||!field(type==='solar'?context.battery:context.bus))return fail('请走近已安装设备的对应端口');
  if(type==='solar')p.solar.isolated=false;
  p.links.push(type);p.links=['solar','bus'].filter(x=>p.links.includes(x));
 } else if(type==='commission') {
  if(p.online)return result(true,'',false);
  if(p.links.length!==2||!p.solar.expanded||p.solar.isolated||p.solar.job||!field(context.bus))return fail('两段电缆连接后在配电箱验收');
  p.online=true;
 } else if(type==='return') {
  if(!p.online||!home()||context.night!==true)return fail('通电后在夜间返回生活舱');
  if(n.returned)return result(true,'',false);n.returned=true;
 } else if(type==='meal'||type==='eat') {
  if(n.meal)return result(true,'',false);
  if(!n.returned||!home()||!nearby(context.player,context.galley))return fail('返回生活舱后到餐桌用餐');
  n.meal=true;
 } else if(type==='sleep') {
  if(n.slept)return result(true,'',false);
  if(!n.meal||!home()||!nearby(context.player,context.bed))return fail('用餐后到舱内床位休息');
  const seconds=context.secondsToDawn;
  if(!Number.isFinite(seconds)||seconds<=0||context.night!==true)return fail('请等待夜晚再休息');
  const hours=seconds/120,cost=hours*2;
  if(p.energy<cost)return fail('电量不足以支撑至清晨；等待白昼充电后重试');
  p.energy-=cost;p.hours+=hours;s.ship=tickShip(s.ship,seconds);n.slept=true;n.at=Math.max(0,finite(context.now,p.hours));
 } else if(type==='analyze') {
  if(!home()||!nearby(context.player,context.lab))return fail('请到生活舱化验台提交样品');
  const record=s.samples.find(r=>r.id===action?.sampleId)||(action?.sampleId?null:s.samples.find(r=>r.status==='pending'));
  if(!record||!record.archived)return fail('需要先用MU-7实际钻探并归档样品');
  if(record.status==='analyzed')return result(true,'',false);
  record.status='analyzed';s.analysis=analysisFor(record);
 } else if(type==='read-result') {
  if(!home()||!nearby(context.player,context.lab)||!s.analysis)return fail('化验完成后在化验台读取结果');
  if(s.analysis.read)return result(true,'',false);s.analysis.read=true;
 } else return fail('未知操作');
 return result(true,'',true);
}
