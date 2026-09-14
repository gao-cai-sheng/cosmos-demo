/* ============================================================
   驾驶输入
   ------------------------------------------------------------
   输出两组字段：

     行驶  throttle / steer / brake / tc
     视角  lookX / lookY / zoom / looking / up / down / boost / camCycle

   第二组是这次补的。上一版只有第一组，所以驾驶时相机既转不动
   也变不了焦 —— 相机机架每帧全权覆写位置和焦段，而没有任何输入
   能改机架的参数。

   油门和转向都做了斜率限制而不是直接跳到 ±1 —— 键盘只有开和关两档，
   不做斜率的话，每一次按键都是一记阶跃输入，物理那边会照单全收，
   车会一顿一顿地走。

   视角这边有两条不显然的：

     ① `looking` 是一个显式标志，不是从 lookX/lookY 的大小推出来的。
        鼠标位移的单位是像素，摇杆是 0–1，两者不同量纲；用大小做判据的话
        摇杆推到三分之一都够不着阈值，相机的自动回中就会跟摇杆打架。
     ② 转视角默认用**按住拖动**，不用指针锁定。这个环境里
        requestPointerLock 会抛安全错误（见 HANDOFF 的排查记录），
        拖动到哪都能用。想要锁定就传 pointerLock:true，失败会静默退回拖动。
   ============================================================ */

const 行驶键 = ['w', 'a', 's', 'd', ' ', 'shift', 'control',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'z'];

/**
 * @param {Window|HTMLElement} target 键盘监听挂在哪
 * @param {{canvas?:HTMLElement, pointerLock?:boolean, wheelStep?:number, enabled?:boolean, touch?:boolean}} opts
 *        canvas 不给就退回 document.body，鼠标事件挂在它上面
 */
