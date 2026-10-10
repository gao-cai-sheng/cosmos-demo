// 遗迹档案页（tools/relic-archive.html）：没有参数是档案首页，?relic=<id> 是艾琳的任务简报。
// 在生活舱通信台的浮层里打开（src/relics/archive-overlay.js）；「接受任务」经 postMessage 交给游戏写存档。
import { getJourney, homeSite, relicPhotos } from '../../journey/state.js';
import { relicById, nextTask, availableTasks, TASK_ORDER } from '../catalog.js';
import { poseSrc, poseHead } from './poses.js';
import { createStage3D } from './stage3d.js';
import { sfx } from '../../journey/sfx.js';

// 每处遗迹的台词、档案卡、机位（按需载入）。
const BRIEFS = {
  INSG: () => import('./insight.js'), VKG2: () => import('./viking2.js'), BGL2: () => import('./beagle2.js'),
  INGN: () => import('./ingenuity.js'), VKG1: () => import('./viking1.js'), PTHF: () => import('./pathfinder.js'),
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inFrame = window.parent !== window;
const home = homeSite();
const code = id => `R-0${TASK_ORDER.indexOf(id) + 1}`;

/* 离首次着陆点多远（km），大圆距离，火星半径 3389.5 km（src/nav/flight-plan.js 的 R_MARS_KM）。 */
function kmFromHome(r) {
  const D = Math.PI / 180, a = Math.sin((r.lat - home.lat) * D / 2) ** 2
    + Math.cos(r.lat * D) * Math.cos(home.lat * D) * Math.sin((r.lon - home.lon) * D / 2) ** 2;
  return 2 * 3389.5 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const fmtKm = d => d < 100 ? d.toFixed(1) : (Math.round(d / 10) * 10).toLocaleString('en-US');
const fill = (s, r) => String(s).replace(/\{km\}/g, fmtKm(kmFromHome(r)));

function progress() { return getJourney()?.relics ?? { active: null, done: {} }; }
function statusOf(id, p = progress()) {
  if (p.done[id]) return 'done';
  if (p.active === id) return 'active';
  return availableTasks(p).includes(id) ? 'next' : 'locked';
}
const STATUS = { done: '已完成', active: '进行中', next: '可接', locked: '未解锁' };

// ---------- 立绘 ----------
function setPose(name) {
  const img = $('pose'), src = poseSrc(name);
  if (img.getAttribute('src') !== src) {
    img.setAttribute('src', src);
    $('figure').style.setProperty('--src', `url("${src}")`);
    img.classList.remove('in'); void img.offsetWidth; img.classList.add('in');
  }
  // 小窗只在大镜头里显示；那时它已经排好版，量得到实际尺寸
  const f = $('faceImg'), [hx, hy] = poseHead(name), w = f.offsetWidth || 330, bw = $('face').clientWidth || 124;
  if (f.getAttribute('src') !== src) f.setAttribute('src', src);
  f.style.left = (bw / 2 - hx * w) + 'px';
  f.style.top = (w / 55 - hy * w * 1.5) + 'px';
}

// ---------- 打字 ----------
let typing = null;
function typeLine(text) {
  clearInterval(typing);
  const el = $('line'); let i = 0;
  el.dataset.full = text;
  typing = setInterval(() => {
    i += 1;
    el.innerHTML = esc(text.slice(0, i)) + (i < text.length ? '<span class="caret">▌</span>' : '');
    if (i >= text.length) { clearInterval(typing); typing = null; }
  }, 30);
}
function finishTyping() {
  if (!typing) return false;
  clearInterval(typing); typing = null; $('line').textContent = $('line').dataset.full; return true;
}

const params = new URLSearchParams(location.search);
const relicId = params.get('relic');
$('hudHome').textContent = `火星 · ${home.name || '着陆场'}`;
if (relicId && relicById(relicId) && BRIEFS[relicId]) startBrief(relicId);
else startList();

// =====================================================================
// 档案首页
// =====================================================================
function startList() {
  const stage = $('stage');
  stage.dataset.mode = 'list'; stage.dataset.shot = 'brief';
  $('connect').classList.add('gone');
  $('hudTitle').textContent = '遗迹档案 · RELIC ARCHIVE';
  $('replay').hidden = true;
  const p = progress(), photos = relicPhotos();
  const done = TASK_ORDER.filter(id => p.done[id]).length;
  $('archCount').textContent = `${done} / ${TASK_ORDER.length} 已拍到`;
  $('archList').innerHTML = TASK_ORDER.map(id => {
    const r = relicById(id), st = statusOf(id, p), ph = photos[id]?.image;
    const lead = st === 'done' && ph ? `<img class="thumb" src="${ph}" alt="${esc(r.cn)}的照片">` : `<span class="code">${code(id)}</span>`;
    return `<li class="${st}" data-id="${id}" ${st === 'locked' ? 'aria-disabled="true"' : 'tabindex="0" role="button"'}>
      <span class="code-cell">${lead}</span>
      <span class="nm"><b>${esc(r.cn)}</b><small>${r.year} · ${esc(r.where)} · 约 ${fmtKm(kmFromHome(r))} km</small></span>
      <span class="st">${STATUS[st]}</span></li>`;
  }).join('');
  const open = id => { location.search = `?relic=${id}`; };
  $('archList').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]'); if (!li || li.classList.contains('locked')) return;
    open(li.dataset.id);
  });
  $('archList').addEventListener('keydown', e => {
    const li = e.target.closest('li[data-id]');
    if (li && !li.classList.contains('locked') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(li.dataset.id); }
  });
  // 一句话 + 一个按钮
  const next = nextTask(p), active = p.active && relicById(p.active);
  let say, action = null, pose = 'stand';
  if (p.done.INSG && done < TASK_ORDER.length) { say = '其余五处是可选考察，任选简报或到场拍照，不影响补给、建设和科研。可以随时换目标。'; if(active)action=['查看所选简报',p.active]; pose='point'; }
  else if (active) { say = `指挥官，${active.cn}还没拍到。到了现场按 K 拍照，落不下就在天上用机腹相机拍。`; action = ['再听一遍简报', p.active]; pose = 'point'; }
  else if (next) {
    const r = relicById(next);
    say = done ? `这一处拍得很好。下一处是${r.cn}，先听简报，再决定什么时候出发。` : `指挥官，地球这边整理了火星上的人类遗迹。一次一处，先从最近的${r.cn}开始。`;
    action = ['打开简报', next]; pose = done ? 'approve' : 'stand';
  } else { say = '六处都拍到了。它们接下来怎么处理，地球这边还在商量。'; pose = 'moved'; }
  setPose(pose);
  $('figure').classList.add('materialize');
  typeLine(say);
  $('act').innerHTML = action ? `<button class="go" data-open="${action[1]}">${esc(action[0])} ›</button>` : '';
  $('dialog').addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (b) { open(b.dataset.open); return; }
    finishTyping();
  });
  addEventListener('keydown', e => {
    if (e.target.closest?.('li[data-id]')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!finishTyping() && action) open(action[1]);
    }
  });
}

