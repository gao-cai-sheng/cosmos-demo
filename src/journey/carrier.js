import * as THREE from 'three';
import {createAres,ARES_SPEC as SPEC} from './ares-model.js';
import {makeDriveInput} from '../../tools/rover/输入.js';

/** ARES runtime. Model states remain deterministic; motion belongs to integration. */
export function createCarrier({scene,camera,canvas,heightAt,blocked,footprintBlocked=()=>false,solidAt=()=>false,rover,notify,onBoard,onSave=()=>{},driveControl=c=>c}){
 const asset=createAres();const root=asset.group;root.visible=false;scene.add(root);
 const ctl=makeDriveInput(window,{canvas,enabled:false,controlId:"carrier-touch-controls"});
 const position=new THREE.Vector3();let remote=null,active=false,ready=false,paused=false,speed=0,heading=0,orbit=.55,pitch=.27,zoom=17,view=0,loaded=false,savedParent=null,spin=0,saveTime=0,cargoFit=null;
 const cargoMin=new THREE.Vector3(...(SPEC.roverCargo||SPEC.cargo).min),cargoMax=new THREE.Vector3(...(SPEC.roverCargo||SPEC.cargo).max),cargoCenter=cargoMin.clone().add(cargoMax).multiplyScalar(.5),cargoSize=cargoMax.clone().sub(cargoMin),cargoPad=new THREE.Vector3(.10,.08,.14);
 const boundsIn=(object,reference)=>{object.updateMatrixWorld(true);reference.updateMatrixWorld(true);const box=new THREE.Box3(),inv=new THREE.Matrix4().copy(reference.matrixWorld).invert(),mat=new THREE.Matrix4();object.traverse(o=>{if(!o.isMesh||!o.visible)return;for(let p=o.parent;p&&p!==object;p=p.parent)if(!p.visible)return;o.geometry.computeBoundingBox();mat.copy(inv).multiply(o.matrixWorld);box.union(o.geometry.boundingBox.clone().applyMatrix4(mat));});return box;};
 const fitCargo=(m,localBox)=>{const size=localBox.getSize(new THREE.Vector3()),usable=cargoSize.clone().sub(cargoPad.clone().multiplyScalar(2));if(size.x>usable.x||size.y>usable.y||size.z>usable.z)return {ok:false,size:size.toArray(),usable:usable.toArray()};const center=localBox.getCenter(new THREE.Vector3());m.root.position.set(cargoCenter.x-center.x,cargoMin.y+cargoPad.y-localBox.min.y,cargoCenter.z-center.z);root.updateMatrixWorld(true);const placed=boundsIn(m.root,root),eps=.015,ok=placed.min.x>=cargoMin.x+cargoPad.x-eps&&placed.max.x<=cargoMax.x-cargoPad.x+eps&&placed.min.y>=cargoMin.y+cargoPad.y-eps&&placed.max.y<=cargoMax.y-cargoPad.y+eps&&placed.min.z>=cargoMin.z+cargoPad.z-eps&&placed.max.z<=cargoMax.z-cargoPad.z+eps;return {ok,min:placed.min.toArray(),max:placed.max.toArray(),size:size.toArray()};};
 const trackCapacity=8192,trackPositions=new Float32Array(trackCapacity*18),trackGeometry=new THREE.BufferGeometry();trackGeometry.setAttribute('position',new THREE.BufferAttribute(trackPositions,3).setUsage(THREE.DynamicDrawUsage));trackGeometry.setDrawRange(0,0);
 const trackMesh=new THREE.Mesh(trackGeometry,new THREE.MeshBasicMaterial({color:0x4a2115,transparent:true,opacity:.58,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));trackMesh.name='ARES six-wheel tyre tracks';trackMesh.frustumCulled=false;scene.add(trackMesh);
 const trailLast=Array.from({length:6},()=>new THREE.Vector3(NaN,NaN,NaN)),wheelWorld=new THREE.Vector3();let trackCursor=0,trackCount=0;
 function resetTrackAnchors(){for(const p of trailLast)p.set(NaN,NaN,NaN);}
 function trackRibbon(a,b,width=.84){const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<.001)return;const nx=-dz/d*width/2,nz=dx/d*width/2,c=[[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz]],order=[0,1,2,2,1,3],base=trackCursor*18;for(let i=0;i<6;i++){const [x,z]=c[order[i]],o=base+i*3;trackPositions[o]=x;trackPositions[o+1]=heightAt(x,z)+.024;trackPositions[o+2]=z;}trackCursor=(trackCursor+1)%trackCapacity;trackCount=Math.min(trackCapacity,trackCount+1);trackGeometry.setDrawRange(0,trackCount*6);trackGeometry.attributes.position.needsUpdate=true;}
 function updateTracks(){for(let i=0;i<6;i++){asset.parts['wheel.'+i].getWorldPosition(wheelWorld);const last=trailLast[i],d=Number.isFinite(last.x)?Math.hypot(wheelWorld.x-last.x,wheelWorld.z-last.z):Infinity;if(!Number.isFinite(last.x)||d>4){last.copy(wheelWorld);continue;}if(Math.abs(speed)>.05&&d>.06){trackRibbon(last,wheelWorld);last.copy(wheelWorld);}}}
 const zero={throttle:0,steer:0,brake:1,tc:true};
 const point=(x,z)=>({x:position.x+x*Math.cos(heading)+z*Math.sin(heading),z:position.z-x*Math.sin(heading)+z*Math.cos(heading)});
 function footprint(x,z,yaw=heading){
  const heights=[];for(const dx of [-2.65,0,2.65])for(const dz of [-5.4,0,4.75]){const px=x+dx*Math.cos(yaw)+dz*Math.sin(yaw),pz=z-dx*Math.sin(yaw)+dz*Math.cos(yaw);if(blocked(px,pz)||Math.abs(px)>180000||Math.abs(pz)>180000)return null;heights.push(heightAt(px,pz));}
  const low=Math.min(...heights),high=Math.max(...heights);if(high-low>3.2||footprintBlocked(x,z,yaw,low,high))return null;return heights;
 }
 function pose(){
  const f=point(0,3.45),b=point(0,-2.66),r=point(1.78,0),l=point(-1.78,0);
  position.y=(heightAt(f.x,f.z)*2.66+heightAt(b.x,b.z)*3.45)/6.11+.035;
  root.position.copy(position);root.rotation.set(-Math.atan2(heightAt(f.x,f.z)-heightAt(b.x,b.z),6.11),heading,Math.atan2(heightAt(r.x,r.z)-heightAt(l.x,l.z),3.56),'YXZ');root.updateMatrixWorld(true);
  if(loaded){const m=rover.model();m.root.getWorldPosition(m.pos);}
 }
 function park(p){if(!footprint(p.x,p.z,p.heading||0))return false;position.set(p.x,0,p.z);heading=p.heading||0;ready=true;root.visible=true;pose();resetTrackAnchors();return true;}
 function save(){onSave({x:position.x,z:position.z,heading,loaded});}
 function start(){if(!ready||active)return;remote=null;if(asset.group.userData.assetState!=='ready'){notify('ARES 模型加载中，请稍候。');return;}asset.setState('sealed');active=true;onBoard();ctl.setEnabled(!paused);save();}
 function leave(){if(!active||Math.abs(speed)>.4)return false;active=false;speed=0;ctl.setEnabled(false);save();return true;}
 function toggleDoor(){if(Math.abs(speed)>.4){notify('请先停车再打开货舱。');return false;}asset.setState(asset.state==='sealed'?'open':'sealed');return true;}
 function dock({restore=false}={}){
  const m=rover.model();if(!m||loaded||active&&Math.abs(speed)>.4)return false;
  if(!restore&&(Math.hypot(m.pos.x-position.x,m.pos.z-position.z)>13||Math.abs(m.speed)>.5)){notify('将 MU-7 遥控至运输车 13 m 内并停稳后，再装载。');return false;}
  rover.exit();for(let i=0;i<60;i++)m.step(1/60,zero,m.terrain);
  // Transport configuration: fold every deployable before measuring the payload.
  m.panelTarget=0;m.panelDeploy=0;m.armOut=0;m.armDeploy=0;m.armYaw=0;m.drilling=false;m.mastYaw=0;m.mastPitch=0;m.updateVisuals(0,zero);m.stowWheels?.();m.root.updateMatrixWorld(true);
  const localBox=boundsIn(m.root,m.root);localBox.min.multiply(m.root.scale);localBox.max.multiply(m.root.scale);const localSize=localBox.getSize(new THREE.Vector3()),usable=cargoSize.clone().sub(cargoPad.clone().multiplyScalar(2));
  if(localSize.x>usable.x||localSize.y>usable.y||localSize.z>usable.z){cargoFit={ok:false,size:localSize.toArray(),usable:usable.toArray()};notify('MU-7 当前运输构型超出 ARES 货舱净空，装载已取消。');return false;}
  asset.setState('open');savedParent=m.root.parent;root.add(m.root);m.root.position.set(0,0,0);m.root.quaternion.identity();root.updateMatrixWorld(true);cargoFit=fitCargo(m,localBox);
  if(!cargoFit.ok){(savedParent||scene).add(m.root);m.placeAt(position.x,position.z,heading);notify('MU-7 未能安全固定在货舱内，装载已取消。');return false;}
  loaded=true;pose();save();notify('MU-7 已切换运输构型并固定在货舱内。关闭尾门后可驾驶运输车。');return true;
 }
 function unload(){
  if(!loaded||Math.abs(speed)>.4)return false;const p=point(0,-13);
  for(const dx of [-2.5,0,2.5])for(const dz of [-2.5,0,2.5])if(blocked(p.x+dx,p.z+dz)){notify('车尾没有足够卸载空间，请换一处开阔地。');return false;}
  if(Math.abs(heightAt(p.x+2,p.z)-heightAt(p.x-2,p.z))>1.8||Math.abs(heightAt(p.x,p.z+2)-heightAt(p.x,p.z-2))>1.8){notify('车尾坡度过大，请在平地卸载。');return false;}
  const m=rover.model();(savedParent||scene).add(m.root);loaded=false;cargoFit=null;m.panelDeploy=1;m.panelTarget=1;m.placeAt(p.x,p.z,heading);
  for(let i=0;i<90;i++)m.step(1/60,zero,m.terrain);m.updateVisuals(0,zero);asset.setState('open');save();notify('探测车已卸至车尾，太阳翼展开，可重新遥控。');return true;
 }
 function cycle(){view=1-view;orbit=view?0:.55;pitch=view?0:.27;}
 function update(dt){
  if(!(active||remote)||paused||document.hidden)return;dt=Math.min(dt,.05);
  // Unmanned summon: an external controller supplies normal drive inputs; no camera takeover.
  const c=active?driveControl(ctl.update(dt),dt):remote(dt,{x:position.x,z:position.z,heading,speed});
  if(active){if(c.camCycle)cycle();orbit-=c.lookX*.003;pitch=THREE.MathUtils.clamp(pitch+c.lookY*.003,-.05,1.1);if(view===0&&c.zoom)zoom=THREE.MathUtils.clamp(zoom*Math.exp(c.zoom*.12),5,240);}
  speed=THREE.MathUtils.damp(speed,asset.state!=='sealed'||c.brake?0:c.throttle*(c.boost?13:8),c.brake?8:2,dt);
  const nextHeading=heading-c.steer*dt*.65*Math.min(1,Math.abs(speed)/2),x=position.x+Math.sin(nextHeading)*speed*dt,z=position.z+Math.cos(nextHeading)*speed*dt;
  if(footprint(x,z,nextHeading)){position.x=x;position.z=z;heading=nextHeading;}else speed=0;
  spin=(spin+-speed*dt/1.045)%(Math.PI*2);for(let i=0;i<6;i++)asset.parts['wheel.'+i].rotation.x=spin;pose();updateTracks();
  if(!active){saveTime+=dt;if(saveTime>2){saveTime=0;save();}return;}
  if(view===1){camera.position.copy(root.localToWorld(new THREE.Vector3(-.43,2.65,3.65)));const target=root.localToWorld(new THREE.Vector3(-.43+Math.sin(orbit)*12,2.65-pitch*4,3.65+Math.cos(orbit)*12));camera.lookAt(target);camera.fov=68;}
  else{const a=heading+orbit;camera.position.set(position.x-Math.sin(a)*zoom*Math.cos(pitch),position.y+3+Math.sin(pitch)*zoom,position.z-Math.cos(a)*zoom*Math.cos(pitch));camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+1);
   // Driving under the NX07: shorten the boom before it enters the hull or landing gear.
   const look=new THREE.Vector3(position.x,position.y+2.4,position.z),want=camera.position.clone();camera.position.lerpVectors(look,want,1/24);for(let i=2;i<=24;i++){const p=look.clone().lerp(want,i/24);if(solidAt(p.x,p.y,p.z))break;camera.position.copy(p);}
   camera.lookAt(position.x,position.y+2.4,position.z);camera.fov=55;}
  camera.updateProjectionMatrix();saveTime+=dt;if(saveTime>2){saveTime=0;save();}
 }
 return {asset,park,start,get remote(){return remote;},set remote(fn){remote=active?null:fn||null;if(!remote)speed=Math.abs(speed)<.05?0:speed;},leave,stow(){if(active||Math.abs(speed)>.4)return false;ready=false;root.visible=false;resetTrackAnchors();return true;},canTraverse:(x,z,yaw=heading)=>!!footprint(x,z,yaw),update,toggleDoor,dock,unload,point,save,get active(){return active;},get ready(){return ready;},get position(){return position;},get heading(){return heading;},get speed(){return speed;},get loaded(){return loaded;},get cargoFit(){return cargoFit;},get trackCount(){return trackCount;},get doorOpen(){return asset.state!=='sealed';},get view(){return view?'驾驶舱':'跟车';},cycle,setPaused(v){paused=v;ctl.setEnabled(active&&!paused);},contains(x,z){if(!ready)return false;const dx=x-position.x,dz=z-position.z;return Math.abs(dx*Math.cos(heading)-dz*Math.sin(heading))<2.75&&Math.abs(dx*Math.sin(heading)+dz*Math.cos(heading))<5.55;}};
}
