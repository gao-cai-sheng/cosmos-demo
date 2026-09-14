import * as THREE from 'three';

const FOV = 24, PITCH = THREE.MathUtils.degToRad(24), YAW = Math.PI / 4, SETTLE_MS = 2600, SHOTS = 8;
const TITLE_BAND = .28, SWITCH_BAND = .12; // top/bottom shares kept clear for the title and the subject arrows

/** Command-deck portrait: a detached copy of one craft seen from the fixed 45° front quarter.
 * It draws through the game's renderer only on demand (subject or state change, resize),
 * so the large vehicle GLBs are never uploaded to a second WebGL context.
 * Finished frames are remembered per subject state, so flicking between subjects repaints at once. */
export function mountDeckPortrait({renderer, host}) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  canvas.className = 'cd-portrait-canvas'; canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, .05, 4000);
  const key = new THREE.DirectionalLight(0xfff0de, 2.7), rim = new THREE.DirectionalLight(0x8fdcff, 1.5);
  // Lights ride on the camera; their target stays at the subject centre.
  camera.add(key, rim); scene.add(new THREE.HemisphereLight(0xe4ecf2, 0x4b2c1d, 1.2), camera);
  const target = new THREE.WebGLRenderTarget(1, 1, {internalFormat: 'RGBA8', samples: renderer.capabilities.isWebGL2 ? 4 : 0});
  target.texture.colorSpace = THREE.SRGBColorSpace;
  // three r160 applies tone mapping and sRGB encoding only to the screen and XR targets.
  // Flagging this private target that way makes the read-back pixels match on-screen colours.
  target.isXRRenderTarget = true;

  let subject = null, silhouette = [], radius = 1, fit = null, source = null, prepareSource = null, subjectKey = '';
  let pixels = null, image = null, settle = 0, pendingDraw = 0, destroyed = false;
  const shots = new Map(), clear = new THREE.Color(), eye = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();

  function release() {
    if (!subject) return;
    scene.remove(subject);
    // Copies share geometry and materials with the live craft; only per-instance matrices are their own.
    subject.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    subject = null; silhouette = []; fit = null;
  }
  function blank() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    host.classList.remove('cd-has-portrait');
  }
  function frameSize() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    return [Math.round(rect.width * dpr), Math.round(rect.height * dpr)];
  }
  // Silhouette samples from visible vertices: box corners alone leave vehicles lost in empty frame.
  function visiblePoints(root) {
    root.updateMatrixWorld(true);
    const meshes = [], points = [], corner = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh) return;
      for (let p = o; p; p = p.parent) { if (!p.visible) return; if (p === root) break; }
      meshes.push(o);
    });
    // Low-poly parts (panels, boxes) contribute their box corners; dense meshes are stride-sampled.
    const dense = o => !o.isInstancedMesh && (o.geometry.attributes.position?.count || 0) > 200;
    const total = meshes.reduce((n, o) => n + (dense(o) ? o.geometry.attributes.position.count : 0), 0), stride = Math.max(1, Math.ceil(total / 12000));
    for (const o of meshes) {
      if (dense(o)) {
        const position = o.geometry.attributes.position;
        for (let i = 0; i < position.count; i += stride) points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
        continue;
      }
      if (o.isInstancedMesh) { o.computeBoundingBox(); corner.copy(o.boundingBox); }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); corner.copy(o.geometry.boundingBox); }
      if (corner.isEmpty()) continue;
      corner.applyMatrix4(o.matrixWorld);
      for (let i = 0; i < 8; i++) points.push(new THREE.Vector3(i & 1 ? corner.max.x : corner.min.x, i & 2 ? corner.max.y : corner.min.y, i & 4 ? corner.max.z : corner.min.z));
    }
    return points;
  }
  function capture(object, prepare) {
    release();
    if (!object) return false;
    let copy;
    try { copy = object.clone(true); } catch (error) { console.warn('Deck portrait could not copy subject', error); return false; }
    copy.position.set(0, 0, 0); copy.quaternion.identity(); copy.visible = true;
    prepare?.(copy);
    const samples = visiblePoints(copy);
    if (!samples.length) return false;
    const centre = new THREE.Box3().setFromPoints(samples).getCenter(new THREE.Vector3());
    copy.position.sub(centre); for (const p of samples) p.sub(centre);
    silhouette = samples; radius = samples.reduce((r, p) => Math.max(r, p.length()), .1); fit = null;
    subject = copy; scene.add(subject);
    // Compile this light rig's shader variants off the main thread where supported, then draw.
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let compiling = null;
    try { compiling = renderer.compileAsync?.(scene, camera); } catch { compiling = null; }
    finally { renderer.setRenderTarget(previous); }
    if (compiling) compiling.then(() => { if (subject === copy) requestDraw(); }, () => { if (subject === copy) requestDraw(); });
    else requestDraw();
    return true;
  }
  // Distance at which every silhouette sample fits the frame between the title and arrow bands.
  function fitDistance(aspect) {
    eye.set(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
    right.set(Math.cos(YAW), 0, -Math.sin(YAW)); up.crossVectors(eye, right);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * .9, tanV = tan * (1 - TITLE_BAND - SWITCH_BAND), tanH = tan * aspect;
    let distance = .5;
    for (const c of silhouette) {
      const depth = c.dot(eye);
      distance = Math.max(distance, depth + Math.abs(c.dot(right)) / tanH, depth + Math.abs(c.dot(up)) / tanV);
    }
    return distance;
  }
  function remember(width, height) {
    let shot = shots.get(subjectKey);
    if (shot) shots.delete(subjectKey); else shot = document.createElement('canvas');
    shot.width = width; shot.height = height; shot.getContext('2d').drawImage(canvas, 0, 0);
    shots.set(subjectKey, shot);
    if (shots.size > SHOTS) shots.delete(shots.keys().next().value);
  }
  function paintShot(signature) {
    const shot = shots.get(signature), [width, height] = frameSize();
    if (!shot || shot.width !== width || shot.height !== height) return false;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.clearRect(0, 0, width, height); context.drawImage(shot, 0, 0);
    host.classList.add('cd-has-portrait');
    return true;
  }
  function draw() {
    if (destroyed || !subject) return false;
    const [width, height] = frameSize();
    if (width < 8 || height < 8) return false;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    if (!image || image.width !== width || image.height !== height) { image = context.createImageData(width, height); pixels = new Uint8Array(width * height * 4); }
    const aspect = width / height;
    if (fit?.aspect !== aspect) fit = {aspect, distance: fitDistance(aspect)};
    const {distance} = fit;
    camera.aspect = aspect; camera.near = Math.max(.05, distance - radius * 1.5); camera.far = distance + radius * 1.5;
    camera.setViewOffset(width, height, 0, -height * (TITLE_BAND - SWITCH_BAND) / 2, width, height); camera.updateProjectionMatrix();
    camera.position.copy(eye.set(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH))).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    key.position.set(distance * .85, distance * .75, 0); rim.position.set(-distance * .8, distance * .25, -distance * 1.7);
    camera.updateMatrixWorld(true);

    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.enabled, autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
    renderer.getClearColor(clear);
    try {
      // No shadow casters here; disabling also keeps a pending cached-shadow refresh for the main scene.
      renderer.shadowMap.enabled = false; renderer.autoClear = true;
      renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha);
      renderer.shadowMap.enabled = shadows; renderer.autoClear = autoClear;
    }
    const row = width * 4;
    for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    context.putImageData(image, 0, 0);
    host.classList.add('cd-has-portrait');
    remember(width, height);
    return true;
  }
  function requestDraw() {
    if (pendingDraw) return;
    pendingDraw = requestAnimationFrame(() => {
      pendingDraw = 0;
      // A remembered frame was shown without a copy; a resize needs the real subject again.
      if (!subject) { if (source) capture(source, prepareSource); return; }
      draw();
    });
  }
  const observer = new ResizeObserver(() => { if (source && !paintShot(subjectKey)) requestDraw(); }); observer.observe(canvas);

  /** subject: which craft (walk/remote/carrier/flight); object: live Object3D to portray;
   * key: state signature that warrants a fresh copy; prepare(copy): pose fix-ups. */
  function update({subject: id = 'walk', object = null, key = '', prepare} = {}) {
    if (destroyed) return;
    const signature = `${id}|${object?.userData?.assetState || ''}|${key}`;
    if (object === source && signature === subjectKey) return;
    const refresh = !!object && object === source;
    source = object; prepareSource = prepare; subjectKey = signature;
    clearTimeout(settle);
    if (!refresh) {
      release();
      if (object && paintShot(signature)) return;
      // A new subject never shows the previous craft while its copy compiles.
      blank();
    }
    if (!capture(object, prepare)) { blank(); return; }
    // Doors, gear and arms animate after their state flips; copy the settled pose again.
    if (refresh) settle = setTimeout(() => { if (source === object && subjectKey === signature) capture(object, prepare); }, SETTLE_MS);
  }
  return {
    update,
    destroy() { destroyed = true; clearTimeout(settle); cancelAnimationFrame(pendingDraw); observer.disconnect(); release(); shots.clear(); target.dispose(); }
  };
}
