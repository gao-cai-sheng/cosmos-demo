import * as THREE from 'three';
import {NX07_PORTS} from './nx07-dimensions.js';
import {attachAsset,geometryKit} from './assets/blender-assets.js';
import {createAres} from './ares-model.js';
import {Rover,ROVER_SCALE} from '../../tools/rover/载具.js';
import {NX07,NX07_SCALE as K,ARES,FEET,solveSupport,worldXZ,checkUnloadTerrain,checkCrewLiftTerrain,LOAD_PAD,createLandingInterlock} from './landing-support.js';
import {bakeHullField,columnHitsShip,pointInShip,rectHitsShip,rectOverlapsBox} from './ship-clearance.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z),ease=t=>t*t*(3-2*t),clamp01=t=>Math.min(1,Math.max(0,t));
// Hinged belly doors are separate GLB nodes cut from the hull skin (export_assets.py).
const DOOR_NODE=/^door_(\d)_([np])$/,DOOR_OPEN=Math.PI*2/3;
// Crew lifts (ports 2–5): door swing and deck travel seconds; widest ground spread a deck may bridge;
// width of the walk-on skirt that ramps the 0.13 m step onto a lowered deck.
const CREW_DOOR_S=2.5,CREW_LIFT_S=6,CREW_RAMP=.6;
const isDoor=o=>{for(let p=o;p;p=p.parent)if(DOOR_NODE.test(p.name))return true;return false;};
const meshesOf=(root,inverse,skip=()=>false)=>{const out=[];root.traverse(o=>{if(!o.isMesh||skip(o))return;const g=o.geometry;out.push({positions:g.attributes.position.array,index:g.index?.array,matrix:new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld).elements});});return out;};
// Painted port numbers: amber stencil with a dark rim, one shared material per number.
const numberMaterials=new Map();
function numberMaterial(no){
 if(numberMaterials.has(no))return numberMaterials.get(no);
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
 g.font='bold 210px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
 g.lineWidth=16;g.strokeStyle='#15191c';g.strokeText(String(no),128,142);g.fillStyle='#f2b233';g.fillText(String(no),128,142);
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 const m=new THREE.MeshStandardMaterial({map,transparent:true,roughness:.62,metalness:.08,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 numberMaterials.set(no,m);return m;
}
// Every NX07 shares one cached GLB, so the underside heightfield is baked once.
// Doors move, so they are live solids rather than part of the baked hull.
let hullField=null;
function bakeHull(model){
 if(hullField)return hullField;
 model.parent.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(model.parent.matrixWorld).invert();
 return hullField=bakeHullField(meshesOf(model,inverse,isDoor));
}
export function createNX07(){
 const group=new THREE.Group();group.name='NX07 · exploration cargo lander';
 const {box,rod,poseRod}=geometryKit(group),interlock=createLandingInterlock();
 const solids={field:null,rods:[],boxes:[]};
 // Opening centres and sizes follow export_assets.py PORTS; deck = stowed platform top inside the hull,
 // above the thickest closed door under that platform (manifest skin_max_under_platform + 0.43 m).
 // no: number painted beside each opening and on its deck. 1 is the ARES bay; 2–5 are crew lifts
 // (right/left as seen facing the bow; ship-local +x is the left side).
 const ports=NX07_PORTS.map((p,i)=>({...p,no:i+1,where:['ARES 主货舱','右舷中部','左舷中部','右舷前部','左舷前部'][i]}));
 const PZ=NX07.port.z,leaves=[];
 const hullReady=attachAsset(group,'nx07',model=>{solids.field=bakeHull(model);bindDoors(model);paintHullNumbers();});hullReady.catch(()=>{});
 const truck=createAres(),payload=truck.group;payload.name='ARES secured cargo';group.add(payload);
 const rover=new Rover({heightAt:()=>0,normalAt:(x,z,d,out)=>out.set(0,1,0)},new THREE.Group());rover.placeAt(0,0);rover.panelDeploy=rover.panelTarget=0;rover.updateVisuals(0,{});rover.root.position.set(0,3.20-.95*(1-ROVER_SCALE),-2.45);rover.root.name='MU-7 transport cargo';payload.add(rover.root);
 // lift: main ARES elevator, driven with the interlock door. crew[i] (i ≥ 1): each crew port on its own —
 // want = commanded open; door, lift = 0..1 travel. Lifts only move while their own doors are fully open.
 let terrain=()=>0,obstacles=()=>false,grounding=null,delivered=false,doorWanted=false,lift=0,transfer=null;
 const crew=ports.map(()=>({want:false,door:0,lift:0}));
 const platforms=[],portPayloads=new Map();
 ports.forEach((p,i)=>{
  // Platform is its own element: it stows on a flat plane inside the bay and extends down to the ground.
  const platform=new THREE.Group();platform.name=i===0?'ARES cargo elevator':`crew elevator ${p.no}`;platform.position.set(p.x,p.deck,p.z);group.add(platform);
  const w=i===0?7.4*K:p.w-.4,d=i===0?12.2*K:p.d-.4;
  box('load-bearing lift deck',[w,.18,d],[0,-.09,0],'dark',platform);
  for(const s of [-1,1]){box('lift edge',[.1,.08,d],[s*(w/2-.1),.03,0],'orange',platform);box('lift end',[w,.08,.10],[0,.03,s*(d/2-.1)],'orange',platform);}
  const cables=[];for(const s of [-1,1])for(const t of [-1,1]){const m=rod('telescopic elevator guide',i===0?.075*K:.04*K,'metal');cables.push({m,x:p.x+s*(w/2-.2),z:p.z+t*(d/2-.2)});}
  platforms.push({group:platform,p,w,d,deck:p.deck,cables});
  // Deck number reads upright to someone arriving from the stern; the ARES deck carries it at its stern end.
  const size=i===0?4.2:Math.min(w,d)*.55,number=new THREE.Mesh(new THREE.PlaneGeometry(size,size),numberMaterial(p.no));
  number.name=`deck number ${p.no}`;number.rotation.set(-Math.PI/2,0,Math.PI);number.position.set(0,.012,i===0?-d/2+size/2+.5:0);platform.add(number);
 });
 // Hull numbers face the ground just astern of each opening, upright to someone facing the bow and looking up.
 // skin: hull underside beside the opening (ship-local y), used for the crew lift's headroom.
 function paintHullNumbers(){
  const f=solids.field,lowAt=(x,z)=>{const i=Math.floor((x-f.x0)/f.cell),k=Math.floor((z-f.z0)/f.cell);return i>=0&&i<f.nx&&k>=0&&k<f.nz?f.low[i+k*f.nx]:Infinity;};
  for(const p of ports){
   const size=p.no===1?5:2.6,z=p.z-p.d/2-size/2-.8;let y=Infinity;
   for(const dx of [-size/2,0,size/2])for(const dz of [-size/2,0,size/2])y=Math.min(y,lowAt(p.x+dx,z+dz));
   let skin=Infinity;for(const [sx,sz] of [[-1,0],[1,0],[0,-1],[0,1]])skin=Math.min(skin,lowAt(p.x+sx*(p.w/2+.6),p.z+sz*(p.d/2+.6)));
   p.skin=Number.isFinite(skin)?skin:p.deck-.45;
   if(!Number.isFinite(y))continue;
   const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),numberMaterial(p.no));m.name=`hull port number ${p.no}`;m.rotation.set(Math.PI/2,0,Math.PI);m.position.set(p.x,y-.04,z);group.add(m);
  }
 }
 // Door leaves: node origin sits on the front hinge point; the free inner edge swings down and out.
 function bindDoors(model){
  model.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(model.matrixWorld).invert();
  model.traverse(node=>{
   const m=DOOR_NODE.exec(node.name);if(!m||leaves.some(l=>l.node===node))return;
   const p=ports[+m[1]],u=node.userData,a=v(...u.hinge_a),b=v(...u.hinge_b),axis=b.clone().sub(a).normalize();
   const inward=v(p.x,a.y,(a.z+b.z)/2).sub(a),sign=inward.clone().applyAxisAngle(axis,.1).y<inward.y?1:-1;
   // Collision: rods along the hinge direction through the closed skin, a few across the leaf width.
   const field=bakeHullField(meshesOf(node,inverse),{cell:.25,x0:p.x-p.w/2-1,x1:p.x+p.w/2+1,z0:p.z-p.d/2-1,z1:p.z+p.d/2+1});
   const lowAt=(x,z)=>field.low[Math.floor((x-field.x0)/field.cell)+Math.floor((z-field.z0)/field.cell)*field.nx];
   const across=Math.max(3,Math.round(p.w/2/1.2)),r=p.w/2/across/2+.05,lines=[];
   for(let j=0;j<across;j++){
    const x=a.x-u.side*(j+.5)*p.w/2/across,line=[];
    for(const f of [.03,.5,.97]){const z=b.z+(a.z-b.z)*f,y=lowAt(x,z);if(Number.isFinite(y))line.push(v(x,y,z));}
    if(line.length>1)lines.push(line);
   }
   leaves.push({node,port:+m[1],side:u.side,a,axis,sign,r,lines});
  });
 }
 // Loading-pad highlight: pulsing deck outline plus lane lights along the stern approach.
 // Unfogged and not tone-mapped so the guide stays cyan through dust haze and night.
 const glow=new THREE.MeshBasicMaterial({color:0x46e6ff,transparent:true,opacity:.9,depthWrite:false,fog:false,toneMapped:false}),glowFill=new THREE.MeshBasicMaterial({color:0x46e6ff,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false});
 const padGlow=new THREE.Group();padGlow.name='ARES loading pad highlight';padGlow.visible=false;platforms[0].group.add(padGlow);
 {const W=platforms[0].w-.5,D=platforms[0].d-.5,add=(sx,sz,x,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,.05,sz),glow);m.position.set(x,.11,z);padGlow.add(m);};
  add(W,.16,0,D/2);add(W,.16,0,-D/2);add(.16,D,W/2,0);add(.16,D,-W/2,0);
  // Inner outline is the automatic capture region, independent of vehicle heading.
  const cw=LOAD_PAD.tolX*2,cd=LOAD_PAD.tolFront+LOAD_PAD.tolBack;
  add(cw,.13,0,cd/2);add(cw,.13,0,-cd/2);add(.13,cd,cw/2,0);add(.13,cd,-cw/2,0);
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(W,D),glowFill);fill.rotation.x=-Math.PI/2;fill.position.y=.1;padGlow.add(fill);
  for(const z of [-4.2,-2.6,-1])for(const sx of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(1.5,.05,.22),glow);m.position.set(sx*.5,.12,z);m.rotation.y=sx*.7;padGlow.add(m);}}
 const laneLights=[];const lane=new THREE.Group();lane.name='ARES loading approach lights';lane.visible=false;group.add(lane);
 for(let z=NX07.exitZ+3;z<=PZ-NX07.port.length/2-1.5;z+=3)for(const sx of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.12,.9),glow);m.position.set(sx*4,0,z);lane.add(m);laneLights.push(m);}
 let padWasReady=false,glowClock=0;
 const legParts=FEET.map((f,i)=>{
  // Underside heights sampled from the exported hull at each anchor (metres).
  const skinY=(i<2?-2.19:-4.515)*K;
  const mount=v(f.ax,skinY-.06*K,f.az),assembly=new THREE.Group();assembly.name='splayed retractable landing gear '+i;group.add(assembly);
  const sleeve=rod('landing main sleeve',.48*K,'dark',assembly),piston=rod('landing chrome piston',.27*K,'metal',assembly),brace=rod('triangulated side brace',.25*K,'white',assembly);
  const anchor=rod('landing brace root beam',.25*K,'dark',assembly);poseRod(anchor,mount,mount.clone().add(v(0,.2*K,2.5*K)));
  const foot=box('swivelling ground pad',[2.7*K,.26,2.8*K],[f.x,-10.2*K,f.z],'metal',assembly);
  box('reinforced hull mount',[1.8*K,.42*K,3.0*K],[f.ax,skinY+.04*K,f.az],'dark');
  const cover=box('flush landing gear cover',[2.2*K,.18*K,3.4*K],[f.ax,skinY-.14*K,f.az],'white');
  return {...f,skinY,mount,assembly,sleeve,piston,brace,foot,cover};
 });
 const world=(x,z)=>worldXZ({x:group.position.x,z:group.position.z,heading:group.rotation.y},x,z);
 // Parking snap and flight poses start with every crew port shut, as the interlock does for the main bay.
 function sealCrewPorts(){for(const c of crew){c.want=false;c.door=c.lift=0;}}
 function fitGround(heightAt,blocked=()=>false,{snap=false}={}){
  terrain=heightAt;obstacles=blocked;grounding=solveSupport({x:group.position.x,z:group.position.z,heading:group.rotation.y},heightAt,blocked);
  group.position.y=grounding.height;grounding.tip=world(0,NX07.exitZ);grounding.tipY=terrain(grounding.tip.x,grounding.tip.z);grounding.slope=0;
  if(snap){interlock.snapPark(grounding.valid);sealCrewPorts();}else interlock.ground(true,grounding.valid);
  return grounding;
 }
 // A crew deck lowers onto the highest ground under it, so it needs a support lock and ground it can reach.
 function checkPort(i){
  const a=platforms[i];if(!a||i===0)return {ok:false,reason:'没有这个舱口'};
  if(group.userData.assetState!=='ready')return {ok:false,reason:'飞船模型加载中，请稍候'};
  if(!interlock.stable)return {ok:false,reason:grounding?.valid?interlock.label:grounding?.reason||'起落架尚未完成触地找平'};
  return checkCrewLiftTerrain({x:group.position.x,z:group.position.z,heading:group.rotation.y},i,terrain);
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
  // Main bay close order: the lift homes inside the hull, then the hinged doors swing shut. Takeoff waits for every port.
  if(!doorWanted&&!transfer){lift=Math.max(0,lift-dt/4);if(lift===0)interlock.open(false);}
  // Main bay open order: doors swing clear first; with ARES outside, the lift then becomes a drive-on pad.
  if(doorWanted&&interlock.ready&&delivered&&!transfer)lift=Math.min(1,lift+dt/4);
  interlock.update(dt);
  if(interlock.door<.999&&!transfer)lift=0;
  // Crew ports keep the same order each on its own. Losing the support lock shuts them all.
  for(let i=1;i<crew.length;i++){const c=crew[i];if(!interlock.stable)c.want=false;
   if(c.want){c.door=Math.min(1,c.door+dt/CREW_DOOR_S);if(c.door===1)c.lift=Math.min(1,c.lift+dt/CREW_LIFT_S);}
   else{c.lift=Math.max(0,c.lift-dt/CREW_LIFT_S);if(c.lift===0)c.door=Math.max(0,c.door-dt/CREW_DOOR_S);}
  }
  if(transfer){transfer.time+=dt;const pad=transfer.pad,t=pad?Math.min(1,.64+Math.max(0,transfer.time-4)/14):Math.min(1,transfer.time/14),u=transfer.loading?1-t:t;lift=Math.min(1,u/.36);const drive=ease(Math.max(0,(u-.36)/.64));poseTruck(PZ+(NX07.exitZ-PZ)*drive,drive===0);for(let i=0;i<6;i++)truck.parts['wheel.'+i].rotation.x=drive*(PZ-NX07.exitZ)/ARES.radius;
   if(pad){const k=1-ease(Math.min(1,transfer.time/2));payload.position.x+=pad.x*k;payload.position.z+=(pad.z-PZ)*k;payload.rotation.y=pad.yaw*(1-ease(clamp01((transfer.time-2)/2)));}
   if(t===1){const done=transfer.resolve,loading=transfer.loading;transfer=null;interlock.lockCargo(false);delivered=!loading;payload.visible=loading;done();}
  }
  for(let i=0;i<platforms.length;i++){const a=platforms[i],p=a.p,t=i===0?lift:ease(crew[i].lift);a.group.position.y=THREE.MathUtils.lerp(a.deck,deckGround(p),t);
   for(const c of a.cables){poseRod(c.m,v(c.x,a.deck+1,c.z),v(c.x,a.group.position.y+.12,c.z));c.m.visible=a.group.position.y<a.deck-.01;}
  }
  if(!transfer&&!delivered)poseTruck(PZ,true);
  for(const l of leaves)l.node.quaternion.setFromAxisAngle(l.axis,l.sign*DOOR_OPEN*ease(l.port===0?interlock.door:crew[l.port].door));
  for(let i=0;i<legParts.length;i++){const leg=legParts[i],g=interlock.gear,fit=grounding?.feet[i],end=v(leg.x,(fit?.y??group.position.y-NX07.rest)-group.position.y+.26,leg.z),stowed=v(leg.ax-Math.sign(leg.ax)*3*K,-.5*K,leg.az+3*K);end.lerpVectors(stowed,end,ease(g));
   leg.assembly.visible=g>.001;leg.cover.rotation.z=Math.sign(leg.ax)*g*1.35;const knee=leg.mount.clone().lerp(end,.55);poseRod(leg.sleeve,leg.mount,knee);poseRod(leg.piston,knee,end);poseRod(leg.brace,leg.mount.clone().add(v(0,.2*K,2.5*K)),end.clone().lerp(leg.mount,.12));leg.foot.position.copy(end).y-=.13;
   if(fit){const n=v(-fit.dx,1,-fit.dz).normalize();const inverseYaw=new THREE.Quaternion().setFromAxisAngle(v(0,1,0),-group.rotation.y);n.applyQuaternion(inverseYaw);leg.foot.quaternion.setFromUnitVectors(v(0,1,0),n);}
  }
  const ready=padReady();padGlow.visible=lane.visible=ready;
  if(ready){glowClock+=dt;glow.opacity=.55+.4*Math.sin(glowClock*4);glowFill.opacity=.24+.1*Math.sin(glowClock*4);
   if(!padWasReady)for(const m of laneLights){const q=world(m.position.x,m.position.z);m.position.y=terrain(q.x,q.z)-group.position.y+.08;}}
  padWasReady=ready;
  for(const [i,cargo] of portPayloads){cargo.asset.group.position.y=platforms[i].group.position.y+.04;}
  rebuildSolids();
 }
 function padReady(){return delivered&&doorWanted&&!transfer&&interlock.ready&&lift>=.999&&group.userData.assetState==='ready';}
 // Live collision solids in ship-local metres, mirroring the poses just drawn.
 function rebuildSolids(){
  const rods=solids.rods,boxes=solids.boxes,g=interlock.gear;rods.length=boxes.length=0;
  const seg=(a,b,r)=>rods.push({a:{x:a.x,y:a.y,z:a.z},b:{x:b.x,y:b.y,z:b.z},r});
  for(const leg of legParts){
   // Hinged cover swings below the skin as the gear deploys.
   boxes.push({x:leg.ax,z:leg.az,hw:1.1*K,hd:1.7*K,bottom:leg.skinY-.24*K-Math.sin(g*1.35)*1.1*K,top:leg.skinY+.3*K});
   if(!leg.assembly.visible)continue;
   const ends=m=>{const h=v(0,m.scale.y/2,0).applyQuaternion(m.quaternion);return [m.position.clone().sub(h),m.position.clone().add(h)];};
   for(const [m,r] of [[leg.sleeve,.48*K],[leg.piston,.27*K],[leg.brace,.25*K]]){const [a,b]=ends(m);seg(a,b,r);}
   seg(leg.mount,leg.mount.clone().add(v(0,.2*K,2.5*K)),.25*K);
   boxes.push({x:leg.foot.position.x,z:leg.foot.position.z,hw:1.35*K,hd:1.4*K,bottom:-Infinity,top:leg.foot.position.y+.4});
  }
  // Door leaves: the closed skin lines rotated about their hinge with the drawn leaf.
  for(const l of leaves){const q=l.node.quaternion;for(const line of l.lines){let prev=null;for(const p of line){const at=p.clone().sub(l.a).applyQuaternion(q).add(l.a);if(prev)seg(prev,at,l.r);prev=at;}}}
  for(const [i,a] of platforms.entries()){
   // A deck resting on the ground is floor (ARES drives on, crew walk on): only its guide posts stand.
   if(i===0?lift>=.999:crew[i].lift>=.999){for(const c of a.cables)if(c.m.visible)seg(v(c.x,a.deck+1,c.z),v(c.x,a.group.position.y+.12,c.z),(i===0?.075:.04)*K);continue;}
   boxes.push({x:a.p.x,z:a.p.z,hw:a.w/2,hd:a.d/2,bottom:a.group.position.y-.18,top:a.deck+1});
  }
  for(const [i,cargo] of portPayloads){const o=cargo.asset.group;if(!o.visible)continue;const b=cargo.bounds,c=Math.cos(o.rotation.y),s=Math.sin(o.rotation.y),oz=(b.minZ+b.maxZ)/2;boxes.push({x:o.position.x+s*oz,z:o.position.z+c*oz,hw:Math.abs(c)*b.width/2+Math.abs(s)*b.length/2,hd:Math.abs(s)*b.width/2+Math.abs(c)*b.length/2,bottom:o.position.y,top:o.position.y+b.height});}
  if(transfer&&payload.visible){
   const c=Math.cos(payload.rotation.y),s=Math.sin(payload.rotation.y),oz=(ARES.minZ+ARES.maxZ)/2;
   boxes.push({x:payload.position.x+s*oz,z:payload.position.z+c*oz,hw:Math.abs(c)*ARES.width/2+Math.abs(s)*ARES.length/2,hd:Math.abs(s)*ARES.width/2+Math.abs(c)*ARES.length/2,bottom:payload.position.y,top:payload.position.y+(rover.root.visible?5.9:ARES.height)});
  }
 }
 const local=(x,z)=>{const dx=x-group.position.x,dz=z-group.position.z,c=Math.cos(group.rotation.y),s=Math.sin(group.rotation.y);return {x:dx*c-dz*s,z:dx*s+dz*c};};
 const ready=Promise.all([hullReady,truck.ready]);ready.catch(()=>{});
 const mainDeck=platforms[0];
 const openPorts=()=>ports.filter((p,i)=>i===0?doorWanted||interlock.door>0:crew[i].want||crew[i].door>0).map(p=>p.no);
 return {group,payload,roverPayload:rover.root,legParts,platforms,ports,interlock,ready,fitGround,landingHeight,checkRamp,update,
  get doors(){return leaves;},get doorAngle(){return DOOR_OPEN*ease(interlock.door);},
  // Stowed ARES volume: the main deck footprint up to just below the lowest structure over the bay.
  cargoBounds:new THREE.Box3(v(-mainDeck.w/2,NX07.deck,PZ-mainDeck.d/2),v(mainDeck.w/2,ports[0].ceiling-.15,PZ+mainDeck.d/2)),
  get grounding(){return grounding;},get supportReady(){return interlock.stable;},get gearProgress(){return interlock.gear;},
  get status(){const s=interlock.label,open=openPorts();return interlock.stable&&open.length?`起落架锁定 · ${open.join('、')} 号舱口开启`:s;},
  // setDoor: port 1, the ARES bay. Crew ports 2–5 answer setPort(index) alone.
  setDoor(open){if(open){if(!checkRamp().ok||!interlock.open(true))return false;doorWanted=true;}else{if(transfer)return false;doorWanted=false;}return true;},
  setPort(i,open){if(i===0)return this.setDoor(open);const c=crew[i];if(!c)return false;if(open&&!checkPort(i).ok)return false;c.want=!!open;return true;},
  registerPortPayload(i,asset,bounds){if(i<=0||!platforms[i]||portPayloads.has(i))throw Error('无效或已占用的车辆舱口');group.add(asset.group);asset.group.position.set(ports[i].x,platforms[i].group.position.y+.04,ports[i].z-(bounds.minZ+bounds.maxZ)/2);portPayloads.set(i,{asset,bounds});return asset;},
  allowVehiclePort(i){if(!platforms[i]||i===0)throw Error('无效车辆舱口');platforms[i].vehicle=true;},
  checkPort,get openPorts(){return openPorts();},
  // Port index i (0 = ARES bay). deckY/skinY: world heights of the deck top and the hull skin beside the opening.
  portState(i){const p=ports[i],a=platforms[i];if(i===0)return {no:1,open:doorWanted,closed:interlock.closed&&lift===0&&!doorWanted,ready:interlock.ready,door:interlock.door,lift};
   const c=crew[i];return {no:p.no,open:c.want,closed:!c.want&&c.door===0,ready:c.want&&c.lift>=1,door:c.door,lift:c.lift,deckY:group.position.y+a.group.position.y,skinY:group.position.y+(p.skin??p.deck-.45)};},
  get doorOpen(){return doorWanted;},get doorReady(){return interlock.ready;},get unloading(){return !!transfer;},
  get doorClosed(){return interlock.closed&&lift===0&&!doorWanted&&crew.every((c,i)=>i===0||!c.want&&c.door===0);},
  // Crew port whose deck holds this world point (inset > 0 keeps a margin inside the deck edge), or -1.
  portAt(x,z,inset=0){const p=local(x,z);for(let i=1;i<platforms.length;i++){const a=platforms[i];if(Math.abs(p.x-a.p.x)<a.w/2-inset&&Math.abs(p.z-a.p.z)<a.d/2-inset)return i;}return -1;},
  underPort(i,x,z,pad=0){const p=local(x,z),a=platforms[i];return !!a&&Math.abs(p.x-a.p.x)<a.w/2+pad&&Math.abs(p.z-a.p.z)<a.d/2+pad;},
  // Walkable top (world metres) of a crew deck that has left the hull, else null. A lowered deck stands
  // 0.13 m proud of the highest ground under it; a skirt around it ramps that step for boots.
  deckAt(x,z){const p=local(x,z);
   for(let i=1;i<platforms.length;i++){const c=crew[i];if(c.lift<=0)continue;const a=platforms[i],out=Math.max(Math.abs(p.x-a.p.x)-a.w/2,Math.abs(p.z-a.p.z)-a.d/2),top=group.position.y+a.group.position.y;
    if(out<=0)return top;
    if(out<CREW_RAMP&&c.lift>=1){const g=terrain(x,z);if(top>g&&top-g<.5)return top+(g-top)*out/CREW_RAMP;}}
   return null;},
  deckCentre(i){const a=platforms[i];return {...world(a.p.x,a.p.z),heading:group.rotation.y};},
  unload:()=>moveCargo(false),load:()=>moveCargo(true),loadFromPad(x,z,heading){const o=this.dockOffset(x,z,heading);return moveCargo(true,{x:o.x,z:o.z+PZ,yaw:o.yaw});},exitPoint(){return {...world(0,NX07.exitZ),heading:group.rotation.y};},
  setDelivered(v){delivered=!!v;payload.visible=!v;},setRoverCargoVisible(v){rover.root.visible=!!v;},
  requestTakeoff(){if(!this.doorClosed)return false;return interlock.takeoff();},prepareLanding(heightAt,blocked){terrain=heightAt;obstacles=blocked;grounding=solveSupport({x:group.position.x,z:group.position.z,heading:group.rotation.y},heightAt,blocked);},setAirborne(){interlock.ground(false,false);},deployGear(){interlock.deploy();},setFlightPose(t=0){if(interlock.flightPose(t))sealCrewPorts();},
  // height: the object's own height above its ground. Infinity = plan-view silhouette
  // (nothing may park under the ship). Before the GLB loads, keep the old hull envelope.
  contains(x,z,pad=0,height=Infinity){const p=local(x,z);if(Math.abs(p.x)>38*K+pad||p.z<-58*K-pad||p.z>46*K+pad)return false;
   if(!solids.field)return Math.abs(p.x)<37*K+pad&&p.z>-42*K-pad&&p.z<45*K+pad;
   const bottom=terrain(x,z)-group.position.y;if(!Number.isFinite(bottom)||!Number.isFinite(height))return columnHitsShip(solids,p.x,p.z,pad);
   return columnHitsShip(solids,p.x,p.z,pad,bottom,bottom+height);},
  get solids(){return solids;},
  // Vehicle footprint (world centre of its origin, yaw, half sizes, local z offset of the box centre).
  rectHits(x,z,yaw,{hw,hl,oz=0},groundMin,groundMax,height){const cx=x+oz*Math.sin(yaw),cz=z+oz*Math.cos(yaw),p=local(cx,cz);
   if(Math.abs(p.x)>40*K+hl+hw||p.z<-60*K-hl-hw||p.z>48*K+hl+hw)return false;
   const rect={x:p.x,z:p.z,yaw:yaw-group.rotation.y,hw,hl};
   // A lowered crew deck is a floor for people only; vehicles keep off it.
   for(let i=1;i<platforms.length;i++){const a=platforms[i];if(!a.vehicle&&crew[i].lift>=1&&rectOverlapsBox(rect,{x:a.p.x,z:a.p.z,hw:a.w/2,hd:a.d/2}))return true;}
   if(!solids.field)return rectOverlapsBox(rect,{x:0,z:1.5*K,hw:37*K,hd:43.5*K});
   return rectHitsShip(solids,rect,groundMin-group.position.y,groundMax-group.position.y+height);},
  // Does a vehicle footprint overlap the ARES lift column (where the lift travels)?
  overBay(x,z,yaw,{hw,hl,oz=0},margin=.3){const p=local(x+oz*Math.sin(yaw),z+oz*Math.cos(yaw)),m=ports[0];return rectOverlapsBox({x:p.x,z:p.z,yaw:yaw-group.rotation.y,hw,hl},{x:m.x,z:m.z,hw:m.w/2,hd:m.d/2},margin);},
  get padReady(){return padReady();},
  // ARES origin pose in ship-local metres relative to the lift clamp point.
  dockOffset(x,z,heading){const p=local(x,z);return {x:p.x,z:p.z-PZ,yaw:Math.atan2(Math.sin(heading-group.rotation.y),Math.cos(heading-group.rotation.y))};},
  padPoint(){return {...world(0,PZ),heading:group.rotation.y};},
  solidAt(x,y,z){const p=local(x,z);if(Math.abs(p.x)>40*K||p.z<-60*K||p.z>48*K)return false;return pointInShip(solids,p.x,y-group.position.y,p.z);},
  dispose(){group.removeFromParent();} // Shared cached GLB buffers live for the scene lifetime.
 };
}
