import {mountFlightInstruments} from './flight-instruments.js';
import {mountCommandDeck} from './command-deck.js';
import {mountDeckPortrait} from './deck-portrait.js';

const metres=n=>Number.isFinite(n)?Math.round(n)+' m':'未部署';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const heading=a=>((180-a*180/Math.PI)%360+360)%360;

/** Adapts live game state and existing action buttons; never owns simulation. */
export function mountMobilityDeck({read,buttons,command,setOverlay,heightAt,renderer}) {
  let snapshot, lastMission='', lastMode='', deck;
  const details=document.createElement('dialog');details.className='cd-detail';
  details.innerHTML='<header><h2></h2><button type="button">关闭 / Esc</button></header><div></div>';
  document.body.append(details);
  function close(){details.close();setOverlay(false);}
  details.querySelector('button').onclick=close;
  details.addEventListener('cancel',e=>{e.preventDefault();close();});
  function show(title,rows){
    details.querySelector('h2').textContent=title;
    const body=details.querySelector('div');body.replaceChildren();
    for(const [label,value] of rows){const p=document.createElement('p'),b=document.createElement('b');b.textContent=label+' · ';p.append(b,document.createTextNode(String(value)));body.append(p);}
    setOverlay(true);details.showModal();
  }
  function action(id,pressed){
    if(pressed===false){command(id,false);return;}
    const s=read();
    if(s.paused)return;
    if(id==='pause'){buttons.pause.click();return;}
    if(id.startsWith('inventory:')){
      const item=snapshot.inventory.find(x=>x.id===id);if(item)show(item.label,[[item.value,item.detail||'当前载荷状态']]);return;
    }
    if(id==='instruments'){
      show('仪器与操作',snapshot.instruments.flatMap(p=>[[p.title,''],...p.rows.map(r=>[r.label,r.value])]));return;
    }
    if(id==='mission'){
      if(document.querySelector('.journey-objective'))buttons.mission.click();
      else show('自由探索',[[snapshot.mission.title,snapshot.mission.body],['生存建设','首页的“检查物资，准备出舱”进入独立物资检查与接电任务。']]);return;
    }
    if(id==='time'){
      const modes=['auto','dawn','noon','dusk','night'],index=modes.indexOf(s.operations.state.environment);
      s.operations.action(modes[(index+1)%modes.length]);return;
    }
    if(id.startsWith('ops:')){s.operations.action(id.slice(4));return;}
    if(buttons[id]){if(!buttons[id].hidden&&!buttons[id].disabled)buttons[id].click();return;}
    return command(id,pressed);
  }
  // Choosing a subject repaints at once instead of waiting for the next game frame.
  deck=mountCommandDeck({onAction:action,onOverlay:setOverlay,onView:()=>update()});
  const flightInstruments=mountFlightInstruments({root:deck.root,heightAt});
  const portrait=renderer?mountDeckPortrait({renderer,host:deck.root.querySelector('.cd-portrait')}):null;
  // Portrait copies stand the operator upright with the helmet on, whatever stride or seat the live model is in.
  const standing=copy=>{copy.traverse(o=>{o.visible=true;if(o!==copy&&o.isGroup)o.rotation.set(0,0,0);});};
  function update(){
    const s=read(),{current,player:p,carrier,flyer,astronaut,operations:o,roverModel:m}=s,r=o.state;
    const stopped=Math.abs(current==='carrier'?carrier.speed:s.roverSpeed)<.4;
    const a=(id,label,key,detail,disabled=false,reason='',extra={})=>({id,label,key,detail,disabled,reason,...extra});
    const reasons={ground:carrier.loaded?'先从 ARES 卸下 MU-7':'先从 NX07 卸载运输车',refuge:s.refuge?.busy?'等待气闸循环完成':'走近气闸至 2.3 m 内',carrier:'先按空格停稳，8 m 内登车',door:'先按空格停稳',cargo:'先按空格停稳，靠近运输车操作',shipDoor:'等待四足支撑找平锁定',shipUnload:s.delivered?'ARES 已卸载':'等待当前转运完成',shipLoad:'等待当前装卸或腹舱动作完成',orbit:'离地需达到600 m，舱门和起落架须收妥',leave:'先降落并停稳',fly:'等待当前飞行阶段结束'};
    const button=(id,key)=>{const b=buttons[id];return a(id,b.textContent.replace(/ · [A-Z]$/,''),key,'',b.disabled,reasons[id]||'等待当前作业完成');};
    let actions=[],metrics=[],inventory=[],instruments=[];
    const rf=s.routeFlight,common=[a('view','切换视角','C',s.view),a('map','地形导航','M','选点 · 规划 · 自动驾驶'),a('route','航线图',null,'规划航线 · 发送游隼')];
    const routeFly=a('route-fly',rf.phase==='cruise'?'中止巡航':rf.active?'取消自动航线':'按航线飞行',null,rf.status,!rf.active&&!rf.planReady,'先打开航线图，规划并发送航线');
    if(current==='remote'){
      actions=[a('ops:arm',m?.armOut?'收回采样臂':'展开采样臂','R','展开后 WASD 调整',!stopped,'先停车'),a('ops:scan','探地雷达','G','78 m · 消耗 4% 电量',r.power<4||o.telemetry.cool>0,'电量需 ≥4%，并等待雷达冷却'),a('interact','现场勘测','E','按住 1.6 秒',false,'',{hold:true}),a('ops:drill','钻取样品','点击','4.2 秒 · 约9% 电量',!m?.armOut||r.samples.length>=6||r.power<9||!stopped,'展开机械臂、停稳，需空样品槽和 ≥9% 电量'),a('ops:panel',r.panel?'收起太阳翼':'展开太阳翼','T','日照影响实际充电'),a('brake','制动','Space','按住刹车',false,'',{hold:true}),...common,a('ops:relay','部署中继','B',`${r.relays.length}/3 · 间距95 m`,r.relays.length>=3||!stopped,'停稳且有剩余中继器'),a('ops:lamp',r.headlights?'关闭车灯':'开启车灯','F','照明计入电量'),a('ops:unload','归档样品',null,'停在 ARES 13 m 内',!carrier.ready||distance(p,carrier.position)>13||!stopped,'需靠近已部署的 ARES 并停稳'),a('ops:tc',o.telemetry.tc?'关闭牵引控制':'开启牵引控制','Y','限制驱动轮打滑',false,'',{active:o.telemetry.tc}),a('ops:hud','隐藏操作台','H','H 恢复操作台'),a('ops:right','原地扶正','X','停稳后恢复姿态',!stopped,'先停车'),a('ops:codex','探测档案','Tab','回波 · 样品 · 中继'),a('ops:photo','摄影模式','P','自由观察 / 返回跟车'),a('ops:shot','保存画面','K','导出 PNG'),a('instruments','仪器详情',null,'轮载 · 滑移 · 电力'),button('ground')];
      metrics=[{label:'电量',value:r.power.toFixed(1),unit:'%',percent:r.power,tone:r.power<25?'amber':'green'},{label:'完整度',value:r.integrity.toFixed(0),unit:'%',percent:r.integrity},{label:'速度',value:Math.abs(s.roverSpeed*3.6).toFixed(1),unit:'km/h'}];
      inventory=Array.from({length:6},(_,i)=>({id:'inventory:sample'+i,label:'样品 '+String(i+1).padStart(2,'0'),value:r.samples[i]?.type||'空槽',detail:r.samples[i]?`采集位置 X ${r.samples[i].x.toFixed(1)} / Z ${r.samples[i].z.toFixed(1)} m`:'展开采样臂后钻探；采满后返回 ARES 归档。'}));
      instruments=[{title:'GPR / 探地雷达',progress:o.telemetry.drillProgress*100,rows:[{label:'地下回波',value:r.returns.length+' 处（模拟）'},{label:'中继',value:r.relays.length+' / 3'},{label:'钻探',value:o.telemetry.drillProgress?Math.round(o.telemetry.drillProgress*100)+'%':'待机'},{label:'操作员距离',value:metres(distance(p,astronaut.position))}]},{title:'POWER / 能量平衡',rows:[{label:'电池收支',value:(r.net>=0?'+':'')+r.net.toFixed(2)+'%/s'},{label:'温度',value:r.heat.toFixed(1)+' °C'},{label:'太阳高度',value:o.environment.elevation.toFixed(1)+'°'},{label:'太阳翼',value:r.panel?'已展开':'已收拢'},...(m?.wheels||[]).map((w,i)=>({label:'轮 '+(i+1),value:`载荷 ${Math.round(w.load||0)} N / 滑移 ${(w.slipLong||0).toFixed(2)}`}))]}];
    }else if(current==='flight'){
      actions=[a('up','上升 / 起飞','E','按住 · 自动收架',flyer.landing||flyer.transferring,'等待当前飞行阶段结束',{hold:true}),a('down','下降','Q','按住 · 近地展开起落架',flyer.landing||flyer.transferring,'等待当前飞行阶段结束',{hold:true}),a('brake','主动悬停','Space','按住制动水平运动',flyer.landing||flyer.transferring,'当前阶段自动控制',{hold:true}),routeFly,button('fly','G'),button('leave','F'),button('orbit','O'),...common,a('instruments','飞行检查',null,'支撑 · 腹舱 · 入轨门槛')];
      metrics=[{label:'离地高度',value:Math.round(flyer.altitude),unit:'m',percent:flyer.altitude/600*100},{label:'地速',value:Math.abs(flyer.speed*3.6).toFixed(1),unit:'km/h'},{label:'垂直速度',value:flyer.verticalSpeed.toFixed(1),unit:'m/s'}];
      instruments=[{title:'FLIGHT / 飞行阶段',progress:flyer.altitude/600*100,rows:[{label:'阶段',value:flyer.transferring?'入轨转场':flyer.landing?'自动降落':flyer.grounded?'地面待命':'近地飞行'},{label:'入轨高度',value:Math.round(flyer.altitude)+' / 600 m'},{label:'起落架',value:flyer.asset.status},{label:'自动航线',value:rf.status}]},{title:'LANDING / 着陆检查',rows:[{label:'四足支撑',value:flyer.asset.supportReady?'已找平锁定':'尚未锁定'},{label:'腹舱',value:flyer.asset.doorClosed?'已关闭':'未收妥'},{label:'离船',value:buttons.leave.disabled?'先降落并停稳':'允许离船'},{label:'燃料遥测',value:'未接入'}]}];
    }else if(current==='carrier'){
      actions=[a('brake','行车制动','Space','按住刹车',false,'',{hold:true}),...(buttons.shipLoad.hidden?[]:[button('shipLoad')]),...common,a('auto',s.autopilot.active?'停止自动驾驶':'自动驾驶','N',s.route?'沿规划路线行驶':'先在地图规划路线',false),button('door','T'),button('cargo','L'),...(buttons.shipDoor.hidden?[]:[button('shipDoor')]),button('carrier','F'),a('instruments','车辆详情',null,'货舱 · 车体姿态')];
      metrics=[{label:'支援电池',value:r.supportPower.toFixed(1),unit:'%',percent:r.supportPower},{label:'速度',value:Math.abs(carrier.speed*3.6).toFixed(1),unit:'km/h'},{label:'横滚',value:(carrier.asset.group.rotation.z*180/Math.PI).toFixed(1),unit:'°'},{label:'俯仰',value:(carrier.asset.group.rotation.x*180/Math.PI).toFixed(1),unit:'°'}];
      instruments=[{title:'DRIVE / 地面驾驶',rows:[{label:'控制',value:s.autopilot.active?'自动驾驶':'手动驾驶'},{label:'货舱门',value:carrier.doorOpen?'开启 · 驱动锁定':'关闭'},{label:'MU-7距离',value:metres(distance(p,s.roverPoint))}]},{title:'SUPPORT / 支援系统',rows:[{label:'支援电池',value:r.supportPower.toFixed(1)+'%'},{label:'样品已归档',value:r.archived},{label:'路线',value:s.route?metres(s.route.length):'未规划'},{label:'最大坡度',value:s.route?s.route.maxSlope.toFixed(1)+'°':'—'}]}];
    }else{
      actions=[...['ground','refuge','rest','carrier','fly','shipDoor','shipUnload','shipLoad','door','cargo','overview'].filter(id=>!buttons[id].hidden).map(id=>button(id,id==='ground'?'F':undefined)),...common];
      metrics=[{label:'速度',value:astronaut.speed.toFixed(1),unit:'m/s'},{label:'生活舱',value:s.refuge?.ready?metres(distance(p,s.refuge.target())):s.refuge?'待部署':'不在本区'},{label:'ARES',value:carrier.ready?metres(distance(p,carrier.position)):'舰内'}];
      instruments=[{title:'EVA / 现场状态',rows:[{label:'环境',value:s.inRefuge?'生活舱内':'火星地表'},{label:'生命遥测',value:'未接入连续消耗'},{label:'操作方式',value:'WASD · Shift 快走'}]},{title:'VEHICLES / 载具',rows:[{label:'MU-7',value:carrier.loaded?'ARES货舱内':metres(distance(p,s.roverPoint))},{label:'NX07',value:s.shipReady?metres(distance(p,flyer.position)):'待部署'},{label:'登乘',value:'ARES 8 m / NX07 64 m'}]}];
    }
    if(current!=='remote')inventory=[
      {id:'inventory:rover',label:'MU-7',value:!s.delivered?'NX07腹舱·随ARES':carrier.loaded?'ARES货舱':'已卸至地面',detail:'无人遥控探测车，随 ARES 登场；卸下后遥控，人员不随车移动。'},
      {id:'inventory:carrier',label:'ARES 06',value:s.delivered?'已卸至地面':'NX07腹舱',detail:'地面装卸需停稳，载人登乘范围8 m。'},
      {id:'inventory:ship',label:'NX07腹舱',value:flyer.asset.doorClosed?'已收妥':'未关闭',detail:flyer.asset.status},
      {id:'inventory:refuge',label:'生活舱',value:s.refuge?.ready?'已部署':s.refuge?'等待投送':'留在首次着陆点',detail:'双门互锁气闸，靠近入口2.3 m后进入。'},
      {id:'inventory:power',label:'支援电池',value:r.supportPower.toFixed(1)+'%',detail:'MU-7近车补电实际扣减支援储量。'},
      {id:'inventory:samples',label:'探测样品',value:r.samples.length+' / 6',detail:'累计归档 '+r.archived+' 份。生存物资账本位于独立生存入口。'}];
    const objective=document.querySelector('.journey-objective'),title=objective?.querySelector('h1,h2')?.textContent||'探索与建站',body=objective?.querySelector('p:not(.journey-kicker)')?.textContent||'驾驶勘探、停稳采样、规划路线，或步行进入生活舱。',progress=objective?.querySelector('progress');
    const mission={title,body,steps:[...document.querySelectorAll('.journey-trail li')].map(el=>({label:el.textContent,done:el.classList.contains('is-done')})),progress:progress?progress.value/progress.max*100:undefined};
    const missionActions=[...document.querySelectorAll('.journey-actions button')].map(b=>({id:'mission:'+b.dataset.action,label:b.textContent,disabled:b.disabled,reason:'请完成当前任务前置条件'}));
    actions.push(...missionActions);
    // Summon row: walking operator calls a vehicle to its nearest operating distance (+0 m).
    const walking=current==='walk'&&!s.inRefuge,moving=new Set(s.summons||[]);
    // Identity card: every craft has a card whatever is being operated; the live one keeps its mode readings.
    const operator=current==='carrier'?carrier.position:current==='flight'?flyer.position:astronaut.position,away=point=>point?metres(distance(operator,point)):'—';
    const stowed=!s.delivered?'ship':carrier.ready&&carrier.loaded?'carrier':'';
    const row=(label,value)=>({label,value}),live=id=>current===id;
    const subjects=[
      {id:'walk',title:'舱外步行',subtitle:'EXTRAVEHICULAR',
        state:live('walk')?(s.inRefuge?'生活舱内':'火星地表 · 步行中'):current==='carrier'?'乘坐 ARES':current==='flight'?'乘坐 NX07':current==='remote'?'原地遥控 MU-7':'待命',
        rows:[row('生活舱',s.refuge?.ready?away(s.refuge.target()):s.refuge?'待部署':'不在本区')],control:{id:'mode:walk',label:'切换为步行'}},
      {id:'remote',title:'MU-7',subtitle:'REMOTE ROVER',
        state:stowed==='ship'?'未卸载 · 在 NX07 腹舱':stowed==='carrier'?'未卸载 · 在 ARES 货舱':live('remote')?'遥控中':moving.has('rover')?'正在赶来':'已卸至地面',tone:stowed?'amber':'',
        rows:[row('电量',r.power.toFixed(1)+' %'),row('距操作员',away(stowed==='ship'?(s.shipReady?flyer.position:null):stowed==='carrier'?carrier.position:s.roverPoint)),row('样品',r.samples.length+' / 6')],
        control:{id:'mode:remote',label:'遥控 MU-7',disabled:!!stowed,reason:stowed==='ship'?'先卸下 ARES 与 MU-7':'先从 ARES 卸下 MU-7'}},
      {id:'carrier',title:'ARES',subtitle:'SURFACE TRANSPORT',
        state:!carrier.ready?'未卸载 · 在 NX07 腹舱':live('carrier')?(s.autopilot.active?'自动驾驶中':'驾驶中'):moving.has('carrier')?'正在赶来':carrier.doorOpen?'停放 · 货舱开启':'停放 · 货舱关闭',tone:carrier.ready?'':'amber',
        rows:[row('距操作员',away(carrier.ready?carrier.position:s.shipReady?flyer.position:null)),row('支援电池',r.supportPower.toFixed(1)+' %'),row('货舱',stowed?'MU-7':'空')],
        control:{id:'mode:carrier',label:'登上 ARES',disabled:!carrier.ready,reason:'ARES 尚在 NX07 内'}},
      {id:'flight',title:'NX07',subtitle:'FLIGHT CONTROL',
        state:!s.shipReady?'尚未部署':live('flight')?(flyer.transferring?'轨道转移':flyer.landing?'自动降落':flyer.grounded?'地面待命':'近地飞行'):flyer.summoning?'正在赶来':flyer.grounded?(flyer.asset.doorClosed?'已着陆 · 腹舱关闭':'已着陆 · 腹舱未关闭'):'无人飞行中',tone:s.shipReady?'':'amber',
        rows:[row('距操作员',s.shipReady?away(flyer.position):'—'),row('载荷',!s.delivered?'ARES·MU-7':'空'),...(s.shipReady&&!flyer.grounded?[row('离地高度',Math.round(flyer.altitude)+' m')]:[])],
        control:{id:'mode:flight',label:'登上 NX07',disabled:!s.shipReady,reason:'NX07 尚未部署'}},
    ].map((x,i)=>({...x,label:['EVA','MU-7','ARES','NX07'][i],live:live(x.id),rows:live(x.id)?metrics:x.rows}));
    const summon=[
      ['rover','MU-7',!s.delivered?'随 ARES 在舰内':carrier.loaded?'在 ARES 货舱内':''],
      ['carrier','ARES',!carrier.ready?'尚在 NX07 内':carrier.doorOpen?'货舱未关闭':''],
      ['ship','NX07',!s.shipReady?'尚未部署':!flyer.asset.doorClosed?'腹舱未关闭':''],
    ].map(([kind,name,blocked])=>{const going=moving.has(kind);return {id:'summon:'+kind,label:name,state:going?'正在赶来':!walking?'步行时可召唤':blocked||'召唤到身旁',disabled:going||!walking||!!blocked,active:going};});
    snapshot={mode:current,subjects,summon,title:s.title,subtitle:s.subtitle,status:s.status,heading:heading(p.heading||0),position:p,time:o.environment.clock.text,site:s.site.name||`${s.site.lat.toFixed(2)}° / ${s.site.lon.toFixed(2)}°`,communications:current==='remote'?'本地即时遥控 · 时延未模拟':'现场任务日志',metrics,actions,inventory,instruments,mission,markers:s.landmarks.filter(x=>x.local).map(x=>({...x,label:x.name,summoning:moving.has({atlas:'carrier','eva-rover':'rover','eva-ship':'ship'}[x.id])})),route:s.route?.path||[],navLabel:s.route?s.route.target:'周边地形导航',paused:s.paused,emergency:current==='remote'?{id:'stop-remote',label:'紧急制动 · 结束遥控'}:current==='carrier'?{id:'emergency-brake',label:'紧急制动'}:current==='flight'?{id:'emergency-hover',label:'主动悬停',disabled:flyer.landing||flyer.transferring,reason:'当前阶段由自动控制接管'}:{id:'return-home',label:'紧急返舱 · 打开导航',disabled:!s.refuge?.ready||s.inRefuge,reason:s.inRefuge?'已在生活舱内':s.refuge?'生活舱尚未部署':'生活舱留在首次着陆点，不在本区'}};
    deck.update(snapshot);
    const viewed=deck.view();
    portrait?.update(viewed==='remote'?{subject:viewed,object:m?.root,key:`${!!m?.armOut}:${!!r.panel}`}
      :viewed==='carrier'?{subject:viewed,object:carrier.asset.group,key:`${carrier.doorOpen}:${carrier.loaded}`}
      :viewed==='flight'?{subject:viewed,object:flyer.asset.group,key:`${flyer.asset.doorClosed}:${flyer.asset.gearProgress>.5}`}
      :{subject:'walk',object:astronaut.root,prepare:standing});
    flightInstruments.update({active:current==='flight',position:flyer.position,heading:flyer.heading,altitude:flyer.altitude,speed:flyer.speed,verticalSpeed:flyer.verticalSpeed,grounded:flyer.grounded});
    if(lastMode!==current){lastMode=current;deck.notify({title:s.title,body:s.status,source:'控制模式'});}
    if(lastMission&&lastMission!==title+body)deck.notify({title,body,source:'任务更新'});lastMission=title+body;
  }
  return {update,notify:message=>deck.notify({title:'现场消息',body:message,source:'载具系统'})};
}
