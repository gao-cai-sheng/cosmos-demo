// 居住舱端头大观景窗的规则和裁剪算法，里面没有渲染器，可以直接拿 node --test 跑。
// outpost-window.js 负责把它用到真网格上并装窗框。拆法同 outpost-interior-layout.js / outpost-interior.js。
//
// 为什么开在这里（D61）：站在居住舱里沿舱看，视线天然落在 -X 端头；端头是一块约 4 × 4 m 的平板，
// 外面本来就有一圈金属边框、里面有一圈内框。窗洞开在两圈框里面，框直接当窗框用。窗朝前哨仓局部 -X，
// 游戏里前哨仓朝向 -π/2，窗朝世界 -Z，指南针上是正北（000°），看出去是平原和地平线。
//
// 为什么在加载后剪：outpost.glb 按材质合并成 6 个网格，端头平板不是单独零件，没法整块摘掉。
// 所以把平板在窗洞范围里的三角形精确裁掉（跨边的三角形切开，只去掉洞里那一块），再补窗套盖住
// 外皮和内皮之间 0.45 m 的缝、四角切成八边形、装玻璃。GLB 本身不动。
//
// 数字都在 GLB 自身尺度（1.4）下，和 outpost-interior-layout.js 的约定一样；模型根节点放大 K 倍时
// 窗框作为它的子节点一起放大。端板实测：旧外皮 x≈-22.99，内皮 x≈-22.68，旧窗底横梁 y≈2.3~2.5；
// 在 y≈2.0、z≈-0.6..0 有更靠舱内的壳体细节（x≈-22.08）。新落地窗必须连它一起精确裁掉，
// 才能从观景步台看到整片无遮拦的玻璃。下缘 y=1.96 对齐步台端 y=1.95（游戏尺度约 2.79 m），
// 留 0.06 m 的窗台/气密压条；上缘仍在端板顶部原外框内，四角加大切角避开壳体弧面。

import {OUTPOST_SCALE,GLB_SCALE} from './outpost-layout.js';

// 游戏尺度相对 GLB 实测尺度的倍数。和 outpost-interior-layout.js 的 K 是同一个数；这里自己算，
// 是因为舱内布局要反过来读落地窗的位置（窗前铺板、放人走过去），两个文件不能互相 import。
const K = OUTPOST_SCALE/GLB_SCALE;

export const VIEW_WINDOW = Object.freeze({
  x0:-23.22, x1:-21.84,          // 穿过旧外框、内框及窗底中央细节；只裁端头这一段壳体
  y0:1.96,  y1:5.32,             // 玻璃洞高 3.36（2.0 尺度 4.80 m，6.0 尺度 14.4 m），底边紧贴观景步台端
  z0:-1.95, z1:1.08,             // 宽 3.03（2.0 尺度 4.33 m，6.0 尺度 13.0 m）；覆盖旧窗两侧边框
  outer:-23.10, inner:-21.90,    // 加深连续窗套，封住原端板和切开的内部细节
  pane:-22.77,                   // 层压承压玻璃在外皮和内皮之间
  jamb:.065,                     // 窗楣和两侧窗套的厚度，跟壳体一起放大（6.0 尺度约 0.28 m）
  sill:.05/K,                    // 窗台/气密压条：真实厚度 0.05 m，不跟壳体放大（D69）——人站在步台上，
                                 // 玻璃要一直落到脚边；跟着放大的话 6.0 尺度下是一道 0.32 m 的坎
  chamfer:.50,                   // 四角切角避开端板弧面，跟壳体一起放大
});

