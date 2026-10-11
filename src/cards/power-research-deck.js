export const POWER_RESEARCH_ACTIONS=['startPowerResearch','inspectPowerResearch','readPowerResearch'];
const target=w=>w.inHome?w.door:w.survival?.targets?.bus;
export const POWER_RESEARCH_DECK=[
 {id:'P-0',required:true,big:true,title:'供电科研',icon:'power',event:'accept',lines:[{pose:'thinking',say:'阿玛拉从轨道发来第一项记录任务：我们知道电池还能撑多久吗？'},{pose:'pointing-tablet',say:'到配电箱启动短时记录。先停止车辆充电，等其他实验完成，只记录营地基础负载。'}]},
 {id:'P-1',required:true,title:'开始记录',icon:'power',keys:['F'],pose:'pointing-tablet',say:'舱外走到配电箱，按F打开记录，再启动。',target,action:{label:'启动供电记录',run:'startPowerResearch'},recordAhead:true,done:w=>!!w.survival?.powerResearch?.started},
 {id:'P-2',required:true,title:'观察供电',icon:'power',keys:[],pose:'thinking',liveSay:true,say:w=>`有效记录 ${Math.floor(w.survival?.powerResearch?.elapsed||0)}/60秒。关面板继续，其他用电时暂停。`,target:()=>null,action:{label:'查看记录',run:'inspectPowerResearch'},recordAhead:true,done:w=>w.survival?.powerResearch?.elapsed>=60},
 {id:'P-3',required:true,title:'核对预算',icon:'power',keys:['F'],pose:'thinking',say:'回配电箱，检查收支和无光照续航，再确认报告。',target,action:{label:'查看供电报告',run:'inspectPowerResearch'},recordAhead:true,done:w=>!!w.survival?.powerResearch?.read},
 {id:'P-end',required:true,big:true,title:'先量再扩建',icon:'power',event:'accept',button:'继续探索',lines:[{pose:'approve',say:'阿玛拉收到了记录。现在的预算有了可核对的依据。'},{pose:'thinking',say:'这是短时、基础负载的教学记录。完整昼夜、故障切换和扩容仍要继续验证。'}]}
];
