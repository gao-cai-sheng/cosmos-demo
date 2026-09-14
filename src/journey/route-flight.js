/**
 * NX07 按航线飞行（设计：docs/superpowers/specs/2026-09-14-route-chart-flight-design.md，因果见 DISCUSSION_LOG D15）。
 * 远程航线：起飞后实时掠地飞行 → 淡出进入全屏航线图加速巡航 → 换到终点地表场景 → 实时掠地进场并垂直降落（D16）。
 * 本地航线（6.4 km 内）全程实时飞行。
 */
import { mountRouteChart } from '../nav/route-chart.js';
import { buildLegs, routeTotals, transitSeconds, transitState, isLocalRoute, courseToYaw, courseDeg, loadPlan, savePlan, savePpos, SKIM } from '../nav/flight-plan.js';
import { localToGeo, geoToLocal } from './route.js';
import { sceneURL } from './state.js';

// ORBIT_ENTRY_M: the same 600 m AGL gate NX07 climbs through when it leaves for orbit (flight.js orbit()).
const PASS_M = 80, SAVE_EVERY_S = 2, ARRIVAL_POINT = { x: -65, z: -38, heading: 0 }, ORBIT_ENTRY_M = 600;
const PHASE_LABEL = { idle: '待命', local: '本地航线飞行', climb: '起飞掠地', fading: '转入航线图', cruise: '巡航转场', leaving: '抵达 · 切换场景', 'arrive-wait': '抵达 · 等待模型', descend: '掠地进场 · 自动降落' };
const yawToCourse = yaw => ((180 - yaw * 180 / Math.PI) % 360 + 360) % 360;

