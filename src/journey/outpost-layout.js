// Outpost geometry with no renderer in it, so the rules can be tested directly.
// Same split as walking.js / astronaut.js and power.js / power-world.js.
// All coordinates are the outpost's own local frame: +X along the string of modules,
// +Z out the ramp side, y=0 at the footpads.

/** Module extents along local X, in metres, as normalize.py cut them from the mesh profile.
 * `half` is the half-width in Z the module's body occupies (the hub is widest and carries the
 * ramp; the tunnels are a 2.3 m tube slung 1.4 m off the ground). */
/** 成品尺度。模型的设计常量一律按 1 m = 1 m 写，blender/outpost-hy3d/refine.py 在导出前
 * 整体等比例放大一次。放大的理由是实测出来的：压力连廊玻璃管内半径 1.216 m、地板在 y=1.96，
 * 净高只有 2.10 m、净宽 1.68 m，1.9 m 的宇航员过去头顶只剩 0.2 m。舱段本身不小，瓶颈是连廊，
 * 但连廊和舱段的比例是造型的一部分，所以整体放大而不是单独撑大连廊。
 * 这里保留「设计值 * S」的写法，是为了和 refinement.spec.md 里的数字一眼对得上。
 *
 * GLB 仍按 1.4 导出（GLB_SCALE），游戏里再整体放大到 OUTPOST_SCALE：1.4 时舱段甲板只有约 5 m 宽，
 * 两边各贴一排家具就剩 2 m 过道，全舱平均可走宽度约 1.6 m，走进去像火车车厢（D61）。2.0 时舱段
 * 内径约 8.9 m，和星舰的 9 m 直径相当。人、家具、门、扶手不跟着放大，见 outpost-interior-layout.js。
 *
 * D69 再放大三倍到 6.0：全长 198 m、最宽 44 m、高 35 m。理由是外观比例——NX07 长 128 m、宽 111 m，
 * 66 m 的前哨仓停在它旁边像个附属件。舱段内径约 27 m。摆位见文件末尾的 HOME_SITE。 */
export const GLB_SCALE=1.4;
export const OUTPOST_SCALE=6.0;
const S=OUTPOST_SCALE;

export const MODULES=[
  {id:'living', name:'居住舱',        x0:-16.50*S, x1:-6.157*S, half:2.55*S},
  {id:'west',   name:'西通道',        x0:-6.157*S, x1:-3.394*S, half:1.20*S},
  {id:'hub',    name:'气闸舱',        x0:-3.394*S, x1: 3.470*S, half:3.10*S},
  {id:'east',   name:'东通道',        x0: 3.470*S, x1: 6.232*S, half:1.20*S},
  {id:'lab',    name:'设备舱 · 化验室',x0: 6.232*S, x1:16.50*S, half:2.55*S},
];

export const OUTPOST_LENGTH=33.0*S, OUTPOST_WIDTH=7.374*S, OUTPOST_HEIGHT=5.818*S;

// Refined entry deck; independent of the site's earthwork approach. Metres above footpad datum.
export function entryRampHeight(x,z){
  if(Math.abs(x)>1.28*S||z<2.20*S||z>5.80*S)return null;
  // 高度也是等比例的：S*f(z/S) 化开之后分母不变，只有截距和端点跟着放大。
  return z<=5.50*S ? .08*S+(5.50*S-z)/3.30 : .08*(5.80*S-z)/.30;
}

/** 坡道两侧的回填土坡（D63）。原来坡道架空、两边装扶手，人只能从坡脚正对舱门走上去；
 * 坡道边一步就差 0.16~2.16 m，`walkStep` 上下都不让过，拆了扶手也还是一堵空气墙。
 * 真实工地的做法是把坡道两侧用土填起来：土肩和坡面齐平、盖住边梁，再按 1:2 放坡落回场地。
 * 这样从正面、侧面、斜着都能走上坡道。1:2 约 26.6°，低于 walking.js 的 32° 上限。
 * 只在场地平台（PAD_APRON 以内）上起坡，所以高度是相对甲板的，和地形无关。 */
export const RAMP_SHOULDER=1.45*S;   // 土肩半宽：坡道面 1.28，边梁外缘 1.445
export const FILL_SLOPE=.5;          // 放坡 1:2

