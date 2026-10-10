import * as THREE from 'three';
import { builder, block, rod, socket, swept } from '../base-kit/geometry.js';

const LODS=[{id:0,note:'全细节单架；保持种植槽、灯带和维修接口可辨认。',measuredTriangles:0,budget:{maxTriangles:100000,maxDrawCalls:220}}];
export const SPEC={
 schema:'threejs-artifact@0.2',name:'hydroponic-rack',version:'1.0.0',unit:'m',up:[0,1,0],forward:[0,0,1],
 datum:'footpad-bottom',seed:261004,
 canonicalState:'installed',initialState:'installed',
 bounds:{min:[-1.05,0,-.385],max:[1.05,2.075,.4015],w:2.10,h:2.075,d:.7865,state:'installed',lod:0,relativeTolerance:.02,absoluteFloor:.001},
 boundsByState:{},
 sockets:{
  'power.inlet':socket('power',[-1.00,.08,-.34],[0,1,0,0]),
  'fluid.inlet':socket('fluid',[.98,.09,-.34],[0,1,0,0]),
  'data.service':socket('data',[.96,1.12,.40]),
 },
 materialSlots:['structure','frameTrim','detail','tray','seal','water','channel','lamp','signal','warning','substrate','foliage','foliageDeep'],
 states:{
  installed:{parts:{'lights':0,'fluid.visible':0,'sprouts.early':0,'sprouts.ready':0,'signals.checked':0,'signals.flow':0,'signals.warning':0,'signals.accepted':0}},
  checked:{parts:{'lights':0,'fluid.visible':0,'sprouts.early':0,'sprouts.ready':0,'signals.checked':1,'signals.flow':0,'signals.warning':0,'signals.accepted':0}},
  filled:{parts:{'lights':0,'fluid.visible':1,'sprouts.early':0,'sprouts.ready':0,'signals.checked':1,'signals.flow':0,'signals.warning':0,'signals.accepted':0}},
  sown:{parts:{'lights':0,'fluid.visible':1,'sprouts.early':1,'sprouts.ready':0,'signals.checked':1,'signals.flow':0,'signals.warning':0,'signals.accepted':0}},
  growing:{parts:{'lights':1,'fluid.visible':1,'sprouts.early':1,'sprouts.ready':0,'signals.checked':1,'signals.flow':1,'signals.warning':0,'signals.accepted':0}},
  ready:{parts:{'lights':0,'fluid.visible':1,'sprouts.early':0,'sprouts.ready':1,'signals.checked':1,'signals.flow':0,'signals.warning':0,'signals.accepted':0}},
  paused:{parts:{'lights':0,'fluid.visible':1,'sprouts.early':1,'sprouts.ready':0,'signals.checked':1,'signals.flow':0,'signals.warning':1,'signals.accepted':0}},
  verified:{parts:{'lights':0,'fluid.visible':1,'sprouts.early':0,'sprouts.ready':1,'signals.checked':1,'signals.flow':0,'signals.warning':0,'signals.accepted':1}},
 },
 articulation:[],allowedContacts:[
  {id:'AC-01',partA:'frame.upright.*',partB:'frame.foot.*',purpose:'型材立柱与脚垫螺接',maxToleranceM:.012,states:['all']},
  {id:'AC-02',partA:'frame.upright.*',partB:'frame.cross.*',purpose:'型材立柱与横梁角码连接',maxToleranceM:.012,states:['all']},
  {id:'AC-03',partA:'frame.upright.*',partB:'frame.cap.*',purpose:'立柱端盖贴合',maxToleranceM:.006,states:['all']},
  {id:'AC-04',partA:'frame.gusset.*',partB:'frame.upright.*',purpose:'三角加强片压接型材',maxToleranceM:.012,states:['all']},
  {id:'AC-05',partA:'frame.backRail.*',partB:'frame.upright.*',purpose:'背部横向支撑与立柱接合',maxToleranceM:.008,states:['all']},
  {id:'AC-06',partA:'tray.pan.*',partB:'tray.well.*',purpose:'内槽固定在承液托盘内',maxToleranceM:.025,states:['all']},
  {id:'AC-07',partA:'tray.pan.*',partB:'tray.endCap.*',purpose:'托盘端封边紧固',maxToleranceM:.025,states:['all']},
  {id:'AC-08',partA:'pod.grommet.*',partB:'pod.insert.*',purpose:'栽培杯压圈包住可换基质芯',maxToleranceM:.018,states:['all']},
  {id:'AC-09',partA:'seedling.*',partB:'pod.insert.*',purpose:'幼苗根部进入栽培基质芯',maxToleranceM:.015,states:['sown','growing','paused','ready','verified']},
  {id:'AC-10',partA:'seedling.*',partB:'seedling.*',purpose:'同株叶片与根茎自然交叠',maxToleranceM:.012,states:['sown','growing','paused','ready','verified']},
  {id:'AC-11',partA:'reservoir.face',partB:'reservoir.shell',purpose:'透明观察窗与盒体前壁贴合',maxToleranceM:.012,states:['all']},
  {id:'AC-12',partA:'reservoir.scale',partB:'reservoir.face',purpose:'外部液位标记贴附观察窗',maxToleranceM:.014,states:['all']},
  {id:'AC-13',partA:'reservoir.batch-fill',partB:'reservoir.face',purpose:'本批试验液位显示在窗口内侧',maxToleranceM:.012,states:['filled','sown','growing','paused','ready','verified']},
  {id:'AC-14',partA:'water.*',partB:'water.*',purpose:'滴灌供回水歧管、泵体、接头间的密封装配',maxToleranceM:.012,states:['all']},
  {id:'AC-15',partA:'lamp.hood.*',partB:'lamp.diffuser.*',purpose:'灯具扩散片固定于遮光罩',maxToleranceM:.010,states:['all']},
  {id:'AC-16',partA:'lamp.mount.*',partB:'lamp.hood.*',purpose:'灯具安装耳固定于遮光罩',maxToleranceM:.010,states:['all']},
  {id:'AC-17',partA:'lamp.hood.2',partB:'frame.cross.x.back.2',purpose:'上层灯罩安装到顶部背横梁',maxToleranceM:.010,states:['all']},
  {id:'AC-18',partA:'controller.face',partB:'controller.body',purpose:'显示面板嵌入控制盒前壳',maxToleranceM:.010,states:['all']},
  {id:'AC-19',partA:'controller.key.*',partB:'controller.face',purpose:'按键安装在面板表面',maxToleranceM:.010,states:['all']},
  {id:'AC-20',partA:'signal.*',partB:'controller.face',purpose:'状态灯嵌入控制面板',maxToleranceM:.010,states:['all']},
 ],
 lods:LODS,collider:{kind:'compound',state:'installed',dynamicParts:[],parts:[
  {name:'frame.envelope',kind:'box',size:[1.98,2.02,.68],position:[0,1.04,0]},
  {name:'footpad.-x',kind:'box',size:[.18,.04,.18],position:[-.93,.02,-.29]},
  {name:'footpad.+x',kind:'box',size:[.18,.04,.18],position:[.93,.02,-.29]},
 ]},
 interaction:{volume:{kind:'box',size:[2.3,2.2,1.1],position:[0,1.05,0]},anchor:'data.service',prompt:'检查育苗架 / 管理本批幼苗'},
 detailFocus:{part:'tray.0',radius:.3},grazingAzimuthDeg:60,generatedTextures:[],deviations:[],
};

