const clamp=t=>Math.max(0,Math.min(1,t));
const ease=t=>{const u=clamp(t);return u*u*(3-2*u);};

// The occupied lock always has both doors closed during pressure equalisation.
// Time is supplied by the host, so pause/background cannot complete a cycle.
export function refugeCycleFrame(seconds, entering=true){
  const t=Math.max(0,Number.isFinite(seconds)?seconds:0);
  const source=entering?'outer':'inner',destination=entering?'inner':'outer';
  if(t<.8)return {door:source,amount:ease(t/.8),leg:0,travel:0,label:'开启入口 · 保持宇航服密封',done:false};
  if(t<1.8)return {door:source,amount:1,leg:0,travel:ease(t-.8),label:'进入气闸',done:false};
  if(t<2.6)return {door:source,amount:1-ease((t-1.8)/.8),leg:1,travel:0,label:'关闭入口 · 检查门锁',done:false};
  if(t<4.6)return {door:'closed',amount:0,leg:1,travel:0,label:entering?'双门锁闭 · 气闸增压':'双门锁闭 · 气闸减压',done:false};
  if(t<5.4)return {door:destination,amount:ease((t-4.6)/.8),leg:1,travel:0,label:'压力匹配 · 开启出口',done:false};
  if(t<6.4)return {door:destination,amount:1,leg:1,travel:ease(t-5.4),label:entering?'进入生活舱':'返回火星地表',done:false};
  if(t<7.2)return {door:destination,amount:1-ease((t-6.4)/.8),leg:2,travel:1,label:'关闭出口 · 恢复密封',done:false};
  return {door:'closed',amount:0,leg:2,travel:1,label:entering?'舱内 · 双门已锁闭':'舱外 · 生活舱已密封',done:true};
}
