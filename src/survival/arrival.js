import * as THREE from 'three';
import { createAstronaut } from '../journey/astronaut.js';
import { createArrivalWorld } from './world.js';
import { SAVE_KEY, SUIT, CARGO, REFUGE, freshState, readSave, applyAction, complete } from './state.js';

export function mountArrival({scene,camera,canvas,heightAt}){
  for(const file of ['../journey/mobility.css','./arrival.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url);document.head.append(link);}
  document.body.classList.add('survival-mode');
  let storage;try{storage=localStorage;}catch{}
  const loaded=readSave(storage);let state=loaded.state,saveError=!!loaded.error,modal=null,cycle=null,saveTimer=0,selfTest=null;
  const world=createArrivalWorld(scene,heightAt);
  const astronaut=createAstronaut({scene,camera,canvas,heightAt:world.floor,blocked:world.blocked,ceilingAt:world.ceiling});
  if(world.blocked(state.player.x,state.player.z))state.player=state.environment==='inside'?freshState().player:{x:0,z:7,heading:0,firstPerson:false};
  function restore(){astronaut.start(state.player);astronaut.setView(state.player.firstPerson);}
  restore();
  const ui=document.createElement('div');ui.className='arrival-ui';ui.innerHTML=`
    <header class="arrival-header"><a href="../index.html" aria-label="返回首页">COSMOS<span> / 先遣生存</span></a><div>SOL 01 <b>准备阶段</b></div><button id="arrival-pause" aria-label="暂停任务">暂停 <kbd>Esc</kbd></button></header>
    <section class="arrival-objective"><p class="eyebrow">CHAPTER 01 / 抵达</p><h1>先确认物资，<br>再走向荒原。</h1><p id="arrival-next"></p><ol id="arrival-checklist"></ol><p class="arrival-save" id="arrival-save" role="status"></p></section>
    <aside class="arrival-suit"><p class="eyebrow">个人生命保障</p><strong id="arrival-place">应急舱内</strong><div class="suit-line"><span>宇航服</span><b id="suit-result">待自检</b></div><div class="suit-line"><span>供氧 / 电源</span><b>准备就绪</b></div><p>准备阶段不扣减物资</p><button id="arrival-suit">宇航服自检 <kbd>T</kbd></button><button id="arrival-inventory">物资总览 <kbd>I</kbd></button></aside>
    <div class="arrival-labels" aria-hidden="true"></div><div id="arrival-notice" class="arrival-notice" role="status" hidden></div>
    <div class="arrival-context"><small id="arrival-distance"></small><button id="arrival-interact"></button></div>
    <footer class="arrival-footer"><span>W A S D 步行 <i>·</i> Shift 快走 <i>·</i> 拖动环视</span><button id="arrival-view">切换视角 <kbd>C</kbd></button></footer>
    <dialog class="arrival-dialog" aria-labelledby="arrival-dialog-title"><header><span class="eyebrow" id="arrival-dialog-code"></span><button id="arrival-close" aria-label="关闭面板">×</button></header><h2 id="arrival-dialog-title"></h2><div id="arrival-dialog-content"></div><footer id="arrival-dialog-actions"></footer></dialog>
    <div class="airlock-transition" hidden><span>REFUGE / AIRLOCK</span><h2 id="airlock-text">气闸循环</h2><progress max="3" value="0"></progress><p>保持宇航服密封 · 双门互锁</p></div>`;
  document.body.append(ui);const $=id=>ui.querySelector('#'+id),dialog=ui.querySelector('dialog');
  const labels=world.targets.map(t=>{const el=document.createElement('div');el.className='arrival-marker';ui.querySelector('.arrival-labels').append(el);return {t,el};});
  function capture(){if(cycle)return;const p=astronaut.position;state.player={x:p.x,z:p.z,heading:astronaut.heading,firstPerson:astronaut.view==='第一人称'};}
  function save(){capture();try{storage.setItem(SAVE_KEY,JSON.stringify(state));saveError=false;}catch{saveError=true;} $('arrival-save').textContent=saveError?'无法写入本机存档 · 请勿关闭页面':'本机自动保存 · 生存进度独立存储';}
  function dispatch(action){capture();state=applyAction(state,action);save();render();}
  const suitReady=()=>state.suit.length===4;
  function render(){
    const done=complete(state);ui.classList.toggle('arrival-complete',done);
    ui.querySelector('h1').innerHTML=done?'物资已确认。<br>退路也已就绪。':'先确认物资，<br>再走向荒原。';
    $('arrival-next').textContent=done?'第①步完成。下一步是选址接电，建设阶段尚未开放。':!suitReady()?'先完成四项宇航服自检，再通过气闸出舱。':!state.refuge?'检查舱内储备终端，确认独立应急物资。':state.cargo.length<3?'出舱步行至三个货箱，逐一核对封签与清单。':!state.returned?'物资齐备。返回应急舱，验证最后一段退路。':'继续检查随船物资。';
    $('arrival-checklist').innerHTML=[['宇航服自检',state.suit.length===4,`${state.suit.length} / 4`],['随船货物核对',state.cargo.length===3,`${state.cargo.length} / 3`],['应急退路确认',state.refuge&&state.returned,state.refuge?(state.returned?'已往返':'待出舱往返'):'待检查储备']].map(([n,d,v],i)=>`<li class="${d?'done':''}"><span>${d?'✓':'0'+(i+1)}</span><div>${n}<small>${v}</small></div></li>`).join('');
    $('suit-result').textContent=suitReady()?'自检通过':`${state.suit.length} / 4 已检查`;
    $('arrival-place').textContent=state.environment==='inside'?'应急舱内 · 安全区':'火星地表 · 舱外活动';
    $('arrival-view').innerHTML=`${astronaut.view} <kbd>C</kbd>`;
  }
  function syncPause(){astronaut.setPaused(!!modal||!!cycle||document.hidden);}
  function open(kind,title,content,actions=[]){if(cycle&&kind!=='pause')return;capture();modal=kind;selfTest=null;syncPause();$('arrival-dialog-code').textContent='MISSION PREPARATION / '+kind.toUpperCase();$('arrival-dialog-title').textContent=title;$('arrival-dialog-content').innerHTML=content;$('arrival-dialog-actions').replaceChildren();for(const a of actions){const b=document.createElement('button');b.textContent=a.label;b.className=a.primary?'primary':'';b.disabled=!!a.disabled;b.onclick=a.run;$('arrival-dialog-actions').append(b);}if(!dialog.open)dialog.showModal();}
  function close(){dialog.close();modal=null;selfTest=null;syncPause();render();save();}
  $('arrival-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const rows=items=>`<dl class="manifest">${items.map(([n,v])=>`<div><dt>${n}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  function suitPanel(){open('suit','出舱前，检查自己。',`<p>检查服体密封、供氧、电源与空气处理。四项全部通过后开放出舱。</p><div class="self-test">${SUIT.map(([id,n])=>`<div data-suit="${id}"><span>${n}</span><b>${state.suit.includes(id)?'通过':'待检查'}</b></div>`).join('')}</div><p class="fine">这是出舱准备检查；本阶段尚未启动氧气、电量与滤材消耗。</p>`,[{label:suitReady()?'重新自检':'开始自检',primary:true,run(){selfTest={elapsed:0,index:0};$('arrival-dialog-actions').querySelector('button').disabled=true;}},{label:'返回',run:close}]);}
  function inventory(){open('inventory','随船物资总览',`<p>物资已随船抵达。到货箱旁核对封签后才计入任务进度；核对不会发放额外物资。</p>${CARGO.map(c=>`<h3>${c.code} / ${c.name} <small>${state.cargo.includes(c.id)?'已核对':'待现场核对'}</small></h3>${rows(c.items)}`).join('')}<p class="fine">应急舱已就位。舱内储备是上述总量的一部分，不重复计数。库存为游戏开局调试值。</p>`,[{label:'返回地面',primary:true,run:close}]);}
  function refuge(){open('refuge','先为自己留一条退路。',`<p>随船应急舱独立供能。检查备用储备后，出舱并返回一次，验证气闸通路。</p>${rows([['舱体 / 空气处理','预置设备就绪'],['独立应急电池','24 kWh'],['舱内洁净水','30 L / 总量 120 L'],['应急口粮','5 / 总量 20 人·Sol'],['应急氧气','5 / 总量 20 人·Sol'],['气闸往返',state.returned?'已验证':'待实际往返']])}<p class="fine">舱内物资已计入总清单；本步不模拟持续舱压、电力或食物消耗。</p>`,[{label:state.refuge?'储备已确认':'确认备用储备',primary:true,run(){dispatch({type:'refuge'});close();}},{label:'返回',run:close}]);}
  function cargo(c){open('cargo',`${c.code} / ${c.name}`,`<p>运输封签完整。按清单核对内容，确认设备仍处于封存状态。</p>${rows(c.items)}<p class="fine">${c.id==='life'?'含已转存应急舱的生命补给。':c.id==='power'?'应急电池已接入安全舱；主电池与太阳能板待后续部署。':'本步只检查到货，施工将在后续阶段开放。'}</p>`,[{label:state.cargo.includes(c.id)?'已核对 · 返回':'核对清单并封存',primary:true,run(){dispatch({type:'cargo',id:c.id});close();}},{label:'稍后核对',run:close}]);}
  function pause(){open('pause','任务已暂停',`<p>继续时从当前位置恢复。进度保存在此浏览器中。</p>`,[{label:'继续任务',primary:true,run:close},{label:'返回首页',run(){save();location.href='../index.html';}},{label:'重新开始第①步',disabled:!!cycle,run(){open('reset','重置生存准备进度？','<p>这会清除本次自检、货物检查与气闸往返记录。原有火星探索任务独立保留。</p>',[{label:'保留进度',primary:true,run:pause},{label:'确认重新开始',run(){state=freshState();restore();close();}}]);}}]);}
  function nearest(){const p=astronaut.position;const targets=state.environment==='inside'?[{id:'refuge',name:'检查应急储备',...REFUGE},{id:'door',name:suitReady()?'通过气闸出舱':'出舱前需完成宇航服自检',x:0,z:0}]:[{id:'door',name:'通过气闸返回应急舱',x:0,z:6},...CARGO.map(c=>({...c,name:'核对 '+c.name}))];return targets.map(t=>({...t,distance:Math.hypot(p.x-t.x,p.z-t.z)})).sort((a,b)=>a.distance-b.distance)[0];}
  function interact(){if(modal||cycle)return;capture();const t=nearest();if(t.distance>(t.id==='door'?2.8:3))return;if(t.id==='door'){
      if(state.environment==='inside'&&!suitReady()){suitPanel();return;}
      const action={type:state.environment==='inside'?'exit':'enter'};const next=applyAction(state,action);if(next.environment===state.environment)return;
      save();cycle={elapsed:0,next};syncPause();ui.querySelector('.airlock-transition').hidden=false;
    }else if(t.id==='refuge')refuge();else cargo(CARGO.find(c=>c.id===t.id));}
  $('arrival-suit').onclick=suitPanel;$('arrival-inventory').onclick=inventory;$('arrival-pause').onclick=pause;$('arrival-interact').onclick=interact;$('arrival-view').onclick=()=>{if(!modal&&!cycle){astronaut.cycle();render();save();}};
  addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(modal)return;if(['KeyF','KeyT','KeyI','Escape'].includes(e.code))e.preventDefault();if(e.code==='KeyF')interact();if(e.code==='KeyT')suitPanel();if(e.code==='KeyI')inventory();if(e.code==='Escape')pause();});
  addEventListener('pagehide',save);addEventListener('blur',()=>{if(!modal)pause();});document.addEventListener('visibilitychange',()=>{save();syncPause();});
  const projected=new THREE.Vector3();let lastView=astronaut.view;
  function update(dt){
    if(document.hidden)return;
    if(cycle&&!modal){cycle.elapsed+=dt;const t=cycle.elapsed;world.doors(t<.7?(state.environment==='inside'?'inner':'outer'):t>2.3?(state.environment==='inside'?'outer':'inner'):'closed');$('airlock-text').textContent=t<.7?'进入气闸，关闭入口':t<2.3?'双门锁闭 · 压力循环':'压力匹配 · 开启出口';ui.querySelector('.airlock-transition progress').value=t;
      if(t>=3){state=cycle.next;cycle=null;world.doors('closed');restore();syncPause();ui.querySelector('.airlock-transition').hidden=true;save();render();}
    }
    if(selfTest){selfTest.elapsed+=dt;if(selfTest.elapsed>.55){selfTest.elapsed=0;const id=SUIT[selfTest.index][0];dispatch({type:'suit',id});ui.querySelector(`[data-suit="${id}"] b`).textContent='通过';selfTest.index++;if(selfTest.index===4){selfTest=null;const b=$('arrival-dialog-actions').querySelector('button');b.textContent='自检完成';}}}
    astronaut.update(dt);if(lastView!==astronaut.view){lastView=astronaut.view;render();}
    const t=nearest();$('arrival-distance').textContent=`${state.environment==='inside'?'舱内':'舱外'} · ${t.distance.toFixed(1)} m`;$('arrival-interact').textContent=t.distance<=(t.id==='door'?2.8:3)?`${t.name}  [F]`:`走近${t.id==='door'?'气闸':t.id==='refuge'?'储备终端':t.name.replace('核对 ','')}`;$('arrival-interact').disabled=t.distance>(t.id==='door'?2.8:3)||!!cycle;
    for(const {t,el} of labels){let x=t.x,z=t.z;if(t.id==='door'&&state.environment==='inside')z=0;const dist=Math.hypot(astronaut.position.x-x,astronaut.position.z-z);projected.set(x,world.floor(x,z)+(t.id==='door'?2.3:1.8),z).project(camera);const available=state.environment==='inside'?(t.id==='door'||t.id==='refuge'):t.id!=='refuge';el.hidden=dist<2||!available||!!modal||!!cycle||projected.z< -1||projected.z>1||Math.abs(projected.x)>.94||Math.abs(projected.y)>.8;el.style.left=(projected.x*.5+.5)*innerWidth+'px';el.style.top=(-projected.y*.5+.5)*innerHeight+'px';el.textContent=`${t.code?t.code+' / ':''}${t.name} · ${Math.round(dist)} m${state.cargo.includes(t.id)?' ✓':''}`;}
    saveTimer+=dt;if(saveTimer>2&&!modal&&!cycle){saveTimer=0;save();}
  }
  save();render();
  const api={astronaut,walking:true,active:false,update,get state(){return structuredClone(state);},get cycling(){return !!cycle;},get paused(){return !!modal;},setPaused(value){if(value)pause();else if(modal)close();}};window.__SURVIVAL=api;return api;
}
