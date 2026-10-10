// 任务卡在屏幕上的那一层：左上角一张小卡，卡片左边是艾琳半身（D70）。只管显示，不判断任何事。
import { ICONS } from './icons.js';
import { poseSrc, poseHead } from '../relics/brief/poses.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const BUST = .36;   // 半身小窗露出全身立绘从头顶往下多大一截
/** 卡上的照片（deck.js 的 pic）是 assets/ 下的路径。 */
export const assetUrl = path => new URL('../../assets/' + path, import.meta.url).href;

/** onAction(i)：点了卡上第 i 个按钮。onMute：点了喇叭，返回新的「是否静音」。 */
export function mountCardHud({ onAction = () => {}, onMute = () => false, muted = false } = {}) {
  if (!document.querySelector('link[data-cards-css]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.cardsCss = '';
    link.href = new URL('./cards.css', import.meta.url).href; document.head.append(link);
  }
  const card = el('section', 'erin-card'); card.hidden = true; card.setAttribute('aria-live', 'polite');
  const erin = el('div', 'ec-erin'), img = el('img'); img.alt = '艾琳'; erin.append(img);
  const pic = el('div', 'ec-pic'), title = el('b', 'ec-title'), head = el('div', 'ec-head'); head.append(pic, title);
  const keys = el('div', 'ec-keys');
  const way = el('div', 'ec-way'), arrow = el('i', 'ec-arrow', '↑'), meters = el('span'); way.append(arrow, meters); way.hidden = true;
  const acts = el('div', 'ec-acts'), reasons = el('p','ec-action-reason'); reasons.hidden=true;
  reasons.id='erin-action-reason';
  const body = el('div', 'ec-body'); body.append(head, keys, way, acts, reasons);
  const say = el('p', 'ec-say'), mute = el('button', 'ec-mute'); mute.type = 'button';
  const tick = el('div', 'ec-tick', '✓'); tick.setAttribute('aria-hidden', 'true');
  card.append(erin, body, say, mute, tick);
  document.body.append(card);
  document.body.classList.add('cards-on');

  let pose = '', spin = 0;
  // 全身立绘放大到只露头到腰，按 poses.js 里量好的头顶坐标把脸放在小窗正中偏上。
  function fitFace() {
    if (!img.naturalWidth || !erin.clientHeight) return;
    const [hx, hy] = poseHead(pose), H = erin.clientHeight / BUST, W = H * img.naturalWidth / img.naturalHeight;
    img.style.height = H + 'px'; img.style.width = W + 'px';
    img.style.left = (erin.clientWidth / 2 - hx * W) + 'px'; img.style.top = (6 - hy * H) + 'px';
  }
  img.addEventListener('load', fitFace); addEventListener('resize', fitFace);
  function setPose(name) { if (name === pose) return; pose = name; img.src = poseSrc(name); }
  const paintMute = m => { mute.textContent = m ? '🔇' : '🔊'; mute.setAttribute('aria-label', m ? '打开艾琳的声音' : '关掉艾琳的声音'); };
  paintMute(muted);
  mute.onclick = () => paintMute(onMute());
  // 一张卡的按钮：多数卡没有或只有一个；「去洞察号」有两个，各带一张图。
  function paintActs(list) {
    acts.replaceChildren(...list.map((a, i) => {
      const b = el('button', 'ec-act'); b.type = 'button'; b.disabled = true;
      if (a.icon) { const p = el('span', 'ec-act-pic'); p.innerHTML = ICONS[a.icon] || ''; b.append(p); b.classList.add('has-pic'); }
      b.append(el('span', '', a.label));
      b.setAttribute('aria-describedby',reasons.id);
      b.onclick = () => { if (!b.disabled) onAction(i); };
      return b;
    }));
  }
  /** states[i] = { ready, visible }：现在点得动吗、要不要露面。 */
  function setActions(states) {
    const hints=[];
    [...acts.children].forEach((b, i) => { const s = states[i] || {}; b.hidden = s.visible === false; b.disabled = !s.ready || card.classList.contains('is-done'); b.title=s.reason||'';if(!b.hidden&&b.disabled&&!card.classList.contains('is-done')&&s.reason&&!hints.includes(s.reason))hints.push(s.reason); });
    reasons.hidden=!hints.length;reasons.textContent=hints.join(' ');
  }

  return {
    /** 换一张卡。传 null 或大卡就把小卡收起来。 */
    show(c) {
      card.hidden = !c || !!c.big;
      if (card.hidden) return;
      card.dataset.id = c.id; card.classList.remove('is-done', 'nudge');
      if (c.thumb || c.pic) { const photo = el('img'); photo.alt = ''; photo.src = assetUrl(c.thumb || c.pic); pic.replaceChildren(photo); }
      else pic.innerHTML = ICONS[c.icon] || '';
      title.textContent = c.title;
      keys.replaceChildren(...(c.keys || []).map(k => el('kbd', '', k)));
      paintActs(c.actions || (c.action ? [c.action] : []));
      way.hidden = true; say.textContent = '';reasons.hidden=true;reasons.textContent='';
      setPose(c.pose || 'pointing-tablet');
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      fitFace();
    },
    /** 艾琳说的话当字幕写在卡片底下。 */
    say(text) { say.textContent = text; },
    /** v = { angle, meters }：angle 是目标相对镜头正前方偏多少（弧度，右正）；null 就不显示。 */
    setWay(v) {
      way.hidden = !v; if (!v) return;
      // 角度一路累加：目标从镜头正后方左右晃时，箭头走最短的弯，不会整圈转回去。
      spin += Math.atan2(Math.sin(v.angle - spin), Math.cos(v.angle - spin));
      arrow.style.transform = `rotate(${spin}rad)`;
      meters.textContent = v.meters < 1000 ? `${Math.round(v.meters)} 米` : `${(v.meters / 1000).toFixed(1)} 公里`;
    },
    setActions,
    /** 只有一个按钮的卡的老写法。 */
    setAction(ready, visible = true, index = 0) { const b = acts.children[index]; if (b) { b.hidden = !visible; b.disabled = !ready || card.classList.contains('is-done'); } },
    // 打勾后到换下一张卡之前，按钮立刻变灰：孩子连点两下，第二下不能再去动已经做完的事。
    celebrate() { reasons.hidden=true;card.classList.add('is-done'); for (const b of acts.children) b.disabled = true; setPose('approve'); },
    nudge() { card.classList.remove('nudge'); void card.offsetWidth; card.classList.add('nudge'); },
    get element() { return card; },
    dispose() { removeEventListener('resize', fitFace); card.remove(); document.body.classList.remove('cards-on'); },
  };
}
