// 前哨仓舱内界面：工位面板和气闸过场（D73）。
// 样子和交互照搬先遣生存那套应急舱界面（src/survival/arrival.css 的 .arrival-dialog、.manifest、
// .self-test、.airlock-transition）：同样的面板、清单、四项自检、过场标题和进度条。
// 内容和两段小逻辑在 outpost-station-panels.js，这里只管画和接按键。
//
// 和生存舱不一样的两处：
//   · 气闸过场不盖满全屏。生存舱是一块近乎不透明的幕布；这里镜头真的穿过小室，门在眼前开合，
//     所以只在上方放一块牌子，下面的门照样看得见。牌子上多三个圆点，不认字也看得出走到第几步。
//   · 面板开着时游戏冻结（setOverlay），按键不漏给游戏：站在气闸边上按 F 不会一边看面板一边出舱。
import {SUIT,stationPanel,freshSuitCheck,startSuitCheck,advanceSuitCheck,suitReady,CYCLE_STEPS,cycleStep}
  from './outpost-station-panels.js';

const STYLE=`
.outpost-ui{--mint:#b5dfce;--line:#bad4cb33;--muted:#a4b8b7;color:#eef0e5;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
.outpost-ui *{box-sizing:border-box}
.outpost-ui button{font:inherit;color:inherit;background:#12272ce8;border:1px solid #bad4cb66;border-radius:4px;padding:10px 14px;min-height:42px;cursor:pointer}
.outpost-ui button:hover{background:#29433f}
.outpost-ui button:disabled{opacity:.55;cursor:default}
.outpost-ui button:focus-visible{outline:2px solid var(--mint);outline-offset:3px}
.outpost-ui .eyebrow{font:10px/1.6 ui-monospace,monospace;letter-spacing:.18em;color:var(--mint)}
.outpost-dialog{width:min(580px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;margin:auto;color:#e6ebe4;background:#101f25;border:1px solid #87aea077;border-radius:8px;padding:26px;font:13px/1.8 -apple-system,"PingFang SC",sans-serif;box-shadow:0 30px 100px #0008}
.outpost-dialog::backdrop{background:#040c12cc;backdrop-filter:blur(8px)}
.outpost-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.outpost-dialog header button{font-size:20px;min-width:42px}
.outpost-dialog h2{font-weight:500;font-size:27px;line-height:1.5;margin:18px 0}
.outpost-dialog p{color:#adbfbd}
.outpost-dialog .manifest{margin:15px 0}
.outpost-dialog .manifest>div,.outpost-dialog .self-test>div{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid var(--line)}
.outpost-dialog .manifest dt{color:#b4c3bf}
.outpost-dialog .manifest dd{margin:0;color:#f0eee0;text-align:right}
.outpost-dialog .self-test b{font-weight:400;color:var(--muted)}
.outpost-dialog .self-test .pass b{color:var(--mint)}
.outpost-dialog .fine{font-size:11px;line-height:1.8}
.outpost-dialog footer{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
.outpost-dialog .primary{background:var(--mint);color:#122928;border-color:var(--mint)}
.outpost-dialog .primary:hover{background:#d0ebdf;color:#122928}
.outpost-airlock{position:fixed;left:50%;top:21vh;transform:translateX(-50%);z-index:50;display:flex;flex-direction:column;align-items:center;
  min-width:min(420px,88vw);padding:18px 28px 16px;background:#0c1920e0;border:1px solid #87aea055;border-radius:10px;box-shadow:0 20px 60px #0007;pointer-events:none;text-align:center}
.outpost-airlock[hidden]{display:none}
.outpost-airlock>span{color:var(--mint);font:12px monospace;letter-spacing:.2em}
.outpost-airlock h2{font-weight:400;font-size:25px;margin:8px 0 12px}
.outpost-airlock ol{display:flex;gap:10px;list-style:none;margin:0 0 12px;padding:0;align-items:center}
.outpost-airlock li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
.outpost-airlock li::before{content:"";width:14px;height:14px;border-radius:50%;border:2px solid #bad4cb66}
.outpost-airlock li.done::before{background:var(--mint);border-color:var(--mint)}
.outpost-airlock li.now{color:#eef0e5}
.outpost-airlock li.now::before{border-color:var(--mint);box-shadow:0 0 0 4px #b5dfce33}
.outpost-airlock progress{width:min(320px,80vw);height:6px;accent-color:var(--mint)}
.outpost-airlock p{font-size:12px;color:var(--muted);margin:10px 0 0}
@media(max-width:500px){.outpost-dialog{padding:20px}.outpost-dialog h2{font-size:23px}.outpost-airlock h2{font-size:20px}}
`;

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/** setOverlay(true/false)：面板开关时让游戏冻结/恢复。notify：自检通过时报一句。
 * saveKey：自检结果存在哪（跟着这一局走）；storage 可以换成假的，测试页用。 */
