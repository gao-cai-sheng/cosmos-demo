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
