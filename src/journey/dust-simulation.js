// Local visual dust, metres / seconds. These rates are particles/s, not eroded kg/s.
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:0));
export function wheelDustRate({contact=false,stowed=false,speed=0,spin=0,slip=0,load=1,erodibility=1}={}){
 if(!contact||stowed)return 0;
 const motion=Math.max(Math.abs(speed),Math.abs(spin)*clamp(slip));
 return clamp(erodibility)*clamp(load,0,2)*Math.min(90,Math.max(0,motion-.08)*(2.2+5*clamp(slip)));
}
export function plumeDustRate({height=0,thrust=0,erodibility=1}={}){
 const h=clamp(height,0,120)/120;
 return 140*clamp(thrust)*clamp(erodibility)*(1-h)*(1-h);
}
export function createDustSimulation({coarse=768,fine=384,seed=2077}={}){
 const max=coarse+fine,fields=['x','y','z','vx','vy','vz','age','life','size','grow','rotation','noise','kind'];
 const s={max,count:0,emitted:0};for(const key of fields)s[key]=new Float32Array(max);
 const credit=new Map(),counts=[0,0];let rng=seed>>>0;
 const random=()=>{rng+=0x6D2B79F5;let t=rng;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 s.emit=(id,rate,dt,p)=>{
  if(!(dt>0)||!(rate>0))return;
  const amount=(credit.get(id)||0)+rate*dt,n=Math.floor(amount+1e-8);credit.set(id,amount-n);
  const kind=p.kind===0?0:1,limit=kind?fine:coarse;
  for(let k=0;k<n;k++){
   if(!limit)break;
   let i;
   if(counts[kind]>=limit){
    // Reclaim the most faded particle of this layer. A full pool must not starve a running engine.
    let oldest=-1;i=-1;for(let j=0;j<s.count;j++)if(s.kind[j]===kind&&s.age[j]/s.life[j]>oldest){oldest=s.age[j]/s.life[j];i=j;}
    if(i<0)break;
   }else{i=s.count++;counts[kind]++;}
   const a=random()*Math.PI*2,r=Math.sqrt(random())*(p.spread||0),jitter=p.jitter??.5;
   // Interpolation distributes emissions along the travelled path. Adapters suppress teleport trails.
   const t=(k+random())/Math.max(1,n),from=p.from||p;
   s.x[i]=from.x+(p.x-from.x)*t+Math.cos(a)*r;s.y[i]=p.y+(p.rise||0)*random();s.z[i]=from.z+(p.z-from.z)*t+Math.sin(a)*r;
   const radial=p.radial||0;
   s.vx[i]=(p.vx||0)+Math.cos(a)*(radial+random()*jitter);
   s.vy[i]=(p.vy||0)+random()*jitter;s.vz[i]=(p.vz||0)+Math.sin(a)*(radial+random()*jitter);
   s.age[i]=0;s.life[i]=(p.life||4)*(.75+random()*.5);s.size[i]=(p.size||1)*(.7+random()*.6);
   // Per-particle spread rate. A wheel puff and a landing plume start at very different sizes,
   // so one shared growth rate would inflate the big one into a mushroom cloud.
   s.grow[i]=p.grow??.35;
   s.rotation[i]=random()*Math.PI*2;s.noise[i]=random();s.kind[i]=kind;s.emitted++;
  }
 };
 s.update=(dt,heightAt,wind={x:0,z:0})=>{
  if(!(dt>0))return;dt=Math.min(dt,.1);
  for(let i=0;i<s.count;){
   s.age[i]+=dt;const fine=s.kind[i]===1;
   if(fine){
    const a=1-Math.exp(-dt*.42);s.vx[i]+=(wind.x-s.vx[i])*a;s.vz[i]+=(wind.z-s.vz[i])*a;
    // 0.06 m/s terminal fall: Mars gravity is 0.38 g and the air is thin, so fines hang for tens of seconds.
    s.vy[i]+=(-.06-s.vy[i])*(1-Math.exp(-dt*.5));
   }else s.vy[i]-=3.71*dt;
   s.x[i]+=s.vx[i]*dt;s.y[i]+=s.vy[i]*dt;s.z[i]+=s.vz[i]*dt;
   const floor=heightAt(s.x[i],s.z[i])+.035;
   if(s.y[i]<floor){
    s.y[i]=floor;s.vy[i]=Math.max(0,s.vy[i]*-.18);
    // A grain that lands skids before it settles; it must not blink out on contact.
    if(!fine){s.vx[i]*=.55;s.vz[i]*=.55;s.life[i]=Math.min(s.life[i],s.age[i]+.55);}
   }
   if(s.age[i]>=s.life[i]){
    counts[s.kind[i]]--;const last=--s.count;for(const key of fields)s[key][i]=s[key][last];continue;
   }i++;
  }
 };
 s.clear=()=>{s.count=0;counts.fill(0);credit.clear();};
 s.counts=()=>({coarse:counts[0],fine:counts[1]});
 return s;
}
