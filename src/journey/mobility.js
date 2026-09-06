import * as THREE from 'three';
import { PLACES } from './landmarks.js';
import { planTerrainRoute, pointSegmentDistance, localToGeo, geoToLocal } from './route.js';
import { createFlyer } from './flight.js';
import { createAutopilot } from './autopilot.js';
import { createCarrier } from './carrier.js';
import { createAstronaut } from './astronaut.js';
import { findExit } from './walking.js';
import { getJourney, sceneURL, resumeScene } from './state.js';

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
export function mountMobility(options) {
  const {site,scene,camera,canvas,heightAt,getPlayer,getLandmarks=()=>[],getObstacles=()=>[],onBoard,onBlock,notify:deliver=()=>{},onOrbit}=options;
  const notice=el('div','mobility-toast');notice.setAttribute('role','status');notice.hidden=true;document.body.append(notice);let noticeTimer;
  const notify=message=>{deliver(message);if(!document.body.classList.contains('journey-mode')){notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;},4200);}};
  const autopilot=createAutopilot(notify);
  const link=el('link');link.rel='stylesheet';link.href=new URL('./mobility.css',import.meta.url).href;document.head.append(link);
  let paused=false,mapOpen=false,mode='local',selected=null,route=null,routeLine=null,routeIndex=0,lastPaint=0,pending=false,routeObstacles='';
  const obstacles=()=>getObstacles();
  const blocked=(x,z)=>obstacles().some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
  const ceilingAt=(x,z)=>heightAt(x,z)+Math.max(0,...obstacles().filter(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132)).map(o=>o.height||70));
  const rover=options.rover;
  const roverPoint=()=>rover?.position()||getPlayer();
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const walkBlocked=(x,z)=>blocked(x,z)||distance({x,z},roverPoint())<2.3||distance({x,z},flyer.position)<7.2||carrier.contains(x,z);
  const astronaut=createAstronaut({scene,camera,canvas,heightAt,blocked:walkBlocked});
  let changing=false, shipReady=false, operatorPlaced=false;
  const flyer=createFlyer({scene,camera,canvas,heightAt,blocked,ceilingAt,site,getPlayer,
    onBoard:()=>{astronaut.stop();onBoard();document.body.classList.add('is-flying');},
    onLand:()=>{},onOrbit,notify});
  const saveKey=`cosmos.carrier.v1:${options.kind}:${site.lat}:${site.lon}:${getJourney()?.startedAt||'free'}`;
  let carrierSave=null;try{carrierSave=JSON.parse(localStorage.getItem(saveKey)||'null');}catch{}
  const carrier=createCarrier({scene,camera,canvas,heightAt,blocked:(x,z)=>blocked(x,z)||(shipReady&&distance({x,z},flyer.position)<9),rover,notify,
    driveControl:(input,dt)=>driveControl(input,dt,'carrier'),
    onBoard:()=>{rover.exit();astronaut.stop();onBoard();},
    onSave:value=>{try{localStorage.setItem(saveKey,JSON.stringify(value));}catch{}}});
  addEventListener('pagehide',()=>{if(carrier.ready)carrier.save();});
  function driveControl(input,dt,vehicle='rover'){
    const m=rover.model(),forward=m?.forward;
    const p=vehicle==='carrier'?{...carrier.position,heading:carrier.heading,speed:carrier.speed}:{...roverPoint(),heading:forward?Math.atan2(forward.x,forward.z):0,speed:rover.speed()};
    return autopilot.drive(input,p,vehicle,dt,blocked);
  }
  function prepareCarrier(){
    if(carrier.ready||!rover.ready())return;
    if(carrierSave&&Number.isFinite(carrierSave.x)&&Number.isFinite(carrierSave.z)&&Number.isFinite(carrierSave.heading)&&carrier.park(carrierSave)){
      if(carrierSave.loaded===true)carrier.dock({restore:true});return;
    }
    const p=findExit(roverPoint(),32,heightAt,(x,z)=>blocked(x,z)||distance({x,z},flyer.position)<19);
    if(p&&carrier.park(p))carrier.save();
  }
  function boardCarrier(){
    if(paused||mapOpen||changing||!astronaut.active||!carrier.ready)return;
    if(distance(astronaut.position,carrier.position)>8){notify('请步行至 ATLAS 8 m 内登车。');return;}carrier.start();
  }
  function leaveCarrier(){
    if(paused||mapOpen)return;
    if(Math.abs(carrier.speed)>.4){notify('请按空格停稳，再下车。');return;}
    const p=findExit({...carrier.position,heading:carrier.heading},7,heightAt,walkBlocked);
    if(!p){notify('车旁没有安全落脚点，请驶至开阔地。');return;}
    if(carrier.leave()){astronaut.start(p);operatorPlaced=true;}
  }
  function cargoAction(){
    if(paused||mapOpen||changing||flyer.active||(!carrier.active&&(!astronaut.active||distance(astronaut.position,carrier.position)>10)))return;
    if(carrier.loaded)carrier.unload();else carrier.dock();
  }

  const toolbar=el('nav','mobility-tools');toolbar.setAttribute('aria-label','当前模式操作');
  const mapButton=el('button','','地图导航 · M'),flyButton=el('button','','登上游隼飞行器'),orbitButton=el('button','','进入火星轨道');
  orbitButton.hidden=true;toolbar.append(mapButton,flyButton,orbitButton);document.body.append(toolbar);
  const groundButton=el('button','mobility-rover','步行探索 · F');
  const viewButton=el('button','','第三人称 · C');
  const leaveButton=el('button','','离船步行 · F');
  const overviewButton=el('button','','返回建设视角');
  const carrierButton=el('button','carrier-board','登上 ATLAS · F'),doorButton=el('button','carrier-door','打开货舱'),cargoButton=el('button','carrier-cargo','装载 MU-7');
  carrierButton.onclick=()=>carrier.active?leaveCarrier():boardCarrier();doorButton.onclick=()=>{if(!paused&&!mapOpen)carrier.toggleDoor();};cargoButton.onclick=cargoAction;
  toolbar.prepend(groundButton,carrierButton,viewButton);toolbar.append(leaveButton,doorButton,cargoButton);
  const hud=el('section','vehicle-console');hud.setAttribute('aria-label','当前载具与操作');
  hud.innerHTML='<header><div><small class="console-mode"></small><h2 class="console-title"></h2></div><span class="console-state"></span></header><dl class="console-metrics"></dl><p class="console-hint"></p>';
  document.body.append(hud);const modeLabel=hud.querySelector('.console-mode'),titleLabel=hud.querySelector('.console-title'),stateLabel=hud.querySelector('.console-state'),metrics=hud.querySelector('.console-metrics'),hint=hud.querySelector('.console-hint');
  const metricNodes=Array.from({length:3},()=>{const row=el('div'),label=el('dt'),value=el('dd');row.append(label,value);metrics.append(row);return {label,value};});
  const help=el('details','console-help');help.innerHTML='<summary>操作说明</summary><p></p>';hud.append(help,toolbar);
  const taskDrawer=el('aside','console-mission');taskDrawer.setAttribute('aria-label','任务详情');
  const closeTask=el('button','console-mission-close','收起任务 ×');taskDrawer.append(closeTask);document.body.append(taskDrawer);
  const taskButton=el('button','console-task','任务详情');taskButton.setAttribute('aria-expanded','false');
  taskButton.onclick=()=>{for(const selector of ['.journey-objective','.journey-actions']){const node=document.querySelector(selector);if(node)taskDrawer.append(node);}const show=document.body.classList.toggle('show-mission');taskButton.setAttribute('aria-expanded',String(show));};
  closeTask.onclick=()=>{document.body.classList.remove('show-mission');taskButton.setAttribute('aria-expanded','false');taskButton.focus();};toolbar.append(taskButton);
  document.body.classList.add('mobility-unified');
  const autoStop=el('button','autopilot-stop','停止自动驾驶');autoStop.hidden=true;autoStop.onclick=()=>autopilot.stop('自动驾驶已取消，请手动驾驶。');toolbar.append(autoStop);
  const pauseButton=el('button','console-pause','暂停');toolbar.append(pauseButton);
  const pauseDialog=el('dialog','transport-pause');pauseDialog.innerHTML='<small>COSMOS</small><h2>探索已暂停</h2><p>继续后恢复当前操作模式。</p><button class="resume">继续探索</button><a href="../index.html">返回指挥台</a>';document.body.append(pauseDialog);
  const resume=()=>{pauseDialog.close();paused=false;onBlock(false);flyer.setPaused(false);carrier.setPaused(false);astronaut.setPaused(false);};
  pauseButton.onclick=()=>{const menu=document.querySelector('.journey-menu');if(menu){menu.click();return;}paused=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);astronaut.setPaused(true);pauseDialog.showModal();};
  pauseDialog.querySelector('.resume').onclick=resume;pauseDialog.addEventListener('cancel',e=>{e.preventDefault();resume();});
  const evaStatus=el('div','eva-status');evaStatus.hidden=true;document.body.append(evaStatus);
  async function ensureRover(){await rover?.ensure();return !!rover?.ready();}
  function prepareShip(){
    if(shipReady)return;
    const p=findExit(roverPoint(),20,heightAt,(x,z)=>blocked(x,z)||
      [[8,0],[-8,0],[0,8],[0,-8]].some(([dx,dz])=>blocked(x+dx,z+dz)));
    if(p){flyer.park(p);shipReady=true;}
  }
  async function walk(){
    if(paused||mapOpen||changing||flyer.active||carrier.active||astronaut.active)return;
    changing=true;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      prepareShip();prepareCarrier();
      // Ending remote control brakes the rover; the operator never travels with it.
      const p=operatorPlaced?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:findExit(carrier.loaded?{...carrier.position,heading:carrier.heading}:roverPoint(),carrier.loaded?7:3.5,heightAt,walkBlocked);
      if(!p){rover.exit();notify('当前没有安全的操作员站位，请换一处开阔地。');return;}
      rover.exit();astronaut.start(p);operatorPlaced=true;
      notify('已结束遥控，返回操作员位置。WASD 步行；F 遥控探测车，靠近游隼时 F 登船。');
    }finally{changing=false;}
  }
  async function boardRover(){
    if(paused||mapOpen||changing||flyer.active||carrier.active)return;
    changing=true;
    try{
      if(!await ensureRover()||paused||mapOpen)return;
      prepareShip();prepareCarrier();
      if(carrier.loaded){rover.exit();notify("MU-7 位于货舱内，请先下车卸载再连接遥控。");return;}
      if(!operatorPlaced&&!astronaut.active){
        const p=findExit(carrier.loaded?{...carrier.position,heading:carrier.heading}:roverPoint(),carrier.loaded?7:3.5,heightAt,walkBlocked);
        if(!p){rover.exit();notify('没有安全的操作员站位，无法开始遥控。');return;}
        astronaut.start(p);
      }
      if(!rover.driving())await rover.enter();
      if(rover.driving()){
        operatorPlaced=true;astronaut.standby();
        notify('MU-7 无人探测车遥控已连接。操作员留在原地；F 结束遥控，C 切换观察机位。');
      }
    }finally{changing=false;}
  }
  function leaveShip(){
    if(paused||mapOpen)return;
    const p=findExit({...flyer.position,heading:flyer.heading},8.5,heightAt,walkBlocked);
    if(!p){notify('舱门旁没有安全落脚点，请换一处开阔地降落。');return;}
    if(!flyer.leave()){notify('请先降落并停稳，再离船步行。');return;}
    document.body.classList.remove('is-flying');astronaut.start(p);operatorPlaced=true;
  }
  function boardShip(){
    if(paused||mapOpen||changing||carrier.active)return;
    if(flyer.active){flyer.land();return;}
    if(!astronaut.active){notify('请先结束遥控，再步行靠近游隼登船。');return;}
    if(!shipReady||distance(astronaut.position,flyer.position)>12){notify('请步行到游隼旁，12 m 内可登船；地图标有停泊位置。');return;}
    flyer.start();
  }
  groundButton.onclick=()=>astronaut.active?boardRover():walk();
  viewButton.onclick=()=>carrier.active?carrier.cycle():flyer.active?flyer.cycle():rover.driving()?rover.cycle?.():astronaut.cycle();leaveButton.onclick=leaveShip;
  if(options.kind==='park'){
    const builder=el('button','builder-map-toggle','建设面板');
    builder.onclick=()=>{document.body.classList.toggle('show-build-panel');};toolbar.append(builder,overviewButton);
    overviewButton.onclick=()=>{if(paused||mapOpen||flyer.active||carrier.active)return;astronaut.stop();rover.exit();options.onOverview?.();};
  }
  if (getJourney() && !document.body.classList.contains('journey-mode')) {
    const back=el('button','','返回先遣任务');back.onclick=()=>{location.href=sceneURL(resumeScene());};toolbar.append(back);
  }
  const flightStatus=el('div','flight-status');flightStatus.hidden=true;document.body.append(flightStatus);
  const guidance=el('button','mobility-guidance');guidance.hidden=true;document.body.append(guidance);
  const dialog=el('dialog','mars-map');dialog.setAttribute('aria-label','火星平面地图导航');
  dialog.innerHTML=`<header><div><span>COSMOS / NAVIGATION</span><h2>火星地图</h2></div><button class="map-close" aria-label="关闭地图">关闭 / ESC</button></header>
    <div class="map-layout"><section class="map-chart"><nav><button data-mode="local" class="active">周边地形</button><button data-mode="planet">火星全图</button><button id="map-center">定位当前位置</button></nav><canvas id="mars-map-canvas" aria-label="可点击选择目标的火星平面地图"></canvas><p class="map-legend">青色：建筑与信标 · 白色：当前位置 · 绿色：规划路线 · 棕色：地形高程</p></section>
    <aside><label for="map-search">查找地标或建筑</label><input id="map-search" placeholder="名称 / 地标 / 温室" autocomplete="off"><div class="map-place-list" role="list"></div><div class="map-destination"><h3>选择一个目的地</h3><p>点击地图或右侧地标。规划会避开过陡地面、穹顶和连廊。</p></div><label for="map-slope">允许最大坡度 <b id="map-slope-label">26°</b></label><input id="map-slope" type="range" min="12" max="32" step="2" value="26"><button id="map-plan" class="map-primary" disabled>规划驾驶路线</button><button id="map-orbit" hidden>在轨道上定位此处</button><button id="map-auto" class="map-primary" disabled>开始自动驾驶</button><p class="map-auto-hint"></p><button id="map-clear">清除导航路线</button><p class="map-result" role="status"></p></aside></div>`;
  document.body.append(dialog);
  const q=s=>dialog.querySelector(s),map=q('canvas'),ctx=map.getContext('2d'),list=q('.map-place-list'),search=q('#map-search'),result=q('.map-result');
  const worldData=globalThis.MOLA,raw=worldData?atob(worldData.b64):null;
  function mola(lat,lon){if(!raw)return 0;const x=Math.floor(((lon%360+360)%360)/360*worldData.w),y=Math.max(0,Math.min(worldData.h-1,Math.floor((90-lat)/180*worldData.h))),i=(y*worldData.w+x)*2;let h=(raw.charCodeAt(i)<<8)|raw.charCodeAt(i+1);return h&32768?h-65536:h;}
  const planet=el('canvas');planet.width=720;planet.height=360;
  const pi=planet.getContext('2d').createImageData(720,360);
  for(let y=0;y<360;y++)for(let x=0;x<720;x++){const h=mola(90-y*.5,x*.5),t=Math.max(0,Math.min(1,(h+7000)/15000)),i=(y*720+x)*4;pi.data[i]=45+t*130;pi.data[i+1]=49+t*69;pi.data[i+2]=47+t*37;pi.data[i+3]=255;}
  planet.getContext('2d').putImageData(pi,0,0);
  let chart={cx:0,cz:0,span:900},terrainImage=null;
  const catalog=()=>[
    ...(carrier.ready?[{id:"atlas",name:"ATLAS · 载人运输车",x:carrier.position.x,z:carrier.position.z,...localToGeo(carrier.position,site),local:true,type:"运输车"}]:[]),
    ...(operatorPlaced?[{id:'eva-operator',name:'操作员 · 留驻位置',x:astronaut.position.x,z:astronaut.position.z,...localToGeo(astronaut.position,site),local:true,type:'人员'}]:[]),
    {id:'eva-rover',name:'MU-7 · 无人遥控车',...roverPoint(),...localToGeo(roverPoint(),site),local:true,type:'载具'},
    ...(shipReady?[{id:'eva-ship',name:'游隼 · 停泊位置',x:flyer.position.x,z:flyer.position.z,...localToGeo(flyer.position,site),local:true,type:'飞船'}]:[]),
    ...getLandmarks().map(p=>({...p,...localToGeo(p,site),local:true})),
    ...((options.kind !== 'park' || Math.abs((getJourney()?.site.lat ?? site.lat)-site.lat) > .001 || Math.abs((getJourney()?.site.lon ?? site.lon)-site.lon) > .001) ? (getJourney()?.campuses || []).map((p,i)=>{
      const geo=localToGeo(p,getJourney().site);return {id:'saved-campus-'+i,name:p.name+' · 已建先遣站',...geo,...geoToLocal(geo,site),type:'穹顶',local:true};
    }) : []),
    ...PLACES.map(([name,english,lat,lon,rank,type])=>({id:english,name,english,lat,lon,rank,type,...geoToLocal({lat,lon},site)}))
  ];
  const player=()=>carrier.active?{x:carrier.position.x,z:carrier.position.z,heading:carrier.heading}:flyer.active?{x:flyer.position.x,z:flyer.position.z,heading:flyer.heading}:astronaut.active?{x:astronaut.position.x,z:astronaut.position.z,heading:astronaut.heading}:getPlayer();
  const loc=p=>mode==='planet'?{x:p.lon/360*map.width,y:(90-p.lat)/180*map.height}:{x:(p.x-chart.cx)/chart.span*map.height+map.width/2,y:(p.z-chart.cz)/chart.span*map.height+map.height/2};
  function center(){const p=player();chart={cx:p.x,cz:p.z,span:900};terrainImage=null;drawMap();}
  function terrain(){
    const c=el('canvas');c.width=160;c.height=160;const data=c.getContext('2d').createImageData(160,160),heights=new Float64Array(25600);let lo=Infinity,hi=-Infinity;
    for(let y=0;y<160;y++)for(let x=0;x<160;x++){const h=heightAt(chart.cx+(x/159-.5)*chart.span*map.width/map.height,chart.cz+(y/159-.5)*chart.span);heights[y*160+x]=h;lo=Math.min(lo,h);hi=Math.max(hi,h);}
    for(let y=0;y<160;y++)for(let x=0;x<160;x++){const i=y*160+x,t=(heights[i]-lo)/Math.max(25,hi-lo),shade=x&&y?Math.max(-25,Math.min(25,(heights[i-1]-heights[i]+heights[i-160]-heights[i])*2)):0;data.data[i*4]=50+t*80+shade;data.data[i*4+1]=54+t*44+shade;data.data[i*4+2]=48+t*22+shade;data.data[i*4+3]=255;}
    c.getContext('2d').putImageData(data,0,0);terrainImage=c;
  }
  function drawMap(){
    if(!mapOpen)return;
    const box=map.getBoundingClientRect();const w=Math.round(box.width),h=Math.round(box.height);if(!w||!h)return;
    if(map.width!==w||map.height!==h){map.width=w;map.height=h;terrainImage=null;}
    ctx.clearRect(0,0,w,h);
    if(mode==='planet')ctx.drawImage(planet,0,0,w,h);else{if(!terrainImage)terrain();ctx.drawImage(terrainImage,0,0,w,h);}
    ctx.lineWidth=1;ctx.strokeStyle='#d2e4dc18';ctx.fillStyle='#d2e4dcaa';ctx.font='10px ui-monospace,monospace';
    for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h*i/6);ctx.lineTo(w,h*i/6);ctx.stroke();}
    if(mode==='planet'){for(let i=0;i<6;i++)ctx.fillText(i*60+'°E',i*w/6+5,15);ctx.fillText('90°N',5,32);ctx.fillText('0°',5,h/2-5);ctx.fillText('90°S',5,h-8);}
    else{
      ctx.fillText('北 ↑',12,20);ctx.fillText(Math.round(chart.span*w/h)+' m × '+Math.round(chart.span)+' m · 滚轮缩放',12,h-12);
      for(const o of obstacles()){ctx.fillStyle='#89c5c42e';ctx.strokeStyle='#9cdddaa0';ctx.beginPath();if(o.type==='line'){const a=loc(o.a),b=loc(o.b);ctx.lineWidth=Math.max(3,(o.radius||6)*2/chart.span*h);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}else{const p=loc(o);ctx.arc(p.x,p.y,(o.radius||130)/chart.span*h,0,Math.PI*2);ctx.fill();ctx.lineWidth=1;ctx.stroke();}}
    }
    if(route){ctx.strokeStyle='#acffd4';ctx.lineWidth=2.5;ctx.beginPath();let lastX=null;route.path.forEach((p,i)=>{const s=loc({...p,...localToGeo(p,site)});if(i===0||mode==='planet'&&Math.abs(s.x-lastX)>w/2)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);lastX=s.x;});ctx.stroke();}
    const labels=[];
    for(const p of catalog()){
      const s=loc(p);if(s.x<0||s.y<0||s.x>w||s.y>h)continue;
      ctx.fillStyle=p.local?'#a7e3dd':'#ecd8b5';ctx.beginPath();ctx.arc(s.x,s.y,p===selected?5:p.local?3:2,0,Math.PI*2);ctx.fill();
      const selectedHere=selected?.id===p.id;
      if(selectedHere||!labels.some(r=>Math.abs(r.x-s.x)<85&&Math.abs(r.y-s.y)<17)) {ctx.fillStyle=selectedHere?'#fff':'#d8e6e3';ctx.font='11px -apple-system,sans-serif';ctx.fillText(p.name,s.x+7,s.y-5);labels.push(s);}
    }
    if(selected){const p=loc(selected);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(p.x-8,p.y-8,16,16);}
    const p=player(),s=loc({...p,...localToGeo(p,site)});ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.PI-(p.heading||0));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();
  }
  function refreshList(){
    const value=search.value.trim().toLowerCase();
    const all=catalog().filter(p=>(p.name+' '+(p.english||'')).toLowerCase().includes(value));
    all.sort((a,b)=>Number(!!b.local)-Number(!!a.local));
    list.replaceChildren(...all.map(p=>{const b=el('button',selected?.id===p.id?'selected':'');const n=el('span','',p.name),d=el('small','',p.local?'本地 · '+(p.type||'建筑'):Math.abs(p.lat).toFixed(1)+(p.lat<0?'°S':'°N')+' / '+p.lon.toFixed(1)+'°E');b.append(n,d);b.onclick=()=>select(p);return b;}));
    if(!all.length)list.append(el('p','','没有找到对应地标。'));
  }
  function select(p){
    selected=p;q('.map-destination h3').textContent=p.name;
    const d=Math.hypot(p.x-player().x,p.z-player().z);
    q('.map-destination p').textContent=p.approach?'导航到建筑外的巡视车接驳点；加压穹顶内部暂不能驶入。':`距当前位置 ${d<1000?Math.round(d)+' m':(d/1000).toFixed(1)+' km'}。`;
    q('#map-plan').disabled=d>6400||flyer.active;
    q('#map-orbit').hidden=d<6400;
    result.textContent=d>6400?'此目标超出本地规划范围。先搭乘游隼进入轨道定位，在目的地降落后规划驾驶路线。':flyer.active?'请先降落离船，再规划地面路线。':'';
    if(mode==='local'&&d<6400){chart={cx:(p.x+player().x)/2,cz:(p.z+player().z)/2,span:Math.max(500,d*1.6)};terrainImage=null;}
    refreshList();drawMap();
  }
  function setMode(next){mode=next;dialog.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));drawMap();}
  function close(){dialog.close();mapOpen=false;flyer.setPaused(paused);carrier.setPaused(paused);astronaut.setPaused(paused);onBlock(false);}
  function open(){if(paused)return;mapOpen=true;onBlock(true);flyer.setPaused(true);carrier.setPaused(true);astronaut.setPaused(true);dialog.showModal();center();refreshList();drawMap();}
  q('.map-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  mapButton.onclick=open;guidance.onclick=open;
  q('#map-center').onclick=center;search.oninput=refreshList;
  dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  map.onclick=e=>{const box=map.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;let near=null,best=20;for(const p of catalog()){const s=loc(p),d=Math.hypot(s.x-x,s.y-y);if(d<best){near=p;best=d;}}
    if(near)select(near);else if(mode==='local'){const p={x:chart.cx+(x-map.width/2)/map.height*chart.span,z:chart.cz+(y/map.height-.5)*chart.span};select({id:'custom',name:'自选地面位置',...p,...localToGeo(p,site)});}
    else{const p={lon:x/map.width*360,lat:90-y/map.height*180};select({id:'custom-planet',name:'自选着陆位置',...p,...geoToLocal(p,site)});}
  };
  map.addEventListener('wheel',e=>{e.preventDefault();if(mode==='local'){chart.span=THREE.MathUtils.clamp(chart.span*Math.exp(e.deltaY*.001),200,8000);terrainImage=null;drawMap();}},{passive:false});
  q('#map-slope').oninput=()=>q('#map-slope-label').textContent=q('#map-slope').value+'°';
  q('#map-auto').onclick=()=>{
    if(!route||(!carrier.active&&!rover.driving())){result.textContent='请先连接 MU-7 遥控或登上 ATLAS，再规划并启动自动驾驶。';return;}
    const vehicle=carrier.active?'carrier':'rover';
    if(route.vehicle&&route.vehicle!==vehicle||Math.hypot(player().x-route.path[0].x,player().z-route.path[0].z)>20){result.textContent='载具或起点已改变，请重新规划路线。';return;}
    if(carrier.active&&carrier.doorOpen){result.textContent='请先关闭 ATLAS 货舱。';return;}
    if(autopilot.start(route.path,carrier.active?'carrier':'rover')){close();notify('自动驾驶已启动。WASD、空格或触屏方向键可立即接管。');}
  };
  q('#map-plan').onclick=async()=>{
    if(!selected||pending)return;clearRoute();pending=true;q('#map-plan').disabled=true;result.textContent='正在检查地形坡度与建筑间隙…';await new Promise(r=>setTimeout(r,30));
    try{
      const goal=selected.approach||selected;
      const solid=obstacles();const obstacleAt=(x,z)=>solid.some(o=>o.type==='line'?pointSegmentDistance(x,z,o.a,o.b)<(o.radius||6):Math.hypot(x-o.x,z-o.z)<(o.radius||132));
      const answer=planTerrainRoute({start:player(),goal,heightAt,blocked:(x,z)=>obstacleAt(x,z)||(carrier.active&&!carrier.canTraverse(x,z)),maxSlope:Number(q('#map-slope').value)});
      if(!answer.ok){result.textContent=answer.reason;return;}
      clearRoute();route={...answer,target:selected.name,vehicle:carrier.active?'carrier':rover.driving()?'rover':null};routeIndex=0;
      routeObstacles=JSON.stringify(solid);
      routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.path.map(p=>new THREE.Vector3(p.x,heightAt(p.x,p.z)+.8,p.z))),new THREE.LineBasicMaterial({color:0xa7ffca,depthTest:false,transparent:true,opacity:.7}));routeLine.renderOrder=100;scene.add(routeLine);
      result.textContent=`已规划 ${Math.round(route.length)} m · 累计上升 ${Math.round(route.climb)} m · 最大坡度 ${route.maxSlope.toFixed(1)}°。可点击“开始自动驾驶”，或关闭地图手动驾驶。`;
      drawMap();notify('驾驶路线已生成，绿色引导线将带你到达目的地。');
    }finally{pending=false;q('#map-plan').disabled=false;}
  };
  function clearRoute(){autopilot.stop('路线已清除，自动驾驶结束。');route=null;routeIndex=0;guidance.hidden=true;if(routeLine){scene.remove(routeLine);routeLine.geometry.dispose();routeLine.material.dispose();routeLine=null;}}
  q('#map-clear').onclick=()=>{clearRoute();result.textContent='导航已清除。';drawMap();};
  q('#map-orbit').onclick=()=>{
    if(!flyer.active){result.textContent='关闭地图，登上游隼，上升至 600 m，再从这里进入轨道。';return;}
    if(flyer.altitude<600){result.textContent='飞行器尚未达到 600 m 入轨高度，请继续上升。';return;}
    const target={lat:selected.lat,lon:selected.lon,name:selected.name};close();flyer.orbit(target);
  };
  flyButton.onclick=boardShip;
  orbitButton.onclick=()=>flyer.orbit();
  addEventListener('keydown',e=>{
    if(e.repeat||e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(e.code==='KeyF'&&!paused&&!mapOpen&&!changing){
      e.preventDefault();
      if(carrier.active)leaveCarrier();
      else if(flyer.active)leaveShip();
      else if(astronaut.active){
        if(carrier.ready&&distance(astronaut.position,carrier.position)<=8)boardCarrier();
        else if(shipReady&&distance(astronaut.position,flyer.position)<=12)boardShip();
        else boardRover();
      }else walk();
    }
    if(e.code==='Escape'&&!document.querySelector('.journey-menu')&&!mapOpen&&!pauseDialog.open){e.preventDefault();pauseButton.click();}
    if(e.code==='KeyM'){e.preventDefault();mapOpen?close():open();}
  });
  addEventListener('resize',()=>drawMap());
  return {
    driveControl,get autopilot(){return autopilot;},
    get remote(){return !!rover?.driving();},get roverPosition(){return {...roverPoint()};},get active(){return flyer.active||carrier.active;},get carrier(){return carrier;},boardCarrier,leaveCarrier,boardShip,cargoAction,get walking(){return astronaut.active;},get astronaut(){return astronaut;},walk,boardRover,get blocked(){return mapOpen;},get flyer(){return flyer;},openMap:open,
    setPaused(value){paused=value;flyer.setPaused(paused||mapOpen);carrier.setPaused(paused||mapOpen);astronaut.setPaused(paused||mapOpen);},
    update(dt,now=performance.now()){
      if(autopilot.active&&((autopilot.owner==='carrier'&&!carrier.active)||(autopilot.owner==='rover'&&!rover.driving())))autopilot.stop('操作模式已切换，自动驾驶结束。');
      autoStop.hidden=!autopilot.active;
      q('.map-auto-hint').textContent=autopilot.active?'自动驾驶暂停于地图；关闭地图后继续。':!carrier.active&&!rover.driving()?'先连接 MU-7 遥控或登上 ATLAS，再启动自动驾驶。':carrier.active&&carrier.doorOpen?'关闭货舱后才能启动自动驾驶。':!route?'先选择目的地并规划路线。':'到达后自动停车；WASD / 空格可手动接管。';
      q('#map-auto').disabled=!route||autopilot.active||(!carrier.active&&!rover.driving())||carrier.active&&carrier.doorOpen;
      flyer.update(mapOpen?0:dt);carrier.update(mapOpen?0:dt);
      astronaut.update(mapOpen?0:dt);
      if(rover?.ready()){prepareShip();prepareCarrier();}
      if(now-lastPaint<150)return;lastPaint=now;
      if(route&&JSON.stringify(obstacles())!==routeObstacles){clearRoute();notify('基地布局已改变，请重新规划驾驶路线。');}
      flyButton.textContent=flyer.active?(flyer.landing?'正在垂直降落…':'垂直降落'):'登上游隼飞行器';
      flyButton.disabled=paused||mapOpen||changing||flyer.transferring||flyer.landing;
      const driving=rover?.driving();
      groundButton.textContent=astronaut.active?'遥控 MU-7':driving?'结束遥控 · F':'步行探索 · F';
      groundButton.disabled=paused||mapOpen||changing||flyer.active;
      document.body.classList.toggle('rover-driving',!!driving);
      viewButton.hidden=!astronaut.active;viewButton.textContent=astronaut.view+' · C';viewButton.disabled=paused||mapOpen;
      leaveButton.hidden=!flyer.active;leaveButton.disabled=paused||mapOpen||flyer.altitude>2.5||Math.abs(flyer.speed)>.5||flyer.landing||flyer.transferring;
      overviewButton.hidden=!astronaut.active;
      evaStatus.hidden=!astronaut.active&&!driving;
      const rd=distance(astronaut.position,roverPoint()),sd=distance(astronaut.position,flyer.position);
      evaStatus.textContent=`舱外步行 · ${astronaut.view} · ${astronaut.speed.toFixed(1)} m/s\nWASD 移动 · Shift 快走 · 拖动环视 · C 切换视角\nMU-7 ${Math.round(rd)} m · 游隼 ${shipReady?Math.round(sd)+' m':'待部署'} · ${shipReady&&sd<=12?'F 登船':'F 遥控 · M 地图'}`;
      if(driving)evaStatus.textContent=`MU-7 · 无人遥控连接中\n操作员距探测车 ${Math.round(rd)} m · F 结束遥控返回原位\nC 切换机位 · 桅杆视角为相机回传`;
      orbitButton.hidden=!flyer.active;orbitButton.disabled=flyer.altitude<600||flyer.transferring||flyer.landing;
      orbitButton.textContent=flyer.transferring?'轨道转移中…':flyer.altitude<600?'上升至 600 m 可入轨':'进入火星轨道';
      flightStatus.hidden=!flyer.active;
      flightStatus.textContent=`游隼 VTOL · 离地 ${Math.round(flyer.altitude)} m · ${Math.abs(flyer.speed*3.6).toFixed(0)} km/h\nW/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速\n拖动环视 · 滚轮调整视距`;
      const current=carrier.active?'carrier':flyer.active?'flight':driving?'remote':astronaut.active?'walk':'overview';
      document.body.dataset.mobilityMode=current;
      const nearCarrier=carrier.ready&&astronaut.active&&distance(astronaut.position,carrier.position)<=10;
      const canBoardCarrier=nearCarrier&&distance(astronaut.position,carrier.position)<=8;
      const nearShip=shipReady&&astronaut.active&&sd<=12;
      carrierButton.hidden=!(carrier.active||canBoardCarrier);carrierButton.textContent=carrier.active?'下车 · F':'登上 ATLAS · F';carrierButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      groundButton.hidden=carrier.active||flyer.active;groundButton.disabled=paused||mapOpen||changing||(astronaut.active&&carrier.loaded);
      flyButton.hidden=!flyer.active&&!nearShip;
      leaveButton.hidden=!flyer.active;
      viewButton.hidden=current==='overview';viewButton.textContent='视角 · C';
      doorButton.hidden=cargoButton.hidden=!(carrier.active||nearCarrier);
      doorButton.disabled=cargoButton.disabled=paused||mapOpen||Math.abs(carrier.speed)>.4;
      doorButton.textContent=carrier.doorOpen?'关闭货舱':'打开货舱';cargoButton.textContent=carrier.loaded?'卸载 MU-7':'装载 MU-7';
      overviewButton.hidden=!(options.kind==='park'&&astronaut.active);
      taskButton.hidden=!document.querySelector('.journey-objective');pauseButton.hidden=!!document.querySelector('.journey-menu');
      const info={
        carrier:['SURFACE TRANSPORT','ATLAS · 载人运输车',carrier.doorOpen?'货舱开启 · 驱动锁定':'地面驾驶', [['速度',(Math.abs(carrier.speed)*3.6).toFixed(0)+' km/h'],['货舱',carrier.loaded?'MU-7 已固定':'空舱'],['视角',carrier.view]],Math.abs(carrier.speed)>.4?'按空格停稳后可下车、装卸。':'货舱开启时无法行驶；关闭货舱后 W 前进。','W/S 前进倒车 · A/D 转向 · 空格制动 · C 驾驶舱/跟车 · F 下车 · 拖动环视 / 滚轮缩放'],
        flight:['FLIGHT CONTROL','游隼 · 飞行器',flyer.transferring?'轨道转移':flyer.landing?'自动降落':flyer.altitude<3?'已着陆':'飞行中', [['速度',(Math.abs(flyer.speed)*3.6).toFixed(0)+' km/h'],['离地高度',Math.round(flyer.altitude)+' m'],['视角',flyer.view]],flyer.altitude>2.5?'离船需先降落；离地 600 m 可转入轨道。':'E 垂直起飞；F 离船步行。','W/S 推进 · A/D 转向 · E/Q 升降 · 空格悬停 · Shift 加速 · C 视角 · F 离船'],
        remote:['REMOTE LINK','MU-7 · 无人探测车','遥控已连接', [['速度',(Math.abs(rover.speed())*3.6).toFixed(0)+' km/h'],['操作员距离',Math.round(rd)+' m'],['视角',rover.view?.()||'跟车']], '操作员留在原地。F 结束遥控并返回操作员。','W/S 前进倒车 · A/D 转向 · 空格制动 · C 机位 · E 勘测 · F 结束遥控'],
        walk:['EXTRAVEHICULAR','舱外步行','宇航员', [['速度',astronaut.speed.toFixed(1)+' m/s'],['运输车',carrier.ready?Math.round(distance(astronaut.position,carrier.position))+' m':'待部署'],['游隼',shipReady?Math.round(sd)+' m':'待部署']], canBoardCarrier?'F 登上 ATLAS；可在此装卸探测车。':nearCarrier?'再靠近至 8 m 内登车；当前可装卸探测车。':nearShip?'F 登上游隼。':'F 遥控 MU-7；在地图查看载具停放位置。','WASD 步行 · Shift 快走 · C 第一/第三人称 · 拖动环视 · F 交互 · M 地图'],
        overview:['EXPEDITION','火星探索','场景总览', [['探测车','MU-7'],['运输车',carrier.ready?'已部署':'待部署'],['游隼',shipReady?'已部署':'待部署']], '先步行探索，靠近载人车或飞船登乘。','F 进入步行 · M 地图导航']
      }[current];
      modeLabel.textContent=info[0];titleLabel.textContent=info[1];stateLabel.textContent=autopilot.active?'自动驾驶中':info[2];info[3].forEach(([label,value],i)=>{metricNodes[i].label.textContent=label;metricNodes[i].value.textContent=value;});hint.textContent=info[4];help.querySelector('p').textContent=info[5];
      if(route&&!flyer.active){
        const p=player();while(routeIndex<route.path.length-1&&Math.hypot(p.x-route.path[routeIndex].x,p.z-route.path[routeIndex].z)<Math.max(8,route.cell*1.6))routeIndex++;
        const t=route.path[routeIndex],d=Math.hypot(p.x-t.x,p.z-t.z),end=route.path.at(-1),done=Math.hypot(p.x-end.x,p.z-end.z)<12;
        let angle=Math.atan2(t.x-p.x,t.z-p.z)-(p.heading||0);angle=Math.atan2(Math.sin(angle),Math.cos(angle));
        guidance.hidden=false;guidance.textContent=done?`已到达 · ${route.target}`:`${Math.abs(angle)<.3?'↑':angle>0?'←':'→'} ${route.target} · 下一路点 ${Math.round(d)} m${d>Math.max(70,route.cell*5)?' · 已偏离，点击重新规划':''}`;
      }else guidance.hidden=true;
      if(mapOpen)drawMap();
    }
  };
}