export function rampFillHeight(x,z){
  const top=2.20*S, dx=Math.max(0,Math.abs(x)-RAMP_SHOULDER);
  // 坡面沿 z 的升幅（1/3.3）比放坡缓，所以侧面每一点离它最近的就是同一 z 处的坡道边；
  // 坡道顶以里（舱门方向）按锥面落下，埋进气闸舱底下。
  const h=z>=top ? (entryRampHeight(0,z)??0)-FILL_SLOPE*dx
                 : entryRampHeight(0,top)-FILL_SLOPE*Math.hypot(dx,top-z);
  return h>0?h:0;
}

/** 人在前哨仓附近脚下的高度（相对甲板）：坡道面优先，其次回填土坡，其余是平整场地。 */
export function walkFloorLocal(x,z){
  return entryRampHeight(x,z)??rampFillHeight(x,z);
}

/** 扶手和边梁（D63 拆除）。refine.py 在坡道两侧 x=±1.37 装了立柱、扶手、中栏、柱脚和一根边梁，
 * 并进 GLB 后和壳体同一个网格，只能按三角形认出来。认法照 refine.py 的尺寸：材质 + 三个顶点都落在
 * 那根杆的体积里。只看质心会误伤——舱门两侧的壳体正好穿过第一根立柱，那几片 Coating/Seal 三角形
 * 质心也在柱子上。边梁也拆：它在坡脚比坡面高 17 cm，土肩盖不住，冒出来就是一道绊脚的坎。
 * 坐标用设计尺度（GLB 坐标 / GLB_SCALE）。坡道下的支腿留着，埋在土里。 */
const RAIL_X=1.37, RAIL_POSTS=[2.26,3.76,5.24];
const HANDRAIL=[[2.18,2.10],[5.53,1.07]], MIDRAIL=[[2.21,1.60],[5.50,.59]];   // (z,y) 两端
const STRINGER=[[2.16,1.02],[5.49,.095]];
const rampDeckDesign=z=>.08+(5.50-z)/3.30;
function segDistance(z,y,[[z0,y0],[z1,y1]]){
  const dz=z1-z0,dy=y1-y0,t=Math.max(0,Math.min(1,((z-z0)*dz+(y-y0)*dy)/(dz*dz+dy*dy)));
  return Math.hypot(z-z0-t*dz,y-y0-t*dy);
}
export function isRampRailTriangle(material,a,b,c){
  const v=[a,b,c],all=f=>v.every(f);
  if(!all(([x])=>Math.abs(Math.abs(x)-RAIL_X)<=.09))return false;
  if(material==='Marking.ochre'&&all(([,y,z])=>segDistance(z,y,HANDRAIL)<=.05))return true;
  if(material==='Metal.machined'&&all(([,y,z])=>segDistance(z,y,MIDRAIL)<=.03))return true;
  if(material==='Metal.machined'&&all(([,y,z])=>segDistance(z,y,STRINGER)<=.08))return true;
  for(const pz of RAIL_POSTS){
    const deck=rampDeckDesign(pz);
    if(material==='Metal.machined'&&all(([x,y,z])=>Math.hypot(Math.abs(x)-RAIL_X,z-pz)<=.042&&y>=deck-.01&&y<=deck+1.0))return true;
    if(material==='Coating.warm-ceramic'&&all(([,y,z])=>Math.abs(z-pz)<=.086&&y>=deck-.056&&y<=deck+.026))return true;
  }
  return false;
}

/** 走路的人，和 mobility.js 的 EVA_RADIUS / EVA_HEIGHT 同一组数。 */
export const WALKER=Object.freeze({radius:.35,height:1.95});

/** 按壳体真实网格算出的占地图，替掉原来按舱段画的矩形（D63）。
 *
 * 矩形比壳体大一圈：气闸舱门前两侧、舱段圆角、两条连廊底下（连廊底离地 2.46 m，人走得过去）
 * 一共约 110 m² 是空气墙；反过来舱段背面的支架伸出矩形，人能穿过去。现在只看人身高度内有没有东西：
 * 每个三角形按半格间距撒点，落在「脚下地面 +0.12 m ~ 头顶」之间的格子记为实心，再按人的半径膨胀一圈。
 * 脚下地面用 walkFloorLocal，所以坡道和土坡上的人也按自己站的高度算。
 *
 * meshes：[{position, index?, matrix?}]，position 是 xyz 连续数组；matrix 是 16 位列主序
 * （three 的 Matrix4.elements），把顶点换到前哨仓局部坐标（米）。不传就当已经是局部坐标。 */
