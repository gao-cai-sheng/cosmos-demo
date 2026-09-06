import * as THREE from 'three';
import { CARGO, REFUGE } from './state.js';
export function createArrivalWorld(scene,terrain){
  const root=new THREE.Group();root.name='Arrival refuge and supplies';scene.add(root);
  const obstacles=[];const deck=Math.max(...[-3,3].flatMap(x=>[-5,4].map(z=>terrain(x,z))))+.15;
  const material=(c)=>new THREE.MeshStandardMaterial({color:c,roughness:.75});
  const white=material(0xc5c9bf),dark=material(0x273c42),orange=material(0xc87743),metal=material(0x748c8a);
  function box(x,y,z,w,h,d,mat,solid=false){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);if(solid)obstacles.push({x,z,w:w/2+.3,d:d/2+.3});return m;}
  function sign(text,x,y,z,w=1.8){const c=document.createElement('canvas');c.width=768;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#10282d';ctx.fillRect(0,0,768,256);ctx.fillStyle='#bce5d9';ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,154);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}));m.position.set(x,y,z);root.add(m);return m;}
  box(0,deck-.15,-2,6,.3,6,dark);box(0,deck+3.35,-2,6.2,.2,6.2,white);
  box(-3,deck+1.6,-2,.2,3.3,6,white,true);box(3,deck+1.6,-2,.2,3.3,6,white,true);box(0,deck+1.6,-5,6,3.3,.2,white,true);
  for(const x of [-2,2])box(x,deck+1.6,1,2,3.3,.2,white,true);
  box(0,deck+3,1,2, .6,.2,white);
  box(0,deck-.1,2.5,2,.2,3,dark);
  for(const x of [-1,1])box(x,deck+1.35,2.5,.16,2.7,3,white,true);
  box(0,deck+2.75,2.5,2.2,.15,3,white);
  const inner=box(0,deck+1.3,1,1.85,2.6,.12,metal,true),outer=box(0,deck+1.3,4,1.85,2.6,.12,orange,true);
  // Door collisions remain closed for walking; airlock transfer is a controlled transition.
  box(-2.05,deck+.45,-3.2,1.2,.65,2.1,dark,true);box(-2.05,deck+.81,-3.2,1.15,.1,2,white);
  box(2.5,deck+1,-2,.6,2,1.4,dark,true);sign('RESERVE',2.17,deck+1.65,-2,.85).rotation.y=-Math.PI/2;
  box(0,deck+3.19,-2,3,.04,.15,new THREE.MeshBasicMaterial({color:0xd8f5e2}));
  const light=new THREE.PointLight(0xd8eee3,15,12,1.5);light.position.set(0,deck+2.7,-2);root.add(light);
  sign('REFUGE · 01',0,deck+3.15,4.1,3.6);sign('AIRLOCK',0,deck+2.5,.87,1.2).rotation.y=Math.PI;
  // Grated boarding ramp follows a gentle grade to the original terrain.
  const end=terrain(0,8),angle=Math.atan2(deck-end,4);const ramp=box(0,(deck+end)/2-.08,6,2,.15,Math.hypot(4,deck-end),metal);ramp.rotation.x=angle;
  for(const c of CARGO){const y=terrain(c.x,c.z);box(c.x,y+.14,c.z,2.5,.28,1.8,dark);box(c.x,y+.8,c.z,2.2,1.15,1.5,white,true);box(c.x,y+1.41,c.z,2.25,.07,1.55,c.id==='power'?metal:orange);sign(c.code,c.x,y+.85,c.z+.77,1.1);sign(c.code,c.x,y+.85,c.z-.77,1.1).rotation.y=Math.PI;}
  const floor=(x,z)=>Math.abs(x)<=3.05&&z>=-5.1&&z<=1.05?deck:Math.abs(x)<=1.1&&z>1&&z<=4?deck:Math.abs(x)<=1.1&&z>4&&z<8?deck+(end-deck)*(z-4)/4:terrain(x,z);
  const blocked=(x,z)=>obstacles.some(o=>Math.abs(x-o.x)<o.w&&Math.abs(z-o.z)<o.d);
  return {floor,blocked,deck,ceiling:(x,z)=>Math.abs(x)<3.1&&z>-5.1&&z<1.1?deck+3.2:Infinity,
    doors(phase){inner.position.y=deck+1.3+(phase==='inner'?2.6:0);outer.position.y=deck+1.3+(phase==='outer'?2.6:0);},
    targets:[{id:'refuge',name:'应急储备终端',...REFUGE},{id:'door',name:'应急舱气闸',x:0,z:6},...CARGO]};
}
