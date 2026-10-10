import { normalizeSupport } from './support.js';
// One small save file follows the player through the existing static scenes.
import { normalizePlayer } from './player.js';
import { geoToLocal, localToGeo } from './route.js';
import { normalizeMainlineSurvivalState } from './mainline-survival.js';
import { TASK_ORDER } from '../relics/order.js';
export const SAVE_KEY = 'cosmos.mars.journey.v1';
export const SETTINGS_KEY = 'cosmos.mars.settings.v1';
export const SURVEY_IDS = ['soil', 'power', 'comms'];
// 默认着陆点：埃律西昂平原，洞察号着陆器以南约 7 km，坐标落在 MOLA 4 px/° 格子中心（D60）。
// 原默认的科普剌忒斯谷底（-13.375, 300.125）实测停机坪 8 个朝向都落不下、周围近一半地面超过 16°，
// 保留为轨道选址时可以自己标的高难度点。
export const DEFAULT_SITE = { lat: 4.375, lon: 135.625, name: '埃律西昂平原' };
const ROOT = new URL('../../', import.meta.url);
let memory = null;
let storageOK = true;

const finite = (value, fallback, min = -Infinity, max = Infinity) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const name = (value, fallback) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, 28) : fallback;
const vehicle = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  ? { x: finite(value.x, 0, -200000, 200000), z: finite(value.z, 0, -200000, 200000),
      heading: finite(value.heading, 0), odo: finite(value.odo, 0, 0, 1e8) } : null;

/** 遗迹任务进度（D65）：active 是正在做的一处，done 记完成时间。照片另存 RELIC_PHOTOS_KEY。 */
function normalizeRelics(raw) {
  const done = {};
  for (const id of TASK_ORDER) {
    const at = raw?.done?.[id]?.at;
    if (Number.isFinite(at)) done[id] = { at };
  }
  const active = TASK_ORDER.includes(raw?.active) && !done[raw.active] ? raw.active : null;
  return { active, done };
}

/** 任务卡进度（D70）：done 记每张做完的卡的时间。卡的顺序在 src/cards/deck.js，这里只存、只挡坏数据。 */
function normalizeCards(raw) {
  const done = {};
  for (const [id, v] of Object.entries(raw?.done || {})) {
    if (/^[0-9A-Za-z-]{1,12}$/.test(id) && Number.isFinite(v?.at)) done[id] = { at: v.at };
  }
  return { done };
}

export function normalizeJourney(raw) {
  if (!raw || raw.version !== 1 || !Number.isFinite(raw.startedAt)) return null;
  const site = raw.site || DEFAULT_SITE;
  const survey = SURVEY_IDS.filter(id => Array.isArray(raw.survey) && raw.survey.includes(id));
  const campuses = [];
  if (raw.landed && survey.length === SURVEY_IDS.length && Array.isArray(raw.campuses)) {
    for (const campus of raw.campuses.slice(0, 4)) {
      if (!campus || !Number.isFinite(campus.x) || !Number.isFinite(campus.z)) continue;
      if (Math.abs(campus.x) > 4000 || Math.abs(campus.z) > 4000) continue;
      if (campuses.some(other => Math.hypot(other.x - campus.x, other.z - campus.z) < 340)) continue;
      campuses.push({ name: name(campus.name, `穹顶 ${campuses.length + 1}`), x: campus.x, z: campus.z });
    }
  }
  const greenhouseVisited = campuses.length > 0 && raw.greenhouseVisited === true;
  return {
    player: normalizePlayer(raw.player),
    version: 1, startedAt: raw.startedAt, updatedAt: finite(raw.updatedAt, raw.startedAt),
    site: { lat: finite(site.lat, DEFAULT_SITE.lat, -88, 88),
      lon: ((finite(site.lon, DEFAULT_SITE.lon) % 360) + 360) % 360,
      name: name(site.name, DEFAULT_SITE.name) },
    landed: raw.landed === true,
    survey: raw.landed ? survey : [], rover: vehicle(raw.rover),
    campuses, parkRover: vehicle(raw.parkRover), greenhouseVisited,
    commissioned: campuses.length >= 2 && greenhouseVisited && raw.commissioned === true,
    relics: normalizeRelics(raw.relics),
    cards: normalizeCards(raw.cards),
    support: normalizeSupport(raw.support),
    mainlineSurvival: normalizeMainlineSurvivalState(raw.mainlineSurvival),
  };
}

