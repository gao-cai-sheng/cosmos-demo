// One small save file follows the player through the existing static scenes.
export const SAVE_KEY = 'cosmos.mars.journey.v1';
export const SETTINGS_KEY = 'cosmos.mars.settings.v1';
export const SURVEY_IDS = ['soil', 'power', 'comms'];
export const DEFAULT_SITE = { lat: -13.375, lon: 300.125, name: '科普剌忒斯谷地' };
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
    version: 1, startedAt: raw.startedAt, updatedAt: finite(raw.updatedAt, raw.startedAt),
    site: { lat: finite(site.lat, DEFAULT_SITE.lat, -88, 88),
      lon: ((finite(site.lon, DEFAULT_SITE.lon) % 360) + 360) % 360,
      name: name(site.name, DEFAULT_SITE.name) },
    landed: raw.landed === true,
    survey: raw.landed ? survey : [], rover: vehicle(raw.rover),
    campuses, parkRover: vehicle(raw.parkRover), greenhouseVisited,
    commissioned: campuses.length >= 2 && greenhouseVisited && raw.commissioned === true,
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

export function startJourney(site = DEFAULT_SITE) {
  const now = Date.now();
  return write({ version: 1, startedAt: now, updatedAt: now, site,
    landed: false, survey: [], rover: null, campuses: [], commissioned: false });
}

export function updateJourney(patch) {
  const current = getJourney() || startJourney();
  return write({ ...current, ...patch, version: 1, startedAt: current.startedAt, updatedAt: Date.now() });
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
    return { quality: raw?.quality === 'low' ? 'low' : 'standard', sound: raw?.sound === true };
  } catch { return { quality: 'standard', sound: false }; }
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
