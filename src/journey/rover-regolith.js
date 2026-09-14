import * as THREE from 'three';
// Fine local replacement tiles share their deformed heights with wheel physics.
// Keep a bounded recent working set; continental MOLA geometry remains untouched.
export function createRegolith(scene,baseHeight){
 const size=8,res=64,limit=32,tiles=new Map(),slots=Array.from({length:limit},()=>new THREE.Vector2(1e12,1e12));let next=0;
 const materials=new Set(),dirty=new Set();
 function install(){scene.traverse(o=>{if(!['terrain','Procedural Mars Terrain','Coprates Chasma (MOLA)'].includes(o.name)||!o.material||materials.has(o.material))return;const m=o.material;materials.add(m);const previous=m.onBeforeCompile;m.onBeforeCompile=shader=>{previous?.(shader);shader.uniforms.uRutTiles={value:slots};shader.vertexShader='varying vec2 vRutXZ;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRutXZ=(modelMatrix*vec4(position,1.0)).xz;');shader.fragmentShader='uniform vec2 uRutTiles[32]; varying vec2 vRutXZ;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfor(int i=0;i<32;i++){vec2 d=vRutXZ-uRutTiles[i];if(d.x>=0.0&&d.y>=0.0&&d.x<8.0&&d.y<8.0)discard;}');};m.customProgramCacheKey=()=> 'mu7-regolith-tiles-v1';m.needsUpdate=true;});}
 function key(x,z){return `${Math.floor(x/size)},${Math.floor(z/size)}`;}
 function tile(x,z){const id=key(x,z);if(tiles.has(id))return tiles.get(id);install();const ox=Math.floor(x/size)*size,oz=Math.floor(z/size)*size;
 const slot=next++%limit;for(const [k,t] of tiles)if(t.slot===slot){t.mesh.removeFromParent();t.mesh.geometry.dispose();t.mesh.material.dispose();tiles.delete(k);dirty.delete(t);}
 const g=new THREE.PlaneGeometry(size,size,res,res);g.rotateX(-Math.PI/2);g.translate(ox+4,0,oz+4);const pos=g.attributes.position,base=new Float32Array(pos.count),depth=new Float32Array(pos.count),color=new Float32Array(pos.count*3);
 for(let i=0;i<pos.count;i++){base[i]=baseHeight(pos.getX(i),pos.getZ(i));pos.setY(i,base[i]);color.set([.38,.19,.105],i*3);}g.setAttribute('color',new THREE.BufferAttribute(color,3));g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.name='MU-7 deformed regolith';mesh.receiveShadow=true;scene.add(mesh);const t={slot,ox,oz,mesh,base,depth};tiles.set(id,t);slots[slot].set(ox,oz);return t;
 }
 function offset(x,z){const t=tiles.get(key(x,z));if(!t)return 0;const u=(x-t.ox)/size*res,v=(z-t.oz)/size*res,i=Math.min(res-1,Math.floor(u)),j=Math.min(res-1,Math.floor(v)),a=u-i,b=v-j;const index=j*(res+1)+i;return t.depth[index]*(1-a)*(1-b)+t.depth[index+1]*a*(1-b)+t.depth[index+res+1]*(1-a)*b+t.depth[index+res+2]*a*b;}
 function dig(x,z,radius,depth,add=0){
  for(let tz=Math.floor((z-radius*1.7)/size);tz<=Math.floor((z+radius*1.7)/size);tz++)for(let tx=Math.floor((x-radius*1.7)/size);tx<=Math.floor((x+radius*1.7)/size);tx++){
   const t=tile(tx*size+.01,tz*size+.01),pos=t.mesh.geometry.attributes.position;
   const i0=Math.max(0,Math.floor((x-radius*1.7-t.ox)*8)),i1=Math.min(res,Math.ceil((x+radius*1.7-t.ox)*8)),j0=Math.max(0,Math.floor((z-radius*1.7-t.oz)*8)),j1=Math.min(res,Math.ceil((z+radius*1.7-t.oz)*8));
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const n=j*(res+1)+i,d=Math.hypot(pos.getX(n)-x,pos.getZ(n)-z)/radius;if(d>1.7)continue;const shape=Math.max(0,1-d*d);if(d<1)t.depth[n]=Math.max(-.85,Math.min(t.depth[n],-depth*shape)-add*shape);else t.depth[n]=Math.max(t.depth[n],Math.sin((d-1)/.7*Math.PI)*depth*.18);pos.setY(n,t.base[n]+t.depth[n]);const c=t.mesh.geometry.attributes.color;const shade=1+Math.min(0,t.depth[n])*1.5;c.setXYZ(n,.38*shade,.19*shade,.105*shade);}
   dirty.add(t);
  }
 }
 function flush(){for(const t of dirty){const g=t.mesh.geometry;g.attributes.position.needsUpdate=g.attributes.color.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}dirty.clear();}
 return {dig,flush,heightAt:(x,z)=>baseHeight(x,z)+offset(x,z),get tileCount(){return tiles.size;}};
}
