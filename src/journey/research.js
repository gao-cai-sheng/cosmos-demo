// First geology research slice: real sample provenance, not an invented water assay.
export const RESEARCH_DISTANCE = 20;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z}:null;
const distance=(a,b)=>point(a)&&point(b)?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
export function freshResearch(){return {baselineId:null,target:null,read:false};}
export function researchEvidence(s){
 const r=s.research||freshResearch(),samples=s.samples||[];
 const baseline=s.water?.reviewed&&r.baselineId===s.water.sampleId?samples.find(x=>x.id===r.baselineId&&x.source==='MU-7'&&x.archived):null;
 const sample=baseline&&point(r.target)?samples.find(x=>x.id!==baseline.id&&x.source==='MU-7'&&distance(x,r.target)<=6&&distance(x,baseline)>=RESEARCH_DISTANCE):null;
 return {baseline:baseline||null,sample:sample||null,analyzed:!!sample?.archived&&sample.status==='analyzed'};
}
export function normalizeResearch(raw,s){
 const r={baselineId:typeof raw?.baselineId==='string'?raw.baselineId.slice(0,128):null,target:point(raw?.target),read:false};
 const e=researchEvidence({...s,research:r});
 if(!e.baseline||!r.target||distance(e.baseline,r.target)<RESEARCH_DISTANCE)return freshResearch();
 r.read=raw?.read===true&&e.analyzed;return r;
}
export function researchAction(s,type,c={}){
 const research=normalizeResearch(s.research,s),next={...s,research};
 const result=(ok,reason='',changed=false)=>({state:next,ok,reason,changed});
 const fail=reason=>result(false,reason);
 if(!c.eligible)return fail('先完成首批本地水与幼苗任务。');
 if(c.frozen)return fail('先关闭面板或恢复游戏。');
 if(c.mode!=='walk'||!c.inHome||distance(c.player,c.lab)>2.6)return fail('结束驾驶或遥控，步行到舱内化验台2.6 m内。');
 if(type==='beginResearch'){
  if(research.baselineId)return result(true);
  const baseline=s.water?.reviewed&&(s.samples||[]).find(x=>x.id===s.water.sampleId&&x.source==='MU-7'&&x.archived);
  if(!baseline)return fail('缺少已归档并复核的水务基线样品。');
  if(!point(c.target)||distance(baseline,c.target)<RESEARCH_DISTANCE)return fail('尚未找到相隔20 m的可采样位置；请稍后重试。');
  research.baselineId=baseline.id;research.target=point(c.target);
 }else if(type==='analyzeResearch'){
  const e=researchEvidence(next);
  if(!e.sample?.archived)return fail('去科研光圈取另一份样品，并交回ARES归档。');
  if(e.analyzed)return result(true);
  next.samples=s.samples.map(x=>x.id===e.sample.id?{...x,status:'analyzed'}:x);
 }else if(type==='readResearch'){
  if(!researchEvidence(next).analyzed)return fail('先提交并分析第二个位置的归档样品。');
  if(research.read)return result(true);research.read=true;
 }else return fail('未知科研操作。');
 return result(true,'',true);
}
export function researchReport(s){
 const e=researchEvidence(s);
 return {ready:e.analyzed,baseline:e.baseline,sample:e.sample,distance:e.baseline&&e.sample?distance(e.baseline,e.sample):null,
  conclusion:'证据不足：两个位置的样品来源已复核，但尚无逐样含水量、取样质量和深度测量，不能判断水源连续性或持续开采能力。',
  next:'下一阶段需增加定量测量、重复取样和处理条件对照；本轮不增加水、矿藏或生产能力。'};
}
