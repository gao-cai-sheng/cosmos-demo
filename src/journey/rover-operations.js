import {createMarsEnvironment} from './mars-environment.js';
import {createRoverTelemetry} from './rover-telemetry.js';
import {createTyreTracks} from './tyre-tracks.js';
import * as THREE from 'three';
import {clamp,powerStep,restoreRoverOps,serviceHome,serviceGridHome} from './rover-power.js';
import {createSurvivalGrid} from './survival-grid.js';

// Shared by the Mars surface and settlement. Original mechanics: moon-rover (MIT).
export function createRoverOperations({scene,canvas,heightAt,dust,audio,rover,enabled,loaded,saveKey,notify,stopAuto,photo,openMap,findHome,morningStart=false,holdDay=false,onSample=()=>{},onArchive=()=>{},getGrid}) {
  let saved;try{saved=JSON.parse(localStorage.getItem(saveKey)||'null');}catch{}
  const state=restoreRoverOps(saved),grid=createSurvivalGrid(globalThis.localStorage,getGrid);
  const environment=createMarsEnvironment({scene,state,getPosition:()=>rover.model()?.pos,morningStart,holdDay});
  let heldE=false,interactTime=0,tc=true;
  const daylight=document.createElement('div');daylight.className='global-daylight';daylight.innerHTML='<button type="button" class="global-daylight-current" aria-haspopup="true" aria-expanded="false"></button><div class="global-daylight-menu" role="menu" hidden><button type="button" data-time="auto">自动</button><button type="button" data-time="dawn">晨曦</button><button type="button" data-time="noon">正午</button><button type="button" data-time="dusk">黄昏</button><button type="button" data-time="night">夜晚</button></div>';document.body.append(daylight);
  const dayCurrent=daylight.querySelector('.global-daylight-current'),dayMenu=daylight.querySelector('.global-daylight-menu');
  function closeDayMenu(){dayMenu.hidden=true;dayCurrent.setAttribute('aria-expanded','false');}
  dayCurrent.onclick=()=>{dayMenu.hidden=!dayMenu.hidden;dayCurrent.setAttribute('aria-expanded',String(!dayMenu.hidden));};
  dayMenu.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{setEnvironmentMode(b.dataset.time);closeDayMenu();});
  document.addEventListener('pointerdown',e=>{if(!daylight.contains(e.target))closeDayMenu();});
  document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!dayMenu.hidden)closeDayMenu();});
  function paintDaylight(){const clock=environment.clock;dayCurrent.textContent=clock.text;for(const b of dayMenu.querySelectorAll('[data-time]')){const active=b.dataset.time===(state.environment||'auto');b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}}
  function setEnvironmentMode(mode){environment.set(mode);save();paintDaylight();notify(`${environment.label} · 一昼夜压缩为 20 分钟，日照影响充电。`);}
  const telemetry=createRoverTelemetry({heightAt,openMap});
  let homeMarker=null;
  let model=null,scan=null,cool=0,drill=null,elapsed=0,low=false;
  const group=new THREE.Group();group.name='MU-7 survey operations';scene.add(group);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.98,1,96),new THREE.MeshBasicMaterial({color:0x79e5de,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.visible=false;group.add(ring);
  // Same visual-only tyre tracks as ARES: the ground is never dug (DISCUSSION_LOG D33). Narrower tyres, longer buffer.
  const tracks=createTyreTracks({parent:group,name:'MU-7 six-wheel tyre tracks',heightAt,wheels:6,width:.44,capacity:16384,minStep:.1,maxJump:3}),wheelWorld=new THREE.Vector3();
  const markerMat=new THREE.MeshBasicMaterial({color:0x77ded2});
  function marker(p,relay=false){const m=new THREE.Mesh(relay?new THREE.CylinderGeometry(.08,.13,2.5,8):new THREE.OctahedronGeometry(.23),markerMat);m.position.set(p.x,heightAt(p.x,p.z)+(relay?1.25:.65),p.z);group.add(m);return m;}
  const markers=new Map();for(const p of state.returns)markers.set(p,marker(p));for(const p of state.relays)marker(p,true);
  const lamp=new THREE.SpotLight(0xffe1b8,0,45,.55,.6,1.4);group.add(lamp,lamp.target);
  const panel=document.createElement('details');panel.className='rover-instruments console-help';panel.innerHTML='<summary>探测车仪器</summary><p class="rover-energy" role="status"></p><div class="rover-instrument-buttons"></div>';const buttons=panel.querySelector('div'),readout=panel.querySelector('p');
  const actions=[['scan','雷达 · G'],['arm','机械臂 · R'],['drill','钻探 · 点击地面'],['panel','太阳翼 · T'],['lamp','车灯 · F'],['relay','中继器 · B'],['unload','交回样品 · 按住 E'],['right','扶正 · X'],['codex','图鉴 · Tab'],['hud','隐藏界面 · H'],['photo','摄影 · P'],['shot','拍照 · K']];
  for(const [id,label] of [...actions,['dawn','晨曦'],['noon','正午'],['dusk','黄昏'],['night','夜晚'],['auto','自动晨昏']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=id;b.onclick=()=>action(id);buttons.append(b);}
  const codex=document.createElement('dialog');codex.className='rover-codex';codex.innerHTML='<h2>MU-7 探测档案</h2><p></p><button>关闭 · Tab / Esc</button>';document.body.append(codex);codex.querySelector('button').onclick=()=>codex.close();codex.addEventListener('keydown',e=>{if(e.code==='Escape')e.stopPropagation();});
  function save(){try{localStorage.setItem(saveKey,JSON.stringify(state));}catch{}grid.flush();}
  addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
  function attach(){const m=rover.model();if(!m||m===model)return m;model=m;
    const linkedHome=grid.home;
    if(linkedHome)state.home={x:linkedHome.x,z:linkedHome.z};
    else if(!state.home){const p=findHome?.(m.pos)||{x:m.pos.x+24,z:m.pos.z};state.home={x:p.x,z:p.z};save();}
    if(!homeMarker){homeMarker=new THREE.Group();homeMarker.name='MU-7 补给基地';const pad=new THREE.Mesh(new THREE.RingGeometry(8.9,9.5,64),new THREE.MeshBasicMaterial({color:0x78e5d1,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));pad.rotation.x=-Math.PI/2;homeMarker.add(pad);const core=new THREE.Mesh(new THREE.BoxGeometry(1.6,1,1.2),new THREE.MeshStandardMaterial({color:0xb5c4bb,roughness:.7,emissive:0x173c34}));core.position.y=.5;core.castShadow=true;homeMarker.add(core);const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,3,8),new THREE.MeshBasicMaterial({color:0x9ffff0}));beacon.position.y=1.5;homeMarker.add(beacon);homeMarker.position.set(state.home.x,heightAt(state.home.x,state.home.z)+.05,state.home.z);group.add(homeMarker);}
    m.terrain.heightAt=heightAt;
    m.terrain.normalAt=(x,z,eps=.3,out=new THREE.Vector3())=>out.set(heightAt(x-eps,z)-heightAt(x+eps,z),2*eps,heightAt(x,z-eps)-heightAt(x,z+eps)).normalize();
    m.panelTarget=state.panel?1:0;m.panelDeploy=m.panelTarget;m.headlights=state.headlights;return m;}
  function action(id){
    if(['dawn','noon','dusk','night','auto'].includes(id)){setEnvironmentMode(id);return;}
    const m=attach();if(!m||!enabled()||loaded())return;
    if(id==='hud'){document.body.classList.toggle('rover-hud-hidden');}
    if(id==='codex'){if(codex.open)codex.close();else{codex.querySelector('p').textContent=`已归档 ${state.archived} 份样品，携带 ${state.samples.length}/6 份；已部署中继 ${state.relays.length}/3。探地雷达半径 78 m，耗电 4%；钻探周期 4.2 秒，耗电约 9%。地下回波与样品是游戏模拟，不是 MOLA 实测矿藏。${state.samples.map((p,i)=>` 样品 ${i+1}：${p.type}，(${p.x.toFixed(1)}, ${p.z.toFixed(1)})。`).join('')}`;codex.showModal();}return;}
    if(id==='right'){if(Math.abs(m.speed)>1.2){notify('停稳后按 X 扶正。');return;}stopAuto();drill=null;m.drilling=false;m.placeAt(m.pos.x,m.pos.z,Math.atan2(m.forward.x,m.forward.z));tracks.reset();notify('底盘已原地扶正，电量与样品保留。');}
    if(id==='panel'){state.panel=!state.panel;m.panelTarget=+state.panel;notify(state.panel?'太阳翼展开，朝向日光可充电。':'太阳翼收起。');}
    if(id==='tc'){rover.toggleTraction?.();notify(rover.traction?.()?'牵引控制已开启。':'牵引控制已关闭，注意轮胎打滑。');}
    if(id==='lamp'){state.headlights=!state.headlights;m.headlights=state.headlights;}
    if(id==='photo'){stopAuto();photo();}
    if(id==='shot'){requestAnimationFrame(()=>{try{const a=document.createElement('a');a.download='mars-mu7.png';a.href=canvas.toDataURL('image/png');a.click();}catch{notify('照片导出失败。');}});}
    if(id==='arm'){if(drill)return;if(Math.abs(m.speed)>.55){notify('请先制动停稳再展开机械臂。');return;}stopAuto();m.armOut=!m.armOut;notify(m.armOut?'W/S 调节伸距，A/D 摆臂，点击地面或钻探按钮采样。':'机械臂已收起。');}
    if(id==='scan'){
      if(scan||cool>0)return;if(state.power<4){notify('雷达需要至少 4% 电量。');return;}
      audio?.chirp();state.power-=4;scan={x:m.pos.x,z:m.pos.z,t:0};notify('探地雷达扫描中 · 半径 78 m');
    }
    if(id==='drill'){
      if(!m.armOut){action('arm');return;}if(drill)return;
      if(state.samples.length>=6){notify('样品舱已满，请到 ATLAS 旁交回样品。');return;}
      if(state.power<9||Math.abs(m.speed)>.55){notify('钻探需要停稳且电量至少 9%。');return;}
      stopAuto();m.aimPoint();drill={x:m.armTarget.x,z:m.armTarget.z,t:0};m.drilling=true;
    }
    if(id==='relay'){
      if(Math.abs(m.speed)>.55){notify('请停稳后部署中继器。');return;}
      if(state.relays.length>=3){notify('3 个中继器已用完。');return;}
      if(state.relays.some(p=>Math.hypot(p.x-m.pos.x,p.z-m.pos.z)<95)){notify('请与已有中继器保持 95 m 间距。');return;}
      const p={x:m.pos.x-m.forward.x*2.6,z:m.pos.z-m.forward.z*2.6};state.relays.push(p);audio?.radio();marker(p,true);notify(`中继器 ${state.relays.length}/3 已部署。`);
    }
    if(id==='unload'){
      const carrier=rover.carrier?.();if(!carrier||Math.hypot(carrier.position.x-m.pos.x,carrier.position.z-m.pos.z)>13||Math.abs(m.speed)>.55){notify('请停在 ATLAS 13 m 内交回样品。');return;}
      for(const sample of state.samples)onArchive(sample);
      notify(`已归档 ${state.samples.length} 份样品。`);state.archived+=state.samples.length;state.samples=[];
    }
    save();
  }
  const keys={KeyG:'scan',KeyR:'arm',KeyT:'panel',KeyF:'lamp',KeyL:'lamp',KeyX:'right',Tab:'codex',KeyH:'hud',KeyB:'relay',KeyP:'photo'};
  addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable]'))return;if(e.code==='KeyE'&&enabled())heldE=true;if(keys[e.code]&&enabled()){e.preventDefault();action(keys[e.code]);}});
  addEventListener('keyup',e=>{if(e.code==='KeyE'){heldE=false;interactTime=0;}});addEventListener('blur',()=>{heldE=false;interactTime=0;});
  canvas.addEventListener('click',()=>{if(model?.armOut)action('drill');});
  function drive(input,dt){const m=attach();if(!m)return input;m.hardHit=0;tc=input.tc;if(codex.open)return {...input,throttle:0,steer:0,brake:1};if(rover.view?.()==='自由')return input;if(m.armOut){stopAuto();if(!drill){m.armYaw=clamp(m.armYaw-input.steer*dt*1.5,-.95,.95);m.armReach=clamp(m.armReach+input.throttle*dt*1.2,.55,1.62);}return {...input,throttle:0,steer:0,brake:1};}return input;}
  function update(dt){
    dt=Number.isFinite(dt)?clamp(dt,0,.05):0;
    if(!codex.open)environment.update(dt);paintDaylight();
    const m=attach();telemetry.root.hidden=!rover.driving();panel.hidden=!rover.driving();if(!m)return;
    if(!enabled()&&drill){drill=null;m.drilling=false;}
    if(dt<=0||codex.open){heldE=false;interactTime=0;return;}
    if(!rover.driving())document.body.classList.remove('rover-hud-hidden');
    if(heldE&&enabled()){interactTime+=dt;if(interactTime>=1.6){if(rover.interact?.()!==true)action('unload');heldE=false;interactTime=0;}}
    if(m.hardHit>3.2){audio?.thud(Math.min(2,m.hardHit*.25));state.integrity=clamp(state.integrity-(m.hardHit-3.2)*2.4,0,100);m.hardHit=0;}
    const cargo=loaded();m.panelTarget=cargo?0:+state.panel;m.panelDeploy+=(m.panelTarget-m.panelDeploy)*Math.min(1,dt*1.5);
    m.lampPower+=((state.headlights&&state.power>0&&!cargo?1:0)-m.lampPower)*Math.min(1,dt*5);
    const sun=scene.children.find(o=>o.isDirectionalLight);const direction=sun?sun.position.clone().sub(sun.target.position).normalize():new THREE.Vector3(-.894,.309,.325);
    let light=cargo?0:clamp(direction.y*6,0,1);
    if(light){for(let d=3;d<=180;d+=6){const x=m.pos.x+direction.x*d,z=m.pos.z+direction.z*d;if(heightAt(x,z)>m.pos.y+direction.y*d+.5){light=0;break;}}}
    const face=m.panelDeploy*clamp(m.up.dot(direction)*1.5+.35,0,1);
    m.powerScale=powerStep(state,{light,panel:face,motor:rover.driving()?m.motorLoad:0,lamp:m.lampPower,drilling:!!drill},dt);
    if(state.power<25&&!low){notify('电量低于 25%，保留应急驱动；展开太阳翼，或按 M 导航至补给基地。');low=true;}if(state.power>29)low=false;
    lamp.intensity=m.lampPower*40;lamp.position.copy(m.pos).addScaledVector(m.up,.8);lamp.target.position.copy(m.pos).addScaledVector(m.forward,12);
    const carrier=rover.carrier?.();if(carrier&&!cargo&&Math.abs(m.speed)<.55&&Math.hypot(carrier.position.x-m.pos.x,carrier.position.z-m.pos.z)<13){const amount=Math.min(6*dt,100-state.power,state.supportPower);state.power+=amount;state.supportPower-=amount;state.net+=amount/dt;}
    const gridHome=grid.home;if(gridHome){state.home={...gridHome};if(homeMarker)homeMarker.position.set(gridHome.x,heightAt(gridHome.x,gridHome.z)+.05,gridHome.z);}
    const beforeServiceSamples=[...state.samples];
    const atHome=grid.available?serviceGridHome(state,m.pos,dt,cargo,grid):serviceHome(state,m.pos,dt,cargo);
    if(atHome&&beforeServiceSamples.length&&!state.samples.length)for(const sample of beforeServiceSamples)onArchive(sample);
    m.powerScale=.18+.82*clamp(state.power/25,0,1);
    state.chargeStatus=atHome?(grid.available?`营地电网 · 主电池 ${grid.energy.toFixed(1)} kWh · 自动充电 / 卸样 / 维修`:'探索补给原型 · 自动充电 / 卸样 / 维修'):cargo?'货舱内 · 太阳翼收起':!state.panel?'太阳翼收起 · T 展开':direction.y<=0?'夜间无日照 · 可应急驶回补给基地':light===0?'地形遮光 · 移至日照处或补给基地':state.net>0?'太阳能充电中':state.power>=100?'电池已满':'光伏不足以覆盖当前负载';
    cool=Math.max(0,cool-dt);
    if(scan){scan.t+=dt;ring.visible=true;ring.position.set(scan.x,heightAt(scan.x,scan.z)+.12,scan.z);ring.scale.setScalar(Math.max(.01,78*scan.t/2.1));
      if(scan.t>=2.1){
        // Deterministic fictional survey returns; never label these as measured MOLA resources.
        const x=Math.round((scan.x+20)/24)*24,z=Math.round((scan.z+12)/24)*24;
        if(!state.returns.some(p=>p.x===x&&p.z===z)&&state.returns.length<64){const p={x,z};state.returns.push(p);markers.set(p,marker(p));}
        audio?.echo();notify('扫描完成：青色标记为模拟地下回波，需将钻头对准后验证。');scan=null;cool=1.4;ring.visible=false;save();
      }
    }
    if(drill){
      if(state.power<=0||Math.abs(m.speed)>1.2){drill=null;m.drilling=false;notify('钻探中止：供电不足或底盘移动。');}
      else{dust?.drill({x:drill.x,y:heightAt(drill.x,drill.z),z:drill.z},dt);drill.t+=dt;if(drill.t>=4.2){const target=state.returns.find(p=>Math.hypot(p.x-drill.x,p.z-drill.z)<2.6);const sample={id:`mu7-${Date.now()}-${state.archived}-${state.samples.length}`,x:drill.x,z:drill.z,type:target?'地下岩芯（模拟）':'表层风化物',source:'MU-7',massKg:.5};state.samples.push(sample);audio?.discovery();onSample(sample);if(target){markers.get(target)?.removeFromParent();markers.delete(target);state.returns=state.returns.filter(p=>p!==target);}notify(`采样完成 · 样品舱 ${state.samples.length}/6`);tracks.mark(drill.x-.6,drill.z,drill.x+.6,drill.z,1.2);drill=null;m.drilling=false;save();}}
    }
    if(!cargo&&rover.driving()){
      const p=state.path.at(-1);if(!p||Math.hypot(p.x-m.pos.x,p.z-m.pos.z)>2){state.path.push({x:m.pos.x,z:m.pos.z});if(state.path.length>2048)state.path.shift();}
    }
    if(!cargo)m.updateVisuals(rover.driving()?0:dt,{throttle:0,steer:0,brake:1,tc:true});
    // Like ARES, tracks follow the drawn wheels whenever MU-7 moves (remote, autopilot or summon). The drawn hub can sit up to 0.2 m
    // sideways from the physics contact on steep tilts (D34), so read it after posing; a wheel in the air restarts its ribbon.
    // Unlike ARES, MU-7 can slide sideways with almost no forward speed, so "moving" is ground speed, not forward speed.
    if(!cargo){const moving=Math.hypot(m.vel.x,m.vel.z)>.05;m.wheels.forEach((w,i)=>{w.obj.getWorldPosition(wheelWorld);tracks.step(i,wheelWorld.x,wheelWorld.z,moving,w.contact);});}else tracks.reset();
    readout.textContent=`电量 ${state.power.toFixed(1)}% · ${state.net>=0?'充电 +':'耗电 '}${state.net.toFixed(2)}%/秒 · ${state.heat.toFixed(0)}°C · 样品 ${state.samples.length}/6 · 中继 ${state.relays.length}/3 · ${environment.label} ${environment.elevation.toFixed(1)}° · 支援电池 ${state.supportPower.toFixed(0)}% · ${grid.available?'营地主电池 '+grid.energy.toFixed(1)+' kWh':'探索补给原型'}${drill?' · 钻探 '+Math.round(drill.t/4.2*100)+'%':''}`;
    for(const b of buttons.children)b.disabled=!enabled();
    telemetry.update(dt,m,state,{remote:rover.driving(),scan,cool,drill,carrier,tc,grid});
    elapsed+=dt;if(elapsed>2){save();elapsed=0;}
  }
  return {state,panel,drive,update,action,save,environment,get frozen(){return codex.open;},setInteract(value){heldE=!!value&&enabled();if(!heldE)interactTime=0;},get telemetry(){return {tc:rover.traction?.()??tc,cool,drillProgress:drill?drill.t/4.2:0,scanActive:!!scan};},get gridAvailable(){return grid.available;},get gridEnergy(){return grid.energy;},get trackCount(){return tracks.count;}};
}
