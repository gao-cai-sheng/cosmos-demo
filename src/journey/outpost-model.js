import * as THREE from 'three';
import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {cutOutpostWindows} from './outpost-window.js';
import {MODULES,OUTPOST_LENGTH,OUTPOST_WIDTH,OUTPOST_HEIGHT,SOCKETS,OUTPOST_SCALE,GLB_SCALE,
        padHeight,padExtent,moduleAtLocal,distanceToHull,siteSpread,entryRampHeight,rampFillHeight,
        RAMP_SHOULDER,FILL_SLOPE,isRampRailTriangle,hullFootprint,bermRunFor,siteFloor} from './outpost-layout.js';

/** Three-module forward outpost: living module — tunnel — airlock hub — tunnel — equipment module.
 * Built from blender/outpost-hy3d (Hunyuan 3D generated shell, scaled and metal-corrected there).
 *
 * The imported shell retains its original silhouette; the entry, ramp and transparent windows
 * are authored in refine.py. Minimal visible floors support the glazing; playable interiors and
 * door animation remain future work. Geometry and walk-up rules live in outpost-layout.js.
 *
 * Local frame: +X along the string, +Z out the ramp side, y=0 at the footpads.
 */
const S=OUTPOST_SCALE;
export const OUTPOST_URL=new URL('../../assets/models/outpost.glb',import.meta.url).href;
export {MODULES,OUTPOST_LENGTH,OUTPOST_WIDTH,OUTPOST_HEIGHT,SOCKETS,padHeight,siteSpread};

/** Load the shell and stand it on the ground at (x,z), facing `heading` (radians about +Y).
 * `heightAt` is sampled across the footprint and the highest sample wins, so a 33 m rigid hull on
 * rolling terrain sits on its high point rather than burying its middle; the graded pad fills in
 * everywhere that leaves hanging. */
