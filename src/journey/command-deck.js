/** Snapshot-only command deck. It owns no movement, resource or mission simulation.
 * heading: compass degrees, 0 = world -Z, clockwise. Optional navRange is metres;
 * optional communications is a real connection/status label supplied by the game.
 */
const STORE = 'cosmos.command-deck.inbox.v1';
const LIMIT = 80;
const modes = [['walk','EVA'],['remote','MU-7'],['carrier','ARES'],['flight','NX07']];
const node = (tag, className, text) => {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text != null) value.textContent = String(text);
  return value;
};
const text = (element, value) => { const next = String(value ?? '—'); if (element.textContent !== next) element.textContent = next; };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct = value => finite(value) ? clamp(Number(value),0,100) : null;
const tone = value => ['cyan','green','amber','red','dim'].includes(value) ? value : 'cyan';
const validPoint = value => value && finite(value.x) && finite(value.z);
const degrees = value => ((Number(value) || 0) % 360 + 360) % 360;
const formatDistance = distance => distance >= 1000 ? `${(distance/1000).toFixed(1)} km` : `${Math.round(distance)} m`;

function keyed(container, values, make, paint, key = item => item.id) {
  const existing = new Map([...container.children].map(el => [el.dataset.item,el]));
  values.forEach((item, index) => {
    const id = String(key(item,index));
    const element = existing.get(id) || make(item,index);
    element.dataset.item = id;
    paint(element,item,index);
    if (container.children[index] !== element) container.insertBefore(element,container.children[index] || null);
    existing.delete(id);
  });
  for (const element of existing.values()) element.remove();
}

