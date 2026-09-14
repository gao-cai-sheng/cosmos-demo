import * as THREE from 'three';
import {createHabitat} from './habitat-model.js';

// Independent Mars delivery pod. It echoes ONE of Kestrel's raised nacelles:
// one sealed pearl pressure shell, dark seams and small cold-blue status accents.
// The pod keeps its own parachute because it is an independent package, not Kestrel itself.
export function createSupplyDrop(scene){
  const group=new THREE.Group();group.name='单体椭圆先遣补给舱';scene.add(group);

  const habitat=createHabitat();group.add(habitat.group);
  const panel=new THREE.MeshStandardMaterial({color:0xc8cecf,roughness:.5,metalness:.34});
  const dark=new THREE.MeshStandardMaterial({color:0x202c34,roughness:.48,metalness:.58});
  const heat=new THREE.MeshStandardMaterial({color:0x3c2922,emissive:0xff410c,emissiveIntensity:0,roughness:.72});
  const mesh=(geo,mat,parent=group)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  // Roof camera mast: the pod's external view of NX07's final descent. It sits outside the pressure shell.
  const glass=new THREE.MeshStandardMaterial({color:0x0b1418,roughness:.12,metalness:.8});
  const status=new THREE.MeshBasicMaterial({color:0x8fdcff});
  const mast=new THREE.Group();mast.name='roof camera mast';mast.position.set(0,5.42,-1);group.add(mast);
  const base=mesh(new THREE.CylinderGeometry(.26,.34,.16,20),dark,mast);base.name='mast base';base.position.y=.08;
  // Nested telescoping tubes: collapsed inside the lowest one for descent, extended to ~2.4 m after touchdown.
  const tubes=[.1,.078,.058].map((r,i)=>{const t=mesh(new THREE.CylinderGeometry(r,r,.9,14),i?panel:dark,mast);t.name='mast tube '+(i+1);return t;});
  const pan=new THREE.Group();pan.name='camera pan';mast.add(pan);
  const tilt=new THREE.Group();tilt.name='camera tilt';tilt.position.y=.16;pan.add(tilt);
  mesh(new THREE.CylinderGeometry(.07,.09,.12,12),dark,pan).position.y=.06;
  const housing=mesh(new THREE.BoxGeometry(.3,.2,.34),panel,tilt);housing.name='camera housing';
  const lensBarrel=mesh(new THREE.CylinderGeometry(.07,.07,.08,16),dark,tilt);lensBarrel.rotation.x=Math.PI/2;lensBarrel.position.z=.2;
  const lensGlass=mesh(new THREE.CircleGeometry(.055,16),glass,tilt);lensGlass.position.z=.241;
  const light=mesh(new THREE.BoxGeometry(.05,.03,.012),status,tilt);light.position.set(.1,.06,.172);
  const lens=new THREE.Object3D();lens.name='mast camera lens';lens.position.z=.26;tilt.add(lens);
  const shield=mesh(new THREE.CylinderGeometry(1,1,.12,64).scale(2,1,2.2),heat);shield.name='ablative base shield';shield.position.y=.1;

  const chute=new THREE.Group();chute.name='independent parachute rig';group.add(chute);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(5.2,32,14,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xe5d7c7,side:THREE.DoubleSide,roughness:.8}));canopy.position.y=13;canopy.castShadow=true;chute.add(canopy);
  for(let i=0;i<10;i++){
    const a=i*Math.PI*2/10;
    chute.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a)*1.6,2.4,Math.sin(a)*1.6),
      new THREE.Vector3(Math.cos(a)*5.1,13,Math.sin(a)*5.1),
    ]),new THREE.LineBasicMaterial({color:0xc7bbaa})));
  }

  const flame=mesh(new THREE.ConeGeometry(.78,4.2,16),new THREE.MeshBasicMaterial({color:0xffb269,transparent:true,opacity:.72,depthWrite:false}));flame.name='terminal descent plume';flame.rotation.z=Math.PI;flame.position.y=-1.1;

  // f.mast 0..1 extends the tubes; f.pan / f.tilt aim the camera (radians, pod-local; +tilt looks up).
  function update(f){
    const deploy=THREE.MathUtils.clamp(f.mast||0,0,1);
    chute.visible=(f.chute||0)>0.001;chute.scale.setScalar(Math.max(.001,f.chute||0));
    shield.material.emissiveIntensity=(f.heat||0)*2;
    flame.visible=(f.thrust||0)>0.01;flame.scale.y=.35+.65*(f.thrust||0);
    tubes.forEach((t,i)=>t.position.y=.16+.45+i*.75*deploy);
    pan.position.y=.16+.9+1.5*deploy;
    if(Number.isFinite(f.pan))pan.rotation.y=f.pan;
    if(Number.isFinite(f.tilt))tilt.rotation.x=-f.tilt;
    light.visible=deploy>.98;
  }

  function finish(){
    chute.visible=false;flame.visible=false;shield.material.emissiveIntensity=0;
    update({mast:1});
  }

  update({});
  return {group,habitat,lens,update,finish};
}