export function hullFootprint(meshes,{cell=.25,radius=WALKER.radius,head=WALKER.height,floor=walkFloorLocal}={}){
  const low=.12, top=entryRampHeight(0,2.20*S)+head;   // 最高的地面是坡道顶
  // 网格罩住整个壳体外加 1 m：背面支架伸到 z=-OUTPOST_WIDTH/2，+Z 到坡脚 5.8S。
  const pad=1+radius+cell;
  const x0=-OUTPOST_LENGTH/2-pad, z0=-OUTPOST_WIDTH/2-pad;
  const w=Math.ceil((OUTPOST_LENGTH+2*pad)/cell), h=Math.ceil((5.80*S+pad-z0)/cell);
  const solid=new Uint8Array(w*h);
  const A=[0,0,0],B=[0,0,0],C=[0,0,0];
  for(const {position:P,index:I,matrix:M} of meshes){
    const put=(o,i)=>{
      const x=P[i*3],y=P[i*3+1],z=P[i*3+2];
      if(!M){o[0]=x;o[1]=y;o[2]=z;return;}
      o[0]=M[0]*x+M[4]*y+M[8]*z+M[12];o[1]=M[1]*x+M[5]*y+M[9]*z+M[13];o[2]=M[2]*x+M[6]*y+M[10]*z+M[14];
    };
    const n=I?I.length:P.length/3;
    for(let t=0;t<n;t+=3){
      put(A,I?I[t]:t);put(B,I?I[t+1]:t+1);put(C,I?I[t+2]:t+2);
      if(Math.max(A[1],B[1],C[1])<low||Math.min(A[1],B[1],C[1])>top)continue;
      const e1x=B[0]-A[0],e1y=B[1]-A[1],e1z=B[2]-A[2],e2x=C[0]-A[0],e2y=C[1]-A[1],e2z=C[2]-A[2];
      const k=Math.max(1,Math.ceil(Math.max(Math.hypot(e1x,e1y,e1z),Math.hypot(e2x,e2y,e2z))/(cell/2)));
      for(let i=0;i<=k;i++)for(let j=0;j<=k-i;j++){
        const u=i/k,v=j/k,x=A[0]+e1x*u+e2x*v,y=A[1]+e1y*u+e2y*v,z=A[2]+e1z*u+e2z*v;
        const gx=Math.floor((x-x0)/cell),gz=Math.floor((z-z0)/cell);
        if(gx<0||gx>=w||gz<0||gz>=h||solid[gz*w+gx])continue;
        const f=floor(x,z);
        if(y>=f+low&&y<=f+head)solid[gz*w+gx]=1;
      }
    }
  }
  // 按人的半径膨胀：人站的点离实心格中心不到 radius+半格，就算碰上。
  const reach=radius+cell/2, r=Math.ceil(reach/cell), cells=new Uint8Array(w*h), ring=[];
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(Math.hypot(dx,dz)*cell<=reach)ring.push([dx,dz]);
  for(let gz=0;gz<h;gz++)for(let gx=0;gx<w;gx++){
    if(!solid[gz*w+gx])continue;
    for(const [dx,dz] of ring){const x=gx+dx,z=gz+dz;if(x>=0&&x<w&&z>=0&&z<h)cells[z*w+x]=1;}
  }
  return {cell,x0,z0,w,h,cells,
    blocked(x,z){
      const gx=Math.floor((x-x0)/cell),gz=Math.floor((z-z0)/cell);
      return gx>=0&&gx<w&&gz>=0&&gz<h&&cells[gz*w+gx]===1;
    }};
}

/** Where a walking astronaut is meant to end up. The ramp comes off the hub on +Z; `approach`
 * stands clear of it, `ramp` is the foot of the ramp itself. Every socket stays inside PAD_APRON
 * so it is on level deck — one metre further out and `approach` would sit on the graded slope.
 * Doors are not modelled yet, so these are stand-ins that later interior work replaces. */
export const SOCKETS={
  ramp:     {x:0,      z:5.6*S},
  approach: {x:0,      z:8.2*S},
  lab:      {x:11.4*S, z:4.6*S},
  living:   {x:-11.4*S,z:4.6*S},
};