export function mountCommandDeck({onAction = () => {}, onOverlay = () => {}, onView = () => {}} = {}) {
  const storeKey = `${STORE}:${location.pathname}${location.search}`;
  document.body.classList.add('command-deck-active');
  const css = node('link'); css.rel = 'stylesheet'; css.href = new URL('./command-deck.css',import.meta.url).href; document.head.append(css);
  const root = node('section','cd-root'); root.setAttribute('aria-label','任务操作台');
  root.innerHTML = `
    <header class="cd-top"><b class="cd-brand">COSMOS <span>// COMMAND DECK</span></b><button type="button" class="cd-time" data-action="time" aria-label="打开时段选择">—</button><span class="cd-site">—</span><span class="cd-communications">任务通信</span><button class="cd-inbox-button" type="button" aria-label="打开消息日志">✉ <span>0</span> <kbd>J</kbd></button><button class="cd-pause" type="button" data-action="pause" aria-label="暂停游戏">暂停 <kbd>Esc</kbd></button></header>
    <div class="cd-center"><div class="cd-compass" aria-label="航向"><div class="cd-compass-ticks"></div><span class="cd-compass-pointer">▴</span><b class="cd-heading">000°</b></div><div class="cd-status" role="status"></div></div>
    <aside class="cd-toast" aria-live="polite" hidden><div class="cd-message-meta"><b class="cd-message-source"></b><time></time></div><div class="cd-message-title"><span class="cd-message-kind"></span><strong></strong></div><p></p><div class="cd-message-footer"><button type="button" class="cd-open-log">任务日志 <kbd>J</kbd></button><button type="button" class="cd-ack">知道了 <kbd>Enter</kbd></button></div><i class="cd-message-timer"></i></aside>
    <div class="cd-instruments"><aside class="cd-instrument cd-instrument-left" hidden></aside><aside class="cd-instrument cd-instrument-right" hidden></aside></div>
    <div class="cd-bottom"><nav class="cd-mobile-tabs" aria-label="操作台面板"><button type="button" data-panel="actions" aria-pressed="true">操作</button><button type="button" data-panel="navigation" aria-pressed="false">导航</button><button type="button" data-panel="identity" aria-pressed="false">状态</button><button type="button" data-panel="inventory" aria-pressed="false">物资</button><button type="button" data-panel="mission" aria-pressed="false">任务</button></nav>
    <div class="cd-dock" data-panel="actions">
      <section class="cd-panel cd-navigation" data-pane="navigation"><div class="cd-nav-head"><button type="button" class="cd-panel-title cd-map-button" data-action="map">周边导航 <kbd>M</kbd></button><button type="button" class="cd-route-button" data-action="route" aria-label="打开游隼航线图">航线图 ↗</button></div><canvas class="cd-map" aria-label="当前真实位置、路线和标记"></canvas><div class="cd-map-foot"></div></section>
      <section class="cd-panel cd-identity" data-pane="identity"><nav class="cd-mode-tabs" aria-label="查看主体"></nav><div class="cd-ident-body"><div class="cd-portrait"><div class="cd-emblem" aria-hidden="true"></div><div class="cd-ident-text"><strong class="cd-title"></strong><div class="cd-subtitle"></div></div><button type="button" class="cd-portrait-turn" data-step="-1" aria-label="上一个主体" title="上一个主体">‹</button><button type="button" class="cd-portrait-turn" data-step="1" aria-label="下一个主体" title="下一个主体">›</button><span class="cd-portrait-index"></span></div><div class="cd-ident-side"><dl class="cd-metrics"></dl><button type="button" class="cd-take-control" hidden></button></div></div><div class="cd-summon" aria-label="召唤载具"></div><details class="cd-instrument-details"><summary>仪器读数</summary><div class="cd-inline-instruments"></div></details></section>
      <section class="cd-panel cd-actions-panel" data-pane="actions"><div class="cd-resource-bars"></div><div class="cd-actions"></div><button type="button" class="cd-more-actions" aria-expanded="false" hidden>更多操作</button><div class="cd-empty-actions" hidden>当前没有可用操作</div></section>
      <section class="cd-panel cd-inventory-panel" data-pane="inventory"><h2 class="cd-panel-title">物资与载荷 <span class="cd-inventory-count"></span></h2><div class="cd-inventory"></div><div class="cd-empty-inventory" hidden>当前无物资数据</div></section>
      <section class="cd-panel cd-mission-panel" data-pane="mission"><button type="button" class="cd-panel-title cd-mission-title" data-action="mission">任务详情</button><p class="cd-mission-body"></p><div class="cd-progress cd-mission-progress" hidden><i></i></div><ol class="cd-mission-steps"></ol><button class="cd-emergency" type="button" hidden></button></section>
    </div></div>
    <dialog class="cd-log"><header><div><span>COMMAND LOG</span><h2>任务通信</h2></div><button type="button" class="cd-close-log" aria-label="关闭消息日志">关闭 <kbd>Esc</kbd></button></header><div class="cd-log-tools"><span class="cd-log-count"></span><button type="button" class="cd-read-all">全部标为已读</button></div><div class="cd-log-list"></div><footer class="cd-log-storage">消息保存在当前浏览器，最多保留80条。</footer></dialog>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const refs = Object.fromEntries(['time','site','communications','heading','status','title','subtitle'].map(id=>[id,$(`.cd-${id}`)]));
  const dock = $('.cd-dock'), log = $('.cd-log'), toast = $('.cd-toast'), canvas = $('.cd-map');
  const context = canvas.getContext('2d');
  let snapshot = {}, destroyed = false, held = null, messages = [], shownId = null, toastTimer = null, lastFocus = null;
  let actionsExpanded = false, view = 'walk', viewMode = '';
  let storageWorks = true, toastStarted = 0, toastRemaining = 8500, logOpen = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '[]');
    if (Array.isArray(saved)) messages = saved.filter(m => m && typeof m.id==='string' && typeof m.title==='string' && typeof m.body==='string' && finite(m.at)).slice(-LIMIT).map(m=>({...m,read:!!m.read}));
  } catch { storageWorks = false; }

  const persist = () => {
    try { localStorage.setItem(storeKey,JSON.stringify(messages)); }
    catch { storageWorks = false; }
    text($('.cd-log-storage'),storageWorks ? '消息保存在当前浏览器，最多保留80条。' : '浏览器未允许保存，消息仅保留在本次会话。');
  };
  const dispatch = (id, pressed) => {
    if (destroyed) return;
    try {
      const result = pressed == null ? onAction(id) : onAction(id,pressed);
      if (result?.catch) result.catch(error=>notify({title:'操作未完成',body:error?.message || String(error),kind:'warning'}));
    } catch(error) { notify({title:'操作未完成',body:error?.message || String(error),kind:'warning'}); }
  };
  const endHold = () => {
    if (!held) return;
    const previous = held; held = null;
    previous.button.classList.remove('cd-held');
    dispatch(previous.id,false);
  };
  function refreshMessages() {
    const unread = messages.filter(m=>!m.read).length;
    text($('.cd-inbox-button span'),unread);
    $('.cd-inbox-button').classList.toggle('cd-unread',unread>0);
    $('.cd-inbox-button').setAttribute('aria-label',`打开消息日志，${unread}条未读`);
    text($('.cd-log-count'),`${messages.length} 条消息 · ${unread} 条未读`);
    $('.cd-read-all').disabled = unread===0;
    const list = $('.cd-log-list');
    keyed(list,[...messages].reverse(),()=>{
      const item=node('article','cd-log-entry');
      item.innerHTML='<div class="cd-log-entry-meta"><b></b><time></time></div><h3></h3><p></p><button type="button">标为已读</button>';
      item.querySelector('button').addEventListener('click',()=>readMessage(item.dataset.item));
      return item;
    },(element,m)=>{
      element.classList.toggle('cd-is-unread',!m.read);
      text(element.querySelector('b'),m.source || '现场系统');
      text(element.querySelector('time'),new Date(m.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}));
      text(element.querySelector('h3'),m.title); text(element.querySelector('p'),m.body);
      const button=element.querySelector('button');button.disabled=m.read;text(button,m.read?'已读':'标为已读');
    });
    if (!messages.length) { const empty=node('p','cd-log-empty','还没有通信记录。任务与现场事件到达后会显示在这里。');list.append(empty); }
  }
  function dismissToast() { clearTimeout(toastTimer);toastTimer=null;shownId=null;toast.hidden=true; }
  function readMessage(id) {
    const message=messages.find(m=>m.id===id); if (!message) return;
    message.read=true;persist();refreshMessages();if(shownId===id)dismissToast();
  }
  function armToastTimer() {
    clearTimeout(toastTimer);toastTimer=null;
    if (!shownId || document.hidden || snapshot.paused || logOpen) return;
    toastStarted=performance.now();
    const bar=$('.cd-message-timer');bar.style.animation='none';void bar.offsetWidth;
    bar.style.animation=`cd-countdown ${toastRemaining}ms linear forwards`;
    toastTimer=setTimeout(()=>dismissToast(),toastRemaining);
  }
  function pauseToastTimer() {
    if (toastTimer) toastRemaining=Math.max(0,toastRemaining-(performance.now()-toastStarted));
    clearTimeout(toastTimer);toastTimer=null;$('.cd-message-timer').style.animationPlayState='paused';
  }
  function notify({title,body,source='现场系统',kind='info'}={}) {
    if(destroyed || (!title && !body))return;
    const message={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:String(title || '现场消息'),body:String(body || ''),source:String(source),kind:String(kind),at:Date.now(),read:false};
    messages.push(message);messages=messages.slice(-LIMIT);persist();refreshMessages();
    shownId=message.id;toastRemaining=8500;toast.hidden=false;
    const warning=['warning','warn','error','danger'].includes(kind);
    toast.dataset.tone=warning?'amber':kind==='success'?'green':'cyan';
    text($('.cd-message-source'),message.source);text(toast.querySelector('time'),new Date(message.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
    text($('.cd-message-kind'),warning?'提醒':kind==='success'?'完成':'消息');
    text(toast.querySelector('strong'),message.title);text(toast.querySelector('p'),message.body);
    armToastTimer();
  }
  function closeLog() {
    if(!logOpen)return;
    logOpen=false;if(log.open)log.close();onOverlay(false);
    if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
    armToastTimer();
  }
  function openLog() {
    if(logOpen){closeLog();return;}
    endHold();lastFocus=document.activeElement;logOpen=true;pauseToastTimer();refreshMessages();
    log.showModal();onOverlay(true);$('.cd-close-log').focus();
  }
  $('.cd-inbox-button').addEventListener('click',openLog);$('.cd-open-log').addEventListener('click',openLog);
  $('.cd-close-log').addEventListener('click',closeLog);$('.cd-ack').addEventListener('click',()=>readMessage(shownId));
  $('.cd-read-all').addEventListener('click',()=>{messages.forEach(m=>m.read=true);persist();refreshMessages();dismissToast();});
  log.addEventListener('cancel',event=>{event.preventDefault();closeLog();});
  log.addEventListener('close',()=>{if(logOpen)closeLog();});
  log.addEventListener('click',event=>{if(event.target===log){const r=log.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeLog();}});

  $('.cd-more-actions').addEventListener('click',()=>{actionsExpanded=!actionsExpanded;update(snapshot);});
  canvas.addEventListener('click',()=>dispatch('map'));canvas.title='打开完整地图';
  for(const [id,label] of modes){const b=node('button','',label);b.type='button';b.dataset.view=id;$('.cd-mode-tabs').append(b);}
  // Tabs and the portrait arrows only choose which craft the identity card shows; taking control is the card's own button.
  function select(id){
    if(!Array.isArray(snapshot.subjects)||!snapshot.subjects.length){dispatch(`mode:${id}`);return;}
    if(id===view)return;view=id;paintIdentity();onView(id);
  }
  root.addEventListener('click',event=>{
    const pick=event.target.closest('button[data-view],button[data-step]');
    if(pick){
      if(pick.disabled)return;
      const index=modes.findIndex(([id])=>id===view),step=Number(pick.dataset.step);
      select(pick.dataset.view||modes[(index+step+modes.length)%modes.length][0]);return;
    }
    const panel=event.target.closest('[data-panel]');
    if(panel?.tagName==='BUTTON'){
      dock.dataset.panel=panel.dataset.panel;
      root.querySelectorAll('.cd-mobile-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b===panel)));
      drawMap();return;
    }
    const button=event.target.closest('button[data-action]');
    if(!button||button.disabled||button.dataset.hold==='true')return;
    dispatch(button.dataset.action);
  });
  root.addEventListener('pointerdown',event=>{
    // Mouse clicks must not leave focus on a selector, or Space (brake) would re-trigger it.
    if(event.target.closest('button[data-view],button[data-step]'))event.preventDefault();
    const button=event.target.closest('button[data-hold="true"]');
    if(!button||button.disabled||event.button!==0)return;
    event.preventDefault();endHold();try{button.setPointerCapture?.(event.pointerId);}catch{/* Window release remains the fallback when capture is unavailable. */}
    held={id:button.dataset.action,button,pointerId:event.pointerId};button.classList.add('cd-held');dispatch(held.id,true);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(event,e=>{if(held&&e.pointerId===held.pointerId)endHold();});
  const release=e=>{if(held&&e.pointerId===held.pointerId)endHold();};
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
  // Focused hold buttons remain accessible; these are activation keys only,
  // not replacements for the game's E/WASD and other movement bindings.
  root.addEventListener('keydown',event=>{
    const button=event.target.closest('button[data-hold="true"]');
    if(button&&!button.disabled&&[' ','Enter'].includes(event.key)){
      event.preventDefault();event.stopPropagation();if(!event.repeat&&!held){held={id:button.dataset.action,button};button.classList.add('cd-held');dispatch(held.id,true);}
    }
  });
  root.addEventListener('keyup',event=>{if(held&&!held.pointerId&&[' ','Enter'].includes(event.key)){event.preventDefault();event.stopPropagation();endHold();}});
  const onKey=event=>{
    if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.repeat)return;
    if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key.toLowerCase()==='j'){
      if(document.querySelector('dialog[open]')&&!logOpen)return;
      event.preventDefault();event.stopImmediatePropagation();openLog();
    }else if(event.key==='Escape'&&logOpen){event.preventDefault();event.stopImmediatePropagation();closeLog();}
    else if(event.key==='Enter'&&shownId&&!logOpen&&!event.target?.closest?.('button,a')){event.preventDefault();event.stopImmediatePropagation();readMessage(shownId);}
  };
  document.addEventListener('keydown',onKey,true);
  const visibility=()=>{endHold();if(document.hidden)pauseToastTimer();else armToastTimer();};
  const blur=()=>endHold();document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);

  function drawMap() {
    if(destroyed||!context)return;
    const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),w=rect.width,h=rect.height;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const c=context;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    const center=validPoint(snapshot.position)?snapshot.position:null;
    const markers=(snapshot.markers||[]).filter(validPoint),route=(snapshot.route||[]).filter(validPoint);
    const cx=w/2,cy=h/2+2,r=Math.max(10,Math.min(w/2-13,h/2-16));
    c.strokeStyle='#17313c';c.lineWidth=1;
    for(const scale of [.5,1]){c.beginPath();c.arc(cx,cy,r*scale,0,Math.PI*2);c.stroke();}
    c.beginPath();c.moveTo(cx-r,cy);c.lineTo(cx+r,cy);c.moveTo(cx,cy-r);c.lineTo(cx,cy+r);c.stroke();
    c.font='10px monospace';c.textAlign='center';c.fillStyle='#82949f';c.fillText('N',cx,cy-r-5);
    if(!center){text($('.cd-map-foot'),'位置数据待接入');return;}
    const far=Math.max(40,...[...markers,...route].map(p=>Math.hypot(p.x-center.x,p.z-center.z)));
    // While a vehicle is being summoned, zoom to its distance so the approach stays readable.
    const summonFar=Math.max(0,...markers.filter(p=>p.summoning).map(p=>Math.hypot(p.x-center.x,p.z-center.z)));
    const range=finite(snapshot.navRange)&&Number(snapshot.navRange)>0?Number(snapshot.navRange):summonFar?clamp(summonFar*1.3,40,1500):clamp(far*1.15,50,1500);
    const map=p=>[cx+(p.x-center.x)/range*r,cy+(p.z-center.z)/range*r];
    c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
    if(route.length){c.strokeStyle='#22d3ee';c.lineWidth=1.5;c.beginPath();route.forEach((p,i)=>{const [x,y]=map(p);if(!i)c.moveTo(x,y);else c.lineTo(x,y);});c.stroke();}
    c.restore();
    // Summoned vehicles draw last: blinking cyan diamond, expanding ring and a dashed approach line.
    const shown=markers.slice(0,24),summoned=shown.filter(p=>p.summoning),now=performance.now()/1000;
    [...shown.filter(p=>!p.summoning),...summoned].forEach((point,index)=>{
      const dx=point.x-center.x,dz=point.z-center.z,dist=Math.hypot(dx,dz),scale=dist>range?range/dist*.94:1;
      const x=cx+dx/range*r*scale,y=cy+dz/range*r*scale;
      if(point.summoning){
        const wave=(now*.8)%1,on=(now*1.25)%1<.55;
        c.save();c.strokeStyle='rgba(34,211,238,.35)';c.setLineDash([3,3]);c.beginPath();c.moveTo(x,y);c.lineTo(cx,cy);c.stroke();c.setLineDash([]);
        c.strokeStyle=`rgba(34,211,238,${(1-wave)*.9})`;c.lineWidth=1.5;c.beginPath();c.arc(x,y,5+wave*11,0,Math.PI*2);c.stroke();
        c.fillStyle=c.strokeStyle='#22d3ee';c.beginPath();c.moveTo(x,y-5);c.lineTo(x+5,y);c.lineTo(x,y+5);c.lineTo(x-5,y);c.closePath();if(on)c.fill();c.stroke();
        c.font='bold 9px monospace';c.textAlign='left';const tag=String(point.label||'载具').split(' ')[0]+' · 召唤中 '+formatDistance(dist),tw=c.measureText(tag).width;c.fillText(tag,clamp(x>cx?x-9-tw:x+9,2,Math.max(2,w-tw-2)),clamp(y-7,11,h-13));c.restore();return;
      }
      c.fillStyle=typeof point.color==='string'?point.color:'#f5a524';c.strokeStyle=c.fillStyle;
      c.beginPath();c.moveTo(x,y-4);c.lineTo(x+4,y);c.lineTo(x,y+4);c.lineTo(x-4,y);c.closePath();c.stroke();
      if(index<5&&!summoned.length){c.font='9px monospace';c.textAlign=x>cx?'right':'left';c.fillText(String(point.label||'标记').slice(0,11),x+(x>cx?-7:7),clamp(y-6,11,h-13));}
    });
    c.save();c.translate(cx,cy);c.rotate(degrees(snapshot.heading)*Math.PI/180);c.fillStyle='#34d399';c.beginPath();c.moveTo(0,-8);c.lineTo(5,6);c.lineTo(0,3);c.lineTo(-5,6);c.closePath();c.fill();c.restore();
    text($('.cd-map-foot'),`半径 ${formatDistance(range)} · X ${Math.round(center.x)} / Z ${Math.round(center.z)}`);
  }
  // Canvas bitmap writes must happen outside ResizeObserver delivery, including
  // the first layout while the dynamically loaded deck stylesheet is pending.
  let mapFrame=0;
  const observer=new ResizeObserver(()=>{if(!mapFrame)mapFrame=requestAnimationFrame(()=>{mapFrame=0;drawMap();});});observer.observe(canvas);

  function paintIdentity() {
    const mode=snapshot.mode||'overview',subjects=Array.isArray(snapshot.subjects)?snapshot.subjects:[],subject=subjects.find(s=>s.id===view);
    const shown=subject?view:mode==='survival'?'walk':mode;
    text(refs.title,subject?subject.title:snapshot.title||({walk:'舱外步行',remote:'MU-7',carrier:'ARES',flight:'NX07',survival:'生存准备'}[mode]||'任务总览'));
    text(refs.subtitle,subject?subject.subtitle:snapshot.subtitle||'');
    // Looking is allowed while paused or mid-transfer; only taking control waits. Without subjects the tabs keep the old mode switch.
    root.querySelectorAll('.cd-mode-tabs button').forEach(button=>{const id=button.dataset.view;button.setAttribute('aria-pressed',String(id===shown));button.classList.toggle('cd-live',!!subjects.find(s=>s.id===id)?.live);button.disabled=!subjects.length&&!!snapshot.paused;});
    root.querySelectorAll('.cd-portrait-turn').forEach(button=>{button.hidden=!subjects.length;});
    const index=modes.findIndex(([id])=>id===shown);text($('.cd-portrait-index'),subjects.length&&index>=0?`${index+1} / ${modes.length}`:'');
    text($('.cd-emblem'),{walk:'◉',survival:'◉',remote:'⊞',carrier:'▥',flight:'△',overview:'◎'}[shown]||'◎');
    const rows=subject?[{label:'状态',value:subject.state,tone:subject.tone,state:true},...(subject.rows||[])]:Array.isArray(snapshot.metrics)?snapshot.metrics:[];
    keyed($('.cd-metrics'),rows,()=>{const row=node('div');row.append(node('dt'),node('dd'));return row;},(row,m)=>{text(row.querySelector('dt'),m.label);text(row.querySelector('dd'),`${m.value??'—'}${m.unit?' '+m.unit:''}`);row.dataset.tone=tone(m.tone);row.classList.toggle('cd-state',!!m.state);},(m,i)=>`${view}:${i}:${m.label}`);
    // The craft being operated needs no switch; its state row already says so.
    const take=$('.cd-take-control'),control=subject&&!subject.live?subject.control:null;take.hidden=!control;
    if(control){take.dataset.action=control.id;take.disabled=!!control.disabled||!!snapshot.paused;text(take,control.label);take.title=control.disabled?control.reason||control.label:control.label;}
    else delete take.dataset.action;
  }

  function update(next={}) {
    if(destroyed)return;
    const wasPaused=!!snapshot.paused;if(snapshot.mode!==next.mode)actionsExpanded=false;snapshot=next;
    if(snapshot.paused&&!wasPaused){endHold();pauseToastTimer();}else if(!snapshot.paused&&wasPaused)armToastTimer();
    const mode=snapshot.mode||'overview';root.dataset.mode=mode;root.classList.toggle('cd-is-paused',!!snapshot.paused);
    text(refs.time,snapshot.time||'—');text(refs.site,snapshot.site||'—');text(refs.communications,snapshot.communications||'任务通信');
    text(refs.status,snapshot.paused?'已暂停':snapshot.status||'');refs.status.hidden=!refs.status.textContent;
    const heading=degrees(snapshot.heading);text(refs.heading,`${String(Math.round(heading)%360).padStart(3,'0')}°`);
    const tick=$('.cd-compass-ticks');const tickValues=[];
    for(let offset=-3;offset<=3;offset++){const value=Math.floor(heading/15)*15+offset*15;tickValues.push({id:String(offset),value,x:(value-heading)*3});}
    keyed(tick,tickValues,()=>node('span'),(el,t)=>{const d=degrees(t.value);text(el,{0:'N',90:'E',180:'S',270:'W'}[d]??String(d).padStart(3,'0'));el.style.transform=`translateX(${t.x}px)`;el.classList.toggle('cd-cardinal',d%90===0);});
    // A change of control brings the card to the craft now being operated.
    if(mode!==viewMode){viewMode=mode;const live=mode==='survival'?'walk':mode;if(modes.some(([id])=>id===live))view=live;}
    paintIdentity();
    const metrics=Array.isArray(snapshot.metrics)?snapshot.metrics:[];
    keyed($('.cd-resource-bars'),metrics.filter(m=>pct(m.percent)!==null).slice(0,2),()=>{const bar=node('div','cd-bar');bar.append(node('i'),node('span'));return bar;},(bar,m)=>{bar.dataset.tone=tone(m.tone);bar.querySelector('i').style.width=`${pct(m.percent)}%`;text(bar.querySelector('span'),`${m.label} · ${m.value??'—'}${m.unit?' '+m.unit:''}`);},(m,i)=>`${i}:${m.label}`);
    keyed($('.cd-summon'),Array.isArray(snapshot.summon)?snapshot.summon:[],()=>{const button=node('button','cd-summon-button');button.type='button';button.innerHTML='<strong></strong><small></small>';return button;},(button,a)=>{
      button.dataset.action=a.id;button.disabled=!!a.disabled||!!snapshot.paused;button.classList.toggle('cd-active',!!a.active);button.classList.toggle('cd-ready',!a.disabled);
      text(button.querySelector('strong'),a.label);text(button.querySelector('small'),a.state||'');button.title=[a.label,a.state].filter(Boolean).join(' · ');
    });
    const actions=Array.isArray(snapshot.actions)?snapshot.actions:[];
    if(held&&(!actions.some(a=>a.id===held.id&&!a.disabled)||snapshot.paused))endHold();
    keyed($('.cd-actions'),actionsExpanded?actions:actions.slice(0,6),()=>{const button=node('button','cd-action');button.type='button';button.innerHTML='<kbd></kbd><strong></strong><small></small>';return button;},(button,a)=>{
      button.dataset.action=a.id;button.dataset.hold=String(!!a.hold);button.disabled=!!a.disabled||!!snapshot.paused;
      button.classList.toggle('cd-active',!!a.active);button.classList.toggle('cd-ready',!a.disabled&&!a.active);
      text(button.querySelector('kbd'),a.key?`${a.hold?'长按 ':''}${a.key}`:a.hold?'按住执行':'操作');text(button.querySelector('strong'),a.label);
      const detail=a.disabled?(a.reason||a.detail||'当前条件不满足'):(a.detail||'');text(button.querySelector('small'),detail);button.title=[a.label,detail].filter(Boolean).join(' · ');
    });$('.cd-empty-actions').hidden=actions.length>0;
    const more=$('.cd-more-actions');more.hidden=actions.length<=6;more.setAttribute('aria-expanded',String(actionsExpanded));text(more,actionsExpanded?'收起更多操作':`更多操作 · ${actions.length-6} 项 ↓`);
    const inventory=Array.isArray(snapshot.inventory)?snapshot.inventory:[];text($('.cd-inventory-count'),`[${inventory.length}]`);
    keyed($('.cd-inventory'),inventory,()=>{const button=node('button','cd-bay');button.type='button';button.innerHTML='<span></span><strong></strong><small></small>';return button;},(button,item)=>{
      button.dataset.action=item.id;button.disabled=!!item.disabled||!!snapshot.paused;text(button.querySelector('span'),item.label);text(button.querySelector('strong'),item.value);text(button.querySelector('small'),item.detail||'');button.title=[item.label,item.value,item.detail].filter(Boolean).join(' · ');
    });$('.cd-empty-inventory').hidden=inventory.length>0;
    const mission=snapshot.mission||{};text($('.cd-mission-title'),mission.title||'任务详情');text($('.cd-mission-body'),mission.body||'暂无当前任务');
    const progress=pct(mission.progress);$('.cd-mission-progress').hidden=progress===null;if(progress!==null)$('.cd-mission-progress i').style.width=`${progress}%`;
    keyed($('.cd-mission-steps'),mission.steps||[],()=>node('li'),(row,step)=>{text(row,`${step.done?'✓':'○'} ${step.label}`);row.classList.toggle('cd-done',!!step.done);},(step,i)=>i);
    const emergency=snapshot.emergency,b=$('.cd-emergency');b.hidden=!emergency;if(emergency){b.dataset.action=emergency.id;b.disabled=!!emergency.disabled||!!snapshot.paused;text(b,`⚠ ${emergency.label}`);b.title=emergency.reason||emergency.label;}
    text($('.cd-map-button'),`${snapshot.navLabel||'周边导航'} · M`);
    const instruments=Array.isArray(snapshot.instruments)?snapshot.instruments:[];
    $('.cd-instrument-details').hidden=!instruments.length;
    keyed($('.cd-inline-instruments'),instruments,()=>{const section=node('section','cd-inline-instrument');section.innerHTML='<h3></h3><dl></dl>';return section;},(section,data)=>{
      text(section.querySelector('h3'),data.title);
      keyed(section.querySelector('dl'),data.rows||[],()=>{const row=node('div');row.append(node('dt'),node('dd'));return row;},(row,m)=>{text(row.querySelector('dt'),m.label);text(row.querySelector('dd'),m.value);},(m,j)=>`${j}:${m.label}`);
    },(data,i)=>`${i}:${data.title}`);
    for(let i=0;i<2;i++){
      const host=$(i?'.cd-instrument-right':'.cd-instrument-left'),data=instruments[i];host.hidden=!data;
      if(!data)continue;
      if(!host.firstChild)host.innerHTML='<h2></h2><dl></dl><div class="cd-progress"><i></i></div>';
      text(host.querySelector('h2'),data.title);
      keyed(host.querySelector('dl'),data.rows||[],()=>{const row=node('div');row.append(node('dt'),node('dd'));return row;},(row,m)=>{text(row.querySelector('dt'),m.label);text(row.querySelector('dd'),m.value);},(m,j)=>`${j}:${m.label}`);
      const p=pct(data.progress);host.querySelector('.cd-progress').hidden=p===null;if(p!==null)host.querySelector('i').style.width=`${p}%`;
    }
    drawMap();
  }
  refreshMessages();text($('.cd-log-storage'),storageWorks?'消息保存在当前浏览器，最多保留80条。':'浏览器未允许保存，消息仅保留在本次会话。');update({});
  return {root,update,notify,view:()=>view,destroy(){if(destroyed)return;endHold();if(logOpen)closeLog();destroyed=true;clearTimeout(toastTimer);observer.disconnect();cancelAnimationFrame(mapFrame);document.removeEventListener('keydown',onKey,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);root.remove();css.remove();if(!document.querySelector('.cd-root'))document.body.classList.remove('command-deck-active');}};
}
