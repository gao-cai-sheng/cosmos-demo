import {clamp} from './rover-power.js';
export function createRoverTelemetry({heightAt,openMap}){
 const root=document.createElement('aside');root.className='rover-telemetry';root.setAttribute('aria-label','探测车导航与遥测');root.innerHTML=`<div class="rover-compass" aria-label="探测车航向"></div><div class="rover-shortcuts">W/S 行驶 · A/D 转向 · 空格 刹车 · F 车灯 · G 雷达 · R 机械臂 · T 太阳翼 · B 中继<br>C 视角 · P 摄影 · K 拍照 · X 扶正 · Tab 图鉴 · H 隐藏界面 · 按住 E 交互 · Esc 暂停</div><section class="rover-navigation"><header>地形导航 <span>600 m</span></header><button class="rover-mini" aria-label="打开完整地形地图"><canvas width="180" height="180"></canvas></button><p class="rover-clock"></p><p class="rover-return"></p><div class="rover-samples" aria-label="样品舱"></div></section><section class="rover-systems"><header>MU-7 系统 <span class="rover-net"></span></header><label>电量 <strong class="rover-percent"></strong></label><progress max="100" value="100"></progress><p class="rover-flags"></p><p class="rover-charge-status"></p><details><summary>工程仪表 · 轮况 / 雷达</summary><p class="rover-health"></p><div class="rover-wheels"></div><p class="rover-radar"></p><p class="rover-odometer"></p></details></section>`;document.body.append(root);
 root.querySelector('.rover-mini').onclick=openMap;const q=s=>root.querySelector(s),canvas=q('canvas'),ctx=canvas.getContext('2d'),background=document.createElement('canvas');background.width=background.height=90;let center=null,timer=0;
 const wheelNodes=Array.from({length:6},(_,i)=>{const e=document.createElement('label');e.innerHTML=`<span>${['左前','右前','左中','右中','左后','右后'][i]}</span><meter min="0" max="1"></meter><small></small>`;q('.rover-wheels').append(e);return e;});
 const slots=Array.from({length:6},()=>{const e=document.createElement('span');q('.rover-samples').append(e);return e;});
 function update(dt,m,state,{remote,scan,cool,drill,carrier,tc,grid}){
  root.hidden=!remote;if(!m||!remote)return;timer+=dt;if(timer<.15)return;timer=0;
  const heading=(Math.atan2(m.forward.x,-m.forward.z)*180/Math.PI+360)%360;
  const points=['北','东北','东','东南','南','西南','西','西北'];q('.rover-compass').textContent=`${points[Math.round((heading+315)%360/45)%8]} ─── ${String(Math.round(heading)%360).padStart(3,'0')}° ${points[Math.round(heading/45)%8]} ─── ${points[Math.round((heading+45)%360/45)%8]}`;
  q('.rover-percent').textContent=state.power.toFixed(1)+'%';q('progress').value=state.power;q('progress').classList.toggle('low',state.power<25);q('.rover-net').textContent=(state.net>=0?'充电 +':'耗电 ')+state.net.toFixed(2)+'%/秒';
  q('.rover-flags').textContent=`${state.panel?'太阳翼展开':'太阳翼收起'} · ${state.headlights?'车灯开':'车灯关'} · ${m.armOut?'机械臂展开':'机械臂收起'} · TC ${tc?'开':'关'}`;
  q('.rover-charge-status').textContent=state.chargeStatus||'';
  q('.rover-health').textContent=`温度 ${state.heat.toFixed(0)}°C · 完整度 ${state.integrity.toFixed(0)}%`;
  const seconds=Math.floor(state.elapsed);q('.rover-clock').textContent=`任务用时 ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  q('.rover-return').textContent=state.home?`${grid?.available?'营地电网':'补给基地'} ${Math.round(Math.hypot(m.pos.x-state.home.x,m.pos.z-state.home.z))} m · 9.5 m 内自动补电${grid?.available?` · 主电池 ${grid.energy.toFixed(1)} kWh`:''}`:'补给基地待部署';
  q('.rover-odometer').textContent=`速度 ${(Math.abs(m.speed)*3.6).toFixed(1)} km/h · 里程 ${(m.odo/1000).toFixed(2)} km`;
  q('.rover-radar').textContent=drill?`钻探 ${Math.round(drill.t/4.2*100)}%`:scan?`GPR 扫描 ${Math.round(scan.t/2.1*100)}% · 78 m`:`GPR ${cool>0?'冷却':'待机'} · 待验证回波 ${state.returns.length}（模拟）`;
  m.wheels.forEach((w,i)=>{const e=wheelNodes[i];e.querySelector('meter').value=clamp(w.load/560,0,1);e.querySelector('small').textContent=w.contact?`${Math.round(w.load)} N / 滑 ${Math.round(Math.max(w.slipLong,w.slipLat)*100)}%`:'离地';});
  slots.forEach((e,i)=>{e.textContent=state.samples[i]?'◆':'·';e.title=state.samples[i]?.type||'空样品槽';e.classList.toggle('filled',!!state.samples[i]);});q('.rover-samples').setAttribute('aria-label',`样品舱 ${state.samples.length}/6`);
  if(!center||Math.hypot(center.x-m.pos.x,center.z-m.pos.z)>25){center={x:m.pos.x,z:m.pos.z};const img=background.getContext('2d').createImageData(90,90);for(let y=0;y<90;y++)for(let x=0;x<90;x++){const wx=center.x+(x/90-.5)*600,wz=center.z+(y/90-.5)*600;const shade=clamp(.5+(heightAt(wx-3,wz)-heightAt(wx+3,wz))*.2,.15,.9);const i=(y*90+x)*4;img.data[i]=shade*155;img.data[i+1]=shade*100;img.data[i+2]=shade*65;img.data[i+3]=255;}background.getContext('2d').putImageData(img,0,0);}
  ctx.drawImage(background,0,0,180,180);const point=p=>({x:90+(p.x-center.x)*.3,y:90+(p.z-center.z)*.3});
  ctx.strokeStyle='#ecb88c';ctx.lineWidth=1;ctx.beginPath();state.path.forEach((p,i)=>{const a=point(p);if(!i)ctx.moveTo(a.x,a.y);else ctx.lineTo(a.x,a.y);});ctx.stroke();
  for(const p of [...state.returns,...state.relays]){const a=point(p);ctx.fillStyle='#85eee0';ctx.fillRect(a.x-2,a.y-2,4,4);}
  if(state.home){const a=point(state.home);ctx.strokeStyle='#9fffd4';ctx.strokeRect(a.x-4,a.y-4,8,8);ctx.fillStyle='#baffdf';ctx.fillText('补给基地',a.x+6,a.y);}
  if(carrier?.ready){const a=point(carrier.position);ctx.fillStyle='#fff';ctx.fillRect(a.x-3,a.y-3,6,6);ctx.fillText('ATLAS',a.x+5,a.y);}
  const a=point(m.pos);ctx.save();ctx.translate(a.x,a.y);ctx.rotate(heading*Math.PI/180);ctx.fillStyle='#b3fff1';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#fff';ctx.fillText('北 ↑',7,14);
 }
 return {root,update};
}
