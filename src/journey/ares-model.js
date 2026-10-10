import * as THREE from 'three';
import {attachAsset,geometryKit} from './assets/blender-assets.js';
// suspension: six double-wishbone corners in ARES-local metres (+z = nose, so +x is the driver's left). DISCUSSION_LOG D31, D43.
// Must match blender/game-assets/ares_suspension.py (the export writes the same numbers to manifest.json).
// driver: hip joint (H-point) of the 1.9 m EVA suit, backrest recline (18°), and the cockpit eye (the suit's own eyes, D45) as an offset from the hip in the
// reclined seat frame. The cab roof slopes down 0.38 m per metre toward the nose; the helmet only clears it this far back. D46.
export const ARES_SPEC={roverCargo:{min:[-1.35,2.80,-4.63],max:[1.35,6.05,-.18]},cargo:{min:[-1.35,2.80,-4.63],max:[1.35,6.05,-.18]},
 driver:{hip:[-.43,2.37,2.65],recline:.314,eye:[0,.86,.12]},
 suspension:{wheelX:2.45,wheelY:1.045,pivotX:.63,uprightX:1.57,upperY:1.62,lowerY:.87,bump:.45,droop:.5,shockTop:[.98,1.86],shockLow:[1.15,.8],damper:.72,rod:.76,perchTop:.1,perchLow:.38,axles:[3.45,-.48,-2.66]}};
