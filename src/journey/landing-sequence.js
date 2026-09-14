import * as THREE from 'three';
import {createSupplyDrop} from './supply-drop-model.js';
import {createKestrel} from './kestrel-model.js';
import {arrivalFrame} from './landing-timeline.js';
import {findLandingSite} from './landing-support.js';

const smoothstep=t=>{const u=THREE.MathUtils.clamp(t,0,1);return u*u*(3-2*u);};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

// Compatibility export for callers that used the old Kestrel-only frame helper.
export function landingFrame(seconds){return arrivalFrame(seconds).kestrel;}

export function createLandingSequence({scene,camera,heightAt,asset,supply:providedSupply,onFinish=()=>{}}){
  const fill=new THREE.HemisphereLight(0xb8cddd,0x7b4b34,1.4);scene.add(fill);
  const supply=providedSupply||createSupplyDrop(scene);supply.group.visible=true;
  const model=asset||createKestrel(),craft=model.group;scene.add(craft);craft.visible=true;

  const shield=new THREE.Mesh(new THREE.CylinderGeometry(10,10,.15,32),new THREE.MeshStandardMaterial({color:0x3c2922,emissive:0xff410c,transparent:true,opacity:.24}));
  shield.position.y=-2.05;craft.add(shield);
  const flames=new THREE.Group();flames.name='Kestrel powered descent plumes';craft.add(flames);
  for(const [x,z] of [[-4.6,-5.8],[4.6,-5.8],[-4.6,3.8],[4.6,3.8]]){
    const f=new THREE.Mesh(new THREE.ConeGeometry(1.05,7.5,14),new THREE.MeshBasicMaterial({color:0xffb269,transparent:true,opacity:.68,depthWrite:false}));
    f.rotation.z=Math.PI;f.position.set(x,-2.4,z);flames.add(f);
  }
  const dust=new THREE.Mesh(new THREE.RingGeometry(5,20,48),new THREE.MeshBasicMaterial({color:0xb77951,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
  dust.rotation.x=-Math.PI/2;scene.add(dust);
  const supplyDust=new THREE.Mesh(new THREE.RingGeometry(2.5,9,40),new THREE.MeshBasicMaterial({color:0xb77951,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
  supplyDust.rotation.x=-Math.PI/2;scene.add(supplyDust);

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

  const supplyPosition=providedSupply?supply.group.position:{x:6,z:-25};
  const avoidSupply=(x,z)=>Math.hypot(x-supplyPosition.x,z-supplyPosition.z)<12;
  const craftBase=findLandingSite({x:-65,z:-38},heightAt,avoidSupply)||{x:-65,z:-38,heading:0},craftGround=heightAt(craftBase.x,craftBase.z);
  craft.position.set(craftBase.x,craftGround,craftBase.z);craft.rotation.set(0,craftBase.heading,0);model.fitGround(heightAt);model.setFlightPose?.(0);const craftLandingY=craft.position.y;
  const supplyBase=providedSupply?{x:supply.group.position.x,z:supply.group.position.z}:{x:6,z:-25};
  const supplyGround=providedSupply?supply.group.position.y:heightAt(supplyBase.x,supplyBase.z);
  let skip=false;hud.querySelector('button').onclick=()=>skip=true;

  const phaseNode=hud.querySelector('.landing-phase'),feedNode=hud.querySelector('.landing-feed');
  const altNode=hud.querySelector('.landing-alt'),thrustNode=hud.querySelector('.landing-thrust');
  const linkNode=hud.querySelector('.landing-link'),mastNode=hud.querySelector('.landing-mast'),podNode=hud.querySelector('.landing-pod');
  const eventNode=hud.querySelector('.landing-event'),timeNode=hud.querySelector('.landing-time'),progress=hud.querySelector('progress');
  const lensPos=new THREE.Vector3();
  let aim={pan:0,tilt:0};

  function update(seconds){
    const f=arrivalFrame(seconds);

    // Independent pod lands first, raises its roof camera and slews it onto NX07.
    supply.group.position.set(supplyBase.x,supplyGround+f.supply.altitude,supplyBase.z);
    if(f.supply.mast>0){
      supply.lens.getWorldPosition(lensPos);
      const dx=craft.position.x-lensPos.x,dz=craft.position.z-lensPos.z,target={pan:wrapAngle(Math.atan2(dx,dz)-supply.group.rotation.y),tilt:Math.atan2(craft.position.y+1.5-lensPos.y,Math.hypot(dx,dz))};
      const slew=smoothstep((seconds-8)/3);
      aim={pan:target.pan*slew,tilt:target.tilt*slew};
    }
    supply.update({...f.supply,...aim});
    supply.group.updateMatrixWorld(true);
    supplyDust.position.set(supplyBase.x,supplyGround+.06,supplyBase.z);
    const supplyTouch=Math.max(0,1-Math.abs(seconds-5.5)/1.2);
    supplyDust.scale.setScalar(1+smoothstep((seconds-4.8)/1.4)*.8);
    supplyDust.material.opacity=.24*supplyTouch;

    craft.position.set(craftBase.x,craftLandingY+f.kestrel.altitude,craftBase.z);
    model.setFlightPose?.(smoothstep((seconds-22)/5));model.update?.(0);
    craft.rotation.z=seconds<6?Math.sin(seconds*1.4)*.018:0;
    shield.material.emissiveIntensity=f.kestrel.heat*2;
    flames.visible=f.kestrel.thrust>.01;
    for(const plume of flames.children)plume.scale.y=Math.max(.15,f.kestrel.thrust)*(1+Math.sin(seconds*42+plume.position.x)*.10);
    dust.position.set(craftBase.x,craftGround+.08,craftBase.z);
    dust.scale.setScalar(1+Math.max(0,seconds-24)*.52);
    dust.material.opacity=f.kestrel.altitude<45?Math.max(0,.42*(1-f.kestrel.altitude/45)*(seconds<29?1:30-seconds)):0;

    // Crew remains aboard. The large canvas is a cabin monitor: NX07 ventral feed first,
    // then the pod's roof camera becomes the external source for NX07 touchdown.
    if(f.feed==='POD MAST CAM'){
      supply.lens.getWorldPosition(lensPos);camera.position.copy(lensPos);
      camera.lookAt(craft.position.x,craft.position.y+1.5,craft.position.z);
      camera.fov=46;
    }else{
      camera.position.set(craft.position.x+8,craft.position.y-14,craft.position.z+12);
      camera.lookAt(supplyBase.x,supplyGround+Math.max(1.6,f.supply.altitude*.08),supplyBase.z+1.5);
      camera.fov=48;
    }
    camera.updateProjectionMatrix();

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
      flames.visible=false;dust.removeFromParent();supplyDust.removeFromParent();
      craft.position.set(craftBase.x,craftLandingY,craftBase.z);model.fitGround(heightAt,()=>false,{snap:true});model.update(0);shield.removeFromParent();flames.removeFromParent();
      supply.update({mast:1,...aim});
      onFinish(craftBase);
    }
  };
}
