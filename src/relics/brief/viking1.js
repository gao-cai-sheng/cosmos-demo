/* 海盗 1 号着陆器（R-05）。从 cosmos-report-demo/relic-viking.html 搬来，任务段改成只拍照（D65）。
   史实依据（2026-09-24 核对）：NASA NSSDC 1975-075C、NASA Science「Viking 1」、维基百科 Viking 1 / Viking program。
   坐标 22.27°N 312.05°E 是 NSSDC 的着陆坐标；距离按当前存档的首次着陆点实时算（{km}）。
   高程从 cosmos/data/megt90n000cb.img（MOLA）读出。 */
import { photoTask } from './common.js';
import { setupPov } from './viking-common.js';

export default function viking1() {
  const D2R = Math.PI / 180, SLEW = 115 * D2R;
  const antenna = { pivot: null, beam: null, earth: null, t: 0, from: 0, to: 0, t0: 0, dur: 1, timer: 0 };
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function aimAntenna(to, dur, delay = 0) {
    clearTimeout(antenna.timer);
    const go = () => { Object.assign(antenna, { from: antenna.t, to, t0: performance.now(), dur }); };
    if (delay) antenna.timer = setTimeout(go, delay); else go();
  }
  let cCyan = null, cRed = null;

  return {
    id: 'VKG1', model: 'viking1-v2-parts',
    title: '海盗 1 号着陆器', subtitle: '1976 年出发时的样子', dims: '足距 2.21 m · 高约 2 m',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '海盗号计划<small>Viking</small>',
        rows: [['主持', 'NASA 兰利研究中心'], ['发射', '1975 年 · 两艘'], ['每艘', '轨道器 + 着陆器'], ['造价', '约 10 亿美元（当年）']],
        foot: ['<b>目标</b>', '在火星上找生命'] },
      { id: 'history', short: '经历', kick: '以往经历', title: '海盗 1 号着陆器',
        rows: [['落地', '1976 年 7 月 20 日'], ['工作', '2,245 个火星日'], ['留下', '第一张火星地面照片']],
        note: '原定 7 月 4 日（美国建国 200 周年）落地。轨道器看到着陆点太崎岖，推迟了 16 天。',
        foot: ['<b>1981</b>', '改名「托马斯·马奇纪念站」'] },
      { id: 'lost', short: '失联', kick: '失联原因', title: '一条写错位置的指令',
        rows: [['时间', '1982 年 11 月'], ['本意', '更新电池充电程序'], ['实际', '盖掉了天线指向数据'], ['结果', '天线偏离地球']],
        foot: ['<b class="warn">抢救 4 个月</b>', '没有回音'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '克律塞平原<small>Chryse Planitia</small>',
        rows: [['坐标', '22.27°N 47.95°W'], ['高程', '约 −3.6 km'], ['最近确认', '2006 年 · 火星勘测轨道器'], ['距着陆场', '约 {km} km']] },
      photoTask('去看看它现在的样子'),
    ],
    /* 每一段一个镜头（shot）：brief 同框；wide 大镜头；pov 相机视角；close 近景；map 地图。
       view：模型机位；hl：发光的零件组；callouts：标注；antenna：天线演示；lower：下方字幕 */
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '指挥官，新任务。这次不用造东西，是去找一台 1976 年就落在火星上的机器。' },
      { sec: 'project', shot: 'brief', pose: 'point', view: 'overview',
        say: '它来自海盗号计划。1975 年，美国发射了两艘飞船，每艘带一台着陆器，目标只有一个：找火星上的生命。' },
      { sec: 'history', shot: 'pov', pose: 'point', view: 'pov', lower: ['重现 · 1976 年 7 月 20 日', '火星地面第一张照片'],
        say: '这台是海盗 1 号着陆器。1976 年 7 月 20 日落地，几分钟后，它从这里拍下了火星地面的第一张照片。' },
      { sec: 'history', shot: 'brief', pose: 'thinking', view: 'sampler', hl: ['sampler'], callouts: ['sampler'],
        say: '它用这条机械臂挖土，送进生物实验仪。结果像是有生命，却又没测到有机物。这场争论到今天也没有结论。' },
      { sec: 'lost', shot: 'wide', pose: 'worried', view: 'antenna', hl: ['hga'], callouts: ['hga', 'earth'], antenna: 'slew',
        lower: ['1982 年 11 月', '电池充电程序写错了位置 → 天线指向数据被盖掉'],
        say: '1982 年 11 月，地面给它发了一段新的电池充电程序。程序写错了位置，把天线的指向数据盖掉了。' },
      { sec: 'lost', shot: 'close', pose: 'farewell', view: 'antenna', antenna: 'hold',
        say: '天线一偏，它就再也收不到我们。地面找了四个月，没有回音。按计划，它本该每周报一次天气，一直报到 1994 年。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview',
        say: '它还在原地：克律塞平原。2006 年，轨道上的相机又拍到了它。离我们的着陆场大约 {km} 公里。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'chart', hl: ['chart'], callouts: ['chart'], action: '接受任务',
        say: '任务只有一件：找到它，拍一张看得清的照片，最好把色卡也拍进去。落不下就在天上拍。先别碰它。' },
    ],
    views: {
      overview: { t: [0, 0.8, 0.45], az: -38, el: 16, fit: 1.75, spin: true },
      sampler: { t: [-0.35, 0.55, 1.05], az: -62, el: 24, fit: 1.45 },
      antenna: { t: [-0.2, 1.4, 0.1], az: 40, el: 14, fit: 1.6 },
      chart: { t: [0, 0.85, 0.25], az: 0, el: 30, fit: 1.15 },   // 从高处越过进样漏斗看色卡
      pov: { eye: [0, 1.3, 0], t: [0, 0, 1], fov: 40, still: true, pov: true },   // 载入后从零件量出来
    },
    groups: { sampler: /^Sampler \//, hga: /^HGA \//, chart: /^(Decal \/ reference test chart|Deck \/ test chart)/ },
    callouts: {
      sampler: { part: 'Sampler / collector head body', b: '采样臂', s: '挖土 · 送进实验仪', dx: -40, dy: -90 },
      hga: { part: 'HGA / parabolic reflector', b: '高增益天线', s: '直径 0.76 m · 对准地球', dx: 90, dy: 40,
        warn: () => antenna.t > 0.5, s2: '指向数据被盖掉' },
      earth: { point: ctx => antenna.earth && antenna.earth.getWorldPosition(new ctx.THREE.Vector3()), b: '地球方向', dx: -70, dy: -30 },
      chart: { part: 'Decal / reference test chart', b: '色卡', s: '1976 年标定过颜色', dx: 80, dy: -70 },
    },

    setup(ctx) {
      const { THREE, parts, centerOf, model } = ctx;
      cCyan = new THREE.Color(0x6fe3f5); cRed = new THREE.Color(0xff5f56);
      setupPov(ctx);
      // 天线：碟面、馈源、支臂、俯仰机构绕天线杆转；方向 = 碟面中心 → 馈源
      const mastC = centerOf('HGA / mast'), reflC = centerOf('HGA / parabolic reflector'), feedC = centerOf('HGA / cup-helix feed');
      const dir = feedC.clone().sub(reflC).normalize();
      const pivot = new THREE.Group(); pivot.position.set(mastC.x, 0, mastC.z); model.add(pivot);
      for (const n of ['HGA / parabolic reflector', 'HGA / cup-helix feed', 'HGA / feed copper band', 'HGA / feed support',
        'HGA / dish arm', 'HGA / elevation gimbal', 'HGA / elevation motor']) {
        const o = parts.get(n); if (!o) continue;
        o.position.sub(pivot.position); pivot.add(o);
      }
      // 波束：从碟面往外，越远越淡
      const len = 1.15;
      const fade = ctx.canvasTex(4, 128, g => {
        const gr = g.createLinearGradient(0, 0, 0, 128);
        gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#999'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
      });
      const beamGeo = new THREE.CylinderGeometry(0.42, 0.3, len, 40, 1, true); beamGeo.translate(0, len / 2, 0);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x6fe3f5, transparent: true, opacity: 0.28,
        alphaMap: fade, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      beam.position.copy(reflC).sub(pivot.position);
      pivot.add(beam);
      const earth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshBasicMaterial({ color: 0x6fe3f5 }));
      earth.position.copy(reflC).addScaledVector(dir, len + 0.08);
      model.add(earth);
      beam.visible = earth.visible = false;
      Object.assign(antenna, { pivot, beam, earth });
    },
    onBeat(ctx, b) {
      if (antenna.beam) antenna.beam.visible = antenna.earth.visible = !!b.antenna;
      if (b.antenna === 'slew') { antenna.t = antenna.from = antenna.to = 0; aimAntenna(1, 2400, 1500); }
      else if (b.antenna === 'hold') { if (antenna.to !== 1) aimAntenna(1, 1200); }
      else aimAntenna(0, 900);
    },
    update(ctx, now) {
      if (!antenna.pivot) return;
      const k = Math.min(1, Math.max(0, (now - antenna.t0) / antenna.dur));
      if (antenna.t0) antenna.t = antenna.from + (antenna.to - antenna.from) * ease(k);
      antenna.pivot.rotation.y = antenna.t * SLEW;
      const w = Math.min(1, Math.max(0, (antenna.t - 0.35) / 0.3));
      antenna.beam.material.color.copy(cCyan).lerp(cRed, w);
      ctx.view.classList.toggle('lost', !!(ctx.current && ctx.current.antenna && antenna.t > 0.6));
    },
    hlColor(ctx) { return ctx.current && ctx.current.antenna && antenna.t > 0.5 ? cRed : null; },
    onReplay(ctx) { if (ctx.current && ctx.current.antenna) { antenna.t = antenna.from = antenna.to = 0; aimAntenna(1, 2400, 700); } },
    replayable: b => b.shot === 'wide' && !!b.antenna,
  };
}
