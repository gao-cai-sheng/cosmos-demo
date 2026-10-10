// 看着游戏状态决定什么时候响（D78）。只读 mobility 每帧给的快照，自己不碰任何游戏对象，
// 所以地表（tools/mars-vista.html）和基地（park/）两个场景共用，node 里也能测。
//
// 快照 s：
//   paused    暂停、开着地图或浮层
//   mode      'walk' | 'carrier' | 'flight' | 'remote' | 'overview'
//   listener  {x, z} 玩家在哪
//   inside    在生活舱里
//   airlock   气闸循环走到第几秒；不在循环里是 null
//   walk      {speed, airborne}；没在走路是 null
//   ship      {x, z, landed, locked, thrust, speed, transfer, ports: [关妥了吗…], motion}；还没部署是 null
//             landed：起落架碰到地了；locked：四足支撑锁定；motion：起落架、舱门、平台的位置加在一起，变了就是有东西在动
//   carrier   {x, z, speed}；还没卸车是 null
//   rover     {speed}；没在遥控是 null

const AIRLOCK_CUES = [   // 对着 refuge-cycle.js 的时间线
  [0, 'door-open'], [.95, 'step-deck'], [1.4, 'step-deck'], [1.8, 'door-close'], [2.6, 'latch'], [2.6, 'airlock-hiss'],
  [4.6, 'door-open'], [5.55, 'step-deck'], [6.0, 'step-deck'], [6.4, 'door-close'], [7.15, 'latch'],
];
const ALARM_GAP = 2.6, DENY_GAP = .6;   // 秒：按住 E 时提示每帧都来，警号不能每帧都响
const clamp01 = v => Math.max(0, Math.min(1, v));

