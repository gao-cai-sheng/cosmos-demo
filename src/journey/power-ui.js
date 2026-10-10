import {SOLAR_SERVICE} from '../survival/solar-service.js';
/** Live equipment inspector; opening it does not pause simulation or movement. */
export function createPowerUI({onAction,onStep,onWater,onNursery,onAssay,onPowerResearch,onSolarResearch}){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./power-ui.css',import.meta.url).href;document.head.append(css);
 const panel=document.createElement('section');panel.className='mainline-survival-panel power-ui';panel.setAttribute('aria-label','营地电力');
 panel.innerHTML=`<button type="button" class="pu-summary" aria-expanded="false"><span class="pu-bolt">ϟ</span><span><span class="pu-state"></span><strong class="pu-energy"></strong></span><span class="pu-trend"></span></button><div class="pu-meter"><i></i></div><div class="pu-step"><button type="button"></button><small></small></div><button type="button" class="pu-water" hidden>水务与货物账本</button><button type="button" class="pu-nursery" hidden><strong></strong><small></small></button><button type="button" class="pu-water pu-assay" hidden>定量科研</button><button type="button" class="pu-water pu-power-research" hidden>供电科研</button><button type="button" class="pu-water pu-solar-research" hidden>清洁对照</button><div class="pu-details" hidden><header><small>CAMP / POWER BUS 01</small><h2>电力与太阳能阵列</h2></header><div class="pu-balance"><span>电池净功率<strong></strong></span><span class="pu-estimate"></span></div><p class="pu-warning" role="status"></p><p class="pu-cable"></p><h3>阵列现场操作</h3><p class="pu-device-state"></p><p class="pu-reach"></p><div class="pu-actions"></div><div class="pu-job" hidden><label></label><progress max="1"></progress></div><details class="pu-breakdown"><summary>供电明细 · 光伏 / 电池 / 负载</summary><dl class="pu-flow"><div><dt>太阳能阵列<small class="pu-array"></small></dt><dd class="pu-generation"></dd></div><div><dt>主电池<small class="pu-battery"></small></dt><dd class="pu-storage"></dd></div><div><dt>营地持续负载<small>教学总预算 · 配电箱</small></dt><dd class="pu-load"></dd></div><div><dt>水务作业<small>从主电池扣账</small></dt><dd class="pu-water-kw"></dd></div><div><dt>育苗试验<small>本盒灯与培养辅助负载</small></dt><dd class="pu-nursery-kw"></dd></div><div><dt>定量提取<small>封存实验液 · 同一主电池</small></dt><dd class="pu-assay-kw"></dd></div><div class="pu-ares-row"><dt>ARES 充电<small>保留8 kWh生活储备</small></dt><dd class="pu-ares"></dd></div><div class="pu-rover-row"><dt>MU-7 充电<small>从主电池扣账</small></dt><dd class="pu-rover"></dd></div></dl></details><footer>无水除尘 · 不消耗饮水<br>教学参数：4 kW 峰值 / 60 kWh 储能；120 秒 / 模拟小时。积尘按模拟时间缓慢累积，尚未接天气或真实沉降数据。<br>详情不暂停世界；地图、暂停与后台冻结作业。</footer></div>`;
 document.body.append(panel);const $=s=>panel.querySelector(s),summary=$('.pu-summary'),details=$('.pu-details'),step=$('.pu-step button');let expanded=false,current=null;
 const labels={'expand-solar':'展开太阳能板','isolate-solar':'隔离光伏输入','clean-solar':'无水除尘','reconnect-solar':'恢复光伏并网','cancel-solar-job':'取消当前作业'};
 for(const [type,label] of Object.entries(labels)){const b=document.createElement('button');b.type='button';b.dataset.action=type;b.textContent=label;b.onclick=()=>onAction(type);$('.pu-actions').append(b);}
 summary.onclick=()=>{expanded=!expanded;details.hidden=!expanded;summary.setAttribute('aria-expanded',String(expanded));panel.classList.toggle('expanded',expanded);document.body.classList.toggle('power-details-open',expanded);layout();};
 $('.pu-water').onclick=onWater;
 $('.pu-solar-research').onclick=()=>{if(!current?.frozen)onSolarResearch?.();};
 $('.pu-power-research').onclick=()=>{if(!current?.frozen)onPowerResearch?.();};
 $('.pu-assay').onclick=()=>{if(!current?.frozen)onAssay?.();};
 $('.pu-nursery').onclick=()=>{if(!current?.frozen)onNursery?.();};
 step.onclick=onStep;
 function layout(){if(!current)return;const mobile=innerWidth<700,card=document.querySelector('.erin-card:not([hidden])'),deck=document.querySelector('.cd-bottom');
  const top=mobile?(expanded?Math.max(66,(document.querySelector('.cd-top')?.getBoundingClientRect().bottom||58)+8):Math.max(100,(card?.getBoundingClientRect().bottom||85)+8)):100;
  const bottom=Math.min(innerHeight-50,deck?.getBoundingClientRect().top||innerHeight-24);
  panel.style.top=Math.min(top,bottom-74)+'px';panel.style.maxHeight=Math.max(74,bottom-parseFloat(panel.style.top)-10)+'px';
 }
 function render(m){current=m;panel.hidden=!m.eligible;if(panel.hidden){document.body.classList.remove('power-details-open');return;}
 document.body.classList.toggle('power-details-open',expanded);const p=m.power,s=p.solar,job=s.job;
 $('.pu-power-research').hidden=!m.powerResearchEligible;$('.pu-power-research').disabled=!!m.frozen;$('.pu-power-research').textContent=`供电科研 · ${Math.floor(m.powerResearch?.elapsed||0)}/60秒 · 报告 ›`;
 $('.pu-solar-research').hidden=!m.solarResearchEligible;$('.pu-solar-research').disabled=!!m.frozen;$('.pu-solar-research').textContent='清洁对照 · '+(m.solarResearch?.read?'已确认':m.solarResearch?.after||m.solarResearch?.deferred?'待确认':m.solarResearch?.before?'待维护/复测':'待前测')+' · 报告 ›';
 const generation=m.generation,load=p.online?2:0,rover=m.roverKW,water=m.waterKW||0,ares=m.aresKW||0,nursery=m.nurseryKW||0,assay=m.assayKW||0,offered=generation-load-rover-water-ares-nursery-assay;
 const av=m.assayStatus;$('.pu-assay').hidden=!av?.eligible;$('.pu-assay').disabled=!!m.frozen;$('.pu-assay').textContent=av?.job?`定量科研 · ${av.paused?'低电/离线暂停':Math.floor(av.job.elapsed)+' / 60秒'} · 账本 ›`:`定量科研 · ${av?.runs?.length||0}/3次 · 账本 ›`;$('.pu-assay-kw').textContent=assay.toFixed(2)+' kW';
 $('.pu-water').hidden=!m.water||m.water.cargo==='orbit';$('.pu-water').textContent=`水务 · 净水 ${(m.water?.cleanL||0).toFixed(2)} L / 作业 ${water.toFixed(1)} kW · 账本 ›`;
 const nv=m.nurseryStatus;$('.pu-nursery').hidden=!nv?.eligible;
 if(nv){$('.pu-nursery strong').textContent='育苗 · '+nv.label+' · 账本 ›';$('.pu-nursery small').textContent=nv.progress>0&&nv.remaining>0?`${Math.floor(nv.progress*100)}% · 剩余 ${nv.remaining} 秒有效培养`:nv.stage==='ready'?'回育苗架按 F 验收':nv.stage==='verified'?'本批已完成 · 尚不可收获':'舱内育苗架 · 1盒有限试验';$('.pu-nursery').dataset.warning=String(['low','offline'].includes(nv.stage));$('.pu-nursery').disabled=!!m.frozen;}
 const net=(p.energy>=60&&offered>0)||(p.energy<=0&&offered<0)?0:offered;
 const state=!p.online?'待投运':p.energy<=0&&generation<load?'供电不足':p.energy<12?'低电量':'已投运';
 $('.pu-state').textContent='营地电源 · '+state;$('.pu-energy').textContent=p.energy.toFixed(1)+' / 60 kWh';
 const trend=job? (job.type==='expand'?'展开中':'除尘中'):!p.online?'施工中':p.energy>=60&&offered>0?'电池已满':p.energy<=0&&offered<0?'储能耗尽':`${net>=0?'充电':'放电'} ${Math.abs(net).toFixed(1)} kW`;
 $('.pu-trend').textContent=trend+(expanded?' −':' +');$('.pu-meter i').style.width=p.energy/60*100+'%';panel.classList.toggle('low',p.online&&p.energy<12);
 $('.pu-water-kw').textContent=water.toFixed(1)+' kW';
 $('.pu-nursery-kw').textContent=nursery.toFixed(2)+' kW';
 const t=m.target,reach=t?.point?Math.hypot(m.player.x-t.point.x,m.player.z-t.point.z):0;
 $('.pu-step').hidden=!t;step.textContent=t?.label||'';step.disabled=!!m.frozen||!!job||!!t?.point&&reach>m.targetReach;
 $('.pu-step small').textContent=job?'作业进行中，保持在操作点附近。':m.frozen?'先关闭暂停或地图，再操作。':reach>m.targetReach?`距操作点 ${reach.toFixed(1)} m · 到 ${m.targetReach} m 内操作`:t?'现场条件就绪 · 按 F 或点击操作':'';
 $('.pu-balance strong').textContent=(net>0?'+':'')+net.toFixed(1)+' kW';
 $('.pu-estimate').textContent=net>0?`按当前功率约 ${((60-p.energy)/net).toFixed(1)} 模拟小时充满`:net<0?`按当前负载可支撑 ${(p.energy/-net).toFixed(1)} 模拟小时`:p.energy>=60?'电池已满 · 限制充电':'当前无储能收支';
 $('.pu-generation').textContent=generation.toFixed(2)+' kW';$('.pu-device-state').textContent=`${s.expanded?'阵列已展开':'阵列未展开'} · ${s.isolated?'光伏已隔离':'光伏接通'} · 积尘损失 ${(s.dust*100).toFixed(1)}% · 输出 ${generation.toFixed(2)} kW`;$('.pu-array').textContent=`${s.expanded?'已展开':'未展开'} · ${s.isolated?'光伏已隔离':'光伏输入接通'} · 积尘损失 ${(s.dust*100).toFixed(1)}%`;
 $('.pu-storage').textContent=p.energy.toFixed(1)+' kWh';$('.pu-cable').textContent=`电缆已用 ${p.links.reduce((v,id)=>v+(id==='solar'?12:6),0)} m / 随船 100 m · 验收 ${p.online?'已通过':'待完成'}`;$('.pu-battery').textContent=`${Math.round(p.energy/60*100)}% · ${p.links.includes('solar')?'光伏线已接':'光伏线未接'} · ${p.links.includes('bus')?'配电线已接':'配电线未接'}`;
 $('.pu-ares').textContent=ares.toFixed(1)+' kW';$('.pu-ares-row').hidden=ares<=0;
 $('.pu-load').textContent=load.toFixed(1)+' kW';$('.pu-rover').textContent=rover.toFixed(1)+' kW';$('.pu-rover-row').hidden=rover<=0;
 let warning=!p.online?'按施工指引完成展开、两段接线和验收。':s.isolated?'光伏已隔离。营地仍耗电；除尘结束后需要手动恢复并网。':p.energy<=0?'储能耗尽。当前光伏可能不足以维持负载，MU-7 充电受限。':p.energy<12?'主电池低电量，检查光伏和非必要充电。':'供电正常，夜间由主电池承担营地负载。';
 if(p.online&&m.night){const cost=2*m.secondsToDawn/120;warning+=` 距天亮需 ${cost.toFixed(1)} kWh${p.energy<cost?'，预计缺口 '+(cost-p.energy).toFixed(1)+' kWh':'，当前储能可覆盖'}（仅持续负载）。`;}
 $('.pu-warning').textContent=warning;
 const onsite=m.mode==='walk'&&m.outside&&m.solar&&Math.hypot(m.player.x-m.solar.x,m.player.z-m.solar.z)<=3;
 $('.pu-reach').textContent=m.frozen?'游戏已冻结，恢复后才可操作。':!p.installed?'先安装设备。':!onsite?`舱外步行到阵列操作点 3 m 内${m.solar?' · 当前 '+Math.hypot(m.player.x-m.solar.x,m.player.z-m.solar.z).toFixed(1)+' m · 方位 '+Math.round((Math.atan2(m.solar.x-m.player.x,m.player.z-m.solar.z)*180/Math.PI+360)%360)+'°':''}。`:'已到阵列操作点。先隔离，再除尘，最后恢复光伏并网。';
 for(const b of $('.pu-actions').children){const a=b.dataset.action;b.hidden=a==='expand-solar'?s.expanded:a==='isolate-solar'?s.isolated:a==='reconnect-solar'?!s.isolated||!p.links.includes('solar'):a==='cancel-solar-job'?!job:false;
  b.disabled=m.frozen||!onsite||!p.installed||(a==='cancel-solar-job'?!job:!!job)||(a==='clean-solar'&&(!s.expanded||!s.isolated||s.dust<=.001))||(a==='reconnect-solar'&&!s.expanded);
  b.textContent=labels[a]+(a==='clean-solar'&&!s.isolated?' · 先隔离':a==='clean-solar'&&s.dust<=.001?' · 面板洁净':'');
  b.title=a==='clean-solar'&&!s.isolated?'先隔离光伏输入':a==='clean-solar'&&s.dust<=.001?'面板洁净，无需除尘':!onsite?'需到阵列操作点 3 m 内':'';
 }
 $('.pu-job').hidden=!job;if(job){const duration=job.type==='expand'?SOLAR_SERVICE.expandSeconds:SOLAR_SERVICE.cleanSeconds;$('.pu-job label').textContent=(m.jobWaiting?'刷新恢复 · 返回操作点续作 · ':'')+`${job.type==='expand'?'展开面板':'无水除尘'} · ${Math.round(job.elapsed/duration*100)}% · 剩余 ${Math.max(0,duration-job.elapsed).toFixed(1)} 秒` ;$('.pu-job progress').value=job.elapsed/duration;}
 layout();
 }
 return {render,open(){if(!expanded)summary.click();}};
}
