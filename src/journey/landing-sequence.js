import * as THREE from 'three';
import {getMarsDust} from './mars-dust.js';
import {emitShipDust,NX07_DUST_DATUM} from './dust-sources.js';
import {createSupplyDrop} from './supply-drop-model.js';
import {HOME_SITE,padExtent} from './outpost-layout.js';
import {createKestrel} from './kestrel-model.js';
import {arrivalFrame} from './landing-timeline.js';
import {findLandingSite,ARRIVAL_BASE,NX07_SCALE as K} from './landing-support.js';
import {sfx} from './sfx.js';
import {createLandingAudio} from './sfx-watch.js';

const smoothstep=t=>{const u=THREE.MathUtils.clamp(t,0,1);return u*u*(3-2*u);};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

// Compatibility export for callers that used the old Kestrel-only frame helper.
export function landingFrame(seconds){return arrivalFrame(seconds).kestrel;}

export function createLandingSequence({scene,camera,heightAt,asset,supply:providedSupply,onFinish=()=>{}}){
  const fill=new THREE.HemisphereLight(0xb8cddd,0x7b4b34,1.4);scene.add(fill);
  const supply=providedSupply||createSupplyDrop(scene);supply.group.visible=true;
  const model=asset||createKestrel(),craft=model.group;scene.add(craft);craft.visible=true;

  const shield=new THREE.Mesh(new THREE.CylinderGeometry(10*K,10*K,.15,32),new THREE.MeshStandardMaterial({color:0x3c2922,emissive:0xff410c,transparent:true,opacity:.24}));
  shield.position.y=-2.05*K;craft.add(shield);
  const flames=new THREE.Group();flames.name='Kestrel powered descent plumes';craft.add(flames);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(NX07_DUST_DATUM.radius*.65,16,24),new THREE.MeshBasicMaterial({color:0x96cced,transparent:true,opacity:.26,depthWrite:false}));
  flame.rotation.z=Math.PI;flame.position.fromArray(NX07_DUST_DATUM.position);flame.position.y-=8;flames.add(flame);
  const dust=getMarsDust({scene,camera,heightAt});let previousSeconds=0;

  const hud=document.createElement('div');
  hud.className='landing-sequence landing-cabin-hud';
  hud.innerHTML=`
    <header><span>COSMOS / NX07 CABIN MONITOR</span><b class="landing-feed"></b></header>
    <section class="landing-kestrel">
      <small>NX07 / DESCENT</small><strong class="landing-phase"></strong>
      <dl><div><dt>高度</dt><dd class="landing-alt"></dd></div><div><dt>推进</dt><dd class="landing-thrust"></dd></div><div><dt>乘员</dt><dd>舱内 / 锁定</dd></div></dl>
    </section>
    <section class="landing-rover">
      <small>POD / 先遣舱地面相机</small>
      <dl><div><dt>舱体</dt><dd class="landing-pod"></dd></div><div><dt>相机桅杆</dt><dd class="landing-mast"></dd></div><div><dt>链路</dt><dd class="landing-link"></dd></div><div><dt>MU-7</dt><dd>随 ARES 在腹舱</dd></div></dl>
    </section>
    <div class="landing-reticle"><i></i><span class="landing-event"></span></div>
    <footer><progress max="30" value="0"></progress><span class="landing-time"></span><button>跳过动画</button></footer>`;
  document.body.append(hud);document.body.classList.add('is-arriving','kestrel-cabin-monitor');

  const supplyPosition=providedSupply?supply.group.position:HOME_SITE;
  // Keep NX07's footprint off the outpost's whole graded pad, fill slope included. This used to be a
  // circle round the outpost's centre; at 198 m the string is far longer than it is deep, and a circle
  // that covers its ends also covers the arrival base in front of the door (D69).
  const supplyHeading=providedSupply?supply.group.rotation.y:HOME_SITE.heading,supplyCos=Math.cos(supplyHeading),supplySin=Math.sin(supplyHeading);
  const supplyPad=padExtent(supply.outpost?.metrics.bermRun);
  const avoidSupply=(x,z)=>{
    const dx=x-supplyPosition.x,dz=z-supplyPosition.z,lx=dx*supplyCos-dz*supplySin,lz=dx*supplySin+dz*supplyCos;
    return Math.abs(lx)<supplyPad.halfX&&lz>supplyPad.zNeg&&lz<supplyPad.zPos;
  };
  const craftBase=findLandingSite(ARRIVAL_BASE,heightAt,avoidSupply)||{...ARRIVAL_BASE},craftGround=heightAt(craftBase.x,craftBase.z);
  craft.position.set(craftBase.x,craftGround,craftBase.z);craft.rotation.set(0,craftBase.heading,0);model.fitGround(heightAt);model.setFlightPose?.(0);const craftLandingY=craft.position.y;
  const supplyBase=providedSupply?{x:supply.group.position.x,z:supply.group.position.z}:{x:HOME_SITE.x,z:HOME_SITE.z};
  const supplyGround=providedSupply?supply.group.position.y:heightAt(supplyBase.x,supplyBase.z);
  let skip=false;hud.querySelector('button').onclick=()=>skip=true;

  const phaseNode=hud.querySelector('.landing-phase'),feedNode=hud.querySelector('.landing-feed');
  const altNode=hud.querySelector('.landing-alt'),thrustNode=hud.querySelector('.landing-thrust');
  const linkNode=hud.querySelector('.landing-link'),mastNode=hud.querySelector('.landing-mast'),podNode=hud.querySelector('.landing-pod');
  const eventNode=hud.querySelector('.landing-event'),timeNode=hud.querySelector('.landing-time'),progress=hud.querySelector('progress');
  const lensPos=new THREE.Vector3();
  let aim={pan:0,tilt:0};
  // 从轨道页点过来时浏览器多半已经允许出声；不允许就等玩家第一次点按（比如点「跳过」）。
  sfx.prime();const audio=createLandingAudio(sfx);

  function update(seconds){
    const f=arrivalFrame(seconds);
    audio.update(seconds,f);

    // Independent pod lands first, raises its roof camera and slews it onto NX07.
    supply.group.position.set(supplyBase.x,supplyGround+f.supply.altitude,supplyBase.z);
    if(f.supply.mast>0){
      supply.lens.getWorldPosition(lensPos);
      const dx=craft.position.x-lensPos.x,dz=craft.position.z-lensPos.z,target={pan:wrapAngle(Math.atan2(dx,dz)-supply.group.rotation.y),tilt:Math.atan2(craft.position.y+1.5-lensPos.y,Math.hypot(dx,dz))};
      const slew=smoothstep((seconds-10.3)/2.2);
      aim={pan:target.pan*slew,tilt:target.tilt*slew};
    }
    supply.update({...f.supply,...aim});
    supply.group.updateMatrixWorld(true);

    craft.position.set(craftBase.x,craftLandingY+f.kestrel.altitude,craftBase.z);
    model.setFlightPose?.(smoothstep((seconds-22)/5));model.update?.(0);
    craft.rotation.z=seconds<6?Math.sin(seconds*1.4)*.018:0;
    shield.material.emissiveIntensity=f.kestrel.heat*2;
    flames.visible=f.kestrel.thrust>.01;
    for(const plume of flames.children)plume.scale.y=Math.max(.15,f.kestrel.thrust)*(1+Math.sin(seconds*42+plume.position.x)*.10);
    const dustDt=Math.min(.05,Math.max(0,seconds-previousSeconds));previousSeconds=seconds;
    emitShipDust(dust,craft,f.kestrel.thrust,dustDt,heightAt);
    dust.plume('supply',{x:supplyBase.x,y:supply.group.position.y,z:supplyBase.z,height:f.supply.altitude,thrust:f.supply.thrust*.15},dustDt);

    // Crew remains aboard. The large canvas is a cabin monitor: NX07 ventral feed first,
    // then the pod's roof camera becomes the external source for NX07 touchdown.
    if(f.feed==='POD MAST CAM'){
      supply.lens.getWorldPosition(lensPos);camera.position.copy(lensPos);
      camera.lookAt(craft.position.x,craft.position.y+1.5,craft.position.z);
      camera.fov=46;
    }else{
      camera.position.set(craft.position.x+8*K,craft.position.y-14*K,craft.position.z+12*K);
      camera.lookAt(supplyBase.x,supplyGround+Math.max(1.6,f.supply.altitude*.08),supplyBase.z+1.5);
      camera.fov=48;
    }
    camera.updateProjectionMatrix();
    dust.update(dustDt);

    feedNode.textContent=f.feed;
    phaseNode.textContent=f.phase;
    altNode.textContent=Math.round(f.kestrel.altitude)+' m';
    thrustNode.textContent=f.kestrel.thrust>.02?Math.round(f.kestrel.thrust*100)+'%':'待机';
    linkNode.textContent=f.supply.ready?'稳定 / 视频回传':f.supply.link>.05?'握手 '+Math.round(f.supply.link*100)+'%':'等待部署';
    mastNode.textContent=f.supply.mast>0?Math.round(f.supply.mast*100)+'%':'收拢';
    podNode.textContent=!f.supply.landed?Math.round(f.supply.altitude)+' m':'已触地 · 密封';
    eventNode.textContent=f.supply.ready&&seconds<14?'先遣舱桅杆相机已接管 · NX07获准最终进近':f.phase;
    timeNode.textContent=`T-${Math.max(0,Math.ceil(30-seconds))} s`;
    progress.value=f.seconds;
  }

  return {
    update,
    get skipped(){return skip;},
    finish(){
      fill.removeFromParent();supply.finish();hud.remove();document.body.classList.remove('is-arriving','kestrel-cabin-monitor');
      flames.visible=false;audio.finish();
      craft.position.set(craftBase.x,craftLandingY,craftBase.z);model.fitGround(heightAt,()=>false,{snap:true});model.update(0);shield.removeFromParent();flames.removeFromParent();
      shield.geometry.dispose();shield.material.dispose();flame.geometry.dispose();flame.material.dispose();
      supply.update({mast:1,...aim});
      onFinish(craftBase);
    }
  };
}
