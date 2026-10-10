// 简报里的「档案台」：三维复原模型、机位、零件高亮、标注。从 cosmos-report-demo/relic-viking.html 拆出来，
// 每处遗迹的差别都在 data（src/relics/brief/<id>.js）里：机位、零件组、标注，和可选的特效钩子。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const D2R = Math.PI / 180;
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }

/* data 需要的字段：
   model：assets/models/relics/<model>.glb（简报用零件版）
   views：{名字: {t:[x,y,z]|null, part?, az, el, fit|null, fitScale?, spin?, fov?, still?}}；t / fit 为 null 时按模型包围球自动取，
          写了 part（零件名正则）就看向那组零件
   groups：{键: 零件名正则}；callouts：{id: {part|point, b, s, dx, dy, warn?, s2?}}
   可选：extras [{model, position, yaw}] 同台的附属件；钩子 setup(ctx)、onBeat(ctx, beat)、update(ctx, now, dt)、hlColor(ctx)、onReplay(ctx) */
export function createStage3D({ view, canvas, calloutLayer, calloutSvg, data, onProgress = () => {}, onReady = () => {}, onError = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 200);

  // 反射用的简单展厅环境（和 blender/viking1-v2/viewer.html 同一套）
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x22262a, side: THREE.BackSide })));
    for (const [x, y, z, w, h, c] of [[0, 4.9, 0, 8, 8, 6], [-9.9, 2, 0, 0.1, 4, 2.5], [9.9, 2, 3, 0.1, 3, 1.5]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.1), 0.1, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c, c, c) }));
      m.position.set(x, y, z); if (w < 1) m.rotation.z = Math.PI / 2; env.add(m);
    }
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.8;
  }
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.9);
  scene.add(sun, sun.target, rim, new THREE.HemisphereLight(0xe6eeff, 0x3a2a22, 0.45));

  // 地面：一圈火星土（带颗粒），边缘淡出；外面两道投影台的光环。整组按模型大小缩放。
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fadeTex = canvasTex(256, 256, g => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.72, '#fff'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  const grainTex = canvasTex(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = 150 + rnd() * 105; img.data.set([v, v * 0.93, v * 0.86, 255], i * 4); }
    g.putImageData(img, 0, 0);
  });
  grainTex.colorSpace = THREE.SRGBColorSpace; grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping; grainTex.repeat.set(5, 5);
  const floorGroup = new THREE.Group(); scene.add(floorGroup);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3.0, 96),
    new THREE.MeshStandardMaterial({ color: 0x5e3d2b, map: grainTex, roughness: 1, transparent: true, alphaMap: fadeTex, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; floorGroup.add(ground);
  const table = new THREE.Group(); floorGroup.add(table);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6fe3f5, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const r of [1.75, 2.55]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 160), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; table.add(ring);
  }
  {
    const pts = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2, r0 = i % 6 ? 2.55 : 2.45;
      pts.push(Math.cos(a) * r0, 0.003, Math.sin(a) * r0, Math.cos(a) * 2.62, 0.003, Math.sin(a) * 2.62);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    table.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x6fe3f5, transparent: true, opacity: 0.4 })));
  }
  const rocks = new THREE.Group(); rocks.visible = false; scene.add(rocks);   // 只在相机视角里出现

  // ---------- 机位 ----------
  const VIEWS = structuredClone(data.views);
  const rig = { t: new THREE.Vector3(0, 0.8, 0.45), theta: -38 * D2R, phi: 74 * D2R, r: 6 };
  let viewName = Object.keys(VIEWS)[0], tween = null, userAt = -1e9, userZoom = 1, W = 1, H = 1;
  let bounds = { center: [0, 0.8, 0], radius: 1.8 };
  function syncSize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h || (w === W && h === H)) return;
    W = w; H = h;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  function fitDistance(fit) {
    const v = camera.fov * D2R, h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    return fit / Math.sin(Math.min(v, h) / 2);
  }
  function viewPose(name) {
    const v = VIEWS[name];
    if (v.eye) {
      const t = new THREE.Vector3(...v.t), s = new THREE.Spherical().setFromVector3(new THREE.Vector3(...v.eye).sub(t));
      return { t, theta: s.theta, phi: s.phi, r: s.radius };
    }
    return { t: new THREE.Vector3(...(v.t || bounds.center)), theta: v.az * D2R, phi: (90 - v.el) * D2R, r: fitDistance(v.fit || bounds.radius * (v.fitScale || 1)) };
  }
  function goView(name, instant) {
    if (!VIEWS[name]) name = Object.keys(VIEWS)[0];
    viewName = name; userZoom = 1;
    const fov = VIEWS[name].fov || 36;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    syncSize();
    table.visible = !VIEWS[name].pov; rocks.visible = !!VIEWS[name].pov;
    const to = viewPose(name);
    if (instant) { Object.assign(rig, { t: to.t, theta: to.theta, phi: to.phi, r: to.r }); tween = null; return; }
    let dTheta = to.theta - rig.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));        // 走近的那一边
    tween = { from: { t: rig.t.clone(), theta: rig.theta, phi: rig.phi, r: rig.r }, to: { ...to, theta: rig.theta + dTheta }, t0: performance.now(), dur: 1300 };
  }
  function updateRig(now, dt) {
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k), f = tween.from, to = tween.to;
      rig.t.lerpVectors(f.t, to.t, e);
      rig.theta = f.theta + (to.theta - f.theta) * e;
      rig.phi = f.phi + (to.phi - f.phi) * e;
      rig.r = f.r + (to.r - f.r) * e;
      if (k >= 1) tween = null;
    } else if (VIEWS[viewName].spin && now - userAt > 2500) {
      rig.theta += dt * 0.12;
    }
    camera.position.setFromSpherical(new THREE.Spherical(rig.r * userZoom, rig.phi, rig.theta)).add(rig.t);
    camera.lookAt(rig.t);
  }
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (VIEWS[viewName].still) return;
    drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); tween = null; userAt = performance.now();
  });
  canvas.addEventListener('pointerup', () => drag = null);
  canvas.addEventListener('pointercancel', () => drag = null);
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    rig.theta -= (e.clientX - drag[0]) * 0.008;
    rig.phi = Math.min(1.5, Math.max(0.2, rig.phi - (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY]; userAt = performance.now();
  });
  canvas.addEventListener('wheel', e => {
    if (VIEWS[viewName].still) return;
    userZoom = Math.min(2.2, Math.max(0.45, userZoom * (1 + e.deltaY * 0.001)));
    userAt = performance.now(); e.preventDefault();
  }, { passive: false });
  new ResizeObserver(() => {
    const before = [W, H]; syncSize();
    if (before[0] === W && before[1] === H) return;
    const to = viewPose(viewName);                                    // 画框变了，重新装进画面
    if (tween) tween.to.r = to.r; else rig.r = to.r;
  }).observe(view);

  // ---------- 零件高亮 ----------
  const parts = new Map(), groupMeshes = {}, hlCache = new Map();
  let hlOn = [];
  function setHighlight(keys) {
    const want = new Set((keys || []).flatMap(k => groupMeshes[k] || []));
    for (const [m, rec] of hlCache) if (!want.has(m)) m.material = rec.orig;
    for (const m of want) {
      let rec = hlCache.get(m);
      if (!rec) { const hl = m.material.clone(); hl.emissive = new THREE.Color(0x6fe3f5); rec = { orig: m.material, hl }; hlCache.set(m, rec); }
      m.material = rec.hl;
    }
    hlOn = [...want].map(m => hlCache.get(m).hl);
  }

  // ---------- 标注 ----------
  const box = new THREE.Box3(), tmp = new THREE.Vector3();
  let coOn = [];
  function setCallouts(ids) {
    calloutLayer.querySelectorAll('.co').forEach(n => n.remove());
    calloutSvg.innerHTML = '';
    coOn = (ids || []).filter(id => data.callouts?.[id]).map(id => {
      const c = data.callouts[id];
      const el = document.createElement('div'); el.className = 'co';
      el.innerHTML = `<b>${c.b}</b>${c.s ? `<small>${c.s}</small>` : ''}`;
      calloutLayer.appendChild(el);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<line/><circle r="3.5"/>'; calloutSvg.appendChild(g);
      return { c, el, g, small: el.querySelector('small'), warned: false };
    });
  }
  function anchorOf(c) {
    if (c.point) return c.point(ctx);
    const o = parts.get(c.part); if (!o) return null;
    return box.setFromObject(o).getCenter(tmp);
  }
  function placeCallouts() {
    for (const k of coOn) {
      const p = anchorOf(k.c);
      const vis = p && p.project(camera).z < 1;
      k.el.style.display = k.g.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      const ew = k.el.offsetWidth, eh = k.el.offsetHeight;
      let lx = x + k.c.dx, ly = y + k.c.dy;
      lx = Math.min(W - 10 - (k.c.dx > 0 ? ew : 0), Math.max(10 + (k.c.dx < 0 ? ew : 0), lx));   // 标签别出框
      ly = Math.min(H - 30 - eh / 2, Math.max(64 + eh / 2, ly));
      k.el.style.transform = `translate(${k.c.dx < 0 ? lx - ew : lx}px, ${ly - eh / 2}px)`;
      const [ln, dot] = k.g.children;
      ln.setAttribute('x1', x); ln.setAttribute('y1', y); ln.setAttribute('x2', lx); ln.setAttribute('y2', ly);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      const warn = !!(k.c.warn && k.c.warn(ctx));
      if (warn !== k.warned) {
        k.warned = warn; k.el.classList.toggle('warn', warn); k.g.classList.toggle('warn', warn);
        if (k.small) k.small.textContent = warn ? k.c.s2 : k.c.s;
      }
    }
  }

  // 给特效钩子用的上下文
  const ctx = { THREE, scene, camera, view, parts, rocks, rnd, grainTex, VIEWS, mergeVertices, model: null, current: null,
    centerOf: name => box.setFromObject(parts.get(name)).getCenter(new THREE.Vector3()),
    canvasTex };

  // ---------- 每一句台词对应的画面 ----------
  let ready = false, pending = null;
  function apply(b) {
    if (!b) return;
    if (!ready) { pending = b; return; }
    const prev = ctx.current; ctx.current = b;
    if (!prev || b.cut || prev.view !== b.view) goView(b.view, !prev || b.cut);
    setHighlight(b.hl);
    setCallouts(b.callouts);
    data.onBeat?.(ctx, b);
  }

  // ---------- 载入 ----------
  const glb = name => new URL(`../../../assets/models/relics/${name}.glb`, import.meta.url).href;
  const loader = new GLTFLoader();
  (async () => {
    const gltf = await loader.loadAsync(glb(data.model), e => { if (e.total) onProgress(e.loaded / e.total, e.total); });
    const model = gltf.scene; ctx.model = model;
    // 附属件（探路者带着旅居者）：同一个档案台上，位置和朝向在 data.extras 里
    for (const x of data.extras || []) {
      const extra = (await loader.loadAsync(glb(x.model))).scene;
      extra.name = x.model; extra.position.set(...x.position); extra.rotation.y = x.yaw || 0;
      model.add(extra);
    }
    model.traverse(o => {
      const n = o.userData.name || o.name;
      if (n && !parts.has(n)) parts.set(n, o);
      if (o.isMesh) { o.castShadow = o.receiveShadow = true; }
    });
    for (const [k, re] of Object.entries(data.groups || {})) {
      groupMeshes[k] = [];
      for (const [n, o] of parts) if (re.test(n)) o.traverse(m => m.isMesh && groupMeshes[k].push(m));
    }
    scene.add(model);
    model.updateMatrixWorld(true);
    // 地面、投影台、影子范围按模型大小缩放（demo 是按海盗号 2.5 m 的尺寸定的）
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    bounds = { center: sphere.center.toArray(), radius: sphere.radius };
    const k = THREE.MathUtils.clamp(sphere.radius / 2.2, 0.35, 3);
    floorGroup.scale.setScalar(k);
    sun.position.set(-2.4 * k, 4.2 * k, 3.2 * k); rim.position.set(2.6 * k, 2.2 * k, -3.2 * k);
    Object.assign(sun.shadow.camera, { left: -3 * k, right: 3 * k, top: 3 * k, bottom: -3 * k, near: 0.5 * k, far: 15 * k });
    sun.shadow.camera.updateProjectionMatrix();
    camera.near = 0.03 * k; camera.far = 200 * k; camera.updateProjectionMatrix();
    ctx.scale = k; ctx.ground = ground;
    // 机位可以写 part：看向这个零件（组）的中心，fit 不写就按零件大小取
    for (const v of Object.values(VIEWS)) if (v.part) {
      const re = new RegExp(v.part), b3 = new THREE.Box3();
      for (const [n, o] of parts) if (re.test(n)) b3.expandByObject(o);
      if (!b3.isEmpty()) { const sp = b3.getBoundingSphere(new THREE.Sphere()); v.t = sp.center.toArray(); v.fit ??= sp.radius * (v.fitScale || 1.6); }
    }
    data.setup?.(ctx);
    ready = true;
    onReady();
    if (pending) { const b = pending; pending = null; apply({ ...b, cut: true }); }
    renderer.setAnimationLoop(frame);
  })().catch(err => onError(String(err.message || err)));

  const cCyan = new THREE.Color(0x6fe3f5);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    data.update?.(ctx, now, dt);
    if (!view.offsetWidth) return;                                     // 近景镜头里档案台藏起来了，不用画
    syncSize();
    updateRig(now, dt);
    const pulse = 0.16 + 0.2 * (0.5 + 0.5 * Math.sin(now / 320));    // 高亮呼吸
    const color = data.hlColor?.(ctx) || cCyan;
    for (const m of hlOn) { m.emissiveIntensity = pulse; m.emissive.copy(color); }
    renderer.render(scene, camera);
    placeCallouts();
  }

  return { apply, replay: () => data.onReplay?.(ctx), get ready() { return ready; }, ctx };
}
