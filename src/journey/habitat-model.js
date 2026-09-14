import * as THREE from 'three';

export const HABITAT_LAYOUT=Object.freeze({floorY:.8,innerDoorZ:2.75,outerDoorZ:5,inside:{x:0,z:1.25},airlock:{x:0,z:3.85},entry:{x:0,z:6.3},rest:{x:0,z:0}});
const socket=(position,kind='dock')=>({kind,parent:'root',position,quaternion:[0,0,0,1],mate:'opposed-forward',positionTolerance:.001,angleToleranceDeg:.5});
export const SPEC={schema:'threejs-artifact@0.2',name:'surface-habitat',version:'1.0.0',unit:'m',up:[0,1,0],forward:[0,0,1],datum:'landing-foot-bottom',canonicalState:'closed',initialState:'closed',seed:20260908,
  bounds:{min:[-3.4,0,-3.7],max:[3.4,5.6,6.5],w:6.8,h:5.6,d:10.2,state:'closed',lod:0,relativeTolerance:.02,absoluteFloor:.001},boundsByState:{},
  sockets:{'dock.entry':socket([0,.8,5]),'dock.inside':socket([0,.8,1.25]),'data.terminal':socket([1.63,1.8,-1.1],'data')},
  materialSlots:['structure','interior','dark','seal','fabric','glass','accent','warm'],states:{closed:{parts:{'inner-door':0,'outer-door':0}},inner:{parts:{'inner-door':Math.PI/2,'outer-door':0}},outer:{parts:{'inner-door':0,'outer-door':-Math.PI/2}}},
  articulation:[{part:'inner-door',type:'rotation',axis:[0,1,0],unit:'rad',range:[0,Math.PI/2],rest:0},{part:'outer-door',type:'rotation',axis:[0,1,0],unit:'rad',range:[-Math.PI/2,0],rest:0}],
  allowedContacts:[{a:'shell',b:'airlock.inner-bulkhead',purpose:'welded pressure partition',maxPenetration:.16},{a:'inner-door',b:'airlock.inner-bulkhead',purpose:'compression seal',maxPenetration:.04},{a:'outer-door',b:'shell',purpose:'compression seal',maxPenetration:.04}],
  lods:[{id:0,note:'64-sided continuous double wall',measuredTriangles:19500,budget:{maxTriangles:30000,maxDrawCalls:100}},{id:1,note:'32-sided continuous double wall',measuredTriangles:10358,budget:{maxTriangles:18000,maxDrawCalls:100}}],
  collider:{kind:'compound',state:'closed',parts:[{name:'room',shape:'ellipse-interior',radii:[1.94,2.13]},{name:'airlock',shape:'corridor-interior',min:[-.67,1.4],max:[.67,5.1]},{name:'berth',shape:'box',min:[-1.72,-1.5],max:[-.8,.5]},{name:'terminal',shape:'box',min:[1.45,-1.8],max:[2.22,-.4]}],dynamicParts:['inner-door','outer-door']},
  interaction:{volume:{kind:'sphere',radius:2},anchor:'dock.entry',prompt:'进入生活舱'},detailFocus:{part:'outer-door',radius:1.5},grazingAzimuthDeg:60,generatedTextures:[],deviations:[]};

