// 场景里有哪些遗迹：纯函数，node 里能测。
import { geoToLocal } from '../journey/route.js';
import { MODELLED } from './catalog.js';

/** 场景中心 site（lat/lon）rangeM 米以内的遗迹件，每件 {id, file, x, z, yaw, extra?}。
 * 本地坐标同 route.js：+X 东，+Z 南。附属件（旅居者）跟着主件一起进出。 */
export function relicsInScene(site, rangeM) {
  const out = [];
  for (const r of MODELLED) {
    const p = geoToLocal(r, site);
    if (Math.hypot(p.x, p.z) > rangeM) continue;
    out.push({ id: r.id, file: r.model.file, x: p.x, z: p.z, yaw: r.model.yaw });
    for (const e of r.model.extras || [])
      out.push({ id: r.id, file: e.file, x: p.x + e.dx, z: p.z + e.dz, yaw: e.yaw, extra: true });
  }
  return out;
}