// 居住舱正面（+Z，坡道一侧）的全景落地窗（D77）。
//
// 为什么改：refine.py 给居住舱正面开了一大一小两扇舷窗，是按 1.4 尺度设计的——大的那扇窗台离甲板
// 1.0 m。壳体放大到 6.0（D69）以后同一个窗台离地 4.3 m，窗顶 15 m：人站在舱里只能看到一堵墙，
// 窗在头顶上。用户原话「现在的情况是太高了，我希望是落地，变成全景落地窗」。
//
// 做法和端窗一样，加载后裁、GLB 不动：把旧窗（外框、密封条、玻璃、内衬、四颗紧固件）连同窗下
// 那一截墙一起裁掉，窗洞一直落到甲板。实测（1.4 尺度，沿 +Z 打射线）：这面墙从甲板到 y≈5.5 是平的，
// 内皮 z=2.39~2.47、外皮 2.59、立面板 2.56~2.72，旧窗框凸到 2.93、紧固件到 2.99；y>5.5 才开始往里收。
// 所以窗洞可以直着落到地上，不用像端窗那样四角都切。
//   · 宽：旧外框 x ∈ [-20.75,-17.19]。左边 -20.88 是立面竖向基准条，右边 -16.86 是生保换热器的框，
//     窗洞开在两者之间（-20.80 ~ -17.00），旧窗整个落在洞里，两边的零件一个不碰。
//   · 高：上缘 5.42 刚盖过旧外框顶（5.39），仍在墙面平的那一段里，也和右边百叶的上沿齐平。
//     下缘开到甲板（1.75）下面一点：窗台和窗楣、两侧窗套一样厚，从舱外看四边是一圈等宽的框；
//     窗台顶面仍只比甲板高 0.09 m，人在舱里看玻璃还是落到脚边。
//   · 四个角都是圆角。第一版只切了上面两个角、下面是直角，窗台又只有一道 5 cm 的压条，
//     从舱外看上重下轻——用户原话「窗子上下不对称，有点难看」。
//   · 玻璃放在内皮这一层（2.44）而不是墙厚中间：人能走到的最远处是窗套内沿，玻璃靠里，
//     站在窗前离玻璃不到 1 m；外面留一圈深窗套。
// 小的那扇工作窗没动：它右边贴着立面板的收边和舱段收口，落到地上会切进收口的弧面。
export const FLOOR_WINDOW = Object.freeze({
  name:'floor window',
  axis:'z',                      // 窗朝 +Z；outer / inner / pane 是 z
  x0:-20.80, x1:-17.00,          // 宽 3.80（6.0 尺度 16.3 m）
  y0:1.7067, y1:5.42,            // 高 3.71（6.0 尺度 15.9 m）；窗台顶面 1.7717，甲板上 0.09 m
  z0:2.20,  z1:3.05,             // 穿过内皮、外皮、立面板、旧窗框和紧固件
  outer:2.80, inner:2.36,        // 窗套：里面比内皮略凸，外面比立面板凸 0.08
  pane:2.44,
  jamb:.065,                     // 跟壳体放大（6.0 尺度约 0.28 m），和端窗一样
  sill:.065,                     // 和窗楣一样厚；多出来的厚度在甲板下面
  fillet:.25,                    // 四个角一样的圆角（6.0 尺度约 1.07 m），从窗框内沿量
});

/** 所有加载后开的窗，outpost-window.js 按这张表逐个裁。 */
export const OUTPOST_WINDOWS = Object.freeze([VIEW_WINDOW,FLOOR_WINDOW]);

const lerp=(p,q,s)=>({x:p.x+(q.x-p.x)*s,y:p.y+(q.y-p.y)*s,z:p.z+(q.z-p.z)*s,
                      w:p.w.map((v,i)=>v+(q.w[i]-v)*s)});
/** Sutherland–Hodgman，按一条轴向半平面裁多边形；less=true 留下 axis ≤ v 的一侧。 */
function clip(poly,axis,v,less){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length];
    const pin=less?p[axis]<=v:p[axis]>=v, qin=less?q[axis]<=v:q[axis]>=v;
    if(pin)out.push(p);
    if(pin!==qin)out.push(lerp(p,q,(v-p[axis])/(q[axis]-p[axis])));
  }
  return out;
}
const area3=(a,b,c)=>{
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
};
const valid=poly=>poly.length>=3&&poly.slice(1,-1).some((p,i)=>area3(poly[0],p,poly[i+2])>1e-9);

