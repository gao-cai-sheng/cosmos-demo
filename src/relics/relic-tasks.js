// 遗迹任务在地表场景里的那一半：K 键拍照、快门和照片卡、当前任务的提示条（D65）。
import * as THREE from 'three';
import { createRelicCamera, GIMBAL } from './relic-camera.js';
import { relicById } from './catalog.js';
import { relicProgress, completeRelic } from './progress.js';
import { sfx } from '../journey/sfx.js';

/** 地面上（步行、ARES、MU-7、停在地上的 NX07）多远以内的遗迹算「在拍它」。 */
const EYE_RANGE = 300;
const REASON = {
  none: '附近没有遗迹。', behind: '遗迹不在画面里。', edge: '遗迹太偏了，放到画面中间再拍。',
  small: '太远了，靠近一点再拍。', blocked: '视线被地形挡住了。',
  air: `机腹相机 ${GIMBAL.range} 米内没有遗迹，飞近一点再拍。`,
};
/** 没拍清的那句话。被载具或建筑挡住时说出是谁（D71）；英文名两边留空格。 */
const why = r => r.reason === 'occluded'
  ? `被${/^[\x21-\x7e]/.test(r.by) ? ` ${r.by} ` : r.by}挡住了，换个位置再拍。`
  : REASON[r.reason] || '';

export function mountRelicTasks({ scene, renderer, camera, heightAt, sites, mobility }) {
  if (!document.querySelector('link[data-relic-css]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.relicCss = '';
    link.href = new URL('./relic-tasks.css', import.meta.url).href; document.head.append(link);
  }
  const flash = document.createElement('div'); flash.className = 'relic-flash'; flash.setAttribute('aria-hidden', 'true');
  const card = document.createElement('figure'); card.className = 'relic-photo'; card.hidden = true; card.setAttribute('role', 'status');
  card.innerHTML = '<img alt=""><figcaption><b></b><span></span></figcaption>';
  // 当前任务的提示条：一行字，告诉玩家去哪、做什么。
  const chip = document.createElement('div'); chip.className = 'relic-chip'; chip.hidden = true;
  document.body.append(flash, card, chip);
  function paintChip() {
    const id = relicProgress().active, r = id && relicById(id);
    chip.hidden = !r;
    if (r) chip.innerHTML = `<small>${id==='INSG'?'遗迹主线':'可选遗迹 · 不阻挡主线'}</small><b>${r.cn}</b><span>${r.where} · 到场按 K 拍照，落不下就在空中拍</span>`;
  }
  paintChip();
  addEventListener('relic:progress', paintChip);

  /** 拍清了一处遗迹：是当前任务就记完成。返回照片卡上的那句话。 */
  function onPhoto({ id, image }) {
    const p = relicProgress(), name = relicById(id).cn;
    if (completeRelic(id, image)) return document.body.classList.contains('cards-on') ? `${name}拍到了，照片已存档。` : `${name}任务完成，照片已存档。回生活舱通信台接下一个任务。`;
    if (p.done[id]) return '这一处的任务已经完成过了。';
    return p.active ? `它不是当前任务的目标（当前：${relicById(p.active).cn}）。` : '现在没有遗迹任务。到生活舱通信台接任务。';
  }
  const cam = createRelicCamera({ scene, renderer, heightAt });
  let cardTimer = 0, last = null;

  function showCard(image, title, body, ok) {
    card.querySelector('img').src = image || '';
    card.querySelector('img').hidden = !image;
    card.querySelector('b').textContent = title;
    card.querySelector('span').textContent = body;
    card.classList.toggle('ok', ok);
    card.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    clearTimeout(cardTimer); cardTimer = setTimeout(() => { card.hidden = true; }, ok ? 5200 : 3600);
  }

  /* 三种相机：
     - 在天上：NX07 机腹吊舱，自动对准 400 m 内最近的遗迹，拍的时候把船藏起来；
     - 步行：头盔相机，从人眼往主相机看的方向拍（第三人称镜头在人背后几米，小遗迹走到跟前也拍不大，
       人自己还挡在画面中间），拍的时候把人藏起来；
     - 其它（ARES、MU-7、停在地上的 NX07）：就用眼前这个画面。
     三种都把 ARES、MU-7、NX07、前哨仓算作遮挡（mobility.occluders）：照片上遗迹被挡掉一半以上不算拍到。 */
  function shoot() {
    const occluders = mobility.occluders;
    const flyer = mobility.flyer, airborne = flyer.active && !flyer.grounded;
    const walker = !airborne && mobility.walking ? mobility.astronaut : null;
    let result;
    if (airborne) {
      // pos 是起落架触地的那一层，吊舱在船底中心往上 1 m。机腹相机对准最近的那一处，
      // 一处有几件（探路者 + 旅居者）就框住全部，不然会对准更小的旅居者、判成太远。
      const from = flyer.position.clone().add(new THREE.Vector3(0, 1, 0));
      const near = sites.within(from, GIMBAL.range), id = near[0]?.id;
      const box = near.filter(t => t.id === id).reduce((b, t) => b.union(t.box), new THREE.Box3());
      const target = id ? { id, box, center: box.getCenter(new THREE.Vector3()), objects: near.filter(t => t.id === id).flatMap(t => t.objects) } : null;
      result = target && from.distanceTo(target.center) <= GIMBAL.range
        ? cam.shoot({ camera: cam.aimGimbal(from, target.box), targets: [target], hide: [flyer.asset.group], occluders })
        : { ...cam.shoot({ camera }), reason: 'air' };
    } else if (walker) {
      const eye = walker.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.62, 0));
      const look = camera.getWorldDirection(new THREE.Vector3());
      result = cam.shoot({ camera: cam.aimHelmet(eye, look, camera.fov), targets: sites.within(eye, EYE_RANGE), hide: [walker.root], occluders });
    } else {
      result = cam.shoot({ camera, targets: sites.within(camera.getWorldPosition(new THREE.Vector3()), EYE_RANGE), occluders });
    }
    const target = result.target;
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
    sfx.play('photo-shutter'); sfx.play(result.ok ? 'photo-ok' : 'photo-miss', { delay: .35 });
    const relic = target && relicById(target.id);
    const { target: _t, ...shot } = result;
    last = { ...shot, id: target?.id ?? null, mode: airborne ? 'gimbal' : walker ? 'helmet' : 'eye', at: Date.now() };
    if (result.ok) {
      const note = onPhoto({ id: target.id, image: result.image });
      showCard(result.image, `拍到了 ${relic.cn}`, note, true);
    } else {
      showCard(result.image, relic ? `没拍清 ${relic.cn}` : '没有拍到遗迹', why(result), false);
    }
    dispatchEvent(new CustomEvent('relic:photo', { detail: last }));
    return last;
  }

  const blockedNow = () => mobility.blocked || !!document.querySelector('dialog[open], .relic-archive, .regolith-station')
    || document.body.classList.contains('journey-paused');
  addEventListener('keydown', e => {
    if (e.code !== 'KeyK' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input,textarea,select,[contenteditable]') || blockedNow()) return;
    e.preventDefault(); shoot();
  });

  return { shoot, onPhoto, debugCover: cam.debugCover, get last() { return last; } };
}
