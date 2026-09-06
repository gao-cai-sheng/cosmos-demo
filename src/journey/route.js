// Terrain-aware eight-neighbour A*. Both grid cells and their connecting edges
// are checked; a diagonal cannot cut through the corner of a building.
class Heap {
  items = [];
  push(item) { const a=this.items; a.push(item); let i=a.length-1; while(i){const p=(i-1)>>1;if(a[p].f<=item.f)break;a[i]=a[p];i=p;} a[i]=item; }
  pop() { const a=this.items, first=a[0], last=a.pop(); if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=last.f)break;a[i]=a[j];i=j;}a[i]=last;}return first; }
}
export function planTerrainRoute({ start, goal, heightAt, blocked = () => false, maxSlope = 26, resolution = 85, maxSpan = 8000 }) {
  const distance = Math.hypot(goal.x-start.x,goal.z-start.z);
  if (!Number.isFinite(distance) || distance > maxSpan*.8) return { ok:false, reason:'目标超出本地驾驶规划范围，请先搭乘飞行器接近。' };
  const margin=Math.max(100,distance*.35), span=Math.max(240,Math.abs(goal.x-start.x)+margin*2,Math.abs(goal.z-start.z)+margin*2);
  const n=resolution, cell=span/(n-1), ox=(start.x+goal.x-span)/2, oz=(start.z+goal.z-span)/2;
  const limit=Math.tan(maxSlope*Math.PI/180), count=n*n;
  const heights=new Float64Array(count), closed=new Uint8Array(count), solid=new Uint8Array(count);
  const costs=new Float64Array(count); costs.fill(Infinity);
  const parent=new Int32Array(count); parent.fill(-1);
  const position=i=>({x:ox+(i%n)*cell,z:oz+Math.floor(i/n)*cell});
  for(let i=0;i<count;i++){const p=position(i);heights[i]=heightAt(p.x,p.z);solid[i]=!Number.isFinite(heights[i])||blocked(p.x,p.z);}
  const edge=(a,b)=>{
    const length=Math.hypot(b.x-a.x,b.z-a.z); if(length<.001)return 0;
    const steps=Math.max(4,Math.ceil(length/Math.min(5,cell/2)));let h=heightAt(a.x,a.z), slope=0;
    if(blocked(a.x,a.z))return Infinity;
    for(let k=1;k<=steps;k++) {const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,nh=heightAt(x,z);
      if(blocked(x,z)||!Number.isFinite(nh))return Infinity;
      const grade=Math.abs(nh-h)/(length/steps);if(grade>limit)return Infinity;slope=Math.max(slope,grade);h=nh;
    }return slope;
  };
  const index=p=>Math.round((p.z-oz)/cell)*n+Math.round((p.x-ox)/cell);
  const first=index(start), last=index(goal);
  if(solid[first]||solid[last]||!Number.isFinite(edge(start,position(first)))||!Number.isFinite(edge(position(last),goal)))
    return {ok:false,reason:'起点或终点处于陡坡或建筑范围，请移到开阔地后重新规划。'};
  const heap=new Heap();costs[first]=0;heap.push({i:first,f:distance});
  const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  while(heap.items.length){const {i}=heap.pop();if(closed[i])continue;closed[i]=1;if(i===last)break;
    const x=i%n,z=Math.floor(i/n),p=position(i);
    for(const [dx,dz] of dirs){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=n||nz>=n)continue;
      const j=nz*n+nx;if(closed[j]||solid[j])continue;
      if(dx&&dz&&(solid[z*n+nx]||solid[nz*n+x]))continue;
      const q=position(j),len=cell*Math.hypot(dx,dz);
      if(Math.abs(heights[j]-heights[i])/len>limit)continue;
      const grade=edge(p,q);if(!Number.isFinite(grade))continue;
      const cost=costs[i]+len*(1+grade*grade*10)+Math.max(0,heights[j]-heights[i])*2;
      if(cost>=costs[j])continue;costs[j]=cost;parent[j]=i;heap.push({i:j,f:cost+Math.hypot(goal.x-q.x,goal.z-q.z)});
    }
  }
  if(!closed[last])return {ok:false,reason:`没有找到坡度不超过 ${maxSlope}° 的通路。试着移动起点、放宽坡度，或改用飞行器。`};
  const path=[];for(let i=last;i!==-1;i=parent[i])path.push(position(i));path.reverse();path.unshift({...start});path.push({...goal});
  let length=0,climb=0,slope=0;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];length+=Math.hypot(b.x-a.x,b.z-a.z);climb+=Math.max(0,heightAt(b.x,b.z)-heightAt(a.x,a.z));slope=Math.max(slope,edge(a,b));}
  return {ok:true,path,length,climb,maxSlope:Math.atan(slope)*180/Math.PI,cell};
}

export function pointSegmentDistance(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l)):0;
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}
export const MARS_RADIUS = 3396200;
export function localToGeo(p,site) {return {lat:Math.max(-88,Math.min(88,site.lat-p.z/MARS_RADIUS*180/Math.PI)),lon:((site.lon+p.x/(MARS_RADIUS*Math.cos(site.lat*Math.PI/180))*180/Math.PI)%360+360)%360};}
export function geoToLocal(p,site) {let dl=((p.lon-site.lon+540)%360)-180;return{x:dl*Math.PI/180*MARS_RADIUS*Math.cos(site.lat*Math.PI/180),z:(site.lat-p.lat)*Math.PI/180*MARS_RADIUS};}