function torusData(cx,cy,cz,major,minor,around=20,section=8){
 const rings=[];
 for(let j=0;j<around;j++){
  const a=j*2*Math.PI/around,center=[cx+major*Math.cos(a),cy,cz+major*Math.sin(a)];
  rings.push(Array.from({length:section},(_,i)=>{
   const b=i*2*Math.PI/section,rr=major+minor*Math.cos(b);
   return [cx+rr*Math.cos(a),cy+minor*Math.sin(b),cz+rr*Math.sin(a)];
  }));
 }
 return swept(rings,true);
}
function leaf(parent,api,name,at,scale,angle,slot){
 const [x,y,z]=at,[w,h,d]=scale;
 const mesh=api.add(parent,name,block([w,h,d],[0,0,0],Math.min(h/2,.009),3),slot);
 mesh.position.set(x,y,z);mesh.rotation.y=angle;mesh.rotation.z=angle*.28;return mesh;
}
function plant(api,parent,prefix,x,y,z,large){
 const s=large?1:.42,leafSlot='foliage';
 api.add(parent,prefix+'.stem',rod([x,y,z],[x,y+.13*s,z],.012*s,8),'foliageDeep');
 const count=large?7:4;
 for(let i=0;i<count;i++){
  const a=i*Math.PI*2/count+.3,w=(large?.105:.068),d=large?.045:.030;
  const reach=(large?.082:.052),height=y+.055*s+(i%2)*.018*s;
  leaf(parent,api,`${prefix}.leaf.${i}`,[x+Math.cos(a)*reach,height,z+Math.sin(a)*reach],[w*s,.012*s,d*s],a,leafSlot);
 }
}

