// 前哨仓舱内的几何规则，里面没有渲染器，所以可以直接拿 node --test 跑。
// 和 walking.js / astronaut.js、power.js / power-world.js、outpost-layout.js / outpost-model.js
// 一样的拆法：这里定标高、可走范围和家具占地，outpost-interior.js 只负责把它们变成网格。
//
// 坐标一律是前哨仓自身的局部系：+X 沿舱段串，+Z 朝坡道一侧，y=0 在落地脚垫。
//
// 每个标高都是从 assets/models/outpost.glb 实测的，不是估的。GLB 按 1.4 导出，下面记的也是 1.4
// 尺度下量到的原数，用的时候乘 K 换到游戏尺度（D61 放大到 2.0）——这样和 refine.py、D57 里的
// 数字一眼对得上：
//   · 壳体内腹：居住舱 y=1.554、气闸舱 y=0.60、化验舱 y=0.70 —— 甲板统一放 1.75，压在最高的那处上。
//   · refine.py 的 Tunnel.floor 顶面在设计尺度 1.96，乘 1.4 是 2.744：两条压力连廊
//     比舱段地板高 0.994 m，颈部必须走坡道，一块平板糊过去会穿出壳体。
//   · 连廊颈圈（collar ring，内半径 1.652，中心 y=3.976 / z=-0.644）下沿正好落在 2.744，
//     低于这个高度人过不去，所以连廊段的 z 只留中间 1.7 m。
//   · 壳体自带 Entry.door-leaf 在 z=2.56、门洞下沿 y=1.35，甲板 1.75 正好从门洞中间穿过。
//
// 只有壳体跟着放大。人、家具、气闸门、扶手高度、行走胶囊都是真实尺寸，不乘 K。
import {OUTPOST_SCALE,GLB_SCALE} from './outpost-layout.js';
import {FLOOR_WINDOW} from './outpost-window-layout.js';

/** 游戏尺度相对 GLB 实测尺度的倍数。 */
export const K = OUTPOST_SCALE/GLB_SCALE;

const DECK_1 = 1.75, TUNNEL_1 = 2.744;   // 1.4 尺度下的实测标高
export const DECK_Y = DECK_1*K;          // 三个舱段的甲板
export const TUNNEL_Y = TUNNEL_1*K;      // 两条压力连廊自带的地板面
export const WALK_MARGIN = .32;          // 行走胶囊半径，可走范围按它向内收；人不放大，它也不放大

/** 把 1.4 尺度下量的壳体数字换到游戏尺度：坐标、标高、板厚一起乘 K。 */
const hull = o => Object.freeze(Object.fromEntries(Object.entries(o).map(([k,v])=>
  [k, typeof v==='number'&&k!=='id' ? v*K : v&&typeof v==='object' ? hull(v) : v])));

/** 甲板分段。相邻段首尾相接，y 线性过渡；坡度见 tests/outpost-interior.test.js，全部低于 32°。
 *
 * x0/x1/z0/z1 是**能走**的范围。`plate` 是这块甲板**画出来**的范围，通常更大：三个舱段的板要铺满
 * 壳体内腔，连廊颈部下方也要铺过去，否则站在气闸舱往连廊看，坡道两侧就是一个能看进壳体肚子的黑洞。
 * `skirt` 是板边往下挂的裙板深度，按各段下方壳体内腹的实测高度给，挂太深会捅穿壳体。 */
