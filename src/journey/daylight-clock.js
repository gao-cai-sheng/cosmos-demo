/** 新任务开场的昼夜相位。initialY 是场景里太阳方向的高度分量（sin 仰角）。
 * 原来的开场是黄昏：太阳在下午、离日落只有 94 秒。morning 取镜像的上午：同样的太阳高度，所以开场的光影一模一样，
 * 只是太阳在升、离日落还有 8 分多钟。艾琳任务卡模式用它（D70）：前两章不该在黑夜里玩。 */
export function startPhase(initialY, morning=false) {
  const rise=Math.asin(Math.max(-1,Math.min(1,initialY/.65)));
  return morning?rise:Math.PI-rise;
}

export function daylightClock(phase, mode='auto') {
  const turn=Math.PI*2,p=((phase%turn)+turn)%turn;
  if(mode!=='auto')return {night:p>=Math.PI,seconds:null,text:`固定${{night:'夜景',dawn:'晨曦',noon:'正午',dusk:'黄昏'}[mode]||'时段'} · 切回自动后计时`};
  const night=p>=Math.PI,seconds=Math.ceil(((night?turn:Math.PI)-p)/turn*1200-1e-9);
  return {night,seconds,text:`${night?'距天亮':'距日落'} ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`};
}
/** 游戏昼夜相位 → 当地太阳时的一天比例（0.5 = 正午）。phase 0 日出、π/2 正午、π 日落，
 * 对应 06:00 / 12:00 / 18:00，航线图的晨昏线用它和场景天色对齐。*/
export function dayFractionOfPhase(phase) {
  const f=(.25+phase/(Math.PI*2))%1;
  return f<0?f+1:f;
}

/** Absolute elapsed seconds at the next sunrise plus a small visible morning margin. */
export function nextDawnElapsed(start, elapsed) {
  const cycle=1200, phase=start+elapsed/cycle*Math.PI*2;
  return ((Math.floor(phase/(Math.PI*2))+1)*Math.PI*2+.1-start)/(Math.PI*2)*cycle;
}

/** After the first night, keep advancing through noon then stop at an afternoon sun. */
export function advanceTutorialDay(start,elapsed,seconds){
 const turn=Math.PI*2,phase=start+elapsed/1200*turn,cycle=Math.floor(phase/turn);
 const stop=cycle*turn+Math.PI-.6;
 const capped=Math.min(phase+Math.max(0,seconds)/1200*turn,stop);
 return Math.max(elapsed,(capped-start)/turn*1200);
}

/** 教学白昼到达下午截止点后，停止显示不会兑现的日落倒计时。 */
export function tutorialDayClock(phase,mode='auto',held=false){
 const turn=Math.PI*2,p=((phase%turn)+turn)%turn;
 return held&&mode==='auto'&&p>=Math.PI-.6-1e-9&&p<Math.PI
  ?{night:false,seconds:null,text:'下午 · 教学白昼'}:daylightClock(phase,mode);
}
