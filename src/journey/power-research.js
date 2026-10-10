import {solarEnergy} from '../survival/solar-service.js';
export const POWER_RECORD_SECONDS=60;
export const freshPowerResearch=()=>({started:false,elapsed:0,generated:0,load:0,delta:0,spill:0,unserved:0,endEnergy:0,read:false});
export function normalizePowerResearch(raw){
 const r=freshPowerResearch();
 if(raw?.started!==true)return r;
 for(const k of ['elapsed','generated','load','spill','unserved','endEnergy'])if(!Number.isFinite(raw[k])||raw[k]<0)return r;
 if(raw.elapsed>60||raw.endEnergy>60||Math.abs(raw.load-raw.elapsed/60)>1e-8||raw.generated>raw.elapsed/30+1e-8||!Number.isFinite(raw.delta)||Math.abs(raw.generated-raw.load-raw.spill+raw.unserved-raw.delta)>1e-7)return r;
 for(const k of Object.keys(r))if(k in raw)r[k]=raw[k];r.read=r.elapsed===60&&raw.read===true;return r;
}
export function recordPower(s,dt,light,{idle=true}={}){
 const r=normalizePowerResearch(s.powerResearch),p=s.power;
 if(!r.started||r.elapsed>=60||!idle||!p.online||p.solar.job||!Number.isFinite(dt)||dt<=0)return r;
 const t=Math.min(dt,60-r.elapsed),g=solarEnergy(p.solar,t,light,p.links.includes('solar')),l=2*t/120,offered=p.energy+g-l,end=Math.max(0,Math.min(60,offered));
 r.elapsed=Math.min(60,r.elapsed+t);r.generated+=g;r.load+=l;r.delta+=end-p.energy;r.spill+=Math.max(0,offered-60);r.unserved+=Math.max(0,-offered);r.endEnergy=end;return r;
}
export function powerResearchAction(s,type,c={}){
 const r=normalizePowerResearch(s.powerResearch),next={...s,powerResearch:r},result=(ok,reason='',changed=false)=>({state:next,ok,reason,changed});
 if(!c.eligible)return result(false,'先完成H段对照报告与简报。');
 if(c.frozen||!c.near)return result(false,'舱外步行到配电箱3 m内操作。');
 if(type==='readPowerResearch'){if(r.elapsed<60)return result(false,'先完成60秒有效记录。');if(r.read)return result(true);r.read=true;return result(true,'',true);}
 if(type!=='startPowerResearch')return result(false,'未知记录操作。');
 if(r.started)return result(true);
 if(!s.power.online||!c.idle||s.power.solar.job)return result(false,'电网投运后，停止车辆充电并等其他实验完成。');
 r.started=true;r.endEnergy=s.power.energy;return result(true,'',true);
}
