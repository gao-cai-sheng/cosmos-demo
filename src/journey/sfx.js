// 音效引擎（D78）：播 assets/sfx/ 里的文件。谁要出声就 import { sfx }，调 sfx.play('名字')。
// 名字、音量、总线都在 sfx-cues.js；什么时候响由 sfx-watch.js（看游戏状态）和各处的直接调用决定。
// 没有 AudioContext 的环境（node 测试）里所有方法都是空转，不报错。
import { CUES, LOOP_START, cueFiles } from './sfx-cues.js';
import { getSettings } from './state.js';

const MASTER = .85;
const CABIN_HZ = 9000, SUIT_HZ = 1100;   // 机械声的低通：舱内几乎不滤，舱外隔着头盔只剩低频
const HISTORY = 200;
const LATE_MS = 600;                      // 第一次点按时文件还在载入，晚这么久以内还补播

export function createSfx({
  base = new URL('../../assets/sfx/', import.meta.url).href,
  enabled = () => getSettings().sound,
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetchFile = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); }),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  let ctx = null, master, ui, world, filter, muffled = 1, lastPick = '', waking = null;
  const buffers = new Map();   // 文件名 → AudioBuffer（解码好了）| Promise（还在路上）| null（坏了）
  const loops = new Map();     // 名字 → { gain, rate, node, source, sentGain, sentRate }
  const history = [];          // 最近播过什么，给测试和试听页看
  const bound = new WeakSet();
  const on = () => { try { return !!enabled(); } catch { return false; } };
  const cutoff = v => Math.exp(Math.log(CABIN_HZ) + (Math.log(SUIT_HZ) - Math.log(CABIN_HZ)) * Math.max(0, Math.min(1, v)));

  function load(file) {
    if (buffers.has(file)) return buffers.get(file);
    const job = fetchFile(base + file + '.mp3').then(data => ctx.decodeAudioData(data)).then(buffer => { buffers.set(file, buffer); return buffer; })
      .catch(error => { buffers.set(file, null); console.warn('[sfx] 载入失败', file, error?.message || error); return null; });
    buffers.set(file, job); return job;
  }
  const ready = file => { const b = buffers.get(file); return b && typeof b.then !== 'function' ? b : null; };

  /** 建好声音图、开始载入文件。浏览器在玩家点过一下之前可能不让出声，那时先建好等着。 */
  function ensure() {
    if (ctx || !AudioContextClass) return ctx;
    ctx = new AudioContextClass();
    master = ctx.createGain(); master.gain.value = on() ? MASTER : 0;
    // 触地、发动机、风叠在一起会顶到头：出口压一道，平时不起作用
    const guard = ctx.createDynamicsCompressor(); guard.threshold.value = -10; guard.knee.value = 12; guard.ratio.value = 8; guard.attack.value = .004; guard.release.value = .2;
    master.connect(guard); guard.connect(ctx.destination);
    ui = ctx.createGain(); ui.connect(master);
    world = ctx.createGain(); filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .5; filter.frequency.value = cutoff(muffled);
    world.connect(filter); filter.connect(master);
    for (const name of Object.keys(CUES)) for (const file of cueFiles(name)) load(file);
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended' && !globalThis.document?.hidden) waking = c.resume().catch(() => {}); }

  /** 播一声。opts：gain 再乘一个音量；rate 播放速度；pan 左右（-1…1）；delay 晚多少秒。真的出声了返回 true。 */
  function play(name, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
    const cue = CUES[name];
    if (!cue || cue.loop) { console.warn('[sfx] 没有这个提示音', name); return false; }
    const entry = { name, at: now(), gain, played: false };
    history.push(entry); if (history.length > HISTORY) history.shift();
    if (!ctx || !on() || gain <= 0) return false;
    let file = name;
    if (cue.files) { const pool = cue.files.filter(f => f !== lastPick); file = lastPick = pool[Math.floor(Math.random() * pool.length)]; }
    const start = buffer => {
      const source = ctx.createBufferSource(); source.buffer = buffer;
      source.playbackRate.value = (cue.rate || 1) * rate * (1 + (Math.random() * 2 - 1) * (cue.jitter || 0));
      const level = ctx.createGain(); level.gain.value = cue.gain * gain; source.connect(level);
      let out = level;
      if (pan && ctx.createStereoPanner) { out = ctx.createStereoPanner(); out.pan.value = pan; level.connect(out); }
      out.connect(cue.bus === 'ui' ? ui : world);
      source.start(ctx.currentTime + Math.max(0, delay));
      return entry.played = true;
    };
    const buffer = ready(file);
    if (ctx.state === 'running' && buffer) return start(buffer);
    // 玩家第一次点按：声音图刚启动、文件还在路上。半秒内等得到就补上，等不到就算了——晚太多的音效比没有更糟。
    Promise.all([waking, buffers.get(file)]).then(([, late]) => { if (late && ctx.state === 'running' && now() - entry.at < LATE_MS) start(late); });
    return false;
  }

  function apply(l) {
    if (!ctx || ctx.state !== 'running') return;
    const cue = CUES[l.name], want = on() ? cue.gain * l.gain : 0, rate = (cue.rate || 1) * l.rate, t = ctx.currentTime;
    if (!l.source) {
      if (want <= .0005) return;
      const buffer = ready(l.name); if (!buffer) return;
      l.source = ctx.createBufferSource(); l.source.buffer = buffer; l.source.loop = true;
      l.source.loopStart = LOOP_START; l.source.loopEnd = LOOP_START + cue.loop; l.source.playbackRate.value = rate;
      l.node = ctx.createGain(); l.node.gain.value = 0;
      l.source.connect(l.node); l.node.connect(cue.bus === 'ui' ? ui : world);
      l.source.start(t, LOOP_START + Math.random() * cue.loop * .9); l.sentGain = 0; l.sentRate = rate;
    }
    // 每帧都会被叫到，值没变就不再排自动化事件
    if (Math.abs(want - l.sentGain) > .002) { l.node.gain.setTargetAtTime(want, t, .12); l.sentGain = want; }
    if (Math.abs(rate - l.sentRate) > .002) { l.source.playbackRate.setTargetAtTime(rate, t, .15); l.sentRate = rate; }
  }
  /** 循环音的把手。set(gain, rate) 每帧调都行：第一次要出声时才真的开始播，gain 为 0 就静着。 */
  function loop(name) {
    if (!CUES[name]?.loop) throw new Error('[sfx] 不是循环音：' + name);
    let l = loops.get(name);
    if (!l) { l = { name, gain: 0, rate: 1, source: null, node: null, sentGain: 0, sentRate: 1 }; loops.set(name, l); }
    return { set(gain, rate = 1) { l.gain = Math.max(0, gain); l.rate = rate; apply(l); }, get gain() { return l.gain; }, get rate() { return l.rate; } };
  }

  /** 机械声闷多少：0 = 在舱里，1 = 穿着宇航服在外面。 */
  function muffle(v) {
    if (Math.abs(v - muffled) < .01) return;
    muffled = v; if (ctx) filter.frequency.setTargetAtTime(cutoff(v), ctx.currentTime, .3);
  }
  /** 设置里的「音效」开关变了以后调一下。 */
  function refresh() {
    if (!ctx) return;
    master.gain.setTargetAtTime(on() ? MASTER : 0, ctx.currentTime, .05);
    for (const l of loops.values()) apply(l);
  }
  /** 页面上所有按钮点一下都出一声。按钮上写 data-sfx="名字" 换别的声，data-sfx="none" 不出声。 */
  function bindButtons(root = globalThis.document) {
    if (!root || bound.has(root)) return;
    bound.add(root);
    root.addEventListener('click', event => {
      const button = event.target?.closest?.('button, [role="button"], [data-sfx]');
      if (!button || button.disabled) return;
      const name = button.dataset?.sfx || 'ui-click';
      if (name !== 'none') play(name);
    }, true);
  }

  if (AudioContextClass && globalThis.document) {
    for (const type of ['pointerdown', 'keydown']) addEventListener(type, unlock, { capture: true, passive: true });
    // 切到别的标签页时游戏循环停了，循环音不能自己接着响
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else unlock(); });
  }

  return {
    play, loop, muffle, refresh, bindButtons, history,
    /** 现在就试着建好并启动（开场降落演出用：从上一页点过来时浏览器多半已经允许出声）。 */
    prime: unlock,
    /** 所有文件载完后兑现；试听页和测试用。返回 { 文件名: 秒数 | null }。 */
    async loaded() {
      if (!ensure()) return {};
      await Promise.all([...buffers.values()]);
      return Object.fromEntries([...buffers].map(([file, b]) => [file, b ? b.duration : null]));
    },
    get state() { return !AudioContextClass ? 'unavailable' : !ctx ? 'idle' : ctx.state; },
    get enabled() { return on(); },
    get muffled() { return muffled; },
    get context() { return ctx; },
    get output() { return master; },
  };
}

/** 全游戏共用的那一个。 */
export const sfx = createSfx();
if (globalThis.document) globalThis.__SFX = sfx;
