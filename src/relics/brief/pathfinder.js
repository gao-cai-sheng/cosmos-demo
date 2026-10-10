/* 火星探路者 + 旅居者（R-06）。
   史实依据（2026-09-30 核对）：
   - NASA Science「Mars Pathfinder」、NASA「July 4, 1997: Sojourner Arrives on the Red Planet」：1996-12-04 发射；
     1997-07-04 裹着气囊落在阿瑞斯谷的洪水冲积滩上，至少弹了 15 次；旅居者只有一只大猫那么大，原计划跑 7 天，实际 83 天；
     1997-09-27 最后一次传回数据，原因不明；共传回着陆器照片 16,500 多张、火星车照片 550 张；着陆器后来改名「卡尔·萨根纪念站」。
   - 旅居者和地球说话要经过着陆器；它的 APXS 仪器贴着石头量成分。名字来自索杰纳·特鲁斯。
   - 旅居者最后的位置：任务照片里最后一次看到时离着陆器约 13 m；2006-12-21 HiRISE 在着陆器正南约 6 m 有一团可能是它的像素
     （NASA Photojournal「Mars Pathfinder Landing Site and Surroundings」）。游戏里也放在这个位置（catalog.js）。
   - 两件模型都是出发时干净展开的样子（blender/pathfinder、blender/sojourner）。 */
import { photoTask } from './common.js';

