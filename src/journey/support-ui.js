import {CREW_SUPPORT,shipmentSupport} from './support.js';
import {getSettings} from './state.js';
import {createVoice} from '../cards/voice.js';

export function mountSupportUI({read,setOverlay,requestWater,requestRescue,requestCrew,locate,notify}){
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./support.css',import.meta.url).href;document.head.append(style);
 const voice=createVoice({enabled:()=>getSettings().voice});let dialog=null;
 function close(){if(!dialog)return;dialog.remove();dialog=null;setOverlay(false);voice.stop();}
 function speak(text){notify(text);voice.speak(text);}
 function button(label,id,fn){const b=document.createElement('button');b.textContent=label;b.dataset.supportAction=id;b.onclick=fn;return b;}
 function row(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
 function paint(){if(!dialog)return;const s=read();dialog.replaceChildren();const header=document.createElement('header'),h=document.createElement('h2');h.textContent='请求支援';header.append(h,button('关闭 · Esc','close',close));dialog.append(header);
  row(dialog,'可调用的是预先运抵火星轨道的有限货物与队员。');
  const water=document.createElement('section');water.dataset.supportSection='water';const w=s.water,sh=shipmentSupport(w);row(water,'水务批次 WATER-01 · '+sh.status);
  row(water,'提取模块×1、净化模块×1、5 L密封罐×3、滤材×2；总质量220 kg，需腾空ARES货位。');
  if(w?.requestedAt)row(water,'回执 WATER-01 · 请求已确认，本批只发运一次。');
  if(w?.cargo==='falling')row(water,'预计落区正在投送。尚未收到落稳信标，不能提前领取。');
  if(sh.confirmed&&w.stop)row(water,`确认停车点：X ${w.stop.x.toFixed(1)} m / Z ${w.stop.z.toFixed(1)} m（场景局部坐标）。`);
  if(w?.confirmedAt)row(water,'落稳信标确认时间：'+new Date(w.confirmedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'}));
  if(w?.cargo==='orbit'){const b=button('核单并申请水务设备','water',async()=>{close();const ok=await requestWater();if(ok)speak('请求已经确认。本批设备正在投送，落稳以后再去接。');});b.disabled=!s.waterAvailable;b.title=s.waterAvailable?'':'先完成第七章，在家门外申请。';water.append(b);}
  if(sh.canLocate)water.append(button(w.cargo==='ground'?'查看接货定位':'查看返营卸货定位','water-location',()=>{close();locate({...sh.point,id:'water-support',name:w.cargo==='ground'?'WATER-01 · 确认接货点':'水务设备 · 营地卸货点'});}));
  if(!w)row(water,'设备申请在营地主线第八章开放。');dialog.append(water);
  const rescue=document.createElement('section');rescue.dataset.supportSection='rescue';const r=s.rescue;row(rescue,'NX07接应 · '+({requested:'请求已保存，等待可用落点',enroute:'接应途中',landed:'已落稳，等待你登船',aboard:'人员已登船，车辆/货物按原状态保留'}[r?.status]||'尚未申请'));
  if(r?.target)row(rescue,`会合落点：X ${r.target.x.toFixed(1)} m / Z ${r.target.z.toFixed(1)} m。落稳前留在人员等待点，避开机腹。`);
  const rb=button(s.rescueFlying?'NX07正在接应':r&&r.status!=='aboard'?'继续请求接应':'发送当前位置，请求接应','rescue',()=>{close();requestRescue();});rb.disabled=!s.canRescue||s.rescueFlying;rb.title=s.canRescue?'':'停稳下车，在舱外步行状态下请求；NX07需已部署。';rescue.append(rb);
  if(r?.target)rescue.append(button('查看接应定位','rescue-location',()=>{close();locate({...(r.status==='landed'?r.target:r.origin),id:'rescue-support',name:r.status==='landed'?'NX07 · 已落稳会合点':'接应 · 人员等待点'});}));dialog.append(rescue);
  const crew=document.createElement('section');crew.dataset.supportSection='crew';row(crew,'专家支援 · 轨道待命');
  row(crew,'登记后可收到远程答复。人员下降前须完成生活保障容量和接人座位验收。');
  for(const [id,c] of Object.entries(CREW_SUPPORT)){const pending=s.crew?.[id];const b=button(pending?`${c.name} · 申请已登记`:`申请${c.name}支援`,'crew-'+id,()=>{requestCrew(id);speak(c.reply);paint();});b.disabled=!!pending;crew.append(b);if(pending)row(crew,c.reply);}dialog.append(crew);
 }
 return {say:speak,open(){if(dialog)return;dialog=document.createElement('dialog');dialog.className='support-dialog';dialog.setAttribute('aria-label','请求支援与定位');dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(dialog);setOverlay(true);paint();dialog.showModal();},close};
}
