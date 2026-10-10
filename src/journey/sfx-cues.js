// 音效清单（D78）：游戏里每个会响的名字 → 用哪个文件、多大声、走哪条总线。
// 文件在 assets/sfx/，来源和许可见 assets/sfx/CREDITS.md，由 scripts/build-sfx.py 从公开音效库剪出来。
//
// bus：
//   'ui'    任务卡、按钮、警号、无线电——电子声，头盔里直接听到，不过滤。
//   'world' 机械和环境声——人在舱外时隔着头盔和稀薄大气，闷一层（sfx.muffle）。
// files：同一个名字有几个文件就每次随机挑一个（脚步）。jitter：每次播放音高随机偏多少。
// loop：循环音的周期（秒）。rate：默认播放速度。node：这个声音用在游戏的哪个节点（试听页 tools/sfx-lab.html 照它分组）。

export const CUES = {
  // —— 艾琳任务卡 ——
  'card-new':      { gain: .55, bus: 'ui', node: '任务卡', note: '新任务卡出现' },
  'card-done':     { gain: .6,  bus: 'ui', node: '任务卡', note: '任务卡完成打勾' },
  'card-nudge':    { gain: .4,  bus: 'ui', node: '任务卡', note: '一分钟没动静，提醒一下' },
  'brief-next':    { gain: .6,  bus: 'ui', node: '任务卡', note: '大卡 / 遗迹简报「继续」翻句' },
  'accept':        { gain: .6,  bus: 'ui', node: '任务卡', note: '点「接受任务」' },

  // —— 界面 ——
  'ui-click':      { gain: .5,  bus: 'ui', node: '界面', note: '按任何按钮' },
  'ui-open':       { gain: .5,  bus: 'ui', node: '界面', note: '打开地图、工位面板、大卡' },
  'ui-close':      { gain: .5,  bus: 'ui', node: '界面', note: '关上地图、面板' },
  'ui-deny':       { gain: .5,  bus: 'ui', node: '界面', note: '操作被拒绝（「请先……」）' },

  // —— 警号 ——
  'alarm-door':    { gain: .32, bus: 'ui', node: '飞船 NX07', note: '舱门没关就想起飞 / 登船 / 召唤' },

  // —— 遗迹拍照 ——
  'photo-shutter': { gain: .7,  bus: 'ui', node: '遗迹拍照', note: '按 K 快门' },
  'photo-ok':      { gain: .5,  bus: 'ui', node: '遗迹拍照', note: '拍到了' },
  'photo-miss':    { gain: .5,  bus: 'ui', node: '遗迹拍照', note: '没拍清' },

  // —— 无线电 / 遥控 ——
  'link-on':       { gain: .3,  bus: 'ui', node: '探测车 MU-7', note: '遥控连接；降落时链路握手' },
  'link-off':      { gain: .45, bus: 'ui', node: '探测车 MU-7', note: '结束遥控' },

  // —— 舱门、气闸 ——
  'door-open':     { gain: .6,  bus: 'world', node: '舱门与气闸', note: '气闸门、飞船舱口打开' },
  'door-close':    { gain: .6,  bus: 'world', node: '舱门与气闸', note: '气闸门关上；登船' },
  'airlock-hiss':  { gain: .5,  bus: 'world', node: '舱门与气闸', note: '气闸增压 / 减压' },
  'latch':         { gain: .5,  bus: 'world', node: '舱门与气闸', note: '门锁扣上；舱口关妥；起落架锁定' },

  // —— 触地 ——
  'thud-heavy':    { gain: .9,  bus: 'world', node: '飞船 NX07', note: 'NX07 触地' },
  'thud-pod':      { gain: .7,  bus: 'world', node: '飞船 NX07', note: '先遣舱触地' },
  'thud-soft':     { gain: .55, bus: 'world', node: '步行', note: '跳起落地；上下 ARES' },

  // —— 脚步 ——
  'step-regolith': { files: ['step-regolith-1', 'step-regolith-2', 'step-regolith-3', 'step-regolith-4'], gain: .5, jitter: .08, bus: 'world', node: '步行', note: '舱外走路（踩风化层）' },
  'step-deck':     { files: ['step-deck-1', 'step-deck-2', 'step-deck-3', 'step-deck-4'], gain: .4, jitter: .08, bus: 'world', node: '步行', note: '舱内走路（踩地板）' },

  // —— 循环音 ——
  'engine-main':   { loop: 4, gain: .55, bus: 'world', node: '飞船 NX07', note: '主发动机低鸣，离地就有' },
  'engine-thrust': { loop: 4, gain: .7,  bus: 'world', node: '飞船 NX07', note: '推力喷流，起飞和降落时最响' },
  'pod-thrust':    { loop: 4, gain: .5,  bus: 'world', node: '飞船 NX07', note: '开场先遣舱下降的喷流' },
  'servo':         { loop: 4, gain: .22, bus: 'world', node: '飞船 NX07', note: '起落架、舱门、升降平台在动' },
  'motor':         { loop: 4, gain: .4,  bus: 'world', node: '运输车 ARES', note: 'ARES / MU-7 电机，越快音调越高' },
  'hab-air':       { loop: 4, gain: .16, bus: 'world', node: '环境', note: '生活舱里的通风声' },
  'scan':          { loop: 4, gain: .14, bus: 'ui',    node: '探测车 MU-7', note: '按住 E 勘测' },
  'mars-wind':     { loop: 26, gain: .4,  rate: 1.8, bus: 'world', node: '环境', note: '舱外的风（毅力号真实录音，加快 1.8 倍）' },
};

/** 循环音从文件的第几秒开始循环（scripts/build-sfx.py 在前后各垫了 0.24 秒）。 */
export const LOOP_START = .12;

/** 一个提示音会用到的所有文件名（不带扩展名）。 */
export const cueFiles = name => CUES[name]?.files || (CUES[name] ? [name] : []);
