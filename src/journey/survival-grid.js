import {SAVE_KEY,normalize} from '../survival/state.js';
import {chargeRoverFromGrid,equipment} from '../survival/power.js';

export function createSurvivalGrid(storage=globalThis.localStorage){
  let raw=null,state=null,dirty=false;
  try{
    const text=storage?.getItem?.(SAVE_KEY);
    if(text){raw=JSON.parse(text);state=normalize(raw);}
  }catch{raw=null;state=null;}

  const online=()=>!!state?.power?.online;
  return {
    get available(){return online();},
    get home(){if(!online())return null;const eq=equipment(state.power.site);return eq?{...eq.bus}:null;},
    get energy(){return online()?state.power.energy:null;},
    charge(roverPercent,seconds){
      if(!online())return {roverPercent:Number.isFinite(roverPercent)?Math.max(0,Math.min(100,roverPercent)):0,kwh:0};
      const result=chargeRoverFromGrid(state.power,roverPercent,seconds);
      if(result.kwh>0){state.power=result.power;dirty=true;}
      return {roverPercent:result.roverPercent,kwh:result.kwh};
    },
    flush(){
      if(!dirty||!raw||!storage?.setItem)return false;
      try{raw={...raw,power:state.power};storage.setItem(SAVE_KEY,JSON.stringify(raw));dirty=false;return true;}catch{return false;}
    }
  };
}
