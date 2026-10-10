// Authored local-orbit support. No language model or invented resource stock.
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z,heading:Number.isFinite(p.heading)?p.heading:0}:null;
export const CREW_SUPPORT=Object.freeze({amara:{name:'阿玛拉',reply:'账本收到。先保住现有生活负载；下降前还需要确认住处和接人的载具。'},isa:{name:'伊莎',reply:'申请收到。把作业和储备记录留好；先确认生活保障与转移条件，我在轨道待命。'},murata:{name:'村田航',reply:'申请收到。保留幼苗的批次记录。下降前先确认住处、用水和接运安排。'}});
export function normalizeSupport(raw){
 const crew={};for(const id of Object.keys(CREW_SUPPORT))if(Number.isFinite(raw?.crew?.[id]?.at))crew[id]={at:Math.max(0,raw.crew[id].at),status:'pending'};
 const r=raw?.rescue;let rescue=null;
 if(r&&Number.isFinite(r.at)&&point(r.origin)&&Number.isFinite(r.site?.lat)&&Number.isFinite(r.site?.lon)){
  const target=point(r.target);const status=['requested','enroute','landed','aboard'].includes(r.status)?r.status:'requested';
  rescue={at:r.at,site:{lat:r.site.lat,lon:r.site.lon},origin:point(r.origin),target,status:target?status:'requested',confirmedAt:Number.isFinite(r.confirmedAt)?r.confirmedAt:null};
 }
 return {crew,rescue};
}
export function rescueInScene(r,site){return !!r&&Math.abs(r.site.lat-site.lat)<.001&&Math.abs(r.site.lon-site.lon)<.001;}
export function shipmentSupport(w){
 const status={orbit:'轨道待命',falling:'请求已确认 · 本批已发运',ground:'落稳定位已确认 · 等待接货',aboard:'设备在ARES车载货位',home:'已卸货并进入营地库存'}[w?.cargo]||'尚未申请';
 return {status,confirmed:['ground','aboard','home'].includes(w?.cargo),canLocate:w?.cargo==='ground'||w?.cargo==='aboard',point:w?.cargo==='ground'?w.stop:w?.cargo==='aboard'?w.home:null};
}
