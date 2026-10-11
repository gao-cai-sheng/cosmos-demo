import {SOLAR_RESEARCH_DECK,SOLAR_RESEARCH_ACTIONS} from './solar-research-deck.js';
import {POWER_RESEARCH_DECK,POWER_RESEARCH_ACTIONS} from './power-research-deck.js';
import {ASSAY_DECK,ASSAY_ACTIONS} from './assay-deck.js';
import {RESEARCH_DECK,RESEARCH_ACTIONS} from './research-deck.js';
import {NURSERY_DECK,NURSERY_ACTIONS} from './nursery-deck.js';
import {WATER_DECK,WATER_ACTIONS} from './water-deck.js';
// 艾琳任务卡的内容（D70，设计 docs/superpowers/specs/2026-10-01-erin-task-cards-design.md 第 3 节）。
// 纯数据 + 纯判断：w 是 src/cards/world.js 拍的世界快照。这里不碰 three、不碰 DOM，node 测试直接跑。
import { TASK_ORDER } from '../relics/order.js';
import { near, stopped } from './needs.js';
const onFoot = w => w.mode === 'walk' && !w.inHome;
const surveyed = id => w => w.survey.done.includes(id);
/** 人在家里时先指门口，出了门再指真正的目标。 */
const viaDoor = pick => w => (w.inHome ? w.door : pick(w));
/** 能不能现在连上遥控小车：在家门外步行，或坐在停稳的大车里。 */
const canConnect = w => onFoot(w) || (w.mode === 'carrier' && stopped(w));
/** 勘测卡要靠遥控小车。刷新页面或结束了遥控以后游戏回到步行，所以这几张卡也带「遥控小车」按钮，连着的时候才收起来。 */
const reconnect = { label: '遥控小车', run: 'remoteRover', ready: canConnect, visible: w => w.mode !== 'remote' };
/** 勘测卡的光柱：连着小车才立在信标上；没连上时在家里指向门口，其余时候不指（够不到的地方不指）。 */
const surveyTarget = id => w => (w.mode === 'remote' ? w.survey.points[id] || null : w.inHome ? w.door : null);

/** 卡上的按钮能做的事，名字对应 src/cards/mount.js 里的 ACTIONS。 */
export const ACTION_NAMES = Object.freeze(['unloadShip', 'unloadRover', 'remoteRover', 'endRemote','releasePower','selectPower','installPower','expandSolar','connectSolar','connectBus','commissionPower','eatMeal','sleepNight','readAnalysis','archiveSample', 'driveToRelic', 'flyToRelic', 'goHome', 'openBrief',...WATER_ACTIONS,...NURSERY_ACTIONS,...RESEARCH_ACTIONS,...ASSAY_ACTIONS,...POWER_RESEARCH_ACTIONS,...SOLAR_RESEARCH_ACTIONS]);

/* 一张卡：
   id      存档里记的名字，定了就别改
   title   小卡最多 5 个字
   icon    src/cards/icons.js 里的图
   keys    画成键帽的键（照游戏现状，键位统一以前不在这里改）
   say     艾琳说的那一句：出声，也当字幕
   pose    艾琳的立绘（assets/erin，名字见 src/relics/brief/poses.js）
   target  w → {x,z}：光柱立在哪；返回 null 就不立
   done    w → 真假：世界里真的发生了才算
   event   有这一项的卡不看 done，等 director.signal(event)
   action  { label, run, ready, visible }：卡上的按钮；visible 不写就一直显示
   big     大卡：lines 一句一句讲完，点「接受任务」发 accept */
