import * as THREE from 'three';
import {createSupplyDrop} from './supply-drop-model.js';
import {refugeCycleFrame} from './refuge-cycle.js';
import {HOME_SITE} from './outpost-layout.js';
import {airlockReach} from './outpost-interior-layout.js';

// Where the outpost stands at the first landing site. The anchor is the ship-side edge of its graded
// apron, so a bigger outpost grows away from NX07 instead of into it (HOME_SITE, D69).
export const REFUGE_SITE=Object.freeze({x:HOME_SITE.x,z:HOME_SITE.z});
// The hub's door (local +Z) faces west, toward where NX07 sets down and the crew step out; at
// heading 0 it faced north and the first thing the crew saw was the outpost's back.
export const REFUGE_HEADING=HOME_SITE.heading;

/** One persistent, level refuge at the delivery site; no duplicate scene on entry.
 *
 * "Inside" used to mean a 4 m ellipsoid pod parked inside the outpost's hull. It is now the
 * outpost's own interior — one deck through all three modules, about 190 m end to end — so entering the
 * airlock puts the player in the building they were just looking at, not in a second, smaller one. */
export function createSurfaceRefuge({scene,camera,heightAt,saveKey,arriving=false,sitePosition=REFUGE_SITE,heading=REFUGE_HEADING}){
  // The outpost grades its own site and works out its own deck height from the terrain under its
  // whole footprint, so there is no separate ground sample here any more.
  const drop=createSupplyDrop(scene,{heightAt,x:sitePosition.x,z:sitePosition.z,heading});
  const interior=drop.interior,layout=interior.layout;
  const position=drop.group.position;
  if(arriving){drop.group.visible=false;drop.padGroup.visible=false;}else drop.finish();
  let powered=true,inside=false,resting=false,cycle=null,savedView=false,ready=!arriving;
  try{inside=!arriving&&JSON.parse(localStorage.getItem(saveKey)||'null')?.inside===true;}catch{}
  // Outpost-local <-> world, the same rotation createOutpost uses; `turn` rotates a local
  // direction, and a local heading becomes a world one by adding the outpost's own.
  const cos=Math.cos(heading),sin=Math.sin(heading);
  const turn=(x,z)=>({x:x*cos+z*sin,z:-x*sin+z*cos});
  const local=(x,z)=>{const dx=x-position.x,dz=z-position.z;return {x:dx*cos-dz*sin,z:dx*sin+dz*cos};};
  const point=(p)=>{const d=turn(p.x,p.z);return {x:position.x+d.x,z:position.z+d.z};};
  const eye=(p)=>new THREE.Vector3(p.x,position.y+layout.floorY+1.65,p.z);
  const save=()=>{try{localStorage.setItem(saveKey,JSON.stringify({inside}));}catch{}};
  interior.setLit(inside&&powered);
  // Footprint of the outpost string. `hullBlocked` already leaves the entry ramp open, so the
  // walk-up to the hatch needs no exception of its own here.
  function outsideBlocked(x,z){return ready?drop.hullBlocked(x,z):false;}
  /** On the graded pad, fill slope included. Vehicles still ride the raw terrain underneath it
   * (D64), so NX07 is kept from setting down here: its feet would stand below the deck. */
  function onPad(x,z){return drop.floorAt(x,z)!=null;}
  function blocked(x,z){const p=local(x,z);return inside?interior.blockedLocal(p.x,p.z):outsideBlocked(x,z);}
  function floor(x,z){
    if(!inside)return ready?(drop.floorAt(x,z)??heightAt(x,z)):heightAt(x,z);
    const p=local(x,z),h=interior.floorAtLocal(p.x,p.z);
    return Number.isFinite(h)?position.y+h:position.y+layout.floorY;
  }
  function ceiling(x,z){
    if(!inside)return Infinity;
    const p=local(x,z),h=interior.ceilingAtLocal(p.x,p.z);
    return Number.isFinite(h)?position.y+h:Infinity;
  }
  function target(){return point(inside?layout.inside:layout.entry);}
  /** 玩家此刻在哪个舱段，给 HUD 用；不在舱内返回 null。 */
  function area(p){if(!inside)return null;const q=local(p.x,p.z);return interior.areaNameAt(q.x,q.z);}
  /** 离气闸多远。舱外是坡道顶的入口点；舱内是整段「入舱落点 → 内门前 → 门洞」（airlockReach）：
   * 人走向气闸会一直走到关着的内门前才停，离落点已经 7 m，只量落点会让人在门前出不了舱（2026-10-02）。 */
  function distance(p){
    if(inside){const q=local(p.x,p.z);return airlockReach(q.x,q.z);}
    const t=target();return Math.hypot(p.x-t.x,p.z-t.z);
  }
  /** 离得最近的舱内工位（化验台、通信台、铺位…），世界坐标；UI 靠它显示可操作对象。 */
  function nearestStation(p,reach=2.6){
    if(!inside||cycle||!ready)return null;
    let best=null;
    for(const s of interior.stations){
      const w=point(s),d=Math.hypot(p.x-w.x,p.z-w.z);
      if(d<=reach&&(!best||d<best.distance))best={...s,x:w.x,z:w.z,distance:d};
    }
    return best;
  }
  function enterOrExit(astronaut,notify,externalBlocked){
    if(!ready||cycle||resting||!astronaut.active)return false;
    if(distance(astronaut.position)>2.6){notify('请靠近生活舱气闸入口。');return false;}
    const outside=point(layout.entry);
    if(externalBlocked?.(outside.x,outside.z)){
      notify('气闸外有载具或障碍，请先移开。');return false;
    }
    if(!inside)savedView=astronaut.view==='第一人称';
    const entering=!inside;
    cycle={elapsed:0,entering,astronaut,from:{x:astronaut.position.x,z:astronaut.position.z},lock:point(layout.airlock),to:point(entering?layout.inside:layout.entry),label:'气闸准备'};
    astronaut.setPaused(true);astronaut.root.visible=false;
    interior.setLit(powered);
    return true;
  }
  function update(dt){
    if(resting){
      // 坐在餐桌通道侧，沿 -X 看居住舱端头落地窗；餐区和育苗墙留在视野侧边。
      const p=point(layout.rest);
      camera.position.set(p.x,position.y+layout.floorY+1.05,p.z);
      const ahead=turn(-1.4,0);camera.lookAt(p.x+ahead.x,camera.position.y+.05,p.z+ahead.z);
      return;
    }
    if(!cycle)return;
    const c=cycle;c.elapsed+=Math.max(0,dt);
    const frame=refugeCycleFrame(c.elapsed,c.entering);c.label=frame.label;
    interior.setDoors(frame.door,frame.amount);
    const a=frame.leg===0?c.from:c.lock,b=frame.leg===0?c.lock:c.to;
    const p=frame.leg===2?c.to:{x:THREE.MathUtils.lerp(a.x,b.x,frame.travel),z:THREE.MathUtils.lerp(a.z,b.z,frame.travel)};
    const cameraEye=eye(p);
    // Exterior threshold joins the ground without dragging the interior floor over terrain.
    const outerGround=heightAt(point(layout.entry).x,point(layout.entry).z)+1.65;
    if(frame.leg===0&&c.entering)cameraEye.y=THREE.MathUtils.lerp(outerGround,cameraEye.y,frame.travel);
    if(frame.leg===1&&!c.entering)cameraEye.y=THREE.MathUtils.lerp(cameraEye.y,outerGround,frame.travel);
    camera.position.copy(cameraEye);
    // 最后一段转向 -X：站定时正对居住段的纵深，而不是 1.5 m 外的服架背板
    const look=c.entering&&frame.leg===2?turn(-1,0):turn(0,c.entering?-1:1);
    camera.lookAt(cameraEye.x+look.x,cameraEye.y,cameraEye.z+look.z);
    camera.fov=68;camera.updateProjectionMatrix();
    if(frame.done){
      inside=c.entering;cycle=null;interior.setDoors('closed');interior.setLit(inside&&powered);
      c.astronaut.setPaused(false);c.astronaut.start({...c.to,heading:heading+(inside?-Math.PI/2:0)});c.astronaut.setView(inside||savedView);save();
    }
  }
  function rest(astronaut){
    if(!inside||cycle||!astronaut.active)return;
    if(resting){resting=false;astronaut.setPaused(false);astronaut.update(0);return;}
    astronaut.start({...point(layout.rest),heading});astronaut.setView(true);astronaut.setPaused(true);resting=true;
  }
  /** 某个工位的站位（世界坐标），不管人在不在舱里；任务卡的指路要用（D70）。 */
  function stationPoint(id){const s=interior.stations.find(q=>q.id===id);return s?point(s):null;}
  return {drop,interior,position,heading,layout,nearestStation,stationPoint,area,blocked,outsideBlocked,onPad,floor,ceiling,target,distance,enterOrExit,update,rest,
    setPower(on){powered=!!on;interior.setLit((inside||!!cycle)&&powered);},
    get inside(){return inside;},get resting(){return resting;},get busy(){return !!cycle;},get ready(){return ready;},
    get label(){return cycle?.label||(resting?'舱内休息 · 双门锁闭':inside?'舱内环境稳定 · 双门锁闭':'密闭生活舱 · 气闸待机');},
    get progress(){return cycle?Math.min(1,cycle.elapsed/7.2):0;},
    restore(astronaut){if(inside){astronaut.start({...point(layout.inside),heading:heading-Math.PI/2});astronaut.setView(true);interior.setLit(powered);}},
    landed(){ready=true;drop.group.visible=true;drop.padGroup.visible=true;drop.finish();}
  };
}
