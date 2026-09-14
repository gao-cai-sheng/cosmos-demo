import {createMarsEnvironment} from './mars-environment.js';
import {createRoverTelemetry} from './rover-telemetry.js';
import {Dust} from '../world/dust.js';
import {createRegolith} from './rover-regolith.js';
import * as THREE from 'three';
import {clamp,powerStep,restoreRoverOps,serviceHome,serviceGridHome} from './rover-power.js';
import {createSurvivalGrid} from './survival-grid.js';

// Shared by the Mars surface and settlement. Original mechanics: moon-rover (MIT).
export function createRoverOperations({scene,canvas,heightAt,rover,enabled,loaded,saveKey,notify,stopAuto,photo,openMap,findHome}) {
  const regolith=createRegolith(scene,heightAt);
  heightAt=regolith.heightAt;
  let saved;try{saved=JSON.parse(localStorage.getItem(saveKey)||'null');}catch{}
  const state=restoreRoverOps(saved),grid=createSurvivalGrid(),wheels=new Map();
  const environment=createMarsEnvironment({scene,state,getPosition:()=>rover.model()?.pos});
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
  // Bounded reusable buffer: six contact ribbons, sampled along the actual height field.
  const capacity=16384,positions=new Float32Array(capacity*18),colors=new Float32Array(capacity*18);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const tracks=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));tracks.frustumCulled=false;tracks.name='Six wheel contact tracks';group.add(tracks);let cursor=0,count=0;
  function ribbon(a,b,width,strength){
    const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<.001)return;
    const nx=-dz/d*width/2,nz=dx/d*width/2;
    const corners=[[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz]];
    const shade=1-clamp(strength,.2,.95)*.7;
    [0,1,2,2,1,3].forEach((k,i)=>{const [x,z]=corners[k],o=cursor*18+i*3;positions[o]=x;positions[o+1]=heightAt(x,z)+.022;positions[o+2]=z;colors[o]=.48*shade;colors[o+1]=.23*shade;colors[o+2]=.12*shade;});
    cursor=(cursor+1)%capacity;count=Math.min(capacity,count+1);geometry.setDrawRange(0,count*6);
    geometry.attributes.position.needsUpdate=geometry.attributes.color.needsUpdate=true;
  }
  const markerMat=new THREE.MeshBasicMaterial({color:0x77ded2});
  function marker(p,relay=false){const m=new THREE.Mesh(relay?new THREE.CylinderGeometry(.08,.13,2.5,8):new THREE.OctahedronGeometry(.23),markerMat);m.position.set(p.x,heightAt(p.x,p.z)+(relay?1.25:.65),p.z);group.add(m);return m;}
  const markers=new Map();for(const p of state.returns)markers.set(p,marker(p));for(const p of state.relays)marker(p,true);
  const dustSun={value:new THREE.Vector3(-.894,.309,.325)},dust=new Dust(scene,{heightAt},dustSun,600,3.71);dust.mat.uniforms.uAlbedo.value.set(.30,.12,.055);
  const fines=new Dust(scene,{heightAt},dustSun,220,3.71);fines.drag=7;fines.wind={x:.9,z:.3};fines.lifetimeScale=8;fines.mat.uniforms.uAlbedo.value.set(.28,.13,.075);fines.mat.uniforms.uPx.value=3;
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
    if(id==='right'){if(Math.abs(m.speed)>1.2){notify('停稳后按 X 扶正。');return;}stopAuto();drill=null;m.drilling=false;m.placeAt(m.pos.x,m.pos.z,Math.atan2(m.forward.x,m.forward.z));wheels.clear();notify('底盘已原地扶正，电量与样品保留。');}
    if(id==='panel'){state.panel=!state.panel;m.panelTarget=+state.panel;notify(state.panel?'太阳翼展开，朝向日光可充电。':'太阳翼收起。');}
    if(id==='tc'){rover.toggleTraction?.();notify(rover.traction?.()?'牵引控制已开启。':'牵引控制已关闭，注意轮胎打滑。');}
    if(id==='lamp'){state.headlights=!state.headlights;m.headlights=state.headlights;}
    if(id==='photo'){stopAuto();photo();}
    if(id==='shot'){requestAnimationFrame(()=>{try{const a=document.createElement('a');a.download='mars-mu7.png';a.href=canvas.toDataURL('image/png');a.click();}catch{notify('照片导出失败。');}});}
    if(id==='arm'){if(drill)return;if(Math.abs(m.speed)>.55){notify('请先制动停稳再展开机械臂。');return;}stopAuto();m.armOut=!m.armOut;notify(m.armOut?'W/S 调节伸距，A/D 摆臂，点击地面或钻探按钮采样。':'机械臂已收起。');}
    if(id==='scan'){
      if(scan||cool>0)return;if(state.power<4){notify('雷达需要至少 4% 电量。');return;}
      state.power-=4;scan={x:m.pos.x,z:m.pos.z,t:0};notify('探地雷达扫描中 · 半径 78 m');
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
      const p={x:m.pos.x-m.forward.x*2.6,z:m.pos.z-m.forward.z*2.6};state.relays.push(p);marker(p,true);notify(`中继器 ${state.relays.length}/3 已部署。`);
    }
    if(id==='unload'){
      const carrier=rover.carrier?.();if(!carrier||Math.hypot(carrier.position.x-m.pos.x,carrier.position.z-m.pos.z)>13||Math.abs(m.speed)>.55){notify('请停在 ATLAS 13 m 内交回样品。');return;}
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
    if(m.hardHit>3.2){state.integrity=clamp(state.integrity-(m.hardHit-3.2)*2.4,0,100);m.hardHit=0;}
    const cargo=loaded();m.panelTarget=cargo?0:+state.panel;m.panelDeploy+=(m.panelTarget-m.panelDeploy)*Math.min(1,dt*1.5);
    m.lampPower+=((state.headlights&&state.power>0&&!cargo?1:0)-m.lampPower)*Math.min(1,dt*5);
    const sun=scene.children.find(o=>o.isDirectionalLight);const direction=sun?sun.position.clone().sub(sun.target.position).normalize():new THREE.Vector3(-.894,.309,.325);
    let light=cargo?0:clamp(direction.y*6,0,1);
    if(light){for(let d=3;d<=180;d+=6){const x=m.pos.x+direction.x*d,z=m.pos.z+direction.z*d;if(heightAt(x,z)>m.pos.y+direction.y*d+.5){light=0;break;}}}
    const face=m.panelDeploy*clamp(m.up.dot(direction)*1.5+.35,0,1);
    m.powerScale=powerStep(state,{light,panel:face,motor:rover.driving()?m.motorLoad:0,lamp:m.lampPower,drilling:!!drill},dt);
    if(state.power<25&&!low){notify('电量低于 25%，保留应急驱动；展开太阳翼，或按 M 导航至补给基地。');low=true;}if(state.power>29)low=false;
    lamp.intensity=m.lampPower*40;lamp.position.copy(m.pos).addScaledVector(m.up,.8);lamp.target.position.copy(m.pos).addScaledVector(m.forward,12);
    dustSun.value.copy(direction);dust.update(dt);fines.update(dt);dust.mat.uniforms.uSunCol.value.setScalar(2*clamp(direction.y*6,0,1));fines.mat.uniforms.uSunCol.value.copy(dust.mat.uniforms.uSunCol.value);
    const carrier=rover.carrier?.();if(carrier&&!cargo&&Math.abs(m.speed)<.55&&Math.hypot(carrier.position.x-m.pos.x,carrier.position.z-m.pos.z)<13){const amount=Math.min(6*dt,100-state.power,state.supportPower);state.power+=amount;state.supportPower-=amount;state.net+=amount/dt;}
    const atHome=grid.available?serviceGridHome(state,m.pos,dt,cargo,grid):serviceHome(state,m.pos,dt,cargo);
    m.powerScale=.18+.82*clamp(state.power/25,0,1);
    state.chargeStatus=atHome?(grid.available?`营地电网 · 主电池 ${grid.energy.toFixed(1)} kWh · 自动充电 / 卸样 / 维修`:'探索补给原型 · 自动充电 / 卸样 / 维修'):cargo?'货舱内 · 太阳翼收起':!state.panel?'太阳翼收起 · T 展开':direction.y<=0?'夜间无日照 · 可应急驶回补给基地':light===0?'地形遮光 · 移至日照处或补给基地':state.net>0?'太阳能充电中':state.power>=100?'电池已满':'光伏不足以覆盖当前负载';
    cool=Math.max(0,cool-dt);
    if(scan){scan.t+=dt;ring.visible=true;ring.position.set(scan.x,heightAt(scan.x,scan.z)+.12,scan.z);ring.scale.setScalar(Math.max(.01,78*scan.t/2.1));
      if(scan.t>=2.1){
        // Deterministic fictional survey returns; never label these as measured MOLA resources.
        const x=Math.round((scan.x+20)/24)*24,z=Math.round((scan.z+12)/24)*24;
        if(!state.returns.some(p=>p.x===x&&p.z===z)&&state.returns.length<64){const p={x,z};state.returns.push(p);markers.set(p,marker(p));}
        notify('扫描完成：青色标记为模拟地下回波，需将钻头对准后验证。');scan=null;cool=1.4;ring.visible=false;save();
      }
    }
    if(drill){
      if(state.power<=0||Math.abs(m.speed)>1.2){drill=null;m.drilling=false;notify('钻探中止：供电不足或底盘移动。');}
      else{if(Math.random()<dt*30)dust.spawn(2,drill.x,heightAt(drill.x,drill.z)+.1,drill.z,.7,.2);regolith.dig(drill.x,drill.z,.9,.04,dt*.16);drill.t+=dt;if(drill.t>=4.2){const target=state.returns.find(p=>Math.hypot(p.x-drill.x,p.z-drill.z)<2.6);state.samples.push({x:drill.x,z:drill.z,type:target?'地下岩芯（模拟）':'表层风化物'});if(target){markers.get(target)?.removeFromParent();markers.delete(target);state.returns=state.returns.filter(p=>p!==target);}notify(`采样完成 · 样品舱 ${state.samples.length}/6`);ribbon({x:drill.x-.3,z:drill.z},{x:drill.x+.3,z:drill.z},.6,.95);drill=null;m.drilling=false;save();}}
    }
    if(!cargo&&rover.driving()){
      for(const w of m.wheels){const p={x:w.worldPos.x,z:w.worldPos.z},last=wheels.get(w);if(!last||!w.contact){wheels.set(w,p);continue;}const distance=Math.hypot(p.x-last.x,p.z-last.z);if(distance>3){wheels.set(w,p);continue;}if(distance>.1){wheels.set(w,p);regolith.dig(p.x,p.z,.26,Math.min(.115,.045+w.sink*2+w.slipLong*.06));ribbon(last,p,.44,clamp(.52+w.load/900*.26+w.slipLong*.3,0,.95));}if(Math.abs(w.spinVel)*.335>.8&&Math.random()<dt*4)fines.spawn(1,p.x,heightAt(p.x,p.z)+.3,p.z,1,.4);if(Math.abs(w.spinVel)*.335>.8&&Math.random()<dt*20)dust.spawn(2,p.x,w.worldPos.y-.26,p.z,.4+w.slipLong*1.7,.2,-m.forward.x*Math.sign(w.spinVel),-m.forward.z*Math.sign(w.spinVel));if(w.slipLong>.22&&Math.abs(m.speed)<2.4)regolith.dig(p.x,p.z,.27,.06,(w.slipLong-.18)*dt*.42);}
      const p=state.path.at(-1);if(!p||Math.hypot(p.x-m.pos.x,p.z-m.pos.z)>2){state.path.push({x:m.pos.x,z:m.pos.z});if(state.path.length>2048)state.path.shift();}
    }else wheels.clear();
    regolith.flush();
    if(!cargo)m.updateVisuals(rover.driving()?0:dt,{throttle:0,steer:0,brake:1,tc:true});
    readout.textContent=`电量 ${state.power.toFixed(1)}% · ${state.net>=0?'充电 +':'耗电 '}${state.net.toFixed(2)}%/秒 · ${state.heat.toFixed(0)}°C · 样品 ${state.samples.length}/6 · 中继 ${state.relays.length}/3 · ${environment.label} ${environment.elevation.toFixed(1)}° · 支援电池 ${state.supportPower.toFixed(0)}% · ${grid.available?'营地主电池 '+grid.energy.toFixed(1)+' kWh':'探索补给原型'}${drill?' · 钻探 '+Math.round(drill.t/4.2*100)+'%':''}`;
    for(const b of buttons.children)b.disabled=!enabled();
    telemetry.update(dt,m,state,{remote:rover.driving(),scan,cool,drill,carrier,tc,grid});
    elapsed+=dt;if(elapsed>2){save();elapsed=0;}
  }
  return {state,panel,drive,update,action,save,environment,setInteract(value){heldE=!!value&&enabled();if(!heldE)interactTime=0;},get telemetry(){return {tc:rover.traction?.()??tc,cool,drillProgress:drill?drill.t/4.2:0,scanActive:!!scan};},get gridAvailable(){return grid.available;},get gridEnergy(){return grid.energy;},get trackCount(){return count;},get tileCount(){return regolith.tileCount;}};
}
