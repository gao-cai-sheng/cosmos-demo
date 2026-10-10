// 把游戏里的状态拍成一张任务卡看得懂的快照（D70）。只读，不改任何东西。
const xz = p => (p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : null);

/** 第一张卡的光圈：从站的地方往家门口走 step 米；离门不到两倍 step 就只走一半。 */
export function pickFirstStep(player, door, step = 10) {
  if (!player || !door) return null;
  const dx = door.x - player.x, dz = door.z - player.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return null;
  const s = Math.min(step, d * .5);
  return { x: player.x + dx / d * s, z: player.z + dz / d * s };
}

/** 「开回家」停在哪：从家门口朝飞船退出去，第一个车能停的点；都不行就用最远的那个。 */
export function pickHomePark(door, ship, canPark = () => true, steps = [30, 36, 42, 50]) {
  if (!door || !ship) return null;
  const dx = ship.x - door.x, dz = ship.z - door.z, d = Math.hypot(dx, dz) || 1;
  const at = s => ({ x: door.x + dx / d * s, z: door.z + dz / d * s });
  return at(steps.find(s => { const p = at(s); return canPark(p.x, p.z); }) ?? steps.at(-1));
}

/** mobility 是 src/journey/mobility.js 的返回值；surveyPoints 是地表场景的三个勘测信标 [{id,x,z}]。 */
export function createWorld({ mobility, getJourney, surveyPoints = [], survival, relicSites = null, homeScene = !!mobility.refuge }) {
  const spots = { firstStep: null, homePark: null, comms: null };
  const points = Object.fromEntries(surveyPoints.map(p => [p.id, { x: p.x, z: p.z }]));
  const at = {};
  for (const p of relicSites?.pieces || []) if (!at[p.id] && xz(p)) at[p.id] = xz(p);
  return {
    spots,
    read() {
      const m = mobility, r = m.refuge, c = m.carrier, f = m.flyer, a = m.astronaut, j = getJourney();
      const mode = c.active ? 'carrier' : f.active ? 'flight' : m.remote ? 'remote' : a.active ? 'walk' : 'overview';
      const delivered = m.roverStowed !== 'ship', inHome = !!r?.inside;
      const carAt = delivered && c.ready ? xz(c.position) : null;
      const carrier = carAt ? { ...carAt, speed: c.speed || 0 } : null;
      const ship = xz(f.position);
      const player = mode === 'carrier' ? xz(c.position) : mode === 'flight' ? ship
        : mode === 'remote' ? xz(m.roverPosition) : mode === 'walk' ? xz(a.position) : null;
      // 人在舱外时 target() 是门口；在舱里时是气闸里侧。两种情况卡片都叫它「门」。
      const door = r?.ready ? xz(r.target()) : null;
      if (!spots.firstStep && mode === 'walk' && !inHome) spots.firstStep = pickFirstStep(player, door);
      if (!spots.homePark && door && ship && !inHome) spots.homePark = pickHomePark(door, ship, (x, z) => c.canTraverse?.(x, z) ?? true);
      if (!spots.comms && r?.ready) spots.comms = xz(r.stationPoint?.('comms'));
      const relics = j?.relics;
      const shipGrounded = !!f.grounded;
      const port = shipGrounded ? f.asset?.openPorts?.find(no => no > 1) : null;
      const boardAt = (port && xz(f.asset.deckCentre?.(port - 1))) || ship;
      return { mode, player, inHome, delivered, // ARES 模型还在加载时（刷新页面后）roverStowed 也是 ''，要等车就位才算「小车在外面」。
      roverLoaded:!!c.loaded, roverOut: m.roverStowed === '' && !!c.ready, carrier, ship, door, spots,
        resting:!!r?.resting, survival: survival?.snapshot(), firstRelicDone: !!relics?.done?.INSG,
        survey: { done: j?.survey || [], points },
        homeScene, shipGrounded, shipHover: mode === 'flight' && !shipGrounded && Math.abs(f.speed || 0) < 3, boardAt,
        enRoute: !!m.autopilot?.active || !!m.routeFlight?.active,
        relics: { active: relics?.active ?? null, done: relics?.done || {}, at },
        relicStarted: !!relics?.active || Object.keys(relics?.done || {}).length > 0 };
    },
  };
}
