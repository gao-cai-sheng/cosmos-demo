// 已建模的遗迹。坐标只在 route-chart 的 RELICS 里维护一份，这里只挂模型和任务顺序。
import { RELICS } from '../nav/route-chart.js';
import { TASK_ORDER } from './order.js';
export { TASK_ORDER };

/* file：assets/models/relics/<file>.glb（游戏里用）；brief：简报档案台用的零件版。
   yaw：模型绕 +Y 转多少（弧度）。真实朝向多数查不到，统一 0；有据可查的再填。
   extras：同一处的附属件，dx 向东、dz 向南（米），相对主件。 */
export const RELIC_MODELS = Object.freeze({
  INSG: { file: 'insight', brief: 'insight', yaw: 0 },
  // 与海盗 1 号同型（blender/viking2/README.md）；blender/viking2 那版机身是错的金色，直接借 v2。
  VKG2: { file: 'viking1-v2', brief: 'viking1-v2-parts', yaw: 0 },
  BGL2: { file: 'beagle2', brief: 'beagle2', yaw: 0 },
  INGN: { file: 'ingenuity', brief: 'ingenuity', yaw: 0 },
  VKG1: { file: 'viking1-v2', brief: 'viking1-v2-parts', yaw: 0 },
  PTHF: { file: 'pathfinder', brief: 'pathfinder', yaw: 0, extras: [SOJOURNER()] },
});

/* 旅居者最后停在哪：任务图像里最后一次看到它，离着陆器约 13 m；之后它还在自己开。
   2006-12-21 HiRISE 在着陆器正南约 6 m 处拍到一团可能是它的像素（NASA Photojournal
   「Mars Pathfinder Landing Site and Surroundings」）。取 HiRISE 这个位置：正南 6 m。 */
function SOJOURNER() {
  return { file: 'sojourner', dx: 0, dz: 6, yaw: 0 };
}

export function relicById(id) {
  const r = RELICS.find(x => x.id === id), model = RELIC_MODELS[id];
  return r && model ? { ...r, model } : null;
}
export const MODELLED = Object.freeze(TASK_ORDER.map(relicById));

/** Insight is the introductory mainline; the remaining sites are parallel optional visits. */
export function availableTasks(progress) {
  return TASK_ORDER.filter(id => !progress?.done?.[id] && (id === 'INSG' || !!progress?.done?.INSG));
}

/** 下一个可接的任务；有进行中的任务、或全部完成时返回 null。 */
export function nextTask(progress) {
  if (progress?.active) return null;
  return availableTasks(progress)[0] ?? null;
}
