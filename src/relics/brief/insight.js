/* 洞察号 InSight（R-01）。离默认着陆场最近（约 7.4 km），第一处遗迹任务。
   史实依据（2026-09-30 核对）：
   - NASA「NASA Retires InSight Mars Lander Mission After Years of Science」（2022-12-21）：
     太阳翼积尘、电量不足而结束；地震仪记录 1,319 次火星地震；最大一次约 5 级（2022 年 5 月）；
     机械臂除了放仪器，还往太阳翼上撒土、借风把细灰带走。
   - NASA/JPL InSight 发射新闻资料：2018-05-05 发射，2018-11-26 落在埃律西昂平原；两片太阳翼各约 2.15 m，展开约 6 m。
   - NASA/JPL：热流探针 HP3（「鼹鼠」）设计要钻到 5 m 深，土壤不给摩擦力，2021 年 1 月放弃。
   - NASA/JPL：地震数据显示火星的核是液态的（2021）。
   - 模型是出发时的样子：地震仪和热流探针还在甲板上（blender/insight/README.md）。台词里说的是它们后来被放到地上。 */
import { photoTask } from './common.js';

export default function insight() {
  let cells = null, frame = null, clean = null, cleanFrame = null, dust = 0, want = 0;
  return {
    id: 'INSG', model: 'insight',
    title: '洞察号着陆器', subtitle: '2018 年出发时的样子', dims: '翼展约 6 m · 太阳翼直径 2.15 m',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '洞察号<small>InSight</small>',
        rows: [['主持', 'NASA 喷气推进实验室'], ['发射', '2018 年 5 月 5 日'], ['落地', '2018 年 11 月 26 日'], ['任务', '听火星的地震']],
        foot: ['<b>目标</b>', '看清火星内部的结构'] },
      { id: 'history', short: '经历', kick: '以往经历', title: '一台放在地上的地震仪',
        rows: [['地震仪', '由机械臂放到地面'], ['记录', '1,319 次火星地震'], ['最大', '约 5 级 · 2022 年 5 月']],
        note: '旁边的热流探针要像鼹鼠一样钻到地下 5 米。这里的土太松，它使不上劲，2021 年 1 月放弃。',
        foot: ['<b>测出</b>', '火星的核是液态的'] },
      { id: 'dust', short: '停下', kick: '为什么停下', title: '一层一层的灰',
        rows: [['电源', '两片太阳翼'], ['问题', '积灰越来越厚'], ['办法', '往太阳翼上撒土'], ['结束', '2022 年 12 月 21 日']],
        foot: ['<b class="warn">电量不足</b>', '再也叫不醒'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '埃律西昂平原<small>Elysium Planitia</small>',
        rows: [['坐标', '4.50°N 135.62°E'], ['地形', '平坦，碎石少'], ['轨道照片', '火星勘测轨道器'], ['距着陆场', '约 {km} km']] },
      photoTask('去看看它现在的样子'),
    ],
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '指挥官，第一处遗迹离你们最近：洞察号着陆器，大约 {km} 公里。' },
      { sec: 'project', shot: 'brief', pose: 'point', view: 'overview',
        say: '它 2018 年落在埃律西昂平原。别的探测器找水、找生命，它只做一件事：听火星地震。' },
      { sec: 'history', shot: 'brief', pose: 'thinking', view: 'seis', hl: ['seis'], callouts: ['seis'],
        say: '机械臂把这台地震仪从甲板上搬下来，放到地上，再罩上防风罩。四年里，它记下了一千三百多次火星地震。' },
      { sec: 'history', shot: 'brief', pose: 'tired', view: 'hp3', hl: ['hp3'], callouts: ['hp3'],
        say: '旁边这台热流探针就没那么顺利。它得像鼹鼠一样钻到地下五米，可这里的土太松，钻了两年也没下去。' },
      { sec: 'dust', shot: 'wide', pose: 'worried', view: 'solar', hl: ['solar'], callouts: ['solar'], dust: 1,
        lower: ['2019 → 2022', '太阳翼上的灰越积越厚，电一天比一天少'],
        say: '它靠这两片太阳翼发电。灰一层层落上去，电越来越少。地面想了个办法：让机械臂往太阳翼上撒土，借风把细灰带走。' },
      { sec: 'dust', shot: 'close', pose: 'solemn', view: 'solar', dust: 1,
        say: '办法管用过几次，可灰总是比风多。2022 年 12 月，它发回最后几张照片，然后就安静了。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview', dust: 1,
        say: '它还在原地：埃律西昂平原。轨道上的相机这几年一直在拍它，看灰怎么落、怎么被风吹走。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'overview', dust: 1, action: '接受任务',
        say: '任务：去拍一张它现在的样子，最好看得出太阳翼上的灰。先别碰它。它是这片平原上，我们的第一个邻居。' },
    ],
    views: {
      overview: { t: null, az: -32, el: 22, fit: null, fitScale: 0.95, spin: true },
      seis: { part: '^SEIS wind shield', az: -20, el: 30, fitScale: 2.4 },
      hp3: { part: '^HP3 package', az: 10, el: 30, fitScale: 3.2 },
      solar: { part: '^Solar array \\+1', az: 60, el: 38, fitScale: 1.25 },
    },
    groups: { seis: /^SEIS/, hp3: /^HP3/, solar: /^Solar array/ },
    callouts: {
      seis: { part: 'SEIS wind shield / white dome', b: '地震仪 SEIS', s: '白色罩子是防风罩', dx: 90, dy: -70 },
      hp3: { part: 'HP3 package / copper enclosure', b: '热流探针 HP3', s: '要钻 5 米 · 没钻下去', dx: -60, dy: -80 },
      solar: { part: 'Solar array +1 / hub cap', b: '太阳翼', s: '直径 2.15 m · 积灰发不了电', dx: 70, dy: -90 },
    },
    // 太阳翼积灰：电池片和框架的颜色慢慢往火星尘的土红色靠
    setup(ctx) {
      ctx.model.traverse(o => {
        if (!o.isMesh) return;
        if (o.material.name?.includes('UltraFlex cells')) cells = o.material;
        if (o.material.name?.includes('solar array frame')) frame = o.material;
      });
      clean = cells?.color.clone(); cleanFrame = frame?.color.clone();
      this.dustColor = new ctx.THREE.Color(0x9a6a4a);
    },
    onBeat(ctx, b) { want = b.dust || 0; if (b.cut && !want) dust = 0; },
    update(ctx, now, dt) {
      if (!cells) return;
      dust += Math.sign(want - dust) * Math.min(Math.abs(want - dust), dt / 3.5);   // 3.5 秒落满
      cells.color.copy(clean).lerp(this.dustColor, dust * 0.85);
      if (frame) frame.color.copy(cleanFrame).lerp(this.dustColor, dust * 0.6);
    },
  };
}
