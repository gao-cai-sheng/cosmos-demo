import {researchAction,researchEvidence,researchReport,RESEARCH_DISTANCE} from './research.js';
export function mountResearch({mobility,getJourney,state,save,notify}){
 let modal=null;
 function candidate(){
  const s=state();if(s.research.target)return s.research.target;
  const base=s.samples.find(x=>x.id===s.water.sampleId&&x.archived);if(!base)return null;
  const clear=p=>!mobility.refuge?.outsideBlocked(p.x,p.z)&&!mobility.flyer.asset.contains(p.x,p.z,6,7)&&mobility.carrier.canTraverse(p.x,p.z);
  const old=s.samples.find(x=>x.id!==base.id&&Math.hypot(x.x-base.x,x.z-base.z)>=RESEARCH_DISTANCE&&Math.hypot(x.x-base.x,x.z-base.z)<=80&&clear(x));
  if(old)return {x:old.x,z:old.z};
  for(const d of [24,36,48,60])for(let i=0;i<8;i++){const a=i*Math.PI/4,p={x:base.x+Math.cos(a)*d,z:base.z+Math.sin(a)*d};if(clear(p))return p;}
  return null;
 }
 function context(){return {eligible:!!getJourney()?.cards?.done?.['A-end'],frozen:mobility.frozen,mode:mobility.walking?'walk':'other',inHome:!!mobility.refuge?.inside,player:mobility.astronaut.position,lab:mobility.refuge?.stationPoint('lab'),target:candidate()};}
 function action(type){if(type==='inspectResearch')return open();const r=researchAction(state(),type,context());if(r.changed)save(r.state);notify(r.reason||(r.changed?'科研记录已保存。':'本步骤已完成，不重复分析。'));return r.ok;}
 function close(){if(!modal)return;modal.remove();modal=null;mobility.setOverlay(false);removeEventListener('keydown',key,true);}
 function key(e){if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}}
 function open(){
  const c=context(),report=researchReport(state());
  if(!c.eligible||c.frozen)return false;
  if(!report.ready){notify('先将第二个位置的样品归档并提交分析。');return false;}
  modal=document.createElement('dialog');modal.className='research-dialog';modal.setAttribute('aria-label','地质科研报告');
  modal.innerHTML='<header><small>GEOLOGY / RESEARCH 01</small><h2>水源证据复核</h2></header><p>负责人：首位登陆宇航员 · 地质专家</p><p>问题：第一次出水，能否代表周边可持续供水？</p><section class="research-samples"></section><p class="research-distance"></p><h3>本阶段结论：不确定</h3><p class="research-conclusion"></p><p class="research-next"></p><details><summary>本批水务先导数据与模拟边界</summary><p class="research-water"></p><p>位置和样品来自实际游戏采样。分析只复核来源和类型，没有新增定量含水仪器、深度或质量测量；钻探仍按既有探测车电量结算。报告打开期间游戏冻结，无离线科研、无资源奖励。</p></details><p class="research-reason" role="status"></p><footer><button data-research-confirm>阅读并确认</button><button data-research-close>关闭 · Esc</button></footer>';
  const add=(text)=>{const p=document.createElement('p');p.textContent=text;modal.querySelector('.research-samples').append(p);};
  for(const [label,sample] of [['水务基线',report.baseline],['另一位置',report.sample]])add(`${label}：${sample.id} · (${sample.x.toFixed(1)}, ${sample.z.toFixed(1)}) · ${sample.type} · 已归档`);
  modal.querySelector('.research-distance').textContent=`两份样品位置相隔 ${report.distance.toFixed(1)} m；本阶段只验证空间来源，不据此证明矿藏连续。`;
  modal.querySelector('.research-conclusion').textContent=report.conclusion;modal.querySelector('.research-next').textContent=report.next;
  const w=state().water;modal.querySelector('.research-water').textContent=`既有50 kg批次：水务累计用电 ${w.kwh.toFixed(2)} kWh，废液 ${w.wasteL.toFixed(2)} L；0.72 L为原教学批次产出，不是第二份样品的实测含水量，净水余量可能已用于育苗。`;
  const preview=researchAction(state(),'readResearch',{...c,frozen:false}),button=modal.querySelector('[data-research-confirm]');
  button.disabled=!preview.ok;button.textContent=state().research.read?'已确认 · 返回游戏':'阅读并确认';modal.querySelector('.research-reason').textContent=preview.reason||'关闭报告后继续游戏；确认需要在化验台2.6 m内。';
  button.onclick=()=>{close();action('readResearch');};modal.querySelector('[data-research-close]').onclick=close;
  modal.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(modal);mobility.setOverlay(true);modal.showModal();addEventListener('keydown',key,true);return true;
 }
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./research.css',import.meta.url).href;document.head.append(css);
 return {action,open,interact(){const c=context();if(!c.eligible||c.frozen||c.mode!=='walk'||!c.inHome||!c.lab||Math.hypot(c.player.x-c.lab.x,c.player.z-c.lab.z)>2.6)return false;
  const e=researchEvidence(state());action(!e.baseline?'beginResearch':!e.analyzed?'analyzeResearch':'inspectResearch');return true;},actionStatus(name){if(!['beginResearch','analyzeResearch','inspectResearch'].includes(name))return null;const c=context();if(name==='inspectResearch')return {ready:c.eligible&&!c.frozen&&researchReport(state()).ready,reason:researchReport(state()).ready?'':'先归档并提交另一位置的科研样品。'};const r=researchAction(state(),name,c);return {ready:r.ok&&r.changed,reason:r.reason||(!r.changed?'本步骤已完成。':'')};}};
}
