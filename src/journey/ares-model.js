import * as THREE from 'three';
import {attachAsset,geometryKit} from './assets/blender-assets.js';
export const ARES_SPEC={roverCargo:{min:[-1.35,2.80,-4.63],max:[1.35,6.05,-.18]},cargo:{min:[-1.35,2.80,-4.63],max:[1.35,6.05,-.18]}};
export function createAres(){
 const group=new THREE.Group();group.name='ARES 06 · Blender six-wheel logistics rover';const parts={root:group},sockets={};let state='sealed';
 // Pivot nodes remain stable while the asset loads; physics and trails use these exact axles.
 for(let side=0;side<2;side++)for(let axle=0;axle<3;axle++){const i=side*3+axle,p=new THREE.Group();p.name='wheel.'+i;p.position.set(side===0?1.78:-1.78,1.045,[3.45,-.48,-2.66][axle]);group.add(p);parts['wheel.'+i]=p;}
 const ready=attachAsset(group,'ares',model=>{
  for(let i=0;i<6;i++){const wheel=model.getObjectByName('wheel_'+i);if(wheel){const p=parts['wheel.'+i];p.position.copy(wheel.position);wheel.position.set(0,0,0);p.add(wheel);}}
 });ready.catch(()=>{});
 const {box}=geometryKit(group);parts.starterPack=new THREE.Group();parts.starterPack.name='starter supply lockers';group.add(parts.starterPack);
 for(const x of [-.8,.8])box('secured survival case',[.65,.42,.45],[x,2.28,-.2],'orange',parts.starterPack);
 const seat=new THREE.Object3D();seat.name='driver seat';seat.position.set(0,0,0);group.add(seat);sockets['mount.driver']=seat;
 return {group,parts,sockets,ready,get state(){return state;},setState(v){state=v;return true;}};
}