export function getJourney() {
  if (memory) return structuredClone(memory);
  try {
    memory = normalizeJourney(JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) || 'null'));
  } catch { memory = null; }
  return memory ? structuredClone(memory) : null;
}

function write(value) {
  memory = normalizeJourney(value);
  try {
    if (!globalThis.localStorage) throw new Error('Storage unavailable');
    localStorage.setItem(SAVE_KEY, JSON.stringify(memory));
    storageOK = true;
  } catch { storageOK = false; }
  if (globalThis.dispatchEvent && typeof CustomEvent !== 'undefined') {
    dispatchEvent(new CustomEvent('cosmos:journey-change', { detail: getJourney() }));
  }
  return getJourney();
}

export function startJourney(site = DEFAULT_SITE, player = null) {
  const now = Date.now();
  return write({ player, version: 1, startedAt: now, updatedAt: now, site,
    landed: false, survey: [], rover: null, campuses: [], commissioned: false, relics: normalizeRelics(null) });
}

export function updateJourney(patch) {
  const current = getJourney() || startJourney();
  return write({ ...current, ...patch, version: 1, startedAt: current.startedAt, updatedAt: Date.now() });
}

/** The mission's first landing site: where the outpost stands and the route chart's HOME points.
 * Route and orbit arrivals never overwrite it (they run with explore=1, outside journey saves). */
export function homeSite(state = getJourney()) {
  return state?.landed ? state.site : DEFAULT_SITE;
}

/** The delivery pod lands once, at the mission's first landing site (the default valley without a landed mission).
 * `offset` is its local position in that site's scene; returns where it stands in the scene centred on `site`,
 * or position null when it is farther than `rangeM` (another landing site). */
export function deliveryPod(site, offset, rangeM, state = getJourney()) {
  const home = homeSite(state), p = geoToLocal(localToGeo(offset, home), site);
  return { home, position: Math.hypot(p.x, p.z) <= rangeM ? p : null };
}

/* 遗迹照片（缩略图 JPEG，每张约 30 KB）单独一个键，不塞进主存档。存不下就只丢照片，任务照样算完成。 */
export const RELIC_PHOTOS_KEY = 'cosmos.mars.relic-photos.v1';
export function relicPhotos() {
  try { const v = JSON.parse(globalThis.localStorage?.getItem(RELIC_PHOTOS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}
export function saveRelicPhoto(id, image) {
  if (!TASK_ORDER.includes(id) || typeof image !== 'string') return false;
  try { localStorage.setItem(RELIC_PHOTOS_KEY, JSON.stringify({ ...relicPhotos(), [id]: { image, at: Date.now() } })); return true; }
  catch { return false; }
}

export function storageAvailable() { return storageOK; }
export function isJourneyMode() {
  return new URLSearchParams(globalThis.location?.search || '').get('journey') === '1';
}
export function journeyStage(state = getJourney()) {
  if (!state || !state.landed) return 'orbit';
  if (state.survey.length < SURVEY_IDS.length) return 'survey';
  if (!state.campuses.length) return 'deploy';
  if (state.commissioned) return 'complete';
  return 'build';
}
export function resumeScene(state = getJourney()) {
  const stage = journeyStage(state);
  return stage === 'orbit' ? 'orbit' : ['build', 'complete'].includes(stage) ? 'park' : 'surface';
}
export function sceneURL(scene, extra = {}) {
  const paths = { home: 'index.html', orbit: 'tools/mars-orbit.html', surface: 'tools/mars-vista.html', park: 'park/index.html' };
  if (!paths[scene]) throw new Error(`Unknown scene: ${scene}`);
  const url = new URL(paths[scene], ROOT);
  if (scene !== 'home') {
    url.searchParams.set('journey', '1');
    const site = getJourney()?.site || DEFAULT_SITE;
    url.searchParams.set('lat', String(site.lat));
    url.searchParams.set('lon', String(site.lon));
  }
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return url.href;
}

export function getSettings() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || '{}');
    return { quality: raw?.quality === 'low' ? 'low' : 'standard', sound: raw?.sound !== false, voice: raw?.voice !== false };
  } catch { return { quality: 'standard', sound: true, voice: true }; }
}
export function updateSettings(patch) {
  const settings = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* session still works */ }
  return settings;
}

if (globalThis.addEventListener) addEventListener('storage', event => {
  if (event.key === SAVE_KEY) {
    try { memory = normalizeJourney(JSON.parse(event.newValue)); } catch { memory = null; }
    dispatchEvent(new CustomEvent('cosmos:journey-change', { detail: getJourney() }));
  }
});
