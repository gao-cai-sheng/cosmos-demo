import * as THREE from 'three';
import {mergeGeometries} from '../../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {createOutpostInteriorMaterials,disposeOutpostInteriorMaterials} from './outpost-interior-materials.js';
import {K,DECK_Y,TUNNEL_Y,LEVELS,BAYS,AIRLOCK,FURNITURE,STATIONS,groupShift,
        OUTPOST_INTERIOR_LAYOUT,deckHeightAt,ceilingAt,interiorBlockedAt,areaNameAt,plateOf,PLATE_SLICES,
        TUNNEL_SKIN,tunnelSkinPoint,tunnelWindowSpans,tunnelWindowAt} from './outpost-interior-layout.js';

/** 前哨仓舱内。取代 habitat-model.js 那颗独立的小椭球应急舱——它原来被整个塞进 33 m 壳体里，
 * 外面看是两层皮重叠，进去又只有 4 m 直径，和外壳完全对不上。
 *
 * 标高、可走范围和家具占地全部在 outpost-interior-layout.js，这里只负责把它们变成网格：
 * 一张 FURNITURE 表同时出建模和碰撞，两者不会各写各的。装饰件（凳子、花盆、屏幕、管线）不挡人。
 *
 * 尺度（D61）：壳体按 K 放大，人和家具不放大。所以跟着壳体走的东西（灯带、连廊护栏、隔墙跨度）
 * 坐标乘 K；陈设的 x/z 仍按 1.4 尺度写，每一段先用 into('组名') 标明属于哪一组家具，
 * 建完统一按 groupShift 平移，跟它旁边那件家具一起挪。高度都写成 DECK_Y + 真实高度，不用改。
 *
 * 坐标是前哨仓自身的局部系：+X 沿舱段串，+Z 朝坡道一侧，y=0 在落地脚垫。
 */
export {DECK_Y,TUNNEL_Y,LEVELS,AIRLOCK,STATIONS,OUTPOST_INTERIOR_LAYOUT,deckHeightAt,ceilingAt,areaNameAt};

export {createOutpostInteriorMaterials};

/** merge=true 时把静态网格按材质合并：舱内有四百多个小件，一件一个 draw call 会在进舱时
 * 明显掉帧。两道气闸门要开合，所以不合并；灯带、屏幕这些用 MeshBasic 的也照样按材质并到一起。
 * 目视检查页 tests/outpost-interior-browser.html?raw=1 用 merge=false，这样漏出扫描还能报出
 * 是哪一块板捅出去了。 */