export const LEVELS = Object.freeze([
  // 端窗前的窄观景步台，随壳体底部收口而抬高；中轴留出到玻璃前的真实站位。
  {id:'observation',x0:-22.50,x1:-21.0,y0:DECK_1+.20,y1:DECK_1,z0:-1.70,z1:0.65,skirt:.16},
  {id:'living',   x0:-21.0, x1:-12.5, y0:DECK_1,   y1:DECK_1,   z0:-3.00, z1:1.90,
   plate:{x0:-20.6, x1:-11.6, z0:-3.26, z1:2.12}, skirt:.55},
  {id:'westRamp', x0:-12.5, x1: -8.5, y0:DECK_1,   y1:TUNNEL_1, z0:-1.45, z1:0.25, skirt:.45},
  {id:'west',     x0: -8.5, x1: -5.3, y0:TUNNEL_1, y1:TUNNEL_1, z0:-1.45, z1:0.25,
   plate:{x0:-8.62, x1:-5.30, z0:-1.50, z1:0.30}, skirt:.30},
  {id:'westStep', x0: -5.3, x1: -3.0, y0:TUNNEL_1, y1:DECK_1,   z0:-1.45, z1:0.25, skirt:.45},
  {id:'hub',      x0: -3.0, x1:  3.0, y0:DECK_1,   y1:DECK_1,   z0:-3.05, z1:2.35,
   plate:{x0:-2.55, x1:2.55, z0:-3.30, z1:2.10}, skirt:.55},
  {id:'eastStep', x0:  3.0, x1:  5.3, y0:DECK_1,   y1:TUNNEL_1, z0:-1.45, z1:0.25, skirt:.45},
  {id:'east',     x0:  5.3, x1:  8.5, y0:TUNNEL_1, y1:TUNNEL_1, z0:-1.45, z1:0.25,
   plate:{x0:5.30, x1:8.62, z0:-1.50, z1:0.30}, skirt:.30},
  {id:'eastRamp', x0:  8.5, x1: 12.5, y0:TUNNEL_1, y1:DECK_1,   z0:-1.45, z1:0.25, skirt:.45},
  {id:'lab',      x0: 12.5, x1: 21.0, y0:DECK_1,   y1:DECK_1,   z0:-3.00, z1:1.90,
   plate:{x0:11.6, x1:20.6, z0:-3.20, z1:2.10}, skirt:.55},
].map(hull));

/** 落地窗前的地面（D77）。
 *
 * 居住舱甲板的板边在 z=2.12，舱壁内皮在甲板高度是 z=2.39：中间这 1.2 m（游戏尺度）是壳体往下收的
 * 弧面，原来没铺板、也不让走——窗台在头顶 4 m 的时候没人在意墙根。窗落到地上以后，人要能一直走到
 * 玻璃跟前，所以在窗洞这一段把板铺到窗套内沿，可走范围也跟过去。
 *
 * 不放进 LEVELS：那张表是沿舱段首尾相接的一串，这块是挂在居住舱侧面的。字段和 LEVELS 一样。
 * x 两头是窗套内侧（人不能走进窗套里）；z0 往居住舱甲板里搭一截，两块可走范围才连得上。
 * 板很薄：下面就是壳体的弧面，z=2.12 处内腹在 y=1.615，z=2.36 处已经抬到 1.735。 */
export const BAYS = Object.freeze([
  {id:'livingWindow', x0:FLOOR_WINDOW.x0+FLOOR_WINDOW.jamb, x1:FLOOR_WINDOW.x1-FLOOR_WINDOW.jamb,
   y0:DECK_1, y1:DECK_1, z0:1.60, z1:FLOOR_WINDOW.inner,
   plate:{x0:FLOOR_WINDOW.x0, x1:FLOOR_WINDOW.x1, z0:2.12, z1:FLOOR_WINDOW.inner}, skirt:.05},
].map(hull));

/** 画出来的那块板；没写 plate 的段就按可走范围画。 */
export const plateOf = l => ({x0:l.plate?.x0??l.x0, x1:l.plate?.x1??l.x1,
                              z0:l.plate?.z0??l.z0, z1:l.plate?.z1??l.z1});

/** 舱段端头和颈部的补板。壳体内腔不是一根等截面的管子：舱段两端收口，气闸舱往连廊过渡时
 * 内腹从 y=0.60 抬到 1.67、z 向净宽从 6.2 m 收到 1.7 m（1.4 尺度）。一整块方板铺过去会从壳体
 * 底下和侧面捅出去（tests/outpost-interior-browser.html 的漏出扫描就是为了逮这个）。所以收口段
 * 按实测分片铺，每片自带 z 范围和厚度。t 是板厚，薄板用在内腹抬得最高的地方。 */
