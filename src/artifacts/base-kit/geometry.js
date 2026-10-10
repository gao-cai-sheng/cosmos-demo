import * as THREE from 'three';
import { MeshData, loft, roundedRect, roundedBox, aperturedPrism, cleanMesh, recalcNormals, smoothShade, toGeometry } from '../../lib/geometry-kit/procedural-mesh.js';
import { auditMeshData } from '../../lib/geometry-kit/mesh-topology-audit.js';

export { roundedRect };
export function finish(data) {
  data.frame = 'y-up';
  cleanMesh(data); recalcNormals(data); smoothShade(data, 34);
  return data;
}
export function swept(rings, closed = false) {
  return finish(loft(rings, {closeU:closed,closeV:true,capStart:!closed,capEnd:!closed}));
}
export function block(size, center, radius = .015, segments = 2) {
  const [x,y,z]=center,[w,h,d]=size;
  return finish(roundedBox([x-w/2,y-h/2,z-d/2,x+w/2,y+h/2,z+d/2],radius,segments));
}
export function plate(outer, holes, z0, z1, bevel = .008) {
  // Shape-with-holes is extruded as one manufactured panel, including aperture
  // jambs and bevels. Convert to polygon data before the topology gate.
  const shape=new THREE.Shape(outer.map(p=>new THREE.Vector2(...p)));
  for(const hole of holes)shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(...p))));
  const geo=new THREE.ExtrudeGeometry(shape,{depth:z1-z0-2*bevel,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:8});
  geo.translate(0,0,z0+bevel);
  const p=geo.attributes.position,verts=[],faces=[],map=new Map();
  for(let i=0;i<p.count;i+=3){const face=[];for(let j=0;j<3;j++){
    const v=[p.getX(i+j),p.getY(i+j),p.getZ(i+j)],key=v.map(x=>Math.round(x/1e-6)).join(',');
    if(!map.has(key)){map.set(key,verts.length);verts.push(v);}face.push(map.get(key));
  }faces.push(face);}
  geo.dispose();return finish(MeshData.from(verts,faces));
}
export function panel(points, thickness) {
  // Two matched parametric faces and explicit edge ownership: no paper glass.
  const rows=points.length,cols=points[0].length,verts=[],faces=[];
  for(const delta of [-thickness/2,thickness/2])for(const row of points)for(const p of row){
    const r=Math.hypot(p[0],p[2]),n=new THREE.Vector3(p[0]/128**2,(p[1]-10)/53**2,p[2]/128**2).normalize();
    verts.push([p[0]+n.x*delta,p[1]+n.y*delta,p[2]+n.z*delta]);
  }
  const count=rows*cols,idx=(i,j)=>i*cols+j;
  for(let i=0;i<rows-1;i++)for(let j=0;j<cols-1;j++){
    const a=idx(i,j),b=idx(i+1,j),c=idx(i+1,j+1),d=idx(i,j+1);
    faces.push([a,b,c,d],[a+count,d+count,c+count,b+count]);
  }
  const boundary=[];
  for(let j=0;j<cols;j++)boundary.push(idx(0,j));
  for(let i=1;i<rows;i++)boundary.push(idx(i,cols-1));
  for(let j=cols-2;j>=0;j--)boundary.push(idx(rows-1,j));
  for(let i=rows-2;i>0;i--)boundary.push(idx(i,0));
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];faces.push([a,a+count,b+count,b]);}
  return finish(MeshData.from(verts,faces));
}
export function rod(a,b,radius=.025,segments=12) {
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),axis=bv.clone().sub(av).normalize();
  const u=new THREE.Vector3(Math.abs(axis.y)<.9?0:1,Math.abs(axis.y)<.9?1:0,0).cross(axis).normalize(),v=axis.clone().cross(u);
  return swept([av,bv].map(p=>Array.from({length:segments},(_,i)=>p.clone().addScaledVector(u,radius*Math.cos(i*2*Math.PI/segments)).addScaledVector(v,radius*Math.sin(i*2*Math.PI/segments)).toArray())));
}

