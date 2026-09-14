import * as THREE from 'three';
import {createSupplyDrop} from './supply-drop-model.js';
import {refugeCycleFrame} from './refuge-cycle.js';

export const REFUGE_SITE=Object.freeze({x:6,z:-25});

/** One persistent, level refuge at the delivery site; no duplicate scene on entry. */
export function createSurfaceRefuge({scene,camera,heightAt,saveKey,arriving=false,sitePosition=REFUGE_SITE}){
  const drop=createSupplyDrop(scene),habitat=drop.habitat,layout=habitat.layout;
  const position=drop.group.position;
  let ground=-Infinity;
  for(const x of [-3,0,3])for(const z of [-3,0,3,5])ground=Math.max(ground,heightAt(sitePosition.x+x,sitePosition.z+z));
  position.set(sitePosition.x,ground+.04,sitePosition.z);
  if(arriving)drop.group.visible=false;else drop.finish();
  let inside=false,resting=false,cycle=null,savedView=false,ready=!arriving;
  try{inside=!arriving&&JSON.parse(localStorage.getItem(saveKey)||'null')?.inside===true;}catch{}
  const local=(x,z)=>({x:x-position.x,z:z-position.z});
  const point=(p)=>({x:position.x+p.x,z:position.z+p.z});
  const eye=(p)=>new THREE.Vector3(p.x,position.y+layout.floorY+1.65,p.z);
  const save=()=>{try{localStorage.setItem(saveKey,JSON.stringify({inside}));}catch{}};
  function outsideBlocked(x,z){
    if(!ready)return false;
    const p=local(x,z);
    return (p.x*p.x/(3.7*3.7)+p.z*p.z/(4*4)<1)||(Math.abs(p.x)<1.25&&p.z>2.3&&p.z<5.55);
  }
  function blocked(x,z){const p=local(x,z);return inside?habitat.blockedLocal(p.x,p.z):outsideBlocked(x,z);}
  function floor(x,z){
    if(!inside)return heightAt(x,z);
    const p=local(x,z),h=habitat.floorAtLocal(p.x,p.z);
    return Number.isFinite(h)?position.y+h:position.y+layout.floorY;
  }
  function ceiling(x,z){
    if(!inside)return Infinity;
    const p=local(x,z),h=habitat.ceilingAtLocal(p.x,p.z);
    return Number.isFinite(h)?position.y+h:position.y+layout.floorY+2.2;
  }
  function target(){return point(inside?layout.inside:layout.entry);}
  function distance(p){const t=target();return Math.hypot(p.x-t.x,p.z-t.z);}
  function enterOrExit(astronaut,notify,externalBlocked){
    if(!ready||cycle||resting||!astronaut.active)return false;
    if(distance(astronaut.position)>2.3){notify('请靠近生活舱气闸入口。');return false;}
    const outside=point(layout.entry);
    if(externalBlocked?.(outside.x,outside.z)){
      notify('气闸外有载具或障碍，请先移开。');return false;
    }
    if(!inside)savedView=astronaut.view==='第一人称';
    const entering=!inside;
    cycle={elapsed:0,entering,astronaut,from:{x:astronaut.position.x,z:astronaut.position.z},lock:point(layout.airlock),to:point(entering?layout.inside:layout.entry),label:'气闸准备'};
    astronaut.setPaused(true);astronaut.root.visible=false;
    return true;
  }
  function update(dt){
    if(resting){const p=point(layout.rest);camera.position.set(p.x,position.y+layout.floorY+1.05,p.z);camera.lookAt(p.x+.9,camera.position.y+.05,p.z-1);return;}
    if(!cycle)return;
    const c=cycle;c.elapsed+=Math.max(0,dt);
    const frame=refugeCycleFrame(c.elapsed,c.entering);c.label=frame.label;
    habitat.setDoors(frame.door,frame.amount);
    const a=frame.leg===0?c.from:c.lock,b=frame.leg===0?c.lock:c.to;
    const p=frame.leg===2?c.to:{x:THREE.MathUtils.lerp(a.x,b.x,frame.travel),z:THREE.MathUtils.lerp(a.z,b.z,frame.travel)};
    const cameraEye=eye(p);
    // Exterior threshold joins the ground without dragging the interior floor over terrain.
    const outerGround=heightAt(point(layout.entry).x,point(layout.entry).z)+1.65;
    if(frame.leg===0&&c.entering)cameraEye.y=THREE.MathUtils.lerp(outerGround,cameraEye.y,frame.travel);
    if(frame.leg===1&&!c.entering)cameraEye.y=THREE.MathUtils.lerp(cameraEye.y,outerGround,frame.travel);
    camera.position.copy(cameraEye);camera.lookAt(cameraEye.x,cameraEye.y,cameraEye.z+(c.entering?-1:1));camera.fov=68;camera.updateProjectionMatrix();
    if(frame.done){
      inside=c.entering;cycle=null;habitat.setDoors('closed');
      c.astronaut.setPaused(false);c.astronaut.start({...c.to,heading:inside?Math.PI:0});c.astronaut.setView(inside||savedView);save();
    }
  }
  function rest(astronaut){
    if(!inside||cycle||!astronaut.active)return;
    if(resting){resting=false;astronaut.setPaused(false);astronaut.update(0);return;}
    astronaut.start({...point(layout.rest),heading:Math.PI/2});astronaut.setView(true);astronaut.setPaused(true);resting=true;
  }
  return {drop,habitat,position,layout,blocked,outsideBlocked,floor,ceiling,target,distance,enterOrExit,update,rest,
    get inside(){return inside;},get resting(){return resting;},get busy(){return !!cycle;},get ready(){return ready;},
    get label(){return cycle?.label||(resting?'舱内休息 · 双门锁闭':inside?'舱内环境稳定 · 双门锁闭':'密闭生活舱 · 气闸待机');},
    get progress(){return cycle?Math.min(1,cycle.elapsed/7.2):0;},
    restore(astronaut){if(inside){astronaut.start({...point(layout.inside),heading:Math.PI});astronaut.setView(true);}},
    landed(){ready=true;drop.group.visible=true;drop.finish();}
  };
}
