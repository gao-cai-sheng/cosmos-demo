import {normalizeDrive,routeEnergy} from './ares-logistics.js';

// Author teaching budgets. Neither reactor engineering nor propulsion simulation.
export const SHIP_POWER=Object.freeze({capacityKWh:120,initialKWh:96,reserveKWh:24,reactorKW:10,loadKW:1,chargeKW:6,efficiency:.9,reach:90,secondsPerHour:120});
export const EXPEDITION=Object.freeze({workKWh:.5,emergencyKWh:2,margin:1.2,returnMassKg:250});
const finite=(v,d)=>Number.isFinite(v)?v:d;
export function normalizeShip(raw={}){
 raw=raw||{};
 return {energy:Math.max(0,Math.min(120,finite(raw.energy,96))),reactor:raw.reactor!==false,generatedKWh:Math.max(0,finite(raw.generatedKWh,0)),usedKWh:Math.max(0,finite(raw.usedKWh,0)),exportedKWh:Math.max(0,finite(raw.exportedKWh,0))};
}
export function tickShip(raw,dt,{frozen=false,present=true}={}){
 const ship=normalizeShip(raw);
 if(frozen||!present||!Number.isFinite(dt)||dt<=0)return ship;
 const hours=dt/120,load=Math.min(ship.energy+(ship.reactor?10*hours:0),hours);
 const generated=ship.reactor?Math.min(10*hours,120-ship.energy+load):0;
 ship.energy=Math.max(0,Math.min(120,ship.energy+generated-load));ship.generatedKWh+=generated;ship.usedKWh+=load;
 return ship;
}
export function transferShipCharge(rawShip,rawDrive,dt,{ready=false,frozen=false}={}){
 const ship=normalizeShip(rawShip),drive=normalizeDrive(rawDrive);
 const delivered=ready&&!frozen&&Number.isFinite(dt)&&dt>0?Math.max(0,Math.min(30-drive.energy,6*dt/120,(ship.energy-24)*.9)):0;
 const withdrawn=delivered/.9;
 ship.energy-=withdrawn;ship.exportedKWh+=withdrawn;drive.energy+=delivered;drive.chargedKWh+=delivered;
 return {ship,drive,delivered,withdrawn,loss:withdrawn-delivered};
}
export function expeditionBudget({outMetres,returnMetres,massKg=0,returnSource='',recovering=false}={}){
 const mass=Number.isFinite(massKg)?Math.max(0,massKg):250;
 if(!Number.isFinite(outMetres)||outMetres<0||!Number.isFinite(returnMetres)||returnMetres<0||!returnSource)return {ok:false,reason:'没有可通行的返程充电点；请让NX07落稳并留电，或恢复营地供电。'};
 const outbound=routeEnergy(outMetres,mass),back=recovering?0:routeEnergy(returnMetres,250),work=recovering?0:.5,margin=(outbound+back)*.2,emergency=2;
 return {ok:true,outbound,back,work,margin,emergency,total:outbound+back+work+margin+emergency,returnSource,returnMetres:recovering?0:returnMetres,recovering,unknownMass:!Number.isFinite(massKg)};
}
export function budgetText(b){return b?.ok?`去程 ${b.outbound.toFixed(2)} + 作业 ${b.work.toFixed(2)} + 返程 ${b.back.toFixed(2)} + 行驶余量 ${b.margin.toFixed(2)} + 应急 ${b.emergency.toFixed(2)} = ${b.total.toFixed(2)} kWh；返回${b.returnSource}。${b.unknownMass?'MU-7质量未知，按250 kg教学预算估算。':''}`:b?.reason||'先规划路线，检查返程电量。';}
export function budgetStatus(b,energy){
 if(!b?.ok)return b?.reason||'先规划路线，检查返程电量。';
 const available=Math.max(0,finite(energy,0)),spare=available-b.total;
 return spare<0?`电量不足：当前 ${available.toFixed(2)} kWh，任务需 ${b.total.toFixed(2)} kWh，缺 ${(-spare).toFixed(2)} kWh。先充电或缩短路线。`:spare<2?`余量偏紧：当前 ${available.toFixed(2)} kWh，预算外仅余 ${spare.toFixed(2)} kWh；建议先补电，减少载货或缩短路线。`:`电量可支持本次估算：当前 ${available.toFixed(2)} kWh，预算外余 ${spare.toFixed(2)} kWh。`;
}
export function expeditionRange(energy,massKg=0){
 const usable=Math.max(0,finite(energy,0)-.5-2),mass=Number.isFinite(massKg)?massKg:250;
 return usable/(1.2*(routeEnergy(1000,mass)+routeEnergy(1000,250)));
}
export function returnPowerAvailable(source,seconds){
 if(!Number.isFinite(seconds)||seconds<0)return false;
 // Reserve enough source power for a 2 kWh recovery charge. Camp forecast
 // assumes no sunlight and its known base load; changing loads require replanning.
 if(source.ship)return tickShip(source.ship,seconds).energy>=24+2/.9;
 return Number.isFinite(source.energy)&&source.energy-Math.max(2,finite(source.loadKW,2))*seconds/120>=8+2;
}

/** Bound to the same journey ledger in home and distant scenes. Connections are runtime-only. */
export function createShipGrid({read,write,frozen=()=>false}){
 return {
  get ship(){return normalizeShip(read().ship);},
  tickShip(dt,present=true){const s=read();s.ship=tickShip(s.ship,dt,{present,frozen:frozen()});write(s);},
  toggleReactor(){if(frozen())return false;const s=read();s.ship=normalizeShip(s.ship);s.ship.reactor=!s.ship.reactor;write(s);return true;},
  chargeShip(dt,ready){const s=read(),r=transferShipCharge(s.ship,s.ares,dt,{ready,frozen:frozen()});if(r.delivered){s.ship=r.ship;s.ares=r.drive;write(s);}return r.delivered;}
 };
}
