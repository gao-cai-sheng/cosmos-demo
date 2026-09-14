const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function arrivalFrame(seconds) {
  const t = Math.max(0, Math.min(30, Number.isFinite(seconds) ? seconds : 0));

  let supplyAltitude = 0;
  let supplyChute = 0;
  let supplyThrust = 0;
  let supplyHeat = 0;
  if (t < 2.8) {
    const u = t / 2.8;
    supplyAltitude = lerp(900, 250, smooth(u));
    supplyHeat = Math.sin(u * Math.PI) * 0.9;
  } else if (t < 5.5) {
    const u = (t - 2.8) / 2.7;
    supplyAltitude = lerp(250, 0, smooth(u));
    supplyChute = t < 4.7 ? clamp01((t - 2.8) / 0.55) : clamp01((5.5 - t) / 0.8);
    supplyThrust = clamp01((t - 4.2) / 0.5) * (1 - smooth((t - 4.2) / 1.3) * 0.55);
  }

  // The landed pod raises its own camera mast; MU-7 stays aboard NX07 inside ARES.
  const mastDeploy = t < 6 ? 0 : smooth((t - 6) / 3.5);
  const mastLink = t < 10.5 ? 0 : smooth((t - 10.5) / 2);
  const mastReady = t >= 12.5;

  let kestrelAltitude;
  let kestrelThrust = 0;
  let kestrelHeat = 0;
  if (t < 5) {
    const u = t / 5;
    kestrelAltitude = lerp(1100, 820, smooth(u));
    kestrelHeat = Math.sin(u * Math.PI) * 0.65;
  } else if (t < 14) {
    kestrelAltitude = lerp(820, 680, smooth((t - 5) / 9));
  } else if (t < 24) {
    const u = smooth((t - 14) / 10);
    kestrelAltitude = lerp(680, 45, u);
    kestrelThrust = lerp(0.86, 0.62, u);
  } else if (t < 28) {
    const u = smooth((t - 24) / 4);
    kestrelAltitude = lerp(45, 3, u);
    kestrelThrust = lerp(0.62, 0.46, u);
  } else {
    const u = smooth((t - 28) / 2);
    kestrelAltitude = lerp(3, 0, u);
    kestrelThrust = lerp(0.42, 0, u);
  }

  let phase;
  if (t < 5.5) phase = '先遣舱先行下降';
  else if (t < 9.5) phase = '先遣舱触地 · 相机桅杆升起';
  else if (t < 12.5) phase = '桅杆相机自检 · 链路握手';
  else if (t < 14) phase = '先遣舱地面相机接管';
  else if (t < 24) phase = 'NX07 动力下降';
  else if (t < 28) phase = '近地悬停 · 着陆区确认';
  else phase = t < 30 ? 'NX07 接地' : '着陆完成';

  return {
    seconds: t,
    phase,
    feed: mastReady ? 'POD MAST CAM' : 'NX07 VENTRAL CAM',
    supply: {
      altitude: supplyAltitude,
      chute: supplyChute,
      thrust: supplyThrust,
      heat: supplyHeat,
      landed: t >= 5.5,
      mast: mastDeploy,
      link: mastLink,
      ready: mastReady,
    },
    kestrel: {
      altitude: kestrelAltitude,
      thrust: kestrelThrust,
      heat: kestrelHeat,
      landed: t >= 30,
    },
    crew: {
      location: 'KESTREL CABIN',
      canExit: t >= 30,
    },
  };
}
