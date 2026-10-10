/* 机智号 Ingenuity（R-04）。
   史实依据（2026-09-30 核对）：
   - NASA「After Three Years on Mars, NASA's Ingenuity Helicopter Mission Ends」（2024-01-25）：原设计 30 天内试飞 5 次，
     实际飞了 72 次、近三年；最后一次是 2024-01-18，降落时一片或多片桨叶受损。任务延长期近 1,000 个火星日，用过 48 个起降点。
   - NASA「NASA Performs First Aircraft Accident Investigation on Another World」（2024-12）：最后一飞时地面是平整的沙，
     导航相机找不到足够的参照，硬着陆在沙坡上，四片桨叶都在离尖约三分之一处折断；飞行时间合计两个多小时；
     之后它「still beams weather and avionics test data to the Perseverance rover about once a week」。
   - NASA/JPL 机智号新闻资料：挂在毅力号肚子下，2021-02-18 落进耶泽罗坑；重约 1.8 kg，两副共轴反转旋翼直径约 1.2 m；
     2021-04-19 第一次飞，离地约 3 m、39 秒；太阳能板下面系着一小片莱特兄弟 1903 年飞机机翼上的布。
   - 最后停在瓦利诺丘（NASA/JPL PIA26237），坐标用航线图 RELICS 里的近似值。 */
import { photoTask } from './common.js';

export default function ingenuity() {
  let upper = null, lower = null, spin = 0, lift = 0, base = 0;
  return {
    id: 'INGN', model: 'ingenuity',
    title: '机智号直升机', subtitle: '2021 年出发时的样子', dims: '旋翼直径 1.2 m · 高 0.49 m · 1.8 kg',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '机智号<small>Ingenuity</small>',
        rows: [['搭乘', '毅力号火星车（挂在肚子底下）'], ['落地', '2021 年 2 月 18 日'], ['重量', '1.8 kg'], ['旋翼', '两副 · 直径 1.2 m']],
        foot: ['<b>目标</b>', '试试火星上能不能飞'] },
      { id: 'history', short: '经历', kick: '以往经历', title: '说好五次，飞了七十二次',
        rows: [['第一次', '2021 年 4 月 19 日 · 39 秒'], ['原计划', '30 天 · 5 次'], ['实际', '近三年 · 72 次'], ['起降点', '48 个']],
        note: '太阳能板底下系着一小片布，剪自莱特兄弟 1903 年那架飞机的机翼。',
        foot: ['<b>总共</b>', '飞了两个多小时'] },
      { id: 'end', short: '停下', kick: '为什么停下', title: '最后一次降落',
        rows: [['时间', '2024 年 1 月 18 日 · 第 72 次'], ['原因', '沙面太平，导航找不到参照'], ['结果', '硬着陆，四片桨叶全断']],
        foot: ['<b>之后</b>', '还每周给毅力号发天气数据'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '耶泽罗坑<small>Jezero · 瓦利诺丘</small>',
        rows: [['坐标', '约 18.47°N 77.40°E'], ['地形', '撞击坑里的沙丘'], ['注意', '坑里起伏大，可能落不下'], ['距着陆场', '约 {km} km']] },
      photoTask('找到它，拍清断掉的桨叶'),
    ],
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '第四处遗迹是一架直升机。对，火星上的直升机：机智号。' },
      { sec: 'project', shot: 'brief', pose: 'point', view: 'overview',
        say: '它挂在毅力号火星车的肚子底下，2021 年 2 月落进耶泽罗坑。整架只有一点八公斤。' },
      { sec: 'history', shot: 'wide', pose: 'moved', view: 'fly', hover: true, hl: ['rotors'], callouts: ['rotor'],
        lower: ['2021 年 4 月 19 日', '第一次在另一颗行星上飞起来'],
        say: '2021 年 4 月 19 日，它飞起来了：离地三米，飞了 39 秒。人类第一次在另一颗行星上，有动力、可控地飞行。' },
      { sec: 'history', shot: 'brief', pose: 'approve', view: 'overview', hover: true,
        say: '原计划只试飞五次。结果它飞了七十二次，换了四十八个起降点，一飞就是快三年。' },
      { sec: 'end', shot: 'wide', pose: 'worried', view: 'rotors', hl: ['rotors'], callouts: ['blade'], warn: true,
        lower: ['2024 年 1 月 18 日 · 第 72 次', '硬着陆 · 四片桨叶全断'],
        say: '第七十二次飞行，脚下的沙地太平整，导航找不到参照。它重重落在一道沙坡上，四片桨叶都断了。' },
      { sec: 'end', shot: 'close', pose: 'reassure', view: 'overview',
        say: '可它没关机。停飞以后，它还每周给毅力号发一次天气数据。它现在还记不记，没人知道。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview',
        say: '它在耶泽罗坑的沙丘里，离我们的着陆场大约 {km} 公里。坑里起伏大，可能落不下，那就在天上拍。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'rotors', hl: ['rotors'], action: '接受任务',
        say: '任务：拍一张它现在的样子，看得清桨叶就行。它是几处里个子最小的，得靠近些。先别碰它。' },
    ],
    views: {
      overview: { t: null, az: -35, el: 20, fit: null, fitScale: 1.05, spin: true },
      fly: { t: null, az: 20, el: 8, fit: null, fitScale: 1.5 },
      rotors: { part: '^Rotor upper', az: 30, el: 42, fitScale: 1.15 },
    },
    groups: { rotors: /^Rotor (upper|lower) \/ blade/ },
    callouts: {
      rotor: { part: 'Rotor upper / blade 1', b: '共轴反转旋翼', s: '上下两副 · 每分钟约 2,400 转', dx: 80, dy: -70 },
      blade: { part: 'Rotor upper / blade 1', b: '桨叶', s: '四片都在三分之一处折断', dx: 80, dy: -70,
        warn: ctx => !!ctx.current?.warn, s2: '四片都在三分之一处折断' },
    },
    // 两副旋翼各挂在桅杆轴上一个支点下，反向转；飞起来时整架抬高。
    setup(ctx) {
      const { THREE, parts, model } = ctx;
      const mast = ctx.centerOf('Mast / main shaft');
      const pivot = name => {
        const p = new THREE.Group(); p.position.set(mast.x, 0, mast.z); model.add(p); model.updateMatrixWorld(true);
        for (const [n, o] of parts) if (n.startsWith(name + ' / ')) p.attach(o);
        return p;
      };
      upper = pivot('Rotor upper'); lower = pivot('Rotor lower');
      base = model.position.y;
    },
    update(ctx, now, dt) {
      if (!upper) return;
      const b = ctx.current, flying = !!b?.hover;
      spin += ((flying ? 1 : 0) - spin) * Math.min(1, dt * 1.6);
      upper.rotation.y += spin * dt * 38; lower.rotation.y -= spin * dt * 38;
      lift += ((flying && spin > 0.6 ? 1 : 0) - lift) * Math.min(1, dt * 0.9);
      ctx.model.position.y = base + lift * 0.35;
    },
    hlColor(ctx) { return ctx.current?.warn ? (this.red ??= new ctx.THREE.Color(0xff5f56)) : null; },
  };
}
