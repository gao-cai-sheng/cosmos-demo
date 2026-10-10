// 前哨仓舱内工位的面板内容和两段小逻辑（宇航服自检、气闸过场走到第几步）。
// 这里没有 DOM，可以直接拿 node --test 跑；画出来的那一半在 outpost-station-ui.js。
//
// 来历（D73）：前哨仓的工位以前点了只弹一行字，气闸循环只在 HUD 角上有一行小字；而先遣生存
// （?survival=1，src/survival/arrival.js）那套应急舱界面是完整的：对话面板、清单、四项宇航服
// 自检、气闸过场。把那一套的面板和交互搬过来，接到前哨仓的工位上。
// 不搬的：物资数（储备、补给投放、货箱核对）。前哨仓这条线还没有物资结算（D54），
// 面板里只写舱里真有的东西，没接通的照实写「尚未接入」。
import {SUIT} from '../survival/state.js';

export {SUIT};
/** 自检每一项要走多久（秒），和生存舱一样。 */
export const SUIT_STEP = .55;

/** 各工位的面板。title 是一句话，rows 是清单，fine 是小字说明，selfTest 表示这块面板带宇航服自检。
 * 化验台（lab）不在这里：它挂的是整套 ARES-GEOCHEM 化验台。 */
const PANELS = Object.freeze({
  bunk:  {title:'四个铺位，两上两下。',
          rows:[['铺位','4 个'],['排布','两上两下 · 中间一把共用梯'],['作息与生命消耗','尚未接入']],
          fine:'暂时只能在长桌边坐下休息。'},
  galley:{title:'长桌，吃饭和干活都在这。',
          rows:[['座位','软包长椅 3 位 + 活动椅 2 把'],['食品加热与配餐','尚未结算'],['餐食','仍算在随船总清单里']],
          fine:'走到桌边可以坐下休息，按 F 起身。'},
  garden:{title:'育苗架，六盆叶菜。',
          rows:[['育苗盆','6 盆 · 三层'],['生长灯','常亮'],['栽培、产出和水循环','后续的农业基地阶段']],
          fine:'现在只是摆在这里，还不能收菜。'},
  comms: {title:'通信台，对准轨道中继。',
          rows:[['中继链路','已对准'],['屏幕','乘组状态 · ARES 上行 · 地表气象'],['事件日志','按 J 打开']],
          fine:'任务简报和遗迹档案接通时，这里会直接打开它们。'},
  suits: {title:'出舱前，检查自己。',
          lead:'三套舱外服在架。检查服体密封、供氧、电源与空气处理。',
          rows:[['舱外服','3 套在架'],['出舱','从气闸走']],
          fine:'这是出舱准备检查；服装损耗与消耗品尚未模拟，不通过也能出舱。',
          selfTest:true},
  cores: {title:'岩芯样品柜。',
          rows:[['柜格','4 层'],['岩芯','预置样品 28 支'],['取样入库','等勘测采样接通']],
          fine:'目前展示的是预置岩芯。'},
});

/** 取某个工位的面板；没有就返回 null（比如化验台）。 */
export function stationPanel(id){
  const p=PANELS[id];
  return p?{code:'OUTPOST / '+id.toUpperCase(),lead:'',...p}:null;
}
export const PANEL_IDS = Object.freeze(Object.keys(PANELS));

/** 宇航服自检：passed 是已通过的项，running 表示正在逐项走。 */
export const freshSuitCheck = (passed=[]) => ({passed:SUIT.map(s=>s[0]).filter(id=>passed.includes(id)),running:false,elapsed:0});
export const suitReady = s => s.passed.length===SUIT.length;
/** 开始（或重新开始）自检：从头逐项走。 */
export const startSuitCheck = () => ({passed:[],running:true,elapsed:0});
/** 往前走 dt 秒。每 SUIT_STEP 通过一项，四项走完自己停。时间由宿主给，后台挂起不会偷跑。 */
export function advanceSuitCheck(s,dt){
  if(!s.running)return s;
  let elapsed=s.elapsed+Math.max(0,dt),passed=s.passed;
  while(elapsed>=SUIT_STEP&&passed.length<SUIT.length){elapsed-=SUIT_STEP;passed=[...passed,SUIT[passed.length][0]];}
  const done=passed.length===SUIT.length;
  return {passed,running:!done,elapsed:done?0:elapsed};
}

/** 气闸过场走到第几步：0 进气闸、1 双门锁闭调压、2 出气闸。progress 是 refuge.progress（0~1，全程 7.2 秒）。
 * 分界和 refuge-cycle.js 的时间表对齐：2.6 秒关上入口，4.6 秒开出口。 */
export const CYCLE_STEPS = Object.freeze(['进气闸','关门调压','出气闸']);
export function cycleStep(progress){
  const t=Math.max(0,Math.min(1,progress))*7.2;
  return t<2.6?0:t<4.6?1:2;
}
