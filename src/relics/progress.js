// 遗迹任务进度：接任务、完成任务。存在主存档的 relics 字段里（journey/state.js），照片单独存。
import { getJourney, updateJourney, saveRelicPhoto } from '../journey/state.js';
import { availableTasks } from './catalog.js';

export function relicProgress() {
  return getJourney()?.relics ?? { active: null, done: {} };
}
const changed = () => dispatchEvent(new CustomEvent('relic:progress', { detail: relicProgress() }));

/** Select a navigation focus; after Insight the other tasks remain available in parallel. */
export function acceptRelic(id) {
  const p = relicProgress();
  if (!availableTasks(p).includes(id)) return false;
  updateJourney({ relics: { ...p, active: id } });
  changed();
  return true;
}

/** Optional sites can be photographed in any order, regardless of navigation focus. */
export function completeRelic(id, image) {
  const p = relicProgress();
  if (p.done[id] || (id === 'INSG' ? p.active !== id : !availableTasks(p).includes(id))) return false;
  saveRelicPhoto(id, image);
  updateJourney({ relics: { active: p.active === id ? null : p.active, done: { ...p.done, [id]: { at: Date.now() } } } });
  changed();
  return true;
}