const UP=new THREE.Vector3(0,1,0);
export const ARES_LIGHT_SPEC={...ARES_SPEC,suspension:{...ARES_SPEC.suspension,wheelX:2.18,axles:[3.45,-2.35]}};
export const createAresLight=()=>createAres({spec:ARES_LIGHT_SPEC,assetName:"ares-light",starterPack:false});
export function createAres({spec=ARES_SPEC,assetName="ares",starterPack=true}={}){
 const S=spec.suspension,ARM=S.uprightX-S.pivotX,N=S.axles.length*2;
 const group=new THREE.Group();group.name=assetName==='ares'?'ARES 06 · Blender six-wheel logistics rover':'ARES L04 · enclosed four-wheel rover';const parts={root:group},sockets={};
 // Pivot nodes remain stable while the asset loads; physics and trails use these exact axles.
 // corner.i translates with suspension travel; wheel.i inside it only spins.
 const corners=[],travel=new Float32Array(N);
 const pivot=(name,x,y,z,parent=group)=>{const p=new THREE.Group();p.name=name;p.position.set(x,y,z);parent.add(p);parts[name]=p;return p;};
 for(let side=0;side<2;side++)for(let axle=0;axle<S.axles.length;axle++){
  const i=side*S.axles.length+axle,sg=side===0?1:-1,z=S.axles[axle];
  const corner=pivot('corner.'+i,sg*S.wheelX,S.wheelY,z),wheel=pivot('wheel.'+i,0,0,0,corner);
  const upper=pivot('arm.upper.'+i,sg*S.pivotX,S.upperY,z),lower=pivot('arm.lower.'+i,sg*S.pivotX,S.lowerY,z);
  const top=new THREE.Vector3(sg*S.shockTop[0],S.shockTop[1],z),low=new THREE.Vector3(sg*S.shockLow[0],S.shockLow[1],z),axis0=top.clone().sub(low).normalize();
  const damper=pivot('damper.'+i,low.x,low.y,low.z),rod=pivot('rod.'+i,top.x,top.y,top.z);
  // The coil stretches along its own axis: align that axis with local +Y, scale Y, rotate back.
  const align=new THREE.Quaternion().setFromUnitVectors(UP,axis0),spring=pivot('spring.'+i,...top.clone().addScaledVector(axis0,-S.perchTop).toArray()),stretch=new THREE.Group(),coil=new THREE.Group();
  spring.quaternion.copy(align);coil.quaternion.copy(align).invert();spring.add(stretch);stretch.add(coil);
  corners.push({sg,z,corner,wheel,upper,lower,damper,rod,spring,stretch,coil,top,align,
   low:[sg*(S.shockLow[0]-S.pivotX),S.shockLow[1]-S.lowerY],axis0,coilRest:top.distanceTo(low)-S.perchTop-S.perchLow});
 }
 const lowNow=new THREE.Vector3(),axis=new THREE.Vector3(),turn=new THREE.Quaternion();
 /** Vertical wheel travel per corner (m, + = up into bump), clamped to the mechanical stops. */
 function setSuspension(values){
  for(let i=0;i<N;i++){
   const c=corners[i],d=THREE.MathUtils.clamp(values[i]||0,-S.droop,S.bump),th=Math.asin(d/ARM),a=c.sg*th,cos=Math.cos(a),sin=Math.sin(a);travel[i]=d;
   // Equal parallel arms: the upright stays vertical and rides an arc of radius ARM about the hinges.
   c.corner.position.set(c.sg*(S.pivotX+ARM*Math.cos(th)+S.wheelX-S.uprightX),S.wheelY+d,c.z);
   c.upper.rotation.z=c.lower.rotation.z=a;
   lowNow.set(c.sg*S.pivotX+c.low[0]*cos-c.low[1]*sin,S.lowerY+c.low[0]*sin+c.low[1]*cos,c.z);
   axis.copy(c.top).sub(lowNow);const length=axis.length();axis.divideScalar(length);turn.setFromUnitVectors(c.axis0,axis);
   c.damper.position.copy(lowNow);c.damper.quaternion.copy(turn);c.rod.quaternion.copy(turn);
   c.spring.position.copy(c.top).addScaledVector(axis,-S.perchTop);c.spring.quaternion.copy(turn).multiply(c.align);
   c.stretch.scale.y=(length-S.perchTop-S.perchLow)/c.coilRest;
  }
 }
 const ready=attachAsset(group,assetName,model=>{
  const adopt=(name,target)=>{const node=model.getObjectByName(name);if(!node)return;target.add(node);node.position.set(0,0,0);};
  // Blender numbers wheels left/right per axle; corners here are right side first. Pair them by position.
  for(let j=0;j<N;j++){const node=model.getObjectByName('wheel_'+j);if(!node)continue;
   const c=corners.reduce((best,k)=>k.corner.position.distanceTo(node.position)<best.corner.position.distanceTo(node.position)?k:best);
   adopt('wheel_'+j,c.wheel);adopt(`susp_${j}_upright`,c.corner);adopt(`susp_${j}_upper`,c.upper);adopt(`susp_${j}_lower`,c.lower);adopt(`susp_${j}_damper`,c.damper);adopt(`susp_${j}_rod`,c.rod);adopt(`susp_${j}_spring`,c.coil);}
  setSuspension(travel);
 });ready.catch(()=>{});
 const {box}=geometryKit(group);parts.starterPack=new THREE.Group();parts.starterPack.name='starter supply lockers';group.add(parts.starterPack);
 if(starterPack)for(const x of [-.8,.8])box('secured survival case',[.65,.42,.45],[x,2.28,-.2],'orange',parts.starterPack);
 // The socket is the reclined hip frame; the pan and backrest under it are runtime boxes like the lockers (the Blender cab has no seat there).
 const D=spec.driver,seat=new THREE.Object3D();seat.name='driver seat';seat.position.fromArray(D.hip);seat.rotation.x=-D.recline;group.add(seat);sockets['mount.driver']=seat;
 parts.driverSeat=new THREE.Group();parts.driverSeat.name='driver seat frame';group.add(parts.driverSeat);
 box('driver seat pan',[.5,.13,.5],[D.hip[0],D.hip[1]-.18,D.hip[2]-.05],'dark',parts.driverSeat);
 box('driver seat back',[.5,.8,.07],new THREE.Vector3(0,.3,-.35).applyEuler(seat.rotation).add(seat.position).toArray(),'dark',parts.driverSeat).rotation.x=-D.recline;
 return {group,parts,sockets,ready,setSuspension,get travel(){return travel;}};
}