export const PLATE_SLICES = Object.freeze([
  // 居住舱两端收口
  {id:'living.west-cap', x0:-21.00, x1:-20.60, z0:-2.70, z1:1.70, y:DECK_1, t:.45},
  // 落地窗左下角（D77）：窗洞比居住舱主板往端头多出 0.2，这一角补上，窗前的板才不是悬在半空的一条
  {id:'living.window-corner', x0:FLOOR_WINDOW.x0, x1:-20.60, z0:1.70, z1:2.12, y:DECK_1, t:.05},
  {id:'living.neck',     x0:-11.60, x1:-10.90, z0:-2.70, z1:1.70, y:DECK_1, t:.40},
  {id:'living.neck-out', x0:-10.90, x1:-10.10, z0:-1.90, z1:0.75, y:DECK_1, t:.22},
  // 气闸舱到两条连廊的颈部：内腹抬得最快的一段
  {id:'hub.west-0', x0:-3.10, x1:-2.55, z0:-2.95, z1:1.45, y:DECK_1, t:.50},
  {id:'hub.east-0', x0: 2.55, x1: 3.10, z0:-2.95, z1:1.45, y:DECK_1, t:.50},
  // -1/-2 两段的外沿按壳底实测收过（D61 放大后漏出扫描变密才量到）：从正下方往上打，
  // |x| 3.10–3.54 壳底最高 1.40；3.58–3.86 在 1.46–1.64（3.66 处有一条接缝到 1.73）；
  // 3.94–4.46 在 1.595–1.606；|x|≥4.50 已经抬到 1.78–1.81，比甲板还高，那里一块板都放不下。
  {id:'hub.west-1', x0:-3.56, x1:-3.10, z0:-2.30, z1:1.15, y:DECK_1, t:.35},
  {id:'hub.west-2', x0:-4.46, x1:-3.56, z0:-1.80, z1:0.60, y:DECK_1, t:.11},
  {id:'hub.east-1', x0: 3.10, x1: 3.56, z0:-2.30, z1:1.15, y:DECK_1, t:.35},
  {id:'hub.east-2', x0: 3.56, x1: 4.46, z0:-1.80, z1:0.60, y:DECK_1, t:.11},
  // 化验舱两端收口
  {id:'lab.neck-out', x0:10.10, x1:10.90, z0:-1.90, z1:0.75, y:DECK_1, t:.22},
  {id:'lab.neck',     x0:10.90, x1:11.60, z0:-2.70, z1:1.70, y:DECK_1, t:.40},
  {id:'lab.east-cap', x0:20.60, x1:21.30, z0:-2.70, z1:1.70, y:DECK_1, t:.45},
].map(hull));

/** 舱顶净空（1.4 尺度实测）。壳体顶在 6.70(居住/化验) ~ 6.95(气闸)，连廊只有 4.90。 */
const CEILING = hull({west:4.90, east:4.90, hub:6.90, other:6.70});

/** 气闸小室：内门在 z=0.55、外门在 z=2.00，壳体自带的舱门在外门再往外 0.5 m（1.4 尺度）。
 * 门是人过的门，halfX 不放大；两道隔墙横跨整个气闸舱（span），跟壳体一起放大。
 * height 是隔墙高度（原来写在 outpost-interior.js 里的 3.10 × K/(2/1.4)）。两道隔墙以前只是立在
 * 气闸舱里的两块平板：两头够不着壳体，头顶敞着，站在小室里往两边、往上看都是气闸舱（D73）。
 * 现在两头各加一堵端墙、上面加顶板，小室是一间六面都封住的屋子，尺寸就是 2·span × (outerZ−innerZ) × height。 */
export const AIRLOCK = Object.freeze({halfX:1.35, innerZ:.55*K, outerZ:2.00*K, span:3.0*K, height:2.17*K, wall:.16});

/** 两条压力连廊的内衬（D73）。
 *
 * 壳体的连廊是一根玻璃管（refine.py 的 Glass.tunnel，48 边形，透明度 0.16），里面只有地板、
 * 四根纵梁和三道肋。0.16 的玻璃在舱里几乎看不出来：站在连廊里往两边、往上看，就是火星地面、
 * NX07 和天，等于站在露天栈桥上——实测从连廊中点朝整个球面发 1500 条射线，26% 直接看到外面。
 * 所以在玻璃管里面再衬一圈不透明的筒壁，两侧各留一排窗：连廊是「有窗的走廊」，不是「没墙的桥」。
 *
 * 数字是从 assets/models/outpost.glb 量的（1.4 尺度，这里乘 K）：玻璃管轴心 y=3.976 / z=-0.644，
 * 内半径 1.7024；西管 x ∈ [-8.162, -5.432]，东管 x ∈ [5.530, 8.274]（两管差 1 cm，照实写）。
 * 内衬比玻璃内壁小 10 cm、自身厚 5 cm：48 边形的弦比圆弧往里缩 1.6 cm，这个间隙够它不碰玻璃。
 *
 * 角度绕连廊轴量：0 = 水平朝 +Z，π/2 = 正上方。窗带在轴心以下（-37.5° ~ -7.5°，正好四格），
 * 换成高度是离连廊地板 0.84 ~ 4.33 m：1.65 m 的眼高在窗里，窗台不挡小孩的视线。
 * 筒壁在这个高度往外倾，窗是朝下斜的，看得见前哨仓脚下的场地。 */
