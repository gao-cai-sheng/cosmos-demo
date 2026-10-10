import {solarOutput} from '../survival/solar-service.js';
// Simulation telemetry, not independent irradiance or temperature measurements.
export const SOLAR_RESEARCH=Object.freeze({minLight:.05,cleanDust:.001});
export const freshSolarResearch=()=>({before:null,cleaned:false,after:null,deferred:false,read:false});
function measurement(raw){
 if(!raw||!['dust','light','kw','hours'].every(k=>Number.isFinite(raw[k]))||raw.dust<0||raw.dust>1||raw.light<SOLAR_RESEARCH.minLight||raw.light>1||raw.hours<0||Math.abs(raw.kw-4*raw.light*(1-raw.dust))>1e-8)return null;
 return {dust:raw.dust,light:raw.light,kw:raw.kw,hours:raw.hours};
}
export function normalizeSolarResearch(raw){
 const r=freshSolarResearch();r.before=measurement(raw?.before);if(!r.before)return r;
 r.deferred=r.before.dust<=SOLAR_RESEARCH.cleanDust&&raw?.deferred===true;
 r.cleaned=!r.deferred&&r.before.dust>SOLAR_RESEARCH.cleanDust&&raw?.cleaned===true;
 const after=measurement(raw?.after);if(r.cleaned&&after&&after.hours>=r.before.hours&&after.dust<r.before.dust)r.after=after;
 r.read=!!(r.deferred||r.after)&&raw?.read===true;return r;
}
export function noteSolarCleaning(raw,before,after,{onsite=true,waiting=false}={}){
 const r=normalizeSolarResearch(raw);
 if(r.before&&!r.deferred&&onsite&&!waiting&&before.job?.type==='clean'&&before.dust>SOLAR_RESEARCH.cleanDust&&!after.job&&after.dust===0)r.cleaned=true;
 return r;
}
export function solarResearchAction(s,type,c={}){
 const r=normalizeSolarResearch(s.solarResearch),next={...s,solarResearch:r},result=(ok,reason='',changed=false)=>({state:next,ok,reason,changed});
 if(!c.eligible||!s.powerResearch?.read)return result(false,'先完成短时供电报告与P段简报。');
 if(c.frozen||!c.near)return result(false,'舱外步行到阵列操作点3 m内。');
 if(type==='readSolarResearch'){if(!r.after&&!r.deferred)return result(false,'先完成并网后复测，或登记洁净面板暂不维护。');if(r.read)return result(true);r.read=true;return result(true,'',true);}
 if(type==='deferSolarMaintenance'){if(!s.power.online||s.power.solar.isolated||s.power.solar.job)return result(false,'先恢复并网并结束阵列作业，再登记暂不维护。');if(!r.before||r.before.dust>SOLAR_RESEARCH.cleanDust||s.power.solar.dust>SOLAR_RESEARCH.cleanDust)return result(false,'只有已测得洁净面板才可登记暂不维护。');if(r.deferred)return result(true);r.deferred=true;return result(true,'',true);}
 if(type==='refreshSolarBefore'){if(r.cleaned||r.after||r.deferred||r.read)return result(false,'已有维护或结论记录，不能覆盖前测。');next.solarResearch=freshSolarResearch();return solarResearchAction(next,'measureSolarBefore',c);}
 if(!['measureSolarBefore','measureSolarAfter'].includes(type))return result(false,'未知阵列科研操作。');
 if(type==='measureSolarBefore'&&r.before||type==='measureSolarAfter'&&r.after)return result(true);
 if(type==='measureSolarAfter'&&(!r.before||!r.cleaned||r.deferred))return result(false,'完成本次记录后的实际除尘，再恢复并网复测。');
 const p=s.power;if(!p.online||!p.solar.expanded||p.solar.isolated||p.solar.job||!p.links.includes('solar'))return result(false,'阵列须展开、并网且没有正在进行的作业。');
 if(!Number.isFinite(c.light)||c.light<SOLAR_RESEARCH.minLight||c.light>1)return result(false,'日照太弱，等待白昼再测；不修改太阳时间。');
 const m={dust:p.solar.dust,light:c.light,kw:solarOutput(p.solar,c.light,true),hours:p.hours};
 if(type==='measureSolarAfter'&&m.dust>=r.before.dust)return result(false,'当前积尘已不低于前测，未取得有效清洁对照。');
 r[type==='measureSolarBefore'?'before':'after']=m;return result(true,'',true);
}
export function solarResearchSummary(raw){const r=normalizeSolarResearch(raw);return {...r,gainKW:r.after?r.after.kw/r.after.light-r.before.kw/r.before.light:null};}
