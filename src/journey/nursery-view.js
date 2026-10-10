import {NURSERY,normalizeNursery} from './nursery.js';
/** Readable state shared by the HUD, task card and batch inspector. */
export function nurseryView(raw,{online=false,energy=0,frozen=false}={}){
 const n=normalizeNursery(raw),remaining=Math.ceil(Math.max(0,NURSERY.seconds-n.elapsed));
 let stage,label,hint;
 if(n.inspected){stage='verified';label='幼苗已验收';hint='本批试验完成；尚不可收获，其余五盆未启用。';}
 else if(n.elapsed>=NURSERY.seconds){stage='ready';label='幼苗待验收';hint='步行回到育苗架，按 F 记录这一批幼苗。';}
 else if(!n.checked){stage='check';label='待检查';hint='到舱内育苗架，核对预装种子和营养基质盒。';}
 else if(!n.filled){stage='fill';label='待注水';hint='转入0.40 L已检测净水；本批净水罐至少保留0.30 L。';}
 else if(!n.sown){stage='sow';label='待播种';hint='播下2粒种子并使用1盒营养基质，保留10粒备用种子。';}
 else if(!online){stage='offline';label='培养暂停 · 电网未投运';hint='先恢复营地电网；投入与培养进度已保留。';}
 else if(energy<=NURSERY.reserveKWh){stage='low';label='培养暂停 · 生活储备';hint='主电池需高于8 kWh。检查光伏、等待回充，暂停非必要充电。';}
 else if(frozen){stage='frozen';label='培养暂停 · 游戏冻结';hint='关闭账本、地图或暂停菜单后继续；后台不计培养时间。';}
 else{stage='growing';label='培养中';hint='可离开育苗架；有效培养结束后回来验收。';}
 return {stage,label,hint,remaining,progress:n.elapsed/NURSERY.seconds,kw:stage==='growing'?NURSERY.kw:0,
  next:!n.checked?'checkNursery':!n.filled?'fillNursery':!n.sown?'sowNursery':n.elapsed>=NURSERY.seconds&&!n.inspected?'verifyNursery':null};
}