const DEG=Math.PI/180;
export const TUNNEL_SKIN = Object.freeze({
  cy:3.976*K, cz:-.644*K,
  glass:1.7024*K,
  r:1.7024*K-.10,
  thick:.05,
  segments:48,
  spans:Object.freeze([Object.freeze([-8.162*K,-5.432*K]),Object.freeze([5.530*K,8.274*K])]),
  windows:Object.freeze({count:3, width:2.6, from:-37.5*DEG, to:-7.5*DEG}),
});

/** 内衬内表面上的一点：沿连廊 x、绕轴 angle。r 可以换成别的半径（外表面、窗框）。 */
export const tunnelSkinPoint=(x,angle,r=TUNNEL_SKIN.r)=>
  [x, TUNNEL_SKIN.cy+r*Math.sin(angle), TUNNEL_SKIN.cz+r*Math.cos(angle)];

/** 一条连廊上各个窗洞沿 x 的范围：等距排开，窗间墙一样宽。 */
export function tunnelWindowSpans([x0,x1]){
  const {count,width}=TUNNEL_SKIN.windows, pier=((x1-x0)-count*width)/(count+1);
  return Array.from({length:count},(_,i)=>{const a=x0+pier+i*(width+pier);return [a,a+width];});
}

/** 内衬上 (x, angle) 这一点是不是窗洞。两侧各一排，-Z 一侧是 +Z 一侧的镜像。 */
export function tunnelWindowAt(x,angle){
  const {from,to}=TUNNEL_SKIN.windows, wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const a=wrap(angle), m=wrap(Math.PI-angle);
  if(!((a>from&&a<to)||(m>from&&m<to)))return false;
  return TUNNEL_SKIN.spans.some(s=>tunnelWindowSpans(s).some(([a0,a1])=>x>a0&&x<a1));
}

/** 家具组。家具不跟壳体放大——床还是床，桌子还是桌子——只跟着自己那面墙走：沿舱段方向按 K 挪
 * （舱段变长，家具之间自然拉开），贴墙的保持离墙距离，摆在舱中间的连同周围的凳子一起按 K 挪。
 * 下面家具、陈设、工位的 x/z 都按 1.4 尺度写，注明属于哪一组，统一由 groupShift 平移。
 * `wall` 是那一侧甲板板边（≈ 甲板高度处的壳体内壁），取各舱段 plate 的 z0 / z1。 */
const WALLS = {living:{n:-3.26,p:2.12}, hub:{n:-3.30,p:2.10}, lab:{n:-3.20,p:2.10}};
const GROUPS = Object.freeze({
  berths:  {module:'living', x:-19.6, wall:'n'},   // 四个铺位
  ecls:    {module:'living', x:-15.9, wall:'n'},   // 生命保障与水处理
  comms:   {module:'living', x:-13.3, wall:'n'},   // 通信台
  garden:  {module:'living', x:-18.7, wall:'p'},   // 舷窗侧的育苗墙
  galley:  {module:'living', x:-16.6, z:0.90},     // 餐桌贴向 +Z，中央留视线与通道
  stow:    {module:'living', x:-13.2, wall:'p'},   // 厨柜、储物柜、口粮吊柜
  suits:   {module:'hub',    x:-1.55, wall:'n'},   // 舱外服架
  tools:   {module:'hub',    x: 1.75, wall:'n'},   // 工具墙
  status:  {module:'hub',    x: 2.55, z:1.20},     // 气闸小室里的状态柱
  floor:   {module:'hub',    x: 0,    z:-0.60},    // 地面标线
  bench:   {module:'lab',    x:14.6,  wall:'p'},   // 化验台、手套箱、进样转盘
  cores:   {module:'lab',    x:17.8,  wall:'n'},   // 岩芯柜
  fume:    {module:'lab',    x:13.4,  wall:'n'},   // 通风柜
  island:  {module:'lab',    x:19.4,  z:0.10},     // 分析岛
  storage: {module:'lab',    x:20.6,  z:-1.60},    // 舱端暂存
});
/** 某一组从 1.4 尺度摆放挪到游戏尺度要平移多少。 */
export function groupShift(id){
  const g=GROUPS[id];
  if(!g)throw new Error(`outpost-interior-layout: unknown group ${id}`);
  return {x:g.x*(K-1), z:(g.wall?WALLS[g.module][g.wall]:g.z)*(K-1)};
}
const place=(at,x,z)=>{const s=groupShift(at);return {x:x+s.x,z:z+s.z};};

