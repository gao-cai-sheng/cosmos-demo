import {assaySamples} from '../journey/assay.js';
const state=w=>w.survival||{},lab=w=>w.inHome?state(w).targets?.lab:w.door;
const site=(w,i)=>w.inHome?w.door:i?state(w).research?.target:state(w).samples?.find(x=>x.id===state(w).research?.baselineId);
const collect=i=>({id:`H-${i+1}`,required:true,title:i?'另一处重采':'基线处重采',icon:'rover',keys:['R','鼠标'],pose:'pointing-tablet',say:'到箭头处重新取样，回大车旁按住E交回。',target:w=>site(w,i),actions:[{label:'遥控小车',run:'remoteRover',ready:w=>w.mode==='walk'&&!w.inHome||w.mode==='carrier',visible:w=>w.mode!=='remote'},{label:'交回样品',run:'archiveSample',ready:w=>w.mode==='remote',visible:w=>w.mode==='remote'}],done:w=>!!assaySamples(state(w))[i]});
const experiment=(i,title)=>({id:`H-${i+4}`,required:true,title,icon:'lab',keys:['F'],pose:'thinking',say:'回化验台启动。关面板等设备完成，低电先充电。',target:lab,actions:[{label:title,run:'startAssay',ready:w=>w.mode==='walk'&&w.inHome},{label:'查看实验',run:'inspectAssay'}],done:w=>(state(w).assay?.runs?.length||0)>i});
export const ASSAY_ACTIONS=['installAssay','startAssay','readAssay','inspectAssay'];
export const ASSAY_DECK=[
 {id:'H-0',required:true,big:true,available:w=>!!w.homeScene&&!!w.survival?.assay,title:'两杯水的对照',icon:'lab',event:'accept',lines:[{pose:'thinking',say:'来源复核结束了。现在重新取两份有质量记录的样品。'},{pose:'pointing-tablet',say:'先做空白，再用同样条件处理两份样品。设备用营地电，实验水封存。'}]},
 collect(0),collect(1),
 {id:'H-2b',required:true,title:'结束遥控',icon:'steps',keys:[],pose:'approve',say:'两份样品已归档。结束遥控，回化验台。',target:()=>null,action:{label:'结束遥控',run:'endRemote',ready:w=>w.mode==='remote'},done:w=>w.mode==='walk'},
 {id:'H-3',required:true,title:'核对设备',icon:'lab',keys:['F'],pose:'thinking',say:'核对称量器、三只杯子，连接水务装置。',target:lab,action:{label:'核对实验设备',run:'installAssay',ready:w=>w.mode==='walk'&&w.inHome},done:w=>!!state(w).assay?.installed},
 experiment(0,'空白实验'),experiment(1,'基线实验'),experiment(2,'另一样实验'),
 {id:'H-7',required:true,title:'比较结果',icon:'lab',keys:['F'],pose:'thinking',say:'看两份样品实际捕集了多少水，读完确认报告。',target:lab,action:{label:'打开对照报告',run:'inspectAssay'},done:w=>!!state(w).assay?.read},
 {id:'H-end',required:true,big:true,title:'有限的结论',icon:'lab',event:'accept',button:'继续探索',lines:[{pose:'approve',say:'质量、捕集液和耗电都已记录。两份样品可以同条件比较。'},{pose:'thinking',say:'这仍不证明整片矿藏连续，也不证明实验水能喝。重复和深度测量以后再做。'}]}
];
