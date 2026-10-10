import { getJourney } from './state.js';
import { normalizePlayer } from './player.js';
import {expeditionRange,budgetText,budgetStatus} from './expedition-energy.js';
import {mountFlightInstruments} from './flight-instruments.js';
import {mountDriveInstruments,aresAttitude,slopeLimits,wheelLoads} from './drive-instruments.js';
import {ARES_DRIVE,ARES_FOOTPRINT} from './carrier.js';
import {ARES_SPEC} from './ares-model.js';
import {mountCommandDeck} from './command-deck.js';
import {mountDeckPortrait} from './deck-portrait.js';

const metres=n=>Number.isFinite(n)?Math.round(n)+' m':'未部署';
const far=n=>Number.isFinite(n)&&n>=1000?(n/1000).toFixed(1)+' km':metres(n);
const ARES_KMH={cruise:ARES_DRIVE.cruise*3.6,boost:ARES_DRIVE.boost*3.6},ARES_LIMITS=slopeLimits(ARES_FOOTPRINT);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const heading=a=>((180-a*180/Math.PI)%360+360)%360;

/** Adapts live game state and existing action buttons; never owns simulation. */
import {SHIP_BOARD} from './landing-support.js';

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
  deck=mountCommandDeck({extraModes:read().light?[["light","L04"]]:[],onAction:action,onOverlay:setOverlay,onView:()=>update()});
  const flightInstruments=mountFlightInstruments({root:deck.root,heightAt});
  const driveInstruments=mountDriveInstruments({root:deck.root,cruise:ARES_KMH.cruise,boost:ARES_KMH.boost,limits:ARES_LIMITS,suspension:ARES_SPEC.suspension});
  const portrait=renderer?mountDeckPortrait({renderer,host:deck.root.querySelector('.cd-portrait')}):null;
  // Portrait copies stand the operator upright with the helmet on, whatever stride or seat the live model is in.
  function update(){
    const s=read(),{current,player:p,carrier,flyer,astronaut,operations:o,roverModel:m}=s,r=o.state;
    const stopped=Math.abs(current==='carrier'?carrier.speed:s.roverSpeed)<.4;
    const a=(id,label,key,detail,disabled=false,reason='',extra={})=>({id,label,key,detail,disabled,reason,...extra});
    const reasons={ground:carrier.loaded?'先从 ARES 卸下 MU-7':'先从 NX07 卸载运输车',refuge:s.refuge?.busy?'等待气闸循环完成':'走近气闸至 2.6 m 内',station:'走近舱内设备',carrier:'先按空格停稳，8 m 内登车',cargo:'先按空格停稳，靠近运输车操作',shipDoor:'等待四足支撑找平锁定',crewRide:'等待平台到位',port2:'等待四足支撑找平锁定',port3:'等待四足支撑找平锁定',port4:'等待四足支撑找平锁定',port5:'等待四足支撑找平锁定',shipUnload:s.delivered?'ARES 已卸载':'等待当前转运完成',shipLoad:'等待当前装卸或腹舱动作完成',orbit:'离地需达到600 m，舱门和起落架须收妥',leave:'先降落并停稳',fly:'等待当前飞行阶段结束'};
    const button=(id,key)=>{const b=buttons[id];return a(id,b.textContent.replace(/ · [A-Z]$/,''),key,'',b.disabled,reasons[id]||'等待当前作业完成');};
    let actions=[],metrics=[],inventory=[],instruments=[];
    const ports=['shipDoor','port2','port3','port4','port5'],open=flyer.asset.openPorts,portsText=open.length?open.join('、')+' 号开启':'全部关闭';
    const rf=s.routeFlight,common=[a('view','切换视角','C',s.view),a('map','地形导航','M','选点 · 规划 · 自动驾驶'),a('route','航线图',null,'规划航线 · 发送游隼')];
    const routeFly=a('route-fly',rf.phase==='cruise'?'中止巡航':rf.active?'取消自动航线':'按航线飞行',null,rf.status,!rf.active&&!rf.planReady,'先打开航线图，规划并发送航线');
    if(current==='light'){
      const c=s.light.car,att=aresAttitude(c.asset.group.rotation),loads=wheelLoads(c.travel,c.spec.suspension);actions=[a('light-leave','下车','F','先按空格停稳'),a('light-recover','回收L04',null,'驶入4号平台青框'),...common,a('instruments','L04详情',null,'四轮悬挂 · 试验范围')];
      metrics=[{label:'车速',value:Math.abs(c.speed*3.6).toFixed(1),unit:'km/h',percent:Math.abs(c.speed)/ARES_DRIVE.boost*100,bar:`驱动 DRIVE · ${(Math.abs(c.speed)*3.6).toFixed(0)} km/h · 四轮电驱`},{label:'收放平台',value:'4号 · 最小舱口'},{label:'电量',value:'自由探索未启用'}];
      instruments=[{title:'ARES L04 / 四轮封闭车',rows:[{label:'外廓',value:'长8.52 × 宽5.90 × 高5.41 m（含天线）'},{label:'轮组',value:c.travel.length+'个独立驱动轮'},{label:'轮荷',value:loads?.summary||'—'},{label:'侧倾',value:att?att.roll.toFixed(1)+'°':'—'},{label:'俯仰',value:att?att.pitch.toFixed(1)+'°':'—'},{label:'回收',value:'驶入青框自动制动、对中、转正、升台关门'},{label:'用途',value:'侦察/医疗/植物内装待设计'},{label:'边界',value:'自由探索试验，独立能源与任务账本未接入'}]}];
    }else if(current==='remote'){
      actions=[a('ops:arm',m?.armOut?'收回采样臂':'展开采样臂','R','展开后 WASD 调整',!stopped,'先停车'),a('ops:scan','探地雷达','G','78 m · 消耗 4% 电量',r.power<4||o.telemetry.cool>0,'电量需 ≥4%，并等待雷达冷却'),a('interact','现场勘测','E','按住 1.6 秒',false,'',{hold:true}),a('ops:drill','钻取样品','点击','4.2 秒 · 约9% 电量',!m?.armOut||r.samples.length>=6||r.power<9||!stopped,'展开机械臂、停稳，需空样品槽和 ≥9% 电量'),a('ops:panel',r.panel?'收起太阳翼':'展开太阳翼','T','日照影响实际充电'),a('brake','制动','Space','按住刹车',false,'',{hold:true}),...common,a('ops:relay','部署中继','B',`${r.relays.length}/3 · 间距95 m`,r.relays.length>=3||!stopped,'停稳且有剩余中继器'),a('ops:lamp',r.headlights?'关闭车灯':'开启车灯','F','照明计入电量'),a('ops:unload','归档样品',null,'停在 ARES 13 m 内',!carrier.ready||distance(p,carrier.position)>13||!stopped,'需靠近已部署的 ARES 并停稳'),a('ops:tc',o.telemetry.tc?'关闭牵引控制':'开启牵引控制','Y','限制驱动轮打滑',false,'',{active:o.telemetry.tc}),a('ops:hud','隐藏操作台','H','H 恢复操作台'),a('ops:right','原地扶正','X','停稳后恢复姿态',!stopped,'先停车'),a('ops:codex','探测档案','Tab','回波 · 样品 · 中继'),a('ops:photo','摄影模式','P','自由观察 / 返回跟车'),a('ops:shot','保存画面','K','导出 PNG'),a('instruments','仪器详情',null,'轮载 · 滑移 · 电力'),button('ground')];
      metrics=[{label:'电量',value:r.power.toFixed(1),unit:'%',percent:r.power,tone:r.power<25?'amber':'green'},{label:'完整度',value:r.integrity.toFixed(0),unit:'%',percent:r.integrity},{label:'速度',value:Math.abs(s.roverSpeed*3.6).toFixed(1),unit:'km/h'}];
      inventory=Array.from({length:6},(_,i)=>({id:'inventory:sample'+i,label:'样品 '+String(i+1).padStart(2,'0'),value:r.samples[i]?.type||'空槽',detail:r.samples[i]?`采集位置 X ${r.samples[i].x.toFixed(1)} / Z ${r.samples[i].z.toFixed(1)} m`:'展开采样臂后钻探；采满后返回 ARES 归档。'}));
      instruments=[{title:'GPR / 探地雷达',progress:o.telemetry.drillProgress*100,rows:[{label:'地下回波',value:r.returns.length+' 处（模拟）'},{label:'中继',value:r.relays.length+' / 3'},{label:'钻探',value:o.telemetry.drillProgress?Math.round(o.telemetry.drillProgress*100)+'%':'待机'},{label:'操作员距离',value:metres(distance(p,astronaut.position))}]},{title:'POWER / 能量平衡',rows:[{label:'电池收支',value:(r.net>=0?'+':'')+r.net.toFixed(2)+'%/s'},{label:'温度',value:r.heat.toFixed(1)+' °C'},{label:'太阳高度',value:o.environment.elevation.toFixed(1)+'°'},{label:'太阳翼',value:r.panel?'已展开':'已收拢'},...(m?.wheels||[]).map((w,i)=>({label:'轮 '+(i+1),value:`载荷 ${Math.round(w.load||0)} N / 滑移 ${(w.slipLong||0).toFixed(2)}`}))]}];
    }else if(current==='flight'){
      actions=[a('up','上升 / 起飞','E','按住 · 自动收架',flyer.landing||flyer.transferring||carrier.shipConnected,carrier.shipConnected?'先断开NX07 → ARES供电连接':'等待当前飞行阶段结束',{hold:true}),a('down','下降','Q','按住 · 近地展开起落架',flyer.landing||flyer.transferring,'等待当前飞行阶段结束',{hold:true}),a('brake','主动悬停','Space','按住制动水平运动',flyer.landing||flyer.transferring,'当前阶段自动控制',{hold:true}),routeFly,button('fly','G'),button('leave','F'),button('orbit','O'),...ports.filter(id=>!buttons[id].hidden).map(id=>button(id)),...common,a('instruments','飞行检查',null,'支撑 · 腹舱 · 入轨门槛')];
      metrics=[{label:'离地高度',value:Math.round(flyer.altitude),unit:'m',percent:flyer.altitude/600*100},{label:'地速',value:Math.abs(flyer.speed*3.6).toFixed(1),unit:'km/h'},{label:'垂直速度',value:flyer.verticalSpeed.toFixed(1),unit:'m/s'}];
      instruments=[{title:'FLIGHT / 飞行阶段',progress:flyer.altitude/600*100,rows:[{label:'阶段',value:flyer.transferring?'入轨转场':flyer.landing?'自动降落':flyer.grounded?'地面待命':'近地飞行'},{label:'入轨高度',value:Math.round(flyer.altitude)+' / 600 m'},{label:'起落架',value:flyer.asset.status},{label:'自动航线',value:rf.status}]},{title:'LANDING / 着陆检查',rows:[{label:'四足支撑',value:flyer.asset.supportReady?'已找平锁定':'尚未锁定'},{label:'舱口',value:flyer.asset.doorClosed?'全部关闭':portsText},{label:'离船',value:buttons.leave.disabled?'先降落并停稳':'允许离船'},{label:'推进剂',value:'化学起降路线；消耗尚未接入'}]}];
    }else if(current==='carrier'){
      actions=[...(carrier.drivePower?[a('charge-carrier',carrier.charging?'断开充电':'营地充电',null,carrier.charging?(carrier.chargingSource==='ship'?'NX07 → ARES供电':'营地 → ARES供电'):'停在配电箱14米内',!carrier.charging&&!carrier.chargeReady,carrier.chargeStatus('camp').reason),...(!carrier.charging?[a('charge-ship','连接船电',null,'NX07落稳 · 90 m内',!carrier.chargeStatus('ship').ready,carrier.chargeStatus('ship').reason)]:[])]:[]),a('brake','行车制动','Space','按住刹车',false,'',{hold:true}),...(buttons.shipLoad.hidden?[]:[button('shipLoad')]),...common,a('auto',s.autopilot.active?'停止自动驾驶':'自动驾驶','N',s.route?'沿规划路线行驶':'先在地图规划路线',false),button('cargo','L'),...(buttons.shipDoor.hidden?[]:[button('shipDoor')]),button('carrier','F'),a('instruments','车辆详情',null,'货舱 · 车体姿态')];
      // Card rows and the two bars share these; attitude and speed dials read the carrier directly.
      const kmh=Math.abs(carrier.speed*3.6),gap=carrier.loaded?null:distance(carrier.position,s.roverPoint),att=aresAttitude(carrier.asset.group.rotation),loads=wheelLoads(carrier.travel,ARES_SPEC.suspension);
      // Same rule as rover-operations: MU-7 parked (<0.55 m/s) within 13 m draws from the support battery.
      const charging=gap!==null&&gap<13&&Math.abs(s.roverSpeed)<.55&&r.supportPower>0&&r.power<100;
      metrics=[{label:'车速',value:kmh.toFixed(0),unit:'km/h',percent:kmh/ARES_KMH.boost*100,bar:`驱动 DRIVE · ${kmh.toFixed(0)} / ${Math.round(ARES_KMH.cruise)} km/h · Shift 至 ${Math.round(ARES_KMH.boost)}`},
        carrier.drivePower?{label:'驾驶电池',value:carrier.drivePower.energy.toFixed(1),unit:'kWh',percent:carrier.drivePower.energy/30*100,tone:carrier.drivePower.energy<6?'amber':'green',bar:`驾驶电池 · ${carrier.drivePower.energy.toFixed(1)} / 30 kWh · ${carrier.charging?(carrier.chargingSource==='ship'?'NX07供电中':'营地充电中'):'电池电驱 · 营地 / NX07补电'}`}:{label:'支援电池',value:r.supportPower.toFixed(1),unit:'%',percent:r.supportPower,bar:`支援电池 · ${r.supportPower.toFixed(0)}%`},
        {label:'距 MU-7',value:gap===null?'货舱内':far(gap)},{label:'距 NX07',value:s.shipReady?far(distance(carrier.position,flyer.position)):'未部署'}];
      instruments=[{title:'DRIVE / 地面驾驶',rows:[{label:'控制',value:s.autopilot.active?'自动驾驶':'手动驾驶'},{label:'侧倾',value:att?`${Math.abs(att.roll).toFixed(1)}° ${att.roll>=0?'右低':'左低'}`:'—'},{label:'俯仰',value:att?`${Math.abs(att.pitch).toFixed(1)}° ${att.pitch>=0?'抬头':'低头'}`:'—'},{label:'通行上限',value:`侧倾 ${Math.round(ARES_LIMITS.roll)}° / 俯仰 ${Math.round(ARES_LIMITS.pitch)}°`},{label:'轮荷',value:loads?loads.summary:'—'},{label:'货舱',value:carrier.manifest.label},{label:'货物质量',value:carrier.manifest.massKg===null?'MU-7质量待标定':carrier.manifest.massKg+' / 250 kg（教学货位）'},{label:'货位净空',value:'2.50 × 3.09 × 4.17 m'},{label:'驾驶电池',value:carrier.drivePower?carrier.drivePower.energy.toFixed(2)+' / 30 kWh':'自由探索未启用'},{label:'动力来源',value:'电池电驱；车载裂变增程为后续升级'}, {label:'当前供电连接',value:carrier.charging?(carrier.chargingSource==='ship'?'NX07 → ARES · 6 kW':'营地 → ARES · 6 kW'):'未连接'}, {label:'能源往返路程估算',value:carrier.drivePower?expeditionRange(carrier.drivePower.energy,carrier.manifest.massKg).toFixed(1)+' km单程等效路长；返程按250 kg，非地理半径':'未启用'}, {label:'路线电量提示',value:budgetStatus(s.route?.budget,carrier.drivePower?.energy)}, {label:'任务预算',value:budgetText(s.route?.budget)}, {label:'估算边界',value:'含作业0.5 kWh、应急2 kWh及20%行驶余量；坡地/热控待标定'}, {label:'驾驶累计耗电',value:carrier.drivePower?carrier.drivePower.usedKWh.toFixed(3)+' kWh':'—'},{label:'运输参数',value:'教学预算；吊装动画与工程标定待补'},{label:'MU-7距离',value:gap===null?'货舱内':metres(gap)}]},{title:'SUPPORT / 支援系统',rows:[{label:'支援电池',value:r.supportPower.toFixed(1)+'%'},{label:'样品已归档',value:r.archived},{label:'路线',value:s.route?metres(s.route.length):'未规划'},{label:'最大坡度',value:s.route?s.route.maxSlope.toFixed(1)+'°':'—'}]}];
    }else{
      // Standing on a lowered crew deck, F rides it up; otherwise F stays on remote control.
      const onDeck=!buttons.crewRide.hidden;
      actions=[...['crewRide','ground','refuge','station','rest','carrier','fly',...ports,'shipUnload','shipLoad','cargo','overview'].filter(id=>!buttons[id].hidden).map(id=>button(id,id==='crewRide'||id==='ground'&&!onDeck?'F':undefined)),...common];
      metrics=[{label:'速度',value:astronaut.speed.toFixed(1),unit:'m/s'},{label:'生活舱',value:s.refuge?.ready?metres(distance(p,s.refuge.target())):s.refuge?'待部署':'不在本区'},{label:'ARES',value:carrier.ready?metres(distance(p,carrier.position)):'舰内'}];
      instruments=[{title:'EVA / 现场状态',rows:[{label:'环境',value:s.inRefuge?'生活舱内':'火星地表'},{label:'生命遥测',value:'未接入连续消耗'},{label:'操作方式',value:'WASD · Shift 跑 · 空格跳 · Z 蹲'}]},{title:'VEHICLES / 载具',rows:[{label:'MU-7',value:carrier.loaded?'ARES货舱内':metres(distance(p,s.roverPoint))},{label:'NX07',value:s.shipReady?metres(distance(p,flyer.position)):'待部署'},...(s.light?[{label:'L04',value:s.light.car.ready?metres(distance(p,s.light.car.position)):'4号舱内'}]:[]),{label:'登乘',value:`ARES${s.light?' / L04':''} 8 m / NX07 ${Math.round(SHIP_BOARD)} m`}]}];
    }
    if(s.shipPower){
      if(carrier.shipConnected&&current!=='carrier')actions.unshift(a('disconnect-power','断开船车供电',null,'断开后允许NX07起飞'));
      actions.push(a('ship-reactor',s.shipPower.reactor?'停船载核电':'启船载核电',null,'船载电源 · 地面操作',!s.shipReady||!flyer.grounded||!(current==='flight'||current==='carrier'&&distance(carrier.position,flyer.position)<=90||current==='walk'&&!s.inRefuge&&distance(p,flyer.position)<=90),'需在落稳的NX07附近操作'));
      instruments.push({title:'NX07 / 远征供电',rows:[
        {label:'能源配置',value:'裂变供电＋船载电池；先进工程外推'},
        {label:'船载电池',value:s.shipPower.energy.toFixed(2)+' / 120 kWh'+(s.shipPower.energy<=0?' · 已耗尽，不能出发':s.shipPower.energy<=24?' · 仅剩船内储备':'')},
        {label:'核电状态',value:s.shipPower.reactor?'在线 · 10 kW教学输出':'停机 · 使用电池'},
        {label:'基础用电',value:'1 kW · 飞船设备'},
        {label:'对外供电',value:carrier.shipConnected?'NX07 → ARES · 6 kW车端 / 90%效率':'未连接'},
        {label:'保护储备',value:'24 kWh；到达底线停止对外供电'},
        {label:'累计发电 / 输出',value:s.shipPower.generatedKWh.toFixed(2)+' / '+s.shipPower.exportedKWh.toFixed(2)+' kWh'},
        {label:'推进分工',value:'化学起降；太空电推进待设计，当前飞行不扣推进剂'},
        {label:'模拟边界',value:'核燃料寿命、散热与辐射未模拟；120秒/模拟小时，无离线结算'}
      ]});
      if(current==='flight')metrics.push({label:'船载电池',value:s.shipPower.energy.toFixed(1),unit:'kWh',percent:s.shipPower.energy/120*100,bar:`船电 · ${s.shipPower.energy.toFixed(1)} / 120 kWh · ${carrier.shipConnected?'船车供电已连接':s.shipPower.reactor?'核电在线':'核电停机'}`});
    }
    if(current!=='remote')inventory=[
      ...(s.light?[{id:'inventory:light',label:'ARES L04',value:s.light.phase==='stowed'?'4号舱内':'地面/收放中',detail:'四轮封闭车；最小4号平台收放试验，专业内装与独立能源未接入。'}]:[]),
      {id:'inventory:rover',label:'MU-7',value:!s.delivered?'NX07腹舱·随ARES':carrier.loaded?'ARES货舱':'已卸至地面',detail:'无人遥控探测车，随 ARES 登场；卸下后遥控，人员不随车移动。'},
      {id:'inventory:carrier',label:'ARES 06',value:s.delivered?'已卸至地面':'NX07腹舱',detail:'地面装卸需停稳，载人登乘范围8 m。'},
      {id:'inventory:ship',label:'NX07舱口',value:flyer.asset.doorClosed?'全部关闭':portsText,detail:'1 号为 ARES 主货舱；2–5 号为人员升降平台，走上放下的平台按 F 即登船。'+flyer.asset.status},
      {id:'inventory:refuge',label:'生活舱',value:s.refuge?.ready?'已部署':s.refuge?'等待投送':'留在首次着陆点',detail:'双门互锁气闸，靠近入口2.3 m后进入。'},
      {id:'inventory:power',label:'支援电池',value:r.supportPower.toFixed(1)+'%',detail:'MU-7近车补电实际扣减支援储量。'},
      {id:'inventory:samples',label:'探测样品',value:r.samples.length+' / 6',detail:'累计归档 '+r.archived+' 份。生存物资账本位于独立生存入口。'}];
    const objective=document.querySelector('.journey-objective'),title=objective?.querySelector('h1,h2')?.textContent||'探索与建站',body=objective?.querySelector('p:not(.journey-kicker)')?.textContent||'驾驶勘探、停稳采样、规划路线，或步行进入生活舱。',progress=objective?.querySelector('progress');
    const mission={title,body,steps:[...document.querySelectorAll('.journey-trail li')].map(el=>({label:el.textContent,done:el.classList.contains('is-done')})),progress:progress?progress.value/progress.max*100:undefined};
    const missionActions=[...document.querySelectorAll('.journey-actions button')].map(b=>({id:'mission:'+b.dataset.action,label:b.textContent,disabled:b.disabled,reason:'请完成当前任务前置条件'}));
    actions.unshift(a('support','请求支援',null,'申请设备 · 查看定位 · NX07接应'));
    if(s.optionalRelics)actions.unshift(a('optional-relics','可选遗迹',null,'五处任选 · 不阻挡主线'));
    actions.push(...missionActions);
    // Summon row: walking operator calls a vehicle to its nearest operating distance (+0 m).
    const walking=current==='walk'&&!s.inRefuge,moving=new Set(s.summons||[]);
    // Identity card: every craft has a card whatever is being operated; the live one keeps its mode readings.
    const operator=current==='light'?s.light.car.position:current==='carrier'?carrier.position:current==='flight'?flyer.position:astronaut.position,away=point=>point?metres(distance(operator,point)):'—';
    const stowed=!s.delivered?'ship':carrier.ready&&carrier.loaded?'carrier':'';
    const row=(label,value)=>({label,value}),live=id=>current===id;
    const subjects=[
      ...(s.light?[{id:'light',title:'ARES L04',subtitle:'四轮封闭任务车',state:s.light.active?'驾驶中':s.light.phase==='stowed'?'4号舱内':'地面停放',rows:[row('最小舱口','4号'),row('操作','使用左侧L04收放面板')],control:{id:'light-leave',label:'下车',disabled:!s.light.active,reason:'靠近后用L04面板登车'}}]:[]),
      {id:'walk',title:normalizePlayer(getJourney()?.player).displayName,subtitle:'EVA · 指挥官 / 地质',
        state:current==='light'?'乘坐 L04':live('walk')?(s.inRefuge?'生活舱内':'火星地表 · 步行中'):current==='carrier'?'乘坐 ARES':current==='flight'?'乘坐 NX07':current==='remote'?'原地遥控 MU-7':'待命',
        rows:[row('生活舱',s.refuge?.ready?away(s.refuge.target()):s.refuge?'待部署':'不在本区')],control:{id:'mode:walk',label:'切换为步行'}},
      {id:'remote',title:'MU-7',subtitle:'REMOTE ROVER',
        state:stowed==='ship'?'未卸载 · 在 NX07 腹舱':stowed==='carrier'?'未卸载 · 在 ARES 货舱':live('remote')?'遥控中':moving.has('rover')?'正在赶来':'已卸至地面',tone:stowed?'amber':'',
        rows:[row('电量',r.power.toFixed(1)+' %'),row('距操作员',away(stowed==='ship'?(s.shipReady?flyer.position:null):stowed==='carrier'?carrier.position:s.roverPoint)),row('样品',r.samples.length+' / 6')],
        control:{id:'mode:remote',label:'遥控 MU-7',disabled:!!stowed,reason:stowed==='ship'?'先卸下 ARES 与 MU-7':'先从 ARES 卸下 MU-7'}},
      {id:'carrier',title:'ARES',subtitle:'SURFACE TRANSPORT',
        state:!carrier.ready?'未卸载 · 在 NX07 腹舱':live('carrier')?(s.autopilot.active?'自动驾驶中':'驾驶中'):moving.has('carrier')?'正在赶来':'停放',tone:carrier.ready?'':'amber',
        rows:[row('距操作员',away(carrier.ready?carrier.position:s.shipReady?flyer.position:null)),row('支援电池',r.supportPower.toFixed(1)+' %'),row('货舱',carrier.manifest.label)],
        control:{id:'mode:carrier',label:'登上 ARES',disabled:!carrier.ready,reason:'ARES 尚在 NX07 内'}},
      {id:'flight',title:'NX07',subtitle:'FLIGHT CONTROL',
        state:!s.shipReady?'尚未部署':live('flight')?(flyer.transferring?'轨道转移':flyer.landing?'自动降落':flyer.grounded?'地面待命':'近地飞行'):flyer.summoning?'正在赶来':flyer.grounded?(flyer.asset.doorClosed?'已着陆 · 腹舱关闭':'已着陆 · 腹舱未关闭'):'无人飞行中',tone:s.shipReady?'':'amber',
        rows:[row('距操作员',s.shipReady?away(flyer.position):'—'),...(s.shipPower?[row('船电',s.shipPower.energy.toFixed(1)+' / 120 kWh'),row('供电',carrier.shipConnected?'ARES连接中':s.shipPower.reactor?'核电在线':'核电停机')]:[]),row('载荷',!s.delivered?'ARES·MU-7':'空'),...(s.shipReady&&!flyer.grounded?[row('离地高度',Math.round(flyer.altitude)+' m')]:[])],
        control:{id:'mode:flight',label:'登上 NX07',disabled:!s.shipReady,reason:'NX07 尚未部署'}},
    ].map((x,i)=>({...x,label:({walk:'EVA',remote:'MU-7',carrier:'ARES',flight:'NX07',light:'L04'})[x.id],live:live(x.id),rows:live(x.id)?metrics:x.rows}));
    const summon=[
      ['rover','MU-7',!s.delivered?'随 ARES 在舰内':carrier.loaded?'在 ARES 货舱内':''],
      ['carrier','ARES',!carrier.ready?'尚在 NX07 内':''],
      ['ship','NX07',!s.shipReady?'尚未部署':!flyer.asset.doorClosed?'舱口未关闭':''],
    ].map(([kind,name,blocked])=>{const going=moving.has(kind);return {id:'summon:'+kind,label:name,state:going?'正在赶来':!walking?'步行时可召唤':blocked||'召唤到身旁',disabled:going||!walking||!!blocked,active:going};});
    snapshot={mode:current,subjects,summon,title:s.title,subtitle:s.subtitle,status:s.status,heading:heading(p.heading||0),position:p,time:o.environment.clock.text,site:s.site.name||`${s.site.lat.toFixed(2)}° / ${s.site.lon.toFixed(2)}°`,communications:current==='remote'?'本地即时遥控 · 时延未模拟':'现场任务日志',metrics,actions,inventory,instruments,mission,markers:s.landmarks.filter(x=>x.local).map(x=>({...x,label:x.name,summoning:moving.has({atlas:'carrier','eva-rover':'rover','eva-ship':'ship'}[x.id])})),route:s.route?.path||[],navLabel:s.route?s.route.target:'周边地形导航',paused:s.paused,holdStatus:s.holdStatus,emergency:current==='light'?{id:'light-brake',label:'紧急制动'}:current==='remote'?{id:'stop-remote',label:'紧急制动 · 结束遥控'}:current==='carrier'?{id:'emergency-brake',label:'紧急制动'}:current==='flight'?{id:'emergency-hover',label:'主动悬停',disabled:flyer.landing||flyer.transferring,reason:'当前阶段由自动控制接管'}:(!s.refuge?{id:'return-home',label:'返回首次着陆点 · 航线图'}:{id:'return-home',label:'紧急返舱 · 打开导航',disabled:!s.refuge.ready||s.inRefuge,reason:s.inRefuge?'已在生活舱内':'生活舱尚未部署'})};
    deck.update(snapshot);
    const viewed=deck.view();
    portrait?.update(viewed==='light'?{subject:'carrier',object:s.light.car.asset.group,key:'light'}:viewed==='remote'?{subject:viewed,object:m?.root,key:`${!!m?.armOut}:${!!r.panel}`}
      :viewed==='carrier'?{subject:viewed,object:carrier.asset.group,key:`${carrier.loaded}`}
      :viewed==='flight'?{subject:viewed,object:flyer.asset.group,key:`${flyer.asset.doorClosed}:${flyer.asset.gearProgress>.5}`}
      :{subject:'walk',object:astronaut.portrait});
    const driving=current==='light'?s.light.car:carrier;
    driveInstruments.update({active:current==='carrier'||current==='light',rotation:driving.asset.group.rotation,speed:driving.speed,travel:driving.travel,suspension:driving.spec.suspension,limits:slopeLimits(driving.footprint),vehicleName:current==='light'?'ARES L04':'ARES 06',autopilot:current==='carrier'&&s.autopilot.active});
    flightInstruments.update({active:current==='flight',position:flyer.position,heading:flyer.heading,altitude:flyer.altitude,speed:flyer.speed,verticalSpeed:flyer.verticalSpeed,grounded:flyer.grounded});
    if(lastMode!==current){lastMode=current;deck.notify({title:s.title,body:s.status,source:'控制模式'});}
    if(lastMission&&lastMission!==title+body)deck.notify({title,body,source:'任务更新'});lastMission=title+body;
  }
  return {update,notify:message=>deck.notify({title:'现场消息',body:message,source:'载具系统'})};
}