export const OUTPOST_INTERIOR_LAYOUT = Object.freeze({
  floorY: DECK_Y,
  innerDoorZ: AIRLOCK.innerZ,
  outerDoorZ: AIRLOCK.outerZ,
  entry:   {x:0, z:3.60*K},                      // 坡道顶，壳体舱门正外侧
  airlock: {x:0, z:1.30*K},                      // 气闸小室中央
  inside:  {x:0, z:-1.10*K},                     // 气闸舱内、内门以里
  rest:    place('galley',-17.45,-0.18),         // 餐桌靠通道的座位，坐下看向舷窗
});

/** 出舱的触发范围：离「入舱落点 → 内门」这一段、或离内门门洞（两侧门框之间）多少米，局部坐标。
 *
 * 出舱以前只认入舱落点一个点（2.6 m 圆），可落点在气闸舱中央、离内门有 7 m，而人走向气闸门时
 * 自然是一直走到门前才停（门关着，是堵墙）：站在门前反而「走近气闸至 2.6 m 内」不成立，F 没反应，
 * 出不了舱（2026-10-02 实玩）。所以范围要把落点到门前这一整段、门洞两侧的墙根都包进来。 */
export function airlockReach(x,z){
  const to=(ax,az,bx,bz)=>{
    const dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;
    const t=len2?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/len2)):0;
    return Math.hypot(x-(ax+dx*t),z-(az+dz*t));
  };
  const L=OUTPOST_INTERIOR_LAYOUT;
  return Math.min(to(L.inside.x,L.inside.z,0,AIRLOCK.innerZ),to(-AIRLOCK.halfX,AIRLOCK.innerZ,AIRLOCK.halfX,AIRLOCK.innerZ));
}

/** 落地家具。既是建模清单，也是碰撞清单——一张表出两样东西，它们不会各写各的。
 * 表里 c=[x, 离甲板的中心高, z]，x/z 是 1.4 尺度下的摆放，出表时按 at 组平移、高度加上甲板面；
 * s=[宽,高,深] 是真实尺寸，不放大。
 * open='z-' / 'z+' 表示这一面是敞开的：床铺、货架、岩芯柜里的东西装在柜体内部，柜体画成
 * 实心箱子就会把它们全封住，只能看见一个白盒子。敞开面只画背板、两侧和顶板，碰撞照旧按 s 算。 */
