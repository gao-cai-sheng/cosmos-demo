import * as THREE from 'three';
import { createAstronaut } from '../journey/astronaut.js';
import { mountCommandDeck } from '../journey/command-deck.js';
import {SITES,equipment,survey,powerAction,tickPower,cableUsed,POWER_CARGO,ROVER_CHARGER_KW} from './power.js';
import {createPowerWorld} from './power-world.js';
import { createArrivalWorld } from './world.js';
import { SAVE_KEY, SUIT, CARGO, REFUGE, freshState, readSave, applyAction, complete } from './state.js';

export function mountArrival({scene,camera,canvas,heightAt}){
  for(const file of ['../journey/mobility.css','./arrival.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url);document.head.append(link);}
  document.body.classList.add('survival-mode','survival-command-deck');
  let storage;try{storage=localStorage;}catch{}
  const loaded=readSave(storage);let state=loaded.state,saveError=!!loaded.error,modal=null,cycle=null,drop=null,unload=null,saveTimer=0,selfTest=null,logOverlay=false,returnGuidance=false,deck=null,deckTimer=0;
  const world=createArrivalWorld(scene,heightAt);world.setCargoDrop(state.delivery.landed?1:0);world.setPowerRelease(state.power.released?1:0);
  const powerWorld=createPowerWorld(scene,heightAt);powerWorld.rebuild(state.power);
  const astronaut=createAstronaut({scene,camera,canvas,heightAt:world.floor,blocked:(x,z)=>world.blocked(x,z)||powerWorld.blocked(x,z),ceilingAt:world.ceiling});
  if(world.blocked(state.player.x,state.player.z))state.player=state.environment==='inside'?freshState().player:{x:0,z:7,heading:0,firstPerson:false};
  function restore(){astronaut.start(state.player);astronaut.setView(state.player.firstPerson);}
  restore();
  const ui=document.createElement('div');ui.className='arrival-ui';ui.innerHTML=`
    <header class="arrival-header"><a href="../index.html" aria-label="返回首页">COSMOS<span> / 先遣生存</span></a><div>SOL 01 <b>准备阶段</b></div><button id="arrival-pause" aria-label="暂停任务">暂停 <kbd>Esc</kbd></button></header>
    <section class="arrival-objective"><p class="eyebrow">CHAPTER 01 / 抵达</p><h1>先确认物资，<br>再走向荒原。</h1><p id="arrival-next"></p><ol id="arrival-checklist"></ol><p class="arrival-save" id="arrival-save" role="status"></p></section>
    <aside class="arrival-suit"><p class="eyebrow">个人生命保障</p><strong id="arrival-place">应急舱内</strong><div class="suit-line"><span>宇航服</span><b id="suit-result">待自检</b></div><div class="suit-line"><span>供氧 / 电源</span><b>准备就绪</b></div><p>生命补给暂不扣减</p><button id="arrival-suit">宇航服自检 <kbd>T</kbd></button><button id="arrival-supply" hidden>投放地面补给</button><button id="arrival-power" hidden>选址与接电</button><p id="power-readout" hidden></p><button id="arrival-inventory">物资总览 <kbd>I</kbd></button></aside>
    <div class="arrival-labels" aria-hidden="true"></div><div id="arrival-notice" class="arrival-notice" role="status" hidden></div>
    <div class="arrival-context"><small id="arrival-distance"></small><button id="arrival-interact"></button></div>
    <footer class="arrival-footer"><span>W A S D 步行 <i>·</i> Shift 快走 <i>·</i> 拖动环视</span><button id="arrival-view">切换视角 <kbd>C</kbd></button></footer>
    <dialog class="arrival-dialog" aria-labelledby="arrival-dialog-title"><header><span class="eyebrow" id="arrival-dialog-code"></span><button id="arrival-close" aria-label="关闭面板">×</button></header><h2 id="arrival-dialog-title"></h2><div id="arrival-dialog-content"></div><footer id="arrival-dialog-actions"></footer></dialog>
    <div class="airlock-transition" hidden><span>REFUGE / AIRLOCK</span><h2 id="airlock-text">气闸循环</h2><progress max="3" value="0"></progress><p>保持宇航服密封 · 双门互锁</p></div>
    <div class="supply-transition" hidden><span>GROUND DELIVERY / CARGO</span><h2 id="supply-text">补给托盘下降</h2><progress max="1" value="0"></progress><p>自动制导 · 三组托盘依次触地</p></div>`;
  document.body.append(ui);const $=id=>ui.querySelector('#'+id),dialog=ui.querySelector('dialog'),supplyTransition=ui.querySelector('.supply-transition'),supplyCode=supplyTransition.querySelector('span'),supplyProgress=supplyTransition.querySelector('progress');
  const labels=world.targets.map(t=>{const el=document.createElement('div');el.className='arrival-marker';ui.querySelector('.arrival-labels').append(el);return {t,el};});
  function capture(){if(cycle||drop||unload)return;const p=astronaut.position;state.player={x:p.x,z:p.z,heading:astronaut.heading,firstPerson:astronaut.view==='第一人称'};}
  function save(){capture();try{storage.setItem(SAVE_KEY,JSON.stringify(state));saveError=false;}catch{saveError=true;} $('arrival-save').textContent=saveError?'无法写入本机存档 · 请勿关闭页面':'本机自动保存 · 生存进度独立存储';}
  function dispatch(action){const previous=structuredClone(state);capture();if(['start-power','plan-site','release-power-cargo','survey-site','install-power','connect-solar','connect-bus','commission-power'].includes(action.type)){state.power=powerAction(state.power,action,{eligible:complete(state),outside:state.environment==='outside',player:state.player,heightAt});powerWorld.rebuild(state.power);world.setPowerRelease(state.power.released?1:0);}else state=applyAction(state,action);save();render();notifyProgress(previous);}
  const suitReady=()=>state.suit.length===4;
  function render(){
    const done=complete(state);ui.querySelector('.arrival-objective .eyebrow').textContent='CHAPTER 01 / 抵达';ui.classList.toggle('arrival-complete',done);
    ui.querySelector('h1').innerHTML=done?'物资已确认。<br>退路也已就绪。':'先确认物资，<br>再走向荒原。';
    $('arrival-next').textContent=done?'第①步完成。打开“选址与接电”，开始部署营地电源。':!suitReady()?'先完成四项宇航服自检。':!state.refuge?'检查舱内储备终端，确认独立应急物资。':!state.delivery.landed?'在舱内启动地面补给投放，等待三组托盘触地。':state.cargo.length<3?'通过气闸出舱，步行至三个货箱核对封签与清单。':!state.returned?'物资齐备。返回应急舱，验证最后一段退路。':'继续检查随船物资。';
    $('arrival-checklist').innerHTML=[['宇航服自检',state.suit.length===4,`${state.suit.length} / 4`],['应急储备确认',state.refuge,state.refuge?'已确认':'待检查'],['地面补给投放',state.delivery.landed,state.delivery.landed?'已触地':'待投放'],['随船货物核对',state.cargo.length===3,`${state.cargo.length} / 3`],['应急退路确认',state.returned,state.returned?'已往返':'待出舱往返']].map(([n,d,v],i)=>`<li class="${d?'done':''}"><span>${d?'✓':String(i+1).padStart(2,'0')}</span><div>${n}<small>${v}</small></div></li>`).join('');
    $('arrival-supply').hidden=!suitReady()||!state.refuge||state.delivery.landed||state.environment!=='inside'||state.power.started;
    $('arrival-power').hidden=!done;
    if(state.power.started){
      const p=state.power;ui.querySelector('h1').innerHTML=p.online?'营地电源已就绪。':'先选好位置，<br>再接通第一路电。';
      ui.querySelector('.arrival-objective .eyebrow').textContent='CHAPTER 01 / 选址接电';
      $('arrival-next').textContent=p.online?'第②步完成。下一步：部署压力帐篷并检漏入住。':!p.plan?'打开选址与接电，比较三个候选位置。':!p.released?'返回 02 能源货箱，释放重件托盘给卸货机构。':!p.site?'沿场景标记步行到候选地，现场确认地基。':!p.installed?'地基已确认，让卸货机构拖运并展开随船电源套件。':!p.links.includes('solar')?'走近主电池，连接太阳能输入端口。':!p.links.includes('bus')?'走近配电箱，连接主电池输出端口。':'在配电箱处完成通电验收。';
      $('arrival-checklist').innerHTML=[['能源托盘卸载',p.released],['现场选址',!!p.site],['电源设备展开',p.installed],['端口连接',p.links.length===2],['通电验收',p.online]].map(([n,d],i)=>`<li class="${d?'done':''}"><span>${d?'✓':i+1}</span><div>${n}</div></li>`).join('');
    }
    $('power-readout').hidden=!state.power.started;
    $('power-readout').textContent=`主电池 ${state.power.energy.toFixed(2)} / 60 kWh · 电缆余量 ${100-cableUsed(state.power)} m · MU-7 ${state.power.online?ROVER_CHARGER_KW+' kW':'接口未投运'}`;
    $('suit-result').textContent=suitReady()?'自检通过':`${state.suit.length} / 4 已检查`;
    $('arrival-place').textContent=state.environment==='inside'?'应急舱内 · 安全区':'火星地表 · 舱外活动';
    $('arrival-view').innerHTML=`${astronaut.view} <kbd>C</kbd>`;$('arrival-pause').disabled=!!drop||!!unload;
    updateDeck();
  }
  function syncPause(){astronaut.setPaused(logOverlay||!!modal||!!cycle||!!drop||!!unload||document.hidden);}
  function open(kind,title,content,actions=[]){if(logOverlay||((cycle||drop||unload)&&kind!=='pause'))return;capture();modal=kind;selfTest=null;syncPause();$('arrival-dialog-code').textContent='MISSION PREPARATION / '+kind.toUpperCase();$('arrival-dialog-title').textContent=title;$('arrival-dialog-content').innerHTML=content;$('arrival-dialog-actions').replaceChildren();for(const a of actions){const b=document.createElement('button');b.textContent=a.label;b.className=a.primary?'primary':'';b.disabled=!!a.disabled;b.onclick=a.run;$('arrival-dialog-actions').append(b);}if(!dialog.open)dialog.showModal();updateDeck();}
  function close(){dialog.close();modal=null;selfTest=null;syncPause();render();save();}
  $('arrival-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const rows=items=>`<dl class="manifest">${items.map(([n,v])=>`<div><dt>${n}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  function suitPanel(){open('suit','出舱前，检查自己。',`<p>检查服体密封、供氧、电源与空气处理。四项全部通过后开放出舱。</p><div class="self-test">${SUIT.map(([id,n])=>`<div data-suit="${id}"><span>${n}</span><b>${state.suit.includes(id)?'通过':'待检查'}</b></div>`).join('')}</div><p class="fine">这是出舱准备检查；本阶段尚未启动氧气、电量与滤材消耗。</p>`,[{label:suitReady()?'重新自检':'开始自检',primary:true,run(){selfTest={elapsed:0,index:0};$('arrival-dialog-actions').querySelector('button').disabled=true;}},{label:'返回',run:close}]);}
  function inventory(){open('inventory','随船物资总览',`<p>${state.delivery.landed?'三组地面补给已完成投放。到货箱旁核对封签后才计入任务进度；核对不会发放额外物资。':'三组补给托盘仍在地面投放序列中；完成宇航服和应急储备检查后可从舱内启动投放。'}</p>${CARGO.map(c=>`<h3>${c.code} / ${c.name} <small>${state.cargo.includes(c.id)?'已核对':state.delivery.landed?'待现场核对':'待投放'}</small></h3>${rows(c.items)}`).join('')}<p class="fine">应急舱已就位。舱内储备是上述总量的一部分，不重复计数。库存为游戏开局调试值。</p>`,[{label:'返回现场',primary:true,run:close}]);}
  function refuge(){open('refuge','先为自己留一条退路。',`<p>随船应急舱独立供能。检查备用储备后，出舱并返回一次，验证气闸通路。</p>${rows([['舱体 / 空气处理','预置设备就绪'],['独立应急电池','24 kWh'],['舱内洁净水','30 L / 总量 120 L'],['应急口粮','5 / 总量 20 人·Sol'],['应急氧气','5 / 总量 20 人·Sol'],['气闸往返',state.returned?'已验证':'待实际往返']])}<p class="fine">舱内物资已计入总清单；本步不模拟持续舱压、电力或食物消耗。</p>`,[{label:state.refuge?'储备已确认':'确认备用储备',primary:true,run(){dispatch({type:'refuge'});close();}},{label:'返回',run:close}]);}
  function cargo(c){open('cargo',`${c.code} / ${c.name}`,`<p>运输封签完整。按清单核对内容，确认设备仍处于封存状态。</p>${rows(c.items)}<p class="fine">${c.id==='life'?'含已转存应急舱的生命补给。':c.id==='power'?'应急电池已接入安全舱；主电池与太阳能板待后续部署。':'本步只检查到货，施工将在后续阶段开放。'}</p>`,[{label:state.cargo.includes(c.id)?'已核对 · 返回':'核对清单并封存',primary:true,run(){dispatch({type:'cargo',id:c.id});close();}},{label:'稍后核对',run:close}]);}
  function pause(){if(logOverlay||drop||unload)return;open('pause','任务已暂停',`<p>继续时从当前位置恢复。进度保存在此浏览器中。</p>`,[{label:'继续任务',primary:true,run:close},{label:'返回首页',run(){save();location.href='../index.html';}},{label:'重新开始生存开局',disabled:!!cycle,run(){open('reset','重置生存准备进度？','<p>这会清除本次物资投放、检查、接电施工与电池进度。原有火星探索任务独立保留。</p>',[{label:'保留进度',primary:true,run:pause},{label:'确认重新开始',run(){state=freshState();world.setCargoDrop(0);world.setPowerRelease(0);powerWorld.rebuild(state.power);restore();close();}}]);}}]);}
  function powerPanel(){
    const p=state.power;
    if(!p.started){open('power','把第一路电接起来。','<p>物资与退路已确认。先比较地基，再返回 02 能源货箱释放重件托盘，由卸货机构拖运到选址展开太阳能、主电池和配电箱，最后逐一连接端口。</p><p class="fine">从已核对物资中部署：太阳能2套中使用1套、主电池1套、配电箱1套、电缆最多100 m。教学白昼发电4 kW，配电验收负载0.2 kW；MU-7 快充接口按 36 kW 游戏调试值记账。</p>',[{label:'开始选址接电',primary:true,run(){dispatch({type:'start-power'});close();powerPanel();}}]);return;}
    const choices=SITES.map(site=>({site,check:survey(site,heightAt)}));
    open('power',p.online?'第②步完成 · 电源已投运':'营地选址与接电',`<p>候选地采用当前地形采样，最大坡度需不超过16°。选择只放置引导标记；重件托盘必须先从 02 货箱释放，再到现场确认和安装。</p>${choices.map(({site,check})=>`<h3>${site.name} ${p.plan===site.id?'· 当前计划':''}</h3><p>距能源货箱 ${Math.round(Math.hypot(site.x-POWER_CARGO.x,site.z-POWER_CARGO.z))} m · 最大采样坡度 ${check.slope.toFixed(1)}° · ${check.ok?'地形合格':'坡度过大'}</p>`).join('')}${rows([['能源托盘',p.released?'已卸载 · 卸货机构接管':'仍在 02 货箱'],['太阳能套件余量',p.installed?'1 / 2 套':'2 / 2 套'],['主电池',p.energy.toFixed(2)+' / 60 kWh'],['MU-7 快充',p.online?ROVER_CHARGER_KW+' kW · 从主电池扣账':'接口未投运'],['剩余电缆',(100-cableUsed(p))+' m'],['光伏输入',p.links.includes('solar')?'已连接 · 4 kW':'未连接 · 0 kW'],['配电输出',p.online?'已验收 · 0.2 kW 教学负载':'未投运']])}<p class="fine">功率与电量分别记账。模拟1小时对应现实120秒；满电停充，面板打开、暂停、投放和卸货过程不推进电量。下一步压力帐篷尚未施工。</p>`,[...(!p.installed?choices.map(({site,check})=>({label:'选择 '+site.name,disabled:!check.ok,run(){dispatch({type:'plan-site',id:site.id});close();}})):[]),{label:'返回现场',primary:true,run:close}]);
  }
  function powerTarget(){const p=state.power;if(!p.started||!p.plan||state.environment!=='outside')return null;if(!p.released)return {...POWER_CARGO,id:'power-device',action:'release-power-cargo',name:'释放能源托盘 · 卸货机构'};const site=SITES.find(x=>x.id===p.plan),eq=equipment(p.plan);return !p.site?{...site,id:'power-device',action:'survey-site',name:'现场确认 '+site.name}:!p.installed?{...site,id:'power-device',action:'install-power',name:'拖运并展开电源套件'}:!p.links.includes('solar')?{...eq.battery,id:'power-device',action:'connect-solar',name:'连接光伏输入 · 使用12 m电缆'}:!p.links.includes('bus')?{...eq.bus,id:'power-device',action:'connect-bus',name:'连接配电箱 · 使用6 m电缆'}:{...eq.bus,id:'power-device',action:p.online?'status':'commission-power',name:p.online?'查看营地电源':'通电验收'};}
  const compass=angle=>((angle%360)+360)%360;
  const manifestValue=(group,label)=>CARGO.find(c=>c.id===group)?.items.find(([name])=>name===label)?.[1]??'未记录';
  function changeView(){if(!logOverlay&&!modal&&!cycle&&!drop&&!unload){astronaut.cycle();render();save();}}
  function returnTarget(){const p=astronaut.position;return {x:0,z:6,distance:Math.hypot(p.x,6-p.z),bearing:compass(Math.atan2(-p.x,p.z-6)*180/Math.PI)};}
  function guideHome(){
    if(state.environment==='inside')return;
    returnGuidance=!returnGuidance;
    const target=returnTarget();
    deck?.notify({title:returnGuidance?'返舱指引已开启':'返舱指引已取消',body:returnGuidance?`应急舱气闸距当前位置 ${target.distance.toFixed(1)} m，方位 ${Math.round(target.bearing)}°。按 WASD 自行返回，避开地形与货箱；到气闸 2.8 m 内按 F 入舱。`:'人物与任务进度保持原位。',source:'应急导航',kind:returnGuidance?'warning':'info'});
    updateDeck();
  }
  function navigationPanel(){
    const p=astronaut.position,inside=state.environment==='inside',target=returnTarget();
    const destinations=inside?[['应急储备终端',REFUGE],['内气闸',{x:0,z:0}]]:[['应急舱气闸',target],...(state.delivery.landed?CARGO.map(c=>[c.code+' '+c.name,c]):[]),...(powerTarget()?[[powerTarget().name,powerTarget()]]:[])];
    open('navigation','现场导航',`<p>小图标记来自当前场景。人物位置 X ${p.x.toFixed(1)} / Z ${p.z.toFixed(1)} m，朝向 ${Math.round(compass(180-astronaut.heading*180/Math.PI))}°。</p>${rows(destinations.map(([label,point])=>[label,Math.hypot(point.x-p.x,point.z-p.z).toFixed(1)+' m']))}<p class="fine">显示直线距离与方位；未规划地形通路。WASD 步行，避开建筑与货箱。外气闸在 X 0 / Z 6，到 2.8 m 内按 F 进行原有气闸循环。</p>`,[...(!inside?[{label:returnGuidance?'取消返舱指引':'导航至应急气闸',primary:true,run(){close();guideHome();}}]:[]),{label:'返回现场',run:close}]);
  }
  function missionPanel(){
    open('mission',state.power.started?'选址与接电 · 任务详情':'抵达 · 任务详情',`<p>${$('arrival-next').textContent}</p><ol class="arrival-mission-detail">${$('arrival-checklist').innerHTML}</ol><p>${$('arrival-save').textContent}</p><p class="fine">当前已实现物资检查与选址接电。生命补给暂不扣减，宇航服氧气余量、心率与压力遥测未接入；压力帐篷与首次过夜仍待后续实现。</p>`,[{label:'返回现场',primary:true,run:close}]);
  }
  function notifyProgress(previous){
    let message;
    if(previous.suit.length<SUIT.length&&suitReady())message=['宇航服自检完成','服体密封、供氧阀组、背包电源与空气滤芯四项检查已通过。'];
    else if(!previous.refuge&&state.refuge)message=['应急储备已确认','舱内储备属于随船总清单，未重复增加物资。'];
    else if(!previous.delivery.landed&&state.delivery.landed)message=['三组补给已触地','通过气闸出舱，到货箱 3 m 内按 F 核对封签与清单。'];
    else if(previous.cargo.length<state.cargo.length)message=['货箱已核对',`${state.cargo.length} / ${CARGO.length} 组清单已确认；核对不会额外发放物资。`];
    else if(!previous.returned&&state.returned)message=['应急退路已验证','已完成实际出舱与返回，可继续选址接电。'];
    else if(!previous.power.released&&state.power.released)message=['能源托盘已卸载','卸货机构已接管重件，请前往所选营地确认地基。'];
    else if(!previous.power.site&&state.power.site)message=['营地地基已确认','地形检查通过，现可在现场展开随船电源套件。'];
    else if(!previous.power.installed&&state.power.installed)message=['电源设备已展开','走近主电池与配电箱，分别连接光伏输入和配电输出。'];
    else if(previous.power.links.length<state.power.links.length)message=['电缆端口已连接',`已连接 ${state.power.links.length} / 2 段，累计使用 ${cableUsed(state.power)} m 电缆。`];
    else if(!previous.power.online&&state.power.online)message=['营地电源已投运','通电验收完成。光伏输入与配电负载开始按主电池 kWh 账本结算。'];
    if(message)deck?.notify({title:message[0],body:message[1],source:'生存现场',kind:'success'});
  }
  function commandAction(id,pressed){
    if(pressed===false||logOverlay||modal)return;
    if(id==='pause'){pause();return;}
    if(cycle||drop||unload)return;
    if(id==='time'){open('time','固定教学白昼','<p>当前为物资检查与接电教学。太阳位置固定；电量按实际接入的光伏功率与配电负载结算，打开面板时暂停计时。完整昼夜与第一夜生存尚未接入本场景。</p>',[{label:'返回现场',run:close}]);return;}
    if(id==='interact')interact();
    else if(id==='suit')suitPanel();
    else if(id==='inventory'||id.startsWith('inventory:'))inventory();
    else if(id==='view')changeView();
    else if(id==='power'&&complete(state))powerPanel();
    else if(id==='supply')startSupplyDrop();
    else if(id==='mission')missionPanel();
    else if(id==='map')navigationPanel();
    else if(id==='return-home')guideHome();
    else if(id.startsWith('mode:')&&id!=='mode:walk')deck?.notify({title:'当前为独立生存准备场景',body:'该入口尚未部署可操控的 MU-7、ARES 或 NX07。',source:'现场状态'});
  }
  function updateDeck(){
    if(!deck)return;
    const p=state.power,inside=state.environment==='inside',target=nearest(),home=returnTarget();
    const locked=!!cycle||!!drop||!!unload,range=target.id==='door'?2.8:3,near=target.distance<=range;
    const generation=p.installed&&p.links.includes('solar')?4:0;
    const steps=[...$('arrival-checklist').children].map(li=>({label:li.querySelector('div').firstChild.textContent,done:li.classList.contains('done')}));
    const supplyReason=!suitReady()?'先完成四项宇航服自检':!state.refuge?'先到舱内终端确认应急储备':!inside?'需从应急舱内启动投放':'';
    const actions=[
      {id:'interact',label:target.name,key:'F',detail:`${target.distance.toFixed(1)} m · 现场范围 ${range} m`,disabled:!near||locked,reason:locked?'等待当前作业完成':`需走近至 ${range} m 内 · 当前 ${target.distance.toFixed(1)} m`},
      {id:'suit',label:'宇航服自检',key:'T',detail:`${state.suit.length} / ${SUIT.length} 已通过`,disabled:locked,reason:'等待当前作业完成'},
      {id:'inventory',label:'物资清单',key:'I',detail:`${state.cargo.length} / ${CARGO.length} 箱已核对`,disabled:locked,reason:'等待当前作业完成'},
      {id:'view',label:'切换视角',key:'C',detail:astronaut.view,disabled:locked,reason:'等待当前作业完成'},
      {id:'power',label:'选址与接电',detail:p.online?'营地电源已投运':p.started?'查看选址与施工进度':'先确认物资与退路',disabled:!complete(state)||locked,reason:locked?'等待当前作业完成':'先完成物资检查与气闸往返'},
      ...(!state.delivery.landed?[{id:'supply',label:'投放地面补给',detail:'舱内启动 · 三组托盘',disabled:!!supplyReason||locked,reason:locked?'等待当前作业完成':supplyReason}]:[{id:'map',label:'现场导航',key:'M',detail:'真实位置 · 距离与方位',disabled:locked,reason:'等待当前作业完成'}]),
    ];
    const markers=[{x:0,z:inside?0:6,label:inside?'内气闸':'应急气闸',color:returnGuidance?'#f46b5e':'#22d3ee'},...(inside?[{...REFUGE,label:'储备终端'}]:state.delivery.landed?CARGO.map(c=>({x:c.x,z:c.z,label:c.code+' '+c.name,color:state.cargo.includes(c.id)?'#34d399':'#f5a524'})):[]),...(powerTarget()?[{...powerTarget(),label:powerTarget().name,color:'#34d399'}]:[])];
    const transition=cycle?'气闸循环 · 双门互锁':drop?'地面补给投放中':unload?'能源托盘卸载中':null;
    const status=transition||(returnGuidance&&!inside?`返舱指引 · ${Math.round(home.bearing)}° / ${home.distance.toFixed(1)} m · ${home.distance<=2.8?'按 F 入舱':'WASD 步行返回'}`:`${inside?'应急舱内':'舱外步行'} · ${astronaut.view} · ${near?target.name+' [F]':'走近目标后按 F'}`);
    deck.update({mode:'survival',title:'EVA / 生存准备',subtitle:inside?'应急舱 · 安全区':'火星地表 · 舱外活动',status,
      heading:compass(180-astronaut.heading*180/Math.PI),position:{x:astronaut.position.x,z:astronaut.position.z},time:p.installed?`固定白昼 · 电网 ${p.hours.toFixed(2)} h`:'固定白昼 · 准备阶段',site:'先遣营地 · 独立生存入口',communications:'现场日志 · 无地球链路仿真',
      metrics:[{label:'主电池',value:p.energy.toFixed(2)+' / 60',unit:'kWh',percent:p.energy/60*100,tone:p.energy<12?'amber':'cyan'},{label:'光伏输入',value:generation.toFixed(1),unit:'kW',tone:generation?'green':'dim'},{label:'宇航服自检',value:`${state.suit.length} / ${SUIT.length}`,tone:suitReady()?'green':'amber'},{label:'步行速度',value:(locked||modal||logOverlay?0:astronaut.speed).toFixed(1),unit:'m/s'}],actions,
      inventory:[{id:'inventory:cable',label:'剩余电缆',value:(100-cableUsed(p))+' m',detail:`总量 ${manifestValue('power','电缆')} · 已用 ${cableUsed(p)} m`},{id:'inventory:solar',label:'太阳能套件',value:(parseInt(manifestValue('power','折叠太阳能板'))-(p.installed?1:0))+' 套',detail:p.installed?'另 1 套已展开':'均在能源货箱'},{id:'inventory:battery',label:'主电池',value:p.energy.toFixed(2)+' kWh',detail:p.online?'配电已投运':'容量 60 kWh'},{id:'inventory:reserve',label:'应急电池',value:manifestValue('power','独立应急电池'),detail:'舱内独立储备 · 暂不扣减'},{id:'inventory:water',label:'洁净水总量',value:manifestValue('life','洁净水'),detail:'含应急舱内储备'},{id:'inventory:food',label:'储备口粮总量',value:manifestValue('life','储备口粮'),detail:'含应急舱内储备'}],
      mission:{title:p.online?'第②步完成 · 电源投运':p.started?'第②步 · 选址接电':'第①步 · 检查物资',body:$('arrival-next').textContent,steps,progress:steps.filter(s=>s.done).length/steps.length*100},
      instruments:[{title:'SUIT / 出舱检查',rows:SUIT.map(([id,label])=>({label,value:state.suit.includes(id)?'已通过':'待检查'})),progress:state.suit.length/SUIT.length*100},{title:returnGuidance&&!inside?'RETURN / 应急返舱':'SITE / 当前现场',rows:returnGuidance&&!inside?[{label:'应急气闸',value:home.distance.toFixed(1)+' m'},{label:'目标方位',value:Math.round(home.bearing)+'°'},{label:'入舱方式',value:'到 2.8 m 内按 F'}]:[{label:'最近目标',value:target.name},{label:'距离',value:target.distance.toFixed(1)+' m'},{label:'电网输出',value:p.online?'0.2 kW':'未投运'},{label:'存档',value:saveError?'无法写入本机':'自动保存'}]}],
      markers,route:[],navLabel:returnGuidance?'返舱方位指引':'现场方位导航',emergency:{id:'return-home',label:returnGuidance?'取消返舱指引':'紧急回舱 · 导航至气闸',disabled:inside||locked,reason:inside?'当前已在应急舱内':locked?'等待当前作业完成':'标记真实气闸，按 WASD 自行返回'},paused:logOverlay||!!modal||document.hidden});
    labels.find(item=>item.t.id==='door')?.el.classList.toggle('arrival-marker-return',returnGuidance&&!inside);
  }
  function nearest(){const p=astronaut.position,doorName=!suitReady()?'出舱前需完成宇航服自检':!state.delivery.landed?'先投放地面补给':'通过气闸出舱';const targets=state.environment==='inside'?[{id:'refuge',name:'检查应急储备',...REFUGE},{id:'door',name:doorName,x:0,z:0}]:[{id:'door',name:'通过气闸返回应急舱',x:0,z:6},...(state.delivery.landed?CARGO.map(c=>({...c,name:'核对 '+c.name})):[])];const power=powerTarget();if(power)targets.push(power);return targets.map(t=>({...t,distance:Math.hypot(p.x-t.x,p.z-t.z)})).sort((a,b)=>a.distance-b.distance)[0];}
  function startSupplyDrop(){if(logOverlay||modal||cycle||drop||unload||state.delivery.landed||state.environment!=='inside'||!suitReady()||!state.refuge)return;capture();drop={elapsed:0};supplyCode.textContent='GROUND DELIVERY / CARGO';$('supply-text').textContent='补给托盘下降';supplyProgress.value=0;supplyTransition.querySelector('p').textContent='自动制导 · 三组托盘依次触地';supplyTransition.hidden=false;world.setCargoDrop(0);syncPause();render();}
  function startPowerUnload(){if(logOverlay||modal||cycle||drop||unload||state.environment!=='outside'||!state.power.started||state.power.released||Math.hypot(state.player.x-POWER_CARGO.x,state.player.z-POWER_CARGO.z)>3)return;capture();unload={elapsed:0};supplyCode.textContent='GROUND HANDLING / POWER 02';$('supply-text').textContent='释放能源重件托盘';supplyProgress.value=0;supplyTransition.querySelector('p').textContent='卸货机构锁定 · 将电池 / 阵列交给拖运托盘';supplyTransition.hidden=false;world.setPowerRelease(0);syncPause();render();}
  function interact(){if(logOverlay||modal||cycle||drop||unload)return;capture();const t=nearest();if(t.distance>(t.id==='door'?2.8:3))return;if(t.id==='door'){
      if(state.environment==='inside'&&!suitReady()){suitPanel();return;}
      if(state.environment==='inside'&&!state.refuge){refuge();return;}
      if(state.environment==='inside'&&!state.delivery.landed){startSupplyDrop();return;}
      const action={type:state.environment==='inside'?'exit':'enter'};const next=applyAction(state,action);if(next.environment===state.environment)return;
      save();cycle={elapsed:0,next};syncPause();ui.querySelector('.airlock-transition').hidden=false;
    }else if(t.id==='power-device'){if(t.action==='status')powerPanel();else if(t.action==='release-power-cargo')startPowerUnload();else dispatch({type:t.action});}else if(t.id==='refuge')refuge();else cargo(CARGO.find(c=>c.id===t.id));}
  $('arrival-supply').onclick=startSupplyDrop;$('arrival-power').onclick=powerPanel;
  $('arrival-suit').onclick=suitPanel;$('arrival-inventory').onclick=inventory;$('arrival-pause').onclick=pause;$('arrival-interact').onclick=interact;$('arrival-view').onclick=changeView;
  addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;if(logOverlay||modal||drop||unload)return;if(['KeyF','KeyT','KeyI','KeyM','Escape'].includes(e.code))e.preventDefault();if(e.code==='KeyF')interact();if(e.code==='KeyT')suitPanel();if(e.code==='KeyI')inventory();if(e.code==='KeyM')navigationPanel();if(e.code==='Escape')pause();});
  addEventListener('pagehide',save);addEventListener('blur',()=>{if(!modal&&!logOverlay)pause();});document.addEventListener('visibilitychange',()=>{save();syncPause();});
  const projected=new THREE.Vector3();let lastView=astronaut.view;
  function update(dt){
    if(document.hidden||logOverlay)return;
    if(!modal&&!cycle&&!drop&&!unload){state.power=tickPower(state.power,dt);$('power-readout').textContent=`主电池 ${state.power.energy.toFixed(2)} / 60 kWh · 电缆余量 ${100-cableUsed(state.power)} m · MU-7 ${state.power.online?ROVER_CHARGER_KW+' kW':'接口未投运'}`;}
    if(drop){drop.elapsed+=dt;const p=Math.min(1,drop.elapsed/4);world.setCargoDrop(p);supplyProgress.value=p;$('supply-text').textContent=p<.32?'01 / 生命补给下降':p<.58?'02 / 能源设备下降':p<.84?'03 / 建造维修下降':'三组托盘触地确认';if(p>=1){const previous=structuredClone(state);drop=null;state=applyAction(state,{type:'land-supplies'});notifyProgress(previous);world.setCargoDrop(1);supplyTransition.hidden=true;syncPause();save();render();}}
    if(unload){unload.elapsed+=dt;const p=Math.min(1,unload.elapsed/2.4);world.setPowerRelease(p);supplyProgress.value=p;$('supply-text').textContent=p<.35?'解除运输锁':'拖运托盘移出 02 货箱';if(p>=1){unload=null;dispatch({type:'release-power-cargo'});world.setPowerRelease(1);supplyTransition.hidden=true;syncPause();save();render();}}
    if(cycle&&!modal){cycle.elapsed+=dt;const t=cycle.elapsed;world.doors(t<.7?(state.environment==='inside'?'inner':'outer'):t>2.3?(state.environment==='inside'?'outer':'inner'):'closed');$('airlock-text').textContent=t<.7?'进入气闸，关闭入口':t<2.3?'双门锁闭 · 压力循环':'压力匹配 · 开启出口';ui.querySelector('.airlock-transition progress').value=t;
      if(t>=3){const previous=structuredClone(state);state=cycle.next;cycle=null;notifyProgress(previous);if(returnGuidance&&state.environment==='inside'){returnGuidance=false;deck?.notify({title:'已返回应急舱',body:'气闸往返完成，返舱指引已结束。',source:'应急导航',kind:'success'});}world.doors('closed');restore();syncPause();ui.querySelector('.airlock-transition').hidden=true;save();render();}
    }
    if(selfTest){selfTest.elapsed+=dt;if(selfTest.elapsed>.55){selfTest.elapsed=0;const id=SUIT[selfTest.index][0];dispatch({type:'suit',id});ui.querySelector(`[data-suit="${id}"] b`).textContent='通过';selfTest.index++;if(selfTest.index===4){selfTest=null;const b=$('arrival-dialog-actions').querySelector('button');b.textContent='自检完成';}}}
    astronaut.update(dt);if(lastView!==astronaut.view){lastView=astronaut.view;render();}
    const t=nearest();$('arrival-distance').textContent=`${state.environment==='inside'?'舱内':'舱外'} · ${t.distance.toFixed(1)} m`;$('arrival-interact').textContent=t.distance<=(t.id==='door'?2.8:3)?`${t.name}  [F]`:`走近${t.id==='door'?'气闸':t.id==='refuge'?'储备终端':t.name.replace('核对 ','')}`;$('arrival-interact').disabled=t.distance>(t.id==='door'?2.8:3)||!!cycle||!!drop||!!unload;
    for(const {t,el} of labels){let x=t.x,z=t.z;if(t.id==='door'&&state.environment==='inside')z=0;const dist=Math.hypot(astronaut.position.x-x,astronaut.position.z-z);projected.set(x,world.floor(x,z)+(t.id==='door'?2.3:1.8),z).project(camera);const cargoAvailable=!CARGO.some(c=>c.id===t.id)||state.delivery.landed;const available=cargoAvailable&&(state.environment==='inside'?(t.id==='door'||t.id==='refuge'):t.id!=='refuge');el.hidden=dist<2||!available||!!modal||!!cycle||!!drop||!!unload||projected.z< -1||projected.z>1||Math.abs(projected.x)>.94||Math.abs(projected.y)>.8;if(!el.hidden){const sx=(projected.x*.5+.5)*innerWidth,sy=(-projected.y*.5+.5)*innerHeight;el.hidden=[...document.querySelectorAll('.cd-top,.cd-center,.cd-bottom,.cd-instrument:not([hidden]),.cd-toast:not([hidden])')].some(panel=>{const b=panel.getBoundingClientRect();return sx>b.left-80&&sx<b.right+80&&sy>b.top-15&&sy<b.bottom+15;});}el.style.left=(projected.x*.5+.5)*innerWidth+'px';el.style.top=(-projected.y*.5+.5)*innerHeight+'px';el.textContent=`${t.code?t.code+' / ':''}${t.name} · ${Math.round(dist)} m${state.cargo.includes(t.id)?' ✓':''}`;}
    saveTimer+=dt;if(saveTimer>2&&!modal&&!cycle&&!drop&&!unload){saveTimer=0;save();}
  }
  const powerMarker=document.createElement('div');powerMarker.className='arrival-marker';ui.querySelector('.arrival-labels').append(powerMarker);
  const baseUpdate=update;function updateWithPower(dt){if(document.hidden)return;if(logOverlay){for(const {el} of labels)el.hidden=true;powerMarker.hidden=true;updateDeck();return;}baseUpdate(dt);const t=powerTarget();powerMarker.hidden=!t||!!modal||!!cycle||!!drop||!!unload;if(t){projected.set(t.x,heightAt(t.x,t.z)+2,t.z).project(camera);powerMarker.hidden ||= projected.z< -1||projected.z>1||Math.abs(projected.x)>.95||Math.abs(projected.y)>.8;powerMarker.style.left=(projected.x*.5+.5)*innerWidth+'px';powerMarker.style.top=(-projected.y*.5+.5)*innerHeight+'px';powerMarker.textContent=`${t.name} · ${Math.round(Math.hypot(astronaut.position.x-t.x,astronaut.position.z-t.z))} m`;}deckTimer+=dt;if(deckTimer>=.1){deckTimer=0;updateDeck();}}
  deck=mountCommandDeck({onAction:commandAction,onOverlay(value){capture();logOverlay=!!value;syncPause();updateDeck();}});
  save();render();
  deck.notify({title:loaded.exists?'生存进度已恢复':'先确认物资，再走向荒原',body:$('arrival-next').textContent,source:'生存任务'});
  const api={astronaut,walking:true,active:false,update:updateWithPower,get state(){return structuredClone(state);},get cycling(){return !!cycle;},get dropping(){return !!drop;},get unloading(){return !!unload;},get paused(){return !!modal||logOverlay;},setPaused(value){if(value)pause();else if(modal)close();}};window.__SURVIVAL=api;return api;
}
