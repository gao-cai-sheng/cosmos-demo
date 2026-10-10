import * as THREE from 'three';
import {createTyreTrail} from './tyre-trail.js';

/** Scene mesh for a tyre trail. Same look for every ground vehicle; only width and buffer size differ. */
export function createTyreTracks({parent,name,...options}){
 let geometry=null;
 const trail=createTyreTrail({...options,onWrite:count=>{geometry.setDrawRange(0,count*6);geometry.attributes.position.needsUpdate=true;}});
 geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(trail.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x4a2115,transparent:true,opacity:.58,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 mesh.name=name;mesh.frustumCulled=false;parent.add(mesh);
 return {mesh,step:trail.step,reset:trail.reset,mark:trail.ribbon,get count(){return trail.count;}};
}
