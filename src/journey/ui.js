import { getJourney, journeyStage, sceneURL, storageAvailable, getSettings, updateSettings } from './state.js';

const CSS = new URL('./journey.css', import.meta.url).href;
const STAGES = ['轨道选址', '地面勘测', '部署穹顶', '先遣站建设'];
const STAGE_INDEX = { orbit: 0, survey: 1, deploy: 2, build: 3, complete: 4 };
const $ = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export function mountJourneyUI({ scene, title, onPause = () => {} }) {
  if (!document.querySelector('link[data-journey-css]')) {
    const link = $('link'); link.rel = 'stylesheet'; link.href = CSS;
    link.dataset.journeyCss = ''; document.head.append(link);
  }
  document.body.classList.add('journey-mode');
  document.body.dataset.journeyScene = scene;
  const root = $('div', 'journey-ui');
  const header = $('header', 'journey-header');
  const brand = $('a', 'journey-brand', 'COSMOS'); brand.href = sceneURL('home');
  brand.setAttribute('aria-label', 'COSMOS 返回指挥台');
  const place = $('span', 'journey-place', title);
  const trail = $('ol', 'journey-trail'); trail.setAttribute('aria-label', '探险进度');
  STAGES.forEach(text => trail.append($('li', '', text)));
  const menu = $('button', 'journey-menu', '暂停 / ESC');
  menu.setAttribute('aria-label', '暂停和操作说明');
  header.append(brand, place, trail, menu);

  const objective = $('section', 'journey-objective'); objective.setAttribute('aria-label', '当前任务');
  const kicker = $('div', 'journey-kicker');
  const heading = $('h1'); const body = $('p');
  const track = $('progress'); track.max = 1; track.value = 0; track.setAttribute('aria-label', '当前任务完成进度');
  objective.append(kicker, heading, body, track);
  const telemetry = $('dl', 'journey-telemetry'); telemetry.setAttribute('aria-label', '飞行与任务读数');
  const actions = $('nav', 'journey-actions'); actions.setAttribute('aria-label', '当前可用操作');
  const save = $('span', 'journey-save', '进度自动保存');
  const toast = $('div', 'journey-toast'); toast.setAttribute('role', 'status');
  const dialog = $('dialog', 'journey-dialog'); dialog.setAttribute('aria-label', '任务与系统');
  root.append(header, objective, telemetry, actions, save, toast, dialog);
  document.body.append(root);
  let paused = false, previousFocus = null, toastTimer, briefOpen = false;
  let objectiveKey = '', telemetryKey = '', actionKey = '';
  let handlers = new Map();

  function setPause(value) {
    paused = value; document.body.classList.toggle('journey-paused', value);
    onPause(value);
  }
  function closeDialog() {
    dialog.close(); briefOpen = false; setPause(false);
    previousFocus?.focus?.({ preventScroll: true });
  }
  function openDialog() {
    if (!dialog.open) { previousFocus = document.activeElement; setPause(true); dialog.showModal(); }
  }
  function toastMessage(message) {
    toast.textContent = message; toast.classList.add('is-visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3800);
  }
  function button(text, handler, primary = false) {
    const el = $('button', primary ? 'journey-button primary' : 'journey-button', text);
    el.type = 'button'; el.addEventListener('click', handler); return el;
  }
  function pauseMenu() {
    if (dialog.open) { if (!briefOpen) closeDialog(); return; }
    dialog.replaceChildren();
    dialog.append($('div', 'journey-kicker', 'MU-7 · 仙后座'), $('h2', '', '稍作停留'));
    dialog.append($('p', '', '当前位置与已完成任务会自动保存在这台设备上。'));
    const help = $('div', 'journey-help');
    for (const [key, value] of [['W / S', '前进 / 倒车'], ['A / D', '转向'], ['空格', '刹车'], ['拖动 / 滚轮', '转视角 / 调整视距'], ['C', '切换太空人视角 / 驾驶机位'], ['F', '连接 / 结束遥控 / 就近登船 / 落地离船'], ['WASD / Shift', '步行移动 / 快走'], ['M', '地图导航与载具位置'], ['E / Q', '遥控时勘测 / 飞行时升降'], ['K', '保存画面']]) {
      help.append($('kbd', '', key), $('span', '', value));
    }
    dialog.append(help);
    const options = $('div', 'journey-dialog-options');
    const quality = button(getSettings().quality === 'low' ? '画质：流畅' : '画质：标准', () => {
      const next = getSettings().quality === 'low' ? 'standard' : 'low';
      updateSettings({ quality: next });
      quality.textContent = next === 'low' ? '画质：流畅' : '画质：标准';
      dispatchEvent(new CustomEvent('cosmos:quality', { detail: next }));
    });
    options.append(quality);
    if (scene === 'orbit' || scene === 'surface') {
      options.append(button('场景参数', () => {
        document.body.classList.toggle('journey-inspect'); closeDialog();
        toastMessage('场景参数已切换；再次打开暂停菜单可收起。');
      }));
    }
    dialog.append(options);
    const foot = $('div', 'journey-dialog-actions');
    foot.append(button('继续探索', closeDialog, true), button('保存并回指挥台', () => { location.href = sceneURL('home'); }));
    dialog.append(foot); openDialog();
  }
  menu.addEventListener('click', pauseMenu);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!briefOpen) closeDialog(); });
  addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]:not(.journey-dialog)')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!briefOpen) pauseMenu();
    } else if (paused && !event.target.closest('dialog')) {
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !paused) pauseMenu();
  });
  actions.addEventListener('click', async event => {
    const btn = event.target.closest('button'); if (!btn || btn.disabled || paused) return;
    const handler = handlers.get(btn.dataset.action); if (!handler) return;
    try { await handler(); } catch (error) {
      console.error('[COSMOS action]', error); toastMessage('操作未完成，请重试。' + (error?.message || ''));
    }
  });
  function updateTrail() {
    const index = STAGE_INDEX[journeyStage()];
    [...trail.children].forEach((el, i) => {
      el.classList.toggle('is-done', i < index); el.classList.toggle('is-current', i === index);
      if (i === index) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    save.textContent = storageAvailable() ? '进度已保存在此设备' : '本次进度暂存内存，浏览器未允许保存';
  }
  addEventListener('cosmos:journey-change', updateTrail); updateTrail();
  return {
    get element() { return root; },
    get paused() { return paused; },
    setObjective(data) {
      const key = JSON.stringify(data); if (key === objectiveKey) return; objectiveKey = key;
      kicker.textContent = data.kicker || '当前目标'; heading.textContent = data.title || '';
      body.textContent = data.body || ''; track.hidden = data.progress == null;
      track.value = Math.max(0, Math.min(1, data.progress || 0));
    },
    setTelemetry(items) {
      const key = JSON.stringify(items); if (key === telemetryKey) return; telemetryKey = key;
      telemetry.replaceChildren(...items.map(({ label, value }) => {
        const row = $('div'); row.append($('dt', '', label), $('dd', '', value)); return row;
      }));
    },
    setActions(items) {
      handlers = new Map(items.map(item => [item.id, item.onClick]));
      const key = JSON.stringify(items.map(({ onClick, ...item }) => item)); if (key === actionKey) return; actionKey = key;
      const focusedId = actions.contains(document.activeElement) ? document.activeElement.dataset.action : null;
      actions.replaceChildren(...items.map(item => {
        const btn = $('button', item.primary ? 'journey-button primary' : 'journey-button', item.label);
        btn.dataset.action = item.id; btn.disabled = !!item.disabled; btn.type = 'button'; return btn;
      }));
      if (focusedId) [...actions.children].find(el => el.dataset.action === focusedId)?.focus({ preventScroll: true });
    },
    toast: toastMessage,
    showBrief({ title: text, body: copy, button: label = '开始探索', onStart = () => {} }) {
      dialog.replaceChildren($('div', 'journey-kicker', 'COSMOS · 火星先遣计划'), $('h2', '', text), $('p', 'journey-brief-copy', copy));
      const foot = $('div', 'journey-dialog-actions');
      foot.append(button(label, () => { closeDialog(); onStart(); }, true));
      dialog.append(foot); briefOpen = true; openDialog();
    },
  };
}
