/* ============================================================
   相机机架 —— 四个机位：跟车 / 环绕 / 桅杆 / 自由
   ------------------------------------------------------------
   移植自月面版 src/game/camera.js。上一版只搬了「跟车」一个机位，
   而且写死了距离和视场角，于是驾驶时既不能转头也不能变焦 ——
   这正是要修的那个问题。

   四个机位各自解决一件事：

     跟车（CHASE）  开车时看路。相机吊在车后，但**操作者拥有视角** ——
                    鼠标一动就归你，停手几秒才慢慢回中。上一版没有这一层，
                    所以视角永远被钉在车尾。
     环绕（ORBIT）  绕着车转，看车本身。检查悬挂、太阳翼、轮陷用它。
     桅杆（MAST）   相机就是桅杆上那颗头。这是唯一的第一人称视角，
                    也是唯一能对准远处崖面拍照的机位。
     自由（PHOTO）  脱离车体飞，WASD 相对视线方向。出图用。

   三条从原版继承下来的、不显然但重要的规矩：

     ① 自动回中要等一个「真的停手了」的延时，不是鼠标停一帧就回。
        判据用输入层给的 looking 标志，不是位移大小 —— 位移大小
        对手柄和鼠标不是同一个量纲，摇杆推到三分之一永远够不着阈值。
     ② 回中速率按最高速的比例算，不是绝对 m/s。
     ③ 桅杆机位的相机要推出头壳前方，否则镜筒糊住半个画面。
   ============================================================ */
import * as THREE from 'three';
import { clamp, sstep } from './数学.js';
import { DRIVE } from './载具.js';

export const CAM_MODE = { CHASE: 0, ORBIT: 1, MAST: 2, PHOTO: 3 };
const 名称 = ['跟车', '环绕', '桅杆', '自由'];