// Synchronous SHA-256 keeps the artifact factory independent of browser globals.
export function sha256(bytes) {
  const primes=[],K=[],H=[];
  for(let n=2;primes.length<64;n++){if(primes.some(p=>n%p===0))continue;primes.push(n);K.push((Math.cbrt(n)%1*2**32)>>>0);if(H.length<8)H.push((Math.sqrt(n)%1*2**32)>>>0);}
  const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
  const view=new DataView(padded.buffer);view.setBigUint64(padded.length-8,BigInt(bytes.length)*8n);
  const W=new Uint32Array(64),rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<padded.length;off+=64){
    for(let i=0;i<16;i++)W[i]=view.getUint32(off+i*4);
    for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+W[i-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=(h+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[i]+W[i])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)>>>0);
  }return H.map(x=>x.toString(16).padStart(8,'0')).join('');
}
export function geometryHash(group) {
  const nodes=[];group.traverse(o=>{if(o.isMesh)nodes.push(o);});
  const path=o=>o.parent?path(o.parent)+'/'+o.name:o.name;
  nodes.sort((a,b)=>path(a).localeCompare(path(b),'en'));
  const chunks=[];let bytes=0;
  const write=(values,index=false)=>{const chunk=new Uint8Array(values.length*(index?4:8)),v=new DataView(chunk.buffer);values.forEach((x,i)=>index?v.setUint32(i*4,x,true):v.setBigInt64(i*8,BigInt(Math.round(x/1e-6)),true));chunks.push(chunk);bytes+=chunk.length;};
  for(const node of nodes){for(const name of ['position','normal','uv'])write(Array.from(node.geometry.getAttribute(name)?.array??[]));write(Array.from(node.geometry.index?.array??[]),true);
    write([...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]);}
  const packed=new Uint8Array(bytes);let off=0;for(const c of chunks){packed.set(c,off);off+=c.length;}return sha256(packed);
}

export function builder(SPEC,{materials,seed=SPEC.seed,lod=0}) {
  if(!SPEC.lods.some(x=>x.id===lod))throw Error(`${SPEC.name}: unsupported LOD ${lod}`);
  if(!Number.isSafeInteger(seed))throw Error(`${SPEC.name}: seed must be a safe integer`);
  for(const slot of SPEC.materialSlots)if(!materials?.[slot])throw Error(`${SPEC.name}: missing material ${slot}`);
  const group=new THREE.Group();group.name=SPEC.name;
  const parts={root:group},sockets={},owned=new Set(),topology=[];let disposed=false,renderInfo=null;
  const part=name=>{const g=new THREE.Group();g.name=name;group.add(g);parts[name]=g;return g;};
  const add=(parent,name,data,slot)=>{
    const report=auditMeshData(data);if(!report.ok)throw Error(`${SPEC.name}/${name}: ${JSON.stringify(report.issues)}`);
    topology.push({name,counts:report.counts,signedVolume:report.signedVolume});
    const geometry=toGeometry(data),mesh=new THREE.Mesh(geometry,materials[slot]);owned.add(geometry);
    mesh.name=name;mesh.userData.materialSlot=slot;mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const complete=setState=>{
    for(const [name,meta]of Object.entries(SPEC.sockets)){const node=new THREE.Object3D();node.name=name;node.visible=false;node.position.fromArray(meta.position);node.quaternion.fromArray(meta.quaternion);parts[meta.parent].add(node);sockets[name]=node;}
    setState(SPEC.initialState);group.updateMatrixWorld(true);
    // Canonical hash includes all geometry even when construction states hide it.
    const hash=geometryHash(group);
    return {group,parts,sockets,setState,topology,getMetrics(){let triangles=0,meshes=0;group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {triangles,meshes,drawCalls:renderInfo?.calls??null,renderedTriangles:renderInfo?.triangles??null,geometries:owned.size,generatedTextures:[],lod,seed,geometryHash:hash};},recordRender(info){renderInfo={calls:info.calls,triangles:info.triangles};},dispose(){if(disposed)return;disposed=true;for(const g of owned)g.dispose();}};
  };
  return {group,parts,part,add,complete,lod};
}
export function socket(kind,position,quaternion=[0,0,0,1]) {return {kind,parent:'root',position,quaternion,mate:'opposed-forward',positionTolerance:.001,angleToleranceDeg:.5};}
