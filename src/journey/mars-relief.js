const SEED = 20521107;
const LEVELS = [1,1.5,2];

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
function hash2(x,y,s){
  let h=x*374761393+y*668265263+s*1274126177;
  h=(h^(h>>>13))>>>0;h=Math.imul(h,1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function vnoise2(x,y,s){
  const xi=Math.floor(x),yi=Math.floor(y),xf=smooth(x-xi),yf=smooth(y-yi);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);
  return (a*(1-xf)+b*xf)*(1-yf)+(c*(1-xf)+d*xf)*yf;
}
const ridge2=(x,y,s)=>1-Math.abs(vnoise2(x,y,s)*2-1);

// Authored local geological experiment, not an observed DEM or a global height multiplier.
// Elliptical mesas have broad caps and continuous shoulders; the low corridor between them stays open.
export const MESA_FEATURES = Object.freeze([
  {x:-780,z:-1100,rx:420,rz:620,height:92},
  {x:850,z:-1500,rx:540,rz:720,height:128},
  {x:-1850,z:-2450,rx:700,rz:930,height:155},
  {x:2300,z:350,rx:680,rz:1050,height:110},
].map(Object.freeze));

export function geologicalRelief(x,z) {
  // A full ship-sized arrival neighbourhood, with a gradual return to natural terrain.
  const radius=Math.hypot(x,z);
  if(radius<=240)return 0;
  const safe=smooth(clamp((radius-240)/280));
  let height=0;
  for(const mesa of MESA_FEATURES){
    const dx=(x-mesa.x)/mesa.rx,dz=(z-mesa.z)/mesa.rz;
    const r=Math.hypot(dx,dz);
    if(r>=1.3)continue;
    // Low-frequency edge warping breaks perfect ellipses while leaving the broad cap intact.
    const warp=(vnoise2(x/160,z/160,SEED+80)-.5)*.12;
    const edge=r+warp*smooth(clamp((r-.35)/.3));
    const cap=1-smooth(clamp((edge-.58)/.32));
    const apron=1-smooth(clamp((edge-.82)/.42));
    height+=mesa.height*(.78*cap+.22*apron);
  }
  return height*safe;
}

export const FOOTHILL_PEAKS=Object.freeze([
  {x:-360,z:-650,rx:235,rz:330,height:205},
  {x:-610,z:-820,rx:290,rz:390,height:250},
  {x:370,z:-740,rx:240,rz:340,height:220},
  {x:640,z:-520,rx:270,rz:310,height:185},
].map(Object.freeze));

export function foothillRelief(x,z){
  if(Math.hypot(x,z)<=240)return 0;
  let ridge=0;
  for(const p of FOOTHILL_PEAKS){
    const warp=(vnoise2(x/130,z/130,SEED+98)-.5)*.12;
    const dx=(x-p.x)/p.rx+warp,dz=(z-p.z)/p.rz-warp*.6,r2=dx*dx+dz*dz;
    if(r2>=1)continue;
    const r=Math.sqrt(r2);
    const shape=.82*Math.pow(1-r,1.15)+.18*Math.pow(1-r2,2);
    const ribs=1+.18*(ridge2(x/75,z/165,SEED+95)-.5);
    ridge=Math.max(ridge,p.height*shape*ribs);
  }
  // Join each pair with a lower saddle/backbone rather than isolated cone-like hills.
  for(const [a,b] of [[FOOTHILL_PEAKS[0],FOOTHILL_PEAKS[1]],[FOOTHILL_PEAKS[2],FOOTHILL_PEAKS[3]]]){
    const vx=b.x-a.x,vz=b.z-a.z;
    const t=clamp(((x-a.x)*vx+(z-a.z)*vz)/(vx*vx+vz*vz));
    const d=Math.hypot(x-a.x-vx*t,z-a.z-vz*t);
    const shoulder=Math.pow(clamp(1-d/250),1.7);
    ridge=Math.max(ridge,shoulder*(95+20*Math.sin(t*Math.PI)));
  }
  return ridge*smooth(clamp((Math.hypot(x,z)-240)/160))+geologicalRelief(x,z);
}

export function normalizeReliefLevel(value,fallback=1.5){
  const n=Number(value);
  return LEVELS.includes(n)?n:fallback;
}

export function reliefGain(strength){
  return clamp(normalizeReliefLevel(strength)-1,0,1);
}

export function landingSafeMask(x,z){
  const r=Math.hypot(x,z);
  if(r<=120)return 0;
  if(r>=340)return 1;
  return smooth((r-120)/220);
}

/**
 * Added 30–1500 m morphology only. MOLA remains the large-scale authority.
 * strength=1 is exactly zero so the legacy terrain remains available as a comparison preset.
 */
export function mediumRelief({x,z,slope=0,strength=1.5}){
  const gain=reliefGain(strength);
  if(gain===0)return 0;
  const mask=landingSafeMask(x,z);
  if(mask===0)return 0;

  // Wind-aligned coordinates: broad rises are isotropic, erosional ribs are elongated.
  const wind=112*Math.PI/180,c=Math.cos(wind),s=Math.sin(wind);
  const u=x*c+z*s,v=-x*s+z*c;
  const steep=clamp(slope*8);
  let h=0;

  // 600–1500 m broken uplands and shallow regional swales.
  h+=(vnoise2(x/1450,z/1450,SEED)-.5)*92;
  h+=(vnoise2(x/720,z/720,SEED+1)-.5)*44;

  // 120–800 m yardang / erosional-rib family. The anisotropy keeps it from reading as lunar crater noise.
  h+=(ridge2(u/760,v/245,SEED+10)-.47)*(44+34*steep);
  h+=(ridge2((u+90)/360,(v-35)/118,SEED+11)-.48)*(22+20*steep);
  h+=(ridge2((u-40)/175,(v+25)/62,SEED+12)-.49)*(9+11*steep);

  // 30–180 m shallow channels and residual knolls; enough to affect route choice without making every metre impassable.
  const channel=vnoise2((u+180)/150,(v-60)/48,SEED+20);
  h-=Math.max(0,.46-channel)*16;
  h+=(vnoise2(x/82,z/82,SEED+21)-.5)*7.5;
  h+=(vnoise2(x/41,z/41,SEED+22)-.5)*3.2;

  return h*gain*mask*(0.72+0.58*steep);
}

export const RELIEF_LEVELS=Object.freeze([...LEVELS]);
