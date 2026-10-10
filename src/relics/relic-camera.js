// 给遗迹拍照：从主相机或 NX07 机腹吊舱相机渲染一张，判定拍没拍到，缩成缩略图。
import * as THREE from 'three';
import { judgePhoto, coverFromPixels, OCCLUDER_STEP } from './photo-judge.js';

/** 机腹相机最远斜距（米）、最窄视场角（度）、让遗迹占画面多少。 */
export const GIMBAL = Object.freeze({ range: 400, minFov: 1, fill: 0.5 });
const THUMB_W = 480;
/** 遮挡 id 图的宽（像素）和它借用的图层。 */
const COVER_W = 384, COVER_LAYER = 30;

function corners(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/** 视线有没有被地形挡住：沿线采样，离目标最后 10% 不算（遗迹自己脚下的土）。 */
export function lineOfSight(from, to, heightAt, clearance = 0.3) {
  const n = Math.max(8, Math.ceil(from.distanceTo(to) / 2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (t > 0.9) break;
    const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t, z = from.z + (to.z - from.z) * t;
    if (heightAt(x, z) > y + clearance) return false;
  }
  return true;
}

/* 挡得住视线的网格：写深度、看得见、不是半透明的。车窗玻璃、灯光锥、尾焰这些不算。 */
function solid(mesh) {
  const ok = m => m.visible && m.depthWrite && !(m.transparent && m.opacity < .5);
  return Array.isArray(mesh.material) ? mesh.material.some(ok) : ok(mesh.material);
}

export function createRelicCamera({ scene, renderer, heightAt }) {
  const gimbal = new THREE.PerspectiveCamera(20, 1, 1, 20000);
  const thumb = document.createElement('canvas');
  const idMaterial = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, side: THREE.DoubleSide });
  const idTarget = new THREE.WebGLRenderTarget(COVER_W, 1);
  let alone = new Uint8Array(0), mixed = alone, drawn = null;

  /* 遗迹被载具、建筑挡了多少（D71）。不用包围盒，直接用这台相机把真实网格画一遍小图：
     先只画遗迹，记下它占哪些像素；再把遮挡物带深度一个个画上去，看这些像素还剩多少是遗迹。
     照片上是什么，这里数出来的就是什么。没显示的东西（藏起来的人和船、还在腹舱里的车）自己就不会被画。
     objects：这处遗迹的模型；occluders：[{name, object}]。 */
  function cover(camera, objects, occluders) {
    occluders = occluders.slice(0, Math.floor(255 / OCCLUDER_STEP) - 1);   // 编号要和遗迹的 255 分得开
    if (!objects.length || !occluders.length) return null;
    const w = COVER_W, h = Math.max(1, Math.round(COVER_W / camera.aspect));
    idTarget.setSize(w, h);
    if (alone.length !== w * h * 4) { alone = new Uint8Array(w * h * 4); mixed = new Uint8Array(w * h * 4); }
    const keep = {
      target: renderer.getRenderTarget(), auto: renderer.autoClear, shadows: renderer.shadowMap.autoUpdate,
      colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
      background: scene.background, override: scene.overrideMaterial, mask: camera.layers.mask,
    };
    const draw = (roots, red, into) => {
      const tagged = [];
      for (const root of roots) root.traverse(o => { if (o.isMesh && solid(o)) { o.layers.enable(COVER_LAYER); tagged.push(o); } });
      idMaterial.color.setRGB(red / 255, 0, 0);
      renderer.render(scene, camera);
      tagged.forEach(o => o.layers.disable(COVER_LAYER));
      renderer.readRenderTargetPixels(idTarget, 0, 0, w, h, into);
    };
    try {
      scene.background = null; scene.overrideMaterial = idMaterial; camera.layers.set(COVER_LAYER);
      renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
      renderer.setRenderTarget(idTarget); renderer.setClearColor(0x000000, 0); renderer.clear();
      draw(objects, 255, alone);
      occluders.forEach((o, k) => draw([o.object], (k + 1) * OCCLUDER_STEP, mixed));
    } finally {
      renderer.setRenderTarget(keep.target); renderer.setClearColor(keep.colour, keep.alpha);
      renderer.autoClear = keep.auto; renderer.shadowMap.autoUpdate = keep.shadows;
      scene.background = keep.background; scene.overrideMaterial = keep.override; camera.layers.mask = keep.mask;
    }
    drawn = { w, h, alone, mixed, names: occluders.map(o => o.name) };
    return coverFromPixels(alone, mixed, drawn.names);
  }

  /** 机腹相机对准 target：放在 from，看包围盒中心，把视场角收到遗迹占画面约一半（最窄 1°）。 */
  function aimGimbal(from, box, aspect) {
    const center = box.getCenter(new THREE.Vector3());
    gimbal.aspect = aspect; gimbal.position.copy(from); gimbal.up.set(0, 1, 0);
    gimbal.lookAt(center); gimbal.updateMatrixWorld(true);
    const inv = gimbal.matrixWorldInverse;
    let t = 0;
    for (const c of corners(box)) {
      const p = c.applyMatrix4(inv);
      if (p.z >= -0.01) continue;
      t = Math.max(t, Math.abs(p.y) / -p.z, Math.abs(p.x) / (-p.z * aspect));
    }
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(t / GIMBAL.fill));
    gimbal.fov = THREE.MathUtils.clamp(fov, GIMBAL.minFov, 60);
    gimbal.near = Math.max(0.5, from.distanceTo(center) * 0.2);
    gimbal.updateProjectionMatrix();
    return gimbal;
  }

  /** target：{box, objects}。别的条件都过了，才去数载具和建筑挡了多少。 */
  function judge(camera, target, occluders = []) {
    camera.updateMatrixWorld(true);
    const ndc = corners(target.box).map(c => c.project(camera));
    const los = lineOfSight(camera.getWorldPosition(new THREE.Vector3()), target.box.getCenter(new THREE.Vector3()), heightAt);
    const plain = judgePhoto({ ndc, los });
    return plain.ok ? judgePhoto({ ndc, los, cover: cover(camera, target.objects || [], occluders) }) : plain;
  }

  /* 渲染到游戏画布（mars-vista 开着 preserveDrawingBuffer），马上拷走。
     不渲染到离屏目标：那条路不走色调映射和输出色彩空间，照片会和画面颜色不一样。
     下一帧游戏会照常重画。 */
  function snap(camera) {
    renderer.render(scene, camera);
    const src = renderer.domElement, h = Math.round(THUMB_W * src.height / src.width);
    thumb.width = THUMB_W; thumb.height = h;
    const g = thumb.getContext('2d');
    g.drawImage(src, 0, 0, THUMB_W, h);
    try { return thumb.toDataURL('image/jpeg', 0.82); } catch { return null; }
  }

  /** 用 camera 拍，targets 是附近的遗迹件（relicSites.within，由近到远）。拍得清的里取占画面最大的；
   * 都没拍清就报最近那件的原因。hide：拍的时候藏起来的东西（机腹相机不该拍到自己的船壳），
   * 判定和照片用同一个画面，藏起来的也不算遮挡。occluders：[{name, object}]，可能挡住遗迹的载具和建筑。 */
  function shoot({ camera, targets = [], hide = [], occluders = [] }) {
    const was = hide.map(o => o.visible);
    hide.forEach(o => { o.visible = false; });
    const judged = targets.map(target => ({ target, ...judge(camera, target, occluders) }));
    const image = snap(camera);
    hide.forEach((o, i) => { o.visible = was[i]; });
    const hits = judged.filter(j => j.ok).sort((a, b) => b.size - a.size);
    const best = hits[0] || judged[0] || { target: null, ok: false, reason: 'none' };
    return { ...best, image, fov: camera.fov };
  }

  /** 头盔相机：人眼的位置，朝 look 这个方向（主相机看的方向），视场角同主相机。 */
  const helmet = new THREE.PerspectiveCamera(55, 1, 0.05, 20000);
  function aimHelmet(eye, look, fov, aspect) {
    helmet.fov = fov; helmet.aspect = aspect; helmet.position.copy(eye);
    helmet.lookAt(eye.clone().add(look)); helmet.updateProjectionMatrix(); helmet.updateMatrixWorld(true);
    return helmet;
  }
  const aspect = () => renderer.domElement.width / renderer.domElement.height;

  // debugCover：最近一次数遮挡用的两张 id 图（测试和排查用，底下一行是画面最下面一行）。
  return { shoot, judge, debugCover: () => drawn, aimGimbal: (from, box) => aimGimbal(from, box, aspect()), aimHelmet: (eye, look, fov) => aimHelmet(eye, look, fov, aspect()) };
}