export function create({materials,seed=SPEC.seed,lod=0}){
 if(seed!==SPEC.seed)throw new Error('hydroponic-rack: this authored asset has a fixed geometry seed');
 const api=builder(SPEC,{materials,seed,lod}),{group,parts,part,add,complete}=api;
 const frame=part('frame'),trim=part('frameTrim'),plumbing=part('water'),reservoir=part('reservoir'),beds=[0,1,2].map(i=>part('tray.'+i)),lights=part('lights'),controller=part('controller');
 const fluid=part('fluid.visible'),checked=part('signals.checked'),flow=part('signals.flow'),warning=part('signals.warning'),accepted=part('signals.accepted');
 const early=part('sprouts.early'),ready=part('sprouts.ready');

 // Four bolted uprights, lower plinth, upper rails, gussets, and replaceable footpads.
 for(const x of [-.96,.96])for(const z of [-.30,.30]){
  add(frame,`frame.upright.${x}.${z}`,rod([x,.10,z],[x,2.00,z],.032,10),'structure');
  add(frame,`frame.foot.${x}.${z}`,block([.18,.07,.17],[x,.035,z],.025,2),'frameTrim');
  add(trim,`frame.cap.${x}.${z}`,block([.09,.09,.09],[x,2.03,z],.014,2),'detail');
 }
 for(const y of [.16,2.00]){
  add(frame,`frame.cross.x.${y}`,rod([-.96,y,-.30],[.96,y,-.30],.026,10),'structure');
  add(frame,`frame.cross.x.back.${y}`,rod([-.96,y,.30],[.96,y,.30],.026,10),'structure');
  for(const x of [-.96,.96])add(frame,`frame.cross.z.${x}.${y}`,rod([x,y,-.30],[x,y,.30],.026,10),'structure');
 }
 for(const x of [-1,1])for(const z of [-1,1]){
  add(trim,`frame.gusset.${x}.${z}`,block([.14,.16,.018],[x*.89,.19,z*.265],.008,2),'frameTrim');
 }
 for(const z of [-.18,.26]){
  add(frame,`frame.backRail.${z}`,rod([-.89,.24,z],[.89,.24,z],.019,8),'frameTrim');
 }

 // Three removable shallow trays; each carries two seed pods and an independent LED bar.
 const tierY=[.39,1.02,1.65];
 tierY.forEach((y,i)=>{
  const bed=beds[i];
  add(bed,`tray.pan.${i}`,block([1.72,.11,.51],[0,y,0.035],.035,3),'tray');
  add(bed,`tray.well.${i}`,block([1.52,.025,.34],[0,y+.067,.075],.018,3),'detail');
  for(const x of [-.69,.69]){
   add(bed,`tray.endCap.${i}.${x}`,block([.045,.16,.56],[x,y+.01,.035],.014,2),'frameTrim');
   add(bed,`tray.lock.${i}.${x}`,block([.07,.04,.035],[x,y+.10,.32],.009,2),'seal');
  }
  for(const x of [-.44,.44]){
   add(bed,`pod.grommet.${i}.${x}`,torusData(x,y+.09,.09,.118,.008,20,8),'seal');
   add(bed,`pod.insert.${i}.${x}`,block([.20,.035,.20],[x,y+.084,.09],.014,3),'substrate');
  }
  add(plumbing,`water.feed.${i}`,rod([-.75,y+.20,-.25],[.75,y+.20,-.25],.016,8),'channel');
  for(const x of [-.44,.44]){
   add(plumbing,`water.drop.${i}.${x}`,rod([x,y+.20,-.25],[x,y+.11,-.02],.009,7),'channel');
   add(plumbing,`water.nozzle.${i}.${x}`,block([.04,.025,.04],[x,y+.105,-.015],.006,1),'seal');
  }
 });

 // Transparent batch reservoir with a visible low-volume sight glass. No capacity is inferred from the render.
 add(reservoir,'reservoir.shell',block([.28,.36,.23],[-.69,.31,.145],.035,3),'detail');
 add(reservoir,'reservoir.face',block([.19,.28,.025],[-.69,.31,.265],.015,3),'water');
 add(reservoir,'reservoir.scale',block([.025,.22,.014],[-.69,.31,.282],.006,2),'signal');
 add(reservoir,'reservoir.upper',block([.075,.035,.06],[-.69,.512,.14],.012,2),'frameTrim');
 add(reservoir,'reservoir.lower',block([.075,.035,.06],[-.69,.108,.14],.012,2),'frameTrim');
 add(fluid,'reservoir.batch-fill',block([.145,.045,.012],[-.69,.205,.286],.006,2),'water');
 add(plumbing,'water.main',rod([.50,.22,-.25],[.50,1.91,-.25],.024,10),'channel');
 add(plumbing,'water.return',rod([.59,.22,-.20],[.59,1.91,-.20],.019,9),'seal');
 add(plumbing,'water.pump',block([.25,.20,.20],[.78,.27,-.04],.025,3),'frameTrim');
 add(plumbing,'water.pumpCover',block([.16,.11,.018],[.78,.27,.066],.012,2),'detail');
 add(plumbing,'water.pumpSight',torusData(.78,.27,.082,.026,.006,16,8),'signal');
 // Short elbow sections make the return manifold read as a connected closed loop.
 for(const y of tierY)for(const end of [-1,1]){
  const x=end*.73;
  add(plumbing,`water.manifold.${y}.${end}`,rod([.50,y+.20,-.25],[x,y+.20,-.25],.012,7),'channel');
  add(plumbing,`water.riser.${y}.${end}`,rod([x,y+.20,-.25],[x,y+.20,.22],.012,7),'channel');
 }

 // Three shielded horticulture bars, serviceable from the aisle, with separate indicator states.
 tierY.forEach((y,i)=>{
  const hoodY=y+.31;
  add(lights,`lamp.hood.${i}`,block([1.54,.085,.20],[0,hoodY,.13],.026,3),'detail');
  add(lights,`lamp.diffuser.${i}`,block([1.40,.025,.095],[0,hoodY-.053,.17],.012,2),'lamp');
  for(const x of [-.71,.71])add(lights,`lamp.mount.${i}.${x}`,block([.045,.09,.16],[x,hoodY,.13],.009,2),'frameTrim');
 });
 add(controller,'controller.body',block([.31,.36,.10],[.77,1.14,.326],.025,3),'detail');
 add(controller,'controller.face',block([.24,.22,.018],[.77,1.17,.385],.015,3),'signal');
 for(let i=0;i<4;i++)add(controller,`controller.key.${i}`,block([.045,.035,.018],[.69+i*.055,1.015,.385],.006,1),'frameTrim');
 [[checked,'signal.checked',.84,'signal'],[flow,'signal.flow',1.10,'signal'],[warning,'signal.warning',1.36,'warning'],[accepted,'signal.accepted',1.62,'foliage']].forEach(([p,n,y,s])=>{
  add(p,n,block([.06,.06,.025],[.80,y,.389],.018,3),s);
 });
 for(let i=0;i<2;i++){
  const x=-.44+i*.88;
  plant(api,early,`seedling.early.${i}`,x,.49,.09,false);
  plant(api,ready,`seedling.ready.${i}`,x,.49,.09,true);
 }

  let current=null;
 const setState=name=>{
  const target=SPEC.states[name];if(!target)throw new Error(`hydroponic-rack: unknown state ${name}`);
  if(current===name)return;current=name;
  for(const [key,value] of Object.entries(target.parts))parts[key].visible=!!value;
  group.updateMatrixWorld(true);
 };
 const artifact=complete(setState);
 return {...artifact,setState,get state(){return current;},
  dispose:artifact.dispose};
}
