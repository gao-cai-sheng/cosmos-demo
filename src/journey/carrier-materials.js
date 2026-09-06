import * as THREE from 'three';
export function carrierMaterials(){return {
 armor:new THREE.MeshStandardMaterial({color:0xd97426,metalness:.45,roughness:.46}),
 structure:new THREE.MeshStandardMaterial({color:0x293136,metalness:.68,roughness:.4}),
 rubber:new THREE.MeshStandardMaterial({color:0x242321,metalness:.06,roughness:.93}),
 glass:new THREE.MeshPhysicalMaterial({color:0x97b7c2,metalness:0,roughness:.12,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}),
 interior:new THREE.MeshStandardMaterial({color:0x92999a,metalness:.45,roughness:.48}),
 light:new THREE.MeshStandardMaterial({color:0xc3e6f0,emissive:0x507985,emissiveIntensity:.65})};}
