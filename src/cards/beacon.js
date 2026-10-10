// 任务卡的目标光柱（D70）：一根光柱、地上一圈光环、柱子上方挂着卡上那张图。只画，不碰撞、不改地形。
import * as THREE from 'three';

const TAG_HEIGHT = 14;   // 图标挂在离地多高（米）

/** groundAt(x, z)：这个点的地面高度（前哨仓地基上要用地基的高度，不然光环埋在土里）。 */
export function createBeacon({ scene, camera, groundAt }) {
  const group = new THREE.Group(); group.name = 'erin-card-beacon'; group.visible = false;
  const glow = { color: 0x7fe9ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide };
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.45, .9, 70, 20, 1, true), new THREE.MeshBasicMaterial({ ...glow, opacity: .3 }));
  pillar.position.y = 35;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 48), new THREE.MeshBasicMaterial({ ...glow, opacity: .75 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .3;
  group.add(pillar, ring); scene.add(group);
  const tag = document.createElement('div'); tag.className = 'erin-beacon-tag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true');
  document.body.append(tag);
  const top = new THREE.Vector3(), toTop = new THREE.Vector3(), look = new THREE.Vector3();
  let flash = 0, icon = '';

  return {
    group,
    /** target = {x,z} 立在那里；null 收起来。html 是柱子上方那张图（icons.js 的 SVG）。 */
    set(target, html = '', imgURL = '') {
      group.visible = !!target;
      if (!target) { tag.hidden = true; return; }
      group.position.set(target.x, groundAt(target.x, target.z), target.z);
      if (html + imgURL !== icon) {
        icon = html + imgURL;
        if (imgURL) { const image = document.createElement('img'); image.alt = ''; image.src = imgURL; tag.replaceChildren(image); }
        else tag.innerHTML = html;
      }
    },
    /** 提醒一下：亮两秒。 */
    flash() { flash = 2; },
    update(dt, now) {
      if (!group.visible) { tag.hidden = true; return; }
      flash = Math.max(0, flash - dt);
      const pulse = .5 + .5 * Math.sin(now * .004), boost = flash > 0 ? 1.8 : 1;
      pillar.material.opacity = Math.min(1, (.22 + .12 * pulse) * boost);
      ring.material.opacity = Math.min(1, (.55 + .25 * pulse) * boost);
      ring.scale.setScalar(1 + .08 * pulse);
      // 图标是 DOM：把柱子上方那个点投到屏幕上；在镜头背后或出了画面就藏起来。
      top.copy(group.position); top.y += TAG_HEIGHT;
      const front = toTop.copy(top).sub(camera.position).dot(camera.getWorldDirection(look)) > 0;
      top.project(camera);
      const on = front && top.z < 1 && Math.abs(top.x) < .95 && Math.abs(top.y) < .9;
      tag.hidden = !on;
      if (on) tag.style.transform = `translate(-50%,-50%) translate(${(top.x * .5 + .5) * innerWidth}px,${(-top.y * .5 + .5) * innerHeight}px)`;
    },
    dispose() {
      scene.remove(group); tag.remove();
      for (const m of [pillar, ring]) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
