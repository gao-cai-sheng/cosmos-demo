// Teaching transport budgets, not certified ARES engineering specifications.
export const ARES_LOGISTICS=Object.freeze({limitKg:250,bay:[2.5,3.09,4.17],capacityKWh:30,initialKWh:24,kWhPerKm:.35,auxKW:.1,chargeKW:6,reserveKWh:8,secondsPerHour:120});
export function normalizeDrive(raw={}){raw=raw||{};return {energy:Number.isFinite(raw.energy)?Math.max(0,Math.min(30,raw.energy)):24,usedKWh:Number.isFinite(raw.usedKWh)?Math.max(0,raw.usedKWh):0,chargedKWh:Number.isFinite(raw.chargedKWh)?Math.max(0,raw.chargedKWh):0,metres:Number.isFinite(raw.metres)?Math.max(0,raw.metres):0};}
export function cargoFits({massKg,size},occupied=false){
 if(occupied)return {ok:false,reason:'货位已占用，请先卸货或卸下 MU-7。'};
 if(!Number.isFinite(massKg)||massKg<=0||!Array.isArray(size)||size.length!==3||size.some(v=>!Number.isFinite(v)||v<=0))return {ok:false,reason:'货物质量或尺寸无效。'};
 if(massKg>ARES_LOGISTICS.limitKg)return {ok:false,reason:'货物超过250 kg教学货位上限，请拆批运输。'};
 if(size.some((v,i)=>v>ARES_LOGISTICS.bay[i]))return {ok:false,reason:'货物超出货位净空，请换包装或拆批。'};
 return {ok:true,reason:''};
}
export function cargoManifest(w={},roverLoaded=false){
 if(w.cargo==='aboard')return {label:'水务设备 · 已固定',massKg:220,size:[1.76,1.1,3.1]};
 if(w.feedAboard)return {label:'试验原料 · 已固定',massKg:50,size:[1.76,1.1,3.1]};
 return {label:roverLoaded?'MU-7 · 已固定':'货位空',massKg:roverLoaded?null:0,size:null};
}
export function driveRate(massKg=0){return ARES_LOGISTICS.kWhPerKm*(1+Math.max(0,Number.isFinite(massKg)?massKg:0)/ARES_LOGISTICS.limitKg);}
export function routeEnergy(metres,massKg=0){return Math.max(0,metres)/1000*driveRate(massKg)+ARES_LOGISTICS.auxKW*Math.max(0,metres)/10/ARES_LOGISTICS.secondsPerHour;}
export function driveAllowance(raw,dt,massKg=0){const s=normalizeDrive(raw);if(!Number.isFinite(dt)||dt<=0)return 0;return Math.max(0,s.energy-ARES_LOGISTICS.auxKW*dt/120)/driveRate(massKg)*1000;}
export function settleDrive(raw,metres,dt,massKg=0){const s=normalizeDrive(raw);if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(metres)||metres<0)return s;const distance=Math.min(metres,driveAllowance(s,dt,massKg)),cost=Math.min(s.energy,distance/1000*driveRate(massKg)+ARES_LOGISTICS.auxKW*dt/120);s.energy-=cost;s.usedKWh+=cost;s.metres+=distance;return s;}
export function chargeDrive(raw,gridEnergy,dt,{online=false,frozen=false}={}){const s=normalizeDrive(raw);const kwh=online&&!frozen&&Number.isFinite(dt)&&dt>0&&Number.isFinite(gridEnergy)?Math.max(0,Math.min(30-s.energy,6*dt/120,gridEnergy-8)):0;s.energy+=kwh;s.chargedKWh+=kwh;return {drive:s,kwh};}
/** Shared ledger: home and distant scenes use the same journey-owned drive battery. */
export function createDriveGrid({read,write,online=()=>false,frozen=()=>false}){
 return {get drive(){return normalizeDrive(read().ares);},consumeDrive(metres,dt,massKg){const s=read();s.ares=settleDrive(s.ares,metres,dt,massKg);write(s);},chargeDrive(dt){const s=read(),r=chargeDrive(s.ares,s.power.energy,dt,{online:online(),frozen:frozen()});if(r.kwh>0){s.ares=r.drive;s.power.energy-=r.kwh;write(s);}return r.kwh;}};
}
