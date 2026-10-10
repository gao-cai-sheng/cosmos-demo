import * as THREE from 'three';
import {mergeGeometries} from '../../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {VIEW_WINDOW,FLOOR_WINDOW,OUTPOST_WINDOWS,clipMesh} from './outpost-window-layout.js';

/** 居住舱端头的大观景窗和正面的全景落地窗：把 outpost-window-layout.js 的裁剪用到壳体网格上，
 * 再装窗套、切角和玻璃。为什么开在这里、数字从哪来，见 outpost-window-layout.js。 */
export {VIEW_WINDOW,FLOOR_WINDOW,OUTPOST_WINDOWS};

function clipGeometry(geo,W){
  const attributes={};
  for(const [n,a] of Object.entries(geo.attributes))attributes[n]={array:a.array,itemSize:a.itemSize,normalized:a.normalized};
  const out=clipMesh({attributes,index:geo.index?Array.from(geo.index.array):null},W);
  if(!out.touched)return 0;
  for(const [n,a] of Object.entries(out.attributes))geo.setAttribute(n,new THREE.BufferAttribute(a.array,a.itemSize,a.normalized));
  geo.setIndex(out.index);
  geo.computeBoundingBox();geo.computeBoundingSphere();
  return out.touched;
}

/** 柱体：poly 是 y-z 平面上的一圈点，沿 x 从 xa 拉到 xb。四角的切角（三个点）和圆角（一段弧）用。
 * poly[0] 要看得见其余所有点，两头的盖按它扇形剖分。绕序在这里统一成「从 +x 看逆时针」，
 * 四个角不管怎么镜像，正面都朝外。 */
function extrude(poly,xa,xb){
  if(xa>xb)[xa,xb]=[xb,xa];
  let area=0;
  for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p[0]*q[1]-q[0]*p[1];}
  const ring=area<0?[poly[0],...poly.slice(1).reverse()]:poly;
  const pts=[],v=(p,x)=>pts.push(x,p[0],p[1]);
  for(let i=1;i<ring.length-1;i++){
    v(ring[0],xb);v(ring[i],xb);v(ring[i+1],xb);     // +x 一头的盖
    v(ring[0],xa);v(ring[i+1],xa);v(ring[i],xa);     // -x 一头的盖
  }
  for(let i=0;i<ring.length;i++){
    const p=ring[i],q=ring[(i+1)%ring.length];
    v(p,xa);v(q,xa);v(q,xb);v(p,xa);v(q,xb);v(p,xb);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  g.computeVertexNormals();return g;
}

/** 在已加载的前哨仓壳体上开一扇窗。root 是 GLTF 的 scene（还没放大也行，窗框挂在它下面一起放大）。
 * 材质取壳体自己的：窗套和原来的框同一种金属，玻璃和其他舷窗同一种。
 * 返回 {touched, group}；touched=0 说明没找到要裁的平板（模型换了），窗框也就不装。
 *
 * 窗框在「窗洞自己的坐标」里建：进深沿 x、宽沿 z，端窗（朝 -X）直接就是这个摆法。朝 +Z 的窗
 * （W.axis==='z'）把整组绕 Y 转 -90°，转完 x→z、z→-x，所以它的宽度范围取 [-x1,-x0]。 */
export function cutViewWindow(root,W=VIEW_WINDOW){
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  let touched=0;
  for(const m of meshes)touched+=clipGeometry(m.geometry,W);
  const name=W.name||'view window';
  const group=new THREE.Group();group.name=name;
  if(!touched)return {touched,group};
  const mat=n=>meshes.find(m=>m.material?.name===n)?.material;
  const metal=mat('Metal.machined')||new THREE.MeshStandardMaterial({color:0x40494f,roughness:.45,metalness:.6});
  const glass=mat('Glass.clear-pressure-pane')||new THREE.MeshStandardMaterial({name:'Glass.view-window',color:0x70b0c2,transparent:true,opacity:.16,roughness:.05});
  const side=W.axis==='z',[w0,w1]=side?[-W.x1,-W.x0]:[W.z0,W.z1];
  if(side)group.rotation.y=-Math.PI/2;
  const depth=Math.abs(W.inner-W.outer),cx=(W.outer+W.inner)/2,T=W.jamb;
  const wide=w1-w0,tall=W.y1-W.y0,cy=(W.y0+W.y1)/2,cz=(w0+w1)/2;
  // 窗台、窗楣、两侧窗套和四个角并成一个网格：一次绘制
  const parts=[];
  const box=(y,z,h,w)=>parts.push(new THREE.BoxGeometry(depth,h,w).translate(cx,y,z).toNonIndexed());
  box(W.y0+W.sill/2,cz,W.sill,wide);// 窗台：端窗是真实厚度（不跟壳体放大）；落地窗和窗楣一样厚
  box(W.y1-T/2,cz,T,wide);          // 窗楣
  box(cy,w0+T/2,tall,T);            // 两侧窗套
  box(cy,w1-T/2,tall,T);
  // 四个角一样处理，上下左右对称。端窗是切角，从窗洞的角切；落地窗是圆角（W.fillet），
  // 从窗框内沿的角起一段弧，和同一面墙上的百叶、检修口、小窗的圆角是一个路数。
  const N=8;
  for(const [sy,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    if(W.fillet){
      const r=W.fillet,y=sy>0?W.y0+W.sill:W.y1-T,z=sz>0?w0+T:w1-T,poly=[[y,z]];
      for(let i=0;i<=N;i++){const a=i/N*Math.PI/2;poly.push([y+sy*r*(1-Math.sin(a)),z+sz*r*(1-Math.cos(a))]);}
      parts.push(extrude(poly,W.outer,W.inner));
    }else{
      const c=W.chamfer,y=sy>0?W.y0:W.y1,z=sz>0?w0:w1;
      parts.push(extrude([[y,z],[y+sy*c,z],[y,z+sz*c]],W.outer,W.inner));
    }
  }
  for(const g of parts)g.deleteAttribute('uv');
  const frame=new THREE.Mesh(mergeGeometries(parts,false),metal);frame.name=name+'.frame';group.add(frame);
  for(const g of parts)g.dispose();
  const pane=new THREE.Mesh(new THREE.PlaneGeometry(wide,tall),glass);
  pane.name=name+'.pane';pane.rotation.y=Math.PI/2;pane.position.set(W.pane,cy,cz);
  group.add(pane);
  if(glass.side!==THREE.DoubleSide){const back=pane.clone();back.rotation.y=-Math.PI/2;group.add(back);}
  root.add(group);
  return {touched,group};
}

/** 把 OUTPOST_WINDOWS 里的窗全开出来。游戏和检查页都走这一个入口，窗的清单只有一份。 */
export function cutOutpostWindows(root,windows=OUTPOST_WINDOWS){
  return windows.map(W=>cutViewWindow(root,W));
}
