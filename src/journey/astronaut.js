import * as THREE from 'three';
import { makeDriveInput } from '../../tools/rover/输入.js';
import { walkStep, WALK_SPEED, RUN_SPEED } from './walking.js';

/** One EVA character, feet at y=0, +Z forward, authored suit height 1.9 m. */
export function createAstronaut({scene, camera, canvas, heightAt, blocked, ceilingAt = () => Infinity, solidAt = () => false}) {
  const root = new THREE.Group(); root.name = 'COSMOS EVA astronaut'; root.visible = false; scene.add(root);
  const suit = new THREE.MeshStandardMaterial({color:0xe1e3dc, roughness:.78});
  const joint = new THREE.MeshStandardMaterial({color:0x29373c, roughness:.88});
  const orange = new THREE.MeshStandardMaterial({color:0xcd6941, roughness:.65});
  const visor = new THREE.MeshStandardMaterial({color:0x936b27, metalness:.82, roughness:.19});
  const lamp = new THREE.MeshBasicMaterial({color:0xc6f7f0});
  function part(parent, name, geometry, material, x,y,z, sx=1,sy=1,sz=1) {
    const m = new THREE.Mesh(geometry, material); m.name=name; m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
  }
  const sphere = new THREE.SphereGeometry(1,24,16);
  const box = new THREE.BoxGeometry(1,1,1);
  part(root,'Pressure torso',sphere,suit,0,1.14,0,.32,.4,.22);
  part(root,'Hip joint',sphere,joint,0,.85,0,.27,.16,.18);
  part(root,'Life support pack',box,suit,0,1.17,-.29,.47,.62,.24);
  part(root,'Pack service panel',box,joint,0,1.18,-.42,.35,.42,.03);
  part(root,'Pack stripe',box,orange,0,1.2,-.445,.37,.075,.015);
  part(root,'Chest console',box,joint,0,1.25,.21,.32,.23,.07);
  for(let i=0;i<3;i++) part(root,'Console indicator',box,lamp,-.08+i*.08,1.29,.252,.035,.018,.008);
  part(root,'Neck seal',new THREE.CylinderGeometry(.2,.21,.09,24),joint,0,1.48,0);
  part(root,'Helmet shell',sphere,suit,0,1.65,0,.27,.27,.26);
  part(root,'Gold visor',sphere,visor,0,1.67,.13,.235,.195,.18);
  for(const x of [-.25,.25]) part(root,'Helmet light',sphere,lamp,x,1.7,.09,.035,.03,.045);
  const legs=[],arms=[];
  for(const side of [-1,1]) {
    const leg=new THREE.Group(); leg.position.set(side*.16,.84,0); root.add(leg); legs.push(leg);
    part(leg,'Upper leg',sphere,suit,0,-.19,0,.135,.25,.145);
    part(leg,'Knee seal',sphere,joint,0,-.4,.025,.12,.10,.12);
    part(leg,'Shin',sphere,suit,0,-.57,0,.12,.2,.13);
    part(leg,'Boot',box,joint,0,-.76,.055,.24,.16,.36);
    const arm=new THREE.Group(); arm.position.set(side*.34,1.37,0); root.add(arm); arms.push(arm);
    part(arm,'Sleeve',sphere,suit,side*.015,-.16,0,.12,.22,.13);
    part(arm,'Shoulder stripe',sphere,orange,0,-.07,0,.123,.06,.135);
    part(arm,'Elbow',sphere,joint,side*.02,-.34,0,.09,.085,.10);
    part(arm,'Forearm',sphere,suit,side*.025,-.46,.025,.095,.16,.10);
    part(arm,'Glove',sphere,joint,side*.025,-.61,.05,.085,.095,.10);
  }
  // A terrain-conforming contact patch also works in the park's cached shadow map.
  const contact=new THREE.Mesh(new THREE.CircleGeometry(.44,32),new THREE.MeshBasicMaterial({color:0x16120e,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
  contact.name='EVA ground contact';contact.visible=false;scene.add(contact);
  const contactBase=contact.geometry.attributes.position.array.slice();
  const input=makeDriveInput(window,{canvas,enabled:false,touch:false});
  const touch=document.createElement('div'); touch.className='eva-touch'; touch.hidden=true;
  const held=new Map();
  for(const [key,label] of [['forward','前进'],['left','左移'],['back','后退'],['right','右移'],['run','快走']]) {
    const b=document.createElement('button'); b.textContent=label; b.setAttribute('aria-label','步行'+label);
    b.onpointerdown=e=>{e.preventDefault();held.set(e.pointerId,key);try{b.setPointerCapture(e.pointerId);}catch{}};
    for(const event of ['pointerup','pointercancel','lostpointercapture']) b.addEventListener(event,e=>held.delete(e.pointerId));
    touch.append(b);
  }
  document.body.append(touch);
  const helmet=document.createElement('div'); helmet.className='eva-helmet'; helmet.hidden=true;
  helmet.innerHTML='<span>EVA / COSMOS</span><i></i><small>舱外步行</small>'; document.body.append(helmet);
  let remote=false, active=false, paused=false, firstPerson=false, heading=0, bodyHeading=0, pitch=.12, distance=4.8, phase=0, speed=0;
  const position=new THREE.Vector3(), look=new THREE.Vector3();
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function sync(){ input.setEnabled(active&&!paused); held.clear(); root.visible=remote||(active&&!firstPerson);
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
    const norm=Math.max(1,Math.hypot(forward,right)), pace=c.boost||has('run')?RUN_SPEED:WALK_SPEED;
    const dx=(Math.sin(heading)*forward-Math.cos(heading)*right)*pace*dt/norm;
    const dz=(Math.cos(heading)*forward+Math.sin(heading)*right)*pace*dt/norm;
    const next=walkStep(position,dx,dz,heightAt,blocked);
    speed=dt?Math.hypot(next.x-position.x,next.z-position.z)/dt:0;
    position.set(next.x,next.y,next.z); root.position.copy(position);
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
    const swing=Math.sin(phase)*Math.min(1,speed/WALK_SPEED)*.42;
    legs.forEach((leg,i)=>leg.rotation.x=(i?1:-1)*swing);
    arms.forEach((arm,i)=>arm.rotation.x=(i?-1:1)*swing*.7);
    const bob=reduced?0:Math.sin(phase*2)*.018*Math.min(1,speed/WALK_SPEED);
    look.set(position.x,position.y+1.65+bob,position.z);
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
      const eye=look.clone();
      for(let i=1;i<=30;i++){
        const p=look.clone().lerp(target,i/30);
        if(p.y>ceilingAt(p.x,p.z)-.12||blocked(p.x,p.z)||solidAt(p.x,p.y,p.z))break;
        eye.copy(p);
      }
      camera.position.copy(eye);
    }
    camera.lookAt(look); camera.fov=firstPerson?68:55; camera.updateProjectionMatrix();
  }
  function unseat(){if(root.parent!==scene)scene.add(root);root.traverse(o=>{if(o.name.includes('Helmet')||o.name==='Gold visor')o.visible=true;});legs.forEach(l=>l.rotation.x=0);arms.forEach(a=>a.rotation.x=0);}
  return {root,seat(parent){remote=false;active=false;sync();parent.add(root);root.position.set(-.43,1.45,3.45);root.rotation.set(0,0,0);legs.forEach(l=>l.rotation.x=-1.15);arms.forEach(a=>a.rotation.x=-.85);root.visible=true;},seatView(first){root.traverse(o=>{if(o.name.includes('Helmet')||o.name==='Gold visor')o.visible=!first;});},update,get active(){return active;},get position(){return position;},get heading(){return heading;},get speed(){return speed;},
    get view(){return firstPerson?'第一人称':'第三人称';},
    start(p){unseat();position.set(p.x,heightAt(p.x,p.z),p.z);heading=p.heading||0;bodyHeading=heading;remote=false;active=true;sync();update(0);},
    stop(){remote=false;active=false;speed=0;sync();},
    standby(){remote=true;active=false;speed=0;legs.forEach(l=>l.rotation.x=0);arms.forEach(a=>a.rotation.x=0);sync();},setPaused(value){paused=value;sync();},
    setView(value){firstPerson=!!value;sync();update(0);},
    cycle(){firstPerson=!firstPerson;sync();update(0);}};
}
