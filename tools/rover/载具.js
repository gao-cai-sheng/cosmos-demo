/* ============================================================
   MU-7「仙后座」无人遥控勘测车 · 火星型
   ------------------------------------------------------------
   900 kg，六轮驱动，摇臂转向架悬挂，火星重力 3.72 m/s²。

   物理是一个真正的刚体：四元数姿态加惯量张量，每个轮位一条射线
   探地，轮胎力按滑移率算并约束在摩擦圆内，滚阻随下陷深度变化 ——
   风化层不是柏油，它有四成是空隙，会一路吃掉你的动量。

   这是从月面版（src/game/rover.js）移植过来的。改的地方只有三处：
   重力、悬挂刚度、活动边界；其余物理原样保留，见下面各处标注。
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, sstep, lerp, makeRNG } from './数学.js';

/* 火星表面重力。月面版是 1.62 —— 换成 3.72 之后整车重了一倍多，
   下面的悬挂参数必须跟着重标定，否则一落地就压到限位块上。 */
const MARS_G = 3.72;

/* ---------------- 底盘常数 ---------------- */
const MASS = 900;
const WHEEL_R = 0.335, WHEEL_W = 0.30;
const HALF_TRACK = 0.80;                    // 轮距的一半
const AXLE_Z = [1.24, 0.0, -1.20];          // 前 / 中 / 后
const SUSP_REST = 0.46, SUSP_TRAVEL = 0.36;
/* 按火星整车重量标定：900 × 3.72 = 3348 N，单角 558 N，静态下沉约 0.09 m。
   月面版这两个数是 2700 / 1250（对应 1458 N 整车重）。直接照搬到火星，
   静态就要压掉 0.21 m —— 悬挂行程总共才 0.36 m，等于全程贴着限位块跑。
   阻尼按同样比例走：临界阻尼 2√(k·m角)，保持在 0.98 倍临界附近。
   顺带一提，直接套地球家用车的弹簧刚度，这套悬挂会硬得像根钢筋。 */
const SUSP_K = 6200, SUSP_C = 1890;
const MOTOR_TORQUE = 118;                   // 轮毂输出 N·m —— 刚好越过附着极限
/* 轮毂可用扭矩随电量变化：25% 以上给满，往下线性衰减到 0.18。

   这个拐点必须设得比「你以为该设的地方」高得多。MOTOR_TORQUE 是刻意
   卡在附着极限外侧的 —— 6 × 118 / 0.335 = 2113 N 的轮毂推力，对着
   一道两千牛量级的摩擦上限 —— 所以在平地上，扭矩打折要一直打到 0.59
   以下才看得出区别。拐点再往下设，电量见底在平地上就毫无表现，
   得等上坡才暴露出来；先在坡上出问题，才是对的顺序。

   下限 0.18 的意义是：电池耗尽也绝不把人困死。0.18 还能爬，
   爬到有太阳的地方，太阳翼就能把电充回来。 */
export const POWER_FLOOR = 0.18, POWER_KNEE = 25;
const BRAKE_TORQUE = 300;
/* 行驶包线。可变，因为「真实模式」会把最高速换成真实巡视器的数值 ——
   也因为下面每一处速度阈值都写成它的「比例」，而不是绝对的 m/s。

   这一点很要紧：这些阈值原本是照着 8.4 调出来的字面量，于是一旦把
   最高速砍半，转向不再随速收紧、镜头不再拉伸、电机永远听不出吃力。
   没有任何报错，车就是变得没手感了。 */
export const DRIVE = {
  maxSpeed: 8.4,      // m/s ≈ 30 km/h —— 对一台巡视器来说快得离谱
  commsDelay: 0,      // 秒，往返。0 = 就地操控，1250 = 从地球开
  fence: 0,           // 活动半径（米）。0 = 不设边界
};

/* 地球—火星单程光行时在 3 到 22 分钟之间摆，往返就是 6 到 44 分钟。
   月面版那个 2.564 秒（地月往返）在这里完全不成立：延迟到了分钟量级，
   实时遥控这件事本身就不存在了，只能预编指令序列。
   这里保留常数是为了让界面能把这句话说清楚，默认不启用。 */
export const MARS_RTT_MIN = 366;            // 秒，最近时（0.52 AU）
export const MARS_RTT_MAX = 2660;           // 秒，最远时（2.52 AU）
const WHEEL_I = 1.2;                        // 每个车轮 kg·m²
const MU_BASE = 0.88;                       // 抓地齿咬得住；仍远低于柏油
const K_SLIP = 5200, K_LAT = 6400;          // 轮胎刚度，每 m/s 滑移多少牛
const YAW_ASSIST = 2600;                    // 控制力矩陀螺提供的转向权限，N·m
/* 机械臂：肩到肘、肘到钻头尖，以及它能覆盖的作业半径 */
const ARM_L1 = 0.72, ARM_L2 = 1.115;
const ARM_REACH_MIN = 0.55, ARM_REACH_MAX = 1.62;
const ARM_YAW_MAX = 0.95;                   // 绕肩关节 ±54° 的摆动
const ARM_BASE = { x: 0, y: 0.36, z: 1.02 };

/* ============================================================
   程序化材质
   ============================================================ */