export const PAD_MARGIN=2.4*S;   // deck extends this far beyond the hull footprint
export const PAD_APRON=9.0*S;    // and this far out on +Z, to carry the ramp
export const BERM=3.2*S;         // shortest run of the fill slope around the deck
export const BERM_GRADE=.5;      // steepest it may get: 1:2, about 26.6 degrees, same as the ramp fill
export const BERM_MAX=4*BERM;    // longest run; a site that needs more is not one to build on

const PAD_HALF_LEN=OUTPOST_LENGTH/2+PAD_MARGIN, PAD_HALF_WID=OUTPOST_WIDTH/2+PAD_MARGIN;

/** 首次着陆点上的摆位，场景坐标（D69）。锚点是地基朝飞船那一侧的边缘 x=-12：D61 放大到 2.0 时
 * 它就在这里（中心 6 - PAD_APRON 18）。前哨仓再放大，中心沿背离飞船的方向后退，NX07 的停机位不动，
 * 两者之间那 40 m 空地（landing-support.js 的 ARRIVAL_BASE，从同一条边往西量）也就不变。
 * 舱门朝西（局部 +Z → 世界 -X），正对 NX07 落地、乘员下船的方向。 */
export const HOME_APRON_EDGE_X=-12;
export const HOME_SITE=Object.freeze({x:HOME_APRON_EDGE_X+PAD_APRON, z:-25, heading:-Math.PI/2});

/** Metres from a local point to the level deck; 0 on it. */
function distanceToDeck(lx,lz){
  const dx=Math.max(0,Math.abs(lx)-PAD_HALF_LEN), dz=Math.max(0,lz-PAD_APRON,-lz-PAD_HALF_WID);
  return Math.hypot(dx,dz);
}

/** Height of the graded pad, in the outpost's local frame.
 *
 * One continuous fill slope all round the level deck, the same on every side (D64). It used to be
 * steep on three sides with a single 16 m graded approach on +Z, and the two were separate formulas:
 * beside the approach the revetment had already reached the ground while the approach was still up
 * near deck height, so both sides of the approach were a vertical step of up to 0.77 of the drop —
 * drawn by the coarse pad mesh as a small bank, walked as a wall, too tall even to jump. The player
 * was also meant to be able to reach the outpost from any direction (D63), and one way up is not that.
 *
 * `run` is how far out the slope goes; `bermRunFor` picks it per site so the slope never passes 1:2.
 * `walking.js` caps a step at 32 degrees and `walkStep` freezes on anything steeper, in both directions,
 * so the grade is a hard limit, not a look. */
export function padHeight(lx,lz,deckY,groundY,run=BERM){
  const d=distanceToDeck(lx,lz);
  if(d>=run)return groundY;
  return deckY+(groundY-deckY)*(d/run);
}

/** Points round the deck edge pushed out by `offset`: along each side and round each corner. */
function deckRing(offset,step=3){
  const pts=[];
  for(let x=-PAD_HALF_LEN;x<=PAD_HALF_LEN;x+=step)pts.push({x,z:PAD_APRON+offset},{x,z:-PAD_HALF_WID-offset});
  for(let z=-PAD_HALF_WID;z<=PAD_APRON;z+=step)pts.push({x:PAD_HALF_LEN+offset,z},{x:-PAD_HALF_LEN-offset,z});
  for(const [sx,cz,sz] of [[1,PAD_APRON,1],[-1,PAD_APRON,1],[1,-PAD_HALF_WID,-1],[-1,-PAD_HALF_WID,-1]])
    for(const a of [Math.PI/8,Math.PI/4,3*Math.PI/8])
      pts.push({x:sx*(PAD_HALF_LEN+offset*Math.cos(a)),z:cz+sz*offset*Math.sin(a)});
  return pts;
}

/** How far the fill slope has to run on this site to stay at 1:2. `groundAt(lx,lz)` is the natural
 * ground in the outpost's local frame. The deck sits on the footprint's high point, so the ground
 * round it is mostly lower; the drop is measured halfway out and at the foot of the slope being
 * tried, and the slope is lengthened until it covers it. Default plain: 0.9 m, so BERM (about 8
 * degrees). A 6 m valley cut: 12 m. */
export function bermRunFor(deckY,groundAt){
  let run=BERM;
  for(let pass=0;pass<4;pass++){
    let worst=0;
    for(const f of [.5,1])for(const p of deckRing(run*f)){
      const g=groundAt(p.x,p.z);
      if(Number.isFinite(g))worst=Math.max(worst,Math.abs(g-deckY));
    }
    const next=Math.min(BERM_MAX,Math.max(BERM,worst/BERM_GRADE));
    if(next<=run+1e-6)break;
    run=next;
  }
  return run;
}

