// 大卡（D70）：艾琳全身，一句一句讲，最后一句给「接受任务」。
// 遗迹简报那套带 3D 档案台、多镜头的引擎在 src/relics/brief/，是给遗迹用的；这里是不带模型的轻版本。
import { poseSrc } from '../relics/brief/poses.js';

/** card 是 deck.js 里 big: true 的卡。speak(text) 出声。每翻一句调 onNext；讲完点「接受任务」后调 onAccept。 */
export function openBriefing({ card, speak = () => {}, onNext = () => {}, onDefer = () => {}, onAccept = () => {} }) {
  const root = document.createElement('div'); root.className = 'erin-briefing';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', card.title);
  root.innerHTML = '<img class="ebr-erin" alt="艾琳"><div class="ebr-box"><small></small><p></p><button type="button"></button></div>';
  const img = root.querySelector('img'), text = root.querySelector('p'), button = root.querySelector('button');
  root.querySelector('small').textContent = card.title;
  button.dataset.sfx = 'none';   // 翻句和接受各有自己的声音（onNext / onAccept），不叠通用的按钮声
  let index = -1, closed = false;

  function step() {
    if (closed) return;
    if (index >= card.lines.length - 1) return close();
    const line = card.lines[++index], last = index === card.lines.length - 1;
    if (index > 0) onNext();
    img.src = poseSrc(line.pose || 'standing-tablet');
    text.textContent = line.say;
    button.textContent = last ? (card.acceptLabel || card.button || '接受任务') : '继续 · 空格';
    button.classList.toggle('primary', last);
    speak(line.say);
  }
  function close(accepted=true) {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', key, true); removeEventListener('keyup', swallow, true);
    root.remove(); if(accepted)onAccept();else onDefer();
  }
  // 空格 / 回车翻句。抢在游戏前面拿走这两个键，不然人会在舱里跳一下。
  const mine = e => e.code === 'Space' || e.code === 'Enter';
  const key = e => { if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(false);return;}if (!mine(e)) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) step(); };
  const swallow = e => { if (mine(e)) { e.preventDefault(); e.stopPropagation(); } };
  button.onclick = step;
  const later=document.createElement('button');later.type='button';later.textContent='稍后再做';later.onclick=()=>close(false);root.querySelector('.ebr-box').append(later);
  addEventListener('keydown', key, true); addEventListener('keyup', swallow, true);
  document.body.append(root); step();
  return { get index() { return index; }, get closed() { return closed; }, step, close, dismiss:()=>close(false) };
}
