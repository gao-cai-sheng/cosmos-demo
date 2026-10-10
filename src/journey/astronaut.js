import * as THREE from 'three';
import { makeDriveInput } from '../../tools/rover/输入.js';
import { walkStep, WALK_SPEED, RUN_SPEED, CROUCH_SPEED, MAX_AIR_SLOPE } from './walking.js';
import { loadAstronautModel, FOOT_LENGTH } from './astronaut-model.js';
import { createLocomotion, stepLocomotion, STAND_HEAD, CROUCH_HEAD, IDLE_SPEED } from './locomotion.js';
import { createBootPrints } from './boot-prints.js';
import { createCameraBoom } from './camera-boom.js';

/** One EVA character, feet at y=0, +Z forward, authored suit height 1.9 m. */
export function createAstronaut({scene, camera, canvas, heightAt, blocked, firstPersonFov = 68, cameraBlocked = (x, y, z) => blocked(x, z), ceilingAt = () => Infinity, solidAt = () => false, printable = () => true}) {
  const eyeFov=Number.isFinite(firstPersonFov)?THREE.MathUtils.clamp(firstPersonFov,50,80):68;
  const root = new THREE.Group(); root.name = 'COSMOS EVA astronaut'; root.visible = false; scene.add(root);
  // The suit arrives asynchronously; poses and helmet visibility set before then are applied on load.
  const portrait=new THREE.Group(); portrait.name='EVA portrait'; portrait.userData.assetState='loading';
  let rig=null, angles={}, helmetShown=true;
  // Baked clips drive the body while walking; pose() is the manual override for the ARES seat and
  // the fallback gait. The two never run at once - seating and standby stop the mixer first.
  let mixer=null, actions={}, current='', loco=createLocomotion();
  const FADE=.16;
  function pose(next={}){angles=next;rig?.pose(angles);}
  function showHelmet(value){helmetShown=value;if(rig)rig.helmet.visible=value;}
  loadAstronautModel().then(r=>{rig=r;root.add(r.model);portrait.add(r.statue);portrait.userData.assetState='ready';
    if(r.clips?.length){mixer=new THREE.AnimationMixer(r.model);for(const clip of r.clips)actions[clip.name]=mixer.clipAction(clip);}
    showHelmet(helmetShown);pose(angles);})
    .catch(error=>{portrait.userData.assetState='error';console.error('Failed to load astronaut.glb',error);});
  function play(name){
    if(current===name)return;
    const next=actions[name];
    if(!next){current='';return;}
    const once=name==='JumpStart'||name==='JumpLand';
    next.reset();next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,Infinity);
    next.clampWhenFinished=once;next.enabled=true;next.setEffectiveWeight(1);next.play();
    const previous=actions[current];
    if(previous&&previous!==next)next.crossFadeFrom(previous,FADE,false);
    current=name;
  }
  /** Hand the bones back to pose(): a stopped action leaves them wherever the clip was. */
  function stopClips(){mixer?.stopAllAction();current='';loco=createLocomotion();prints.reset();}
  // Seated limbs relative to the cab floor (D46): legs almost level toward the nose, hands resting on the thighs.
  // seat() adds the backrest recline back at hips and shoulders so they keep these angles when the torso leans back.
  const SEATED={thigh:-1.5,shin:.12,upperarm:-.75,forearm:.1},HIP=new THREE.Vector3(0,.86,0);
  // A terrain-conforming contact patch also works in the park's cached shadow map.
  const contact=new THREE.Mesh(new THREE.CircleGeometry(.44,32),new THREE.MeshBasicMaterial({color:0x16120e,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
  contact.name='EVA ground contact';contact.visible=false;scene.add(contact);
  const contactBase=contact.geometry.attributes.position.array.slice();
  // Boot prints in the regolith. `printable` keeps them off metal: a lowered NX07 deck or the
  // shelter floor is not soil, and heightAt quietly returns those floors as the ground.
  const prints=createBootPrints({parent:scene,heightAt});
  const heel=new THREE.Vector3(),toe=new THREE.Vector3();
  const input=makeDriveInput(window,{canvas,enabled:false,touch:false});
  const touch=document.createElement('div'); touch.className='eva-touch'; touch.hidden=true;
  const held=new Map();
  let touchJump=false;
  for(const [key,label] of [['forward','前进'],['left','左移'],['back','后退'],['right','右移'],['run','跑'],['crouch','蹲'],['jump','跳']]) {
    const b=document.createElement('button'); b.textContent=label; b.setAttribute('aria-label','步行'+label);
    // 跳是按一下，不是按住：只记一个待消费的标记，不进 held。
    b.onpointerdown=e=>{e.preventDefault();if(key==='jump')touchJump=true;else held.set(e.pointerId,key);try{b.setPointerCapture(e.pointerId);}catch{}};
    for(const event of ['pointerup','pointercancel','lostpointercapture']) b.addEventListener(event,e=>held.delete(e.pointerId));
    touch.append(b);
  }
  document.body.append(touch);
  const helmet=document.createElement('div'); helmet.className='eva-helmet'; helmet.hidden=true;
  helmet.innerHTML='<span>EVA / COSMOS</span><i></i><small>舱外步行</small>'; document.body.append(helmet);
  let remote=false, active=false, paused=false, firstPerson=false, heading=0, bodyHeading=0, pitch=.12, distance=4.8, phase=0, speed=0;
  const position=new THREE.Vector3(), look=new THREE.Vector3();
  const cameraBoom=createCameraBoom(),cameraProbe=new THREE.Vector3();
  const cameraHits=p=>p.y>ceilingAt(p.x,p.z)-.12||cameraBlocked(p.x,p.y,p.z)||solidAt(p.x,p.y,p.z);
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function sync(){ input.setEnabled(active&&!paused); held.clear(); touchJump=false; root.visible=remote||(active&&!firstPerson);
    contact.visible=active||remote;helmet.hidden=!active||!firstPerson; touch.hidden=!active||paused||!matchMedia('(pointer:coarse)').matches;
    document.body.classList.toggle('is-walking',active); }
  addEventListener('blur',()=>held.clear());
  document.addEventListener('visibilitychange',()=>held.clear());
  function update(dt) {
    if(!active||paused||document.hidden)return;
    dt=Math.min(dt,.05); const c=input.update(dt), has=k=>[...held.values()].includes(k);
    if(c.camCycle){firstPerson=!firstPerson;sync();}
    heading-=c.lookX*.003; pitch=THREE.MathUtils.clamp(pitch+c.lookY*.003,-1.1,1.15);
    if(!firstPerson&&c.zoom)distance=THREE.MathUtils.clamp(distance*Math.exp(c.zoom*.12),1.6,180);
    const forward=has('forward')?1:has('back')?-1:c.throttle;
    const right=has('right')?1:has('left')?-1:c.steer;
    const norm=Math.max(1,Math.hypot(forward,right));
    const pace=loco.crouched?CROUCH_SPEED:(c.boost||has('run')?RUN_SPEED:WALK_SPEED);
    const dx=(Math.sin(heading)*forward-Math.cos(heading)*right)*pace*dt/norm;
    const dz=(Math.cos(heading)*forward+Math.sin(heading)*right)*pace*dt/norm;
    const ground=heightAt(position.x,position.z);
    // Airborne the slope limit is relaxed: the arc, not the gradient, decides what can be cleared.
    const next=walkStep(position,dx,dz,heightAt,blocked,loco.airborne?MAX_AIR_SLOPE:undefined);
    speed=dt?Math.hypot(next.x-position.x,next.z-position.z)/dt:0;
    // Headroom above the boots. ceilingAt is an absolute world height; solidAt catches a hull
    // overhead that ceilingAt does not model, and only ever forces a crouch, never blocks walking.
    const roof=ceilingAt(next.x,next.z);
    let headroom=Number.isFinite(roof)?roof-next.y:Infinity;
    if(solidAt(next.x,next.y+STAND_HEAD-.1,next.z))headroom=Math.min(headroom,CROUCH_HEAD+.3);
    const jump=c.jump||touchJump; touchJump=false;
    stepLocomotion(loco,dt,{speed,jump,crouch:c.crouch||has('crouch')},{headroom,groundRise:next.y-ground});
    position.set(next.x,next.y+loco.lift,next.z); root.position.copy(position);
    if(speed>.04){
      const target=firstPerson?heading:Math.atan2(dx,dz);
      bodyHeading+=Math.atan2(Math.sin(target-bodyHeading),Math.cos(target-bodyHeading))*Math.min(1,dt*12);
    }
    root.rotation.y=bodyHeading;
    const cp=contact.geometry.attributes.position;
    for(let i=0;i<cp.count;i++){
      const x=position.x+contactBase[i*3],z=position.z+contactBase[i*3+1]*.7;
      cp.setXYZ(i,x,heightAt(x,z)+.018,z);
    }
    cp.needsUpdate=true;contact.geometry.computeBoundingSphere();
    phase+=speed*dt*3.7;
    if(mixer){
      play(loco.clip);
      const action=actions[loco.clip]; if(action)action.timeScale=loco.rate;
      mixer.update(dt);
    }else{
      // No clips in the GLB: keep the old sine gait so the legs still move.
      const swing=Math.sin(phase)*Math.min(1,speed/WALK_SPEED)*.42;
      pose({thigh_R:-swing,thigh_L:swing,upperarm_R:swing*.7,upperarm_L:-swing*.7});
    }
    // Each boot leaves its own mark at the moment it touches down, so the stride spacing on the
    // ground is the animation's, not a guess. Needs the bones after mixer.update(), hence here.
    if(rig&&printable(position.x,position.z)){
      root.updateMatrixWorld(true);
      const treading=speed>IDLE_SPEED||loco.landing>0;
      for(let i=0;i<rig.feet.length;i++){
        // Heel and toe both matter: a walk lands on the heel, a run rolls onto the toe, and the
        // boot is down as soon as either one is. Taking the ankle alone missed most of a run.
        rig.feet[i].getWorldPosition(heel);
        rig.feet[i].localToWorld(toe.set(0,FOOT_LENGTH,0));
        const rest=rig.footRest[i];
        const clearance=Math.min(heel.y-rest.ankle-heightAt(heel.x,heel.z),toe.y-rest.toe-heightAt(toe.x,toe.z));
        prints.step(i,{x:(heel.x+toe.x)/2,z:(heel.z+toe.z)/2,clearance,moving:treading,heading:bodyHeading});
      }
    }
    const bob=reduced?0:Math.sin(phase*2)*.018*Math.min(1,speed/RUN_SPEED);
    look.set(position.x,position.y+loco.eye+bob,position.z);
    if(firstPerson){
      camera.position.copy(look);
      look.add(new THREE.Vector3(Math.sin(heading)*Math.cos(pitch),-Math.sin(pitch),Math.cos(heading)*Math.cos(pitch)));
    }else{
      const target=look.clone().add(new THREE.Vector3(-Math.sin(heading)*distance*Math.cos(pitch),Math.sin(pitch)*distance+.45,-Math.cos(heading)*distance*Math.cos(pitch)));
      // A low orbit can aim the camera through the ground.  The old collision loop
      // stopped at the first buried sample, pinning the eye beside the astronaut
      // while `distance` kept changing invisibly.  Looking level again then exposed
      // that stored distance as a large jump.  Raise the orbit endpoint enough for
      // the complete sight line to clear the sampled terrain, so wheel zoom remains
      // visible at every pitch.
      for(let i=1;i<=30;i++){
        const t=i/30;
        const x=THREE.MathUtils.lerp(look.x,target.x,t);
        const z=THREE.MathUtils.lerp(look.z,target.z,t);
        const requiredEndY=look.y+(heightAt(x,z)+.25-look.y)/t;
        target.y=Math.max(target.y,requiredEndY);
      }
      // Buildings and shelter ceilings still shorten the boom. Terrain no longer
      // does: it has already been cleared by lifting the orbit above it.
      let safe=1;
      for(let i=1;i<=30;i++){
        cameraProbe.lerpVectors(look,target,i/30);
        if(!cameraHits(cameraProbe))continue;
        let low=(i-1)/30,high=i/30;
        // Refine the first boundary so the safe distance does not advance in
        // visible 1/30-arm steps when the player moves along a wall.
        for(let j=0;j<4;j++){
          const mid=(low+high)/2;
          cameraProbe.lerpVectors(look,target,mid);
          if(cameraHits(cameraProbe))high=mid;else low=mid;
        }
        safe=low;
        break;
      }
      camera.position.lerpVectors(look,target,cameraBoom.update(dt,safe));
    }
    camera.lookAt(look); camera.fov=firstPerson?eyeFov:55; camera.updateProjectionMatrix();
  }
  // seat() copied the seat's recline into the root; update() only ever writes rotation.y, so clear it here.
  function unseat(){if(root.parent!==scene)scene.add(root);root.quaternion.identity();showHelmet(true);stopClips();pose();}
  return {root,portrait,seat(parent,socket){remote=false;active=false;stopClips();sync();parent.add(root);
      // socket: the suit's hip joint and the seat's recline about X, in parent coordinates; the root (boot soles) hangs 0.86 m below the hip.
      root.quaternion.copy(socket.quaternion);root.position.copy(HIP).applyQuaternion(socket.quaternion).negate().add(socket.position);
      const lean=-socket.rotation.x,S=SEATED;pose({thigh_L:S.thigh+lean,thigh_R:S.thigh+lean,shin_L:S.shin,shin_R:S.shin,upperarm_L:S.upperarm+lean,upperarm_R:S.upperarm+lean,forearm_L:S.forearm,forearm_R:S.forearm});root.visible=true;},seatView(first){showHelmet(!first);},update,get active(){return active;},get position(){return position;},get heading(){return heading;},get speed(){return speed;},
    get view(){return firstPerson?'第一人称':'第三人称';},
    get motion(){return {clip:loco.clip,rate:loco.rate,airborne:loco.airborne,crouched:loco.crouched,lift:loco.lift,prints:prints.count};},
    start(p){unseat();prints.reset();position.set(p.x,heightAt(p.x,p.z),p.z);heading=p.heading||0;bodyHeading=heading;remote=false;active=true;cameraBoom.reset();sync();update(0);},
    stop(){remote=false;active=false;speed=0;stopClips();pose();sync();},
    standby(){remote=true;active=false;speed=0;stopClips();pose();sync();},setPaused(value){paused=value;sync();},
    setView(value){firstPerson=!!value;cameraBoom.reset();sync();update(0);},
    cycle(){firstPerson=!firstPerson;cameraBoom.reset();sync();update(0);}};
}
