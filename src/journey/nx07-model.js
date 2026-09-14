import * as THREE from 'three';
import {attachAsset,geometryKit} from './assets/blender-assets.js';
import {createAres} from './ares-model.js';
import {Rover,ROVER_SCALE} from '../../tools/rover/载具.js';
import {NX07,ARES,FEET,solveSupport,worldXZ,checkUnloadTerrain,createLandingInterlock} from './landing-support.js';
import {bakeHullField,columnHitsShip,pointInShip,rectHitsShip,rectOverlapsBox} from './ship-clearance.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z),ease=t=>t*t*(3-2*t);
// Every NX07 shares one cached GLB, so the underside heightfield is baked once.
let hullField=null;
function bakeHull(model){
 if(hullField)return hullField;
 model.parent.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(model.parent.matrixWorld).invert(),meshes=[];
 model.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;meshes.push({positions:g.attributes.position.array,index:g.index?.array,matrix:new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld).elements});});
 return hullField=bakeHullField(meshes);
}
export function createNX07(){
 const group=new THREE.Group();group.name='NX07 · exploration cargo lander';
 const {box,rod,poseRod}=geometryKit(group),interlock=createLandingInterlock();
 const solids={field:null,rods:[],boxes:[]};
 const hullReady=attachAsset(group,'nx07',model=>{solids.field=bakeHull(model);});hullReady.catch(()=>{});
 const truck=createAres(),payload=truck.group;payload.name='ARES secured cargo';group.add(payload);
 const rover=new Rover({heightAt:()=>0,normalAt:(x,z,d,out)=>out.set(0,1,0)},new THREE.Group());rover.placeAt(0,0);rover.panelDeploy=rover.panelTarget=0;rover.updateVisuals(0,{});rover.root.position.set(0,3.20-.95*(1-ROVER_SCALE),-2.45);rover.root.name='MU-7 transport cargo';payload.add(rover.root);
 let terrain=()=>0,obstacles=()=>false,grounding=null,delivered=false,doorWanted=false,lift=0,transfer=null;
 const ports=[{x:0,z:-8,w:7.84,d:12.64,y:-5.95},...[-1,1].map(s=>({x:s*16.8,z:13.2,w:5.2,d:8.4,y:-5.6})),...[-1,1].map(s=>({x:s*16.4,z:27.04,w:3.92,d:5.2,y:-4.25}))];
 const doors=[],platforms=[],freight=new THREE.Group();freight.name='NX07 cargo systems';group.add(freight);
 ports.forEach((p,i)=>{
  const bay=new THREE.Group();bay.name=`ventral bay ${i+1}`;bay.position.set(p.x,p.y,p.z);group.add(bay);
  // Jambs frame genuine holes cut in the Blender mesh; the centre reactor stays intact.
  for(const s of [-1,1]){box('cargo jamb',[.16,.26,p.d+.2],[s*(p.w/2+.05),0,0],'metal',bay);box('cargo sill',[p.w,.26,.16],[0,0,s*(p.d/2+.05)],'metal',bay);}
  const leaves=[];
  for(const s of [-1,1]){const leaf=new THREE.Group();bay.add(leaf);leaf.position.x=s*p.w/4;box('sliding armored hatch',[p.w/2,.20,p.d],[0,0,0],'white',leaf);for(let k=0;k<6;k++)box('ventral service louver',[p.w*.22,.08,.12],[0,-.14,(k-2.5)*p.d/9],'dark',leaf);box('hatch status strip',[.08,.06,p.d*.55],[s*p.w*.18,-.16,0],'light',leaf);leaves.push({leaf,s});}
  doors.push({p,bay,leaves});
  const platform=new THREE.Group();platform.name=i===0?'ARES cargo elevator':'freight elevator '+i;platform.position.set(p.x,NX07.deck,p.z);group.add(platform);
  // Main deck nearly fills the 7.84 m opening: ARES (5.1 m) drives between its guide posts.
  const w=i===0?7.4:p.w-.4,d=i===0?12.2:p.d-.4;
  box('load-bearing lift deck',[w,.18,d],[0,-.09,0],'dark',platform);
  for(const s of [-1,1]){box('lift edge',[.1,.08,d],[s*(w/2-.1),.03,0],'orange',platform);box('lift end',[w,.08,.10],[0,.03,s*(d/2-.1)],'orange',platform);}
  const cables=[];for(const s of [-1,1])for(const t of [-1,1]){const m=rod('telescopic elevator guide',i===0?.075:.04,'metal');cables.push({m,x:p.x+s*(w/2-.2),z:p.z+t*(d/2-.2)});}
  platforms.push({group:platform,p,w,d,deck:i===0?NX07.deck:p.y+.35,cables});
  if(i>0){box('secured expedition crate',[w*.65,.85,d*.40],[0,.43,0],'white',platform);box('cargo restraint',[w*.70,.10,d*.45],[0,.65,0],'orange',platform);}
 });
 // Loading-pad highlight: pulsing deck outline plus lane lights along the stern approach.
 // Unfogged and not tone-mapped so the guide stays cyan through dust haze and night.
 const glow=new THREE.MeshBasicMaterial({color:0x46e6ff,transparent:true,opacity:.9,depthWrite:false,fog:false,toneMapped:false}),glowFill=new THREE.MeshBasicMaterial({color:0x46e6ff,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false});
 const padGlow=new THREE.Group();padGlow.name='ARES loading pad highlight';padGlow.visible=false;platforms[0].group.add(padGlow);
 {const W=platforms[0].w-.5,D=platforms[0].d-.5,add=(sx,sz,x,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,.05,sz),glow);m.position.set(x,.11,z);padGlow.add(m);};
  add(W,.16,0,D/2);add(W,.16,0,-D/2);add(.16,D,W/2,0);add(.16,D,-W/2,0);
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(W,D),glowFill);fill.rotation.x=-Math.PI/2;fill.position.y=.1;padGlow.add(fill);
  for(const z of [-4.2,-2.6,-1])for(const sx of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(1.5,.05,.22),glow);m.position.set(sx*.5,.12,z);m.rotation.y=sx*.7;padGlow.add(m);}}
 const laneLights=[];const lane=new THREE.Group();lane.name='ARES loading approach lights';lane.visible=false;group.add(lane);
 for(let z=NX07.exitZ+3;z<=-16;z+=3)for(const sx of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.12,.9),glow);m.position.set(sx*3.2,0,z);lane.add(m);laneLights.push(m);}
 let padWasReady=false,glowClock=0;
 const legParts=FEET.map((f,i)=>{
  // Underside heights sampled from the exported hull at each anchor (metres).
  const skinY=i<2?-2.19:-4.515;
  const mount=v(f.ax,skinY-.06,f.az),assembly=new THREE.Group();assembly.name='splayed retractable landing gear '+i;group.add(assembly);
  const sleeve=rod('landing main sleeve',.48,'dark',assembly),piston=rod('landing chrome piston',.27,'metal',assembly),brace=rod('triangulated side brace',.25,'white',assembly);
  const anchor=rod('landing brace root beam',.25,'dark',assembly);poseRod(anchor,mount,mount.clone().add(v(0,.2,2.5)));
  const foot=box('swivelling ground pad',[2.7,.26,2.8],[f.x,-10.2,f.z],'metal',assembly);
  box('reinforced hull mount',[1.8,.42,3.0],[f.ax,skinY+.04,f.az],'dark');
  const cover=box('flush landing gear cover',[2.2,.18,3.4],[f.ax,skinY-.14,f.az],'white');
  return {...f,skinY,mount,assembly,sleeve,piston,brace,foot,cover};
 });
 const world=(x,z)=>worldXZ({x:group.position.x,z:group.position.z,heading:group.rotation.y},x,z);
 function fitGround(heightAt,blocked=()=>false,{snap=false}={}){
  terrain=heightAt;obstacles=blocked;grounding=solveSupport({x:group.position.x,z:group.position.z,heading:group.rotation.y},heightAt,blocked);
  group.position.y=grounding.height;grounding.tip=world(0,NX07.exitZ);grounding.tipY=terrain(grounding.tip.x,grounding.tip.z);grounding.slope=0;
  if(snap)interlock.snapPark(grounding.valid);else interlock.ground(true,grounding.valid);
  return grounding;
 }
 function landingHeight(heightAt,x=group.position.x,z=group.position.z,yaw=group.rotation.y){return solveSupport({x,z,heading:yaw},heightAt).height;}
 function checkRamp(blocked=obstacles){
  if(group.userData.assetState!=='ready'||payload.userData.assetState!=='ready')return {ok:false,reason:'飞船 / 火星车模型加载中，请稍候'};
  if(!interlock.stable)return {ok:false,reason:grounding?.valid?interlock.label:grounding?.reason||'起落架尚未完成触地找平'};
  return checkUnloadTerrain({x:group.position.x,z:group.position.z,heading:group.rotation.y},terrain,blocked);
 }
 function deckGround(p){let h=-Infinity;for(const x of [-p.w*.43,0,p.w*.43])for(const z of [-p.d*.43,0,p.d*.43]){const q=world(p.x+x,p.z+z);h=Math.max(h,terrain(q.x,q.z));}return h-group.position.y+.13;}
 function poseTruck(z,onPlatform){
  payload.position.set(0,onPlatform?platforms[0].group.position.y+.01:0,z);payload.rotation.set(0,0,0);
  if(!onPlatform){const f=world(0,z+3.45),b=world(0,z-2.66),front=terrain(f.x,f.z),back=terrain(b.x,b.z);payload.position.y=(front*2.66+back*3.45)/6.11-group.position.y+.02;payload.rotation.x=-Math.atan2(front-back,6.11);}
 }
 // pad: ARES already stopped on the lowered lift ({x,z,yaw} ship-local); it is clamped, aligned, then raised.
 function moveCargo(loading,pad=null){
  if(transfer)return transfer.promise;
  const check=checkRamp();if(!check.ok||!interlock.ready)return Promise.reject(Error(check.ok?'舱门尚未完全打开':check.reason));
  if(!interlock.lockCargo(true))return Promise.reject(Error('装卸机构忙碌'));
  let resolve;const promise=new Promise(r=>resolve=r);transfer={loading,time:0,promise,resolve,pad};payload.visible=true;if(loading)lift=1;return promise;
 }
 function update(dt){
  dt=Math.min(.1,Math.max(0,dt));
  // Close order: empty elevator home, then sliding leaves close. Takeoff waits for both.
  if(!doorWanted&&!transfer){lift=Math.max(0,lift-dt/4);if(lift===0)interlock.open(false);}
  // With ARES on the surface, an open belly lowers the main lift as a drive-on loading pad.
  if(doorWanted&&delivered&&!transfer&&interlock.ready)lift=Math.min(1,lift+dt/4);
  interlock.update(dt);
  if(transfer){transfer.time+=dt;const pad=transfer.pad,t=pad?Math.min(1,.64+Math.max(0,transfer.time-1.6)/14):Math.min(1,transfer.time/14),u=transfer.loading?1-t:t;lift=Math.min(1,u/.36);const drive=ease(Math.max(0,(u-.36)/.64));poseTruck(-8+(NX07.exitZ+8)*drive,drive===0);for(let i=0;i<6;i++)truck.parts['wheel.'+i].rotation.x=drive*43/ARES.radius;
   if(pad){const k=1-ease(Math.min(1,transfer.time/1.6));payload.position.x+=pad.x*k;payload.position.z+=(pad.z+8)*k;payload.rotation.y=pad.yaw*k;}
   if(t===1){const done=transfer.resolve,loading=transfer.loading;transfer=null;interlock.lockCargo(false);delivered=!loading;payload.visible=loading;done();}
  }
  for(let i=0;i<platforms.length;i++){const a=platforms[i],p=a.p,t=i===0?lift:interlock.door;a.group.position.y=THREE.MathUtils.lerp(a.deck,deckGround(p),t);
   for(const c of a.cables){poseRod(c.m,v(c.x,a.deck+1,c.z),v(c.x,a.group.position.y+.12,c.z));c.m.visible=interlock.door>.01;}
  }
  if(!transfer&&!delivered)poseTruck(-8,true);
  for(const d of doors)for(const {leaf,s} of d.leaves){leaf.position.x=s*(d.p.w/4+interlock.door*d.p.w*.54);leaf.position.y=-interlock.door*.35;}
  for(let i=0;i<legParts.length;i++){const leg=legParts[i],g=interlock.gear,fit=grounding?.feet[i],end=v(leg.x,(fit?.y??group.position.y-NX07.rest)-group.position.y+.26,leg.z),stowed=v(leg.ax-Math.sign(leg.ax)*3,-.5,leg.az+3);end.lerpVectors(stowed,end,ease(g));
   leg.assembly.visible=g>.001;leg.cover.rotation.z=Math.sign(leg.ax)*g*1.35;const knee=leg.mount.clone().lerp(end,.55);poseRod(leg.sleeve,leg.mount,knee);poseRod(leg.piston,knee,end);poseRod(leg.brace,leg.mount.clone().add(v(0,.2,2.5)),end.clone().lerp(leg.mount,.12));leg.foot.position.copy(end).y-=.13;
   if(fit){const n=v(-fit.dx,1,-fit.dz).normalize();const inverseYaw=new THREE.Quaternion().setFromAxisAngle(v(0,1,0),-group.rotation.y);n.applyQuaternion(inverseYaw);leg.foot.quaternion.setFromUnitVectors(v(0,1,0),n);}
  }
  const ready=padReady();padGlow.visible=lane.visible=ready;
  if(ready){glowClock+=dt;glow.opacity=.55+.4*Math.sin(glowClock*4);glowFill.opacity=.24+.1*Math.sin(glowClock*4);
   if(!padWasReady)for(const m of laneLights){const q=world(m.position.x,m.position.z);m.position.y=terrain(q.x,q.z)-group.position.y+.08;}}
  padWasReady=ready;
  rebuildSolids();
 }
 function padReady(){return delivered&&doorWanted&&!transfer&&interlock.ready&&lift>=.999&&group.userData.assetState==='ready';}
 // Live collision solids in ship-local metres, mirroring the poses just drawn.
 function rebuildSolids(){
  const rods=solids.rods,boxes=solids.boxes,g=interlock.gear;rods.length=boxes.length=0;
  const seg=(a,b,r)=>rods.push({a:{x:a.x,y:a.y,z:a.z},b:{x:b.x,y:b.y,z:b.z},r});
  for(const leg of legParts){
   // Hinged cover swings below the skin as the gear deploys.
   boxes.push({x:leg.ax,z:leg.az,hw:1.1,hd:1.7,bottom:leg.skinY-.24-Math.sin(g*1.35)*1.1,top:leg.skinY+.3});
   if(!leg.assembly.visible)continue;
   const ends=m=>{const h=v(0,m.scale.y/2,0).applyQuaternion(m.quaternion);return [m.position.clone().sub(h),m.position.clone().add(h)];};
   for(const [m,r] of [[leg.sleeve,.48],[leg.piston,.27],[leg.brace,.25]]){const [a,b]=ends(m);seg(a,b,r);}
   seg(leg.mount,leg.mount.clone().add(v(0,.2,2.5)),.25);
   boxes.push({x:leg.foot.position.x,z:leg.foot.position.z,hw:1.35,hd:1.4,bottom:-Infinity,top:leg.foot.position.y+.4});
  }
  for(const [i,d] of doors.entries()){const p=d.p,bar={bottom:p.y-.13,top:p.y+.13};
   for(const sx of [-1,1])boxes.push({...bar,x:p.x+sx*(p.w/2+.05),z:p.z,hw:.08,hd:p.d/2+.1});
   // The stern sill of the ARES bay is left out while its lift is down: the unload
   // animation already drives the truck (crane/antenna 5.4 m) under that 4.5 m rail.
   for(const sz of [-1,1])if(!(i===0&&sz<0&&lift>.01))boxes.push({...bar,x:p.x,z:p.z+sz*(p.d/2+.05),hw:p.w/2,hd:.08});
   for(const {leaf} of d.leaves)boxes.push({x:p.x+leaf.position.x,z:p.z,hw:p.w/4,hd:p.d/2,bottom:p.y+leaf.position.y-.3,top:p.y+leaf.position.y+.1});
  }
  for(const [i,a] of platforms.entries()){
   if(i===0&&lift>=.999){for(const c of a.cables)if(c.m.visible)seg(v(c.x,a.deck+1,c.z),v(c.x,a.group.position.y+.12,c.z),.075);continue;}
   boxes.push({x:a.p.x,z:a.p.z,hw:a.w/2,hd:a.d/2,bottom:a.group.position.y-.18,top:a.deck+1});
  }
  if(transfer&&payload.visible)boxes.push({x:0,z:payload.position.z+(ARES.minZ+ARES.maxZ)/2,hw:ARES.width/2,hd:ARES.length/2,bottom:payload.position.y,top:payload.position.y+ARES.height});
 }
 const local=(x,z)=>{const dx=x-group.position.x,dz=z-group.position.z,c=Math.cos(group.rotation.y),s=Math.sin(group.rotation.y);return {x:dx*c-dz*s,z:dx*s+dz*c};};
 const ready=Promise.all([hullReady,truck.ready]);ready.catch(()=>{});
 return {group,payload,roverPayload:rover.root,freight,legParts,platforms,doors,interlock,ready,fitGround,landingHeight,checkRamp,update,
  cargoBounds:new THREE.Box3(v(-3.72,NX07.deck,-14.12),v(3.72,3.4,-1.88)),
  get grounding(){return grounding;},get supportReady(){return interlock.stable;},get gearProgress(){return interlock.gear;},get status(){return interlock.label;},
  setDoor(open){if(open){if(!checkRamp().ok||!interlock.open(true))return false;doorWanted=true;}else{if(transfer)return false;doorWanted=false;}return true;},
  get doorOpen(){return doorWanted;},get doorReady(){return interlock.ready;},get doorClosed(){return interlock.closed&&lift===0&&!doorWanted;},get unloading(){return !!transfer;},
  unload:()=>moveCargo(false),load:()=>moveCargo(true),loadFromPad(x,z,heading){const o=this.dockOffset(x,z,heading);return moveCargo(true,{x:o.x,z:o.z-8,yaw:o.yaw});},exitPoint(){return {...world(0,NX07.exitZ),heading:group.rotation.y};},
  setDelivered(v){delivered=!!v;payload.visible=!v;},setRoverCargoVisible(v){rover.root.visible=!!v;},
  requestTakeoff(){if(!this.doorClosed)return false;return interlock.takeoff();},prepareLanding(heightAt,blocked){terrain=heightAt;obstacles=blocked;grounding=solveSupport({x:group.position.x,z:group.position.z,heading:group.rotation.y},heightAt,blocked);},setAirborne(){interlock.ground(false,false);},deployGear(){interlock.deploy();},setFlightPose(t=0){interlock.flightPose(t);},
  // height: the object's own height above its ground. Infinity = plan-view silhouette
  // (nothing may park under the ship). Before the GLB loads, keep the old hull envelope.
  contains(x,z,pad=0,height=Infinity){const p=local(x,z);if(Math.abs(p.x)>38+pad||p.z<-58-pad||p.z>46+pad)return false;
   if(!solids.field)return Math.abs(p.x)<37+pad&&p.z>-42-pad&&p.z<45+pad;
   const bottom=terrain(x,z)-group.position.y;if(!Number.isFinite(bottom)||!Number.isFinite(height))return columnHitsShip(solids,p.x,p.z,pad);
   return columnHitsShip(solids,p.x,p.z,pad,bottom,bottom+height);},
  get solids(){return solids;},
  // Vehicle footprint (world centre of its origin, yaw, half sizes, local z offset of the box centre).
  rectHits(x,z,yaw,{hw,hl,oz=0},groundMin,groundMax,height){const cx=x+oz*Math.sin(yaw),cz=z+oz*Math.cos(yaw),p=local(cx,cz);
   if(Math.abs(p.x)>40+hl+hw||p.z<-60-hl-hw||p.z>48+hl+hw)return false;
   const rect={x:p.x,z:p.z,yaw:yaw-group.rotation.y,hw,hl};
   if(!solids.field)return rectOverlapsBox(rect,{x:0,z:1.5,hw:37,hd:43.5});
   return rectHitsShip(solids,rect,groundMin-group.position.y,groundMax-group.position.y+height);},
  // Does a vehicle footprint overlap the ARES lift column (where the lift travels)?
  overBay(x,z,yaw,{hw,hl,oz=0},margin=.3){const p=local(x+oz*Math.sin(yaw),z+oz*Math.cos(yaw)),m=ports[0];return rectOverlapsBox({x:p.x,z:p.z,yaw:yaw-group.rotation.y,hw,hl},{x:m.x,z:m.z,hw:m.w/2,hd:m.d/2},margin);},
  get padReady(){return padReady();},
  // ARES origin pose in ship-local metres relative to the lift clamp point.
  dockOffset(x,z,heading){const p=local(x,z);return {x:p.x,z:p.z+8,yaw:Math.atan2(Math.sin(heading-group.rotation.y),Math.cos(heading-group.rotation.y))};},
  padPoint(){return {...world(0,-8),heading:group.rotation.y};},
  solidAt(x,y,z){const p=local(x,z);if(Math.abs(p.x)>40||p.z<-60||p.z>48)return false;return pointInShip(solids,p.x,y-group.position.y,p.z);},
  // Secondary freight elevators descend when the belly doors open.
  underFreight(x,z,pad=0){const p=local(x,z);return platforms.slice(1).some(a=>Math.abs(p.x-a.p.x)<a.p.w/2+pad&&Math.abs(p.z-a.p.z)<a.p.d/2+pad);},
  dispose(){group.removeFromParent();} // Shared cached GLB buffers live for the scene lifetime.
 };
}
