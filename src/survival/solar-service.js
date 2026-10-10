// Teaching abstractions: no empirical dust deposition or certified hardware procedure.
export const SOLAR_SERVICE = Object.freeze({dustPerHour:.003, expandSeconds:6, cleanSeconds:8});
export function freshSolar(){return {expanded:false,isolated:true,dust:0,job:null};}
export function normalizeSolar(raw,{installed=false,connected=false}={}){
 const legacy=raw==null,s=freshSolar();
 s.expanded=installed&&(legacy?true:raw.expanded===true);
 s.isolated=legacy?!connected:raw.isolated!==false;
 s.dust=Number.isFinite(raw?.dust)?Math.max(0,Math.min(1,raw.dust)):0;
 const job=raw?.job,duration=job?.type==='expand'?SOLAR_SERVICE.expandSeconds:SOLAR_SERVICE.cleanSeconds;
 if(installed&&['expand','clean'].includes(job?.type)&&Number.isFinite(job.elapsed)&&job.elapsed>=0&&s.isolated&&(job.type==='expand'?!s.expanded:s.expanded))s.job={type:job.type,elapsed:Math.min(duration,job.elapsed)};
 return s;
}
export function solarOutput(s,daylightFactor,connected=true){return s.expanded&&!s.isolated&&connected?4*Math.max(0,Math.min(1,Number.isFinite(daylightFactor)?daylightFactor:0))*(1-s.dust):0;}
export function solarEnergy(s,seconds,daylightFactor,connected=true){
 const h=seconds/120;
 if(!s.expanded||s.isolated||!connected||h<=0)return 0;
 const rate=s.job?0:SOLAR_SERVICE.dustPerHour,t=rate?Math.min(h,(1-s.dust)/rate):h;
 const meanDust=(t*(s.dust+(s.dust+rate*t))/2+(h-t))/h;
 return 4*Math.max(0,Math.min(1,Number.isFinite(daylightFactor)?daylightFactor:0))*(1-meanDust)*h;
}
export function solarServiceAction(p,type,{near=false}={}){
 const s=p.solar;
 if(!p.installed)return {ok:false,reason:'先在已确认选址安装设备。'};
 if(!near)return {ok:false,reason:'需要舱外步行，到阵列操作点 3 m 内。'};
 if(type==='cancel-solar-job'){if(!s.job)return {ok:true,changed:false};s.job=null;return {ok:true,changed:true,reason:'已取消作业；光伏保持隔离，未恢复发电。'};}
 if(s.job)return {ok:false,reason:'当前作业进行中；先完成或取消作业。'};
 if(type==='isolate-solar'){if(s.isolated)return {ok:true,changed:false};s.isolated=true;return {ok:true,changed:true,reason:'光伏已隔离，营地负载继续由主电池承担。'};}
 if(type==='reconnect-solar'){
  if(!s.expanded||!p.links.includes('solar'))return {ok:false,reason:'先展开阵列并接好光伏输入电缆。'};
  if(!s.isolated)return {ok:true,changed:false};s.isolated=false;return {ok:true,changed:true,reason:'光伏输入已恢复；实际发电仍取决于日照和积尘。'};
 }
 if(type==='expand-solar'){
  if(s.expanded)return {ok:true,changed:false};
  if(!s.isolated)return {ok:false,reason:'展开前需要隔离光伏输入。'};
  s.job={type:'expand',elapsed:0};return {ok:true,changed:true,reason:'展开作业已开始，保持在阵列操作点附近。'};
 }
 if(type==='clean-solar'){
  if(!s.expanded)return {ok:false,reason:'先展开太阳能板。'};
  if(!s.isolated)return {ok:false,reason:'先隔离光伏输入，再进行无水除尘。'};
  if(s.dust<=.001)return {ok:false,reason:'面板洁净，当前不需要除尘。'};
  s.job={type:'clean',elapsed:0};return {ok:true,changed:true,reason:'无水除尘已开始；无需消耗洁净水，完成后恢复光伏输入。'};
 }
 return {ok:false,reason:'未知阵列操作。'};
}
export function tickSolar(s,seconds,{onsite=true,waiting=false}={}){
 const next={...s,job:s.job&&{...s.job}};
 if(!Number.isFinite(seconds)||seconds<=0||waiting)return next;
 if(next.expanded&&!next.job)next.dust=Math.min(1,next.dust+SOLAR_SERVICE.dustPerHour*seconds/120);
 if(next.job){
  if(!onsite){next.job=null;return next;}
  next.job.elapsed+=seconds;
  const duration=next.job.type==='expand'?SOLAR_SERVICE.expandSeconds:SOLAR_SERVICE.cleanSeconds;
  if(next.job.elapsed>=duration){if(next.job.type==='expand')next.expanded=true;else next.dust=0;next.job=null;}
 }
 return next;
}
