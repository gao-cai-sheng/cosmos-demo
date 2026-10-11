export const SOLAR_RESEARCH_ACTIONS=['measureSolarBefore','measureSolarAfter','deferSolarMaintenance','readSolarResearch','inspectSolarResearch','isolateResearchSolar','cleanResearchSolar','reconnectResearchSolar','refreshSolarBefore','cancelResearchSolar'];
const r=w=>w.survival?.solarResearch||{},solar=w=>w.survival?.power?.solar||{},target=w=>w.inHome?w.door:w.survival?.targets?.solar;
const skip=w=>!!r(w).deferred;
export const SOLAR_RESEARCH_DECK=[
 {id:'Q-0',required:true,big:true,title:'清洁有用吗',icon:'power',event:'accept',lines:[{pose:'thinking',say:'阿玛拉想核对：清洁究竟恢复了多少发电？先记录面板，不要故意弄脏。'},{pose:'pointing-tablet',say:'原始功率受日照影响，报告会同时比较日照修正值。洁净面板可以暂不维护。'}]},
 {id:'Q-1',required:true,title:'记录前测',icon:'power',keys:['F'],pose:'thinking',say:'到阵列操作点按F，记录日照、积尘和功率。',target,action:{label:'记录清洁前状态',run:'measureSolarBefore'},recordAhead:true,done:w=>!!r(w).before},
 {id:'Q-2',required:true,title:'维护选择',icon:'power',keys:['F'],pose:'thinking',say:'洁净面板可暂不维护。有积尘先隔离光伏输入。',target,actions:[{label:'暂不维护',run:'deferSolarMaintenance',visible:w=>r(w).before?.dust<=.001},{label:'隔离光伏输入',run:'isolateResearchSolar',visible:w=>r(w).before?.dust>.001},{label:'查看记录 / 重测',run:'inspectSolarResearch'}],recordAhead:true,done:w=>skip(w)||!!solar(w).isolated},
 {id:'Q-3',required:true,title:'无水除尘',icon:'power',keys:['F'],pose:'pointing-tablet',say:'隔离后启动除尘。关闭面板，在现场等8秒。',target,actions:[{label:'启动无水除尘',run:'cleanResearchSolar'},{label:'查看维护记录',run:'inspectSolarResearch'}],recordAhead:true,done:w=>skip(w)||!!r(w).cleaned},
 {id:'Q-4',required:true,title:'恢复并网',icon:'power',keys:['F'],pose:'pointing-tablet',say:'除尘完成。恢复光伏并网，才能测发电。',target,action:{label:'恢复光伏并网',run:'reconnectResearchSolar'},recordAhead:true,done:w=>skip(w)||!!r(w).cleaned&&!solar(w).isolated},
 {id:'Q-5',required:true,title:'记录后测',icon:'power',keys:['F'],pose:'thinking',say:'白昼并网后复测。日照不同也要保留原始数值。',target,action:{label:'记录清洁后状态',run:'measureSolarAfter'},recordAhead:true,done:w=>skip(w)||!!r(w).after},
 {id:'Q-6',required:true,title:'核对收益',icon:'power',keys:['F'],pose:'thinking',say:'看清原始功率和日照修正值，再确认结果。',target,action:{label:'打开清洁对照报告',run:'inspectSolarResearch'},recordAhead:true,done:w=>!!r(w).read},
 {id:'Q-end',required:true,big:true,title:'按需维护',icon:'power',event:'accept',button:'继续探索',lines:[{pose:'approve',say:'阿玛拉收到了记录。清洁或暂不维护，都应以当前面板状态为依据。'},{pose:'thinking',say:'这只是现有模拟的日照修正。温度、传感器误差和长期维护周期还没有验证。'}]}
];