export function createRouteFlight({ flyer, site, findLandingSpot, notify, setOverlay, arrival = null, shipReady = () => true, onShipReady = () => {}, onDepart = () => {},
  navigate = href => location.assign(href), storage = globalThis.localStorage }) {
  let phase = arrival ? 'arrive-wait' : 'idle', chart = null, transit = null, saveClock = 0, memoryPlan = null;
  const shipGeo = () => localToGeo(flyer.position, site);
  const fraction = () => transit ? Math.min(1, transit.elapsed / transit.seconds) : 0;
  const plan = () => { const saved = loadPlan(storage, shipGeo()); return saved || memoryPlan; };

  function ensureChart() {
    if (!chart) chart = mountRouteChart(document.body, {
      getOwnship: () => ({ ...shipGeo(), heading: yawToCourse(flyer.heading) }),
      getPlan: () => plan()?.route || null,
      onSend: send, onAbort: abort,
      onClose: () => { if (phase !== 'cruise' && phase !== 'leaving') setOverlay(false); },
    });
    return chart;
  }
  function open() {
    if (phase === 'cruise' || phase === 'leaving') return;
    setOverlay(true); ensureChart().open();
  }
  function send(route) {
    if (route.length < 2) return '至少需要一个目的地';
    const saved = savePlan(storage, route, true);
    memoryPlan = { sent: true, route };
    if (phase === 'cruise') { beginCruise(route, { reroute: true }); return '已改航 · 从当前位置按新航线巡航'; }
    if (flyer.active && !flyer.landing && !flyer.transferring) { chart?.close(); start(route); return ''; }
    return saved ? '航线已发送游隼 · 登上 NX07 后在操作台点“按航线飞行”' : '无法写入本机存储：航线只在本页有效';
  }
  function start(route = plan()?.sent ? plan().route : null) {
    if (!route || route.length < 2) { notify('没有已发送的航线。先打开航线图规划并发送。'); return false; }
    if (!flyer.active) { notify('请先登上 NX07，再按航线飞行。'); return false; }
    if (flyer.landing || flyer.transferring) { notify('等待当前降落或轨道转移完成。'); return false; }
    flyer.cancelPilot();
    const own = shipGeo(), r = [{ id: 'PPOS', lat: own.lat, lon: own.lon, mode: 'auto' }, ...route.slice(1)];
    if (isLocalRoute(r)) return startLocal(r);
    const legs = buildLegs(r), skim = { skim: true, heading: courseToYaw(legs[0].crs), speed: SKIM.speedMs, agl: SKIM.aglM };
    let skimmed = 0;
    // Count skim time only once the gear is up and the ship is actually low-level cruising.
    const track = dt => {
      if (!flyer.grounded && flyer.asset.gearProgress < .001 && flyer.altitude > SKIM.aglM * .5) skimmed += dt;
      if (skimmed >= SKIM.departSeconds && phase === 'climb') { phase = 'fading'; fadeThen(() => beginCruise(r)); }
      return skim;
    };
    if (!flyer.pilot(track)) return false;
    phase = 'climb';
    notify(`按航线飞行：自动起飞，沿 ${String(Math.round(legs[0].crs)).padStart(3, '0')}° 离地 ${SKIM.aglM} m 掠地飞行 ${SKIM.departSeconds} 秒，然后进入航线图巡航。W/S/A/D/E/Q/空格任意键接管。`);
    return true;
  }
  // Short black fade so the low-level flight hands over to the chart instead of cutting.
  let fade = null;
  function fadeThen(next) {
    if (!fade) { fade = document.createElement('div'); fade.setAttribute('aria-hidden', 'true'); fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .6s ease;z-index:2147483000'; document.body.append(fade); }
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    setTimeout(() => { if (phase === 'fading') next(); requestAnimationFrame(() => { fade.style.opacity = '0'; }); }, 650);
  }
  // All waypoints inside the local terrain: fly through them for real and land at the last one.
  function startLocal(r) {
    const pts = r.slice(1).map(w => ({ id: w.id, ...geoToLocal(w, site) }));
    let index = 0, spot = null, searched = false;
    const track = () => {
      const p = flyer.position;
      while (index < pts.length - 1 && Math.hypot(pts[index].x - p.x, pts[index].z - p.z) < PASS_M) index++;
      const t = pts[index];
      if (index < pts.length - 1) return { x: t.x, z: t.z, hover: true, radius: 0 };
      if (!searched) {
        searched = true; spot = findLandingSpot({ x: t.x, z: t.z, heading: flyer.heading });
        if (!spot) notify(`${t.id} 附近没有可着陆平地，NX07 在上空悬停；可手动飞到开阔地降落。`);
      }
      return spot || { x: t.x, z: t.z, hover: true, radius: 0 };
    };
    if (!flyer.pilot(track, () => { phase = 'idle'; finishPlan(shipGeo()); notify(`已按航线到达 ${pts.at(-1).id} 并降落，四足锁定。`); })) return false;
    phase = 'local';
    notify(`本地航线 ${pts.length} 个航路点，全程实时飞行。任意飞行键接管。`);
    return true;
  }
  function beginCruise(route, { reroute = false } = {}) {
    const from = reroute && transit ? transitState(transit.legs, fraction()).pos : shipGeo();
    const r = [{ id: 'PPOS', lat: from.lat, lon: from.lon, mode: 'auto' }, ...route.slice(1)];
    const legs = buildLegs(r), km = routeTotals(legs).km;
    transit = { route: r, legs, km, seconds: transitSeconds(km), elapsed: 0 };
    flyer.cancelPilot(); phase = 'cruise'; setOverlay(true); ensureChart().open(); pushTransit();
    if (!reroute) notify(`进入巡航转场 · ${Math.round(km).toLocaleString('en-US')} km · 加速播放约 ${Math.round(transit.seconds)} 秒`);
  }
  function pushTransit() {
    const f = fraction(), st = transitState(transit.legs, f);
    chart.setTransit({ pos: st.pos, course: st.course, leg: st.leg, mode: st.mode, kmLeft: st.kmLeft, secondsLeft: transit.seconds * (1 - f), remaining: transit.route.slice(st.leg) });
  }
  function finishPlan(at) {
    savePpos(storage, at);
    savePlan(storage, [{ id: 'PPOS', lat: at.lat, lon: at.lon }], false);
    memoryPlan = null; chart?.reload();
  }
  // hdg: the course NX07 is flying on arrival, so the new scene can start the skim approach from behind the pad.
  function arrive(dest, course) {
    phase = 'leaving';
    finishPlan(dest); onDepart();
    navigate(sceneURL('surface', { from: 'route', explore: 1, lat: dest.lat.toFixed(4), lon: dest.lon.toFixed(4), hdg: Math.round(course) }));
  }
  function finalCourse() {
    const r = transit.route, prev = r.at(-2), end = r.at(-1);
    return (courseDeg(end, prev) + 180) % 360;
  }
  function abort() {
    if (phase !== 'cruise') return;
    const st = transitState(transit.legs, fraction());
    notify('中止巡航，在当前位置下方降落。');
    arrive(st.pos, st.course);
  }
  // New scene after a cruise: NX07 enters 6 km short of the pad at skim height and speed, then skims in and lands.
  // From orbit (arrival.orbit) it re-enters at the 600 m orbit gate straight above the pad and descends vertically.
  function spawn() {
    if (flyer.asset.group.userData.assetState !== 'ready') return;
    const orbit = arrival?.orbit === true;
    const course = Number.isFinite(arrival?.heading) ? arrival.heading : 0, yaw = courseToYaw(course);
    const spot = findLandingSpot({ ...ARRIVAL_POINT, heading: yaw }), at = spot || ARRIVAL_POINT, back = orbit ? 0 : SKIM.approachM;
    const x = at.x - Math.sin(yaw) * back, z = at.z - Math.cos(yaw) * back;
    flyer.spawnAirborne(orbit ? { x, z, heading: yaw, altitude: ORBIT_ENTRY_M, speed: 0 } : { x, z, heading: yaw, altitude: SKIM.aglM, speed: SKIM.speedMs });
    onShipReady();
    if (!flyer.start()) { phase = 'idle'; return; }
    const target = !spot ? { x: at.x, z: at.z, hover: true, radius: 0 } : orbit ? { x: spot.x, z: spot.z, heading: spot.heading } : { x: spot.x, z: spot.z, heading: spot.heading, approach: { speed: SKIM.speedMs, agl: SKIM.aglM, decel: SKIM.decel } };
    flyer.pilot(() => target, () => { phase = 'idle'; notify(orbit ? '已从轨道降落，四足锁定。' : '已按航线抵达并降落，四足锁定。'); });
    phase = 'descend';
    // A refresh from here on should load a parked ship, not replay the arrival.
    try { const url = new URL(location.href); url.searchParams.delete('from'); url.searchParams.delete('hdg'); history.replaceState(history.state, '', url); } catch {}
    notify(!spot ? '目的地附近没有可着陆平地，NX07 低空悬停等待；请手动飞到开阔地降落。'
      : orbit ? `已再入，离地 ${ORBIT_ENTRY_M} m 位于着陆点正上方，垂直降落；任意飞行键接管。`
      : `已抵达目的地，离地 ${SKIM.aglM} m 掠地进场，距着陆点 ${SKIM.approachM / 1000} km；任意飞行键接管。`);
  }
  function cancel() {
    if (phase === 'cruise') { abort(); return; }
    if (flyer.cancelPilot('自动航线已取消，转为手动飞行。') || phase === 'fading') phase = 'idle';
  }
  // Scene dt stops while an overlay is open, so the cruise (which IS an overlay) runs on wall time.
  let lastNow = 0;
  function tick(dt, { now = performance.now(), halted = false } = {}) {
    const wall = lastNow ? Math.min(.1, Math.max(0, (now - lastNow) / 1000)) : 0; lastNow = now;
    if (phase === 'cruise') {
      if (halted || !wall) return;
      transit.elapsed += wall; pushTransit();
      if (fraction() >= 1) arrive(transit.route.at(-1), finalCourse());
      return;
    }
    if (phase === 'arrive-wait') { spawn(); return; }
    // Pilot input (or leaving the ship) ends the autopilot inside flight.js; mirror it here.
    if ((phase === 'local' || phase === 'climb' || phase === 'fading' || phase === 'descend') && !flyer.piloting) phase = 'idle';
    if (phase === 'leaving' || !dt) return;
    saveClock += dt;
    if (saveClock >= SAVE_EVERY_S && shipReady()) { saveClock = 0; savePpos(storage, shipGeo()); }
  }
  return {
    open, start: () => start(), cancel, tick,
    get phase() { return phase; },
    get active() { return phase !== 'idle'; },
    get arriving() { return phase === 'arrive-wait'; },
    get planReady() { return !!plan()?.sent && plan().route.length > 1; },
    get status() {
      if (phase === 'cruise' && transit) { const st = transitState(transit.legs, fraction()); return `${PHASE_LABEL.cruise} · 剩余 ${Math.round(st.kmLeft)} km`; }
      if (phase === 'descend' && arrival?.orbit) return '轨道再入 · 垂直降落';
      if (phase !== 'idle') return PHASE_LABEL[phase];
      const p = plan(); return p?.sent && p.route.length > 1 ? `已载入 ${p.route.slice(1).map(w => w.id).join(' › ')}` : '未载入航线';
    },
  };
}
