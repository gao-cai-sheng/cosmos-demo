import {researchEvidence} from '../journey/research.js';
const state=w=>w.survival||{};
const evidence=w=>researchEvidence(state(w));
const lab=w=>w.inHome?w.survival?.targets?.lab:w.door;
const field=w=>w.inHome?w.door:w.survival?.research?.target;
const onsite=w=>w.mode==='walk'&&w.inHome;
const step=(id,title,run,done,say)=>({id,required:true,title,icon:'lab',keys:[],pose:'thinking',say,want:()=> 'station',target:lab,action:{label:title,run,ready:onsite},done});
export const RESEARCH_ACTIONS=['beginResearch','analyzeResearch','inspectResearch'];
export const RESEARCH_DECK=[
 {id:'G-0',required:true,big:true,available:w=>!!w?.homeScene&&!!w.survival?.research,title:'水源证据复核',icon:'lab',event:'accept',lines:[
  {pose:'thinking',say:'{playerName}，你带来的地质课题，是弄清当地的水源能否长期利用。'},
  {pose:'pointing-tablet',say:'第一批水是先导证据。这次保留旧样，再检查相隔二十米以上的另一个位置。'},
  {pose:'reassure',say:'先做来源复核。没有含水量测量，就不能说这一片都是水矿。'}]},
 step('G-1','登记基线','beginResearch',w=>!!evidence(w).baseline,'回化验台，登记已经复核的水务样品。已有成果不用重做。'),
 {id:'G-2',required:true,title:'另一处取样',icon:'rover',keys:['R','鼠标'],pose:'pointing-tablet',liveSay:true,target:field,
  say:w=>evidence(w).sample?'已有另一位置的实采样品，沿用记录，不重复采样。':'出舱，遥控小车到科研光圈。放下采样臂，点击地面钻一份样。',
  action:{label:'遥控小车',run:'remoteRover',ready:w=>w.mode==='walk'&&!w.inHome||w.mode==='carrier'&&Math.abs(w.carrier?.speed||0)<.4,visible:w=>w.mode!=='remote'},done:w=>!!evidence(w).sample},
 {id:'G-3',required:true,title:'交回样品',icon:'truck',keys:['按住 E'],pose:'walking-pointing',say:'小车回大车旁，交回样品。只取到样，还不算归档。',target:w=>w.carrier,
  actions:[{label:'交回样品',run:'archiveSample',ready:w=>w.mode==='remote'},{label:'遥控小车',run:'remoteRover',ready:w=>w.mode==='walk'&&!w.inHome,visible:w=>w.mode!=='remote'}],done:w=>!!evidence(w).sample?.archived},
 {id:'G-4',required:true,title:'结束遥控',icon:'steps',keys:[],pose:'approve',say:'样品已归档。结束遥控，回舱内化验台。',target:()=>null,
  action:{label:'结束遥控',run:'endRemote',ready:w=>w.mode==='remote'},done:w=>w.mode==='walk'},
 step('G-5','提交样品','analyzeResearch',w=>evidence(w).analyzed,'到化验台提交第二个位置的归档样品，复核编号、位置和类型。'),
 step('G-6','科研报告','inspectResearch',w=>!!state(w).research?.read,'打开报告，看看证据支持什么、还有哪些测量没有做。读完确认。'),
 {id:'G-end',required:true,big:true,title:'证据仍不足',icon:'lab',event:'accept',button:'继续探索',lines:[
  {pose:'approve',say:'两个位置的实采样品已经归档，来源复核记录已保存。'},
  {pose:'thinking',say:'这次还没有逐样含水量和深度数据。水源是否连续，结论仍是不确定。'},
  {pose:'pointing-tablet',say:'科研任务完成，不等于假设成立。以后补上测量设备，再继续验证。'}]},
];
