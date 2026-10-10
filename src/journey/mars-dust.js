import * as THREE from 'three';
import {createDustSimulation,wheelDustRate,plumeDustRate} from './dust-simulation.js';
import {getSettings} from './state.js';

const systems=new WeakMap();
const TIERS={low:{coarse:420,fine:340},standard:{coarse:1400,fine:1100},high:{coarse:2400,fine:1900}};
// A deterministic, locally generated opacity map. No external texture/asset dependency.
function dustTexture(){
 const n=128,c=document.createElement('canvas');c.width=c.height=n;const ctx=c.getContext('2d'),img=ctx.createImageData(n,n);
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 const noise=(x,y)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,a=u*u*(3-2*u),b=v*v*(3-2*v);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(i,j),hash(i+1,j),a),THREE.MathUtils.lerp(hash(i,j+1),hash(i+1,j+1),a),b);};
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=(x+.5)/n*2-1,v=(y+.5)/n*2-1,r=Math.hypot(u,v),i=(y*n+x)*4;
  const cloud=noise(x/19,y/19)*.65+noise(x/7+31,y/7)*.25+noise(x/3,y/3)*.1;
  img.data[i]=img.data[i+1]=img.data[i+2]=255;img.data[i+3]=255*Math.pow(Math.max(0,1-r*r),1.6)*(.25+cloud*.9);
 }
 ctx.putImageData(img,0,0);return new THREE.CanvasTexture(c);
}
function batch(max,texture,fine){
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setIndex([0,1,2,0,2,3]);geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
 const fields={aCenter:3,aShape:4};for(const [name,stride] of Object.entries(fields))geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(max*stride),stride).setUsage(THREE.DynamicDrawUsage));
 geometry.instanceCount=0;
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,fog:true,
  uniforms:{uTex:{value:texture},uSun:{value:new THREE.Vector3(0,1,0)},uLight:{value:new THREE.Color(1,1,1)},uDay:{value:1},uFine:{value:+fine},...THREE.UniformsUtils.clone(THREE.UniformsLib.fog)},
  vertexShader:`
   #include <common>
   #include <logdepthbuf_pars_vertex>
   #include <fog_pars_vertex>
   attribute vec3 aCenter; attribute vec4 aShape;
   varying vec2 vUv; varying float vAlpha; varying float vSpin;
   void main(){
    vUv=position.xy+.5;vAlpha=aShape.y;vSpin=aShape.z;
    vec4 mvPosition=modelViewMatrix*vec4(aCenter,1.);
    mvPosition.xy+=position.xy*aShape.x;
    gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
   }`,
  fragmentShader:`
   #include <common>
   #include <logdepthbuf_pars_fragment>
   #include <fog_pars_fragment>
   uniform sampler2D uTex;uniform vec3 uSun,uLight;uniform float uDay,uFine;
   varying vec2 vUv;varying float vAlpha;varying float vSpin;
   void main(){
    vec2 p=vUv-.5;float c=cos(vSpin),s=sin(vSpin);vec2 uv=mat2(c,-s,s,c)*p+.5;
    float a=texture2D(uTex,uv).a*vAlpha;
    if(a<.003)discard;
    #include <logdepthbuf_fragment>
    vec3 N=normalize(vec3(p*1.2,sqrt(max(.1,1.-dot(p,p)*3.))));
    float light=.28+uDay*(.42+.3*max(0.,dot(N,uSun)));
    vec3 soil=mix(vec3(.25,.12,.065),vec3(.43,.27,.16),uFine);
    gl_FragColor=vec4(soil*uLight*light,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
   }`});
 const mesh=new THREE.Mesh(geometry,material);mesh.name=fine?'Mars fine dust clouds':'Mars ballistic grains';mesh.frustumCulled=false;
 return {mesh,geometry,material};
}