export function makeDriveInput(target = window, opts = {}) {
  const canvas = opts.canvas || (target.document ? target.document.body : target);
  const wheelStep = opts.wheelStep ?? 1;
  const keys = new Set();
  const touchPointers = new Map();
  let enabled = opts.enabled !== false;
  let suspended = false;
  let disposed = false;
  let touchRoot = null, touchStyle = null;
  const touchButtons = new Map();
  const editable = (node) => !!node?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  const active = () => enabled && !suspended && !disposed && !document.hidden;

  const ctl = {
    throttle: 0, steer: 0, brake: 0, tc: true,
    lookX: 0, lookY: 0, zoom: 0, looking: false,
    up: false, down: false, boost: false,
    camCycle: false,          // 边沿触发：本帧按过 C 吗
  };

  // 累加器。事件随时到，但每帧只消费一次并清零 ——
  // 不清零的话高刷屏上同一次滑动会被多帧重复读到。
  let accX = 0, accY = 0, accZoom = 0, moved = false;
  let dragging = false, lastX = 0, lastY = 0, dragPid = null;
  let locked = false, camHit = false;

  // 切模式、切窗口和触控取消时都清掉累积量，重上车不会读到旧输入。
  function reset() {
    keys.clear();
    touchPointers.clear();
    for (const button of touchButtons.values()) button.dataset.active = 'false';
    dragging = false; dragPid = null;
    lastX = 0; lastY = 0;
    accX = 0; accY = 0; accZoom = 0; moved = false; camHit = false;
    Object.assign(ctl, {
      throttle: 0, steer: 0, brake: 0,
      lookX: 0, lookY: 0, zoom: 0, looking: false,
      up: false, down: false, boost: false, camCycle: false,
    });
  }
  function park() {
    reset();
    ctl.brake = 1;
    return ctl;
  }
  function syncTouch() {
    if (touchRoot) touchRoot.hidden = !active();
  }
  function unlock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    locked = false;
  }
  function requestLock() {
    if (!active()) return;
    try {
      const request = canvas.requestPointerLock?.();
      request?.catch?.(() => {});         // 新浏览器的权限错误可能通过 Promise 返回
    } catch { /* 没有权限时继续使用拖动 */ }
  }
  function setEnabled(value) {
    enabled = !!value;
    reset();
    if (!enabled) { ctl.brake = 1; unlock(); }
    syncTouch();
  }
  const down = (e) => {
    if (!active() || editable(e.target)) return;
    const k = e.key.toLowerCase();
    if (行驶键.includes(k)) {
      keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    }
    if (e.repeat) return;
    if (k === 'y') ctl.tc = !ctl.tc;
    if (k === 'c') camHit = true;
  };
  // 即使焦点已进输入框，松键也必须释放之前按住的油门。
  const up = (e) => keys.delete(e.key.toLowerCase());
  const blur = () => { suspended = true; reset(); syncTouch(); };
  const focus = () => { suspended = false; reset(); syncTouch(); };
  const visibility = () => {
    if (document.hidden) suspended = true;
    else suspended = false;
    reset(); syncTouch();
  };
  const focusInput = (e) => { if (editable(e.target)) reset(); };

  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  target.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('focusin', focusInput);

  /* ---- 转视角：按住拖动，或指针锁定 ---- */
  const pdown = (e) => {
    if (!active() || editable(e.target) || e.target?.closest?.('.rover-touch-controls')) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (dragging && dragPid !== e.pointerId) return;
    dragging = true; dragPid = e.pointerId ?? null;
    lastX = e.clientX; lastY = e.clientY;
    // 捕获指针，鼠标划出画布也不断。失败不要紧 —— 合成事件和某些
    // 触控路径下这个 id 不是活动指针，会抛 NotFoundError，
    // 抛出去就会把后面的锁定分支一起打断。
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* 忽略 */ }
    if (opts.pointerLock && !locked) {
      requestLock();
    }
  };
  const pmove = (e) => {
    if (!active()) return;
    if (locked) {                       // 锁定时用 movement，鼠标可以一直转
      accX += e.movementX || 0; accY += e.movementY || 0;
      if (e.movementX || e.movementY) moved = true;
      return;
    }
    if (!dragging || (dragPid !== null && e.pointerId !== dragPid)) return;
    if (e.clientX !== lastX || e.clientY !== lastY) moved = true;
    accX += e.clientX - lastX; accY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  };
  const pup = (e) => {
    if (dragPid !== null && e.pointerId !== dragPid) return;
    dragging = false; dragPid = null;
  };
  const wheel = (e) => {
    if (!active() || editable(e.target)) return;
    e.preventDefault();
    // 只取符号。不同设备的 deltaY 差两个数量级，直接用会变成一格到底。
    accZoom += Math.sign(e.deltaY) * wheelStep;
  };
  const lockChange = () => {
    locked = document.pointerLockElement === canvas;
    if (locked && !active()) unlock();
  };

  canvas.addEventListener('pointerdown', pdown);
  canvas.addEventListener('pointermove', pmove);
  canvas.addEventListener('pointerup', pup);
  canvas.addEventListener('pointercancel', pup);
  canvas.addEventListener('lostpointercapture', pup);
  canvas.addEventListener('wheel', wheel, { passive: false });
  document.addEventListener('pointerlockchange', lockChange);

  /* 触屏驾驶：左右两组把画面中间留给任务按钮。触摸按键和键盘分开
     记账，一根手指松开不会误释放另一根手指，也不会冒泡成画布拖拽。 */
  const touchEnabled = opts.touch ??
    ((window.matchMedia?.('(pointer: coarse)').matches || false) || navigator.maxTouchPoints > 0);
  if (touchEnabled) {
    touchStyle = document.createElement('style');
    touchStyle.textContent = `
      .rover-touch-controls[hidden]{display:none!important}
      .rover-touch-controls{position:fixed;inset:auto 12px var(--rover-touch-bottom,max(12px,env(safe-area-inset-bottom)));height:152px;z-index:35;pointer-events:none;user-select:none;-webkit-user-select:none}
      .rover-touch-controls .rover-pad{position:absolute;left:0;bottom:0;display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:4px;pointer-events:none}
      .rover-touch-controls .rover-actions{position:absolute;right:0;bottom:0;display:grid;gap:8px;pointer-events:none}
      .rover-touch-controls button{box-sizing:border-box;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid rgba(167,227,221,.5);border-radius:10px;background:rgba(7,15,18,.86);color:#d9f2ed;font:600 16px/1 sans-serif;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}
      .rover-touch-controls .rover-actions button{width:54px;height:54px;font-size:12px}
      .rover-touch-controls button[data-active="true"]{background:#a7e3dd;color:#091214;border-color:#a7e3dd}
      .rover-touch-controls button:focus-visible{outline:2px solid #fff;outline-offset:3px}
      @media(max-height:460px){.rover-touch-controls .rover-pad{grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,36px);gap:3px}.rover-touch-controls button{width:40px;height:36px}.rover-touch-controls .rover-actions button{height:44px}}
    `;
    document.head.appendChild(touchStyle);
    touchRoot = document.createElement('div');
    touchRoot.id = opts.controlId || 'rover-touch-controls'; touchRoot.className='rover-touch-controls';
    touchRoot.className = 'rover-touch-controls';
    touchRoot.setAttribute('aria-label', '火星车触屏驾驶');
    const pad = document.createElement('div');
    pad.className = 'rover-pad';
    const actions = document.createElement('div');
    actions.className = 'rover-actions';
    touchRoot.append(pad, actions);
    const addButton = (container, key, label, text, cell) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', label);
      button.dataset.active = 'false';
      if (cell) button.style.gridArea = cell;
      touchButtons.set(key, button);
      button.addEventListener('pointerdown', (event) => {
        if (!active()) return;
        event.preventDefault(); event.stopPropagation();
        touchPointers.set(event.pointerId, key);
        button.dataset.active = 'true';
        if (key === 'camera') camHit = true;
        try { button.setPointerCapture(event.pointerId); } catch { /* 由 window 的松手监听兜底 */ }
      });
      button.addEventListener('pointermove', (event) => {
        if (!active()) return;
        event.preventDefault(); event.stopPropagation();
      });
      button.addEventListener('click', (event) => {
        if (!active()) return;
        event.preventDefault(); event.stopPropagation();
        if (event.detail === 0 && key === 'camera') camHit = true;
      });
      button.addEventListener('lostpointercapture', releaseTouch);
      container.appendChild(button);
    };
    addButton(pad, 'w', '按住前进', '▲', '1 / 2');
    addButton(pad, 'a', '按住左转', '◀', '2 / 1');
    addButton(pad, 'd', '按住右转', '▶', '2 / 3');
    addButton(pad, 's', '按住倒车', '▼', '3 / 2');
    addButton(actions, 'camera', '切换驾驶机位', '视角');
    addButton(actions, ' ', '按住刹车', '刹车');
    document.body.appendChild(touchRoot);
    syncTouch();
  }
  function releaseTouch(event) {
    const key = touchPointers.get(event.pointerId);
    if (key === undefined) return;
    touchPointers.delete(event.pointerId);
    const held = [...touchPointers.values()].includes(key);
    touchButtons.get(key).dataset.active = String(held);
    if (active()) { event.preventDefault(); event.stopPropagation(); }
  }
  // 捕获失败或手指移到按钮外，仍能结束这一次输入。
  window.addEventListener('pointerup', releaseTouch);
  window.addEventListener('pointercancel', releaseTouch);
  const has = (...ks) => ks.some((k) => keys.has(k) || [...touchPointers.values()].includes(k));

  return {
    ctl,
    setEnabled,
    reset,
    get enabled() { return enabled; },
    get 已锁定指针() { return locked; },
    /** 主动请求指针锁定。失败不抛，拖动照样能用 */
    锁定指针: requestLock,
    解锁指针: unlock,

    update(dt) {
      if (!active() || editable(document.activeElement)) return park();
      const wantT = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0);
      const wantS = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
      // 松手回中比给油更快：踩下去要有惯性，放开要干脆
      const rate = (cur, want, upR, dnR) =>
        cur + (want - cur) * Math.min(1, dt * (Math.abs(want) > Math.abs(cur) ? upR : dnR));
      ctl.throttle = rate(ctl.throttle, wantT, 3.2, 6.0);
      ctl.steer = rate(ctl.steer, wantS, 5.0, 9.0);
      ctl.brake = (opts.flight ? has(' ') : has(' ', 'shift')) ? 1 : 0;

      ctl.lookX = accX; ctl.lookY = accY; ctl.zoom = accZoom;
      ctl.looking = moved;
      ctl.up = has(opts.flight ? 'e' : 'q');            // 自由机位升降；空格在那边不是刹车
      ctl.down = has(opts.flight ? 'q' : 'z');
      ctl.boost = has('shift');
      ctl.camCycle = camHit;

      accX = 0; accY = 0; accZoom = 0; moved = false; camHit = false;

      /* 手柄。右摇杆转视角，肩键变焦。乘 13 是把 0–1 换算成
         「一帧鼠标滑多少像素」的量级，和鼠标共用同一套灵敏度。 */
      if (navigator.getGamepads) {
        for (const gp of navigator.getGamepads()) {
          if (!gp || !gp.connected) continue;
          const dz = (v) => (Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86);
          const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
          const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
          if (lx) ctl.steer = Math.max(-1, Math.min(1, ctl.steer + lx));
          const trig = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
          if (trig) ctl.throttle = Math.max(-1, Math.min(1, ctl.throttle + trig));
          else if (ly) ctl.throttle = Math.max(-1, Math.min(1, ctl.throttle - ly));
          if (gp.buttons[0]?.pressed) ctl.brake = 1;
          ctl.lookX += rx * 13; ctl.lookY += ry * 13;
          if (Math.abs(rx) + Math.abs(ry) > 0.02) ctl.looking = true;
          if (gp.buttons[4]?.pressed) ctl.zoom -= 0.35;
          if (gp.buttons[5]?.pressed) ctl.zoom += 0.35;
          break;                          // 只认第一个手柄
        }
      }
      return ctl;
    },

    dispose() {
      disposed = true;
      setEnabled(false);
      touchRoot?.remove();
      touchStyle?.remove();
      window.removeEventListener('pointerup', releaseTouch);
      window.removeEventListener('pointercancel', releaseTouch);
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
      target.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', focusInput);
      canvas.removeEventListener('pointerdown', pdown);
      canvas.removeEventListener('pointermove', pmove);
      canvas.removeEventListener('pointerup', pup);
      canvas.removeEventListener('pointercancel', pup);
      canvas.removeEventListener('lostpointercapture', pup);
      canvas.removeEventListener('wheel', wheel);
      document.removeEventListener('pointerlockchange', lockChange);
    },
  };
}