// —— 第五、七章 · 六处遗迹（D76）——
/** 卡上的名字（最多 5 个字）和「认出它」的那一句。说法都出自 src/relics/brief/ 里现有的简报。 */
export const RELIC_CARDS = Object.freeze({
  INSG: { name: '洞察号', look: '看，那两片圆圆的就是它的太阳翼。' },
  VKG2: { name: '海盗2号', look: '看，三条腿、顶上一口大锅的就是它。' },
  BGL2: { name: '猎兔犬', look: '它很小，像一张打开的小圆桌。' },
  INGN: { name: '机智号', look: '它最小，是一架小直升机。找它的桨叶。' },
  VKG1: { name: '海盗1号', look: '它和海盗2号是双胞胎，长得一样。' },
  PTHF: { name: '探路者', look: '花瓣一样打开的是探路者，旁边的小车叫旅居者。' },
});
const relicPic = id => `relics/cards/${id}.png`;
/** 多近算「到了」（米，调试值）。实测飞船落在离遗迹 125–150 m；路线停在遗迹旁 15 m；机腹相机够 400 m。 */
const ARRIVE = Object.freeze({ car: 60, foot: 60, landed: 600, hover: 400 });
/** 多近算「到家了」（米）。停机坪离前哨仓 151 m。 */
const HOME = Object.freeze({ car: 60, ship: 400 });
const idle = w => !w.enRoute;
const relicAt = id => w => w.relics?.at?.[id] || null;
const shot = id => w => !!w.relics?.done?.[id];
/** 这一处之后的遗迹已经接了或拍了：这一处的卡全算做完（老存档，或不照卡走的大人）。 */
const movedOn = id => w => TASK_ORDER.slice(TASK_ORDER.indexOf(id) + 1).some(n => w.relics?.active === n || !!w.relics?.done?.[n]);
const arrived = id => w => {
  const at = w.relics?.at?.[id];
  if (shot(id)(w) || movedOn(id)(w)) return true;
  if (!at) return false;
  if (w.mode === 'carrier') return stopped(w) && near(w.carrier, at, ARRIVE.car);
  if (w.mode === 'flight') return (w.shipGrounded && near(w.ship, at, ARRIVE.landed)) || (w.shipHover && near(w.ship, at, ARRIVE.hover));
  return w.mode === 'walk' && near(w.player, at, ARRIVE.foot);
};
// 人站在家门外也算（拍完以后刷新过页面：人回到了家，不用再「回」一次）。
const atHome = w => w.homeScene && (w.inHome
  || (w.mode === 'carrier' && stopped(w) && near(w.carrier, w.door, HOME.car))
  || (w.mode === 'flight' && w.shipGrounded && near(w.ship, w.door, HOME.ship))
  || (w.mode === 'walk' && near(w.player, w.door, HOME.ship)));
/** 大车在身边：人在车里，或车在 300 米内。 */
const carAtHand = w => w.mode === 'carrier' || near(w.carrier, w.player, 300);
/** 回家坐什么：人在哪个上面就用哪个。在地上时先看飞船（600 米内就坐飞船回，不然它被留在这儿，下一处上不了船），再看大车。 */
const rideHome = w => (!w.homeScene ? 'ship' : w.mode === 'carrier' ? 'car' : w.mode === 'flight' ? 'ship'
  : near(w.ship, w.player, 600) ? 'ship' : carAtHand(w) ? 'car' : 'ship');

const briefCard = (id, cardId) => ({ id: cardId, required: true, relic: id, title: RELIC_CARDS[id].name, pic: relicPic(id), icon: 'antenna', keys: [], pose: 'welcome',
  say: '有新任务。按一下，听我说。', auto: true,
  action: { label: '听艾琳说', run: 'openBrief', params: { id }, ready: w => w.homeScene && idle(w) && (w.mode !== 'flight' || w.shipGrounded) },
  target: () => null, done: w => w.relics?.active === id || shot(id)(w) || movedOn(id)(w) });
const flyCard = (id, cardId) => ({ id: cardId, required: true, relic: id, title: '飞过去', pic: relicPic(id), icon: 'ship', keys: [], pose: 'pointing-tablet',
  say: '飞船送我们远行，也能给大车充电。断开供电，坐稳再起飞。', want: () => 'ship',
  action: { label: '起飞', icon: 'ship', run: 'flyToRelic', ready: w => idle(w) && w.mode === 'flight', visible: idle },
  target: viaDoor(relicAt(id)), done: arrived(id) });
const photoCard = (id, cardId) => ({ id: cardId, required: true, relic: id, photo: true, title: '拍照', pic: relicPic(id), icon: 'camera', keys: ['K'], pose: 'pointing-tablet',
  say: w => RELIC_CARDS[id].look + (w.mode === 'flight' && !w.shipGrounded ? '按 K 拍一张。' : '走近，按 K 拍一张。'),
  want: () => 'foot', goal: relicAt(id), target: viaDoor(relicAt(id)), recordAhead:true,done: w => shot(id)(w) || movedOn(id)(w) });