export const FURNITURE = Object.freeze([
  // 居住舱 · 后墙（-Z）：四个床位
  {id:'berth.frame0',    at:'berths', c:[-20.35, 1.45, -2.30], s:[1.42, 2.90, 1.34], slot:'panel', open:'z+'},
  {id:'berth.frame1',    at:'berths', c:[-18.80, 1.45, -2.30], s:[1.42, 2.90, 1.34], slot:'panel', open:'z+'},
  // 居住舱 · 后墙中段：生命保障与水处理
  {id:'ecls.cabinet',    at:'ecls',   c:[-16.60, 1.25, -2.56], s:[2.80, 2.50, .74],  slot:'panel'},
  {id:'ecls.tank-bay',   at:'ecls',   c:[-14.80, .90,  -2.55], s:[.64,  1.70, .64],  slot:'panel'},
  // 居住舱 · 后墙尾段：通信台
  {id:'comms.console',   at:'comms',  c:[-13.30, .50,  -2.32], s:[2.20, 1.00, .82],  slot:'panel'},
  {id:'comms.rack',      at:'comms',  c:[-13.30, 1.80, -2.62], s:[2.20, 1.56, .42],  slot:'dark'},
  // 居住舱 · 舷窗侧（+Z）：育苗墙、餐区、厨柜；端窗前不摆家具
  {id:'garden.rack',     at:'garden', c:[-18.70, 1.05,  1.50], s:[2.10, 2.10, .80],  slot:'panel', open:'z-'},
  {id:'stow.galley-unit',at:'stow',   c:[-14.00, .55,   1.42], s:[2.00, 1.10, .92],  slot:'panel'},
  {id:'stow.lockers',    at:'stow',   c:[-12.45, .90,   1.42], s:[1.10, 1.80, .80],  slot:'panel'},
  // 居住舱 · 靠舷窗侧的餐桌与软包长椅；桌面薄，碰撞由脚座负责
  {id:'galley.table',    at:'galley', c:[-16.60, .73,   0.90], s:[2.70, .10,  1.05], slot:'wood'},
  {id:'galley.banquette',at:'galley', c:[-16.60, .46,  2.07], s:[2.78, .92,  .70], slot:'fabric'},
  {id:'galley.foot0',    at:'galley', c:[-17.42, .34,   0.90], s:[.20, .68, .34], slot:'dark'},
  {id:'galley.foot1',    at:'galley', c:[-15.78, .34,   0.90], s:[.20, .68, .34], slot:'dark'},
  // 气闸舱：舱外服架、工具墙、状态柱
  {id:'suit.locker0',    at:'suits',  c:[-2.45,  1.05, -2.62], s:[.80,  2.10, .62],  slot:'panel'},
  {id:'suit.locker1',    at:'suits',  c:[-1.55,  1.05, -2.62], s:[.80,  2.10, .62],  slot:'panel'},
  {id:'suit.locker2',    at:'suits',  c:[-0.65,  1.05, -2.62], s:[.80,  2.10, .62],  slot:'panel'},
  {id:'hub.tool-wall',   at:'tools',  c:[ 1.75,  1.10, -2.72], s:[2.30, 2.20, .42],  slot:'panel'},
  {id:'hub.status-column',at:'status',c:[ 2.55,  1.30,  1.20], s:[.55,  2.60, .55],  slot:'panel'},
  // 化验舱 · 舷窗侧：风化层化验台与手套箱
  {id:'lab.bench',       at:'bench',  c:[14.60,  .50,   1.44], s:[3.60, 1.00, .90],  slot:'panel'},
  {id:'lab.glovebox',    at:'bench',  c:[14.70,  1.52,  1.48], s:[1.30, .90,  .80],  slot:'trim'},
  // 化验舱 · 后墙：岩芯柜与通风柜
  {id:'lab.core-rack',   at:'cores',  c:[17.80,  1.20, -2.56], s:[3.40, 2.40, .74],  slot:'panel', open:'z+'},
  {id:'lab.fume-hood',   at:'fume',   c:[13.40,  1.25, -2.54], s:[2.20, 2.50, .78],  slot:'panel'},
  // 化验舱 · 舱中分析岛与舱端暂存
  {id:'lab.island',      at:'island', c:[19.40,  .48,   0.10], s:[2.40, .96,  1.20], slot:'panel'},
  {id:'lab.spectrometer',at:'island', c:[19.00,  1.35,  0.10], s:[1.00, .62,  .86],  slot:'trim'},
  {id:'lab.storage',     at:'storage',c:[20.60,  1.05, -1.60], s:[.90,  2.10, 1.60], slot:'panel'},
].map(f=>{const p=place(f.at,f.c[0],f.c[2]);return Object.freeze({...f,c:[p.x,DECK_Y+f.c[1],p.z]});}));

/** 舱内可交互的工位。x/z 是站位（1.4 尺度，随所属家具组平移），face 是站上去时的朝向
 * （弧度，0=+Z，π=-Z）。站位全部经 tests/outpost-interior.test.js 验证落在可走地面上、不踩家具。 */
export const STATIONS = Object.freeze([
  {id:'bunk',   name:'铺位 · 四人',       at:'berths', x:-19.2, z:-1.05, face:Math.PI, module:'living'},
  {id:'galley', name:'长桌 · 用餐与作业',  at:'galley', x:-16.6, z:-0.55, face:0,       module:'living'},
  {id:'garden', name:'育苗架 · 六盆',      at:'garden', x:-18.7, z: 0.55, face:0,       module:'living'},
  {id:'comms',  name:'通信台',            at:'comms',  x:-13.2, z:-1.45, face:Math.PI, module:'living'},
  {id:'suits',  name:'舱外服架',          at:'suits',  x: -1.6, z:-1.80, face:Math.PI, module:'hub'},
  {id:'lab',    name:'风化层化验台',       at:'bench',  x: 14.6, z: 0.55, face:0,       module:'lab'},
  {id:'cores',  name:'岩芯样品柜',         at:'cores',  x: 17.8, z:-1.60, face:Math.PI, module:'lab'},
].map(s=>Object.freeze({...s,...place(s.at,s.x,s.z)})));