/** Walking height anywhere on the outpost's site, in the same y as deckY: the ramp, then the earth
 * banked against it, then the graded pad. outpost-model's floorAt and the tests share this. */
export function siteFloor(lx,lz,deckY,groundY,run=BERM){
  const entry=entryRampHeight(lx,lz);
  if(entry!==null)return deckY+entry;
  const fill=rampFillHeight(lx,lz);
  if(fill>0)return deckY+fill;
  return padHeight(lx,lz,deckY,groundY,run);
}

/** Extent of the pad mesh in local space, so the renderer and `floorAt` agree on where it stops. */
export const padExtent=(run=BERM)=>({
  halfX: PAD_HALF_LEN+run,
  zNeg: -(PAD_HALF_WID+run),
  zPos: PAD_APRON+run,
});

/** Which module covers a local point, or null. Names the module for the HUD; walking collision
 * no longer uses these rectangles (they overhang the hull, see hullFootprint). */
export function moduleAtLocal(lx,lz){
  return MODULES.find(m=>lx>=m.x0&&lx<=m.x1&&Math.abs(lz)<=m.half)||null;
}

/** Metres from a local point to the hull footprint; 0 inside it. */
export function distanceToHull(lx,lz){
  let best=Infinity;
  for(const m of MODULES){
    const dx=Math.max(m.x0-lx,0,lx-m.x1);
    const dz=Math.max(-m.half-lz,0,lz-m.half);
    best=Math.min(best,Math.hypot(dx,dz));
  }
  return best;
}

/** How much a 33 x 7.4 m hull would overhang if it sat on this ground: the height spread across its
 * footprint plus the ramp apron. `heightAt` takes world coordinates; `toWorld` maps local to world.
 * Used to judge a site — and, in the survey step later, to tell the player why one will not do. */
export function siteSpread(toWorld,heightAt){
  const vals=[];
  for(let lx=-OUTPOST_LENGTH/2;lx<=OUTPOST_LENGTH/2;lx+=2.75)
    for(let lz=-OUTPOST_WIDTH/2;lz<=PAD_APRON;lz+=1.85){
      const p=toWorld(lx,lz);const y=heightAt(p.x,p.z);
      if(Number.isFinite(y))vals.push(y);
    }
  if(!vals.length)return null;
  const max=Math.max(...vals),min=Math.min(...vals);
  return {max,min,spread:max-min};
}

export const mapping=(x,z,heading)=>{
  const cos=Math.cos(heading),sin=Math.sin(heading);
  return (lx,lz)=>({x:x+lx*cos+lz*sin, z:z-lx*sin+lz*cos});
};

/** Pick where the outpost stands, by measuring instead of hard-coding a spot that only suits one
 * landing site. Heading counts as much as position — the same patch of Coprates varies from 1.5 m
 * to 4.6 m of drop depending which way the 33 m string lies — so both are swept.
 *
 * `clear` keeps it off whatever is already at the origin (refuge, cargo, power sites) — by default
 * the half-length of the string plus its deck margin, 45 m at scale 2.0, so it grows with the hull; `avoid`
 * lists extra points to stay away from. Returns the flattest candidate, and the spread it found,
 * so a caller can say how much grading this site needs. This is the measurement the player's own
 * site survey will use once the outpost becomes something they build. */
export function findSite(heightAt,{clear=OUTPOST_LENGTH/2+PAD_MARGIN+7.2,reach=2*clear,avoid=[],step=15,headings=8}={}){
  let best=null;
  for(let x=-reach;x<=reach;x+=step)for(let z=-reach;z<=reach;z+=step){
    const from=Math.hypot(x,z);
    if(from<clear||from>reach)continue;
    if(avoid.some(p=>Math.hypot(p.x-x,p.z-z)<(p.radius??30)))continue;
    for(let i=0;i<headings;i++){
      const heading=i*Math.PI/headings;            // a string is symmetric, so half a turn covers it
      const site=siteSpread(mapping(x,z,heading),heightAt);
      if(!site)continue;
      if(!best||site.spread<best.spread)best={x,z,heading,spread:site.spread,deckY:site.max};
    }
  }
  return best;
}