export function getMarsDust({scene,camera,heightAt,surfaceAt=()=>1}){
 if(systems.has(scene))return systems.get(scene);
 let quality=getSettings().quality,sim=createDustSimulation(TIERS[quality]),enabled=true,time=0,cpuMs=0;
 const texture=dustTexture(),coarse=batch(2400,texture,false),fine=batch(1900,texture,true),group=new THREE.Group();
 group.name='Mars surface dust';group.add(coarse.mesh,fine.mesh);scene.add(group);
 const wind={x:.9,z:.3},previous=new Map(),sunDir=new THREE.Vector3(),point=new THREE.Vector3();
 const sources=new Map();
 const fadeDistance=p=>{const d=camera.position.distanceTo(p);return d>1500?0:1-.82*THREE.MathUtils.smoothstep(d,260,1500);};
 function wheel(id,p,dt){
  if(!enabled||!(dt>0))return;
  const old=previous.get(id),moved=old?Math.hypot(p.x-old.x,p.z-old.z):0;
  previous.set(id,{x:p.x,z:p.z});
  const rate=wheelDustRate({...p,erodibility:surfaceAt(p.x,p.z)})*fadeDistance(point.set(p.x,p.y,p.z))*(quality==='low'?.45:1);
  if(!rate||moved>5)return;
  const strength=.35+Math.min(1,p.slip||0)*1.8,from=old||p;
  const base={x:p.x,y:heightAt(p.x,p.z)+.16,z:p.z,from,spread:p.width*1.15,vx:(p.vx||0)*.3+(p.dirX||0)*strength,vy:.45+strength*.3,vz:(p.vz||0)*.3+(p.dirZ||0)*strength,jitter:.4};
  sim.emit(id+':fine',rate*1.05,dt,{...base,kind:1,size:.8+(p.width||.4)*.55,life:9,vy:.7+strength*.5,jitter:1.25,rise:.7});
  sim.emit(id+':grain',rate*2.6,dt,{...base,kind:0,vy:1.15+strength*1.4,size:.13,life:3.4,jitter:1.5,spread:p.width*.45});
  sources.set(id,{x:p.x,y:base.y,z:p.z,rate,last:time});
 }
 function plume(id,p,dt){
  if(!enabled||!(dt>0))return;
  const rate=plumeDustRate({...p,erodibility:surfaceAt(p.x,p.z)})*(p.rateScale??1)*fadeDistance(point.set(p.x,p.y,p.z))*(quality==='low'?.45:1);
  if(!rate)return;
  const power=p.thrust,spread=Math.max(1.2,Math.min(9,p.height*.12)),base={x:p.x,y:heightAt(p.x,p.z)+.3,z:p.z,spread,radial:5+power*12,vx:p.vx||0,vz:p.vz||0,vy:.8+power*1.8};
  // Exhaust hits the ground and has nowhere to go but out and up. Without the vertical kick the
  // plume reads as a pancake on the soil instead of the curtain that rolls up around a lander.
  sim.emit(id+':fine',rate*.34,dt,{...base,kind:1,size:7,life:9,vy:1.5+power*4,jitter:3,rise:2.5,grow:.12});
  sim.emit(id+':grain',rate*2,dt,{...base,kind:0,size:.13,life:4.6,vy:3.5+power*4.5,jitter:2.5,radial:12+power*12});
  sources.set(id,{x:p.x,y:base.y,z:p.z,rate,last:time});
 }
 function drill(p,dt){wheel('drill',{...p,contact:true,speed:1,slip:.6,width:.4,load:1},dt);}
 function upload(){
  camera.updateMatrixWorld();const indices=[[],[]],e=camera.matrixWorldInverse.elements;
  for(let i=0;i<sim.count;i++)indices[sim.kind[i]].push(i);
  const depth=i=>e[2]*sim.x[i]+e[6]*sim.y[i]+e[10]*sim.z[i]+e[14];
  indices[1].sort((a,b)=>depth(a)-depth(b));
  for(let kind=0;kind<2;kind++){
   const b=kind?fine:coarse,P=b.geometry.attributes.aCenter.array,S=b.geometry.attributes.aShape.array;
   indices[kind].forEach((i,k)=>{
    const age=sim.age[i],life=sim.life[i],size=sim.size[i]*(kind?1+age*sim.grow[i]:1);
    // Raise the billboard centre with growth: its lower edge stays at the particle's terrain datum.
    P[k*3]=sim.x[i];P[k*3+1]=sim.y[i]+(kind?size*.35:0);P[k*3+2]=sim.z[i];
    const f=age/life,near=THREE.MathUtils.smoothstep(-depth(i),.4,kind?2:1);
    // A real plume holds its body, then thins at the end. A straight ramp reads as "already vanishing".
    const hold=Math.pow(1-f,kind?.8:1.1),grow=Math.min(1,age/(kind?.3:.1));
    S[k*4]=size;S[k*4+1]=grow*hold*(kind?.42:.85)*near;S[k*4+2]=sim.rotation[i]+age*.07;S[k*4+3]=0;
   });
   b.geometry.instanceCount=indices[kind].length;b.mesh.visible=enabled&&indices[kind].length>0;
   b.geometry.attributes.aCenter.needsUpdate=true;b.geometry.attributes.aShape.needsUpdate=true;
  }
  const sun=scene.children.find(o=>o.isDirectionalLight);
  if(sun)sunDir.copy(sun.position).sub(sun.target.position).normalize();else sunDir.set(0,1,0);
  const day=Math.max(0,Math.min(1,sunDir.y*4));sunDir.transformDirection(camera.matrixWorldInverse);
  for(const b of [coarse,fine]){b.material.uniforms.uSun.value.copy(sunDir);b.material.uniforms.uDay.value=day;b.material.uniforms.uLight.value.copy(sun?.color||new THREE.Color(1,1,1));}
 }
 function update(dt){
  const start=performance.now();dt=Number.isFinite(dt)?Math.min(.05,Math.max(0,dt)):0;time+=dt;
  if(enabled)sim.update(dt,heightAt,wind);
  for(const [key,p] of sources)if(time-p.last>.25)sources.delete(key);
  upload();cpuMs=performance.now()-start;
 }
 function setQuality(value){const next=TIERS[value]?value:'standard';if(next===quality)return;quality=next;sim=createDustSimulation(TIERS[quality]);previous.clear();sources.clear();}
 const onQuality=e=>setQuality(e.detail);addEventListener('cosmos:quality',onQuality);
 const api={wheel,plume,drill,update,setQuality,setWind(v){wind.x=Number.isFinite(v.x)?v.x:0;wind.z=Number.isFinite(v.z)?v.z:0;},
  get enabled(){return enabled;},set enabled(v){enabled=!!v;group.visible=enabled;},
  get stats(){return {quality,...sim.counts(),active:sim.count,emitted:sim.emitted,cpuMs,wind:{...wind},sources:[...sources.entries()].map(([id,p])=>({id,...p})),drawCalls:+coarse.mesh.visible + +fine.mesh.visible};},
  dispose(){removeEventListener('cosmos:quality',onQuality);for(const b of [coarse,fine]){b.geometry.dispose();b.material.dispose();}texture.dispose();group.removeFromParent();systems.delete(scene);}};
 systems.set(scene,api);return api;
}
