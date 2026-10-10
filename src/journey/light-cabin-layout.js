import * as T from 'three';
import {loadAstronautModel} from './astronaut-model.js';
// Isolated spatial study. Does not change gameplay capacity or the existing vehicle envelope.
export const LAYOUT={hipY:2.47,halfSpacing:.55,hipZ:2.25,recline:.314,pan:[.60,.13,.60],back:[.60,.76,.09],sourceSuitHeight:1.9};
export async function createCabinStudy(){
 const group=new T.Group();group.name='L04 two-seat spatial study';
 const material=new T.MeshStandardMaterial({color:0xc8d0d4,roughness:.8});
 const seatBoxes=[],crew=[];
 for(const [i,sign] of [-1,1].entries()){
  const rig=await loadAstronautModel(),root=new T.Group();root.name=i===0?'driver EVA':'task operator EVA';root.add(rig.model);group.add(root);
  const seat=new T.Group();seat.name=i===0?'driver trial seat':'operator trial seat';group.add(seat);
  const add=(name,size,pos)=>{const m=new T.Mesh(new T.BoxGeometry(...size),material);m.name=name;m.position.fromArray(pos);seat.add(m);seatBoxes.push(m);return m;};
  add('seat pan',LAYOUT.pan,[0,-.192,-.05]);
  // Open-backed support frame leaves the EVA backpack recess clear. It is a fit study, not a restraint certification.
  for(const x of [-.32,.32])add('back frame rail '+x,[.07,.92,.07],[x,.23,-.69]);
  add('back frame lower crossbar',[.71,.07,.07],[0,-.23,-.69]);
  add('back frame upper crossbar',[.71,.07,.07],[0,.70,-.69]);
  add('helmet rear pad',[.42,.18,.07],[0,.87,-.69]);
  for(const x of [-.32,.32])add('base rear link '+x,[.07,.07,.62],[x,-.27,-.39]);
  for(const x of [-.33,.33])add('hip guide '+x,[.055,.18,.36],[x,-.05,-.04]);
  add('floor pedestal',[.36,.13,.34],[0,-.31,-.08]);
  // Preserve original 1.90 m suit scale and the exact seated hinge conventions used by astronaut.js.
  rig.model.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of [].concat(o.material)){if(!m.transparent){m.color.set(i===0?0xdbe4e8:0xc7dfd8);m.roughness=.8;m.metalness=0;}}}});
  const console=new T.Group();console.name=i===0?'driver layout console':'operator layout console';group.add(console);
  const fitting=(name,size,pos,mat=material)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.name=name;m.position.fromArray(pos);console.add(m);return m;};
  const screenMaterial=new T.MeshStandardMaterial({color:i===0?0x507885:0x4a8978,roughness:.7});
  fitting('display housing',[.50,.29,.06],[0,.49,.86]).rotation.x=-.18;
  fitting('display surface',[.44,.22,.014],[0,.49,.824],screenMaterial).rotation.x=-.18;
  for(const x of [-.23,.23])fitting('display column '+x,[.055,.54,.055],[x,.11,1.05]);
  for(const x of [-.23,.23])fitting('display elbow bracket '+x,[.055,.06,.22],[x,.39,.99]);
  // Side controls leave the knees and the centre gap clear; no pretend live telemetry.
  fitting('side control tray',[.17,.06,.32],[sign*.44,.03,.30]);
  fitting('side grip',[.07,.13,.09],[sign*.44,.12,.29]);
  fitting('side tray floor support',[.05,.39,.05],[sign*.44,-.19,.26]);
  crew.push({sign,rig,root,seat,console});
 }
 function setLayout({halfSpacing=LAYOUT.halfSpacing,hipZ=LAYOUT.hipZ,hipY=LAYOUT.hipY}={}){
  for(const c of crew){const socket=new T.Object3D();socket.position.set(c.sign*halfSpacing,hipY,hipZ);socket.rotation.x=-LAYOUT.recline;
   c.root.quaternion.copy(socket.quaternion);c.root.position.copy(new T.Vector3(0,.86,0)).applyQuaternion(socket.quaternion).negate().add(socket.position);
   c.rig.pose({thigh_L:-1.5+LAYOUT.recline,thigh_R:-1.5+LAYOUT.recline,shin_L:.12,shin_R:.12,upperarm_L:-.75+LAYOUT.recline,upperarm_R:-.75+LAYOUT.recline,forearm_L:.1,forearm_R:.1});
   c.seat.position.copy(socket.position);c.console.position.copy(socket.position);c.hip=socket.position.clone();
  }group.updateMatrixWorld(true);
 }
 setLayout();return {group,crew,seatBoxes,setLayout};
}
// Read the actual deformed vertices; raw geometry boundingBox is the standing bind pose.
export function skinBounds(root,filter=()=>true){
 root.updateMatrixWorld(true);const box=new T.Box3(),v=new T.Vector3();root.traverse(o=>{if(!o.isMesh||!filter(o))return;if(o.isSkinnedMesh)o.skeleton.update();const a=o.geometry.attributes.position;
  for(let i=0;i<a.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);box.expandByPoint(v);}
 });return box;
}