function rectPoint(a,hw,hh,cy){const c=Math.cos(a),s=Math.sin(a);return [hw*Math.sign(c)*Math.abs(c)**.34,cy+hh*Math.sign(s)*Math.abs(s)**.34];}
function contour(z,inner,n){
  const rx=inner?3.24:3.4,ry=inner?2.59:2.75,rz=inner?3.55:3.7;
  const f=Math.sqrt(Math.max(0,1-(Math.min(z,2.4)/rz)**2));
  const t=THREE.MathUtils.smoothstep(z,2.4,3.65);
  return Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,rect=rectPoint(a,inner?.78:.96,inner?1.125:1.32,inner?1.925:1.98);return [THREE.MathUtils.lerp(rx*f*Math.cos(a),rect[0],t),THREE.MathUtils.lerp(2.85+ry*f*Math.sin(a),rect[1],t),z];});
}
// One watertight solid shell: outer wall, inner wall, rear poles and the aperture rim.
// The interior is actual geometry and the aperture is never covered by a dark plane.
function pressureShell(n,rings){
  const p=[],idx=[],groups=[];
  function side(inner){const start=p.length/3,rz=inner?3.55:3.7,zs=[];for(let j=0;j<=rings;j++)zs.push(-rz+(2.4+rz)*j/rings);for(let j=1;j<=10;j++)zs.push(2.4+1.25*j/10);zs.push(5.06);
    p.push(0,2.85,-rz);for(const z of zs.slice(1))for(const v of contour(z,inner,n))p.push(...v);
    const begin=idx.length,ringCount=zs.length-1;const tri=(a,b,c)=>inner?idx.push(a,c,b):idx.push(a,b,c);
    for(let i=0;i<n;i++)tri(start,start+1+(i+1)%n,start+1+i);
    for(let j=0;j<ringCount-1;j++)for(let i=0;i<n;i++){const a=start+1+j*n+i,b=start+1+j*n+(i+1)%n,c=a+n,d=b+n;tri(a,b,c);tri(b,d,c);}
    groups.push({start:begin,count:idx.length-begin,materialIndex:inner?1:0});return start+1+(ringCount-1)*n;
  }
  const outer=side(false),inside=side(true),begin=idx.length;
  for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(outer+i,outer+j,inside+i,outer+j,inside+j,inside+i);}groups.push({start:begin,count:idx.length-begin,materialIndex:0});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);for(const gr of groups)g.addGroup(gr.start,gr.count,gr.materialIndex);g.computeVertexNormals();return g;
}
function roundedShape(hw,hh,cy=0,n=48){const s=new THREE.Shape();for(let i=0;i<=n;i++){const p=rectPoint(i/n*Math.PI*2,hw,hh,cy);if(i)s.lineTo(...p);else s.moveTo(...p);}return s;}
function plate(hw,hh,depth,cy=0){return new THREE.ExtrudeGeometry(roundedShape(hw,hh,cy),{depth,bevelEnabled:true,bevelThickness:.014,bevelSize:.014,bevelSegments:2,steps:1,curveSegments:8}).translate(0,0,-depth/2);}
function annulus(outer,inner,depth){const s=new THREE.Shape(outer.map(p=>new THREE.Vector2(p[0],p[1])));s.holes.push(new THREE.Path(inner.map(p=>new THREE.Vector2(p[0],p[1])).reverse()));return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1}).translate(0,0,-depth/2);}