const homeCard = (id, cardId) => ({ id: cardId, required: true, relic: id, title: '回家', icon: 'home', keys: [], pose: 'approve',
  say: '拍得真好。回家吧。', want: rideHome,
  action: { label: '回家', icon: 'home', run: 'goHome', ready: w => idle(w) && (w.mode === 'carrier' || w.mode === 'flight'), visible: idle },
  target: w => (w.homeScene ? w.door : null), done: w => atHome(w) || movedOn(id)(w) });

export const DECK = Object.freeze([
  // —— 第一章 · 下船 ——
  { id: '1-1', title: '走两步', icon: 'steps', keys: ['W', 'A', 'S', 'D'], pose: 'welcome',
    say: '到了！先走两步，走到光圈里。',
    target: w => w.spots.firstStep, done: w => onFoot(w) && near(w.player, w.spots.firstStep, 3) },
  { id: '1-2', title: '放下大车', icon: 'truck', keys: [], pose: 'pointing-tablet',
    say: '大车在飞船肚子里。它运货，小车勘探。按一下，把大车放下来。',
    action: { label: '放下大车', run: 'unloadShip', ready: onFoot },
    target: w => w.ship, done: w => w.delivered },
  { id: '1-3', title: '上车', icon: 'truck', keys: ['F'], pose: 'walking-pointing',
    say: '大车靠电池行驶。回船或营地能充电。走到车旁边，按 F 上车。',
    target: w => w.carrier, done: w => w.mode === 'carrier' },
  { id: '1-4', title: '开回家', icon: 'home', keys: ['W', 'A', 'S', 'D', '空格'], pose: 'pointing-tablet',
    say: '把大车停在正门坡道外的光圈附近，按空格停稳；再下车走进家。',
    target: w => w.spots.homePark,
    done: w => w.mode === 'carrier' && near(w.carrier, w.spots.homePark, 10) && stopped(w) },
  { id: '1-5', title: '进家', icon: 'home', keys: ['F'], pose: 'walking-pointing',
    say: '下车，走上坡，在门口按 F。',
    target: w => w.door, done: w => w.inHome },
  { id: '1-6', title: '报到', icon: 'antenna', keys: ['F'], pose: 'reassure',
    say: '里面可以摘头盔了。到通信台来找我。',
    target: w => (w.inHome ? w.spots.comms : w.door), event: 'comms' },

  // —— 第二章 · 小车出门 ——
  { id: '2-1', big: true, title: '小车是你的眼睛', icon: 'rover', event: 'accept',
    lines: [
      { pose: 'welcome', say: '报到成功。欢迎回家，{playerName}指挥官。你负责指挥和地质勘探。' },
      { pose: 'pointing-tablet', say: '阿玛拉负责电力，伊莎是医生，村田航负责植物。他们三人还在火星轨道待命。' },
      { pose: 'pointing-tablet', say: '小车 MU-7 是你的眼睛。它现在在大车的货舱里。' },
      { pose: 'thinking', say: '让它去看三个地方：地结不结实，太阳好不好，信号通不通。' },
      { pose: 'walking-pointing', say: '三个地方各有一座发光的信标。开到旁边，停稳，按住 E。' },
    ] },
  // 接受任务时人还在家里。先把人送出气闸再放小车：不然下一张「放出小车」写着走到大车去，人不知道要先出门（2026-10-02 实玩）。
  // id 夹在 2-1 和 2-2 之间新插的，别的卡的 id 不动；老存档里已经过了这里的人由 director 自动补记，不会被拉回来。
  { id: '2-1b', title: '出舱', icon: 'home', keys: ['F'], pose: 'walking-pointing',
    say: '先出门。走到气闸门前，按 F。',
    target: w => (w.inHome ? w.door : null), done: w => !w.inHome },
  { id: '2-2', title: '放出小车', icon: 'rover', keys: [], pose: 'pointing-tablet',
    say: '走到大车后面，把小车放下来。',
    action: { label: '放出小车', run: 'unloadRover',
      ready: w => stopped(w) && (w.mode === 'carrier' || (onFoot(w) && near(w.player, w.carrier, 10))) },
    target: viaDoor(w => w.carrier), done: w => w.roverOut },
  // F 在大车旁边会先上大车（mobility.js 的 F 键优先级），所以这张用卡上的按钮。
  { id: '2-3', title: '遥控小车', icon: 'rover', keys: [], pose: 'approve',
    say: '按一下，你就能遥控它了。',
    action: { label: '遥控小车', run: 'remoteRover', ready: canConnect },
    target: viaDoor(() => null), done: w => w.mode === 'remote' },
  { id: '2-4', title: '测地面', icon: 'beacon', keys: ['按住 E'], pose: 'pointing-tablet',
    say: '开到信标旁边，停稳，按住 E。',
    action: reconnect, target: surveyTarget('soil'), done: surveyed('soil') },
  { id: '2-5', title: '测太阳', icon: 'beacon', keys: ['按住 E'], pose: 'pointing-tablet',
    say: '下一个：看看哪里太阳最好。',
    action: reconnect, target: surveyTarget('power'), done: surveyed('power') },
  { id: '2-6', title: '测信号', icon: 'beacon', keys: ['按住 E'], pose: 'pointing-tablet',
    say: '最后一个：试试信号。',
    action: reconnect, target: surveyTarget('comms'), done: surveyed('comms') },
  { id: '2-7', title: '收工', icon: 'steps', keys: [], pose: 'approve',
    say: '干得好。让小车歇着，你回来。',
    action: { label: '收工', run: 'endRemote', ready: w => w.mode === 'remote' },
    target: () => null, done: w => w.mode === 'walk' },
  // —— 第三章 · 第一路电 / 第四章 · 第一夜 ——
  {id:'3-1',required:true,big:true,title:'家里要有电',icon:'power',event:'accept',lines:[
    {pose:'thinking',say:'勘测完成了。家里带来的电池会用完。电力工程师阿玛拉还在轨道，先由你把这套电源接好。'},
    {pose:'pointing-tablet',say:'太阳能板在飞船的三号舱口。我们把它放下来，接好两根线。'},
    {pose:'reassure',say:'白天把电存进电池，晚上才能继续供电。'}]},
  {id:'3-2',required:true,requiresHome:true,title:'放下板子',icon:'power',keys:[],pose:'pointing-tablet',say:'到三号平台外侧标记旁。放下平台，落地后靠近3米再按一次。',
    action:{label:'放下能源设备',run:'releasePower',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.tray||null),recordAhead:true,done:w=>!!w.survival?.power?.released},
  {id:'3-3',required:true,title:'挑个地方',icon:'beacon',keys:['F'],pose:'walking-pointing',say:'走到光圈里，按 F 确认这块地。',
    action:{label:'确认选址',run:'selectPower',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.site),recordAhead:true,done:w=>!!w.survival?.power?.site},
  {id:'3-4',required:true,title:'安装设备',icon:'power',keys:['F'],pose:'pointing-tablet',say:'站在光圈里，按 F，装好支架、电池和配电箱。',
    action:{label:'安装设备',run:'installPower',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.site),recordAhead:true,done:w=>!!w.survival?.power?.installed},
  {id:'3-4b',required:true,title:'打开板子',icon:'power',liveSay:true,keys:['F'],pose:'pointing-tablet',say:w=>w.survival?.power?.solar?.job?`太阳能板展开 ${Math.floor(w.survival.power.solar.job.elapsed/6*100)}%，留在操作点等完成。`:'到板子旁按 F，等展开完成再接线。',
    action:{label:'展开太阳能板',run:'expandSolar',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.solar),recordAhead:true,done:w=>!!w.survival?.power?.solar?.expanded},
  {id:'3-5a',required:true,title:'接太阳能',icon:'power',keys:['F'],pose:'pointing-tablet',say:'走到电池旁，按 F，接上太阳能。',
    action:{label:'接光伏输入',run:'connectSolar',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.battery),recordAhead:true,done:w=>!!w.survival?.power?.links?.includes('solar')},
  {id:'3-5b',required:true,title:'接配电箱',icon:'power',keys:['F'],pose:'pointing-tablet',say:'走到配电箱旁，按 F，接第二根线。',
    action:{label:'接配电输出',run:'connectBus',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.bus),recordAhead:true,done:w=>!!w.survival?.power?.links?.includes('bus')},
  {id:'3-5c',required:true,title:'验收通电',icon:'power',keys:['F'],pose:'approve',say:'两根线接好了。按 F 检查通电。',
    action:{label:'通电验收',run:'commissionPower',ready:onFoot},target:viaDoor(w=>w.survival?.targets?.bus),recordAhead:true,done:w=>!!w.survival?.power?.online},
  {id:'3-6',required:true,title:'亮灯',icon:'home',keys:[],pose:'approve',say:'家里的灯有电了。电池也在记录收支。',target:w=>w.door,recordAhead:true,done:w=>!!w.survival?.power?.online},
  {id:'4-1',required:true,title:'天黑回家',icon:'home',liveSay:true,keys:['F'],pose:'reassure',say:w=>w.survival?.nightNow?'天黑了。回家经过气闸，确认今晚的营地电量。':'先回家，等待夜晚。当前还是白昼，不用反复进出气闸。',target:w=>w.door,recordAhead:true,done:w=>!!w.survival?.night?.returned},
  {id:'4-2',required:true,title:'坐下吃饭',icon:'meal',keys:['F'],pose:'walking-pointing',say:'到长桌旁，按 F，坐下吃点东西。',
    action:{label:'坐下用餐',run:'eatMeal',ready:w=>w.inHome&&w.mode==='walk'},target:w=>w.inHome?w.survival?.targets?.galley:w.door,recordAhead:true,done:w=>!!w.survival?.night?.meal},
  {id:'4-2b',required:true,title:'起身',icon:'steps',keys:['F'],pose:'walking-pointing',say:'吃好了。按 F 起身，去床边休息。',target:()=>null,done:w=>!w.resting},
  {id:'4-3',required:true,title:'睡到天亮',icon:'bed',keys:['F'],pose:'reassure',say:'到床边按 F。电池要够撑到天亮。',
    action:{label:'睡到天亮',run:'sleepNight',ready:w=>w.inHome&&w.mode==='walk'},target:w=>w.inHome?w.survival?.targets?.bed:w.door,recordAhead:true,done:w=>!!w.survival?.night?.slept},
  {id:'4-end',required:true,big:true,title:'火星第一夜',icon:'home',event:'accept',lines:[
    {pose:'approve',say:'早上好。你在火星度过了第一夜。'},
    {pose:'pointing-tablet',say:'夜里用的是电池储存的电。第一夜已经记进我们的记录。'}]},
  // 过桥卡：把人送到通信台，接上已经能玩的洞察号任务（遗迹档案里接受任务就算做完）。
  { id: '2-8', title: '找艾琳', icon: 'antenna', keys: ['F'], pose: 'walking-pointing',
    say: '回家，到通信台找我。我们去认识第一个邻居。',
    target: w => (w.inHome ? w.spots.comms : w.door), done: w => w.relicStarted },

  // —— 第五章 · 第一个邻居（洞察号）——
  // 简报由上面的 2-8 接上了（在通信台接受任务）。挑哪个不存档：「到了」只看人真的到了没有。
  { id: '5-2', required: true, relic: 'INSG', title: RELIC_CARDS.INSG.name, pic: relicPic('INSG'), icon: 'antenna', keys: [], pose: 'thinking',
    say: '开车去，还是飞过去？',
    actions: [
      // 大车不在身边（开到半路刷新过，车留在半路）就不出这张图，只剩「坐飞船」。
      { label: '开车', icon: 'truck', run: 'driveToRelic', want: 'car', visible: w => idle(w) && carAtHand(w) },
      { label: '坐飞船', icon: 'ship', run: 'flyToRelic', want: 'ship', visible: idle },
    ],
    want: (w, picked) => picked || null,
    target: viaDoor(relicAt('INSG')), done: arrived('INSG') },
  photoCard('INSG', '5-4'),
  homeCard('INSG', '5-5'),


  // 洞察号原有任务保持可玩；只有实拍并回家后才出现化验章节。
  {id:'6-0',required:true,available:w=>!!w?.firstRelicDone,title:'回家化验',icon:'lab',keys:['F'],pose:'walking-pointing',say:'第一个邻居看过了。回家准备化验。',target:w=>w.door,done:w=>!!w.firstRelicDone&&w.inHome},
  {id:'6-out',required:true,title:'出舱',icon:'home',keys:['F'],pose:'walking-pointing',say:'先出门。走到气闸门前，按 F。',target:w=>w.door,done:w=>!w.inHome},
  {id:'6-1',required:true,title:'钻一点土',icon:'rover',keys:['R','鼠标'],pose:'pointing-tablet',
    say:w=>!w.delivered?'大车还在船内。先放下大车，再放出小车。':w.roverLoaded?'小车在大车货舱里。走到大车旁，把它放下来。':'遥控小车，放下采样臂，钻一点土。',
    actions:[{label:'放下大车',run:'unloadShip',ready:onFoot,visible:w=>!w.delivered},
      {label:'放出小车',run:'unloadRover',ready:w=>stopped(w)&&(w.mode==='carrier'||onFoot(w)&&near(w.player,w.carrier,10)),visible:w=>w.delivered&&w.roverLoaded},
      {...reconnect,ready:w=>w.roverOut&&canConnect(w),visible:w=>w.roverOut&&w.mode!=='remote'}],
    target:viaDoor(w=>!w.delivered?w.ship:w.roverLoaded?w.carrier:null),recordAhead:true,done:w=>!!w.survival?.samples?.some(s=>s.status==='pending')},
  {id:'6-1b',required:true,title:'交回样品',icon:'truck',keys:['按住 E'],pose:'walking-pointing',say:'小车开到大车旁，按住 E，交回样品。',
    action:{label:'交回样品',run:'archiveSample',ready:w=>w.mode==='remote'},target:w=>w.carrier,recordAhead:true,done:w=>!!w.survival?.samples?.some(s=>s.archived&&s.status==='pending')},
  {id:'6-1c',required:true,title:'收工',icon:'steps',keys:[],pose:'approve',say:'样品交回了。结束遥控，回家去化验。',
    action:{label:'结束遥控',run:'endRemote',ready:w=>w.mode==='remote'},target:()=>null,done:w=>w.mode==='walk'},
  {id:'6-2',required:true,title:'送去化验',icon:'lab',keys:['F'],pose:'walking-pointing',say:'把样品交回，再到家里化验台按 F。',target:w=>w.inHome?w.survival?.targets?.lab:w.door,recordAhead:true,done:w=>!!w.survival?.analysis},
  {id:'6-3',required:true,title:'看结果',icon:'lab',keys:[],pose:'thinking',say:'这是模拟水迹。还要勘探，不能直接喝。',
    action:{label:'读取化验结果',run:'readAnalysis',ready:w=>w.inHome&&w.mode==='walk'},target:w=>w.inHome?w.survival?.targets?.lab:w.door,recordAhead:true,done:w=>!!w.survival?.analysis?.read},
  // The old chapter-7 visit cards no longer gate the survival mainline.
  { id: '7-end', required: true, big: true, title: '可选考察', icon: 'antenna', event: 'accept', button: '继续建设',
    lines: [
      { pose: 'approve', say: '洞察号考察完成了。其余五处遗迹是可选任务，可以任选、随时换目标。' },
      { pose: 'pointing-tablet', say: '在“可选遗迹”或通信台里查看简报和照片。它们不挡住后面的科研。' },
      { pose: 'welcome', say: '接下来，我们继续补给和建设。想考察遗迹时再出发。' },
    ] },

  ...WATER_DECK,
  ...NURSERY_DECK,
  ...RESEARCH_DECK,
  ...ASSAY_DECK,
  ...POWER_RESEARCH_DECK,
  ...SOLAR_RESEARCH_DECK,
]);

// Retain lookup of historical card IDs for save/evidence compatibility; never feed them to the mainline director.
export const OPTIONAL_RELIC_DECK = Object.freeze(TASK_ORDER.filter(id=>id!=='INSG').flatMap(id=>
  [briefCard(id,`7-${id}-1`),flyCard(id,`7-${id}-2`),photoCard(id,`7-${id}-3`),homeCard(id,`7-${id}-4`)]));
export const cardById = id => DECK.find(c => c.id === id) || OPTIONAL_RELIC_DECK.find(c=>c.id===id) || null;
