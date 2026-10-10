import { sfx } from './sfx.js';
import { Audio } from '../core/audio.js';
import { getSettings, updateSettings } from './state.js';

// Shared surface/settlement mix. Speech owns its separate player and setting.
export function mountMarsSound() {
  const audio = new Audio();
  let enabled = getSettings().sound, frozen = true, previewUntil = 0;
  const paint = () => document.querySelectorAll('[data-mars-sound]').forEach(b => {
    b.textContent = enabled ? '音效：开' : '音效：关';
    b.setAttribute('aria-pressed', String(enabled));
  });
  function unlock() {
    if (!enabled) return;
    audio.init(); audio.resume(); audio.setMusic(false);
    audio.master.gain.value = frozen ? 0 : .9;
    paint();
  }
  function ui(kind) { if (enabled && !frozen) audio.ui(kind); }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', event => { if (!event.repeat) unlock(); }, true);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-mars-sound]')) {
      enabled = !enabled; updateSettings({sound:enabled}); sfx.refresh(); unlock();
      if (audio.ready) {
        audio.master.gain.cancelScheduledValues(audio.now());
        // The switch deliberately previews even while the game is paused.
        audio.master.gain.value = enabled ? .9 : 0;
        if (enabled) { previewUntil = audio.now() + .35; audio.ui('ok'); }
      }
      paint();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audio.ready) audio.master.gain.value = 0;
  });
  return {
    audio, ui,
    chirp:()=>enabled&&!frozen&&audio.chirp(),
    echo:()=>enabled&&!frozen&&audio.echo(),
    discovery:()=>enabled&&!frozen&&audio.discovery(),
    radio:()=>enabled&&!frozen&&audio.radio(),
    thud:force=>enabled&&!frozen&&audio.thud(force),
    update(dt, state) {
      frozen = state.frozen || dt <= 0;
      if (!audio.ready) return;
      const t = audio.now();
      audio.master.gain.setTargetAtTime(enabled && (!frozen || t < previewUntil) ? .9 : 0, t, .025);
      if (!enabled || frozen) return;
      const m = state.rover, v = state.vehicle;
      const wheels = m?.wheels || [];
      const contact = wheels.filter(w=>w.contact);
      const speed = Math.abs(m?.speed || v?.speed || 0);
      for (const w of contact) {
        w._marsClunk = Math.max(0,(w._marsClunk || 0)-dt);
        if (w.compVel > 1.9 && !w._marsClunk) {
          audio.clunk((w.compVel-1.9)*.3,(w.side || 0)*.45); w._marsClunk = .16;
        }
      }
      audio.update(dt, {
        wheelSpin: m ? Math.max(0,...wheels.map(w=>Math.abs(w.spinVel))) : speed,
        spinRef: m?.spinRef || 12, maxSpeed: m ? 3.6 : 12,
        motorLoad: m?.motorLoad || (v ? Math.min(1,speed/8) : 0), speed,
        contacts: m ? contact.length : v ? 4 : 0,
        slip: contact.length ? Math.min(1,contact.reduce((a,w)=>a+w.slipLong+w.slipLat,0)/contact.length) : 0,
        rough: contact.length ? Math.min(1,contact.reduce((a,w)=>a+Math.abs(w.compVel)*.3,0)/contact.length) : 0,
        drilling: !!m?.drilling, alarm: m ? state.alarm : 0,
      });
      audio.aGain.gain.setTargetAtTime(state.inside ? .03 : m || v ? .015 : 0,t,.2);
    },
  };
}