export function createOutpostInterior({materials,lit=false,merge=true}={}){
  const own=!materials,mats=materials||createOutpostInteriorMaterials();
  const owned=new Set(),ownedMaterials=new Set(),lights=[],group=new THREE.Group();
  group.name='前哨舱内饰';

  // 当前这段陈设属于哪一组家具；null = 已经是游戏尺度坐标，不再平移
  let at=null;const into=id=>{at=id;};
  const add=(geo,slot,parent=group)=>{owned.add(geo);const m=new THREE.Mesh(geo,mats[slot]);
    m.castShadow=m.receiveShadow=!mats[slot].isMeshBasicMaterial;
    if(at&&parent===group)m.userData.at=at;parent.add(m);return m;};
  const box=(name,[cx,cy,cz],[w,h,d],slot,parent=group)=>{
    const m=add(new THREE.BoxGeometry(w,h,d),slot,parent);m.name=name;m.position.set(cx,cy,cz);return m;};
  const cyl=(name,[cx,cy,cz],r,h,slot,seg=14,parent=group)=>{
    const m=add(new THREE.CylinderGeometry(r,r,h,seg),slot,parent);m.name=name;m.position.set(cx,cy,cz);return m;};
  // 小半径挤出的实体倒角；家具的轮廓在斜视角下仍能读出厚度和受光边。
  const softBox=(name,[cx,cy,cz],[w,h,d],radius,slot)=>{
    const r=Math.min(radius,w/5,h/5,d/5),shape=new THREE.Shape();
    shape.moveTo(-w/2+r,-h/2+r);shape.lineTo(w/2-r,-h/2+r);
    shape.lineTo(w/2-r,h/2-r);shape.lineTo(-w/2+r,h/2-r);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,steps:1,bevelEnabled:true,
      bevelThickness:r,bevelSize:r,bevelSegments:2,curveSegments:3});
    geo.translate(0,0,-d/2+r);
    const m=add(geo,slot);m.name=name;m.position.set(cx,cy,cz);return m;
  };
  const pipe=(name,points,r,slot)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const m=add(new THREE.TubeGeometry(curve,Math.max(12,points.length*8),r,7,false),slot);
    m.name=name;return m;
  };
  const display=(name,[x,y,z],w,h,title,seed=0)=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
    const c=canvas.getContext('2d');c.fillStyle='#10232a';c.fillRect(0,0,256,160);
    c.fillStyle='#244a50';c.fillRect(0,0,256,22);
    c.fillStyle='#a8dfd5';c.font='bold 13px monospace';c.fillText(title,12,16);
    c.fillStyle='#48767a';c.font='10px monospace';c.fillText('COSMOS / HABITAT',12,149);
    c.strokeStyle='#75d4c3';c.lineWidth=2;c.beginPath();
    for(let i=0;i<54;i++){
      const px=12+i*4.3,py=69+Math.sin((i+seed)*.31)*12+Math.sin((i+seed)*.91)*3;
      i?c.lineTo(px,py):c.moveTo(px,py);
    }c.stroke();
    for(let i=0;i<4;i++){
      c.fillStyle=i===seed%4?'#f1b775':'#619693';
      c.fillRect(13+i*58,99,45,5);c.fillRect(13+i*58,111,18+i*5,3);
    }
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false});ownedMaterials.add(mat);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);
    owned.add(face.geometry);face.name=name;face.position.set(x,y,z);face.castShadow=false;
    if(at)face.userData.at=at;group.add(face);return face;
  };

  // ── 甲板、坡道、踢脚 ────────────────────────────────────────────────────
  for(const l of [...LEVELS,...BAYS]){      // BAYS：落地窗前补的那块地（D77）
    const p=plateOf(l),rise=l.y1-l.y0;
    const len=p.x1-p.x0,wide=p.z1-p.z0,run=Math.hypot(len,rise);
    // 绕 Z 转 θ 把局部 +X 映到 (cosθ,sinθ)，要让 +X 端抬高 rise，θ 就是 +atan2(rise,len)。
    const tilt=Math.atan2(rise,l.x1-l.x0);
    const yAt=x=>l.y0+rise*(x-l.x0)/(l.x1-l.x0);
    const mid=[(p.x0+p.x1)/2,(yAt(p.x0)+yAt(p.x1))/2,(p.z0+p.z1)/2];
    const thick=l.skirt??.35;
    // 板本身就是裙板：厚度按各段下方壳体内腹的实测高度给，所以板边不会露出下面的壳体肚子
    box('deck.'+l.id,[mid[0],mid[1]-thick/2,mid[2]],[run,thick,wide],'deck').rotation.z=tilt;
    box('deck.'+l.id+'.face',[mid[0],mid[1]+.005,mid[2]],[run,.03,wide],'trim').rotation.z=tilt;
    if(l.id==='observation')
      box('deck.observation.inset',[mid[0],mid[1]+.036,mid[2]],
        [run-.10,.012,Math.min(1.50,wide-.30)],'floorInset').rotation.z=tilt;
    if(rise!==0&&l.id!=='observation'){
      const n=Math.max(4,Math.round(run/.42));   // 防滑横条：看着像台阶，脚下仍是连续斜面
      for(let i=1;i<n;i++){
        const x=l.x0+(l.x1-l.x0)*i/n;
        box(`deck.${l.id}.grip${i}`,[x,yAt(x)+.025,mid[2]],[.05,.03,wide-.16],'seal').rotation.z=tilt;
      }
      for(const z of [l.z0+.07,l.z1-.07]){       // 坡道扶手
        box(`deck.${l.id}.rail${z.toFixed(2)}`,[mid[0],mid[1]+.95,z],[run,.06,.06],'trim').rotation.z=tilt;
        for(let i=0;i<=3;i++){
          const x=l.x0+(l.x1-l.x0)*i/3;
          box(`deck.${l.id}.post${z.toFixed(2)}.${i}`,[x,yAt(x)+.5,z],[.055,1,.055],'trim');
        }
      }
    }
  }

  // 端头和颈部的补板：壳体内腔在这些地方收口，整板铺过去会捅出壳体
  for(const sl of PLATE_SLICES){
    box('deck.'+sl.id,[(sl.x0+sl.x1)/2,sl.y-sl.t/2,(sl.z0+sl.z1)/2],[sl.x1-sl.x0,sl.t,sl.z1-sl.z0],'deck');
    box('deck.'+sl.id+'.face',[(sl.x0+sl.x1)/2,sl.y+.005,(sl.z0+sl.z1)/2],[sl.x1-sl.x0,.03,sl.z1-sl.z0],'trim');
  }

  // ── 照明。冷青环境照明沿顶骨架走，餐桌、铺位和状态灯给小面积暖色 ──
  // 灯跟着壳体走：位置、离甲板的高度、照射距离都乘 K；亮度乘 K²，同样远的地方照度不变。
  for(const [x0,x1,z] of [[-20.6,-12.8,-1.9],[-20.6,-12.8,0.9],[-2.6,2.6,-1.6],[-2.6,2.6,0.4],
                          [12.8,20.6,-1.9],[12.8,20.6,0.9]])
    {
      box('luminaire.housing',[(x0+x1)/2*K,DECK_Y+2.46*K,z*K],[(x1-x0)*K,.10,.22],'dark');
      box('luminaire.diffuser',[(x0+x1)/2*K,DECK_Y+2.44*K,z*K],[(x1-x0)*K-.10,.025,.11],'cool');
    }
  for(const [x0,x1] of [[-8.4,-5.4],[5.4,8.4]])
    box('luminaire.tunnel',[(x0+x1)/2*K,TUNNEL_Y+2.05*K,-.6*K],[(x1-x0)*K,.04,.14],'cool');
  for(const [x,z,power,reach,tint] of [[-18.6,-.5,15,9,0xc8edf0],[-14.2,-.5,12,8,0xffddb0],
      [0,-.4,13,8,0xc8edf0],[14.4,-.5,15,9,0xc8edf0],[18.6,-.5,13,8,0xffddb0]]){
    const light=new THREE.PointLight(tint,power*K*K,reach*K,2);
    light.name='interior light';light.position.set(x*K,DECK_Y+2.3*K,z*K);light.visible=lit;
    group.add(light);lights.push(light);
  }

  // ── FURNITURE 表：建模与碰撞同源（表里已经是游戏尺度坐标）────────────────
  into(null);
  const bespoke=new Set(['berth.frame0','berth.frame1','garden.rack','galley.table','galley.banquette']);
  for(const f of FURNITURE){
    if(bespoke.has(f.id))continue;
    if(!f.open){softBox(f.id,f.c,f.s,.055,f.slot);continue;}
    // 敞开式柜体：背板 + 两侧 + 顶板。里面的床铺、花盆、岩芯才看得见。
    const [cx,cy,cz]=f.c,[w,h,d]=f.s,back=f.open==='z+'?-1:1,T=.09;
    box(f.id+'.back',[cx,cy,cz+back*(d/2-T/2)],[w,h,T],f.slot);
    for(const s of [-1,1])box(f.id+'.side'+s,[cx+s*(w/2-T/2),cy,cz],[T,h,d],f.slot);
    box(f.id+'.top',[cx,cy+h/2-T/2,cz],[w,T,d],f.slot);
  }

  // 居住段的骨架和地面节奏跟舱体走，不挤占中轴。端头观景窗仍是视线尽头。
  // 这一段是 2.0 尺度下贴着壳体内壁量的（拱肋、管线、墙面分格、地面分格），所以整段跟壳体放大：
  // 坐标、离甲板的高度、截面都乘 r。只有贴在甲板面上的薄片厚度不乘——它们是地面的一部分。
  into(null);
  const r=K/(2/1.4),up=dy=>DECK_Y+dy*r;
  for(let i=0;i<7;i++){
    const x=(-29.30+i*1.68)*r;
    box(`living.runner.${i}`,[x,DECK_Y+.030,-.64*r],[1.57*r,.012,1.44*r],'floorInset');
    box(`living.runner-pin.${i}`,[x,DECK_Y+.041,-1.29*r],[.34*r,.006,.018*r],'brass');
  }
  for(const z of [-1.40,.12])
    box('living.floor-rail',[-24.45*r,DECK_Y+.043,z*r],[11.8*r,.012,.022*r],'brass');
  for(const x of [-23.65,-20.85,-18.25]){
    pipe(`living.arch.${x}`,[
      [x*r,up(2.55),-3.92*r],[x*r,up(3.62),-3.05*r],
      [x*r,up(4.12),-.62*r],[x*r,up(3.62),1.88*r],[x*r,up(2.55),2.68*r]
    ],.062*r,'dark');
    for(const z of [-3.92,2.68])
      softBox(`living.arch-foot.${x}.${z}`,[x*r,up(2.55),z*r],[.30*r,.38*r,.14*r],.035*r,'trim');
  }
  pipe('living.service-spine',[[-29.8*r,up(3.13),-3.76*r],[-24.5*r,up(3.13),-3.76*r],
    [-18.3*r,up(3.13),-3.76*r]],.11*r,'trim');
  // 水管原来从 x=-29.0 起，正好横在落地窗前面 8.7 m 高的地方（D77）。改成从第一道拱肋的脚起，
  // 整根落在窗洞右边，窗前不留东西。
  pipe('living.water-line',[[-23.65*r,up(2.91),2.61*r],[-21.9*r,up(2.91),2.61*r],
    [-20.2*r,up(2.91),2.61*r]],.045*r,'brass');
  for(const x of [-29.5,-27.3,-25.1,-22.9,-20.7,-18.5]){
    softBox('living.wall-bay',[x*r,up(1.55),-4.00*r],[.045*r,2.55*r,.07*r],.012*r,'muted');
    box('living.wall-bay.light',[x*r,up(2.92),-3.94*r],[.18*r,.035*r,.028*r],'cool');
  }

  // ── 气闸小室：两道真门，门洞是实洞不是深色贴片 ────────────────────────────
  const doors={};
  for(const [name,z,sign] of [['inner-door',AIRLOCK.innerZ,1],['outer-door',AIRLOCK.outerZ,-1]]){
    // 隔墙跟壳体走（跨度和高度都乘），门是人过的门不放大：门楣把门洞顶 2.60 m 到墙顶之间补满
    const wing=AIRLOCK.span-AIRLOCK.halfX,wallH=AIRLOCK.height,doorTop=2.60;
    for(const s of [-1,1])box(`${name}.bulkhead${s}`,[s*(AIRLOCK.halfX+wing/2),DECK_Y+wallH/2,z],[wing,wallH,AIRLOCK.wall],'panel');
    box(`${name}.header`,[0,DECK_Y+(doorTop+wallH)/2,z],[AIRLOCK.halfX*2,wallH-doorTop,.18],'panel');
    box(`${name}.sill`,[0,DECK_Y+.03,z],[AIRLOCK.halfX*2,.06,.26],'trim');
    const pivot=new THREE.Group();pivot.name=name;pivot.position.set(-AIRLOCK.halfX,DECK_Y,z);
    group.add(pivot);doors[name]={pivot,sign};
    const face=sign>0?.075:-.075;
    box(`${name}.leaf`,[AIRLOCK.halfX,1.30,0],[AIRLOCK.halfX*2-.08,2.56,.12],'trim',pivot);
    box(`${name}.gasket`,[AIRLOCK.halfX,1.30,face],[AIRLOCK.halfX*2-.02,2.62,.04],'seal',pivot);
    box(`${name}.porthole`,[AIRLOCK.halfX,1.86,face],[.52,.68,.05],'glass',pivot);
    box(`${name}.handle`,[AIRLOCK.halfX+.92,1.10,face*1.5],[.07,.42,.09],'dark',pivot);
    box(`${name}.status`,[AIRLOCK.halfX,2.48,face],[.34,.05,.03],'readout',pivot);
    for(const y of [.36,2.24])cyl(`${name}.hinge${y}`,[0,y,0],.07,.22,'dark',10,pivot);
  }
  for(let i=0;i<7;i++)box('airlock.grate'+i,[0,DECK_Y+.02,AIRLOCK.innerZ+.22+i*.2],[AIRLOCK.halfX*1.8,.03,.12],'seal');
  // 小室封口（D73）：两道隔墙以前是立在气闸舱里的两块平板，两头够不着壳体、头顶敞着。
  // 两头各补一堵端墙，上面盖顶板，小室才是一间关得上的屋子。尺寸在 AIRLOCK 里。
  {
    const X=AIRLOCK.span,H=AIRLOCK.height,T=AIRLOCK.wall;
    const mid=(AIRLOCK.innerZ+AIRLOCK.outerZ)/2,deep=AIRLOCK.outerZ-AIRLOCK.innerZ;
    for(const s of [-1,1])box(`airlock.end-wall${s}`,[s*(X-T/2),DECK_Y+H/2,mid],[T,H,deep-T],'panel');
    box('airlock.ceiling',[0,DECK_Y+H+T/2,mid],[X*2,T,deep+T],'panel');
    // 墙面加肋、顶上两条灯带、门两侧的警示条：屋里看得出尺度，也看得出哪面墙上有门
    for(const [z,face] of [[AIRLOCK.innerZ,1],[AIRLOCK.outerZ,-1]]){
      const zf=z+face*(T/2+.05);
      for(const x of [3.2,6.4,9.6])for(const s of [-1,1])
        box('airlock.rib',[s*x,DECK_Y+H/2,zf],[.12,H,.10],'trim');
      box('airlock.dado',[0,DECK_Y+3.02,zf-face*.02],[X*2-T*2,.10,.06],'muted');
      for(const s of [-1,1])box('airlock.door-mark',[s*(AIRLOCK.halfX+.16),DECK_Y+1.30,zf-face*.03],[.10,2.60,.03],'accent');
    }
    for(const s of [-1,1])for(const dz of [-deep/4,deep/4])
      box('airlock.rib',[s*(X-T-.05),DECK_Y+H/2,mid+dz],[.10,H,.12],'trim');
    for(const dz of [-1.3,1.3]){
      box('airlock.luminaire.housing',[0,DECK_Y+H-.05,mid+dz],[X*2-2.4,.10,.24],'dark');
      box('airlock.luminaire',[0,DECK_Y+H-.11,mid+dz],[X*2-2.6,.025,.13],'cool');
    }
    display('airlock.sign.cabin',[0,DECK_Y+3.55,AIRLOCK.innerZ+T/2+.03],1.90,.74,'AIRLOCK / CABIN',3);
    display('airlock.sign.surface',[0,DECK_Y+3.55,AIRLOCK.outerZ-T/2-.03],1.90,.74,'AIRLOCK / SURFACE',1).rotation.y=Math.PI;
    const light=new THREE.PointLight(0xc8edf0,4*K*K,5*K,2);
    light.name='interior light';light.position.set(0,DECK_Y+H-1.6,mid);light.visible=lit;
    group.add(light);lights.push(light);
  }

  // ── 气闸舱陈设 ──────────────────────────────────────────────────────────
  into('suits');
  for(let i=0;i<3;i++){
    const x=-2.45+i*.9;
    box('suit.recess'+i,[x,DECK_Y+1.05,-2.30],[.66,1.92,.06],'dark');
    box('suit.torso'+i,[x,DECK_Y+1.32,-2.22],[.54,.78,.30],'trim');
    box('suit.visor'+i,[x,DECK_Y+1.86,-2.22],[.36,.30,.28],'glass');
    box('suit.pack'+i,[x,DECK_Y+.55,-2.26],[.50,.44,.26],'dark');
    box('suit.tag'+i,[x,DECK_Y+2.02,-2.28],[.30,.05,.03],'readout');
  }
  into('tools');
  for(let i=0;i<8;i++)box('hub.tool'+i,[.85+i*.25,DECK_Y+1.40,-2.48],[.09,.62,.09],'dark');
  box('hub.tool-shelf',[1.75,DECK_Y+.92,-2.46],[2.20,.07,.30],'trim');
  into('status');
  box('hub.status-screen',[2.26,DECK_Y+1.62,1.20],[.04,.70,.42],'screen');
  for(let i=0;i<4;i++)box('hub.status-row'+i,[2.23,DECK_Y+1.86-i*.16,1.20],[.02,.05,.30],'readout');
  into('floor');
  box('hub.floor-mark',[0,DECK_Y+.07,-.60],[3.60,.02,.10],'accent');

  // ── 居住舱：四个床位 ────────────────────────────────────────────────────
  into('berths');
  for(let b=0;b<2;b++){
    const x=-20.35+b*1.55;
    for(const sx of [-.67,.67])for(const z of [-2.88,-1.68])
      softBox(`berth.post${b}.${sx}.${z}`,[x+sx,DECK_Y+1.46,z],[.065,2.86,.065],.018,'dark');
    softBox(`berth.headboard${b}`,[x,DECK_Y+1.43,-2.89],[1.28,2.74,.075],.025,'muted');
    for(let d=0;d<2;d++){
      const y=DECK_Y+.51+d*1.42;
      softBox(`berth.frame${b}${d}`,[x,y,-2.28],[1.38,.12,1.25],.032,'dark');
      softBox(`berth.mattress${b}${d}`,[x,y+.18,-2.27],[1.25,.24,1.14],.095,'fabric');
      softBox(`berth.pillow${b}${d}`,[x-.34,y+.34,-2.61],[.39,.18,.39],.065,'linen');
      softBox(`berth.duvet${b}${d}`,[x+.16,y+.32,-2.02],[.88,.16,.59],.068,'cushion');
      softBox(`berth.fold${b}${d}`,[x+.16,y+.38,-2.34],[.86,.055,.14],.022,'linen');
      box(`berth.seam${b}${d}`,[x+.15,y+.405,-1.78],[.83,.009,.014],'linen');
      box(`berth.headlight${b}${d}`,[x+.53,y+.51,-2.72],[.07,.16,.045],'warm');
      if(d===1)pipe(`berth.curtain-track${b}${d}`,[
        [x-.63,y+1.12,-1.60],[x,y+1.12,-1.58],[x+.63,y+1.12,-1.60]
      ],.020,'dark');
      for(let f=0;f<3;f++)
        softBox(`berth.curtain-fold${b}${d}${f}`,
          [x+.40+f*.075,y+.71,-1.59+(f%2)*.025],[.105,.77,.024],.007,'fabric');
      if(d===1)pipe(`berth.guard${b}${d}`,[
        [x+.08,y+.33,-1.60],[x+.08,y+.56,-1.60],
        [x+.58,y+.56,-1.60],[x+.58,y+.33,-1.60]
      ],.023,'trim');
    }
    box(`berth.number${b}`,[x,DECK_Y+2.89,-1.66],[.38,.055,.022],'accent');
  }
  // 一把共享的固定梯位于两组铺位之间，避免在床口前竖两套栏杆。
  for(const sx of [-.11,.11])box('berth.shared-ladder-upright',
    [-19.575+sx,DECK_Y+1.02,-1.58],[.038,2.04,.038],'dark');
  for(let s=0;s<5;s++)box('berth.shared-ladder-rung',
    [-19.575,DECK_Y+.34+s*.38,-1.58],[.24,.04,.04],'brass');
  // 生命保障与水处理
  into('ecls');
  softBox('ecls.grille-frame',[-16.72,DECK_Y+1.88,-2.165],[2.30,1.10,.06],.02,'dark');
  for(let i=0;i<7;i++)box('ecls.louver'+i,
    [-16.72,DECK_Y+2.31-i*.14,-2.123],[2.08,.045,.03],'muted');
  display('ecls.status',[-15.70,DECK_Y+.96,-2.157],.68,.40,'LIFE SUPPORT',2);
  for(let i=0;i<3;i++)cyl('ecls.filter'+i,
    [-17.35+i*.36,DECK_Y+.64,-2.12],.07,.11,'brass',12).rotation.x=Math.PI/2;
  cyl('ecls.tank',[-14.8,DECK_Y+.86,-2.55],.27,1.55,'trim',20);
  for(const y of [.25,1.37])cyl('ecls.tank-band',[-14.8,DECK_Y+y,-2.55],.295,.055,'brass',20);
  cyl('ecls.bottle',[-14.8,DECK_Y+1.84,-2.55],.15,.35,'ochre',16);
  softBox('ecls.duct',[-16.6,DECK_Y+2.88,-2.30],[3.02,.28,.35],.05,'dark');
  for(let i=0;i<3;i++)box('ecls.duct-stitch',[-17.55+i*.95,DECK_Y+2.88,-2.10],[.03,.17,.02],'brass');
  // 通信台
  into('comms');
  softBox('comms.desk',[-13.3,DECK_Y+1.02,-2.20],[2.30,.10,1.02],.035,'wood');
  softBox('comms.under-desk',[-13.3,DECK_Y+.83,-2.50],[2.04,.28,.25],.035,'dark');
  for(let i=0;i<3;i++){
    const x=-14.05+i*.75;
    softBox('comms.bezel'+i,[x,DECK_Y+1.69,-2.385],[.70,.52,.055],.025,'trim');
    display('comms.screen'+i,[x,DECK_Y+1.69,-2.348],.60,.41,
      ['CREW / STATUS','UPLINK / ARES','SURFACE / WX'][i],i+1);
  }
  for(let i=0;i<6;i++)box('comms.led'+i,
    [-14.2+i*.36,DECK_Y+2.40,-2.40],[.10,.045,.025],i===1?'accent':'readout');
  softBox('comms.keyboard',[-13.3,DECK_Y+1.08,-1.92],[1.10,.04,.34],.012,'dark');
  for(let i=0;i<13;i++)box('comms.key'+i,
    [-13.78+i*.08,DECK_Y+1.108,-1.91],[.05,.009,.09],'muted');
  cyl('comms.stool',[-13.3,DECK_Y+.33,-1.37],.06,.62,'dark',12);
  softBox('comms.stool-top',[-13.3,DECK_Y+.66,-1.37],[.48,.11,.47],.05,'fabric');
  // 育苗墙：薄铝架、封边托盘、灌溉线和形态有变化的六盆叶菜。
  into('garden');
  for(const x of [-20.14,-18.70,-17.26])
    softBox('garden.upright',[x,DECK_Y+1.09,1.79],[.045,2.18,.055],.012,'dark');
  pipe('garden.irrigation',[[-19.7,DECK_Y+2.05,1.88],[-18.7,DECK_Y+2.05,1.88],
    [-17.7,DECK_Y+2.05,1.88]],.025,'brass');
  const leafOutline=new THREE.Shape();
  leafOutline.moveTo(0,0);leafOutline.quadraticCurveTo(-.14,.12,0,.29);
  leafOutline.quadraticCurveTo(.14,.12,0,0);
  const leafGeo=new THREE.ShapeGeometry(leafOutline,7);
  for(let t=0;t<3;t++){
    const y=DECK_Y+.45+t*.71;
    softBox('garden.tray'+t,[-18.7,y,1.50],[2.05,.11,.76],.025,'trim');
    softBox('garden.well'+t,[-18.7,y+.055,1.49],[1.79,.022,.50],.009,'dark');
    for(let p=0;p<2;p++){
      const x=-19.18+p*.96,z=1.50,variant=t*2+p;
      const pot=add(new THREE.CylinderGeometry(.19,.16,.22,16),'ochre');
      pot.name=`garden.planter${t}${p}`;pot.position.set(x,y+.18,z);
      cyl(`garden.soil${t}${p}`,[x,y+.295,z],.16,.025,'soil',14);
      cyl(`garden.stem${t}${p}`,[x,y+.40,z],.012,.20,'leafDeep',8);
      const count=8+variant%4;
      for(let k=0;k<count;k++){
        const a=k/count*Math.PI*2+variant*.29;
        const size=(variant%3===0?.88:.69)+.27*(.5+.5*Math.sin(k*2.41+variant));
        const leaf=add(leafGeo,(k+variant)%3===0?'leafDeep':'leaf');
        leaf.name=`garden.leaf${t}${p}${k}`;
        leaf.position.set(x,y+.35+(k%3)*.038,z);
        leaf.scale.set(size,size,size);
        leaf.rotation.set(0,a,-.62-(k%3)*.10-(variant%2)*.08,'YXZ');
      }
    }
    softBox('garden.light-hood'+t,[-18.7,y+.59,1.55],[1.85,.09,.25],.025,'dark');
    box('garden.growlight'+t,[-18.7,y+.54,1.42],[1.68,.018,.08],'grow');
    softBox('garden.status-panel'+t,[-19.28,y+.16,1.103],[.63,.10,.025],.012,'dark');
    for(let n=0;n<3;n++)box('garden.diagnostic'+t+n,
      [-19.49+n*.18,y+.17,1.084],[.10,.025,.012],n===0?'accent':'readout');
  }
  // 餐区退到 +Z 侧：一条内衬软包长椅、两张轻巧活动椅，中轴继续通向端窗。
  into('galley');
  softBox('galley.table-edge',[-16.60,DECK_Y+.71,.90],[2.73,.16,1.08],.075,'dark');
  softBox('galley.tabletop',[-16.60,DECK_Y+.79,.90],[2.68,.105,1.04],.07,'wood');
  softBox('galley.banquette-base',[-16.60,DECK_Y+.22,2.07],[2.76,.43,.67],.065,'dark');
  for(let s=0;s<3;s++){
    const x=-17.50+s*.90;
    softBox('galley.banquette-seat'+s,[x,DECK_Y+.48,2.00],[.86,.14,.63],.06,'fabric');
    softBox('galley.banquette-back'+s,[x,DECK_Y+.79,2.32],[.86,.46,.16],.05,'cushion');
  }
  for(const x of [-17.45,-15.75]){
    cyl('galley.chair-stem',[x,DECK_Y+.25,-.18],.045,.46,'dark',10);
    softBox('galley.chair-seat',[x,DECK_Y+.51,-.18],[.55,.12,.53],.055,'fabric');
    softBox('galley.chair-back',[x,DECK_Y+.79,-.43],[.53,.46,.105],.042,'cushion');
    for(const dx of [-.21,.21])box('galley.chair-foot',
      [x+dx,DECK_Y+.045,-.18],[.032,.05,.48],'dark');
  }
  softBox('galley.tray',[-16.40,DECK_Y+.86,.93],[.45,.028,.29],.013,'muted');
  for(let i=0;i<2;i++)cyl('galley.cup'+i,
    [-17.03+i*.26,DECK_Y+.92,1.02],.052,.12,'linen',12);
  softBox('galley.pendant',[-16.60,DECK_Y+2.49,.94],[1.63,.11,.32],.035,'dark');
  box('galley.pendant-glow',[-16.60,DECK_Y+2.41,.94],[1.38,.025,.16],'warm');
  // 厨柜、储物、口粮吊柜
  into('stow');
  softBox('stow.counter',[-14.0,DECK_Y+1.12,1.42],[2.10,.09,1.00],.035,'wood');
  softBox('stow.sink-rim',[-14.5,DECK_Y+1.15,1.42],[.57,.045,.54],.018,'trim');
  softBox('stow.sink',[-14.5,DECK_Y+1.17,1.42],[.46,.025,.43],.012,'dark');
  pipe('stow.tap',[[-14.58,DECK_Y+1.18,1.81],[-14.58,DECK_Y+1.40,1.81],
    [-14.48,DECK_Y+1.44,1.72]],.027,'trim');
  softBox('stow.heater',[-13.4,DECK_Y+1.29,1.42],[.58,.28,.54],.035,'dark');
  for(let i=0;i<3;i++)box('stow.heater-line'+i,
    [-13.60+i*.20,DECK_Y+1.44,1.30],[.12,.008,.018],'accent');
  for(let i=0;i<4;i++)for(const x of [-12.72,-12.18])
    box(`stow.locker-line${i}${x}`,[x,DECK_Y+1.58-i*.42,1.01],[.44,.014,.015],'dark');
  softBox('stow.rations',[-14.0,DECK_Y+2.30,1.52],[1.90,.60,.66],.05,'muted');
  box('stow.rations-mark',[-14.0,DECK_Y+2.30,1.16],[.80,.065,.02],'accent');

  // ── 化验舱：土壤检测这一套，是这间舱存在的理由 ────────────────────────────
  into('bench');
  box('lab.bench-top',[14.6,DECK_Y+1.03,1.44],[3.70,.08,1.00],'trim');
  const carousel=add(new THREE.CylinderGeometry(.42,.42,.16,24),'dark');
  carousel.name='lab.sample-carousel';carousel.position.set(13.35,DECK_Y+1.15,1.40);
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2;
    cyl('lab.sample'+i,[13.35+Math.cos(a)*.28,DECK_Y+1.26,1.40+Math.sin(a)*.28],.055,.10,'ochre',10);
  }
  box('lab.glovebox-pane',[14.7,DECK_Y+1.52,1.06],[1.14,.74,.04],'glass');
  for(const x of [14.40,15.00]){
    cyl('lab.glove-port'+x,[x,DECK_Y+1.38,1.075],.115,.05,'dark',12).rotation.x=Math.PI/2;
    cyl('lab.glove'+x,[x,DECK_Y+1.38,1.16],.095,.30,'linen',12).rotation.x=Math.PI/2;
  }
  box('lab.terminal',[15.95,DECK_Y+1.52,1.40],[.96,.62,.05],'screen').rotation.x=-.22;
  for(let i=0;i<5;i++)
    box('lab.terminal-row'+i,[15.95,DECK_Y+1.72-i*.11,1.36+i*.024],[.72,.04,.02],'readout').rotation.x=-.22;
  box('lab.terminal-stand',[15.95,DECK_Y+1.14,1.52],[.22,.22,.22],'dark');
  box('lab.bench-lamp',[14.6,DECK_Y+2.40,1.20],[3.20,.06,.20],'warm');
  // 岩芯柜、通风柜
  into('cores');
  for(let r=0;r<4;r++){
    box('lab.core-shelf'+r,[17.8,DECK_Y+.50+r*.58,-2.30],[3.24,.06,.52],'trim');
    for(let i=0;i<7;i++)
      cyl(`lab.core${r}${i}`,[16.4+i*.46,DECK_Y+.60+r*.58,-2.30],.075,.44,'ochre',10).rotation.z=Math.PI/2;
  }
  into('fume');
  box('lab.fume-pane',[13.4,DECK_Y+1.50,-2.14],[1.92,1.00,.05],'glass');
  box('lab.fume-duct',[13.4,DECK_Y+2.88,-2.40],[.44,.44,.44],'trim');
  for(let i=0;i<3;i++)box('lab.fume-led'+i,[12.7+i*.7,DECK_Y+2.20,-2.13],[.22,.05,.03],'readout');
  // 分析岛
  into('island');
  box('lab.island-top',[19.4,DECK_Y+1.00,0.10],[2.50,.08,1.30],'trim');
  box('lab.spectrometer-face',[19.0,DECK_Y+1.35,-0.36],[.84,.46,.04],'screen');
  for(let i=0;i<3;i++)box('lab.spec-row'+i,[19.0,DECK_Y+1.48-i*.12,-0.39],[.60,.035,.02],'readout');
  const centrifuge=add(new THREE.CylinderGeometry(.34,.38,.46,20),'dark');
  centrifuge.name='lab.centrifuge';centrifuge.position.set(20.1,DECK_Y+1.27,0.10);
  cyl('lab.centrifuge-lid',[20.1,DECK_Y+1.52,0.10],.30,.06,'glass',20);
  cyl('lab.stool',[19.4,DECK_Y+.26,1.20],.09,.52,'dark',10);
  cyl('lab.stool-seat',[19.4,DECK_Y+.55,1.20],.22,.08,'fabric',16);
  into('storage');
  box('lab.storage-mark',[20.15,DECK_Y+1.60,-1.60],[.03,.34,.80],'accent');

  // ── 连廊护栏：沿连廊铺，跟壳体放大；扶手高度是人的尺寸，不放大 ─────────────
  into(null);
  for(const [a,b] of [[-8.4,-5.4],[5.4,8.4]])for(const z of [-1.38*K,.18*K]){
    const x0=a*K,x1=b*K;
    box('tunnel.rail',[(x0+x1)/2,TUNNEL_Y+1.02,z],[x1-x0,.06,.06],'trim');
    box('tunnel.kick',[(x0+x1)/2,TUNNEL_Y+.12,z],[x1-x0,.22,.05],'trim');
    for(let i=0;i<=4;i++)box('tunnel.post',[x0+(x1-x0)*i/4,TUNNEL_Y+.55,z],[.06,.90,.06],'trim');
  }

  // ── 连廊内衬（D73）：玻璃管里再衬一圈不透明的筒壁，两侧各留一排窗 ──────────────
  // 为什么要衬、数字从哪来，见 outpost-interior-layout.js 的 TUNNEL_SKIN。
  // 筒壁有里外两层皮（里面朝人，外面隔着玻璃从舱外看得见），所有分段都按同一组 x 切开，
  // 窗带和上下的筒壁之间没有丁字缝。
  {
    const T=TUNNEL_SKIN,W=T.windows,dA=Math.PI*2/T.segments;
    const wall={p:[],n:[],u:[]},pane={p:[],n:[],u:[]};
    const cell=(to,x0,x1,a0,a1,rad,inward)=>{
      const corner=[[x0,a0],[x1,a0],[x1,a1],[x0,a1]],s=inward?-1:1;
      for(const i of inward?[0,2,1,0,3,2]:[0,1,2,0,2,3]){
        const [x,a]=corner[i];
        to.p.push(...tunnelSkinPoint(x,a,rad));to.n.push(0,s*Math.sin(a),s*Math.cos(a));to.u.push(x/2,a*rad/2);
      }
    };
    const mesh=(d,slot,name)=>{
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(d.p,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(d.n,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(d.u,2));
      const m=add(g,slot);m.name=name;return m;
    };
    for(const span of T.spans){
      const [x0,x1]=span,wins=tunnelWindowSpans(span),cuts=[x0,...wins.flat(),x1];
      for(let j=0;j<T.segments;j++){
        const a0=j*dA,a1=a0+dA;
        for(let k=0;k+1<cuts.length;k++){
          const xa=cuts[k],xb=cuts[k+1];
          if(tunnelWindowAt((xa+xb)/2,(a0+a1)/2)){cell(pane,xa,xb,a0,a1,T.r+T.thick/2,true);continue;}
          cell(wall,xa,xb,a0,a1,T.r,true);cell(wall,xa,xb,a0,a1,T.r+T.thick,false);
        }
      }
      // 窗框：窗台、窗楣是沿连廊的直料，两侧竖框跟着筒壁的弧一格一段
      for(const side of [1,-1]){
        const A=a=>side>0?a:Math.PI-a;
        for(const [xa,xb] of wins){
          for(const a of [W.from,W.to])
            box('tunnel.window.rail',tunnelSkinPoint((xa+xb)/2,A(a),T.r-.02),[xb-xa+.24,.10,.14],'trim').rotation.x=Math.PI/2-A(a);
          for(const x of [xa,xb])for(let a=W.from;a<W.to-1e-6;a+=dA){
            const am=A(a+dA/2);
            box('tunnel.window.jamb',tunnelSkinPoint(x,am,(T.r-.02)*Math.cos(dA/2)),
              [.12,2*T.r*Math.sin(dA/2)+.02,.10],'trim').rotation.x=-am;
          }
        }
      }
      // 环肋压在窗间墙正中，两头各一道压住颈圈
      const pier=wins[0][0]-x0,ribs=[x0+pier/2,...wins.slice(1).map(([a],i)=>(wins[i][1]+a)/2),x1-pier/2];
      for(const x of ribs){
        const g=new THREE.TorusGeometry(T.r-.05,.08,6,T.segments);g.rotateY(Math.PI/2);
        const m=add(g,'trim');m.name='tunnel.rib';m.position.set(x,T.cy,T.cz);
      }
      // 筒壁不透光，连廊里原来靠太阳照亮，现在要自己的灯
      const light=new THREE.PointLight(0xc8edf0,9*K*K,7*K,2);
      light.name='interior light';light.position.set((x0+x1)/2,TUNNEL_Y+5.5,T.cz);light.visible=lit;
      group.add(light);lights.push(light);
    }
    mesh(wall,'panel','tunnel.skin');
    mesh(pane,'glass','tunnel.window.pane');
  }

  // 陈设跟着自己那组家具平移到游戏尺度（合并前做，合并要读 position）
  for(const o of group.children){
    if(!o.userData.at)continue;
    const d=groupShift(o.userData.at);o.position.x+=d.x;o.position.z+=d.z;
  }

  // ── 状态 ────────────────────────────────────────────────────────────────
  let state='closed',amount=0,disposed=false;
  function setDoors(next,value=1){
    if(!['closed','inner','outer'].includes(next))throw new Error(`outpost-interior: unknown state ${next}`);
    state=next;amount=next==='closed'?0:Math.max(0,Math.min(1,value));
    for(const [name,d] of Object.entries(doors))
      d.pivot.rotation.y=name===`${next}-door`?d.sign*amount*Math.PI/2:0;
  }
  const setLit=on=>{for(const l of lights)l.visible=!!on;};

  function getMetrics(){
    let triangles=0,meshes=0;const geos=new Set();
    group.traverse(o=>{if(!o.isMesh)return;meshes++;geos.add(o.geometry);
      triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
    return {triangles,meshes,geometries:geos.size,lights:lights.length,furniture:FURNITURE.length};
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const g of owned)g.dispose();
    for(const m of ownedMaterials){m.map?.dispose();m.dispose();}
    if(own)disposeOutpostInteriorMaterials(mats);
    group.clear();
  }

  if(merge){
    const slotOf=new Map(Object.entries(mats).map(([k,m])=>[m,k]));
    const bySlot=new Map();
    for(const child of [...group.children]){
      if(child.name==='garden.stem00'||child.name==='garden.leaf000'||child.name==='garden.leaf001')continue;
      if(!child.isMesh)continue;                       // 门枢轴是 Group，灯是 Light，都留着
      const slot=slotOf.get(child.material);
      if(!slot)continue;
      child.updateMatrix();
      if(!bySlot.has(slot))bySlot.set(slot,[]);
      const transformed=child.geometry.clone().applyMatrix4(child.matrix);
      const flat=transformed.index?transformed.toNonIndexed():transformed;
      if(flat!==transformed)transformed.dispose();
      bySlot.get(slot).push(flat);
      group.remove(child);
    }
    for(const [slot,list] of bySlot){
      const merged=mergeGeometries(list,false);
      for(const g of list)g.dispose();
      if(!merged)continue;
      owned.add(merged);
      const m=new THREE.Mesh(merged,mats[slot]);
      m.name='interior.'+slot;
      m.castShadow=m.receiveShadow=!mats[slot].isMeshBasicMaterial;
      group.add(m);
    }
  }

  setDoors('closed');setLit(lit);
  return {group,layout:OUTPOST_INTERIOR_LAYOUT,stations:STATIONS,
    setDoors,setState:setDoors,setLit,getMetrics,dispose,
    setNursery(batch){
      // Runtime state only: reuse existing plant meshes; no new geometry or crop model.
      for(const o of group.children){
        if(o.name==='interior.leaf'||o.name==='interior.leafDeep'||/^garden\.(leaf|stem)/.test(o.name))
          o.visible=batch.elapsed>=120&&['garden.stem00','garden.leaf000','garden.leaf001'].includes(o.name);
      }
    },
    floorAtLocal:deckHeightAt,
    areaNameAt,
    ceilingAtLocal:ceilingAt,
    blockedLocal:(x,z,r)=>interiorBlockedAt(x,z,{state,amount},r),
    get doorState(){return {state,amount};}};
}
