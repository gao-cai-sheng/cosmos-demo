/** Collision-limited fraction of a third-person camera's desired boom. */
export function createCameraBoom({releaseDelay=.28,releaseRate=4}={}){
  let fraction=1,openTime=0,lastSafe=1;
  const clamp=v=>Math.max(0,Math.min(1,v));
  const safeValue=v=>Number.isFinite(v)?clamp(v):0;

  return {
    get fraction(){return fraction;},
    // Call when entering a view or starting a new subject; old collision history
    // must not pull the new camera toward the previous subject.
    reset(safeFraction=1){
      fraction=lastSafe=safeValue(safeFraction);
      openTime=0;
      return fraction;
    },
    update(dt,safeFraction){
      const safe=safeValue(safeFraction);
      if(safe<fraction){
        // Safety wins over animation: the returned eye never crosses this frame's limit.
        fraction=safe;
        openTime=0;
      }else if(safe<lastSafe-.005){
        // A receding clearance is not a stable opening, even while still ahead
        // of the current eye.
        openTime=0;
      }
      if(safe>fraction&&Number.isFinite(dt)&&dt>0){
        const before=Math.max(0,openTime-releaseDelay);
        openTime+=dt;
        const released=Math.max(0,openTime-releaseDelay)-before;
        fraction+=(safe-fraction)*(1-Math.exp(-releaseRate*released));
      }else if(safe<=fraction){
        openTime=0;
      }
      lastSafe=safe;
      fraction=Math.min(fraction,safe);
      return fraction;
    }
  };
}
