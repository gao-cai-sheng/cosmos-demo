// A single sealed starter cartridge in the existing rack; author teaching parameters.
export const NURSERY=Object.freeze({waterL:.4,reserveL:.3,seeds:12,batchSeeds:2,cartridges:1,kw:.12,seconds:120,reserveKWh:8});
export const freshNursery=()=>({checked:false,filled:false,sown:false,elapsed:0,kwh:0,inspected:false});
export function normalizeNursery(raw={}){
 raw=raw||{};
 const checked=raw.checked===true,filled=checked&&raw.filled===true,sown=filled&&raw.sown===true;
 const elapsed=sown&&Number.isFinite(raw.elapsed)?Math.max(0,Math.min(NURSERY.seconds,raw.elapsed)):0;
 return {checked,filled,sown,elapsed,kwh:elapsed*NURSERY.kw/120,inspected:elapsed===NURSERY.seconds&&raw.inspected===true};
}
export function nurseryAction(raw,type,c={}){
 const state=normalizeNursery(raw),result=(ok,reason='',changed=false,waterL=0)=>({state,ok,reason,changed,waterL});
 if(!c.eligible)return result(false,'先完成首批本地净水入库与艾琳简报。');
 if(c.frozen||c.mode!=='walk'||!c.inHome||!c.near)return result(false,'步行到家里的育苗架旁，关闭面板再操作。');
 if(type==='inspectNursery')return result(true,'',false);
 if(type==='checkNursery'){if(state.checked)return result(true);state.checked=true;}
 else if(type==='fillNursery'){
  if(state.filled)return result(true);
  if(!state.checked||!c.waterStored)return result(false,'先检查预装育苗盒，并将检测合格的本地水入库。');
  if(!Number.isFinite(c.cleanL)||c.cleanL+1e-9<NURSERY.waterL+NURSERY.reserveL)return result(false,'需要0.40 L试验水，并保留至少0.30 L本批净水；等待合格水入库。');
  state.filled=true;return result(true,'已转入0.40 L，保留本批净水；不代表生活供水已充足。',true,NURSERY.waterL);
 }else if(type==='sowNursery'){
  if(state.sown)return result(true);
  if(!state.filled)return result(false,'先给育苗盒定量注水。');
  if(!c.online||c.energy<=NURSERY.reserveKWh)return result(false,'先恢复电网并补足8 kWh生活储备以上电量。');
  state.sown=true;
 }else if(type==='verifyNursery'){
  if(state.inspected)return result(true);
  if(state.elapsed<NURSERY.seconds)return result(false,'还没有完成有效培养；缺电时保留批次，恢复供电后继续。');
  state.inspected=true;
 }else return result(false,'未知育苗操作。');
 return result(true,'',true);
}
export function tickNursery(raw,dt,{frozen=false,online=false,energy=0}={}){
 const state=normalizeNursery(raw);
 if(frozen||!state.sown||state.elapsed>=NURSERY.seconds||!Number.isFinite(dt)||dt<=0)return {state,spent:0,kw:0};
 if(!online||!Number.isFinite(energy)||energy<=NURSERY.reserveKWh)return {state,spent:0,kw:0,reason:'培养暂停：保留批次，恢复电网或等待太阳能回充。'};
 const seconds=Math.min(dt,NURSERY.seconds-state.elapsed,(energy-NURSERY.reserveKWh)*120/NURSERY.kw);
 state.elapsed+=seconds;state.kwh=state.elapsed*NURSERY.kw/120;
 return {state,spent:seconds*NURSERY.kw/120,kw:seconds>0?NURSERY.kw:0};
}