/** 玩家现在站在哪一段，给 HUD 用。 */
const AREA_NAME={observation:'居住舱 · 观景窗',living:'居住舱',livingWindow:'居住舱 · 落地窗',westRamp:'居住舱 · 连廊坡道',west:'西压力连廊',westStep:'气闸舱 · 连廊坡道',
                 hub:'气闸舱',eastStep:'气闸舱 · 连廊坡道',east:'东压力连廊',eastRamp:'化验舱 · 连廊坡道',lab:'设备舱 · 化验室'};
const within=(l,x,z)=>x>=l.x0&&x<=l.x1&&z>=l.z0&&z<=l.z1;
export function areaNameAt(x,z){
  const bay=BAYS.find(b=>within(b,x,z)&&!LEVELS.some(l=>within(l,x,z)));
  if(bay)return AREA_NAME[bay.id];
  const hit=LEVELS.filter(l=>within(l,x,z));
  return hit.length?AREA_NAME[hit.at(-1).id]:null;
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const covering=(x,z)=>[...LEVELS,...BAYS].filter(l=>within(l,x,z));

/** 甲板高度；不在甲板上返回 null。
 * 分段首尾相接，交界处两段都命中，取高的那块——踩空比踩高危险。 */
export function deckHeightAt(x,z){
  let best=null;
  for(const l of covering(x,z)){
    const y=l.y0+(l.y1-l.y0)*clamp((x-l.x0)/(l.x1-l.x0),0,1);
    if(best===null||y>best)best=y;
  }
  return best;
}

export function ceilingAt(x,z){
  let best=null;
  for(const l of covering(x,z)){
    const h=CEILING[l.id]??CEILING.other;
    if(best===null||h>best)best=h;
  }
  return best===null?Infinity:best;
}

/** 家具占地，按 FURNITURE 现算，不另抄一份。高度不到 0.35 m 的不挡人（长桌桌板靠桌腿站着）。
 * y0/y1 留着，是为了让「家具不重叠」的检查能区分「摞在一起」和「撞在一起」。 */
export const FOOTPRINTS = Object.freeze(FURNITURE
  .filter(f=>f.s[1]>=.35)
  .map(f=>Object.freeze({id:f.id, x0:f.c[0]-f.s[0]/2, x1:f.c[0]+f.s[0]/2,
                         y0:f.c[1]-f.s[1]/2, y1:f.c[1]+f.s[1]/2,
                         z0:f.c[2]-f.s[2]/2, z1:f.c[2]+f.s[2]/2})));

/** 舱内碰撞。doors 传 {state,amount}：关着的气闸门照样挡人。
 * 两道隔墙横跨整个气闸舱，只有中间的门洞能过：门开到位时胶囊要整个落在门洞里。 */
export function interiorBlockedAt(x,z,doors={state:'closed',amount:0},r=WALK_MARGIN){
  if(x<LEVELS[0].x0+r||x>LEVELS.at(-1).x1-r)return true;
  // 窗前那块地三面是墙（两侧窗套、前面玻璃），三面都按胶囊半径收；朝舱内那一面接着居住舱甲板
  if(!LEVELS.some(l=>x>=l.x0&&x<=l.x1&&z>=l.z0+r&&z<=l.z1-r)
     &&!BAYS.some(b=>x>=b.x0+r&&x<=b.x1-r&&z>=b.z0&&z<=b.z1-r))return true;
  for(const f of FOOTPRINTS)if(x>f.x0-r&&x<f.x1+r&&z>f.z0-r&&z<f.z1+r)return true;
  const open=(which)=>doors?.state===which&&doors.amount>.92;
  if(Math.abs(x)<AIRLOCK.span){
    const through=Math.abs(x)<=AIRLOCK.halfX-r;
    if(Math.abs(z-AIRLOCK.innerZ)<r+.08&&!(through&&open('inner')))return true;
    if(Math.abs(z-AIRLOCK.outerZ)<r+.08&&!(through&&open('outer')))return true;
  }
  return false;
}
