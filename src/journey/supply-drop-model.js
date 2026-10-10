import * as THREE from 'three';
import {createOutpostInterior} from './outpost-interior.js';
import {createOutpost,MODULES,OUTPOST_LENGTH,OUTPOST_HEIGHT} from './outpost-model.js';
import {OUTPOST_SCALE} from './outpost-layout.js';

/** The forward outpost: the first thing on the ground, before NX07 comes down.
 *
 * Three modules on one string — living, airlock hub, equipment — from blender/outpost-hy3d.
 * It replaces the single ellipsoid pod that used to land here; it reads as somewhere a crew works
 * rather than a container they crawl into (33 m as designed, 198 m at the current scale, D69).
 *
 * No parachute. A canopy that could lower 33 m of pressurised hull is not something you can draw
 * and still look at honestly, and the model already stands on landing feet — so it comes down on
 * its own thrust, the way NX07 does. The ablative shield and the plume stay.
 *
 * The site is graded, through createOutpost: 33 m of rigid hull needs one plane to stand on and
 * the terrain does not offer one. The pad keeps its own group so the landing sequence can fly the
 * hull down from altitude without the ground coming with it.
 *
 * The roof camera mast is built here rather than baked into the mesh: it telescopes, pans and
 * tilts, and the landing sequence drives it to film NX07's final approach.
 *
 * The interior is outpost-interior.js, built to the shell's own measured cavity: one deck at
 * y=1.75 through all three modules, the two pressure tunnels on their own floor 0.994 m higher,
 * ramps at the necks. It replaces the ellipsoid emergency pod that used to be parked inside the
 * hull — two skins in the same place outside, and a 4 m room that matched nothing inside.
 */
export function createSupplyDrop(scene,{heightAt=()=>0,x=0,z=0,heading=0}={}){
  const outpost=createOutpost({scene,heightAt,x,z,heading});
  const group=outpost.group;
  group.name='前哨舱组 · 先遣';

  // Interior. The shell is an empty pressure vessel, so this is where "inside" lives; it rides
  // with the hull so its deck and airlock keep lining up with the hub's own hatch.
  const interior=createOutpostInterior();
  group.add(interior.group);

  const panel=new THREE.MeshStandardMaterial({color:0xc8cecf,roughness:.5,metalness:.34});
  const dark=new THREE.MeshStandardMaterial({color:0x202c34,roughness:.48,metalness:.58});
  const heat=new THREE.MeshStandardMaterial({color:0x3c2922,emissive:0xff410c,emissiveIntensity:0,roughness:.72});
  const glass=new THREE.MeshStandardMaterial({color:0x0b1418,roughness:.12,metalness:.8});
  const status=new THREE.MeshBasicMaterial({color:0x8fdcff});
  const mesh=(geo,mat,parent=group)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};

  // Mast on the airlock hub's roof, at the middle of the string.
  const hub=MODULES.find(m=>m.id==='hub');
  const hubX=(hub.x0+hub.x1)/2;
  // Where the mast stands, the shield and the plume were set out at scale 2.0; `u` carries them to
  // the current scale so they stay on the same spot of the hull. The mast itself is real equipment
  // and keeps its size.
  const u=OUTPOST_SCALE/2;
  const mast=new THREE.Group();mast.name='roof camera mast';
  mast.position.set(hubX-1.1*u, OUTPOST_HEIGHT-0.35*u, -1.2*u);
  group.add(mast);
  mesh(new THREE.CylinderGeometry(.26,.34,.16,20),dark,mast).position.y=.08;
  const tubes=[.1,.078,.058].map((r,i)=>{const t=mesh(new THREE.CylinderGeometry(r,r,.9,14),i?panel:dark,mast);t.name='mast tube '+(i+1);return t;});
  const pan=new THREE.Group();pan.name='camera pan';mast.add(pan);
  const tilt=new THREE.Group();tilt.name='camera tilt';tilt.position.y=.16;pan.add(tilt);
  mesh(new THREE.CylinderGeometry(.07,.09,.12,12),dark,pan).position.y=.06;
  mesh(new THREE.BoxGeometry(.3,.2,.34),panel,tilt).name='camera housing';
  const lensBarrel=mesh(new THREE.CylinderGeometry(.07,.07,.08,16),dark,tilt);lensBarrel.rotation.x=Math.PI/2;lensBarrel.position.z=.2;
  mesh(new THREE.CircleGeometry(.055,16),glass,tilt).position.z=.241;
  const light=mesh(new THREE.BoxGeometry(.05,.03,.012),status,tilt);light.position.set(.1,.06,.172);
  const lens=new THREE.Object3D();lens.name='mast camera lens';lens.position.z=.26;tilt.add(lens);

  // Entry-burn shield under the whole string, and the terminal-descent plume beneath the hub.
  const shield=mesh(new THREE.CylinderGeometry(1,1,.12,64).scale(OUTPOST_LENGTH*.46,1,4.2*u),heat);
  shield.name='ablative base shield';shield.position.y=.1;
  const flame=mesh(new THREE.ConeGeometry(1.5*u,7.4*u,18),new THREE.MeshBasicMaterial({color:0xffb269,transparent:true,opacity:.72,depthWrite:false}));
  flame.name='terminal descent plume';flame.rotation.z=Math.PI;flame.position.set(hubX,-1.9*u,0);

  /** f.mast 0..1 extends the tubes; f.pan / f.tilt aim the camera (radians, local; +tilt looks up).
   * f.chute is accepted and ignored — this vehicle lands on thrust. */
  function update(f){
    const deploy=THREE.MathUtils.clamp(f.mast||0,0,1);
    shield.material.emissiveIntensity=(f.heat||0)*2;
    flame.visible=(f.thrust||0)>0.01;flame.scale.y=.35+.65*(f.thrust||0);
    tubes.forEach((t,i)=>t.position.y=.16+.45+i*.75*deploy);
    pan.position.y=.16+.9+1.5*deploy;
    if(Number.isFinite(f.pan))pan.rotation.y=f.pan;
    if(Number.isFinite(f.tilt))tilt.rotation.x=-f.tilt;
    light.visible=deploy>.98;
  }

  function finish(){
    flame.visible=false;shield.material.emissiveIntensity=0;
    update({mast:1});
  }

  update({});
  return {group,interior,lens,update,finish,outpost,
    padGroup:outpost.padGroup, floorAt:outpost.floorAt, hullBlocked:outpost.blocked,
    deckY:outpost.deckY, get ready(){return outpost.ready;}};
}
