/** Ground route follower. Produces normal controls; never teleports the vehicle. */
export function createAutopilot(notify=()=>{}) {
 let path=null,index=0,owner=null,anchor=null,stalled=0,braking=0;
 const stop=(message)=>{const was=!!path;path=null;owner=null;if(was)braking=1;if(was&&message)notify(message);};
 return {
  get active(){return !!path;},get owner(){return owner;},
  start(points,vehicle){if(!points||points.length<2)return false;path=points.map(p=>({...p}));index=1;braking=0;owner=vehicle;anchor=null;stalled=0;return true;},stop,
  drive(input,p,vehicle,dt,blocked=()=>false){
   if(!path){if(Math.abs(input.throttle)>.08||Math.abs(input.steer)>.08){braking=0;return input;}if(braking>0){braking-=dt;return {...input,throttle:0,steer:0,brake:1};}return input;}
   if(vehicle!==owner){stop('操作模式已切换，自动驾驶结束。');return input;}
   if(Math.abs(input.throttle)>.08||Math.abs(input.steer)>.08||input.brake){stop('已手动接管。');return input;}
   const brake=()=>({...input,throttle:0,steer:0,brake:1});
   const end=path.at(-1),remaining=Math.hypot(end.x-p.x,end.z-p.z);
   if(remaining<3){if(Math.abs(p.speed)<.2)stop('已到达目的地，自动驾驶结束。');return brake();}
   while(index<path.length-1&&Math.hypot(path[index].x-p.x,path[index].z-p.z)<(vehicle==='carrier'?5:3))index++;
   const target=path[index],angle=Math.atan2(Math.sin(Math.atan2(target.x-p.x,target.z-p.z)-p.heading),Math.cos(Math.atan2(target.x-p.x,target.z-p.z)-p.heading));
   const ahead=2+Math.abs(p.speed)*.8;
   if(blocked(p.x+Math.sin(p.heading)*ahead,p.z+Math.cos(p.heading)*ahead)){stop('前方通行受阻，已停止自动驾驶。');return brake();}
   if(!anchor||Math.hypot(p.x-anchor.x,p.z-anchor.z)>.5){anchor={...p};stalled=0;}else stalled+=dt;
   if(stalled>8){stop('车辆未能继续前进，请手动调整位置或重新规划。');return brake();}
   const desired=Math.min(vehicle==='carrier'?4:2.5,Math.max(.6,remaining*.35))/(1+Math.abs(angle)*2);
   return {...input,throttle:Math.max(0,Math.min(.7,(desired-p.speed)*.65)),steer:Math.max(-1,Math.min(1,-angle*1.8)),brake:p.speed>desired+.7?1:0,boost:false};
  }
 };
}
