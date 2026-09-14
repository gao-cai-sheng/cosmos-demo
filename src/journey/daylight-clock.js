export function daylightClock(phase, mode='auto') {
  const turn=Math.PI*2,p=((phase%turn)+turn)%turn;
  if(mode!=='auto')return {night:p>=Math.PI,seconds:null,text:`固定${{night:'夜景',dawn:'晨曦',noon:'正午',dusk:'黄昏'}[mode]||'时段'} · 切回自动后计时`};
  const night=p>=Math.PI,seconds=Math.ceil(((night?turn:Math.PI)-p)/turn*1200-1e-9);
  return {night,seconds,text:`${night?'距天亮':'距日落'} ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`};
}
