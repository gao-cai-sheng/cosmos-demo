import * as THREE from 'three';
import {GLTFLoader} from '../../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
const cache=new Map();
export function loadBlenderAsset(name){
 if(!cache.has(name))cache.set(name,new GLTFLoader().loadAsync(new URL(`../../../assets/models/${name}.glb`,import.meta.url).href).then(g=>{
   g.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=true;}});return g.scene;
 }).catch(e=>{cache.delete(name);throw e;}));
 return cache.get(name).then(scene=>scene.clone(true));
}
export function attachAsset(parent,name,onLoad=()=>{}){
 parent.userData.assetState='loading';
 return loadBlenderAsset(name).then(model=>{parent.add(model);parent.userData.assetState='ready';onLoad(model);return model;}).catch(e=>{parent.userData.assetState='error';parent.userData.assetError=e.message;console.error(`Failed to load ${name}`,e);throw e;});
}
export function geometryKit(root){
 const materials={white:new THREE.MeshStandardMaterial({color:0xb6c5c9,metalness:.45,roughness:.42}),dark:new THREE.MeshStandardMaterial({color:0x202a30,metalness:.65,roughness:.46}),metal:new THREE.MeshStandardMaterial({color:0x899da4,metalness:.85,roughness:.27}),orange:new THREE.MeshStandardMaterial({color:0xe87818,metalness:.4,roughness:.45}),light:new THREE.MeshStandardMaterial({color:0x61d4f5,emissive:0x25a9d9,emissiveIntensity:1.5})};
 const box=(name,size,position,mat='white',parent=root)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),materials[mat]);m.name=name;m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const rod=(name,r,mat='metal',parent=root)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,1,10),materials[mat]);m.name=name;m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const poseRod=(m,a,b)=>{m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=a.distanceTo(b);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());};
 return {box,rod,poseRod,materials};
}
