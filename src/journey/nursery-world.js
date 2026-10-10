import {NURSERY,nurseryAction,tickNursery} from './nursery.js';
import {nurseryView} from './nursery-view.js';
const labels={checkNursery:'检查育苗盒',fillNursery:'转入0.40 L净水',sowNursery:'播下2粒种子',verifyNursery:'验收幼苗'};
export function mountNursery({mobility,getJourney,state,save,replace,notify,onPower=()=>{}}){
 let modal=null,reason='',clock=0;
 const point=()=>mobility.refuge?.stationPoint('garden');
 function context(){const s=state(),p=mobility.astronaut.position,q=point();return {eligible:!!getJourney()?.cards?.done?.['W-end'],frozen:mobility.frozen,mode:mobility.walking?'walk':'other',inHome:!!mobility.refuge?.inside,near:!!q&&Math.hypot(p.x-q.x,p.z-q.z)<=2.6,distance:q?Math.hypot(p.x-q.x,p.z-q.z):null,waterStored:s.water.stored,cleanL:s.water.cleanL,online:s.power.online,energy:s.power.energy};}
 function close(){if(!modal)return;modal.remove();modal=null;mobility.setOverlay(false);removeEventListener('keydown',key,true);}
 function key(e){if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}}
 function action(type){if(type==='inspectNursery')return open();const s=state(),r=nurseryAction(s.nursery,type,context());reason=r.reason;
  if(r.changed)save({...s,nursery:r.state,water:{...s.water,cleanL:Math.max(0,s.water.cleanL-r.waterL)}});
  notify(reason||(r.changed?'育苗步骤已完成。':'本步骤已完成，不重复消耗。'));return r.ok;
 }
 function open(){const c=context();if(!c.eligible||c.frozen)return false;
  if(modal)return true;modal=document.createElement('dialog');modal.className='water-dialog nursery-dialog';modal.setAttribute('aria-label','有限育苗批次');
  modal.innerHTML=`<header><small>NURSERY / BATCH 01</small><h2>首批育苗</h2><button class="water-close">关闭 · Esc</button></header>
   <p class="nursery-location"></p><section class="nursery-stage"><strong class="water-status" role="status"></strong><p class="nursery-hint"></p><label for="nursery-progress">有效培养 <span class="nursery-time"></span></label><progress id="nursery-progress" max="120" value="0"></progress></section>
   <ol class="nursery-steps" aria-label="批次步骤"><li>检查密封盒</li><li>定量注水</li><li>播下种子</li><li>培养幼苗</li><li>现场验收</li></ol>
   <dl class="nursery-resources"><div><dt>育苗盒 / 本批净水罐</dt><dd class="nursery-water"></dd></div><div><dt>备用种子 / 本批已播</dt><dd class="nursery-seeds"></dd></div><div><dt>营养基质盒 · 剩余 / 使用</dt><dd class="nursery-medium"></dd></div><div><dt>累计培养用电</dt><dd class="nursery-energy"></dd></div></dl>
   <div class="nursery-next"><button class="nursery-primary" aria-describedby="nursery-action-reason"></button><p id="nursery-action-reason"></p></div>
   <button class="nursery-power">查看营地电源</button>
   <details class="nursery-simulation"><summary>试验范围与参数</summary><p>本批0.40 L水留在培养盒，营养基质盒不可复用；不代表生活供水已充足。其余五盆未启用，当前没有可食收获。</p><p>120秒有效培养是幼苗阶段教学压缩。用能与营地共用120秒/模拟小时账本，灯与培养辅助负载合计0.12 kW，共0.12 kWh；保留8 kWh生活电量。温湿度、气体、水肥与蒸散尚未模拟。暂停、地图、面板和后台冻结，无离线培养。</p></details>`;
  modal.querySelector('.water-close').onclick=close;
  modal.querySelector('.nursery-primary').onclick=()=>{const next=nurseryView(state().nursery,context()).next;close();if(next)action(next);};
  modal.querySelector('.nursery-power').onclick=()=>{close();onPower();};
  document.body.append(modal);mobility.setOverlay(true);modal.showModal();addEventListener('keydown',key,true);render();return true;
 }
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./nursery.css',import.meta.url).href;document.head.append(css);
 function render(){if(!modal)return;const s=state(),n=s.nursery,c={...context(),frozen:false},view=nurseryView(n,{...c,frozen:true}),$=sel=>modal.querySelector(sel);
  $('.water-status').textContent=view.label;$('.nursery-hint').textContent=view.hint;
  $('.nursery-location').textContent=c.mode==='walk'&&c.inHome&&c.near?'已到育苗架 · 现场操作':`远程查看 · 操作需步行到舱内育苗架2.6 m内${c.distance!==null?' · 当前距 '+c.distance.toFixed(1)+' m':''}`;
  $('#nursery-progress').value=n.elapsed;
  $('.nursery-time').textContent=`${Math.floor(n.elapsed)} / ${NURSERY.seconds} 秒 · ${Math.floor(view.progress*100)}%${n.sown&&view.remaining?' · 剩余 '+view.remaining+' 秒有效培养':''}`;
  $('.nursery-water').textContent=`${n.filled?'0.40':'0.00'} L / ${s.water.cleanL.toFixed(2)} L`;
  $('.nursery-seeds').textContent=`${NURSERY.seeds-(n.sown?2:0)} / ${n.sown?2:0} 粒`;
  $('.nursery-medium').textContent=`${n.sown?0:1} / ${n.sown?1:0} 盒`;
  $('.nursery-energy').textContent=`${n.kwh.toFixed(3)} kWh`;
  const completed=[n.checked,n.filled,n.sown,n.elapsed>=120,n.inspected];
  for(const [i,li] of [...$('.nursery-steps').children].entries()){li.dataset.done=String(completed[i]);li.dataset.current=String(!completed[i]&&(i===0||completed[i-1]));}
  const b=$('.nursery-primary'),r=view.next?nurseryAction(n,view.next,c):null;
  b.textContent=view.next?labels[view.next]:n.inspected?'返回游戏':'关闭并继续培养';b.disabled=!!r&&(!r.ok||!r.changed);b.dataset.nurseryAction=view.next||'close';
  $('#nursery-action-reason').textContent=r? r.reason|| (view.next==='fillNursery'?'操作后本批净水减少0.40 L。':view.next==='sowNursery'?'操作消耗2粒种子和1盒营养基质。':'关闭账本后执行现场操作。'):n.inspected?'幼苗已记录；本轮尚未开放收获。':view.stage==='low'||view.stage==='offline'?view.hint:'本账本打开期间暂停培养，关闭后继续。';
 }
 return {action,open,actionStatus(name){if(name==='inspectNursery')return {ready:context().eligible,reason:''};if(!Object.hasOwn(labels,name))return null;const r=nurseryAction(state().nursery,name,context());return {ready:r.ok&&r.changed,reason:r.reason||(!r.changed?'本步骤已完成。':'')};},interact(){const c=context();if(!c.eligible||c.mode!=='walk'||!c.inHome||!c.near)return false;const next=nurseryView(state().nursery,c).next;action(next||'inspectNursery');return true;},
  update(dt){const s=state(),r=tickNursery(s.nursery,dt,{frozen:mobility.frozen,online:s.power.online,energy:s.power.energy});
   if(r.spent>0){const next={...s,nursery:r.state,power:{...s.power,energy:s.power.energy-r.spent}};if(r.state.elapsed>=120){save(next);notify('本批已到幼苗教学阶段，回育苗架按 F 验收；尚无可食收获。');}else replace(next);}
   if(r.reason&&reason!==r.reason){reason=r.reason;notify(reason);}else if(r.spent>0)reason='';
   mobility.refuge?.interior?.setNursery?.(state().nursery);
   clock+=dt;if(clock>=.2||dt===0){clock=0;render();}
  },snapshot(){return {...nurseryView(state().nursery,context()),eligible:context().eligible};},get loadKW(){return nurseryView(state().nursery,context()).kw;},get isOpen(){return !!modal;}};
}
