// Moon-rover's percentage-per-second tuning; game time, not a physical battery specification.
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function powerStep(state, input, dt) {
  dt=Number.isFinite(dt)?clamp(dt,0,.1):0;
  const light=clamp(input.light||0,0,1), panel=clamp(input.panel||0,0,1);
  const charge=light*panel*1.35;
  const drain=.06+clamp(input.motor||0,0,1)*.42+clamp(input.lamp||0,0,1)*.14+(state.heat < -30?.22:0)+(input.drilling?9/4.2:0);
  const before=state.power;
  state.power=clamp(state.power+(charge-drain)*dt,0,100);
  state.heat+=( -58+86*light+(input.motor||0)*14+(input.drilling?10:0)-state.heat)*Math.min(1,dt*.08);
  state.net=dt>0?(state.power-before)/dt:0;
  return .18+.82*clamp(state.power/25,0,1);
}
export function restoreRoverOps(data={}) {
  const num=(v,f,a,b)=>Number.isFinite(v)?clamp(v,a,b):f;
  const points=v=>Array.isArray(v)?v.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<1e7&&Math.abs(p.z)<1e7):[];
  return {power:num(data?.power,100,0,100),heat:num(data?.heat,10,-100,100),net:0,
    environment:['auto','dawn','noon','dusk','night'].includes(data?.environment)?data.environment:'auto',
    integrity:num(data?.integrity,100,0,100),elapsed:num(data?.elapsed,0,0,1e9),
    supportPower:num(data?.supportPower,100,0,100),archived:num(data?.archived,0,0,100000),
    home:points(data?.home?[data.home]:[])[0]||null,
    panel:data?.panel!==false,headlights:data?.headlights===true,
    samples:points(data?.samples).slice(0,6),relays:points(data?.relays).slice(0,3),
    returns:points(data?.returns).slice(-64),path:points(data?.path).slice(-2048)};
}

// Original moon-rover home services: radius 9.5 m; power +6%/s, hull +9%/s.
export function serviceHome(state, position, dt, loaded=false) {
  if(loaded||!state.home||!(dt>0)||Math.hypot(position.x-state.home.x,position.z-state.home.z)>=9.5)return false;
  const before=state.power;state.power=clamp(state.power+6*dt,0,100);state.net+=(state.power-before)/dt;
  state.integrity=clamp(state.integrity+9*dt,0,100);
  state.archived+=state.samples.length;state.samples=[];
  return true;
}
export function serviceGridHome(state,position,dt,loaded=false,grid){
  if(loaded||!grid?.available||!state.home||!(dt>0)||Math.hypot(position.x-state.home.x,position.z-state.home.z)>=9.5)return false;
  const before=state.power,result=grid.charge(state.power,dt);state.power=clamp(result.roverPercent,0,100);state.net+=(state.power-before)/dt;
  state.integrity=clamp(state.integrity+9*dt,0,100);
  state.archived+=state.samples.length;state.samples=[];
  return true;
}
