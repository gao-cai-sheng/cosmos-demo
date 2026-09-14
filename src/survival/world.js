import * as THREE from 'three';
import { CARGO, REFUGE } from './state.js';

export function createArrivalWorld(scene,terrain){
  const root=new THREE.Group();root.name='Arrival refuge and supplies';scene.add(root);
  const obstacles=[],cargoObstacles=[],cargoRoots=new Map();let cargoGrounded=false,palletGrounded=false;
  const deck=Math.max(...[-3,3].flatMap(x=>[-5,4].map(z=>terrain(x,z))))+.15;
  const material=c=>new THREE.MeshStandardMaterial({color:c,roughness:.75});
  const white=material(0xc5c9bf),dark=material(0x273c42),orange=material(0xc87743),metal=material(0x748c8a),mint=material(0x83b9a9);
  function makeBox(parent,x,y,z,w,h,d,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(x,y,z,w,h,d,mat,solid=false){const m=makeBox(root,x,y,z,w,h,d,mat);if(solid)obstacles.push({x,z,w:w/2+.3,d:d/2+.3});return m;}
  function sign(text,x,y,z,w=1.8,parent=root){const c=document.createElement('canvas');c.width=768;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#10282d';ctx.fillRect(0,0,768,256);ctx.fillStyle='#bce5d9';ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,154);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));m.position.set(x,y,z);parent.add(m);return m;}

  box(0,deck-.15,-2,6,.3,6,dark);box(0,deck+3.35,-2,6.2,.2,6.2,white);
  box(-3,deck+1.6,-2,.2,3.3,6,white,true);box(3,deck+1.6,-2,.2,3.3,6,white,true);box(0,deck+1.6,-5,6,3.3,.2,white,true);
  for(const x of [-2,2])box(x,deck+1.6,1,2,3.3,.2,white,true);
  box(0,deck+3,1,2,.6,.2,white);box(0,deck-.1,2.5,2,.2,3,dark);
  for(const x of [-1,1])box(x,deck+1.35,2.5,.16,2.7,3,white,true);
  box(0,deck+2.75,2.5,2.2,.15,3,white);
  const inner=box(0,deck+1.3,1,1.85,2.6,.12,metal,true),outer=box(0,deck+1.3,4,1.85,2.6,.12,orange,true);
  box(-2.05,deck+.45,-3.2,1.2,.65,2.1,dark,true);box(-2.05,deck+.81,-3.2,1.15,.1,2,white);
  box(2.5,deck+1,-2,.6,2,1.4,dark,true);sign('RESERVE',2.17,deck+1.65,-2,.85).rotation.y=-Math.PI/2;
  box(0,deck+3.19,-2,3,.04,.15,new THREE.MeshBasicMaterial({color:0xd8f5e2}));
  const light=new THREE.PointLight(0xd8eee3,15,12,1.5);light.position.set(0,deck+2.7,-2);root.add(light);
  sign('REFUGE · 01',0,deck+3.15,4.1,3.6);sign('AIRLOCK',0,deck+2.5,.87,1.2).rotation.y=Math.PI;
  const end=terrain(0,8),angle=Math.atan2(deck-end,4);const ramp=box(0,(deck+end)/2-.08,6,2,.15,Math.hypot(4,deck-end),metal);ramp.rotation.x=angle;

  for(const c of CARGO){
    const g=new THREE.Group();g.name=`Cargo ${c.code} ${c.name}`;root.add(g);cargoRoots.set(c.id,{cargo:c,group:g,index:cargoRoots.size});
    makeBox(g,0,.14,0,2.5,.28,1.8,dark);makeBox(g,0,.8,0,2.2,1.15,1.5,white);makeBox(g,0,1.41,0,2.25,.07,1.55,c.id==='power'?metal:orange);
    sign(c.code,0,.85,.77,1.1,g);sign(c.code,0,.85,-.77,1.1,g).rotation.y=Math.PI;
    cargoObstacles.push({x:c.x,z:c.z,w:1.4,d:1.05});
  }

  const powerCargo=CARGO.find(c=>c.id==='power');
  const powerPallet=new THREE.Group();powerPallet.name='Released power equipment pallet';root.add(powerPallet);
  makeBox(powerPallet,0,.12,0,3.1,.24,1.7,dark);makeBox(powerPallet,-.72,.62,0,1.05,.8,1.15,metal);makeBox(powerPallet,.45,.43,-.35,1.1,.42,.62,mint);makeBox(powerPallet,.45,.43,.35,1.1,.42,.62,mint);
  for(const x of [-1.15,1.15]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.18,12),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.08,.72);powerPallet.add(wheel);const wheel2=wheel.clone();wheel2.position.z=-.72;powerPallet.add(wheel2);}

  const floor=(x,z)=>Math.abs(x)<=3.05&&z>=-5.1&&z<=1.05?deck:Math.abs(x)<=1.1&&z>1&&z<=4?deck:Math.abs(x)<=1.1&&z>4&&z<8?deck+(end-deck)*(z-4)/4:terrain(x,z);
  const blocked=(x,z)=>obstacles.some(o=>Math.abs(x-o.x)<o.w&&Math.abs(z-o.z)<o.d)||(cargoGrounded&&cargoObstacles.some(o=>Math.abs(x-o.x)<o.w&&Math.abs(z-o.z)<o.d))||(palletGrounded&&Math.abs(x-powerPallet.position.x)<1.8&&Math.abs(z-powerPallet.position.z)<1.15);
  function setCargoDrop(progress){
    const p=Math.max(0,Math.min(1,progress));
    for(const {cargo,group,index} of cargoRoots.values()){
      const q=Math.max(0,Math.min(1,p*1.3-index*.15)),ease=1-Math.pow(1-q,3);
      group.visible=q>0||p>=1;group.position.set(cargo.x,terrain(cargo.x,cargo.z)+(1-ease)*12,cargo.z);
    }
    cargoGrounded=p>=.999;
  }
  function setPowerRelease(progress){
    const p=Math.max(0,Math.min(1,progress)),ease=p*p*(3-2*p),x=powerCargo.x-4*ease,z=powerCargo.z+3.2*ease;
    powerPallet.visible=p>0;powerPallet.position.set(x,terrain(x,z)+.02,z);powerPallet.rotation.y=-.18*ease;palletGrounded=p>=.999;
  }
  setCargoDrop(0);setPowerRelease(0);

  return {floor,blocked,deck,ceiling:(x,z)=>Math.abs(x)<3.1&&z>-5.1&&z<1.1?deck+3.2:Infinity,
    doors(phase){inner.position.y=deck+1.3+(phase==='inner'?2.6:0);outer.position.y=deck+1.3+(phase==='outer'?2.6:0);},
    setCargoDrop,setPowerRelease,
    targets:[{id:'refuge',name:'应急储备终端',...REFUGE},{id:'door',name:'应急舱气闸',x:0,z:6},...CARGO]};
}
