/* ============================================================
   跟随相机
   ------------------------------------------------------------
   三件事，缺一件就不像在开车：
     1. 位置滞后。相机用弹簧追车，不是刚性绑定 —— 刚性绑定的画面里
        车永远不动，动的是世界，速度感会全部消失。
     2. 朝向跟的是速度方向而不是车头方向。侧滑的时候这两者会分开，
        跟车头就看不出在打滑。
     3. 视场角随速度张开。这是廉价但极其有效的速度感来源。
   ============================================================ */
import * as THREE from 'three';

export function makeChaseCamera(camera, opts = {}) {
  const back = opts.back ?? 7.2;        // 车后多远
  const high = opts.high ?? 3.0;        // 车上方多高
  const fov0 = opts.fov ?? 55;
  const fovGain = opts.fovGain ?? 12;   // 到最高速时额外张开多少度

  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const want = new THREE.Vector3();
  const wantAim = new THREE.Vector3();
  const flat = new THREE.Vector3();
  let started = false;

  return function update(rover, dt, maxSpeed) {
    const fwd = rover.forward.clone();
    const speed = rover.vel.length();

    // 水平化的车头方向：相机不该跟着车身俯仰一起翻，那会晕
    flat.set(fwd.x, 0, fwd.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
    flat.normalize();

    // 速度够快时看速度方向，慢下来退回车头方向（原地打转时速度方向没意义）
    if (speed > 0.6) {
      const v = rover.vel.clone().setY(0).normalize();
      flat.lerp(v, Math.min(0.65, speed / maxSpeed)).normalize();
    }

    want.copy(rover.pos).addScaledVector(flat, -back).setY(rover.pos.y + high);
    wantAim.copy(rover.pos).addScaledVector(flat, 3.0).setY(rover.pos.y + 1.0);

    if (!started) { pos.copy(want); aim.copy(wantAim); started = true; }

    // 位置追得比朝向慢：朝向再滞后就会看不清要撞上什么了
    const kp = 1 - Math.exp(-dt * 4.2);
    const ka = 1 - Math.exp(-dt * 7.0);
    pos.lerp(want, kp);
    aim.lerp(wantAim, ka);

    camera.position.copy(pos);
    camera.lookAt(aim);

    const f = fov0 + fovGain * Math.min(1, speed / maxSpeed);
    if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
  };
}