export function create({materials,seed=SPEC.seed,lod=0}={}){
  if(!SPEC.lods.some(l=>l.id===lod))throw new Error(`surface-habitat: unsupported LOD ${lod}`);
  for(const k of SPEC.materialSlots)if(!materials?.[k])throw new Error(`surface-habitat: missing material ${k}`);
  const group=new THREE.Group();group.name='surface-habitat';const parts={root:group},sockets={},owned=new Set();
  const mesh=(name,g,slot,parent=group)=>{owned.add(g);const m=new THREE.Mesh(g,materials[slot]);m.name=name;m.userData.materialSlot=slot;m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const box=(name,size,pos,slot,parent=group)=>{const m=mesh(name,new THREE.BoxGeometry(...size),slot,parent);m.position.set(...pos);return m;};
  const cyl=(name,radius,height,pos,slot)=>{const m=mesh(name,new THREE.CylinderGeometry(radius,radius,height,lod?16:24),'dark');m.material=materials[slot];m.userData.materialSlot=slot;m.position.set(...pos);return m;};
  const n=lod?32:64,shellGeo=pressureShell(n,lod?24:40);owned.add(shellGeo);
  const shell=new THREE.Mesh(shellGeo,[materials.structure,materials.interior]);shell.name='shell';shell.userData.materialSlots=['structure','interior','structure'];shell.castShadow=shell.receiveShadow=true;group.add(shell);parts.shell=shell;
  // Slim continuous waist trim is attached to the upper hemisphere, with inset status panes.
  for(let i=0;i<24;i++){
    const a=.44+(Math.PI*2-.88)*(i+.5)/24,z=3.7*Math.sin(a),x=3.4*Math.cos(a);
    if(z>2.36)continue;
    const m=box(`waist.frame.${i}`,[.42,.19,.035],[x,2.88,z],'dark');m.rotation.y=Math.atan2(x/3.4,z/3.7);
    const w=box(`waist.window.${i}`,[.28,.072,.04],[x*1.002,2.9,z*1.002],'glass');w.rotation.y=m.rotation.y;
  }
  for(const x of [-1.8,1.8])for(const z of [-1.9,1.9]){cyl(`foot.${x}.${z}`,.35,.12,[x,.06,z],'dark');cyl(`strut.${x}.${z}`,.105,1.1,[x,.67,z],'structure');}
  const deck=mesh('habitat.deck',new THREE.CylinderGeometry(1,1,.15,64).scale(1.98,1,2.17),'interior');deck.position.y=.725;
  box('airlock.deck',[1.54,.15,3.85],[0,.725,3.125],'dark');
  // Modest fixed entrance steps, outside the pressure envelope.
  for(let i=0;i<4;i++)box(`entry.step.${i}`,[1.72,.2*(4-i),.36],[0,.1*(4-i),5.24+.36*i],'dark');
  for(const x of [-.94,.94]){box(`entry.rail.${x}`,[.05,.05,1.65],[x,1.33,5.62],'structure');for(const z of [5.1,6.35])box(`entry.post.${x}.${z}`,[.05,1.25,.05],[x,.68,z],'structure');}

  const hole=Array.from({length:n},(_,i)=>[...rectPoint(i/n*Math.PI*2,.795,1.14,1.925),2.75]);
  const bulkhead=mesh('airlock.inner-bulkhead',annulus(contour(2.75,true,n),hole,.1),'interior');bulkhead.position.z=2.75;
  const doors={};
  for(const [name,z,sign] of [['inner-door',2.75,1],['outer-door',5,-1]]){
    const pivot=new THREE.Group();pivot.name=name;pivot.position.set(-.805,0,z);group.add(pivot);parts[name]=pivot;doors[name]={pivot,sign};
    const leaf=mesh(`${name}.leaf`,plate(.794,1.139,.095,1.925),'structure',pivot);leaf.position.x=.805;
    const gasket=mesh(`${name}.gasket`,annulus(Array.from({length:48},(_,i)=>rectPoint(i/48*Math.PI*2,.805,1.15,1.925)),Array.from({length:48},(_,i)=>rectPoint(i/48*Math.PI*2,.768,1.113,1.925)),.018),'seal',pivot);gasket.position.set(.805,0,sign>0?.058:-.058);
    for(const y of [1.12,2.66]){const h=mesh(`${name}.hinge.${y}`,new THREE.CylinderGeometry(.065,.065,.18,12),'dark',pivot);h.position.set(0,y,0);}
    const inset=mesh(`${name}.inspection-window`,plate(.23,.18,.008,2.27),'glass',pivot);inset.position.set(.805,0,.064);
    box(`${name}.handle`,[.055,.33,.075],[1.31,1.7,.1],'dark',pivot);
    box(`${name}.status`,[.27,.035,.022],[.805,2.68,.071],'accent',pivot);
  }
  // A single person can stand, rest and use the terminal without opening the pressure shell.
  box('berth.base',[.85,.27,1.86],[-1.25,1,-.52],'dark');
  const mattress=mesh('berth.mattress',plate(.40,.89,.13),'fabric');mattress.rotation.x=-Math.PI/2;mattress.position.set(-1.25,1.22,-.52);
  box('berth.pillow',[.65,.12,.37],[-1.25,1.33,-1.26],'interior');
  for(const z of [-1.2,-.45,.3])box(`berth.storage.${z}`,[.76,.22,.64],[-1.25,.96,z],'interior');
  box('life-support.cabinet',[.55,1.63,1.19],[1.84,1.615,-1.13],'interior');
  box('terminal.screen',[.03,.55,.72],[1.55,1.98,-1.12],'dark');
  for(let i=0;i<5;i++)box(`terminal.readout.${i}`,[.034,.019,.22+i*.065],[1.525,2.14-i*.09,-1.1],'accent');
  box('terminal.desk',[.58,.075,.79],[1.31,1.34,-1.13],'dark');
  for(let i=0;i<7;i++)box(`life-support.vent.${i}`,[.035,.025,.45],[1.551,1.11+i*.045,-1.12],'dark');
  cyl('stool.pedestal',.085,.36,[0,.98,0],'dark');cyl('stool.seat',.3,.1,[0,1.2,0],'fabric');
  box('storage.rations',[1.09,.47,.42],[0,1.075,-1.95],'interior');
  box('storage.marking',[.39,.055,.01],[0,1.16,-1.734],'dark');
  for(const x of [-1.3,1.3]){box(`ceiling.luminaire.${x}`,[.075,.035,1.48],[x,4.59,-.1],'warm');}
  box('airlock.luminaire',[.055,.03,1.58],[0,2.995,3.83],'warm');
  for(const [name,pos,intensity] of [['habitat',[0,3.9,-.35],25],['airlock',[0,2.82,3.85],7]]){const light=new THREE.PointLight(0xffe3b9,intensity,7,2);light.name=`light.${name}`;light.position.set(...pos);group.add(light);}
  for(const [name,s] of Object.entries(SPEC.sockets)){const o=new THREE.Object3D();o.name=name;o.visible=false;o.position.fromArray(s.position);o.quaternion.fromArray(s.quaternion);group.add(o);sockets[name]=o;}
  let state='closed',amount=0,disposed=false;
  function setDoors(next,value=1){if(!['closed','inner','outer'].includes(next))throw new Error(`surface-habitat: unknown state ${next}`);state=next;amount=next==='closed'?0:THREE.MathUtils.clamp(value,0,1);for(const [name,d] of Object.entries(doors))d.pivot.rotation.y=name===`${next}-door`?d.sign*amount*Math.PI/2:0;}
  function inRoom(x,z,r=0){return (x/(1.94-r))**2+(z/(2.13-r))**2<=1;}
  function inCorridor(x,z,r=0){return Math.abs(x)<=.67-r&&z>=1.4&&z<=5.1;}
  function floorAtLocal(x,z){if(inRoom(x,z)||inCorridor(x,z))return .8;if(Math.abs(x)<=.86&&z>5.1&&z<=6.5)return Math.max(0,.8-Math.floor((z-5.06)/.36)*.2);return null;}
  function ceilingAtLocal(x,z){if(inCorridor(x,z)&&z>2.45)return 3.04;if(inRoom(x,z))return 2.85+2.59*Math.sqrt(Math.max(0,1-(x/3.24)**2-(z/3.55)**2));return Infinity;}
  function blockedLocal(x,z,r=.3){
    if(!inRoom(x,z,r)&&!inCorridor(x,z,r))return true;
    if(x>-1.72-r&&x<-.8+r&&z>-1.5-r&&z<.5+r)return true;
    if(x>1.02-r&&x<2.22+r&&z>-1.8-r&&z<-.4+r)return true;
    if(Math.abs(z-2.75)<r+.06&&!(state==='inner'&&amount>.92))return true;
    if(Math.abs(z-5)<r+.06&&!(state==='outer'&&amount>.92))return true;
    return false;
  }
  function getMetrics(){let triangles=0,meshes=0;const geos=new Set();group.traverse(o=>{if(o.isMesh){meshes++;geos.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {triangles,renderedTriangles:null,drawCalls:null,meshes,geometries:geos.size,generatedTextures:[],lod,geometryHash:null,seed};}
  function dispose(){if(disposed)return;disposed=true;for(const geo of owned)geo.dispose();group.clear();}
  setDoors('closed');return {group,parts,sockets,layout:HABITAT_LAYOUT,setDoors,setState:setDoors,floorAtLocal,ceilingAtLocal,blockedLocal,getMetrics,dispose,get doorState(){return {state,amount};}};
}

export function createHabitatMaterials(){return {
  structure:new THREE.MeshStandardMaterial({color:0xe8e6de,roughness:.42,metalness:.22}),
  interior:new THREE.MeshStandardMaterial({color:0xc8ccca,roughness:.77,metalness:.12}),
  dark:new THREE.MeshStandardMaterial({color:0x26343d,roughness:.56,metalness:.38}),
  seal:new THREE.MeshStandardMaterial({color:0x141d22,roughness:.84}),
  fabric:new THREE.MeshStandardMaterial({color:0x58777b,roughness:.96}),
  glass:new THREE.MeshStandardMaterial({color:0x73c9dc,emissive:0x28647a,emissiveIntensity:.27,roughness:.21,metalness:.48}),
  accent:new THREE.MeshStandardMaterial({color:0x94dfdf,emissive:0x3ab6c0,emissiveIntensity:.6,roughness:.4}),
  warm:new THREE.MeshStandardMaterial({color:0xffe5bf,emissive:0xffd49a,emissiveIntensity:.9,roughness:.5})};}
export function createHabitat(options={}){const own=!options.materials,materials=options.materials||createHabitatMaterials(),item=create({...options,materials}),release=item.dispose;let disposed=false;item.dispose=()=>{if(disposed)return;disposed=true;release();if(own)Object.values(materials).forEach(m=>m.dispose());};return item;}