/** 三角形精确减去窗洞的 x/y/z 长方体。旧端板下方有斜面和横梁；仅按 y-z 投影丢整片侧面
 * 会留下遮挡或把洞外几何一同删掉。六个半平面逐次分离洞外区域，三角面绕序保持不变。 */
function subtractBox(tri,W){
  let inside=[tri];const outside=[];
  for(const [axis,v,less] of [['x',W.x0,false],['x',W.x1,true],['y',W.y0,false],
                              ['y',W.y1,true],['z',W.z0,false],['z',W.z1,true]]){
    const next=[];
    for(const poly of inside){
      const beyond=poly.some(p=>less?p[axis]>v+1e-9:p[axis]<v-1e-9);
      const out=clip(poly,axis,v,!less),keep=clip(poly,axis,v,less);
      if(beyond&&valid(out))outside.push(out);
      if(valid(keep))next.push(keep);
    }
    inside=next;
    if(!inside.length)break;
  }
  return outside;
}

/** 在一份三角网格上把窗洞裁掉。mesh = {attributes:{name:{array,itemSize}}, index:数组或 null}，
 * position 必须在里面。端板、旧横梁、斜面均按三维窗洞精确切开。
 * 新顶点的所有属性按重心坐标插值，normal 重新归一。返回 {attributes, index, touched}，
 * touched=0 时原样返回。 */
export function clipMesh(mesh,W=VIEW_WINDOW){
  const names=Object.keys(mesh.attributes),src=names.map(n=>mesh.attributes[n]);
  const P=mesh.attributes.position.array;
  const data=names.map((n,k)=>Array.from(src[k].array));
  const count=mesh.index?mesh.index.length:P.length/3;
  const index=[];let touched=0;
  const get=(k,i,c)=>src[k].array[i*src[k].itemSize+c];
  const emit=(corner,w)=>{
    const one=w.findIndex(v=>Math.abs(v-1)<1e-9);
    if(one>=0&&w.every((v,i)=>i===one||Math.abs(v)<1e-9))return corner[one];
    const at=data[0].length/src[0].itemSize;
    src.forEach((a,k)=>{
      const vals=[];
      for(let c=0;c<a.itemSize;c++)vals.push(w[0]*get(k,corner[0],c)+w[1]*get(k,corner[1],c)+w[2]*get(k,corner[2],c));
      if(names[k]==='normal'){const l=Math.hypot(...vals)||1;for(let c=0;c<vals.length;c++)vals[c]/=l;}
      data[k].push(...vals);
    });
    return at;
  };
  for(let t=0;t<count;t+=3){
    const corner=mesh.index?[mesh.index[t],mesh.index[t+1],mesh.index[t+2]]:[t,t+1,t+2];
    const [A,B,C]=corner.map(i=>({x:P[3*i],y:P[3*i+1],z:P[3*i+2]}));
    const lo=k=>Math.min(A[k],B[k],C[k]),hi=k=>Math.max(A[k],B[k],C[k]);
    if(hi('x')<W.x0||lo('x')>W.x1||hi('y')<=W.y0||lo('y')>=W.y1||hi('z')<=W.z0||lo('z')>=W.z1){index.push(...corner);continue;}
    touched++;
    const tri=[{...A,w:[1,0,0]},{...B,w:[0,1,0]},{...C,w:[0,0,1]}];
    for(const poly of subtractBox(tri,W)){
      const ids=poly.map(v=>emit(corner,v.w));
      for(let k=1;k<ids.length-1;k++)index.push(ids[0],ids[k],ids[k+1]);
    }
  }
  if(!touched)return {attributes:mesh.attributes,index:mesh.index,touched};
  const attributes={};
  names.forEach((n,k)=>{attributes[n]={array:new src[k].array.constructor(data[k]),itemSize:src[k].itemSize,normalized:!!src[k].normalized};});
  return {attributes,index,touched};
}