// =====================================================================
// 艾琳简报
// =====================================================================
async function startBrief(id) {
  const r = relicById(id);
  const data = (await BRIEFS[id]()).default();
  const SECTIONS = data.sections.map(s => ({ ...s, rows: s.rows?.map(([k, v]) => [k, fill(v, r)]) }));
  const BEATS = data.beats.map(b => ({ ...b, say: fill(b.say, r) }));
  let beat = 0, lastSec = null, shot = null, cutTimer = null, mapTimer = null, connectTimer = null;
  let modelReady = false, modelFailed = false;
  let status = statusOf(id), accepting = false;
  for (const b of BEATS) new Image().src = poseSrc(b.pose);   // 预载，换表情时不闪

  $('stage').dataset.mode = 'brief';
  $('back').hidden = false;
  $('back').onclick = () => { location.search = ''; };
  $('cFile').textContent = `${code(id)} · ${data.title}`;
  $('capTitle').textContent = data.title;
  $('capSub').textContent = data.subtitle;
  $('dims').textContent = data.dims || '';
  document.title = `遗迹简报 · ${r.cn}`;

  // ---------- 档案卡 ----------
  function cardHTML(s) {
    let h = `<div class="h-kick"><span>遗迹档案 ${code(id)}</span><span>${esc(s.kick)}</span></div><div class="h-title">${s.title}</div>`;
    if (s.rows) h += `<dl class="h-rows">${s.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    if (s.items) h += `<ul class="h-list">${s.items.map(it =>
      `<li class="${status === 'done' ? 'done' : status === 'active' ? '' : 'you'}"><span class="ic">${status === 'done' ? '✓' : esc(it.ic)}</span><span>${esc(it.t)}<span class="sub">${esc(it.sub)}</span></span><span class="v"></span></li>`).join('')}</ul>`;
    if (s.note) h += `<p class="note">${esc(s.note)}</p>`;
    if (s.foot) h += `<div class="h-foot"><span>${s.foot[0]}</span><span>${esc(s.foot[1])}</span></div>`;
    const ph = s.id === 'task' && status === 'done' && relicPhotos()[id]?.image;
    if (ph) h += `<figure class="shot"><img src="${ph}" alt="你拍的${esc(r.cn)}"><small>你拍的照片 · 已存档</small></figure>`;
    return h;
  }
  $('tabs').innerHTML = SECTIONS.map((s, i) => `<button data-sec="${s.id}"><span>0${i + 1}</span><b>${esc(s.short)}</b></button>`).join('');
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    const j = BEATS.findIndex(x => x.sec === b.dataset.sec);
    if (j >= 0) { finishTyping(); beat = j; show(); }
  });

  // ---------- 大地图（MOLA 高程渲染，左边缘 44°E） ----------
  const MAP_LEFT = 44, ZOOM = 2.4;
  const mapX = lonE => ((lonE - MAP_LEFT + 360) % 360) / 360 * 100;
  const mapY = lat => (90 - lat) / 180 * 100;
  {
    let grid = '';
    for (let lat = -60; lat <= 60; lat += 30) grid += `<line x1="0" x2="100" y1="${mapY(lat)}" y2="${mapY(lat)}"/>`;
    for (let lon = 60; lon < 404; lon += 60) grid += `<line y1="0" y2="100" x1="${mapX(lon)}" x2="${mapX(lon)}"/>`;
    const ll = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${lon > 180 ? (360 - lon).toFixed(2) + '°W' : lon.toFixed(2) + '°E'}`;
    $('mapbig').innerHTML = `<div class="plane" id="plane" style="transform-origin:${mapX(r.lon)}% ${mapY(r.lat)}%"
        role="img" aria-label="火星地图：${esc(r.cn)}在${esc(r.where)}，着陆场在${esc(home.name || '')}">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">${grid}</svg>
      <div class="pin base" style="left:${mapX(home.lon)}%;top:${mapY(home.lat)}%"><i></i><span>着陆场<small>${esc(home.name || '')}</small></span></div>
      <div class="pin relic" style="left:${mapX(r.lon)}%;top:${mapY(r.lat)}%"><i></i><span>${esc(r.cn)}<small>${ll(r.lat, r.lon)}</small></span></div>
    </div>`;
  }
  function playMap() {
    // 先看整颗火星，再推到遗迹：遗迹放大后挪到画面正中
    const plane = $('plane'), pins = plane.querySelectorAll('.pin');
    clearTimeout(mapTimer);
    plane.style.transition = 'none'; plane.style.transform = 'none'; plane.classList.remove('zoomed');
    pins.forEach(p => { p.style.transition = 'none'; p.style.scale = '1'; });
    void plane.offsetWidth;
    plane.style.transition = ''; pins.forEach(p => p.style.transition = '');
    mapTimer = setTimeout(() => {
      const w = plane.offsetWidth, h = plane.offsetHeight;
      const dx = w * (0.5 - mapX(r.lon) / 100), dy = h * (0.5 - mapY(r.lat) / 100);
      plane.style.transform = `translate(${dx}px,${dy}px) scale(${ZOOM})`; plane.classList.add('zoomed');
      pins.forEach(p => p.style.scale = String(1 / ZOOM));
    }, 900);
  }

  // ---------- 3D 档案台 ----------
  const stage3d = createStage3D({
    view: $('view'), canvas: $('cv'), calloutLayer: $('callouts'), calloutSvg: $('coLines'), data,
    onProgress: (p, total) => {
      if (!$('connect').classList.contains('gone')) meter(p);
      $('vload').textContent = `影像载入中 ${(p * 100).toFixed(0)}%`;
      $('cAttach').textContent = `1 : 1 复原影像 · ${(total / 1048576).toFixed(1)} MB`;
    },
    onReady: () => { modelReady = true; meter(1); $('vload').classList.add('gone'); },
    onError: msg => { modelFailed = true; $('vload').textContent = '影像没有载入：' + msg; },
  });

  // 换镜头时黑场一闪，黑的那一下再换布局
  function show() {
    const b = BEATS[beat];
    if (shot !== null && b.shot !== shot) {
      const c = $('cutter'); c.classList.remove('run'); void c.offsetWidth; c.classList.add('run');
      clearTimeout(cutTimer);
      cutTimer = setTimeout(() => render(BEATS[beat], true), 170);
      return;
    }
    render(b, shot === null);
  }
  function actionHTML(b) {
    if (!b.action) return '<span class="next">继续<i>▸</i></span>';
    if (status === 'done') return '<button class="go done" disabled>✓ 已完成</button>';
    if (status === 'active') return '<button class="go active" disabled>任务进行中</button>';
    if (status === 'locked') return '<button class="go wait" disabled>先完成洞察号主线</button>';
    if (!inFrame) return '<button class="go wait" disabled>到生活舱通信台接受</button>';
    return `<button class="go" data-go ${accepting ? 'disabled' : ''}>${accepting ? '正在确认…' : esc(b.action) + ' ›'}</button>`;
  }
  function render(b, cut) {
    const stage = $('stage'), view = $('view');
    const shotChanged = b.shot !== shot;
    shot = b.shot; stage.dataset.shot = b.shot;
    if (shotChanged && matchMedia('(max-aspect-ratio:5/4)').matches) scrollTo(0, 0);   // 手机竖屏：换镜头从头看
    setPose(b.pose);
    if (b.sec !== lastSec) {
      const card = $('card');
      card.innerHTML = cardHTML(SECTIONS.find(s => s.id === b.sec));
      card.scrollTop = 0;
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      lastSec = b.sec;
    }
    document.querySelectorAll('#tabs [data-sec]').forEach(t => t.classList.toggle('on', t.dataset.sec === b.sec));
    // 相机视角和地图各有自己的一套
    view.classList.toggle('pov', b.shot === 'pov');
    view.classList.toggle('map', b.shot === 'map');
    if (b.shot === 'pov' && shotChanged) { view.classList.remove('pov'); void view.offsetWidth; view.classList.add('pov'); }
    if (b.shot === 'map' && shotChanged) playMap();
    $('hint').style.visibility = b.shot === 'pov' || b.shot === 'map' ? 'hidden' : '';
    view.querySelector('.cap').style.visibility = b.sec === SECTIONS[0].id ? '' : 'hidden';   // 片名只在开头出现一次
    const lower = $('lower');
    lower.innerHTML = b.lower ? `<small>${esc(b.lower[0])}</small><b>${esc(b.lower[1])}</b>` : '';
    lower.style.visibility = b.lower ? '' : 'hidden';
    lower.classList.remove('in'); void lower.offsetWidth; lower.classList.add('in');
    typeLine(b.say);
    if (inFrame) parent.postMessage({ type: 'relic:line', id, text: b.say }, location.origin);
    $('act').innerHTML = actionHTML(b);
    $('beats').innerHTML = BEATS.map((_, j) => `<i class="${j <= beat ? 'on' : ''}"></i>`).join('');
    $('replaySlew').hidden = !data.replayable?.(b);
    stage3d.apply({ ...b, cut: !!cut });
  }
  function step(d) {
    if (d > 0 && finishTyping()) return;
    const n = beat + d;
    if (n < 0 || n >= BEATS.length) return;
    beat = n; sfx.play('brief-next'); show();
  }

  // ---------- 调取档案（顺便等模型下载） ----------
  function meter(p) {
    $('meter').style.width = (p * 100).toFixed(0) + '%';
    $('lock').textContent = p >= 1 ? '档案就绪' : p > 0 ? `下载复原影像 ${(p * 100).toFixed(0)}%` : '经月面中继接入……';
  }
  function connected() {
    clearTimeout(connectTimer);
    const c = $('connect'); if (c.classList.contains('gone')) return;
    c.classList.add('gone');
    const f = $('figure');
    f.classList.remove('materialize'); void f.offsetWidth; f.classList.add('materialize');
    show();
  }
  function connect() {
    beat = 0; lastSec = null; shot = null;
    clearInterval(typing); typing = null;
    clearTimeout(connectTimer); clearTimeout(cutTimer);
    $('stage').dataset.shot = 'brief';
    $('line').textContent = ''; $('act').innerHTML = ''; $('card').innerHTML = '';
    const first = poseSrc(BEATS[0].pose); $('pose').setAttribute('src', first);
    $('figure').style.setProperty('--src', `url("${first}")`);
    $('connect').classList.remove('gone');
    meter(modelReady ? 1 : 0);
    const t0 = performance.now();
    (function wait() {
      // 至少停 1.4 秒让人看清在调什么；模型下好了就进，最多等 8 秒
      const dt = performance.now() - t0;
      if ((modelReady || modelFailed) && dt > 1400 || dt > 8000) return connected();
      connectTimer = setTimeout(wait, 100);
    })();
  }

  // ---------- 接受任务：交给游戏写存档 ----------
  addEventListener('message', e => {
    if (e.origin !== location.origin || e.data?.type !== 'relic:accepted' || e.data.id !== id) return;
    accepting = false;
    status = e.data.ok ? 'active' : statusOf(id);
    lastSec = null; render(BEATS[beat], false);
    if (e.data.ok) sfx.play('accept');
    if (e.data.ok) typeLine(`收到。任务已记下，航线图上标出了${r.cn}。关掉通信台就可以出发。`);
  });
  $('dialog').addEventListener('click', e => {
    if (e.target.closest('[data-go]')) {
      if (accepting) return;
      accepting = true; $('act').innerHTML = actionHTML(BEATS[beat]);
      parent.postMessage({ type: 'relic:accept', id }, location.origin);
      return;
    }
    step(1);
  });
  $('connect').addEventListener('click', connected);
  $('replay').addEventListener('click', connect);
  $('replaySlew').addEventListener('click', () => stage3d.replay());
  addEventListener('keydown', e => {
    if (!$('connect').classList.contains('gone')) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); connected(); } return; }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  window.__relicBrief = { get beat() { return beat; }, get status() { return status; }, get modelReady() { return modelReady; }, BEATS };
  connect();
}
