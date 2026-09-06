import * as THREE from 'three';
const socket=(kind,position,quaternion=[0,0,0,1])=>({kind,parent:'root',position,quaternion,mate:'opposed-forward',positionTolerance:.001,angleToleranceDeg:.5});
export const SPEC={schema:'threejs-artifact@0.2',name:'atlas-carrier',version:'1.0.0',unit:'m',up:[0,1,0],forward:[0,0,1],datum:'tyre-contact-plane',seed:260906,canonicalState:'sealed',initialState:'sealed',bounds:{min:[-2.75,0,-4.9],max:[2.75,6.2,4.9],w:5.5,h:6.2,d:9.8,state:'sealed',lod:0,relativeTolerance:.02,absoluteFloor:.001},boundsByState:{},sockets:{'dock.rover':socket('dock',[0,1.4,-2.4],[0,1,0,0]),'mount.driver':socket('mount',[-.8,2.25,1.7]),'hull.entry':socket('hull',[-1.96,1.4,1],[0,-Math.SQRT1_2,0,Math.SQRT1_2])},materialSlots:['armor','structure','rubber','glass','interior','light'],states:{sealed:{parts:{ramp:0},roof:true},open:{parts:{ramp:-1.958},roof:true},cutaway:{parts:{ramp:-1.958},roof:false}},articulation:[{part:'ramp',type:'rotation',axis:[1,0,0],unit:'rad',range:[-1.958,0],rest:0}],allowedContacts:[{assembly:'wheel.*',purpose:'tread and concentric hub assembly',tolerance:.08},{assembly:'cab',purpose:'bonded frame, glazing, interior supports',tolerance:.12},{assembly:'chassis',purpose:'bolted chassis members',tolerance:.12},{assembly:'cargo',purpose:'shell fasteners and rails',tolerance:.08},{assembly:'ramp',purpose:'hinge and tread mounting',tolerance:.08}],lods:[{id:0,note:'full delivery geometry',measuredTriangles:null,budget:{maxTriangles:100000,maxDrawCalls:320}}],collider:{kind:'compound',state:'sealed',parts:[{name:'body',kind:'box',size:[3.92,3.9,8.9],position:[0,3.25,0]},{name:'wheel-zone',kind:'box',size:[5.5,2.2,8.5],position:[0,1.1,-.1]},{name:'ramp',parent:'ramp',kind:'box',size:[3.46,3.55,.12],position:[0,1.775,0]}],dynamicParts:['ramp']},interaction:{volume:{kind:'box',size:[4,4,4],position:[0,2,-6]},anchor:'dock.rover',prompt:'打开货舱 / 装卸探测车'},cargo:{min:[-1.75,1.4,-4.4],max:[1.75,5,-.4]},detailFocus:{socket:'mount.driver',radius:1},grazingAzimuthDeg:60,generatedTextures:[],deviations:[]};
function bevelBox(w,h,d,r=.04){
 const g=new THREE.BoxGeometry(w,h,d,3,3,3),p=g.attributes.position,v=new THREE.Vector3(),q=new THREE.Vector3();r=Math.min(r,w/3,h/3,d/3);
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);q.set(THREE.MathUtils.clamp(v.x,-w/2+r,w/2-r),THREE.MathUtils.clamp(v.y,-h/2+r,h/2-r),THREE.MathUtils.clamp(v.z,-d/2+r,d/2-r));v.sub(q).normalize().multiplyScalar(r).add(q);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return g;
}
export function create({materials,seed=SPEC.seed,lod=0}){
 for(const slot of SPEC.materialSlots)if(!materials?.[slot])throw Error(`atlas-carrier: missing material ${slot}`);
 if(lod!==0)throw Error('atlas-carrier: unsupported LOD '+lod);
 const group=new THREE.Group();group.name='ATLAS';const parts={root:group},sockets={},owned=new Set();let disposed=false,state='sealed',serial=0;
 const part=(name,parent=group)=>{const g=new THREE.Group();g.name=name;parent.add(g);parts[name]=g;return g;};
 const chassis=part('chassis'),cab=part('cab'),cargo=part('cargo'),roof=part('cargoRoof');
 const add=(parent,name,geo,slot,p=[0,0,0],rot=[0,0,0])=>{owned.add(geo);const m=new THREE.Mesh(geo,materials[slot]);m.name=name+'-'+serial++;m.userData.materialSlot=slot;m.position.fromArray(p);m.rotation.set(...rot);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 const box=(parent,name,size,slot,p,rot)=>add(parent,name,bevelBox(...size),slot,p,rot);
 const rod=(parent,name,a,b,r,slot='structure',segments=12)=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),m=add(parent,name,new THREE.CylinderGeometry(r,r,p.distanceTo(q),segments),slot,p.add(q).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.sub(new THREE.Vector3(...a)).normalize());return m;};
 // Raised chassis, deck and visible suspension attachment blocks.
 box(chassis,'deck',[3.9,.28,8.9],'structure',[0,1.26,0]);
 for(const x of [-1.2,1.2])box(chassis,'beam',[.22,.35,8.7],'structure',[x,.95,0]);
 for(const z of [-4.72,4.72])box(chassis,'bumper',[3.7,.28,.36],'structure',[0,1.05,z]);
 for(const side of [-1,1])for(const z of [3.2,-.3,-3.6]){
  const wheel=part('wheel.'+Object.keys(parts).filter(k=>k.startsWith('wheel.')).length);wheel.position.set(side*2.25,1.1,z);
  add(wheel,'tyre',new THREE.CylinderGeometry(1.065,1.065,.92,40),'rubber',[0,0,0],[0,0,Math.PI/2]);
  for(const face of [-1,1]){
   add(wheel,'rim',new THREE.CylinderGeometry(.79,.79,.035,40),'structure',[face*.48,0,0],[0,0,Math.PI/2]);
   add(wheel,'hub',new THREE.CylinderGeometry(.37,.37,.04,24),'armor',[face*.49,0,0],[0,0,Math.PI/2]);
   const ring=add(wheel,'rim-ring',new THREE.TorusGeometry(.69,.04,8,40),'interior',[face*.498,0,0],[0,Math.PI/2,0]);
  }
  // Tread blocks share a geometry, with dimensions baked into the geometry.
  const tread=bevelBox(.94,.055,.14,.008);
  owned.add(tread);const treadMesh=new THREE.InstancedMesh(tread,materials.rubber,32);treadMesh.name='tread-belt';treadMesh.userData.materialSlot='rubber';treadMesh.castShadow=treadMesh.receiveShadow=true;const dummy=new THREE.Object3D();
  for(let i=0;i<32;i++){const a=i*Math.PI/16;dummy.position.set(0,Math.cos(a)*1.0725,Math.sin(a)*1.0725);dummy.rotation.set(a,0,0);dummy.updateMatrix();treadMesh.setMatrixAt(i,dummy.matrix);}wheel.add(treadMesh);
  rod(chassis,'suspension',[side*1.55,1.4,z+.35],[side*2.14,1.1,z],.11);
  rod(chassis,'damper',[side*1.6,1.72,z-.35],[side*2.06,1.1,z],.085,'interior');
 }
 // Separate cargo wall solids leave a real opening and usable interior volume.
 for(const side of [-1,1]){
  box(cargo,'side-wall',[.18,3.65,4.05],'armor',[side*1.84,3.225,-2.375]);
  for(const z of [-3.9,-2.4,-.9]){
   box(cargo,'panel-frame',[.06,2.8,.10],'structure',[side*1.95,3.25,z]);
   box(cargo,'equipment',[.24,.70,.76],'structure',[side*2.02,3.9,z]);
  }
  box(cargo,'inner-rail',[.08,.09,3.85],'interior',[side*1.60,1.47,-2.4]);
 }
 box(cargo,'bulkhead',[3.5,3.6,.16],'structure',[0,3.2,-.32]);
 box(roof,'roof',[3.88,.16,4.15],'armor',[0,5.09,-2.375]);
 for(const x of [-1.52,1.52]){
  box(roof,'roof-rail',[.12,.18,3.85],'structure',[x,5.25,-2.4]);
  add(roof,'filter',new THREE.CylinderGeometry(.20,.25,.55,20),'interior',[x,5.55,-3.6]);
  add(roof,'filter-cap',new THREE.CylinderGeometry(.23,.23,.055,20),'armor',[x,5.855,-3.6]);
  rod(roof,'antenna',[x,5.30,-1.4],[x,6.2,-1.4],.016);
 }
 // Cockpit: chamfered nose, raked windshield, separate transparent side panes.
 box(cab,'nose',[3.62,.52,.72],'armor',[0,1.73,4.25]);
 box(cab,'roof',[3.7,.17,3.3],'armor',[0,4.17,1.4]);
 box(cab,'windshield',[3.32,2.05,.045],'glass',[0,3.03,3.58],[-.55,0,0]);
 for(const x of [-1.74,0,1.74])rod(cab,'windscreen-frame',[x,2.14,4.13],[x,3.96,3.01],x===0?.055:.09);
 rod(cab,'windshield-lower',[-1.75,2.14,4.13],[1.75,2.14,4.13],.07,'armor');
 rod(cab,'windshield-upper',[-1.75,3.96,3.01],[1.75,3.96,3.01],.075,'armor');
 for(const side of [-1,1]){
  box(cab,'sill',[.18,.67,3.45],'armor',[side*1.8,1.77,1.70]);
  box(cab,'side-glass',[.045,1.55,2.6],'glass',[side*1.805,3.05,1.45]);
  for(const z of [.12,1.45,2.78])box(cab,'window-post',[.14,1.85,.09],'structure',[side*1.84,3.05,z]);
  box(cab,'side-header',[.16,.16,2.85],'structure',[side*1.83,3.96,1.45]);
  box(cab,'step',[.54,.11,1.1],'structure',[side*2.06,.90,.55]);
  rod(cab,'grab-handle',[side*1.99,1.85,.18],[side*1.99,2.5,.18],.027,'interior');
  box(cab,'headlight-bar',[.94,.30,.36],'structure',[side*1.1,4.33,2.65]);
  for(let i=-1;i<=1;i++)add(cab,'lamp',new THREE.CylinderGeometry(.09,.09,.035,16),'light',[side*1.1+i*.27,4.33,2.85],[Math.PI/2,0,0]);
 }
 for(const x of [-.8,.8]){
  box(cab,'seat-pedestal',[.42,.40,.45],'structure',[x,1.60,1.55]);
  box(cab,'seat-cushion',[.68,.16,.7],'interior',[x,1.90,1.6]);
  box(cab,'seat-back',[.68,.90,.16],'interior',[x,2.38,1.30],[-.1,0,0]);
  box(cab,'headrest',[.4,.28,.17],'interior',[x,2.98,1.25]);
  box(cab,'console',[.91,.26,.58],'structure',[x,2.14,2.72],[.14,0,0]);
  box(cab,'display',[.56,.018,.31],'light',[x,2.295,2.7],[.14,0,0]);
  rod(cab,'control-grip',[x+.3,2.2,2.47],[x+.3,2.45,2.48],.035);
 }
 const ramp=part('ramp');ramp.position.set(0,1.4,-4.62);
 box(ramp,'door',[3.46,3.55,.12],'armor',[0,1.775,0]);
 for(const x of [-1.61,1.61])box(ramp,'ramp-edge',[.10,3.5,.06],'structure',[x,1.775,.10]);
 for(let i=1;i<13;i++)box(ramp,'traction',[3.18,.04,.025],'structure',[0,i*.267,.075]);
 for(const [name,meta] of Object.entries(SPEC.sockets)){const node=new THREE.Object3D();node.name=name;node.visible=false;node.position.fromArray(meta.position);node.quaternion.fromArray(meta.quaternion);parts[meta.parent].add(node);sockets[name]=node;}
 const setState=name=>{if(!SPEC.states[name])throw Error('atlas-carrier: unknown state '+name);state=name;ramp.rotation.x=SPEC.states[name].parts.ramp;roof.visible=SPEC.states[name].roof;group.updateMatrixWorld(true);};setState(SPEC.initialState);
 return {group,parts,sockets,setState,get state(){return state;},getMetrics(){let triangles=0,meshes=0;group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});return {triangles,renderedTriangles:null,drawCalls:meshes,meshes,geometries:owned.size,generatedTextures:[],lod,seed};},dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();}};
}
