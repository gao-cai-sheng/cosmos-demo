// 生活舱通信台打开的「遗迹档案」浮层：同源 iframe 装 tools/relic-archive.html，做法同化验台（mobility.js openRegolithLab）。
// 任务卡（D76）也用它：relic 直接开到某一处的简报；onLine 收到艾琳说的每一句（由外面出声）；closeRelicArchive 从外面关。
import { acceptRelic } from './progress.js';

let panel = null, closePanel = null;
export function openRelicArchive({ setOverlay = () => {}, onAccept = () => {}, onLine = () => {}, onClose = () => {}, relic = '' } = {}) {
  if (panel) return true;
  const page = new URL('../../tools/relic-archive.html', import.meta.url);
  if (relic) page.searchParams.set('relic', relic);
  panel = document.createElement('div');
  panel.className = 'relic-archive';
  panel.innerHTML = '<header><span>通信台 · 遗迹档案</span><button type="button">关闭 · Esc</button></header>'
    + `<iframe title="遗迹档案" src="${page.href}"></iframe>`;
  if (!document.getElementById('relic-archive-style')) {
    const style = document.createElement('style'); style.id = 'relic-archive-style';
    style.textContent = '.relic-archive{position:fixed;inset:3vh 3vw;z-index:60;display:flex;flex-direction:column;'
      + 'background:#05080b;border:1px solid #2b3a46;border-radius:10px;box-shadow:0 24px 80px #000c;overflow:hidden}'
      + '.relic-archive header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;'
      + 'background:#0b1117;color:#dfe6ec;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.06em}'
      + '.relic-archive header button{background:#15212b;color:#dfe6ec;border:1px solid #2b3a46;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}'
      + '.relic-archive header button:hover{background:#1d2c38}'
      + '.relic-archive iframe{flex:1;width:100%;border:0;background:#05080b}'
      + '@media (max-width:640px){.relic-archive{inset:0;border-radius:0}}';
    document.head.append(style);
  }
  const frame = panel.querySelector('iframe');
  const key = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const message = e => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'relic:accept') {
      const ok = acceptRelic(d.id);
      frame.contentWindow.postMessage({ type: 'relic:accepted', id: d.id, ok }, location.origin);
      if (ok) onAccept(d.id);
    } else if (d.type === 'relic:line') onLine(String(d.text || ''));
    else if (d.type === 'relic:close') close();
  };
  // 焦点进了 iframe，Esc 就到不了游戏窗口，所以两边都挂一次。
  // 加载好就把焦点给它：不然空格翻句落在游戏上，孩子得先点一下浮层才翻得动。
  frame.addEventListener('load', () => { try { frame.contentWindow.addEventListener('keydown', key, true); frame.contentWindow.focus(); } catch { /* 同源，按理不会失败 */ } });
  function close() {
    if (!panel) return;
    removeEventListener('keydown', key, true); removeEventListener('message', message);
    try { frame.contentWindow.removeEventListener('keydown', key, true); } catch { /* 已卸载 */ }
    panel.remove(); panel = null; closePanel = null; window.focus(); setOverlay(false); onClose();
  }
  closePanel = close;
  panel.querySelector('header button').onclick = close;
  addEventListener('keydown', key, true); addEventListener('message', message);
  document.body.append(panel); setOverlay(true);
  return true;
}
export const relicArchiveOpen = () => !!panel;
/** 从外面关掉浮层（任务卡在接受任务后替孩子关）。没开着就什么都不做。 */
export const closeRelicArchive = () => closePanel?.();