export function mountOutpostStationUI({setOverlay=()=>{},notify=()=>{},saveKey='cosmos.outpost.suit.v1',storage=globalThis.localStorage}={}){
  if(!document.getElementById('outpost-station-style')){
    const style=document.createElement('style');style.id='outpost-station-style';style.textContent=STYLE;document.head.append(style);
  }
  const ui=document.createElement('div');ui.className='outpost-ui';
  ui.innerHTML=`<dialog class="outpost-dialog" aria-labelledby="outpost-dialog-title"><header><span class="eyebrow"></span><button type="button" class="outpost-close" aria-label="关闭面板">×</button></header>
    <h2 id="outpost-dialog-title"></h2><div class="outpost-content"></div><footer></footer></dialog>
    <div class="outpost-airlock" role="status" hidden><span>OUTPOST / AIRLOCK</span><h2></h2>
      <ol>${CYCLE_STEPS.map(n=>`<li>${n}</li>`).join('')}</ol><progress max="1" value="0"></progress><p>保持宇航服密封 · 双门互锁</p></div>`;
  document.body.append(ui);
  const dialog=ui.querySelector('dialog'),content=ui.querySelector('.outpost-content'),actions=dialog.querySelector('footer');
  const airlock=ui.querySelector('.outpost-airlock'),steps=[...airlock.querySelectorAll('li')];

  let suit=freshSuitCheck();
  try{suit=freshSuitCheck(JSON.parse(storage?.getItem(saveKey)||'null')?.passed||[]);}catch{}
  const save=()=>{try{storage?.setItem(saveKey,JSON.stringify({passed:suit.passed}));}catch{}};

  let current=null;
  const rows=items=>`<dl class="manifest">${items.map(([n,v])=>`<div><dt>${esc(n)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  const button=(label,run,primary=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(primary)b.className='primary';b.onclick=run;actions.append(b);return b;};
  function paintSuit(){
    for(const [id] of SUIT){
      const row=content.querySelector(`[data-suit="${id}"]`);if(!row)continue;
      const ok=suit.passed.includes(id);row.classList.toggle('pass',ok);row.querySelector('b').textContent=ok?'通过':'待检查';
    }
    const start=actions.querySelector('.primary');
    if(start&&current?.selfTest){start.disabled=suit.running;start.textContent=suit.running?'自检中…':suitReady(suit)?'重新自检':'开始自检';}
  }
  // 自检自己计时：面板开着时游戏整个冻结（setOverlay 连主循环一起停），等不到宿主的 update。
  // 页面在后台时浏览器不给动画帧，所以挂起期间不会偷跑。
  let ticking=false;
  function runSuit(){
    if(ticking)return;ticking=true;let last=performance.now();
    const tick=now=>{
      if(!suit.running){ticking=false;return;}
      const before=suit.passed.length;suit=advanceSuitCheck(suit,Math.min(.25,(now-last)/1000));last=now;
      if(suit.passed.length!==before){paintSuit();save();
        if(suitReady(suit))notify('宇航服自检完成：服体密封、供氧阀组、背包电源与空气滤芯四项通过。');}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function swallow(e){
    // 面板开着：按键不给游戏。Esc 关面板；其余键只留给面板自己的按钮（回车、空格照常点按钮）。
    e.stopImmediatePropagation();
    if(e.code==='Escape'){e.preventDefault();close();}
  }
  function open(station){
    const p=stationPanel(station?.id);
    if(!p||current)return false;
    current=p;
    dialog.querySelector('.eyebrow').textContent=p.code;
    dialog.querySelector('h2').textContent=p.title;
    content.innerHTML=(p.lead?`<p>${esc(p.lead)}</p>`:'')
      +(p.selfTest?`<div class="self-test">${SUIT.map(([id,n])=>`<div data-suit="${id}"><span>${esc(n)}</span><b></b></div>`).join('')}</div>`:'')
      +rows(p.rows)+`<p class="fine">${esc(p.fine)}</p>`;
    actions.replaceChildren();
    if(p.selfTest)button('开始自检',()=>{suit=startSuitCheck();paintSuit();runSuit();},true);
    button('返回',close,!p.selfTest);
    paintSuit();
    setOverlay(true);addEventListener('keydown',swallow,true);
    dialog.showModal();
    return true;
  }
  function close(){
    if(!current)return;
    current=null;if(suit.running)suit=freshSuitCheck(suit.passed);
    removeEventListener('keydown',swallow,true);
    if(dialog.open)dialog.close();
    setOverlay(false);
  }
  ui.querySelector('.outpost-close').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});

  /** 每帧调一次，刷新气闸过场的牌子。
   * refuge 传 surface-refuge 的对象（或任何有 busy / label / progress 的东西）。 */
  function update(refuge){
    const busy=!!refuge?.busy;
    if(airlock.hidden===busy)airlock.hidden=!busy;
    if(busy){
      const step=cycleStep(refuge.progress);
      airlock.querySelector('h2').textContent=refuge.label;
      airlock.querySelector('progress').value=refuge.progress;
      steps.forEach((li,i)=>{li.classList.toggle('done',i<step);li.classList.toggle('now',i===step);});
    }
  }
  function dispose(){close();ui.remove();}
  return {open,close,update,dispose,element:ui,
    get isOpen(){return !!current;},
    get suit(){return {passed:[...suit.passed],running:suit.running,ready:suitReady(suit)};}};
}
