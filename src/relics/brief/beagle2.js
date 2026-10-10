/* 猎兔犬 2 号 Beagle 2（R-03）。
   史实依据（2026-09-30 核对）：
   - ESA「Beagle-2 lander found on Mars」（2015-01-16）、NASA/JPL「'Lost' 2003 Mars Lander Found by Mars Reconnaissance Orbiter」：
     2003-12-25 在伊西底斯平原落地成功；HiRISE 图像显示它只部分展开，四片太阳翼里只开了一片、两片、最多三片，
     太阳翼要全部打开才能露出天线，所以一直没有信号。主降落伞和后盖就在旁边。
   - ESA「Beagle 2 lander」：英国牵头（开放大学，首席科学家科林·皮林格），搭欧空局「火星快车」，
     2003-06-02 发射，2003-12-19 与火星快车分离；呼号是 Blur 乐队写的一段曲子，相机校色板是达明·赫斯特的圆点画。
   - 皮林格 2014 年 5 月去世，第二年才找到它。
   - 模型是出发时完整展开的样子（blender/beagle2/README.md），不是火星上只展开一部分的样子；台词照实说。 */
import { photoTask } from './common.js';

export default function beagle2() {
  return {
    id: 'BGL2', model: 'beagle2',
    title: '猎兔犬 2 号着陆器', subtitle: '2003 年出发时完全展开的样子', dims: '展开约 2 m · 高 0.4 m',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '猎兔犬 2 号<small>Beagle 2</small>',
        rows: [['牵头', '英国 · 开放大学'], ['搭乘', '欧空局「火星快车」'], ['发射', '2003 年 6 月 2 日'], ['分离', '2003 年 12 月 19 日']],
        foot: ['<b>目标</b>', '找生命留下的化学痕迹'] },
      { id: 'history', short: '经历', kick: '以往经历', title: '圣诞节那天',
        rows: [['预定落地', '2003 年 12 月 25 日'], ['地点', '伊西底斯平原'], ['结果', '一直没有信号']],
        note: '它准备好的呼号，是英国乐队 Blur 写的一段曲子；相机校色用的，是达明·赫斯特的一幅圆点画。',
        foot: ['<b class="warn">失踪</b>', '11 年'] },
      { id: 'found', short: '找到', kick: '为什么没有声音', title: '落稳了，没打开',
        rows: [['找到', '2015 年 1 月 · 火星勘测轨道器'], ['状态', '落地成功，只展开一部分'], ['太阳翼', '四片只开了一到三片'], ['天线', '被没打开的翼盖住']],
        foot: ['<b>其实</b>', '它落地成功了'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '伊西底斯平原<small>Isidis Planitia</small>',
        rows: [['坐标', '11.53°N 90.43°E'], ['地形', '古老的撞击盆地，很平'], ['旁边', '降落伞和后盖'], ['距着陆场', '约 {km} km']] },
      photoTask('看看它到底打开了几片'),
    ],
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '第三处遗迹个子很小，全打开也就一张圆桌那么大：英国的猎兔犬 2 号。' },
      { sec: 'project', shot: 'brief', pose: 'point', view: 'paw', hl: ['paw'], callouts: ['paw'],
        say: '它搭欧空局的火星快车过去，带着一只装满仪器的机械手，要在土里找生命留下的化学痕迹。' },
      { sec: 'history', shot: 'brief', pose: 'worried', view: 'overview',
        say: '它本该在 2003 年圣诞节落地，然后报一声平安。呼号都准备好了，是 Blur 乐队写的一段曲子。可那天，地面什么也没收到。' },
      { sec: 'history', shot: 'close', pose: 'solemn', view: 'overview',
        say: '所有人都以为它摔坏了。带头的科学家科林·皮林格一直在找它，2014 年去世，没能等到答案。' },
      { sec: 'found', shot: 'wide', pose: 'surprised', view: 'overview', hl: ['petals'], callouts: ['petal'],
        lower: ['2015 年 1 月', '轨道相机找到了它：落地成功，太阳翼没全打开'],
        say: '第二年，轨道上的相机找到了它。它其实落稳了，只是四片太阳翼没全打开。' },
      { sec: 'found', shot: 'brief', pose: 'thinking', view: 'antenna', hl: ['antenna'], callouts: ['antenna'], warn: true,
        say: '天线就在太阳翼底下。翼没打开，天线被盖住了。它喊不出来，我们也叫不醒它。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview',
        say: '它在伊西底斯平原，离我们的着陆场大约 {km} 公里。旁边还躺着它的降落伞。它个子小，找的时候飞低一点。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'overview', action: '接受任务',
        say: '任务：拍一张它现在的样子，看看到底打开了几片太阳翼。先别碰它。' },
    ],
    views: {
      overview: { t: null, az: -30, el: 38, fit: null, fitScale: 0.9, spin: true },
      paw: { part: '^PAW / ', az: 20, el: 32, fitScale: 1.7 },
      antenna: { part: '^Lid antenna', az: -10, el: 48, fitScale: 6 },
    },
    groups: { paw: /^(PAW|ARM) /, petals: /^Solar petal/, antenna: /^Lid antenna/ },
    callouts: {
      paw: { part: 'PAW / instrument bench', b: '仪器手 PAW', s: '显微镜 · 光谱仪 · 取样「鼹鼠」', dx: 80, dy: -70 },
      petal: { part: 'Solar petal 1 / composite substrate', b: '太阳翼', s: '四片 · 火星上只开了一部分', dx: -70, dy: -80 },
      antenna: { part: 'Lid antenna / central aperture', b: '天线', s: '被没打开的翼盖住', dx: 80, dy: -80,
        warn: ctx => !!ctx.current?.warn, s2: '被没打开的翼盖住' },
    },
    hlColor(ctx) { return ctx.current?.warn ? (this.red ??= new ctx.THREE.Color(0xff5f56)) : null; },
  };
}
