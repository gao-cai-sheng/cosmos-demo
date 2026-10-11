// 前提小卡（D76）：一张卡要人先在车上、在船上，或站在地上。前提没满足时先出这里的小卡，满足了原来的卡自己回来。
// 小卡不记存档、不打勾，随时可以再出来：人上了船又下来、走回家里、去遥控小车，都不会卡死。
// 纯数据 + 纯判断，w 是 src/cards/world.js 拍的世界快照。
export const near = (a, b, r) => !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= r;
export const stopped = w => !!w.carrier && Math.abs(w.carrier.speed) < .4;

/** 人在地上、离要拍的东西比这远（米），先出「跑过去」。实测下船后离遗迹 111–161 m。 */
export const RUN_FROM = 30;
/** 离要拍的东西比这远（米），或它不在这个场景里：得再坐飞船过去。和「飞船落在多远内算到了」是同一个数（deck.js ARRIVE.landed）。 */
export const FAR = 600;

const off = { icon: 'steps', keys: ['F'], pose: 'approve', target: () => null };
export const NEEDS = Object.freeze({
  returnHome:{id:'need-returnhome',title:'返回营地',icon:'home',keys:[],pose:'pointing-tablet',say:'这里不是营地。返回首次着陆点，再放能源设备。',action:{label:'返回营地继续',run:'goHome',ready:w=>w.mode==='flight'&&!w.enRoute,visible:w=>!w.enRoute},target:w=>w.boardAt},
  unloadCar:{id:'need-dropcar',title:'放下大车',icon:'truck',keys:[],pose:'pointing-tablet',say:'大车还在飞船里。先把它放下来。',action:{label:'放下大车',run:'unloadShip'},target:w=>w.ship},
  callCar:{id:'need-callcar',title:'叫大车来',icon:'truck',keys:[],pose:'pointing-tablet',say:'大车离得远。先叫它过来。',action:{label:'叫大车来',run:'summonCarrier',ready:w=>w.mode==='walk'&&!w.inHome},target:w=>w.carrier},
  endRemote: { id: 'need-walk', title: '收工', icon: 'steps', keys: [], pose: 'approve', say: '先让小车歇着。',
    action: { label: '收工', run: 'endRemote' }, target: () => null },
  leaveHome: { id: 'need-out', title: '出舱', icon: 'home', keys: ['F'], pose: 'walking-pointing', say: '先出门。走到气闸门前，按 F。',
    target: w => w.door },
  boardCar: { id: 'need-car', title: '上车', icon: 'truck', keys: ['F'], pose: 'walking-pointing', say: '走到大车旁边，按 F 上车。',
    target: w => w.carrier },
  boardShip: { id: 'need-ship', title: '上船', icon: 'ship', keys: ['F'], pose: 'walking-pointing', say: '走到飞船旁边，按 F 上船。',
    target: w => w.boardAt },
  // 到了地方，下来拍照。
  leaveCar: { ...off, id: 'need-offcar', title: '下车', say: '到了！按 F 下车。' },
  leaveShip: { ...off, id: 'need-offship', title: '下船', say: '到了！按 F 下船。' },
  // 坐错了：要坐飞船，人在大车里（或反过来）。
  swapCar: { ...off, id: 'need-swapcar', title: '下车', pose: 'pointing-tablet', say: '先按 F 下车。' },
  swapShip: { ...off, id: 'need-swapship', title: '下船', pose: 'pointing-tablet', say: '先按 F 下船。' },
  runTo: { id: 'need-run', title: '跑过去', icon: 'steps', keys: ['Shift', 'W'], pose: 'walking-pointing', say: '有点远。按住 Shift 和 W，跑过去。',
    target: (w, goal) => goal },
  // 该拍照了，人却离得很远：孩子中途关了浏览器，再打开时人和飞船都回到家（实测）。再飞一趟。
  // 按钮调的是当前那张卡的遗迹（mount.js 把当前的卡交给动作）。
  flyThere: { id: 'need-fly', title: '飞过去', icon: 'ship', keys: [], pose: 'pointing-tablet', say: '它离得很远。坐飞船过去。',
    action: { label: '起飞', icon: 'ship', run: 'flyToRelic', ready: w => !w.enRoute && w.mode === 'flight', visible: w => !w.enRoute },
    target: (w, goal) => goal },
});

/** want：这张卡要人在哪——'car'、'ship'、'foot'，或空。goal：'foot' 时要走近的那个点（不在这个场景里就是 null）。
 * 返回第一张没满足的前提小卡；都满足（或这会儿不该催）返回 null。 */
export function needFor(want, w, goal = null) {
  if (!want) return null;
  if(want==='station'){
    if(w.mode==='remote')return NEEDS.endRemote;
    if(w.mode==='carrier')return stopped(w)?NEEDS.leaveCar:null;
    if(w.mode==='flight')return w.shipGrounded?NEEDS.leaveShip:null;
    return null;
  }
  if(want==='haul'){
    if(w.mode==='remote')return NEEDS.endRemote;
    if(w.inHome)return NEEDS.leaveHome;
    if(!w.delivered)return NEEDS.unloadCar;
    if(w.mode==='walk'&&(!w.carrier||!near(w.player,w.carrier,150)))return NEEDS.callCar;
    return needFor('car',w,goal);
  }
  if (want === 'foot') {
    // 离得很远，或它不在这个场景里：先上船，再出「飞过去」。
    if (!near(w.player, goal, FAR)) return needFor('ship', w) || NEEDS.flyThere;
    if (w.mode === 'carrier') return stopped(w) ? NEEDS.leaveCar : null;
    if (w.mode === 'flight') return w.shipGrounded ? NEEDS.leaveShip : null;
    return w.mode === 'walk' && !near(w.player, goal, RUN_FROM) ? NEEDS.runTo : null;
  }
  if (w.mode === 'remote') return NEEDS.endRemote;
  if (w.inHome) return NEEDS.leaveHome;
  if (want === 'car') {
    if (w.mode === 'carrier') return null;
    if (w.mode === 'flight') return w.shipGrounded ? NEEDS.swapShip : null;
    return w.carrier ? NEEDS.boardCar : null;
  }
  if (w.mode === 'flight') return null;
  if (w.mode === 'carrier') return stopped(w) ? NEEDS.swapCar : null;
  return NEEDS.boardShip;
}
