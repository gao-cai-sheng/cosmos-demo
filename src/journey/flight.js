import * as THREE from 'three';
import { makeDriveInput } from '../../tools/rover/输入.js';
import { localToGeo } from './route.js';

/** A small VTOL courier with inertial motion, terrain clearance and orbit handoff. */
export function createFlyer({ scene, camera, canvas, heightAt, blocked, ceilingAt, site, onBoard, onLand, onOrbit, notify }) {
  let active=false, paused=false, landing=false, transfer=null, speed=0, vertical=0, yaw=0, camYaw=0, camPitch=.24, distance=22, view=0;
  const pos=new THREE.Vector3(), look=new THREE.Vector3();
  const ctl=makeDriveInput(window,{canvas,enabled:false,touch:false});
  const craft=new THREE.Group();craft.name='KESTREL orbital courier';craft.visible=false;scene.add(craft);
  // Visual reference: swept pearl hull and three raised nacelles. +Z is forward.
  // Existing game scale: 13 m beam; origin is 2.3 m above the landing surface.
  const white=new THREE.MeshStandardMaterial({color:0xe4e7e5,roughness:.38,metalness:.32});
  const panel=new THREE.MeshStandardMaterial({color:0xc8cecf,roughness:.48,metalness:.38});
  const dark=new THREE.MeshStandardMaterial({color:0x202c34,roughness:.44,metalness:.65});
  const glass=new THREE.MeshStandardMaterial({color:0x071c2b,roughness:.18,metalness:.65});
  const light=new THREE.MeshStandardMaterial({color:0x53caff,emissive:0x0799ed,emissiveIntensity:1.8,roughness:.26,metalness:.3});
  const mesh=(geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);craft.add(m);m.castShadow=true;m.receiveShadow=true;return m;};
  const sphere=new THREE.SphereGeometry(1,48,24);
  const ellipsoid=(mat,x,y,z,sx,sy,sz)=>{const m=mesh(sphere,mat,x,y,z);m.scale.set(sx,sy,sz);return m;};
  // Closed loft, with a rounded perimeter and a broad aft shoulder tapering to the bow.
  const outline=new THREE.Shape();
  outline.moveTo(0,7.2);
  outline.bezierCurveTo(2.25,7.2,5.8,1.4,6.45,-2.6);
  outline.bezierCurveTo(6.7,-4.3,5.5,-4.65,3.7,-4.1);
  outline.bezierCurveTo(1.9,-3.4,-1.9,-3.4,-3.7,-4.1);
  outline.bezierCurveTo(-5.5,-4.65,-6.7,-4.3,-6.45,-2.6);
  outline.bezierCurveTo(-5.8,1.4,-2.25,7.2,0,7.2);
  const perimeter=outline.getPoints(32);
  perimeter.pop();
  const rings=[[.06,-.78],[.55,-.83],[.94,-.56],[1,-.24],[.99,.02],[.88,.28],[.62,.65],[.31,.93],[.035,1.05]];
  const vertices=[],indices=[],count=perimeter.length;
  for(const [scale,y] of rings)for(const p of perimeter)vertices.push(p.x*scale,y,p.y*scale);
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<count;i++){
    const a=r*count+i,b=r*count+(i+1)%count,c=b+count,d=a+count;
    indices.push(a,b,d,b,c,d);
  }
  const bottom=vertices.length/3;vertices.push(0,-.78,0);
  const top=vertices.length/3;vertices.push(0,1.05,0);
  for(let i=0;i<count;i++){
    indices.push(bottom,(i+1)%count,i);
    indices.push(top,(rings.length-1)*count+i,(rings.length-1)*count+(i+1)%count);
  }
  const hullGeo=new THREE.BufferGeometry();
  hullGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  hullGeo.setIndex(indices);hullGeo.computeVertexNormals();
  mesh(hullGeo,white).name='Swept lifting hull';
  // Fine panel seams follow the actual loft surface rather than floating above it.
  const seams=[];
  const segment=(a,b)=>seams.push(...a,...b);
  for(const r of [2,4,5,6]){
    const [scale,y]=rings[r];
    for(let i=0;i<count;i++){
      const a=perimeter[i],b=perimeter[(i+1)%count];
      segment([a.x*scale,y+.008,a.y*scale],[b.x*scale,y+.008,b.y*scale]);
    }
  }
  for(let i=0;i<count;i+=8)for(let r=4;r<7;r++){
    const p=perimeter[i],a=rings[r],b=rings[r+1];
    segment([p.x*a[0],a[1]+.009,p.y*a[0]],[p.x*b[0],b[1]+.009,p.y*b[0]]);
  }
  const seamGeo=new THREE.BufferGeometry();seamGeo.setAttribute('position',new THREE.Float32BufferAttribute(seams,3));
  craft.add(new THREE.LineSegments(seamGeo,new THREE.LineBasicMaterial({color:0x78868c,transparent:true,opacity:.42})));
  ellipsoid(panel,0,.82,-.4,1.35,.62,4.4);
  // Each nacelle has a recessed panoramic belt between separate upper/lower shells.
  for(const [x,y,z,sx,sz] of [[0,1.95,-2.35,1.65,3.9],[-3.95,1.35,-3.65,1.7,2.55],[3.95,1.35,-3.65,1.7,2.55]]){
    ellipsoid(panel,x,y-.72,z,.68,.9,sz*.65);
    ellipsoid(white,x,y-.18,z,sx,.63,sz);
    ellipsoid(glass,x,y+.08,z,sx*1.005,.26,sz*1.005);
    ellipsoid(white,x,y+.38,z,sx*.99,.55,sz*.98);
    const roofLines=[];
    for(const latitude of [.45,.85])for(let i=0;i<64;i++){
      for(const angle of [i/64*Math.PI*2,(i+1)/64*Math.PI*2])roofLines.push(
        x+Math.sin(angle)*sx*.991*Math.cos(latitude),y+.38+.551*Math.sin(latitude),z+Math.cos(angle)*sz*.981*Math.cos(latitude));
    }
    const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(roofLines,3));
    craft.add(new THREE.LineSegments(roofGeo,new THREE.LineBasicMaterial({color:0x879398,transparent:true,opacity:.45})));
    for(let i=-2;i<=2;i++)mesh(new THREE.BoxGeometry(.48,.025,.055),dark,x,y+.932,z+i*.12);
    // Repeated small blue windows are instanced to keep draw calls bounded.
    const windows=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.12,.025),light,40);
    const dummy=new THREE.Object3D();
    for(let i=0;i<40;i++){
      const angle=i/40*Math.PI*2;
      dummy.position.set(x+Math.sin(angle)*sx*1.003,y+.1,z+Math.cos(angle)*sz*1.003);
      dummy.rotation.set(0,Math.atan2(Math.sin(angle)/sx,Math.cos(angle)/sz),0);
      dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);
    }
    craft.add(windows);
    const exhaust=mesh(new THREE.CylinderGeometry(.48,.62,.22,32),dark,x,y-.2,z-sz+.16);exhaust.rotation.x=Math.PI/2;
    const core=mesh(new THREE.CylinderGeometry(.34,.34,.235,32),light,x,y-.2,z-sz+.12);core.rotation.x=Math.PI/2;
  }
  // Ventral blue array: inset disk, concentric rings and eight radial separators.
  mesh(new THREE.CylinderGeometry(1.5,1.5,.14,64),dark,0,-.88,3.75);
  mesh(new THREE.CylinderGeometry(1.25,1.25,.16,64),light,0,-.98,3.75);
  for(const radius of [.52,1.02,1.42]){
    const ring=mesh(new THREE.TorusGeometry(radius,.065,8,64),dark,0,-1.075,3.75);ring.rotation.x=Math.PI/2;
  }
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    const spoke=mesh(new THREE.BoxGeometry(.085,.06,1.0),dark,Math.sin(angle)*.82,-1.075,3.75+Math.cos(angle)*.82);spoke.rotation.y=angle;
  }
  for(const x of [-2.5,2.5]){
    for(let i=0;i<6;i++)mesh(new THREE.BoxGeometry(.42,.035,.08),dark,x,.43,-1.4+i*.18);
    mesh(new THREE.BoxGeometry(.48,.055,.8),panel,x,.24,2.4);
  }
  // Landing datum stays at -2.2, compatible with the existing clearance controller.
  for(const x of [-2.6,2.6])for(const z of [-2.4,2.5]){
    mesh(new THREE.CylinderGeometry(.11,.15,1.25,10),dark,x,-1.43,z);
    ellipsoid(panel,x,-2.08,z,.48,.12,.72);
  }
  const touch=document.createElement('div');touch.className='flight-touch';touch.hidden=true;
  const held=new Set();
  for(const [code,label] of [['forward','前进'],['back','后退'],['left','左转'],['right','右转'],['up','上升'],['down','下降'],['brake','悬停']]){
    const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label','飞行器'+label);
    b.onpointerdown=e=>{e.preventDefault();held.add(code);try{b.setPointerCapture(e.pointerId);}catch{}};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>held.delete(code));touch.append(b);
  }
  document.body.append(touch);
  const reset=()=>{held.clear();ctl.reset();};
  addEventListener('blur',reset);
  const isTouch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
  function syncInput(){ctl.setEnabled(active&&!paused&&!transfer&&!landing);touch.hidden=!(isTouch&&active&&!paused&&!transfer&&!landing);}
  function park(p){
    if(active)return;
    pos.set(p.x,heightAt(p.x,p.z)+2.3,p.z);yaw=p.heading||0;
    craft.position.copy(pos);craft.rotation.set(0,yaw,0);craft.visible=true;
  }
  function start(){
    if(active)return;
    pos.y=heightAt(pos.x,pos.z)+2.3;
    onBoard(); active=true;landing=false;transfer=null;speed=0;vertical=0;camYaw=0;craft.visible=true;syncInput();
    craft.position.copy(pos);craft.rotation.set(0,yaw,0);notify('游隼已就绪。E 上升、Q 下降，W/S 推进，A/D 转向；空格悬停。');
  }
  function land(){
    if(!active||transfer)return;
    if(blocked(pos.x,pos.z)){notify('下方有建筑或连廊，请先飞到开阔地再降落。');return;}
    landing=true;syncInput();notify('正在垂直降落，着陆后可从舱门步行离船。');
  }
  function orbit(target=null){
    if(!active||landing||transfer)return;
    const agl=pos.y-heightAt(pos.x,pos.z);
    if(agl<600){notify('先上升到离地 600 m，再启动轨道转移。');return;}
    transfer={elapsed:0,from:pos.y,target};reset();syncInput();notify('正在爬升，准备切入火星轨道。');
  }
  function update(dt){
    if(!active||paused||document.hidden)return;
    dt=Math.min(dt,.05);const ground=heightAt(pos.x,pos.z);
    if(transfer){
      transfer.elapsed+=dt;const t=Math.min(1,transfer.elapsed/7);
      pos.y=transfer.from+(160000-transfer.from)*(t*t*(3-2*t));speed*=Math.exp(-dt*2);
      if(t>=1){const geo=localToGeo(pos,site);const target=transfer.target;transfer=null;paused=true;onOrbit({ ...geo, target });return;}
    }else if(landing){
      speed*=Math.exp(-dt*6);vertical=-Math.min(120,Math.max(1.8,(pos.y-ground-2.3)*.9));
      pos.y=Math.max(ground+2.3,pos.y+vertical*dt);
      if(pos.y<=ground+2.31){landing=false;vertical=0;speed=0;reset();syncInput();onLand({x:pos.x,z:pos.z,heading:yaw});notify('已安全着陆。点击离船步行，或继续飞行。');}
    }else{
      const c=ctl.update(dt),boost=c.boost?3:1;if(c.camCycle)view=1-view;
      const throttle=held.has('forward')?1:held.has('back')?-1:c.throttle;
      const steering=held.has('right')?1:held.has('left')?-1:c.steer;
      yaw-=steering*dt*.9;camYaw-=c.lookX*.003;camPitch=THREE.MathUtils.clamp(camPitch+c.lookY*.003,-.2,1.2);
      distance=THREE.MathUtils.clamp(distance+c.zoom*2.5,12,100);
      const brake=c.brake||held.has('brake');
      speed=THREE.MathUtils.damp(speed,brake?0:throttle*90*boost,brake?4:1.4,dt);
      const up=(c.up&&!c.brake)||held.has('up'),down=c.down||held.has('down');
      vertical=THREE.MathUtils.damp(vertical,brake?0:((up?1:0)-(down?1:0))*80*boost,2.4,dt);
      const nx=pos.x+Math.sin(yaw)*speed*dt,nz=pos.z+Math.cos(yaw)*speed*dt;
      // Swept clearance avoids passing through a dome between frames.
      const surface=Math.max(heightAt(nx,nz)+2.3,ceilingAt(nx,nz)+2.3);
      if(Math.abs(nx)<180000&&Math.abs(nz)<180000&&pos.y+vertical*dt>=surface){pos.x=nx;pos.z=nz;}
      else {speed=0;}
      const currentSurface=Math.max(heightAt(pos.x,pos.z),ceilingAt(pos.x,pos.z))+2.3;
      pos.y=Math.max(currentSurface,Math.min(180000,pos.y+vertical*dt));
    }
    craft.position.copy(pos);craft.rotation.set(THREE.MathUtils.clamp(-speed/500,-.13,.13),yaw,0);
    const az=yaw+camYaw;
    camera.position.set(pos.x-Math.sin(az)*distance*Math.cos(camPitch),pos.y+Math.sin(camPitch)*distance+5,pos.z-Math.cos(az)*distance*Math.cos(camPitch));
    camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+2);
    look.copy(pos).y+=1;
    if(view){camera.position.set(pos.x+Math.sin(yaw)*7.6,pos.y+1.2,pos.z+Math.cos(yaw)*7.6);look.set(camera.position.x+Math.sin(az)*100,camera.position.y-Math.sin(camPitch-.24)*80,camera.position.z+Math.cos(az)*100);}
    camera.lookAt(look);camera.fov=view?68:60;camera.updateProjectionMatrix();
  }
  return {start,land,orbit,update,park,cycle(){view=1-view;},get view(){return view?"前向视野":"跟随视野";},
    leave(){if(!active||landing||transfer||pos.y-heightAt(pos.x,pos.z)>2.5||Math.abs(speed)>.5)return false;active=false;reset();syncInput();return true;},get active(){return active;},get position(){return pos;},get heading(){return yaw;},get speed(){return speed;},
    get altitude(){return active?Math.max(0,pos.y-heightAt(pos.x,pos.z)):0;},get transferring(){return!!transfer;},
    setPaused(value){paused=value;reset();syncInput();},get landing(){return landing;}};
}
