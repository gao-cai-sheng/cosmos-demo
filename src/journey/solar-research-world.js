import {solarResearchAction,solarResearchSummary} from './solar-research.js';
import {applyMainlineSurvivalAction} from './mainline-survival.js';
const maintenance={isolateResearchSolar:'isolate-solar',cleanResearchSolar:'clean-solar',reconnectResearchSolar:'reconnect-solar',cancelResearchSolar:'cancel-solar-job'};
export function mountSolarResearch({mobility,getJourney,state,save,notify,light,onSolarAction}){
 let modal=null;
 const context=()=>{const s=state(),p=mobility.astronaut.position,b=s.power.site;return {eligible:!!getJourney()?.cards?.done?.['P-end'],frozen:mobility.frozen,light:light(),near:!!b&&mobility.walking&&!mobility.refuge?.inside&&Math.hypot(p.x-b.x,p.z-(b.z-1.5))<=3};};
 function check(type,c=context()){
  if(!maintenance[type])return solarResearchAction(state(),type,c);
  const s=state(),r=solarResearchSummary(s.solarResearch),fail=reason=>({ok:false,reason,changed:false});
  if(!c.eligible||!s.powerResearch.read||!r.before||r.before.dust<=.001||r.deferred)return fail('先完成前测，再选择需要的维护。');
  if(c.frozen||!c.near)return fail('舱外步行到阵列操作点3 m内。');
  if(type==='reconnectResearchSolar'&&!r.cleaned)return fail('完成除尘后恢复并网；取消作业可在营地电源详情恢复输入。');
  return applyMainlineSurvivalAction(s,maintenance[type],{mode:'walk',outside:true,player:mobility.astronaut.position,solar:{x:s.power.site.x,z:s.power.site.z-1.5}});
 }
 function close(){modal?.remove();modal=null;mobility.setOverlay(false);removeEventListener('keydown',key,true);}
 function key(e){if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}}
 function action(type){if(type==='inspectSolarResearch')return open();const r=check(type);if(!r.ok){notify(r.reason);return false;}if(maintenance[type])return onSolarAction(maintenance[type]);if(r.changed)save(r.state);notify(r.reason||(r.changed?'阵列科研记录已保存。':'本步骤已登记。'));return true;}
 function open(){const c=context();if(!c.eligible||c.frozen)return false;const s=state(),r=solarResearchSummary(s.solarResearch),p=s.power.solar;
 modal=document.createElement('dialog');modal.className='research-dialog solar-research-dialog';modal.setAttribute('aria-label','阿玛拉清洁对照');
 modal.innerHTML='<header><small>AMARA / POWER RESEARCH 02</small><h2>阵列清洁前后对照</h2></header><p>先测状态，再按需维护。原始功率和日照修正功率分别记录；洁净面板可以选择暂不维护。</p><section class="sr-data"></section><p class="sr-status"></p><h3>对照结果</h3><p class="sr-result"></p><details><summary>记录来源与结论边界</summary><p>读取既有模拟阵列遥测：日照系数、积尘损失和输出。修正功率=原始kW÷日照系数，相当于在系数1下比较当前面板；这不是独立实测辐照仪。日照低于0.05不采集。面板温度、角度独立测量、仪表误差和线路损耗未实现，不能推广为现实清洁效率或长期维护周期。</p><p>洁净阈值沿用现有除尘规则0.1%损失。只记录当前真实模拟状态，不加尘、不赠送功率、不跳太阳时间。除尘沿用隔离→现场8秒作业→手动并网；营地负载仍扣电，离开现场取消，地图/暂停/后台冻结。刷新保留记录和作业，回现场续作；报告也冻结世界。无水除尘不扣饮水，工具与人员体力尚未模拟。</p></details><p class="research-reason" role="status"></p><footer></footer>';
 const data=modal.querySelector('.sr-data');for(const [label,m] of [['前测',r.before],['后测',r.after]]){const row=document.createElement('p');row.textContent=m?`${label} · 日照 ${m.light.toFixed(3)} · 积尘损失 ${(m.dust*100).toFixed(3)}% · 原始 ${m.kw.toFixed(4)} kW · 修正 ${(m.kw/m.light).toFixed(4)} kW · ${m.hours.toFixed(3)}模拟小时`:`${label} · 尚未记录`;data.append(row);}
 modal.querySelector('.sr-status').textContent=p.job?`现场除尘 ${p.job.elapsed.toFixed(1)}/8秒，关闭面板继续`:`当前积尘 ${(p.dust*100).toFixed(3)}% · ${p.isolated?'光伏已隔离，负载继续扣电':'光伏并网'} · ${r.cleaned?'本次除尘完成':'未完成本次除尘'}`;
 modal.querySelector('.sr-result').textContent=r.deferred?'前测和决策时面板洁净，登记暂不维护。未进行清洁实验，不生成清洁收益。':r.after?`原始功率变化 ${(r.after.kw-r.before.kw).toFixed(4)} kW；日照修正变化 ${r.gainKW.toFixed(4)} kW（额定4 kW的 ${(r.gainKW/4*100).toFixed(3)} 个百分点）。只归因现有模拟中的积尘项，温度等因素未验证。`:'没有完成前后对照，不提前生成清洁收益。';
 const types=!r.before?['measureSolarBefore']:r.deferred||r.after?['readSolarResearch']:!r.cleaned?(r.before.dust<=.001?['deferSolarMaintenance','refreshSolarBefore']:p.job?['cancelResearchSolar']:['isolateResearchSolar','cleanResearchSolar','refreshSolarBefore']):p.isolated?['reconnectResearchSolar']:['measureSolarAfter'];
 const labels={measureSolarBefore:'记录清洁前状态',measureSolarAfter:'记录清洁后状态',deferSolarMaintenance:'面板洁净，暂不维护',isolateResearchSolar:'隔离光伏输入',cleanResearchSolar:'启动无水除尘',reconnectResearchSolar:'恢复光伏并网',readSolarResearch:r.read?'报告已确认':'确认对照报告',refreshSolarBefore:'重新记录前测',cancelResearchSolar:'取消当前除尘'};
 let reason='';for(const type of types){if(type==='deferSolarMaintenance'&&r.before?.dust>.001)continue;if(type==='isolateResearchSolar'&&p.isolated||type==='cleanResearchSolar'&&!p.isolated)continue;const test=check(type,{...c,frozen:false}),b=document.createElement('button');b.dataset.solarResearchAction=type;b.textContent=labels[type];b.disabled=!test.ok||!test.changed;if(test.reason)reason=test.reason;b.onclick=()=>{close();action(type);};modal.querySelector('footer').append(b);}
 modal.querySelector('.research-reason').textContent=p.job?'关闭面板并留在操作点等待。':reason||'实际采集和确认须在阵列操作点完成。';
 const exit=document.createElement('button');exit.textContent='关闭 · Esc';exit.onclick=close;modal.querySelector('footer').append(exit);modal.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(modal);mobility.setOverlay(true);modal.showModal();addEventListener('keydown',key,true);return true;
 }
 return {action,open,interact(){const c=context();return c.eligible&&c.near&&!c.frozen?open():false;},actionStatus(name){if(!['measureSolarBefore','measureSolarAfter','deferSolarMaintenance','readSolarResearch','refreshSolarBefore','inspectSolarResearch',...Object.keys(maintenance)].includes(name))return null;if(name==='inspectSolarResearch')return {ready:context().eligible&&!mobility.frozen,reason:'先完成P段。'};const r=check(name);return {ready:r.ok&&r.changed,reason:r.reason||'本步骤已登记。'};}};
}
