// Author teaching experiment. Captured water is not total geological water or potable stock.
export const ASSAY=Object.freeze({sampleKg:.5,portionKg:.25,seconds:60,kw:.5,reserve:8,capture:.8,cups:3});
export const freshAssay=()=>({installed:false,runs:[],job:null,read:false});
const stages=['blank','baseline','comparison'];
const near=(a,b)=>a&&b&&Math.hypot(a.x-b.x,a.z-b.z)<=6;
export function assaySamples(s){
 const e=s.research||{},records=s.samples||[],base=records.find(x=>x.id===e.baselineId);
 return [base,e.target].map((p,i)=>{
  const stage=stages[i+1],record=s.assay?.runs?.find(r=>r.stage===stage)||(s.assay?.job?.stage===stage?s.assay.job:null);
  return records.find(x=>(!record||x.id===record.sampleId)&&near(x,p)&&x.source==='MU-7'&&x.archived&&Number.isFinite(x.massKg)&&x.massKg>=ASSAY.portionKg);
 });
}
function output(sample){if(!sample)return 0;const fraction=.012+(Math.abs(Math.sin(sample.x*.071+sample.z*.113))*.012);return ASSAY.portionKg*fraction*ASSAY.capture;}
export function normalizeAssay(raw,s){
 const a=freshAssay();a.installed=!!s.water?.installed&&!!s.research?.read&&raw?.installed===true;
 if(!a.installed)return a;
 const samples=assaySamples(s);
 for(let i=0;i<3;i++){const r=raw?.runs?.[i],sample=samples[i-1];if(!r||r.stage!==stages[i]||i>0&&(!sample||r.sampleId!==sample.id)||i===2&&samples[0]?.id===sample?.id||r.elapsed!==ASSAY.seconds||!Number.isFinite(r.kwh)||Math.abs(r.kwh-ASSAY.kw*ASSAY.seconds/120)>1e-8)break;
 a.runs.push({stage:stages[i],sampleId:sample?.id||null,elapsed:ASSAY.seconds,kwh:r.kwh,feedKg:i?ASSAY.portionKg:0,waterL:output(sample),ventedKg:i?output(sample)*(1/ASSAY.capture-1):0,residueKg:i?ASSAY.portionKg-output(sample)/ASSAY.capture:0});}
 const i=a.runs.length,j=raw?.job;if(i<3&&j?.stage===stages[i]&&(i===0||samples[i-1]?.id===j.sampleId)&&Number.isFinite(j.elapsed)&&j.elapsed>=0&&j.elapsed<ASSAY.seconds)a.job={stage:stages[i],sampleId:samples[i-1]?.id||null,elapsed:j.elapsed,kwh:ASSAY.kw*j.elapsed/120};
 a.read=a.runs.length===3&&raw?.read===true;return a;
}
export function assayAction(s,type,c={}){
 const a=normalizeAssay(s.assay,s),next={...s,assay:a},result=(ok,reason='',changed=false)=>({state:next,ok,reason,changed});
 if(!c.eligible||!s.research?.read)return result(false,'先完成来源复核报告。');
 if(c.frozen)return result(false,'先关闭面板或恢复游戏。');
 if(c.mode!=='walk'||!c.inHome||!nearLab(c))return result(false,'步行到舱内化验台2.6 m内。');
 if(type==='installAssay'){if(!s.water?.installed)return result(false,'需要已接妥的WATER-01提取装置。');if(a.installed)return result(true);a.installed=true;return result(true,'',true);}
 if(!a.installed)return result(false,'先核对化验台预装称量器、三只试验杯与水务装置。');
 if(type==='readAssay'){if(a.runs.length!==3)return result(false,'先完成空白与两份同条件实验。');if(a.read)return result(true);a.read=true;return result(true,'',true);}
 if(type!=='startAssay')return result(false,'未知定量科研操作。');
 if(a.job||a.runs.length===3)return result(true);
 const i=a.runs.length,samples=assaySamples(s),sample=samples[i-1];
 if(i&&(!sample||samples[0]?.id===samples[1]?.id))return result(false,'在两个科研位置重新取带质量记录的样品，并交回ARES归档。旧无质量样不参与。');
 if(!s.power?.online||s.power.energy<=ASSAY.reserve)return result(false,'电网投运且主电池高于8 kWh储备后再启动。');
 a.job={stage:stages[i],sampleId:sample?.id||null,elapsed:0,kwh:0};return result(true,'',true);
}
const nearLab=c=>c.player&&c.lab&&Math.hypot(c.player.x-c.lab.x,c.player.z-c.lab.z)<=2.6;
export function tickAssay(s,dt,{frozen=false}={}){
 const a=normalizeAssay(s.assay,s),next={...s,assay:a,power:{...s.power}};
 if(frozen||!a.job||!s.power?.online||!Number.isFinite(dt)||dt<=0)return next;
 const t=Math.max(0,Math.min(dt,ASSAY.seconds-a.job.elapsed,(s.power.energy-ASSAY.reserve)*120/ASSAY.kw));
 next.power.energy-=t*ASSAY.kw/120;a.job.elapsed+=t;a.job.kwh=ASSAY.kw*a.job.elapsed/120;
 if(a.job.elapsed>=ASSAY.seconds-1e-8){const sample=(s.samples||[]).find(x=>x.id===a.job.sampleId),i=a.runs.length;
 a.runs.push({stage:a.job.stage,sampleId:sample?.id||null,elapsed:ASSAY.seconds,kwh:ASSAY.kw*ASSAY.seconds/120,feedKg:i?ASSAY.portionKg:0,waterL:output(sample),ventedKg:i?output(sample)*(1/ASSAY.capture-1):0,residueKg:i?ASSAY.portionKg-output(sample)/ASSAY.capture:0});a.job=null;}
 return next;
}
export function assaySummary(s){const a=normalizeAssay(s.assay,s);return {...a,cupsLeft:3-a.runs.length-(a.job?1:0),kwh:a.runs.reduce((v,r)=>v+r.kwh,0)+(a.job?.kwh||0),waterL:a.runs.reduce((v,r)=>v+r.waterL,0),ventedKg:a.runs.reduce((v,r)=>v+r.ventedKg,0),residueKg:a.runs.reduce((v,r)=>v+r.residueKg,0)};}
