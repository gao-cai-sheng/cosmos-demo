/* 海盗 2 号着陆器（R-02）。和海盗 1 号同型，档案台用同一个 v2 零件版模型（blender/viking2/README.md 论证同型）。
   史实依据（2026-09-30 核对）：
   - NASA Science「Viking 2」、NASA「Sept. 3, 1976: Viking 2 Lands on Mars」：1975-09-09 发射，1976-09-03 落在乌托邦平原；
     1980-04-11 电池失效后关机，4 月 12 日前还在发数据。
   - NASA/JPL PIA00573「Frost at the Viking Lander 2 Site」：1979-05-18 相机 2 拍到地上一层很薄的水冰霜，
     差不多一个火星年前同一处也结过霜。
   - NTRS 19790057281「Martian wind activity detected by a seismometer at Viking lander 2 site」：
     地震仪装在着陆器顶上，对风非常敏感。后来洞察号把地震仪放到地面并加防风罩（见 insight.js）。
   - HiRISE PSP_001501_2280（2006 年）拍到它（research/mars-relic-imagery/VKG2_Viking-2）。
   v2 模型里没有单独的地震仪零件，讲地震仪那句不高亮零件。 */
import { photoTask } from './common.js';
import { setupPov } from './viking-common.js';

export default function viking2() {
  let groundMat = null, rockMat = null, soil = null, rockSoil = null, frostColor = null, frost = 0, want = 0;
  return {
    id: 'VKG2', model: 'viking1-v2-parts',
    title: '海盗 2 号着陆器', subtitle: '1975 年出发时的样子（与 1 号同型）', dims: '足距 2.21 m · 高约 2 m',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '海盗 2 号<small>Viking 2</small>',
        rows: [['发射', '1975 年 9 月 9 日'], ['落地', '1976 年 9 月 3 日'], ['地点', '乌托邦平原'], ['型号', '和海盗 1 号一样']],
        foot: ['<b>目标</b>', '在火星上找生命'] },
      { id: 'history', short: '经历', kick: '以往经历', title: '北方的冬天',
        rows: [['纬度', '北纬 48°'], ['发现', '冬天地上结一层薄霜'], ['那张照片', '1979 年 5 月 18 日']],
        note: '甲板上还有一台地震仪。它装在机身上，风一吹就跟着抖，记下来的多半是风。',
        foot: ['<b>后来</b>', '洞察号把地震仪放到了地上'] },
      { id: 'end', short: '停下', kick: '为什么停下', title: '电池坏了',
        rows: [['工作', '三年半多'], ['关机', '1980 年 4 月 11 日'], ['原因', '电池失效']],
        foot: ['<b class="warn">最后一次信号</b>', '1980 年 4 月 12 日'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '乌托邦平原<small>Utopia Planitia</small>',
        rows: [['坐标', '47.64°N 134.29°E'], ['气候', '纬度高，冬天很冷'], ['轨道照片', '2006 年 · 火星勘测轨道器'], ['距着陆场', '约 {km} km']] },
      photoTask('去看看它现在的样子'),
    ],
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '第二处遗迹，是海盗 1 号的双胞胎：海盗 2 号着陆器。' },
      { sec: 'project', shot: 'brief', pose: 'point', view: 'overview',
        say: '它 1976 年 9 月落在乌托邦平原，比海盗 1 号晚一个半月，也往北得多。' },
      { sec: 'history', shot: 'pov', pose: 'surprised', view: 'pov', frost: 1, lower: ['重现 · 1979 年 5 月 18 日', '地上的一层薄霜'],
        say: '北边的冬天很冷。它的相机拍到过地上的一层白霜，是水结的冰，薄得像撒了一层糖。' },
      { sec: 'history', shot: 'brief', pose: 'thinking', view: 'met', hl: ['met'], callouts: ['met'],
        say: '这根气象桅杆每天记温度、气压和风，一记就是三年多。' },
      { sec: 'history', shot: 'wide', pose: 'patient', view: 'deck', lower: ['甲板上的地震仪', '装在机身上 · 风一吹就跟着抖'],
        say: '它身上还带着一台地震仪，可惜装在机身上。风一吹，它就跟着抖，记下来的多半是风。后来洞察号把地震仪放到地上，就是吸取了这个教训。' },
      { sec: 'end', shot: 'close', pose: 'tired', view: 'overview',
        say: '1980 年 4 月，它的电池坏了，再也撑不住。地面最后一次收到它的信号，是 4 月 12 日。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview',
        say: '它还在乌托邦平原，离我们的着陆场大约 {km} 公里。2006 年，轨道上的相机又找到了它。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'overview', frost: 1, action: '接受任务',
        say: '任务一样：拍一张它现在的样子。要是赶上那边的冬天，看看它脚下还有没有霜。先别碰它。' },
    ],
    views: {
      overview: { t: [0, 0.8, 0.45], az: 142, el: 18, fit: 1.75, spin: true },
      met: { part: '^Met boom', az: 150, el: 16, fitScale: 2.6 },
      deck: { t: [0, 1.05, 0.2], az: 200, el: 34, fit: 1.35 },
      pov: { eye: [0, 1.3, 0], t: [0, 0, 1], fov: 40, still: true, pov: true },   // 载入后从零件量出来
    },
    groups: { met: /^Met boom/ },
    callouts: {
      met: { part: 'Met boom / sensor head', b: '气象桅杆', s: '温度 · 气压 · 风', dx: 80, dy: -60 },
    },
    // 结霜：地面和碎石的颜色往白里靠
    setup(ctx) {
      rockMat = setupPov(ctx);
      groundMat = ctx.ground.material;
      soil = groundMat.color.clone(); rockSoil = rockMat.color.clone();
      frostColor = new ctx.THREE.Color(0xe8e6e0);
    },
    onBeat(ctx, b) { want = b.frost || 0; if (b.cut) frost = want; },
    update(ctx, now, dt) {
      if (!groundMat) return;
      frost += Math.sign(want - frost) * Math.min(Math.abs(want - frost), dt / 1.6);
      groundMat.color.copy(soil).lerp(frostColor, frost * 0.55);
      rockMat.color.copy(rockSoil).lerp(frostColor, frost * 0.45);
    },
  };
}