export default function pathfinder() {
  let rover = null, from = null, to = null, drive = 0, want = 0;
  return {
    id: 'PTHF', model: 'pathfinder',
    extras: [{ model: 'sojourner', position: [0, 0, 0] }],   // 位置在 setup 里按坡道算
    title: '探路者着陆器 + 旅居者', subtitle: '1996 年出发时的样子', dims: '着陆器展开约 2.8 m · 旅居者长 0.66 m',
    sections: [
      { id: 'project', short: '背景', kick: '项目背景', title: '火星探路者<small>Mars Pathfinder</small>',
        rows: [['发射', '1996 年 12 月 4 日'], ['落地', '1997 年 7 月 4 日'], ['着陆', '裹着气囊弹了至少 15 次'], ['同行', '旅居者号火星车']],
        foot: ['<b>口号</b>', '更快、更好、更省'] },
      { id: 'rover', short: '小车', kick: '以往经历', title: '第一辆火星车',
        rows: [['大小', '像一只大猫'], ['原计划', '7 天'], ['实际', '83 天'], ['本事', '贴着石头量成分']],
        note: '名字来自美国废奴和女权运动的先驱索杰纳·特鲁斯（Sojourner Truth）。',
        foot: ['<b>第一</b>', '火星上第一辆会跑的车'] },
      { id: 'end', short: '失联', kick: '为什么停下', title: '同一天没了声音',
        rows: [['最后通信', '1997 年 9 月 27 日'], ['原因', '不明'], ['传回', '照片 17,000 多张']],
        note: '旅居者和地球说话要经过着陆器。着陆器一停，两个都没了声音。',
        foot: ['<b>后来</b>', '改名「卡尔·萨根纪念站」'] },
      { id: 'site', short: '位置', kick: '现在位置', title: '阿瑞斯谷<small>Ares Vallis</small>',
        rows: [['坐标', '19.13°N 33.22°W'], ['地形', '古代洪水冲出来的石滩'], ['旅居者', '可能在着陆器正南约 6 m'], ['距着陆场', '约 {km} km']] },
      photoTask('把着陆器和旅居者都拍下来'),
    ],
    beats: [
      { sec: 'project', shot: 'brief', pose: 'stand', view: 'overview',
        say: '最后一处遗迹是一对：探路者着陆器，和它带来的小车旅居者。' },
      { sec: 'project', shot: 'brief', pose: 'surprised', view: 'airbag', hl: ['airbag'], callouts: ['airbag'],
        say: '1997 年 7 月 4 日，它裹着一身气囊砸到火星上，弹了至少十五次才停下来。' },
      { sec: 'rover', shot: 'wide', pose: 'moved', view: 'rover', drive: 1, hl: ['rover'], callouts: ['rover'],
        lower: ['1997 年 7 月', '旅居者顺着坡道开下来'],
        say: '然后外壳像花瓣一样打开，旅居者顺着坡道开下来。它是火星上第一辆会跑的车，只有一只大猫那么大。' },
      { sec: 'rover', shot: 'brief', pose: 'approve', view: 'apxs', drive: 1, hl: ['apxs'], callouts: ['apxs'],
        say: '它原计划只跑七天，结果跑了八十三天，把附近的石头一块块凑上去，量出它们是什么做的。' },
      { sec: 'end', shot: 'close', pose: 'solemn', view: 'overview', drive: 1,
        say: '1997 年 9 月 27 日，着陆器最后一次发回信号。旅居者要通过它才能跟地球说话，从那天起，两个都没了声音。' },
      { sec: 'end', shot: 'brief', pose: 'thinking', view: 'overview', drive: 1,
        say: '最后一次看见旅居者，它离着陆器十三米左右。失联以后，它可能还按程序自己开了一阵。2006 年的轨道照片里，着陆器正南六米有一团影子，可能就是它。' },
      { sec: 'site', shot: 'map', pose: 'point', view: 'overview', drive: 1,
        say: '它们在阿瑞斯谷，一片古代洪水冲出来的石滩，离我们的着陆场大约 {km} 公里。' },
      { sec: 'task', shot: 'brief', pose: 'walk', view: 'overview', drive: 1, action: '接受任务',
        say: '任务：把着陆器和旅居者都拍下来。拍到一个就算完成，两个都拍到更好。先别碰它们。' },
    ],
    views: {
      overview: { t: null, az: -35, el: 26, fit: null, fitScale: 0.95, spin: true },
      airbag: { part: '^Retracted airbag', az: -20, el: 22, fitScale: 1.1 },
      rover: { part: '^Rover ramp / egress \\+X', az: 60, el: 24, fitScale: 2.6 },
      apxs: { part: '^APXS', az: 40, el: 22, fitScale: 7 },
    },
    groups: { airbag: /^Retracted airbag/, rover: /^(Warm electronics box|Solar deck|Solar grid)/, apxs: /^APXS/ },
    callouts: {
      airbag: { part: 'Retracted airbag / bundle 01', b: '收起的气囊', s: '落地时整个包在里面', dx: -70, dy: -80 },
      rover: { part: 'Solar deck / cell field', b: '旅居者', s: '长 0.66 m · 10.6 kg', dx: 80, dy: -80 },
      apxs: { part: 'APXS / sensing face', b: 'APXS 光谱仪', s: '贴着石头量成分', dx: 80, dy: -60 },
    },
    // 旅居者：一开始停在花瓣上的车架里，讲到它的时候顺着 +X 那条坡道开到地上。
    setup(ctx) {
      const { THREE, parts } = ctx;
      rover = parts.get('sojourner');
      const box = re => { const b = new THREE.Box3(); for (const [n, o] of parts) if (re.test(n)) b.expandByObject(o); return b; };
      const mount = box(/^Rover mount/), ramp = box(/^Rover ramp \/ egress \+X/);
      const m = mount.getCenter(new THREE.Vector3()), r = ramp.getCenter(new THREE.Vector3());
      const dir = new THREE.Vector3(r.x - m.x, 0, r.z - m.z).normalize();
      const half = ramp.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(dir.x), 0, Math.abs(dir.z))) / 2;
      from = new THREE.Vector3(m.x, mount.max.y, m.z);
      to = new THREE.Vector3(r.x, 0, r.z).addScaledVector(dir, half + 0.5);
      rover.rotation.y = Math.atan2(dir.x, dir.z);
      // 光谱仪那句的机位要对准开下来以后的小车：先放到终点量一下，再放回车架
      rover.position.copy(to); ctx.model.updateMatrixWorld(true);
      const apxs = box(/^APXS/), sp = apxs.getBoundingSphere(new THREE.Sphere());
      Object.assign(ctx.VIEWS.apxs, { t: sp.center.toArray(), fit: sp.radius * 7 });
      rover.position.copy(from);
    },
    onBeat(ctx, b) { want = b.drive || 0; if (b.cut) drive = want; },
    update(ctx, now, dt) {
      if (!rover) return;
      drive += Math.sign(want - drive) * Math.min(Math.abs(want - drive), dt / 3.2);
      const e = drive < 0.5 ? 2 * drive * drive : 1 - Math.pow(-2 * drive + 2, 2) / 2;
      rover.position.lerpVectors(from, to, e);
    },
  };
}
