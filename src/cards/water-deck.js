import {near,stopped} from './needs.js';
const water=w=>w.survival?.water;
const target=key=>w=>w.inHome?w.door:w.survival?.waterTargets?.[key]||null;
const lab=w=>w.inHome?w.survival?.targets?.lab:w.door;
const foot=w=>w.mode==='walk'&&!w.inHome;
const atLab=w=>w.mode==='walk'&&w.inHome;
const drive={label:'让车自己开',run:'driveWater',ready:w=>w.mode==='carrier'&&!w.enRoute,visible:w=>!w.enRoute};
const unloadRover={label:'先放出小车',run:'unloadRover',ready:w=>stopped(w),visible:w=>!!w.roverLoaded};
const truck=(id,title,key,done,say)=>({id,required:true,title,icon:'truck',keys:[],pose:'pointing-tablet',say,want:()=> 'haul',target:target(key),waterTarget:key,action:drive,done});
const station=(id,title,run,done,say,icon='lab')=>({id,required:true,title,icon,liveSay:true,keys:['F'],pose:'thinking',say:w=>{const job=water(w)?.job;if(job&&['extractWater','purifyWater'].includes(run)){const duration=job.type==='extract'?120:12;return !w.survival?.power?.online||w.survival.power.energy<=8?'作业暂停，先恢复电网或等待回充；已付费进度保留。':`本批${job.type==='extract'?'提取':'净化'} ${Math.floor(job.elapsed/duration*100)}%，剩余 ${Math.ceil(duration-job.elapsed)} 秒。可离开工位，完成后回来。`;}return say;},want:()=> 'station',target:lab,action:{label:title,run,ready:atLab},done});
export const WATER_ACTIONS=['requestWater','loadWater','unloadWater','reviewWater','collectFeed','deliverFeed','installWater','extractWater','purifyWater','testWater','storeWater','driveWater','inspectWater','summonCarrier'];
export const WATER_DECK=Object.freeze([
 {id:'8-1',required:true,available:w=>!!w?.homeScene&&!!water(w),big:true,title:'接回水务设备',icon:'water',event:'accept',lines:[
  {pose:'thinking',say:'化验里有水迹，离喝上本地水还差几步。'},
  {pose:'pointing-tablet',say:'轨道上留着一批有限设备。我们申请支援，收到落稳定位，再开大车去接。'},
  {pose:'reassure',say:'设备要占大车货位。装货前，先把小车放在安全的地方。'}]},
 {id:'8-2',required:true,title:'要设备',icon:'water',keys:[],pose:'pointing-tablet',say:'先出门，核对轨道上这一批货。发送申请以后，等落稳信标。',
  action:{label:'核单并请求支援',run:'requestWater',ready:foot},target:w=>w.inHome?w.door:null,done:w=>!!water(w)&&water(w).cargo!=='orbit'},
 {id:'8-3',required:true,title:'等落稳',icon:'water',liveSay:true,keys:[],pose:'reassure',say:w=>`补给下降 ${Math.floor((water(w)?.dropElapsed||0)/15*100)}%。留出安全区，落稳后开车去接。`,target:target('drop'),done:w=>['ground','aboard','home'].includes(water(w)?.cargo)},
 truck('8-4','去接货','stop',w=>['aboard','home'].includes(water(w)?.cargo)||w.mode==='carrier'&&stopped(w)&&near(w.carrier,w.survival?.waterTargets?.stop,10),'定位收到。开大车接货，核对批次。也可自动驾驶。'),
 {id:'8-5',required:true,title:'装设备',icon:'truck',keys:[],pose:'pointing-tablet',say:w=>w.roverLoaded?'先放出小车，给水务设备腾出货位。':'核对 WATER-01。停稳了，把这批设备装上车。',want:()=> 'haul',target:target('stop'),waterTarget:'stop',
  actions:[unloadRover,{label:'装水务设备',run:'loadWater',ready:w=>stopped(w)&&!w.roverLoaded,visible:w=>!w.roverLoaded},drive],done:w=>['aboard','home'].includes(water(w)?.cargo)},
 truck('8-6','运回家','home',w=>water(w)?.cargo==='home'||w.mode==='carrier'&&stopped(w)&&near(w.carrier,w.survival?.waterTargets?.home,12),'设备在车上了。运回家，在卸货区停稳。'),
 {id:'8-7',required:true,title:'卸设备',icon:'water',keys:[],pose:'approve',say:'到家了。按清单卸设备，再接管路试取水。',want:()=> 'haul',target:target('home'),waterTarget:'home',
  actions:[{label:'设备入库',run:'unloadWater',ready:w=>stopped(w)},drive],done:w=>water(w)?.cargo==='home'},
 {id:'W-1',required:true,big:true,title:'第一批本地水',icon:'water',event:'accept',lines:[
  {pose:'thinking',say:'先让小车在标记的试验区再取一份样。'},
  {pose:'pointing-tablet',say:'{playerName}，这是你的地质工作。样品要记清来源，水迹还不等于可用水源。'},
  {pose:'pointing-tablet',say:'这里用含水风化物做小批试验，不是已证实的地下冰矿。'},
  {pose:'reassure',say:'原水还不能喝。提取、净化、检测都做好，再进净水罐。'}]},
 {id:'W-2',required:true,title:'再取样',icon:'rover',keys:['R','鼠标'],pose:'pointing-tablet',say:'遥控小车去光圈，放下采样臂，再钻一份样。',target:target('field'),
  action:{label:'遥控小车',run:'remoteRover',ready:w=>foot(w)||w.mode==='carrier'&&stopped(w),visible:w=>w.mode!=='remote'},done:w=>!!water(w)?.sampleId},
 {id:'W-3',required:true,title:'交回样品',icon:'truck',keys:['按住 E'],pose:'walking-pointing',say:'小车回大车旁，交回这一份新样品。',target:w=>w.carrier,
  actions:[{label:'交回样品',run:'archiveSample',ready:w=>w.mode==='remote'},{label:'遥控小车',run:'remoteRover',ready:foot,visible:w=>w.mode!=='remote'}],done:w=>!!w.survival?.samples?.some(s=>s.id===water(w)?.sampleId&&s.archived)},
 {id:'W-4',required:true,title:'结束遥控',icon:'steps',keys:[],pose:'approve',say:'样品交回了。结束遥控，回家复核。',action:{label:'结束遥控',run:'endRemote',ready:w=>w.mode==='remote'},target:()=>null,done:w=>w.mode==='walk'},
 station('W-5','复核水源','reviewWater',w=>!!water(w)?.reviewed,'到家里化验台按 F，复核这份新样品。'),
 truck('W-6','去取原料','field',w=>!!water(w)?.collected||w.mode==='carrier'&&stopped(w)&&near(w.carrier,w.survival?.waterTargets?.field,12),'小样不是生产原料。开大车去试验区取一批。'),
 {id:'W-7',required:true,title:'装原料',icon:'truck',keys:[],pose:'pointing-tablet',say:w=>w.roverLoaded?'先放出小车，再装这一批试验原料。':'停稳了。装上五十千克试验原料。',want:()=> 'haul',target:target('field'),waterTarget:'field',
  actions:[unloadRover,{label:'装50千克原料',run:'collectFeed',ready:w=>stopped(w)&&!w.roverLoaded,visible:w=>!w.roverLoaded},drive],done:w=>!!water(w)?.collected},
 truck('W-8','带回原料','home',w=>!!water(w)?.collected&&!water(w)?.feedAboard||w.mode==='carrier'&&stopped(w)&&near(w.carrier,w.survival?.waterTargets?.home,12),'带回这一批原料，在卸货区停稳。'),
 {id:'W-9',required:true,title:'卸下原料',icon:'water',keys:[],pose:'approve',say:'把原料卸下来，再去化验室接设备。',want:()=> 'haul',target:target('home'),waterTarget:'home',
  actions:[{label:'原料入库',run:'deliverFeed',ready:w=>stopped(w)},drive],done:w=>!!water(w)?.collected&&!water(w)?.feedAboard},
 station('W-10','接水务设备','installWater',w=>!!water(w)?.installed,'下车回家，到化验台按 F，接入水务模块。','water'),
 station('W-11','收原水','extractWater',w=>!!water(w)?.extracted,'按 F 启动提取。电不够时会保留进度。','water'),
 station('W-12','过净化','purifyWater',w=>!!water(w)?.purified,'原水收好了。按 F 净化，会用掉一份滤材。','water'),
 station('W-13','查水质','testWater',w=>!!water(w)?.tested,'处理完还要检测。按 F 检查这一批。'),
 station('W-14','存净水','storeWater',w=>!!water(w)?.stored,'本批模拟检测合格。按 F 转进净水罐。','water'),
 {id:'W-end',required:true,big:true,title:'本地水入库',icon:'water',event:'accept',button:'好',lines:[
  {pose:'approve',say:'第一批本地净水已经入库。'},
  {pose:'pointing-tablet',say:'五十千克原料，得到零点七二升合格水。耗电、滤材和废液都记下了。'},
  {pose:'reassure',say:'这只是小批试验，生活储水先留着。接下来再准备种植舱。'}]},
]);
