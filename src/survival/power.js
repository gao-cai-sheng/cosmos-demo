// Teaching values, not hardware specifications. One simulated hour = 120 seconds.
export const SITES=[{id:'west',name:'西侧缓坡',x:-22,z:26},{id:'east',name:'东侧开阔地',x:24,z:26},{id:'north',name:'北侧台地',x:24,z:-14}];
export const POWER_CARGO={x:-7,z:10};
export const ROVER_BATTERY_KWH=5;
export const ROVER_CHARGER_KW=36;
export const freshPower=()=>({started:false,plan:null,site:null,released:false,installed:false,links:[],online:false,energy:48,hours:0});
export function normalizePower(raw){const s=freshPower();if(!raw?.started)return s;s.started=true;s.plan=SITES.some(p=>p.id===raw.plan)?raw.plan:null;s.site=raw.site===s.plan?s.plan:null;s.released=raw.released===true||raw.installed===true;s.installed=s.released&&!!s.site&&raw.installed===true;s.links=s.installed?['solar','bus'].filter(x=>(Array.isArray(raw.links)?raw.links:[]).includes(x)):[];s.online=s.links.length===2&&raw.online===true;s.energy=Number.isFinite(raw.energy)?Math.max(0,Math.min(60,raw.energy)):48;s.hours=Number.isFinite(raw.hours)?Math.max(0,raw.hours):0;return s;}
export function equipment(id){const s=SITES.find(p=>p.id===id);return s?{solar:{x:s.x,z:s.z-5},battery:{x:s.x+6,z:s.z+4},bus:{x:s.x+6,z:s.z+10}}:null;}
export const cableUsed=s=>s.links.reduce((sum,id)=>sum+(id==='solar'?12:6),0);
export function survey(site,heightAt){let slope=0;for(const x of [-6,0,6])for(const z of [-6,0,6]){for(const [dx,dz] of [[2,0],[0,2]])slope=Math.max(slope,Math.atan2(Math.abs(heightAt(site.x+x+dx,site.z+z+dz)-heightAt(site.x+x,site.z+z)),2)*180/Math.PI);}return {slope,ok:Number.isFinite(slope)&&slope<=16};}
export function powerAction(raw,a,{eligible,outside,player,heightAt}){
 const s=normalizePower(raw),near=p=>p&&Math.hypot(player.x-p.x,player.z-p.z)<=3;
 if(!eligible)return s;
 if(a.type==='start-power')s.started=true;
 if(!s.started)return s;
 if(a.type==='plan-site'&&!s.installed&&SITES.some(p=>p.id===a.id)){s.plan=a.id;s.site=null;}
 if(a.type==='release-power-cargo'&&outside&&near(POWER_CARGO))s.released=true;
 const site=SITES.find(p=>p.id===s.plan),eq=equipment(s.site);
 if(a.type==='survey-site'&&outside&&near(site)&&survey(site,heightAt).ok)s.site=s.plan;
 if(a.type==='install-power'&&s.released&&outside&&near(site)&&s.site===s.plan&&survey(site,heightAt).ok)s.installed=true;
 if(a.type==='connect-solar'&&s.installed&&outside&&near(eq?.battery)&&!s.links.includes('solar'))s.links.push('solar');
 if(a.type==='connect-bus'&&s.installed&&outside&&near(eq?.bus)&&!s.links.includes('bus'))s.links.push('bus');
 if(a.type==='commission-power'&&outside&&near(eq?.bus)&&s.links.length===2)s.online=true;
 return normalizePower(s);
}
export function tickPower(raw,seconds){const s=normalizePower(raw);if(!s.started||!s.installed||!Number.isFinite(seconds)||seconds<=0)return s;const hours=seconds/120;s.hours+=hours;const generation=s.links.includes('solar')?4:0,load=s.online?.2:0;s.energy=Math.max(0,Math.min(60,s.energy+(generation-load)*hours));return s;}
export function chargeRoverFromGrid(raw,roverPercent,seconds){
 const power=normalizePower(raw),percent=Number.isFinite(roverPercent)?Math.max(0,Math.min(100,roverPercent)):0;
 if(!power.online||!Number.isFinite(seconds)||seconds<=0||power.energy<=0||percent>=100)return {power,roverPercent:percent,kwh:0};
 const need=(100-percent)/100*ROVER_BATTERY_KWH;
 const offered=ROVER_CHARGER_KW*(seconds/120);
 const kwh=Math.max(0,Math.min(need,offered,power.energy));
 power.energy=Math.max(0,power.energy-kwh);
 return {power,roverPercent:Math.min(100,percent+kwh/ROVER_BATTERY_KWH*100),kwh};
}