const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export class 相机机架 {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {{heightAt:(x:number,z:number)=>number}} terrain 用来防止相机埋进地里
   */
  constructor(camera, terrain, opts = {}) {
    this.cam = camera;
    this.terrain = terrain;
    this.mode = CAM_MODE.CHASE;

    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = opts.dist ?? 8.6;         // 跟车/环绕的距离，滚轮改这个
    this.distMin = opts.distMin ?? 2.6;
    this.distMax = opts.distMax ?? 42;    // 火星地形铺到 200 km，比月面版放宽

    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.first = true;

    this.fov = opts.fov ?? 55;
    this.fovTarget = this.fov;
    this.fovBase = opts.fov ?? 55;        // 跟车机位的基准焦段
    this.fovGain = opts.fovGain ?? 11;    // 到最高速时额外张开多少度

    this.sens = opts.sens ?? 1.0;         // 视角灵敏度
    this.invertY = false;
    this.autoCentre = opts.autoCentre ?? 1;   // 0 关 / 1 慢 / 2 快
    this.lookIdle = 99;                   // 距离上一次动视角过了多少秒

    this.shake = 0;
    this.photoPos = new THREE.Vector3();
  }

  get modeName() { return 名称[this.mode]; }

  /** 切到下一个机位 */
  cycle(rover) { return this.setMode((this.mode + 1) % 4, rover); }

  setMode(m, rover) {
    // 跟车机位把 yaw 停在车**后方**，直接带进桅杆机位的话，
    // 桅杆头一进来就是朝后看的。所以进桅杆时要重新对基准。
    if (m === CAM_MODE.MAST && rover) {
      this.yaw = Math.atan2(rover.forward.x, rover.forward.z);
      this.pitch = 0;
    }
    if (m === CAM_MODE.PHOTO) this.photoPos.copy(this.cam.position);
    this.mode = m;
    this.first = true;
    return this.modeName;
  }

  /** 悬挂受冲击时抖一下镜头。幅度是二次的，小颠簸几乎看不出来 */
  addShake(v) { this.shake = Math.min(1.6, this.shake + v); }

  /**
   * @param {number} dt
   * @param {object} rover
   * @param {object} input 至少要有 lookX / lookY / zoom / looking，
   *        自由机位还要 throttle / steer / up / down / boost
   */
  update(dt, rover, input = {}) {
    const inv = this.invertY ? -1 : 1;
    const s = 0.0022 * this.sens;
    this.yaw -= (input.lookX || 0) * s;
    this.pitch = clamp(this.pitch + (input.lookY || 0) * s * inv, -1.15, 1.25);

    // 滚轮变焦：跟车/环绕改距离，桅杆/自由改焦段（那两个机位没有「距离」可言）
    if (input.zoom) {
      if (this.mode === CAM_MODE.MAST || this.mode === CAM_MODE.PHOTO) {
        this.fovBase = clamp(this.fovBase * Math.exp(input.zoom * 0.12), 12, 78);
      } else {
        this.dist = clamp(this.dist * Math.exp(input.zoom * 0.11), this.distMin, this.distMax);
      }
    }

    this.lookIdle = input.looking ? 0 : this.lookIdle + dt;

    const rp = rover.pos;
    const speed = rover.vel.length();
    const vmax = DRIVE.maxSpeed;

    if (this.mode === CAM_MODE.CHASE) {
      /* 机架跟着车头方向走，但操作者随时能抢走视角。
         回中只在真的停手若干秒之后才开始 —— 原版早期是鼠标一停就回，
         结果每次想看旁边，画面都在你看清之前被拽回车尾。 */
      const heading = Math.atan2(rover.forward.x, rover.forward.z);
      const target = heading + Math.PI;
      const d = ((target - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (this.autoCentre > 0) {
        const delay = this.autoCentre === 1 ? 3.2 : 1.1;
        const ramp = clamp((this.lookIdle - delay) / 1.6, 0, 1);
        // 速率按最高速的比例给。写死 3.5 m/s 的话，这台车 8.4 m/s 顶速下
        // 要跑到 42% 才开始回中，慢速挪车时永远不回。
        const rate = (this.autoCentre === 1 ? 0.6 : 1.7) * ramp *
          sstep(vmax * 0.06, vmax * 0.42, speed);
        if (rate > 0) {
          this.yaw += d * Math.min(1, dt * rate);
          this.pitch += (0.24 - this.pitch) * Math.min(1, dt * rate * 0.7);
        }
      }

      // 速度越高吊得越远，配合视场角张开，速度感来自这两条
      const dist = this.dist * (1 + sstep(vmax * 0.24, vmax, speed) * 0.18);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(dist);
      this.pos.copy(rp).add(_o); this.pos.y += 1.5;
      this.look.copy(rp).addScaledVector(rover.forward, 2.6 + speed * 0.30);
      this.look.y += 1.0;
      this.fovTarget = this.fovBase + sstep(vmax * 0.36, vmax, speed) * this.fovGain;
    }
    else if (this.mode === CAM_MODE.ORBIT) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
      this.pos.copy(rp).add(_o); this.pos.y += 1.0;
      this.look.copy(rp); this.look.y += 0.9;
      this.fovTarget = this.fovBase * 0.92;
    }
    else if (this.mode === CAM_MODE.MAST) {
      /* 相机就是桅杆头本身，所以头壳自己的镜筒正好压在近裁剪面上，
         要把眼点推到壳体前面去。两个角都不取负号：yawRel 本来就
         随鼠标右移而减小，而 rotation.x 是正向下的。 */
      rover.mastYaw = clamp(this.yawRel(rover), -2.3, 2.3);
      rover.mastPitch = clamp(this.pitch * 0.85, -0.55, 0.75);
      rover.head.updateWorldMatrix(true, false);
      rover.head.getWorldPosition(this.pos);
      const hq = rover.head.getWorldQuaternion(_q);
      const fw = _f.set(0, 0, 1).applyQuaternion(hq);
      this.pos.addScaledVector(fw, 0.30).addScaledVector(rover.up, 0.05);
      this.look.copy(this.pos).addScaledVector(fw, 30);
      this.fovTarget = this.fovBase * 0.92;
    }
    else {
      // 自由机位：脱离车体飞，WASD 相对视线方向，空格/Ctrl 升降
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      _f.set(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp).normalize();
      _r.crossVectors(_f, _up).normalize();
      const sp2 = (input.boost ? 60 : 16) * dt;
      this.photoPos.addScaledVector(_f, (input.throttle || 0) * sp2);
      this.photoPos.addScaledVector(_r, (input.steer || 0) * sp2);
      if (input.up) this.photoPos.y += sp2;
      if (input.down) this.photoPos.y -= sp2;
      this.pos.copy(this.photoPos);
      this.look.copy(this.pos).add(_f);
      this.fovTarget = this.fovBase * 0.78;
    }

    /* ---- 别让机架沉进风化层 ---- */
    if (this.mode !== CAM_MODE.MAST && this.terrain) {
      const gh = this.terrain.heightAt(this.pos.x, this.pos.z);
      if (this.pos.y < gh + 0.7) this.pos.y = gh + 0.7;
    }

    /* ---- 临界阻尼跟随。刚性绑定的画面里车永远不动，速度感会全部消失 ---- */
    if (this.first) { this.smoothPos.copy(this.pos); this.smoothLook.copy(this.look); this.first = false; }
    const kp = this.mode === CAM_MODE.MAST ? 1 : 1 - Math.exp(-dt * (this.mode === CAM_MODE.PHOTO ? 22 : 9.5));
    const kl = this.mode === CAM_MODE.MAST ? 1 : 1 - Math.exp(-dt * 12);
    this.smoothPos.lerp(this.pos, kp);
    this.smoothLook.lerp(this.look, kl);

    /* ---- 抖动：悬挂冲击经桅杆传上来，不是电影地震 ---- */
    this.shake = Math.max(0, this.shake - dt * 2.6);
    let sx = 0, sy = 0;
    if (this.shake > 0.001) {
      const t = performance.now() * 0.001;
      const a = this.shake * this.shake * 0.10;
      sx = Math.sin(t * 47.3) * a; sy = Math.cos(t * 39.1) * a;
    }

    this.cam.position.copy(this.smoothPos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.smoothLook);
    if (sx || sy) { this.cam.rotateX(sy); this.cam.rotateY(sx); }

    this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  /** 视角相对车头的偏角。桅杆机位靠它把头转到正确方向 */
  yawRel(rover) {
    const heading = Math.atan2(rover.forward.x, rover.forward.z);
    return ((this.yaw - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  }
}

/** 工厂函数，和 makeChaseCamera 一样是「造一个」而不是 new 一个 */
export function makeCameraRig(camera, terrain, opts = {}) {
  return new 相机机架(camera, terrain, opts);
}
