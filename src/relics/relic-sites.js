// 场景里的遗迹：加载模型、按材质合并、落到地上，给步行 / 载具 / 降落 / 镜头各一套阻挡判断。
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadBlenderAsset } from '../journey/assets/blender-assets.js';
import { relicsInScene } from './placement.js';
import { meshFootprint } from './footprint.js';

/** NX07 离遗迹至少这么远才降落：喷流别把 50 年的遗迹吹翻、糊一层土。 */
export const LANDING_KEEP_OUT = 60;
/** 载具（ARES、NX07 地面判定）按外接圆挡，外扩这么多。人走路另用真实占地图。 */
const VEHICLE_MARGIN = 1;

function positions(geo) {
  const a = geo.attributes.position, out = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
  return out;
}

/* Codex 版一个模型两三百个零件，每个零件一次绘制。按材质合并成十几块。
   镜像零件（行列式 < 0）合并后绕序会反，换成正面朝外之前先把三角形翻回来。 */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), groups = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      for (const attr of Object.values(g.attributes)) {
        for (let i = 0; i < attr.count; i += 3) for (let c = 0; c < attr.itemSize; c++) {
          const b = attr.getComponent(i + 1, c); attr.setComponent(i + 1, c, attr.getComponent(i + 2, c)); attr.setComponent(i + 2, c, b);
        }
      }
    }
    const key = o.material.uuid + '|' + Object.keys(g.attributes).sort().join(',');
    if (!groups.has(key)) groups.set(key, { material: o.material, list: [] });
    groups.get(key).list.push(g);
  });
  const out = new THREE.Group();
  for (const { material, list } of groups.values()) {
    const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

/** site：场景中心 {lat, lon}；heightAt(x,z) 地形高度；rangeM：多远以内的遗迹要放。 */
export function mountRelicSites({ scene, site, heightAt, rangeM = 6400 }) {
  const pieces = relicsInScene(site, rangeM).map(p => ({
    ...p, group: new THREE.Group(), box: new THREE.Box3(), radius: 0, height: 0, footprint: null, ready: false,
  }));
  for (const p of pieces) {
    p.group.name = `relic:${p.id}:${p.file}`;
    p.group.position.set(p.x, heightAt(p.x, p.z), p.z);
    p.group.rotation.y = p.yaw;
    scene.add(p.group);
  }

  function place(p, model) {
    const merged = mergeByMaterial(model);
    const local = new THREE.Box3().setFromObject(merged);
    p.radius = Math.hypot(Math.max(-local.min.x, local.max.x), Math.max(-local.min.z, local.max.z));
    p.height = local.max.y;
    // 不整平地面：取包围盒四角和中心五点里最低的地形高度落地，宁可腿插进坡里一点，也不悬空。
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw), ys = [heightAt(p.x, p.z)];
    for (const [lx, lz] of [[local.min.x, local.min.z], [local.max.x, local.min.z], [local.min.x, local.max.z], [local.max.x, local.max.z]])
      ys.push(heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c));
    p.group.position.y = Math.min(...ys) - local.min.y;
    p.group.add(merged);
    p.group.updateMatrixWorld(true);
    p.box.setFromObject(p.group);
    p.footprint = meshFootprint(merged.children.map(m => ({ position: positions(m.geometry) })));
    p.ready = true;
  }

  const ready = Promise.allSettled(pieces.map(p =>
    loadBlenderAsset(`relics/${p.file}`).then(model => place(p, model))
      .catch(e => { p.error = e.message; console.error(`Relic ${p.file} failed to load`, e); })));

  // 世界坐标 → 遗迹本地坐标（group.rotation.y = yaw 的逆）。
  const toLocal = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  };
  const near = (p, x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
  const walkBlocked = (x, z) => pieces.some(p => p.ready && near(p, x, z, p.radius + 1) && p.footprint.blocked(...toLocal(p, x, z)));

  return {
    pieces, ready,
    walkBlocked,
    vehicleBlocked: (x, z) => pieces.some(p => p.ready && near(p, x, z, p.radius + VEHICLE_MARGIN)),
    // 没载完也要挡：降落点可能在模型下载完之前就选好了。
    landingBlocked: (x, z) => pieces.some(p => near(p, x, z, (p.radius || 3) + LANDING_KEEP_OUT)),
    cameraBlocked: (x, y, z) => pieces.some(p => p.ready && y < p.group.position.y + p.height && near(p, x, z, p.radius + 1) && p.footprint.blocked(...toLocal(p, x, z))),
    /** maxM 米以内的遗迹件，由近到远（按包围盒中心的水平距离）。 */
    within(pos, maxM = Infinity) {
      return pieces.filter(q => q.ready).map(q => {
        const c = q.box.getCenter(new THREE.Vector3());
        return { id: q.id, file: q.file, box: q.box, center: c, distance: Math.hypot(c.x - pos.x, c.z - pos.z), piece: q, objects: [q.group] };
      }).filter(t => t.distance <= maxM).sort((a, b) => a.distance - b.distance);
    },
    nearest(pos, maxM = Infinity) { return this.within(pos, maxM)[0] || null; },
  };
}
