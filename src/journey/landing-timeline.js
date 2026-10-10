const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
// Cubic Hermite from p0 to p1 over u = 0..1; m0 / m1 are the end slopes per unit u.
const hermite = (p0, p1, m0, m1, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

const POD_BRAKE_END = 3;          // s, braking burn done at 150 m
const POD_TOUCHDOWN = 9;          // s
const POD_TERMINAL_RATE = 25;     // m/s, mean rate over the last 150 m
// Entry rate that makes the braking leg decelerate evenly down to the terminal rate.
const POD_ENTRY_RATE = 2 * (900 - 150) / POD_BRAKE_END - POD_TERMINAL_RATE;
const MAST_UP = 9.3;              // s, mast starts to telescope
const LINK_UP = 11.3;             // s, mast up, link handshake starts
const MAST_READY = 12.5;          // s, pod feed takes over

export function arrivalFrame(seconds) {
  const t = Math.max(0, Math.min(30, Number.isFinite(seconds) ? seconds : 0));

  let supplyAltitude = 0;
  let supplyChute = 0;
  let supplyThrust = 0;
  let supplyHeat = 0;
  // The outpost lands on thrust, not under a canopy. What comes down now is a 33 m string of
  // pressurised modules standing on its own landing feet; no parachute you could draw would be
  // holding that up. So the burn starts high and carries the whole descent, the way NX07's does.
  //
  // Two legs. The braking burn takes it from 900 m to 150 m and bleeds the speed off to 25 m/s;
  // the terminal descent covers the last 150 m in six seconds and settles onto the feet. The
  // ventral camera looks straight down and cannot show height, so the shadow is the only cue —
  // with a low sun it lies ~3x the altitude away. The old leg did its last 250 m in 2.7 s, and
  // the shadow shot into frame and hit feet that already looked landed.
  if (t < POD_BRAKE_END) {
    const u = t / POD_BRAKE_END;
    supplyAltitude = hermite(900, 150, -POD_ENTRY_RATE * POD_BRAKE_END, -POD_TERMINAL_RATE * POD_BRAKE_END, u);
    supplyHeat = Math.sin(u * Math.PI) * 0.9;
    supplyThrust = clamp01((t - 1.9) / 1.1);               // retro burn lights before the shield cools
  } else if (t < POD_TOUCHDOWN) {
    const u = (t - POD_BRAKE_END) / (POD_TOUCHDOWN - POD_BRAKE_END);
    supplyAltitude = hermite(150, 0, -POD_TERMINAL_RATE * (POD_TOUCHDOWN - POD_BRAKE_END), 0, u);
    // Hover-weight thrust through the terminal leg, easing off as the feet settle.
    supplyThrust = lerp(1, 0.7, u) * (1 - smooth(clamp01((t - (POD_TOUCHDOWN - 0.6)) / 0.6)) * 0.75);
  }

  // The landed pod raises its own camera mast; MU-7 stays aboard NX07 inside ARES.
  // The mast and link are squeezed into the time left before 12.5 s, when the pod feed takes over.
  const mastDeploy = t < MAST_UP ? 0 : smooth((t - MAST_UP) / (LINK_UP - MAST_UP));
  const mastLink = t < LINK_UP ? 0 : smooth((t - LINK_UP) / (MAST_READY - LINK_UP));
  const mastReady = t >= MAST_READY;

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
  if (t < POD_TOUCHDOWN) phase = '先遣舱先行下降';
  else if (t < LINK_UP) phase = '先遣舱触地 · 相机桅杆升起';
  else if (t < MAST_READY) phase = '桅杆相机自检 · 链路握手';
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
      landed: t >= POD_TOUCHDOWN,
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
