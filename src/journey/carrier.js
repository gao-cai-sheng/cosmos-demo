import * as THREE from 'three';
import {create} from '../artifacts/atlas-carrier/atlas-carrier.js';
import {carrierMaterials} from './carrier-materials.js';
import {makeDriveInput} from '../../tools/rover/输入.js';

/** ATLAS runtime. Model states remain deterministic; motion belongs to integration. */
export function createCarrier({scene,camera,canvas,heightAt,blocked,rover,notify,onBoard,onSave=()=>{},driveControl=c=>c}){
 const asset=create({materials:carrierMaterials()});const root=asset.group;root.visible=false;scene.add(root);
 const ctl=makeDriveInput(window,{canvas,enabled:false,controlId:"carrier-touch-controls"});
 const position=new THREE.Vector3();let active=false,ready=false,paused=false,speed=0,heading=0,orbit=.55,pitch=.27,zoom=17,view=0,loaded=false,savedParent=null,spin=0,saveTime=0;
 const zero={throttle:0,steer:0,brake:1,tc:true};
 const point=(x,z)=>({x:position.x+x*Math.cos(heading)+z*Math.sin(heading),z:position.z-x*Math.sin(heading)+z*Math.cos(heading)});
 function footprint(x,z,yaw=heading){
  const heights=[];for(const dx of [-2.8,0,2.8])for(const dz of [-4.9,0,4.9]){const px=x+dx*Math.cos(yaw)+dz*Math.sin(yaw),pz=z-dx*Math.sin(yaw)+dz*Math.cos(yaw);if(blocked(px,pz)||Math.abs(px)>180000||Math.abs(pz)>180000)return null;heights.push(heightAt(px,pz));}
  if(Math.max(...heights)-Math.min(...heights)>3.2)return null;return heights;
 }
 function pose(){
  const f=point(0,3.2),b=point(0,-3.6),r=point(2.25,0),l=point(-2.25,0);
  position.y=heightAt(position.x,position.z)+.04;
  root.position.copy(position);root.rotation.set(-Math.atan2(heightAt(f.x,f.z)-heightAt(b.x,b.z),6.8),heading,Math.atan2(heightAt(r.x,r.z)-heightAt(l.x,l.z),4.5),'YXZ');root.updateMatrixWorld(true);
  if(loaded){const m=rover.model();m.root.getWorldPosition(m.pos);}
 }
 function park(p){if(!footprint(p.x,p.z,p.heading||0))return false;position.set(p.x,0,p.z);heading=p.heading||0;ready=true;root.visible=true;pose();return true;}
 function save(){onSave({x:position.x,z:position.z,heading,loaded});}
 function start(){if(!ready||active)return;asset.setState('sealed');active=true;onBoard();ctl.setEnabled(!paused);save();}
 function leave(){if(!active||Math.abs(speed)>.4)return false;active=false;speed=0;ctl.setEnabled(false);save();return true;}
 function toggleDoor(){if(Math.abs(speed)>.4){notify('请先停车再打开货舱。');return false;}asset.setState(asset.state==='sealed'?'open':'sealed');return true;}
 function dock({restore=false}={}){
  const m=rover.model();if(!m||loaded||active&&Math.abs(speed)>.4)return false;
  if(!restore&&(Math.hypot(m.pos.x-position.x,m.pos.z-position.z)>13||Math.abs(m.speed)>.5)){notify('将 MU-7 遥控至运输车 13 m 内并停稳后，再装载。');return false;}
  rover.exit();for(let i=0;i<60;i++)m.step(1/60,zero,m.terrain);asset.setState('open');m.panelDeploy=0;m.updateVisuals(0,zero);savedParent=m.root.parent;root.add(m.root);m.root.position.set(0,0,0);m.root.quaternion.identity();root.updateMatrixWorld(true);
  // Measure the actual folded payload in its own frame; no scale manipulation.
  const box=new THREE.Box3();m.root.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const mat=new THREE.Matrix4().copy(m.root.matrixWorld).invert().multiply(o.matrixWorld);box.union(o.geometry.boundingBox.clone().applyMatrix4(mat));}});
  m.root.position.set(0,1.4-box.min.y,-2.4);loaded=true;pose();save();notify('MU-7 已收翼并固定在货舱内。关闭尾门后可驾驶运输车。');return true;
 }
 function unload(){
  if(!loaded||Math.abs(speed)>.4)return false;const p=point(0,-10);
  for(const dx of [-2.5,0,2.5])for(const dz of [-2.5,0,2.5])if(blocked(p.x+dx,p.z+dz)){notify('车尾没有足够卸载空间，请换一处开阔地。');return false;}
  if(Math.abs(heightAt(p.x+2,p.z)-heightAt(p.x-2,p.z))>1.8||Math.abs(heightAt(p.x,p.z+2)-heightAt(p.x,p.z-2))>1.8){notify('车尾坡度过大，请在平地卸载。');return false;}
  const m=rover.model();(savedParent||scene).add(m.root);loaded=false;m.panelDeploy=1;m.placeAt(p.x,p.z,heading);
  for(let i=0;i<90;i++)m.step(1/60,zero,m.terrain);m.updateVisuals(0,zero);asset.setState('open');save();notify('探测车已卸至车尾，太阳翼展开，可重新遥控。');return true;
 }
 function cycle(){view=1-view;orbit=view?0:.55;pitch=view?0:.27;}
 function update(dt){
  if(!active||paused||document.hidden)return;dt=Math.min(dt,.05);const c=driveControl(ctl.update(dt),dt);if(c.camCycle)cycle();
  orbit-=c.lookX*.003;pitch=THREE.MathUtils.clamp(pitch+c.lookY*.003,-.05,1.1);zoom=THREE.MathUtils.clamp(zoom+c.zoom*1.5,11,40);
  speed=THREE.MathUtils.damp(speed,asset.state!=='sealed'||c.brake?0:c.throttle*(c.boost?13:8),c.brake?8:2,dt);
  const nextHeading=heading-c.steer*dt*.65*Math.min(1,Math.abs(speed)/2),x=position.x+Math.sin(nextHeading)*speed*dt,z=position.z+Math.cos(nextHeading)*speed*dt;
  if(footprint(x,z,nextHeading)){position.x=x;position.z=z;heading=nextHeading;}else speed=0;
  spin=(spin+speed*dt/1.1)%(Math.PI*2);for(let i=0;i<6;i++)asset.parts['wheel.'+i].rotation.x=spin;pose();
  if(view===1){camera.position.copy(root.localToWorld(new THREE.Vector3(-.8,2.95,1.85)));const target=root.localToWorld(new THREE.Vector3(-.8+Math.sin(orbit)*12,2.95-pitch*4,1.85+Math.cos(orbit)*12));camera.lookAt(target);camera.fov=68;}
  else{const a=heading+orbit;camera.position.set(position.x-Math.sin(a)*zoom*Math.cos(pitch),position.y+3+Math.sin(pitch)*zoom,position.z-Math.cos(a)*zoom*Math.cos(pitch));camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+1);camera.lookAt(position.x,position.y+2.4,position.z);camera.fov=55;}
  camera.updateProjectionMatrix();saveTime+=dt;if(saveTime>2){saveTime=0;save();}
 }
 return {asset,park,start,leave,canTraverse:(x,z,yaw=heading)=>!!footprint(x,z,yaw),update,toggleDoor,dock,unload,point,save,get active(){return active;},get ready(){return ready;},get position(){return position;},get heading(){return heading;},get speed(){return speed;},get loaded(){return loaded;},get doorOpen(){return asset.state!=='sealed';},get view(){return view?'驾驶舱':'跟车';},cycle,setPaused(v){paused=v;ctl.setEnabled(active&&!paused);},contains(x,z){if(!ready)return false;const dx=x-position.x,dz=z-position.z;return Math.abs(dx*Math.cos(heading)-dz*Math.sin(heading))<3.15&&Math.abs(dx*Math.sin(heading)+dz*Math.cos(heading))<(asset.state==='sealed'?5.25:8.2);}};
}