export function createOutpost({scene,heightAt,x=0,z=0,heading=0,onReady}){
  const group=new THREE.Group();
  group.name='前哨舱组';
  group.rotation.y=heading;
  const cos=Math.cos(heading),sin=Math.sin(heading);
  const toWorld=(lx,lz)=>({x:x+lx*cos+lz*sin, z:z-lx*sin+lz*cos});
  const toLocal=(wx,wz)=>{const dx=wx-x,dz=wz-z;return {x:dx*cos-dz*sin, z:dx*sin+dz*cos};};

  const site=siteSpread(toWorld,heightAt);
  const deckY=site?site.max:0;
  group.position.set(x,deckY,z);
  scene.add(group);

  // 四周一圈 1:2 以内的缓坡（D64）：先量这块地离甲板最远差多少，再定坡要放多长。
  const groundLocal=(lx,lz)=>{const w=toWorld(lx,lz);return heightAt(w.x,w.z);};
  const run=bermRunFor(deckY,groundLocal);
  const {halfX,zNeg,zPos}=padExtent(run);
  const pick=(lx,lz,terrain)=>padHeight(lx,lz,deckY,Number.isFinite(terrain)?terrain:deckY,run);

  // 0.9 × 1.5 m 一格（2.0 尺度下是 96 × 48 格）；格数跟着尺度走，放大后边坡和甲板边才不会越画越粗。
  const NX=Math.round(48*S),NZ=Math.round(24*S);
  const pad=new THREE.PlaneGeometry(halfX*2, zPos-zNeg, NX, NZ);
  pad.rotateX(-Math.PI/2);                        // plane's +Y becomes up; its x/z match ours
  pad.translate(0,0,(zPos+zNeg)/2);
  const pos=pad.attributes.position;
  for(let i=0;i<pos.count;i++){
    const lx=pos.getX(i), lz=pos.getZ(i), w=toWorld(lx,lz);
    pos.setY(i, pick(lx,lz,heightAt(w.x,w.z))-deckY);
  }
  pos.needsUpdate=true;
  pad.computeVertexNormals();
  // The pad gets its own group, anchored to the ground: the landing sequence flies `group` down
  // from altitude, and a graded site that comes down with the hull would be absurd.
  const padGroup=new THREE.Group();
  padGroup.name='前哨场地';
  padGroup.position.set(x,deckY,z);
  padGroup.rotation.y=heading;
  scene.add(padGroup);
  const padMesh=new THREE.Mesh(pad,new THREE.MeshStandardMaterial({color:0x6d4a38,roughness:.96,metalness:0}));
  padMesh.name='graded pad';
  padMesh.receiveShadow=true;
  padGroup.add(padMesh);

  // 坡道两侧的回填土坡（D63）：高度规则在 rampFillHeight，floorAt 用同一个函数。
  // 单独一块细网格，0.25 m 一格；平整场地那张 0.9 × 1.5 m 一格，贴不住坡道边。
  // 土坡以外的顶点压到甲板下面 5 cm，由场地盖住，免得两层在同一高度闪烁。
  const rise=entryRampHeight(0,2.20*S);
  const fx0=1.28*S, fx1=RAMP_SHOULDER+rise/FILL_SLOPE, fz0=2.20*S-rise/FILL_SLOPE, fz1=5.80*S;
  for(const side of [-1,1]){
    const g=new THREE.PlaneGeometry(fx1-fx0,fz1-fz0,Math.ceil((fx1-fx0)/.25),Math.ceil((fz1-fz0)/.25));
    g.rotateX(-Math.PI/2);
    g.translate(side*(fx0+fx1)/2,0,(fz0+fz1)/2);
    const q=g.attributes.position;
    for(let i=0;i<q.count;i++){const h=rampFillHeight(q.getX(i),q.getZ(i));q.setY(i,h>0?h:-.05);}
    q.needsUpdate=true;
    g.computeVertexNormals();
    const fill=new THREE.Mesh(g,padMesh.material);
    fill.name=`ramp fill ${side<0?'-X':'+X'}`;
    fill.castShadow=fill.receiveShadow=true;
    padGroup.add(fill);
  }

  /** Ground height on the pad, in world space; null away from it, so callers fall through to the
   * scene's own terrain. Matches the pad mesh vertex for vertex. */
  function floorAt(wx,wz){
    const p=toLocal(wx,wz);
    if(Math.abs(p.x)>halfX||p.z<zNeg||p.z>zPos)return null;
    const terrain=heightAt(wx,wz);
    return siteFloor(p.x,p.z,deckY,Number.isFinite(terrain)?terrain:deckY,run);
  }

  let ready=false,error=null,tris=0,railTris=0,footprint=null;
  const promise=new GLTFLoader().loadAsync(OUTPOST_URL).then(({scene:model})=>{
    model.name='outpost shell';
    // outpost.glb 按 1.4 导出；游戏尺度是 OUTPOST_SCALE（D61 放大），差的这一截在这里补上。
    model.scale.setScalar(OUTPOST_SCALE/GLB_SCALE);
    // 拆掉坡道扶手（D63）：两侧有了土坡，扶手只剩挡路
    railTris=stripRampRails(model);
    // 居住舱端头的大观景窗（D61）和正面的全景落地窗（D77）：在模型自身尺度下裁掉壳体、装窗框，
    // 下面的阴影/玻璃规则一起生效
    cutOutpostWindows(model);
    model.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=o.receiveShadow=true;
      for(const m of (Array.isArray(o.material)?o.material:[o.material])){
        if(m.name.startsWith('Glass.')){
          m.depthWrite=false;
          // Alpha glass must not cast the opaque silhouette used by the main shadow pass.
          o.castShadow=false;
        }
      }
      const g=o.geometry;
      tris+=g.index?g.index.count/3:g.attributes.position.count/3;
    });
    group.add(model);
    footprint=hullFootprint(meshesIn(model,group));
    ready=true;
    onReady?.(group);
    return group;
  }).catch(e=>{error=e;console.error('Failed to load outpost.glb',e);throw e;});

  function blocked(wx,wz){
    if(!ready)return false;
    const p=toLocal(wx,wz);
    return footprint.blocked(p.x,p.z);
  }

  function distance(wx,wz){
    const p=toLocal(wx,wz);
    return distanceToHull(p.x,p.z);
  }

  const sockets={};
  for(const [id,s] of Object.entries(SOCKETS)){
    const p=toWorld(s.x,s.z);
    sockets[id]={...p, y:floorAt(p.x,p.z)??heightAt(p.x,p.z)};
  }

  return {
    group, padGroup, sockets, blocked, distance, floorAt, promise, deckY,
    get ready(){return ready;}, get error(){return error;},
    get metrics(){return {triangles:tris, length:OUTPOST_LENGTH, width:OUTPOST_WIDTH,
      height:OUTPOST_HEIGHT, deckY, siteSpread:site?+site.spread.toFixed(2):null, bermRun:+run.toFixed(2),
      railTrianglesRemoved:railTris};},
    get footprint(){return footprint;},
    moduleAt(wx,wz){const p=toLocal(wx,wz);return moduleAtLocal(p.x,p.z);},
    dispose(){for(const g of [group,padGroup]){g.removeFromParent();g.traverse(o=>{if(o.isMesh)o.geometry?.dispose();});}},
  };
}

/** 从并好的 GLB 网格里按三角形删掉坡道扶手，认法见 isRampRailTriangle。返回删掉的三角形数。 */
function stripRampRails(model){
  let removed=0;
  const a=[0,0,0],b=[0,0,0],c=[0,0,0];
  model.traverse(o=>{
    if(!o.isMesh||!o.geometry.index)return;
    const P=o.geometry.attributes.position,I=o.geometry.index.array,keep=[];
    const at=(v,i)=>{v[0]=P.getX(i)/GLB_SCALE;v[1]=P.getY(i)/GLB_SCALE;v[2]=P.getZ(i)/GLB_SCALE;};
    for(let t=0;t<I.length;t+=3){
      at(a,I[t]);at(b,I[t+1]);at(c,I[t+2]);
      if(isRampRailTriangle(o.material.name,a,b,c)){removed++;continue;}
      keep.push(I[t],I[t+1],I[t+2]);
    }
    if(keep.length<I.length)o.geometry.setIndex(keep);
  });
  return removed;
}

/** 壳体各网格的顶点和「到前哨仓局部坐标」的矩阵，喂给 hullFootprint。 */
function meshesIn(model,group){
  group.updateMatrixWorld(true);
  const toGroup=new THREE.Matrix4().copy(group.matrixWorld).invert(),out=[];
  model.traverse(o=>{
    if(!o.isMesh)return;
    const g=o.geometry;
    out.push({position:g.attributes.position.array,index:g.index?.array??null,
      matrix:new THREE.Matrix4().multiplyMatrices(toGroup,o.matrixWorld).elements});
  });
  return out;
}
