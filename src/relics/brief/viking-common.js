// 海盗 1 号、2 号共用：同一个 v2 零件版模型（viking1-v2-parts），同一个相机视角。
/** 相机视角：眼睛放在相机 2 外侧（避开它自己的外壳），看 3 号腿足垫；足垫周围撒一圈碎石。
 * 返回碎石用的材质（海盗 2 号的结霜要改它的颜色）。 */
export function setupPov(ctx) {
  const { THREE, parts, centerOf, rocks, rnd, grainTex, mergeVertices } = ctx;
  const cam2 = new THREE.Box3().setFromObject(parts.get('Camera 2 / window glass'));
  const pad3 = centerOf('Leg 3 / footpad');
  ctx.VIEWS.pov.eye = [cam2.min.x - 0.04, cam2.max.y + 0.05, cam2.max.z + 0.06];
  ctx.VIEWS.pov.t = pad3.clone().add(new THREE.Vector3(-0.12, 0, 0.3)).toArray();   // 足垫落在画面右半边，和第一张照片一样
  // 足垫周围的碎石（第一张照片里满地石头），避开足垫和采样臂
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a5042, map: grainTex, roughness: 0.95 });
  for (let i = 0, n = 0; i < 400 && n < 90; i++) {
    const a = rnd() * Math.PI * 2, d = 0.22 + Math.pow(rnd(), 0.8) * 1.5;
    const x = pad3.x + Math.cos(a) * d, z = pad3.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > 2.5) continue;
    if (x > -0.8 && x < 0.1 && z > 0.4) continue;                   // 采样臂底下
    const s = 0.015 + Math.pow(rnd(), 3) * 0.11;
    // 顶点按原位置算起伏：同一位置的重复顶点挪得一样，石头不会裂开
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2)), pos = g.attributes.position, ph = rnd() * 50;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const k = 1 + 0.15 * Math.sin(x * 4.1 + y * 3.1 + z * 3.7 + ph) + 0.05 * Math.sin(x * 9.3 - z * 7.1 + ph * 2);
      pos.setXYZ(v, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    m.scale.set(s * (1 + rnd() * 0.6), s * (0.45 + rnd() * 0.35), s * (1 + rnd() * 0.6));
    m.position.set(x, m.scale.y * 0.35, z); m.rotation.y = rnd() * 6.28;
    m.castShadow = m.receiveShadow = true; rocks.add(m); n++;
  }
  return rockMat;
}
