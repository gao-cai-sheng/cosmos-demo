/** Tyre tracks shared by ARES and MU-7: flat ribbons laid on the height field.
 *  Visual only — the ground is never deformed and wheel physics never reads them (DISCUSSION_LOG D33).
 *  Bounded ring buffer: once full, the oldest segment is overwritten. No three.js here, so node can test it. */
export function createTyreTrail({heightAt,wheels,width,capacity=8192,lift=.024,minStep=.06,maxJump=4,onWrite=()=>{}}){
 const positions=new Float32Array(capacity*18),anchors=Array.from({length:wheels},()=>({x:NaN,z:NaN}));
 const order=[0,1,2,2,1,3],corner=new Float32Array(8);let cursor=0,count=0;
 /** One quad from (ax,az) to (bx,bz); each corner sits on the ground just above the terrain. */
 function ribbon(ax,az,bx,bz,w=width){
  const dx=bx-ax,dz=bz-az,d=Math.hypot(dx,dz);if(d<.001)return;
  const nx=-dz/d*w/2,nz=dx/d*w/2;
  corner.set([ax+nx,az+nz,ax-nx,az-nz,bx+nx,bz+nz,bx-nx,bz-nz]);
  const base=cursor*18;
  for(let i=0;i<6;i++){const k=order[i]*2,x=corner[k],z=corner[k+1],o=base+i*3;positions[o]=x;positions[o+1]=heightAt(x,z)+lift;positions[o+2]=z;}
  cursor=(cursor+1)%capacity;count=Math.min(capacity,count+1);onWrite(count);
 }
 /** Feed wheel i's current ground point. A wheel off the ground, or one that jumped (teleport, reload), restarts its ribbon. */
 function step(i,x,z,moving,contact=true){
  const a=anchors[i];
  if(!contact||!Number.isFinite(a.x)){a.x=x;a.z=z;return;}
  const d=Math.hypot(x-a.x,z-a.z);
  if(d>maxJump){a.x=x;a.z=z;return;}
  if(moving&&d>minStep){ribbon(a.x,a.z,x,z);a.x=x;a.z=z;}
 }
 function reset(){for(const a of anchors)a.x=a.z=NaN;}
 return {positions,ribbon,step,reset,get count(){return count;},get cursor(){return cursor;}};
}