export function createSfxWatch(sfx, { now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000 } = {}) {
  const L = {}; for (const name of ['engine-main', 'engine-thrust', 'servo', 'motor', 'hab-air', 'mars-wind']) L[name] = sfx.loop(name);
  let prev = null, stride = 0, foot = 1, servo = 0, climb = 0, lastAlarm = -1e9, lastDeny = -1e9;
  // 离得越远越小声；ref 是音量降到一半的距离
  const near = (a, b, ref) => a && b ? 1 / (1 + ((a.x - b.x) ** 2 + (a.z - b.z) ** 2) / (ref * ref)) : 1;

  function update(dt, s) {
    const was = prev; prev = s;
    if (s.paused) {
      // 只在刚停下的那一帧收声，之后不再碰循环音：开场降落演出期间游戏是停着的，那时的声音归 createLandingAudio 管。
      if (!was?.paused) { for (const name of ['engine-main', 'engine-thrust', 'servo', 'motor']) L[name].set(0); L['hab-air'].set(L['hab-air'].gain * .6); L['mars-wind'].set(L['mars-wind'].gain * .6); }
      return;
    }
    const aboard = s.mode === 'flight', inCab = s.mode === 'carrier', sheltered = s.inside || s.airlock != null;
    sfx.muffle(sheltered ? 0 : aboard || inCab ? .35 : 1);

    // —— 换了操作对象 ——
    if (was && !was.paused && was.mode !== s.mode) {
      if (s.mode === 'remote') sfx.play('link-on'); else if (was.mode === 'remote') sfx.play('link-off');
      if (s.mode === 'carrier' || was.mode === 'carrier') sfx.play('thud-soft');
      // 直接登船 / 离船才响舱门；乘平台上下时舱口自己已经响过了（下面的 ports）
      const sealed = !s.ship || s.ship.ports.every(Boolean);
      if (sealed && s.mode === 'flight') sfx.play('door-close'); else if (sealed && was.mode === 'flight') sfx.play('door-open');
    }

    // —— NX07 ——
    const ship = s.ship, shipWas = was?.ship;
    const hear = ship ? (aboard ? 1 : near(s.listener, ship, 90)) : 0;
    if (ship && shipWas) {
      if (ship.landed && !shipWas.landed) sfx.play('thud-heavy', { gain: hear });
      if (ship.locked && !shipWas.locked) sfx.play('latch', { gain: hear });
      ship.ports.forEach((closed, i) => { if (closed !== shipWas.ports[i]) sfx.play(closed ? 'latch' : 'door-open', { gain: hear }); });
      // 机构停下后电机声多留一小会儿，不然一帧一帧地断
      servo = Math.abs(ship.motion - shipWas.motion) > 1e-5 ? .25 : Math.max(0, servo - dt);
    } else servo = 0;
    const flying = !!ship && !ship.landed;
    climb = ship?.transfer ? Math.min(1, climb + dt / 7) : 0;      // 轨道转移 7 秒，越爬越响
    const pace = ship ? clamp01(Math.abs(ship.speed) / 270) : 0;
    L['engine-main'].set(flying ? hear * (.6 + .4 * pace + .4 * climb) : 0, .88 + .3 * pace + .5 * climb);
    L['engine-thrust'].set(flying ? hear * (ship.transfer ? 1 : ship.thrust ** 2) : 0, .95 + .1 * (ship?.thrust || 0) + .4 * climb);
    L.servo.set(servo > 0 ? hear : 0);

    // —— ARES / MU-7 的电机 ——
    let motor = 0, pitch = 1;
    if (s.rover) { const v = clamp01(Math.abs(s.rover.speed) / 6); motor = .25 + .5 * v; pitch = 1.25 + .7 * v; }
    else if (s.carrier) {
      const v = clamp01(Math.abs(s.carrier.speed) / 22);
      motor = inCab ? .3 + .7 * v : Math.abs(s.carrier.speed) > .15 ? near(s.listener, s.carrier, 25) * (.3 + .7 * v) : 0;   // 自己开的时候怠速也有声
      pitch = .7 + .9 * v;
    }
    L.motor.set(motor, pitch);

    // —— 环境 ——
    L['hab-air'].set(sheltered ? 1 : 0);
    L['mars-wind'].set(sheltered || aboard ? 0 : inCab ? .45 : 1);

    // —— 气闸循环 ——
    if (s.airlock != null) {
      const from = was?.airlock ?? -1;
      for (const [t, name] of AIRLOCK_CUES) if (from < t && s.airlock >= t) sfx.play(name);
    }

    // —— 脚步 ——
    // 气闸循环里人是被镜头带着走的（那几步在 AIRLOCK_CUES 里），astronaut.speed 还留着按 F 之前的数，不能照它踩。
    const walk = s.airlock == null ? s.walk : null, walkWas = was?.airlock == null ? was?.walk : null;
    if (walk && !walk.airborne && walk.speed > .25) {
      stride += walk.speed * dt;
      const length = Math.min(1.3, .62 + .1 * walk.speed);
      if (stride >= length) { stride -= length; foot = -foot; sfx.play(s.inside ? 'step-deck' : 'step-regolith', { gain: .8 + Math.random() * .2, pan: foot * .15 }); }
    } else if (!walk || walk.speed <= .25) stride = 0;
    if (walk && walkWas?.airborne && !walk.airborne) sfx.play('thud-soft', { gain: .7 });
  }

  return {
    update,
    /** 游戏拒绝了一个操作。kind 'door'：舱门没关妥，响警号；其它：轻轻一声「不行」。 */
    refuse(kind) {
      const t = now();
      if (kind === 'door') { if (t - lastAlarm < ALARM_GAP) return false; lastAlarm = lastDeny = t; return sfx.play('alarm-door'), true; }
      if (t - lastDeny < DENY_GAP) return false;
      lastDeny = t; return sfx.play('ui-deny'), true;
    },
    dispose() { for (const l of Object.values(L)) l.set(0); },
  };
}

/** 开场降落演出的声音。人在 NX07 上：自己的发动机一直在，推力越大越响；先遣舱在几百米外，只听得到一点。
 *  seconds 和 f 就是 landing-timeline.js 的 arrivalFrame(seconds)。 */
const LANDING_CUES = [[9, 'thud-pod', .6], [11.3, 'link-on', 1], [12.5, 'ui-open', 1], [29.3, 'thud-heavy', 1], [29.8, 'latch', .8]];
export function createLandingAudio(sfx) {
  const main = sfx.loop('engine-main'), thrust = sfx.loop('engine-thrust'), pod = sfx.loop('pod-thrust'), servo = sfx.loop('servo');
  let last = 0;
  return {
    update(seconds, f) {
      sfx.muffle(.35);
      main.set(.5 + .3 * f.kestrel.heat + .5 * f.kestrel.thrust, .85 + .25 * f.kestrel.thrust);
      thrust.set(f.kestrel.thrust ** 1.5, .95 + .15 * f.kestrel.thrust);
      pod.set(f.supply.thrust * .4);
      const mastMoving = f.supply.mast > 0 && f.supply.mast < 1, gearMoving = seconds > 22 && seconds < 27;   // 起落架在 22–27 秒放下
      servo.set(gearMoving ? 1 : mastMoving ? .5 : 0);
      // 点了「跳过」时间会一下跳到头，那一大步里的提示音不补
      if (seconds - last < 1) for (const [t, name, gain] of LANDING_CUES) if (last < t && seconds >= t) sfx.play(name, { gain });
      last = seconds;
    },
    finish() { for (const l of [main, thrust, pod, servo]) l.set(0); },
  };
}
