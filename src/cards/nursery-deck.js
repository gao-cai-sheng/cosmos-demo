import {nurseryView} from '../journey/nursery-view.js';
const n=w=>w.survival?.nursery;
const target=w=>w.inHome?w.survival?.targets?.garden:w.door;
const step=(id,title,run,done,say)=>({id,required:true,title,icon:'nursery',keys:['F'],pose:'pointing-tablet',want:()=> 'station',target,say,
 action:{label:title,run,ready:w=>w.mode==='walk'&&w.inHome},done});
export const NURSERY_ACTIONS=['checkNursery','fillNursery','sowNursery','verifyNursery','inspectNursery'];
export const NURSERY_DECK=[
 {id:'A-0',required:true,big:true,available:w=>!!w.homeScene&&!!n(w),title:'先育一小批苗',icon:'nursery',event:'accept',lines:[
  {pose:'thinking',say:'这批水还很少。先做一盒育苗试验，不急着建大花园。'},
  {pose:'pointing-tablet',say:'植物学家村田航还在轨道待命。这一盒先由你试种，留下用水、用电和幼苗记录。'},
  {pose:'pointing-tablet',say:'家里的育苗架有一盒密封种子和营养基质。检查后，用零点四升本地水。'},
  {pose:'reassure',say:'剩下的水留在净水罐。鲜菜、收获和持续供水，我们还要继续做。'}]},
 step('A-1','检查育苗盒','checkNursery',w=>!!n(w)?.checked,'到育苗架按 F，核对有限种子与营养基质。'),
 step('A-2','定量注水','fillNursery',w=>!!n(w)?.filled,'按 F 转入零点四升净水。余量会留在罐里。'),
 step('A-3','播下两粒','sowNursery',w=>!!n(w)?.sown,'电量够了。按 F 播两粒，保留十粒备用种子。'),
 {id:'A-4',required:true,title:'等待幼苗',icon:'nursery',liveSay:true,keys:[],pose:'thinking',target,
  say:w=>{const v=nurseryView(n(w),{online:w.survival?.power?.online,energy:w.survival?.power?.energy});return v.stage==='low'||v.stage==='offline'?v.hint:`培养 ${Math.floor(v.progress*100)}%，还需 ${v.remaining} 秒有效培养。可以离开，完成后回来验收。`;},
  action:{label:'查看育苗账本',run:'inspectNursery',ready:()=>true},done:w=>(n(w)?.elapsed||0)>=120},
 step('A-5','验收幼苗','verifyNursery',w=>!!n(w)?.inspected,'回到育苗架按 F，记录这一批幼苗。现在还不能收获。'),
 {id:'A-end',required:true,big:true,title:'第一批幼苗',icon:'nursery',event:'accept',button:'好',lines:[
  {pose:'approve',say:'两粒种子成了幼苗。这是一次小试验，还不是食物自给。'},
  {pose:'pointing-tablet',say:'本批用了零点四升水和有限营养基质。下一步，要准备持续水源和更大的种植区。'}]},
];
