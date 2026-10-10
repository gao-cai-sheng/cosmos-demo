/* ============================================================
   EVA 动作状态机
   ------------------------------------------------------------
   纯函数，不认识 three.js，也不碰地形：外面把「这一帧实际走了多快、
   头顶还有多少净空、按了跳还是蹲」交进来，这里只回答三件事 ——

     身体   lift（离地高度）/ vy / airborne / crouched
     碰撞   head（当前体高）/ eye（相机高度，做了平滑）
     表演   clip（播哪段）/ rate（播多快）

   两条不显然的：

     ① rate 不是手调的。每段 clip 在 Blender 里被重定向时都量过「这套
        步幅一秒能走多远」（CLIP_SPEED，单位 m/s，已按宇航服腿长缩放）。
        rate = 实际速度 / 该值，脚就不会在地上打滑。所以改 WALK_SPEED
        之前先想清楚：改完 rate 也会跟着变，步频会明显变快或变慢。
     ② 跳跃是真的物理，不是播一段画面。火星重力 3.71 m/s²，起跳速度由
        目标离地高度反推，所以滞空接近 1 秒 —— 地球手感的短促跳在这里
        是错的。净空不够时会顶到天花板并把上升速度清零。
   ============================================================ */

/** 火星重力，m/s²。 */
export const MARS_GRAVITY = 3.71;
/** 一次原地起跳的离地高度，m。穿加压服、背生保包，不做地球式高跳。 */
export const JUMP_RISE = .5;
export const JUMP_SPEED = Math.sqrt(2 * MARS_GRAVITY * JUMP_RISE);

/** 站立/下蹲时脚底到头顶的高度，m。宇航服本体 1.90 m。 */
export const STAND_HEAD = 1.9, CROUCH_HEAD = 1.35;
/** 相机眼点高度，m。蹲下的落差和 CrouchIdle 里骨盆实际下沉的 0.40 m 一致。 */
export const STAND_EYE = 1.65, CROUCH_EYE = 1.25;
/** 起跳还要额外留出的净空，m。够不着就不起跳，免得头穿顶。 */
export const JUMP_CLEARANCE = .25;

/** 低于这个速度算站着不动，m/s。 */
export const IDLE_SPEED = .15;
/** 走和跑的分界，m/s。两段 clip 各自的名义速度之间。 */
export const RUN_THRESHOLD = 2.4;

/** 每段行走 clip 的名义前进速度，m/s：Quaternius 原始根位移 × 宇航服/原模型腿长 0.8812。
 * 由 blender/astronaut-hy3d/retarget.py 量出，见 work/retarget_report.json。 */
export const CLIP_SPEED = {Walk: .859, Run: 4.721, CrouchWalk: .661};
/** rate 的上下限。正常范围内用不到，异常速度下宁可轻微打滑也不要抽搐。 */
export const RATE_RANGE = [.5, 2];

/** 起跳段播多久后换成滞空段，s。 */
export const JUMP_START_TIME = .32, JUMP_START_RATE = 1.7;
/** 落地缓冲保持多久，s；期间给移动输入可以直接打断。 */
export const LAND_TIME = .35, LAND_RATE = 1.4;
/** 眼点高度的平滑速率，1/s。蹲下起身不要瞬移。 */
const EYE_RATE = 12;

export function createLocomotion() {
  return {crouched: false, airborne: false, vy: 0, lift: 0, air: 0, landing: 0,
          head: STAND_HEAD, eye: STAND_EYE, clip: 'Idle', rate: 1};
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {object} state createLocomotion() 的返回值，原地更新
 * @param {number} dt 秒
 * @param {{speed:number, jump:boolean, crouch:boolean}} input speed 是本帧解算后的实际水平速度
 * @param {{headroom:number, groundRise?:number}} env headroom 是脚底到头顶障碍的净空，m；
 *        groundRise 是这一帧脚下地面抬高了多少，m —— lift 是相对当前地面的，
 *        跳上台地时地面升起来，不扣掉就会连人带地一起浮上去
 */
export function stepLocomotion(state, dt, input, env) {
  const headroom = env?.headroom ?? Infinity;
  const speed = input.speed || 0;
  // 顶上不够站直就一直蹲着，松开 Ctrl 也起不来。
  state.crouched = !!input.crouch || headroom < STAND_HEAD;
  if (state.airborne) state.crouched = false;

  if (input.jump && !state.airborne && !state.crouched && headroom >= STAND_HEAD + JUMP_CLEARANCE) {
    state.airborne = true; state.vy = JUMP_SPEED; state.air = 0; state.landing = 0;
  }
  if (state.airborne) {
    state.air += dt;
    state.lift -= env?.groundRise || 0;
    state.vy -= MARS_GRAVITY * dt;
    state.lift += state.vy * dt;
    const ceiling = headroom - STAND_HEAD;
    if (state.lift > ceiling) { state.lift = ceiling; state.vy = Math.min(state.vy, 0); }
    if (state.lift <= 0) { state.lift = 0; state.vy = 0; state.airborne = false; state.landing = LAND_TIME; }
  } else if (state.landing > 0) {
    state.landing = Math.max(0, state.landing - dt);
  }

  state.head = state.crouched ? CROUCH_HEAD : STAND_HEAD;
  const eye = state.crouched ? CROUCH_EYE : STAND_EYE;
  state.eye += (eye - state.eye) * Math.min(1, dt * EYE_RATE);

  let clip = 'Idle', rate = 1;
  if (state.airborne) {
    clip = state.air < JUMP_START_TIME ? 'JumpStart' : 'JumpLoop';
    rate = clip === 'JumpStart' ? JUMP_START_RATE : 1;
  } else if (state.landing > 0 && speed < IDLE_SPEED) {
    clip = 'JumpLand'; rate = LAND_RATE;
  } else if (state.crouched) {
    clip = speed < IDLE_SPEED ? 'CrouchIdle' : 'CrouchWalk';
  } else if (speed >= IDLE_SPEED) {
    clip = speed < RUN_THRESHOLD ? 'Walk' : 'Run';
  }
  if (CLIP_SPEED[clip]) rate = clamp(speed / CLIP_SPEED[clip], ...RATE_RANGE);
  state.clip = clip; state.rate = rate;
  return state;
}