function crinkleNormal(size = 256, scale = 9, strength = 1.0) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const h = new Float32Array(size * size);
  const rng = makeRNG(7717);
  const grid = [];
  for (let i = 0; i < (scale + 1) * (scale + 1); i++) grid.push(rng());
  const at = (x, y) => grid[(((y % scale) + scale) % scale) * (scale + 1) + (((x % scale) + scale) % scale)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * scale, v = y / size * scale;
    const ix = Math.floor(u), iy = Math.floor(v);
    let fx = u - ix, fy = v - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy), b = at(ix + 1, iy), cc = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    let n = a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy;
    // 折出锐利的皱痕：把噪声场对折，隔热膜才是「揉皱的」而不是「起包的」
    n = Math.abs(n * 2 - 1);
    n += 0.35 * Math.abs(Math.sin(x * 0.42 + n * 6.0) * Math.sin(y * 0.31 + n * 5.0));
    h[y * size + x] = n;
  }
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const hl = h[y * size + ((x - 1 + size) % size)], hr = h[y * size + ((x + 1) % size)];
    const hu = h[((y - 1 + size) % size) * size + x], hd = h[((y + 1) % size) * size + x];
    const nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const o = i * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255;
    img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function solarCellTexture(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1230'; g.fillRect(0, 0, size, size);
  const cols = 8, rows = 12;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i / cols * size, y = j / rows * size;
    const w = size / cols, h = size / rows;
    g.fillStyle = '#12275c'; g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
    g.fillStyle = 'rgba(90,150,255,.10)';
    g.fillRect(x + 1.5, y + 1.5, w - 3, (h - 3) * 0.42);
    // 汇流条
    g.strokeStyle = 'rgba(190,205,230,.45)'; g.lineWidth = 1.1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + w * k / 4, y + 2); g.lineTo(x + w * k / 4, y + h - 2); g.stroke(); }
  }
  g.strokeStyle = 'rgba(150,170,200,.30)'; g.lineWidth = 2;
  g.strokeRect(1, 1, size - 2, size - 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function panelTexture(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d5cb'; g.fillRect(0, 0, size, size);
  // 轻微的积尘污渍
  const rng = makeRNG(4242);
  for (let i = 0; i < 900; i++) {
    const x = rng() * size, y = rng() * size, r = 2 + rng() * 26;
    g.fillStyle = `rgba(120,110,96,${0.012 + rng() * 0.035})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  // 蒙皮接缝与紧固件
  g.strokeStyle = 'rgba(60,58,54,.32)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(0, i * size / 4); g.lineTo(size, i * size / 4); g.stroke();
    g.beginPath(); g.moveTo(i * size / 4, 0); g.lineTo(i * size / 4, size); g.stroke();
  }
  g.fillStyle = 'rgba(50,48,44,.45)';
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.arc(i * size / 4, j * size / 4, 3.2, 0, 6.2832); g.fill();
  }
  // 涂装标识
  g.fillStyle = '#2a2824';
  g.font = `600 ${Math.round(size * 0.052)}px ui-monospace, monospace`;
  g.fillText('MU-7 · CASSIOPEIA', size * 0.06, size * 0.16);
  g.font = `500 ${Math.round(size * 0.034)}px ui-monospace, monospace`;
  g.fillStyle = '#5a564e';
  g.fillText('COSMOS / TELEOPERATED', size * 0.06, size * 0.235);
  g.fillText('UNCREWED MARS ROVER', size * 0.06, size * 0.29);
  g.strokeStyle = '#b4472a'; g.lineWidth = 4;
  g.strokeRect(size * 0.06, size * 0.66, size * 0.30, size * 0.16);
  g.fillStyle = '#b4472a';
  g.font = `700 ${Math.round(size * 0.045)}px ui-monospace, monospace`;
  g.fillText('NO STEP', size * 0.085, size * 0.765);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* 用 SDF 投影做圆角方盒 —— 工业件那种柔和的倒角才吃得住阳光 */
function roundedBox(sx, sy, sz, r, seg = 5) {
  const g = new THREE.BoxGeometry(sx, sy, sz, seg, seg, seg);
  const p = g.attributes.position;
  const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const d = v.clone().sub(q);
    if (d.lengthSq() > 1e-9) d.normalize().multiplyScalar(r); else d.set(0, 0, 0);
    p.setXYZ(i, q.x + d.x, q.y + d.y, q.z + d.z);
  }
  g.computeVertexNormals();
  return g;
}

function buildWheelGeometry() {
  const parts = [];
  const rim = new THREE.CylinderGeometry(WHEEL_R * 0.985, WHEEL_R * 0.985, WHEEL_W, 30, 1, true);
  rim.rotateZ(Math.PI / 2); parts.push(rim);
  for (const s of [-1, 1]) {
    const disc = new THREE.CircleGeometry(WHEEL_R * 0.985, 30);
    disc.rotateY(s * Math.PI / 2);
    disc.translate(s * WHEEL_W / 2, 0, 0);
    parts.push(disc);
    const hub = new THREE.CylinderGeometry(0.085, 0.085, 0.10, 14);
    hub.rotateZ(Math.PI / 2); hub.translate(s * (WHEEL_W / 2 + 0.03), 0, 0);
    parts.push(hub);
  }
  // 抓地齿：人字形棘爪。松散风化层里巡视器还能走，全靠这一圈东西
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    for (const half of [-1, 1]) {
      const cleat = new THREE.BoxGeometry(WHEEL_W * 0.44, 0.034, 0.072);
      cleat.translate(0, WHEEL_R + 0.010, 0);
      cleat.applyMatrix4(new THREE.Matrix4().makeRotationY(half * 0.34));   // the chevron half-angle
      cleat.applyMatrix4(new THREE.Matrix4().makeTranslation(half * WHEEL_W * 0.25, 0, 0));
      cleat.applyMatrix4(new THREE.Matrix4().makeRotationX(a + half * 0.07));
      parts.push(cleat);
    }
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

/* ============================================================
   巡视车
   ============================================================ */
export class Rover {
  constructor(terrain, scene) {
    this.terrain = terrain;
    this.root = new THREE.Group();
    scene.add(this.root);

    /* ---- 刚体状态 ---- */
    this.pos = new THREE.Vector3(0, 0, 0);
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.omega = new THREE.Vector3();
    this.mass = MASS;
    // 长方体惯量，1.7 × 0.8 × 2.7 m
    const Ix = MASS / 12 * (0.8 * 0.8 + 2.7 * 2.7);
    const Iy = MASS / 12 * (1.7 * 1.7 + 2.7 * 2.7);
    const Iz = MASS / 12 * (1.7 * 1.7 + 0.8 * 0.8);
    this.Ibody = new THREE.Vector3(Ix, Iy, Iz);

    /* ---- 车轮 ---- */
    this.wheels = [];
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      this.wheels.push({
        mount: new THREE.Vector3(s * HALF_TRACK, 0.10, AXLE_Z[a]),
        side: s, axle: a,
        steer: 0, targetSteer: 0,
        spin: 0, spinVel: 0,
        comp: 0, compVel: 0,
        contact: false, normal: new THREE.Vector3(0, 1, 0),
        worldPos: new THREE.Vector3(), lastGround: new THREE.Vector3(),
        slipLong: 0, slipLat: 0, load: 0, sink: 0,
        obj: null, hub: null
      });
    }

    /* ---- 操控状态 ---- */
    this.throttle = 0; this.brake = 0; this.steerInput = 0;
    this.headlights = false; this.lampPower = 0;
    this.powerScale = 1;                     // 每帧由外部（电量系统）写入
    this.mastYaw = 0; this.mastPitch = 0;
    this.armDeploy = 0; this.drillSpin = 0; this.drilling = false;
    // 操作员瞄准的机械臂：绕肩摆动、沿臂伸缩，落到地面的垂直量
    // 每帧从瞄准点下方的地形现算
    this.armOut = 0; this.armYaw = 0; this.armReach = 1.15; this.armDrop = -0.95;
    this.armTarget = new THREE.Vector3();
    this.panelDeploy = 0; this.panelTarget = 0;
    this.airborne = false; this.airTime = 0;
    this.hardHit = 0;
    this.odo = 0;
    this.motorLoad = 0;
    this.sunVis = 1;

    this.build();
  }

  /* ============================================================
     这台机器本身
     ============================================================ */
  build() {
    const foilNormal = crinkleNormal(256, 8, 2.4);
    foilNormal.repeat.set(2, 2);
    this.tex = { foilNormal, solar: solarCellTexture(), panel: panelTexture() };

    const M = this.mats = {
      gold: new THREE.MeshPhysicalMaterial({
        color: 0xe6ad36, metalness: 0.68, roughness: 0.43, envMapIntensity: 1.35,
        normalMap: foilNormal, normalScale: new THREE.Vector2(.65, .65),
        clearcoat: 0.25, clearcoatRoughness: 0.5
      }),
      white: new THREE.MeshStandardMaterial({
        color: 0xe6e2d6, metalness: 0.05, roughness: 0.82, envMapIntensity: 0.8
      }),
      plate: new THREE.MeshStandardMaterial({
        map: this.tex.panel, color: 0xa9a49a, metalness: 0.08, roughness: 0.78, envMapIntensity: 0.7
      }),
      alu: new THREE.MeshStandardMaterial({ color: 0x8b8982, metalness: 0.88, roughness: 0.46, envMapIntensity: 1.0 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x25262a, metalness: 0.55, roughness: 0.62 }),
      black: new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.30, roughness: 0.85 }),
      tyre: new THREE.MeshStandardMaterial({ color: 0xa9a9a0, metalness: 0.72, roughness: 0.58, envMapIntensity: 0.75 }),
      solar: new THREE.MeshPhysicalMaterial({
        map: this.tex.solar, metalness: 0.42, roughness: 0.16, envMapIntensity: 1.6,
        clearcoat: 1.0, clearcoatRoughness: 0.06, color: 0xffffff
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0x0c1418, metalness: 0.1, roughness: 0.05, transmission: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.02, envMapIntensity: 2.4
      }),
      emitC: new THREE.MeshBasicMaterial({ color: 0x66e6ff }),
      emitA: new THREE.MeshBasicMaterial({ color: 0xffa33a }),
      emitG: new THREE.MeshBasicMaterial({ color: 0x7dff92 }),
      emitR: new THREE.MeshBasicMaterial({ color: 0xff4436 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff2e0 })
    };

    const body = this.body = new THREE.Group();
    this.root.add(body);

    /* ---- 保温电子舱 ---- */
    const web = new THREE.Mesh(roundedBox(1.34, 0.62, 2.02, 0.075), M.gold);
    web.position.set(0, 0.50, 0.03);
    web.castShadow = web.receiveShadow = true;
    body.add(web);

    // 散热甲板
    const deck = new THREE.Mesh(roundedBox(1.16, 0.07, 1.72, 0.02), M.white);
    deck.position.set(0, 0.835, 0.03);
    deck.castShadow = deck.receiveShadow = true;
    body.add(deck);
    for (let i = 0; i < 11; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.028, 0.035), M.alu);
      fin.position.set(0, 0.872, -0.78 + i * 0.156);
      fin.castShadow = true; body.add(fin);
    }

    // 两侧的铭牌 —— 全车只有这里写着名字
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(.70, .25), M.plate);
      plate.position.set(s * 0.681, 0.52, 0.03);
      plate.rotation.y = s * Math.PI / 2;
      body.add(plate);
    }

    // 底架
    const frame = new THREE.Mesh(roundedBox(1.18, 0.10, 2.20, 0.03), M.dark);
    frame.position.set(0, 0.175, 0.0); body.add(frame);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.30, 2.30), M.alu);
      rail.position.set(s * 0.60, 0.32, 0.0); rail.castShadow = true; body.add(rail);
    }

    /* ---- 吊在底盘下的探地雷达阵列 ---- */
    const gpr = new THREE.Group(); gpr.position.set(0, 0.115, 0.30);
    const gprBox = new THREE.Mesh(roundedBox(0.92, 0.09, 0.62, 0.02), M.black);
    gpr.add(gprBox);
    for (let i = 0; i < 4; i++) {
      const el = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.012, 0.045), M.alu);
      el.position.set(0, -0.055, -0.20 + i * 0.135); gpr.add(el);
    }
    this.gprGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({
      color: 0x39d0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.gprGlow.rotation.x = -Math.PI / 2; this.gprGlow.position.y = -0.062;
    gpr.add(this.gprGlow);
    body.add(gpr);

    /* ---- 后部隔热设备舱：外观不假定无限电源 ---- */
    const equipment=new THREE.Mesh(roundedBox(.72,.42,.30,.035),M.gold);
    equipment.position.set(0,.55,-1.10);body.add(equipment);
    // Kept as a non-rendered compatibility target for the existing indicator update.
    this.rtgGlow={material:{opacity:0}};

    /* ---- 四片蝶翼式太阳能阵列，+Z 为车头 ---- */
    this.panelPivot=new THREE.Group();body.add(this.panelPivot);
    this.solarWings=[];
    const wingShape=new THREE.Shape();
    wingShape.moveTo(0,-.37);wingShape.lineTo(.98,-.62);wingShape.lineTo(1.58,-.48);
    wingShape.lineTo(1.68,.37);wingShape.lineTo(1.39,.58);wingShape.lineTo(.13,.43);wingShape.closePath();
    const substrate=new THREE.ExtrudeGeometry(wingShape,{depth:.032,bevelEnabled:false});
    substrate.rotateX(-Math.PI/2);
    const cellShape=new THREE.Shape();
    // Inset photovoltaic face shares the same polygon and datum as its backing.
    wingShape.getPoints().forEach((p,i)=>i?cellShape.lineTo(.82+(p.x-.82)*.965,p.y*.94):cellShape.moveTo(.82+(p.x-.82)*.965,p.y*.94));
    const faceGeo=new THREE.ShapeGeometry(cellShape);faceGeo.rotateX(-Math.PI/2);
    const uv=faceGeo.attributes.uv,pos=faceGeo.attributes.position;
    for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/1.68,(pos.getZ(i)+.62)/1.24);
    for(const side of [-1,1])for(const fore of [-1,1]){
      const pivot=new THREE.Group();pivot.position.set(side*.67,.82,fore*.67);
      const leaf=new THREE.Group();leaf.rotation.y=side<0?Math.PI:0;pivot.add(leaf);
      const backing=new THREE.Mesh(substrate,M.gold);leaf.add(backing);
      const face=new THREE.Mesh(faceGeo,M.solar);face.position.y=.034;leaf.add(face);
      const border=new THREE.LineSegments(new THREE.EdgesGeometry(substrate),new THREE.LineBasicMaterial({color:0xcab47e}));leaf.add(border);
      for(const u of [.08,.48,1.03]){
        const rib=new THREE.Mesh(new THREE.BoxGeometry(.025,.032,.76),M.alu);rib.position.set(u,-.018,0);leaf.add(rib);
      }
      const hinge=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.58,12),M.alu);
      hinge.rotation.x=Math.PI/2;pivot.add(hinge);
      this.panelPivot.add(pivot);this.solarWings.push({pivot,side});
    }

    /* ---- 桅杆与相机头 ---- */
    this.mast = new THREE.Group(); this.mast.position.set(0, 0.83, 0.62);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.16, 12), M.gold);
    post.position.y = 0.58; post.castShadow = true; this.mast.add(post);
    this.head = new THREE.Group(); this.head.position.y = 1.20;
    const headBox = new THREE.Mesh(roundedBox(0.58, 0.23, 0.24, 0.025), M.white);
    headBox.castShadow = true; this.head.add(headBox);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.085, 16), M.dark);
      eye.rotation.x = Math.PI / 2; eye.position.set(s * 0.185, 0.005, 0.13); this.head.add(eye);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.040, 20), M.glass);
      lens.position.set(s * 0.185, 0.005, 0.174); this.head.add(lens);
    }
    const spectro = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.075, 0.13), M.black);
    spectro.position.set(0, 0.005, 0.115); this.head.add(spectro);
    const visor=new THREE.Mesh(roundedBox(.65,.035,.32,.012),M.white);
    visor.position.set(0,.135,.015);this.head.add(visor);
    for(const y of [.18,.55,.92]){
      const collar=new THREE.Mesh(new THREE.CylinderGeometry(.071,.071,.055,16),M.alu);collar.position.y=y;this.mast.add(collar);
    }
    const cablePath=new THREE.CatmullRomCurve3([new THREE.Vector3(.065,.05,0),new THREE.Vector3(.14,.30,.04),new THREE.Vector3(.09,.56,.08),new THREE.Vector3(-.09,.77,.06),new THREE.Vector3(-.075,1.08,0)]);
    this.mast.add(new THREE.Mesh(new THREE.TubeGeometry(cablePath,32,.018,6,false),M.white));
    this.mast.add(this.head);
    body.add(this.mast);
    // Front instrument faces and hazard cameras; no passenger cabin or seat.
    for(const x of [-.38,.38]){
      const bay=new THREE.Mesh(roundedBox(.34,.35,.055,.018),M.gold);bay.position.set(x,.48,1.07);body.add(bay);
      const sensor=new THREE.Mesh(roundedBox(.21,.23,.025,.008),M.dark);sensor.position.set(x,.48,1.105);body.add(sensor);
      const cam=new THREE.Mesh(new THREE.CylinderGeometry(.037,.045,.055,16),M.black);cam.rotation.x=Math.PI/2;cam.position.set(x,.74,1.075);body.add(cam);
    }
    const thermal=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.38,20),M.gold);thermal.position.set(-.35,1.09,.15);body.add(thermal);
    const sensorCap=new THREE.Mesh(new THREE.CylinderGeometry(.14,.10,.055,20),M.white);sensorCap.position.set(.4,1.12,.15);body.add(sensorCap);
    const sensorStem=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.22,16),M.alu);sensorStem.position.set(.4,.99,.15);body.add(sensorStem);
    for(const side of [-1,1]){
      const probe=new THREE.Mesh(new THREE.CylinderGeometry(.006,.01,.78,8),M.gold);probe.position.set(side*.61,1.15,.50);probe.rotation.z=-side*.2;body.add(probe);
    }

    /* ---- 高增益天线 ---- */
    this.antenna = new THREE.Group(); this.antenna.position.set(-0.44, 0.86, -0.42);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.34, 10), M.alu);
    stalk.position.y = 0.17; this.antenna.add(stalk);
    const dishPts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14, r = t * 0.34; dishPts.push(new THREE.Vector2(r, r * r * 2.1)); }
    dishPts.push(new THREE.Vector2(0.34, 0.34 * 0.34 * 2.1 + 0.035));   // 真实的碟缘翻边
    const dish = new THREE.Mesh(new THREE.LatheGeometry(dishPts, 30), new THREE.MeshStandardMaterial({
      color: 0xa8a49a, metalness: 0.18, roughness: 0.66, side: THREE.DoubleSide, envMapIntensity: 0.55
    }));
    this.dish = new THREE.Group(); this.dish.position.y = 0.36; this.dish.rotation.x = -0.9;
    dish.castShadow = true; this.dish.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), M.dark);
    feed.position.y = 0.13; this.dish.add(feed);
    this.antenna.add(this.dish);
    body.add(this.antenna);

    // 鞭状天线
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.95, 6), M.alu);
    whip.position.set(0.52, 1.28, -0.86); whip.rotation.z = -0.14; body.add(whip);
    const whipTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.emitR);
    whipTip.position.set(0.59, 1.76, -0.86); body.add(whipTip);
    this.beacon = whipTip;

    /* ---- 机械臂与钻探转塔 ---- */
    this.arm = new THREE.Group(); this.arm.position.set(0, 0.36, 1.02);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.20, 14), M.alu);
    shoulder.rotation.z = Math.PI / 2; this.arm.add(shoulder);
    this.armA = new THREE.Group(); this.arm.add(this.armA);
    const seg1 = new THREE.Mesh(roundedBox(0.11, 0.11, 0.72, 0.028), M.white);
    seg1.position.z = 0.36; seg1.castShadow = true; this.armA.add(seg1);
    this.armB = new THREE.Group(); this.armB.position.z = 0.72; this.armA.add(this.armB);
    const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.16, 12), M.alu);
    elbow.rotation.z = Math.PI / 2; this.armB.add(elbow);
    const seg2 = new THREE.Mesh(roundedBox(0.09, 0.09, 0.60, 0.024), M.white);
    seg2.position.z = 0.30; seg2.castShadow = true; this.armB.add(seg2);
    this.turret = new THREE.Group(); this.turret.position.z = 0.62; this.armB.add(this.turret);
    const turretBody = new THREE.Mesh(roundedBox(0.20, 0.20, 0.22, 0.04), M.dark);
    turretBody.castShadow = true; this.turret.add(turretBody);
    this.drill = new THREE.Group(); this.drill.position.z = 0.12; this.turret.add(this.drill);
    const bit = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.042, 0.34, 10), M.alu);
    bit.rotation.x = Math.PI / 2; bit.position.z = 0.17; this.drill.add(bit);
    for (let i = 0; i < 3; i++) {
      const hold = new THREE.Group(); hold.rotation.z = i / 3 * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.055, 0.28), M.alu);
      fl.position.set(0, 0.042, 0.17); hold.add(fl); this.drill.add(hold);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.09, 10), M.emitA);
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.375; this.drill.add(tip);
    this.drillTip = tip;
    body.add(this.arm);

    /* ---- 前照灯 ---- */
    this.lamps = [];
    for (const s of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 14), M.dark);
      housing.rotation.x = Math.PI / 2; housing.position.set(s * 0.46, 0.62, 1.05); body.add(housing);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.050, 18), M.lamp);
      lens.position.set(s * 0.46, 0.62, 1.098); body.add(lens);
      this.lamps.push(lens);
    }
    // 状态指示灯
    this.leds = [];
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6),
        [M.emitG, M.emitC, M.emitA, M.emitC][i]);
      led.position.set(-0.30 + i * 0.20, 0.845, 0.96); body.add(led); this.leds.push(led);
    }

    /* ---- 摇臂转向架连杆与车轮 ---- */
    const wheelGeo = buildWheelGeometry();
    for (const w of this.wheels) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(wheelGeo, M.tyre);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      w.obj = g; w.hub = mesh;
      body.add(g);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 12), M.dark);
      motor.rotation.z = Math.PI / 2;
      w.motor = motor; g.add(motor);
    }

    /* ---- 真正把轮子挂在车上的那套连杆 ----
       每侧一根摇臂，在差速器处铰接到底盘上：一端挑着前轮，另一端挑着
       转向架，转向架再挑起中轮和后轮。每一根杆件都在每帧按真实关节位置
       重新拉伸一次，所以悬挂无论走多大行程，轮子看上去都还长在车上 ——
       画这套连杆的全部意义就在这儿。 */
    this.links = [];
    const member = (thick) => {
      const m = new THREE.Mesh(roundedBox(thick, thick, 1.0, thick * 0.4), M.alu);
      m.castShadow = true; body.add(m); return m;
    };
    for (const side of [-1, 1]) {
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 14), M.dark);
      pivot.rotation.z = Math.PI / 2;
      pivot.position.set(side * 0.615, 0.44, 0.16);
      body.add(pivot);
      const bogiePin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 12), M.dark);
      bogiePin.rotation.z = Math.PI / 2;
      body.add(bogiePin);
      this.links.push({
        side,
        anchor: new THREE.Vector3(side * 0.70, 0.44, 0.16),
        pivot, bogiePin,
        rocker: member(0.085),      // 差速铰点 → 前轮
        strut: member(0.075),       // 差速铰点 → 转向架销
        bogieF: member(0.065),      // 转向架销 → 中轮
        bogieR: member(0.065),      // 转向架销 → 后轮
        stub: member(0.070)         // 底盘侧面 → 差速铰点
      });
    }

    /* ---- 瞄准环。挂在场景下而不是车下，这样它才平贴在地面上 ---- */
    const ret = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.36, 32),
      new THREE.MeshBasicMaterial({ color: 0x6fe3f5, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ret.add(ring);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.035),
        new THREE.MeshBasicMaterial({ color: 0x6fe3f5, transparent: true, opacity: 0.9,
          depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      tick.rotation.x = -Math.PI / 2; tick.rotation.z = i * Math.PI / 2;
      tick.position.set(Math.cos(i * Math.PI / 2) * 0.50, 0, Math.sin(i * Math.PI / 2) * 0.50);
      ret.add(tick);
    }
    ret.renderOrder = 30; ret.visible = false;
    this.reticle = ret;
    this.root.parent.add(ret);

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.gprGlow.castShadow = false; this.gprGlow.receiveShadow = false;
    this.reticle.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  }

  /* ============================================================
     摆放
     ============================================================ */
  placeAt(x, z, yaw = 0) {
    const h = this.terrain.heightAt(x, z);
    this.pos.set(x, h + 0.95, z);
    this.quat.setFromAxisAngle(_up, yaw);
    this.vel.set(0, 0, 0); this.omega.set(0, 0, 0);
    for (const w of this.wheels) { w.comp = SUSP_REST * 0.5; w.spinVel = 0; w.lastGround.set(x, h, z); }
    this.sync();
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
  }

  get forward() { return _fwd.set(0, 0, 1).applyQuaternion(this.quat); }
  // 右手系、Y 朝上、前方是 +Z ⟹ 右方是 −X。这里写反过一次，
  // 后果是转向键左右颠倒 —— 而且看代码完全看不出来。
  get right() { return _rgt.set(-1, 0, 0).applyQuaternion(this.quat); }
  get up() { return _upv.set(0, 1, 0).applyQuaternion(this.quat); }

  /** 钻头会落在世界空间的哪一点。顺带用该点下方的地形刷新 armDrop，
      逆运动学要用它。 */
  aimPoint(out = this.armTarget) {
    const c = Math.cos(this.armYaw), s = Math.sin(this.armYaw);
    // 臂局部的 (x,z) 偏移，先按臂偏航旋转，再转到世界空间
    _p1.set(ARM_BASE.x + s * this.armReach, ARM_BASE.y, ARM_BASE.z + c * this.armReach);
    out.copy(_p1).applyQuaternion(this.quat).add(this.pos);
    const gh = this.terrain.heightAt(out.x, out.z);
    out.y = gh;
    // 相对肩关节的垂直落差，沿底盘自身的上方向量测
    _p2.set(ARM_BASE.x, ARM_BASE.y, ARM_BASE.z).applyQuaternion(this.quat).add(this.pos);
    this.armDrop = out.y - _p2.y;
    return out;
  }

  /** 沿车头方向的带符号速度 */
  get speed() { return this.vel.dot(this.forward); }
  get flipped() { return this.up.y < 0.18; }
  /** 最高速下的轮毂转速 —— 电机音色以它为归一化基准，
      这样音色会自动跟着行驶包线走。 */
  get spinRef() { return DRIVE.maxSpeed / WHEEL_R; }

  /* ============================================================
     物理
     ============================================================ */
  step(dt, ctl, terrain) {
    const SUB = 6, h = Math.min(dt, 0.05) / SUB;
    for (let s = 0; s < SUB; s++) this._substep(h, ctl, terrain);
    this.sync();
  }

  _substep(dt, ctl, terrain) {
    const q = this.quat;
    const up = _u1.set(0, 1, 0).applyQuaternion(q);
    const fwd = _u2.set(0, 0, 1).applyQuaternion(q);
    const rgt = _u3.set(1, 0, 0).applyQuaternion(q);

    /* ---- 转向：前轮引导，后轮反打 ---- */
    const speedAbs = Math.abs(this.vel.dot(fwd));
    const steerLimit = lerp(0.72, 0.30, sstep(DRIVE.maxSpeed * 0.18, DRIVE.maxSpeed * 0.95, speedAbs));
    for (const w of this.wheels) {
      // 取负号：正的转向输入要让轮子转向 −X，那才是底盘的右侧。
      let t = 0;
      if (w.axle === 0) t = -ctl.steer * steerLimit;
      else if (w.axle === 2) t = ctl.steer * steerLimit * 0.62;
      w.targetSteer = t;
      w.steer += (t - w.steer) * Math.min(1, dt * 12.0);
    }

    const force = _f.set(0, 0, 0);
    const torque = _t.set(0, 0, 0);
    let contacts = 0, loadSum = 0;
    this.motorLoad = 0;

    for (const w of this.wheels) {
      // 轮子安装点在世界空间的位置
      const mount = _p1.copy(w.mount).applyQuaternion(q).add(this.pos);
      // 悬挂沿底盘自身的下方向伸缩，不是沿世界的下方向
      const down = _p2.copy(up).multiplyScalar(-1);

      // 垂直探测：悬挂完全伸出时轮心会落在哪
      const probe = _p3.copy(mount).addScaledVector(down, SUSP_REST);
      const gh = terrain.heightAt(probe.x, probe.z);
      terrain.normalAt(probe.x, probe.z, 0.30, w.normal);

      // 压缩量 = 地面把轮子沿支柱顶上去多少
      const bottom = probe.y - WHEEL_R;
      let comp = (gh - bottom);
      comp = clamp(comp, -0.02, SUSP_TRAVEL + 0.30);
      const wasContact = w.contact;
      w.contact = comp > 0;

      // 用于渲染的轮心
      const centreY = w.contact ? gh + WHEEL_R : probe.y;
      w.worldPos.set(probe.x, centreY, probe.z);

      const compVel = (comp - w.comp) / dt;
      w.compVel = compVel; w.comp = comp;

      if (!w.contact) { w.load = 0; w.slipLat = 0; w.slipLong = 0; w.sink = 0;
        // 悬空的轮子慢慢自己停下来
        w.spinVel -= Math.sign(w.spinVel) * Math.min(Math.abs(w.spinVel), 0.7 * dt);
        w.spin += w.spinVel * dt;
        continue;
      }
      contacts++;

      /* ---- 悬挂 ---- */
      const over = Math.max(0, comp - SUSP_TRAVEL);            // 限位块
      let fs = SUSP_K * comp + SUSP_C * clamp(compVel, -6, 6) + over * over * 400000;
      fs = clamp(fs, 0, 40000);
      const fN = _p4.copy(up).multiplyScalar(fs);
      force.add(fN);
      const rArm = _p5.copy(w.mount).applyQuaternion(q);
      torque.add(_p6.crossVectors(rArm, fN));
      w.load = fs; loadSum += fs;

      /* ---- 轮胎坐标系 ---- */
      const steerQ = _q1.setFromAxisAngle(up, w.steer);
      const wf = _p7.copy(fwd).applyQuaternion(steerQ);
      // 投影到接触平面上
      wf.addScaledVector(w.normal, -wf.dot(w.normal)).normalize();
      const wr = _p8.crossVectors(w.normal, wf).normalize();

      // 接触点速度 = v + ω × r
      const cp = _p9.copy(rArm).addScaledVector(up, -(SUSP_REST - comp));
      const cv = _p10.copy(this.vel).add(_p11.crossVectors(this.omega, cp));
      const vLong = cv.dot(wf), vLat = cv.dot(wr);

      /* ---- 下陷 ----
         接触压强除以表层几厘米风化层的承载强度（约 12 kPa）。
         阿波罗月球车下陷一到两厘米，为此付出了约相当于自重 5% 的滚阻；
         再深一点，那台车根本就走不动了。

         火星风化层的承载强度和月面同量级，但整车重了一倍多，
         所以同样的公式在这里会自然算出更深的下陷 —— 这是对的，
         不需要额外改系数。 */
      const pressure = fs / (WHEEL_W * 0.42);                  // 接触斑的 N/m²
      w.sink = 0.10 * clamp(pressure / 12000, 0, 1);
      const rr = (0.045 + w.sink * 1.2) * fs;

      /* ---- 驱动与制动扭矩 ---- */
      const mu = MU_BASE * (1 - 0.30 * sstep(0.0, 0.09, w.sink));
      const maxF = mu * fs;
      let throttleT = ctl.throttle * MOTOR_TORQUE * this.powerScale *
        (1 - sstep(DRIVE.maxSpeed * 0.82, DRIVE.maxSpeed, Math.abs(vLong)));
      /* ---- 原地转向 ----
         六个独立驱动的轮毂可以让一侧正转、另一侧反转，就地打转。
         没有这个功能，停下来发现车头朝错了方向，就得开出去再绕回来 ——
         听起来多烦，做起来就有多烦。一旦真的跑起来，这份权限就淡出。 */
      const pivot = Math.abs(ctl.steer) * (1 - sstep(DRIVE.maxSpeed * 0.048, DRIVE.maxSpeed * 0.214, speedAbs)) *
                    (1 - Math.min(1, Math.abs(ctl.throttle) * 1.6));
      if (pivot > 0.01) throttleT += w.side * Math.sign(ctl.steer) * MOTOR_TORQUE * this.powerScale * 0.78 * pivot;
      // 牵引力控制：在轮子把自己刨进去之前先收扭矩
      if (ctl.tc) {
        const excess = Math.abs(w.spinVel * WHEEL_R - vLong) - DRIVE.maxSpeed * 0.107;
        if (excess > 0) throttleT *= Math.max(0.15, 1 - excess * 0.85);
      }
      /* ---- 坡道驻车 ----
         谐波减速轮毂不能反向驱动，所以没有指令时车是钉在坡上的，
         不会自己溜下去。这也意味着你不会从刚停好的钻探点上慢慢滑走 ——
         这条存在的全部理由就是它。随速度淡出，所以仍然滑得动。 */
      const holding = Math.abs(ctl.throttle) < 0.05 && pivot < 0.01;
      const brakeCmd = Math.max(ctl.brake, holding ? 0.6 * (1 - sstep(DRIVE.maxSpeed * 0.06, DRIVE.maxSpeed * 0.357, speedAbs)) : 0);
      const brakeT = brakeCmd * BRAKE_TORQUE * Math.sign(w.spinVel || 1e-6);

      /* ---- 轮胎纵向力，半隐式求解 ----
         轮子的转动惯量很小，滑移刚度很大，显式积分会先震荡再炸掉。
         直接把新的轮速解出来，在任何步长下都无条件稳定。 */
      const aT = (throttleT - brakeT) / WHEEL_I;
      const denom = 1 + dt * K_SLIP * WHEEL_R * WHEEL_R / WHEEL_I;
      let spinNew = (w.spinVel + dt * aT + dt * K_SLIP * WHEEL_R * vLong / WHEEL_I) / denom;
      let slipV = spinNew * WHEEL_R - vLong;
      let fx = K_SLIP * slipV;
      let fy = clamp(-vLat * K_LAT, -maxF * 1.2, maxF * 1.2);

      // 摩擦圆 —— 纵向和横向共用同一份预算
      const fmag = Math.hypot(fx, fy);
      if (fmag > maxF) {
        const k = maxF / fmag; fx *= k; fy *= k;
        // 力被削顶了，轮子于是可以空转起来：重新积分一次
        spinNew = w.spinVel + dt * (aT - fx * WHEEL_R / WHEEL_I);
        slipV = spinNew * WHEEL_R - vLong;
      }
      if (brakeCmd > 0.5 && Math.abs(spinNew) < 0.7) spinNew *= 0.5;
      w.spinVel = clamp(spinNew, -DRIVE.maxSpeed / WHEEL_R * 1.6, DRIVE.maxSpeed / WHEEL_R * 1.6);
      w.spin += w.spinVel * dt;

      // 滚阻永远与运动方向相反
      const fRoll = -Math.sign(vLong) * Math.min(rr, Math.abs(vLong) * 700);

      const ftotal = _p12.copy(wf).multiplyScalar(fx + fRoll).addScaledVector(wr, fy);
      force.add(ftotal);
      torque.add(_p13.crossVectors(cp, ftotal));

      w.slipLong = clamp(Math.abs(slipV) / 3.2, 0, 1);
      w.slipLat = clamp(Math.abs(vLat) / 3.0, 0, 1);
      this.motorLoad += Math.abs(throttleT) / MOTOR_TORQUE / 6;
    }

    /* ---- 重力 ---- */
    force.y -= this.mass * MARS_G;

    /* ---- 姿态控制力矩陀螺：让腾空的那几秒不至于翻车 ---- */
    if (contacts <= 1) {
      const lev = _p1.set(0, 1, 0);
      const axis = _p2.crossVectors(up, lev);
      torque.addScaledVector(axis, 5200);
      torque.addScaledVector(this.omega, -2600);
      this.airTime += dt;
    } else {
      this.airTime = 0;
      torque.addScaledVector(this.omega, -900);              // 底盘阻尼
    }
    this.airborne = contacts === 0;

    /* ---- 线性积分 ---- */
    this.vel.addScaledVector(force, dt / this.mass);
    // 拉着刹车时绝不允许在坡上慢慢溜
    if (ctl.brake > 0.7 && contacts >= 3 && this.vel.lengthSq() < 0.05) this.vel.multiplyScalar(0.5);
    this.pos.addScaledVector(this.vel, dt);

    /* ---- 角度积分（惯量在体坐标系里） ---- */
    const qi = _q2.copy(this.quat).invert();
    const tb = _p3.copy(torque).applyQuaternion(qi);
    const wb = _p4.copy(this.omega).applyQuaternion(qi);
    // ω̇ = I⁻¹ (τ − ω × Iω)
    const Iw = _p5.set(wb.x * this.Ibody.x, wb.y * this.Ibody.y, wb.z * this.Ibody.z);
    const gyro = _p6.crossVectors(wb, Iw);
    const dw = _p7.set((tb.x - gyro.x) / this.Ibody.x, (tb.y - gyro.y) / this.Ibody.y, (tb.z - gyro.z) / this.Ibody.z);
    wb.addScaledVector(dw, dt);
    this.omega.copy(wb).applyQuaternion(this.quat);
    const wlen = this.omega.length();
    if (wlen > 1e-6) {
      _q1.setFromAxisAngle(_p8.copy(this.omega).divideScalar(wlen), wlen * dt);
      this.quat.premultiply(_q1).normalize();
    }

    /* ---- 硬地板：绝不让车身穿过地面 ---- */
    const bh = terrain.heightAt(this.pos.x, this.pos.z);
    const minY = bh + 0.30;
    if (this.pos.y < minY) {
      const pen = minY - this.pos.y;
      this.pos.y = minY;
      if (this.vel.y < 0) {
        this.hardHit = Math.max(this.hardHit, -this.vel.y);
        this.vel.y *= -0.12;
      }
      this.vel.x *= 0.90; this.vel.z *= 0.90;
      void pen;
    }
    /* 软性活动边界。月面版把它写死在 560 m —— 那是环形山内壁的位置。
       火星这边地形铺到 200 km，写死就成了一堵看不见的墙，所以改成可配置，
       DRIVE.fence 为 0 时完全不设限。 */
    if (DRIVE.fence > 0) {
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > DRIVE.fence) {
        const k = (r - DRIVE.fence) * 0.06;
        this.vel.x -= this.pos.x / r * k; this.vel.z -= this.pos.z / r * k;
      }
    }

    this.odo += Math.hypot(this.vel.x, this.vel.z) * dt;
  }

  /* ============================================================
     视觉更新
     ============================================================ */
  updateVisuals(dt, ctl) {
    const q = this.quat;
    this.armDeploy += ((this.armOut ? 1 : 0) - this.armDeploy) * Math.min(1, dt * 3.0);
    if (this.armDeploy > 0.02) this.aimPoint();
    for (const w of this.wheels) {
      // 把轮子位置换算回车身坐标系
      const local = _p1.copy(w.worldPos).sub(this.pos).applyQuaternion(_q1.copy(q).invert());
      w.obj.position.copy(local);
      w.obj.rotation.set(0, 0, 0);
      w.obj.rotateY(w.steer);
      w.obj.rotateX(w.spin);
      w.motor.rotation.set(0, 0, Math.PI / 2);
      w.local = (w.local || new THREE.Vector3()).copy(local);
    }

    /* ---- 在真实关节之间把连杆画出来 ---- */
    for (const L of this.links) {
      const wf = this.wheels.find(w => w.side === L.side && w.axle === 0).local;
      const wm = this.wheels.find(w => w.side === L.side && w.axle === 1).local;
      const wr = this.wheels.find(w => w.side === L.side && w.axle === 2).local;
      // 转向架销悬在后两轮中点的上方
      _bog.copy(wm).add(wr).multiplyScalar(0.5); _bog.y += 0.30;
      L.bogiePin.position.copy(_bog);
      span(L.stub, _tmpA.set(L.side * 0.58, 0.44, 0.16), L.anchor);
      span(L.rocker, L.anchor, wf);
      span(L.strut, L.anchor, _bog);
      span(L.bogieF, _bog, wm);
      span(L.bogieR, _bog, wr);
    }

    // 桅杆跟着操作员的视线转
    this.mast.rotation.y = this.mastYaw;
    this.head.rotation.x = this.mastPitch;

    // 天线还在搜一个再也不会回来的载波
    this.dish.rotation.y += dt * 0.22;

    /* ---- 机械臂：两连杆逆运动学解到瞄准点，再从收纳姿态混合过去 ----
       rotation.x 会把一根 +Z 杆件往「下」压，所以这里天然的二维坐标系是
       （前方，下方），目标的垂直分量要翻符号。解的是「肘朝上」那一支 ——
       所有真实的采样臂都保持这个姿态。 */
    const d = this.armDeploy;
    this.arm.rotation.y = this.armYaw * d;
    const L1 = ARM_L1, L2 = ARM_L2;
    const reach = clamp(this.armReach, ARM_REACH_MIN, ARM_REACH_MAX);
    const yp = clamp(-this.armDrop, -0.35, L1 + L2 - 0.06);   // downward to target
    let D = Math.hypot(reach, yp);
    D = clamp(D, Math.abs(L1 - L2) + 0.03, L1 + L2 - 0.03);
    const elbowInt = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const gamma = Math.acos(clamp((D * D + L1 * L1 - L2 * L2) / (2 * D * L1), -1, 1));
    const phi1 = Math.atan2(yp, reach) - gamma;
    const phi2 = phi1 + (Math.PI - elbowInt);
    this.armA.rotation.x = lerp(-2.55, phi1, d);
    this.armB.rotation.x = lerp(2.40, phi2 - phi1, d);
    this.turret.rotation.x = 0;
    if (this.drilling) { this.drillSpin += dt * 26; this.drill.rotation.z = this.drillSpin; }

    // Fold about each root hinge; deployed leaves stay above all wheel travel.
    for(const {pivot,side} of this.solarWings)pivot.rotation.z=side*lerp(1.42,.035,this.panelDeploy);

    // 瞄准环贴在钻头将要落下的那块地形上
    this.reticle.visible = this.armDeploy > 0.35;
    if (this.reticle.visible) {
      this.reticle.position.copy(this.armTarget);
      this.reticle.position.y += 0.06;
      this.reticle.rotation.y += dt * 0.5;
      const k = 0.55 + 0.45 * Math.sin(performance.now() * 0.005);
      this.reticle.children[0].material.opacity = (this.drilling ? 0.95 : 0.45 + 0.35 * k);
    }

    // 灯
    const lp = this.lampPower;
    this.mats.lamp.color.setRGB(lp * 3.4, lp * 3.2, lp * 2.9);
    this.rtgGlow.material.opacity = 0.075 + 0.035 * Math.sin(performance.now() * 0.0013);
    this.beacon.visible = (performance.now() % 1400) < 130;
    void ctl;
  }
}

/* 临时向量，避免每帧分配 */
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3(), _upv = new THREE.Vector3();
const _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _u3 = new THREE.Vector3();
const _f = new THREE.Vector3(), _t = new THREE.Vector3();
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3();
const _p4 = new THREE.Vector3(), _p5 = new THREE.Vector3(), _p6 = new THREE.Vector3();
const _p7 = new THREE.Vector3(), _p8 = new THREE.Vector3(), _p9 = new THREE.Vector3();
const _p10 = new THREE.Vector3(), _p11 = new THREE.Vector3(), _p12 = new THREE.Vector3();
const _p13 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _bog = new THREE.Vector3(), _tmpA = new THREE.Vector3(), _tmpB = new THREE.Vector3();
const _zAxisU = new THREE.Vector3(0, 0, 1);

/** 把一根单位长的 +Z 杆件拉伸旋转，让它正好从 a 连到 b。 */
function span(mesh, a, b) {
  mesh.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  _tmpB.subVectors(b, a);
  const len = _tmpB.length();
  mesh.scale.set(1, 1, Math.max(len, 0.02));
  if (len > 1e-5) mesh.quaternion.setFromUnitVectors(_zAxisU, _tmpB.divideScalar(len));
}
