import * as THREE from 'three';
import {SITES,equipment} from './power.js';
export function createPowerWorld(scene,heightAt){
 const root=new THREE.Group();scene.add(root);let signature='';let solids=[];
 const metal=new THREE.MeshStandardMaterial({color:0xc2c9c0,roughness:.65}),dark=new THREE.MeshStandardMaterial({color:0x24383f}),solar=new THREE.MeshStandardMaterial({color:0x174165,metalness:.4,roughness:.4}),gold=new THREE.MeshStandardMaterial({color:0xc88d4d}),wire=new THREE.MeshStandardMaterial({color:0xe3b84d});
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m;};
 function rebuild(s){const key=JSON.stringify([s.plan,s.site,s.installed,s.links,s.online]);if(key===signature)return;signature=key;for(const o of [...root.children]){o.geometry?.dispose();root.remove(o);}solids=[];if(!s.plan)return;
 const site=SITES.find(p=>p.id===s.plan),eq=equipment(s.plan);
 const ring=add(new THREE.RingGeometry(2.5,2.65,48),new THREE.MeshBasicMaterial({color:s.site?0xaee0c8:0xe4b975,side:THREE.DoubleSide}),site.x,heightAt(site.x,site.z)+.08,site.z);ring.rotation.x=-Math.PI/2;
 if(!s.installed)return;
 for(const x of [-2.1,2.1]){const y=heightAt(eq.solar.x+x,eq.solar.z);add(new THREE.BoxGeometry(.14,1.1,3.8),metal,eq.solar.x+x,y+.6,eq.solar.z);const panel=add(new THREE.BoxGeometry(3.9,.10,4.8),solar,eq.solar.x+x,y+1.3,eq.solar.z);panel.rotation.x=-.2;for(let i=-2;i<=2;i++){const line=add(new THREE.BoxGeometry(3.88,.012,.025),metal,eq.solar.x+x,y+1.37+i*.2,eq.solar.z+i);line.rotation.x=-.2;}}
 solids.push({...eq.solar,w:4.4,d:2.7});
 for(const id of ['battery','bus']){const p=eq[id],y=heightAt(p.x,p.z);add(new THREE.BoxGeometry(id==='battery'?2:1.2,1.5,1.1),id==='battery'?metal:gold,p.x,y+.75,p.z);add(new THREE.BoxGeometry(.7,.35,.03),dark,p.x,y+1.1,p.z+.57);add(new THREE.BoxGeometry(.12,.12,.04),new THREE.MeshBasicMaterial({color:s.online?0xa8ffcd:0xe3b84d}),p.x+.35,y+1.1,p.z+.59);solids.push({...p,w:id==='battery'?1.25:.85,d:.85});}
 for(const id of s.links){const a=id==='solar'?eq.solar:eq.battery,b=id==='solar'?eq.battery:eq.bus;const pts=Array.from({length:13},(_,i)=>{const x=a.x+(b.x-a.x)*i/12,z=a.z+(b.z-a.z)*i/12;return new THREE.Vector3(x,heightAt(x,z)+.08,z);});add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.055,6,false),wire,0,0,0);}
 }
 return {rebuild,blocked:(x,z)=>solids.some(o=>Math.abs(x-o.x)<o.w&&Math.abs(z-o.z)<o.d)};
}
