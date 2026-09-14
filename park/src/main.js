import * as THREE from 'three';
import { createGrassField, createStructuredTree } from './vegetation.js';
import { getJourney, updateJourney, sceneURL, isJourneyMode, SURVEY_IDS, getSettings } from '../../src/journey/state.js';
import { mountJourneyUI } from '../../src/journey/ui.js';
import { mountMobility } from '../../src/journey/mobility.js';

const JOURNEY = isJourneyMode();
const savedJourney = JOURNEY ? getJourney() : null;
const savedCampuses = (savedJourney?.campuses || []).slice(0, 4);
let journeyUI = null;
let mobility = null;
let sceneReady = false;
let scenePaused = false;
let sceneTime = performance.now();
let resetCameraInput = () => {};

function editingText(target) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

function canAct() { return sceneReady && !scenePaused; }

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const loadBar = document.querySelector('#load-bar');
const loadPercent = document.querySelector('#load-percent');
const unsupported = document.querySelector('#unsupported');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TAU = Math.PI * 2;

/* ============================================================
   真实地形：MOLA MEGDR 4 px/度
   ------------------------------------------------------------
   原型里穹顶外面是一圈程序化噪声山。这里换成火星实测高程，
   站点选在科普剌忒斯峡谷谷底 —— 高程 −4.64 km，是火星上气压最高的
   地方之一（希腊平原之外），两侧崖壁挡风，又在赤道附近好补给。
   往北 30 km 就是 7.7 km 高的北壁，透过穹顶玻璃能看见。
   和 tools/mars-vista.html、tools/mars-orbit.html 用的是同一份数据。
   ============================================================ */
const PARK_QS = new URLSearchParams(window.location.search);
const SITE = (() => {
  if (JOURNEY && savedJourney?.site) return { lat: savedJourney.site.lat, lon: savedJourney.site.lon };
  const la = parseFloat(PARK_QS.get('lat')), lo = parseFloat(PARK_QS.get('lon'));
  if (Number.isFinite(la) && Number.isFinite(lo)) {
    return { lat: Math.max(-88, Math.min(88, la)), lon: ((lo % 360) + 360) % 360 };
  }
  return { lat: -13.375, lon: 300.125 };          // 默认：科普剌忒斯谷底采样格中心
})();
const R_M = 3396200;                              // 火星基准半径（米）
const D2R = Math.PI / 180;

if (typeof window.MOLA === 'undefined') {
  throw new Error('缺少 MOLA 高程数据：需要 ../data/mola_4ppd.js');
}
const TW = window.MOLA.w, TH = window.MOLA.h, HB = atob(window.MOLA.b64);

function molaRaw(ix, iy) {
  ix = ((ix % TW) + TW) % TW;
  iy = Math.max(0, Math.min(TH - 1, iy));
  const i = iy * TW + ix;
  let v = (HB.charCodeAt(i * 2) << 8) | HB.charCodeAt(i * 2 + 1);
  if (v & 0x8000) v -= 0x10000;
  return v;
}
function molaH(lat, lon) {
  const fx = (((lon % 360) + 360) % 360) / 0.25 - 0.5;
  const fy = (90 - lat) / 0.25 - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const a = molaRaw(x0, y0), b = molaRaw(x0 + 1, y0);
  const c = molaRaw(x0, y0 + 1), d = molaRaw(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
/* 14.8 km 一个采样点，会把 7.7 km 的崖壁抹成 15° 缓坡。
   减去 27 km 尺度的低通再加回差值，把采样吃掉的对比度补一部分回来。
   系数 0.45 是算过的：0.95 会把崖顶推到 21.6° 仰角，顶出画面。 */
function molaSharp(lat, lon) {
  const h = molaH(lat, lon), d = 0.45;
  const blur = (molaH(lat + d, lon) + molaH(lat - d, lon) +
                molaH(lat, lon + d) + molaH(lat, lon - d) + 2 * h) / 6;
  return h + 0.45 * (h - blur);
}
const SITE_H = molaSharp(SITE.lat, SITE.lon);

/* 站点是从上一幕带过来的，页面上的读数就不能写死。
   往北 30 km 的相对高差顺便算出来 —— 落在平原上时它接近 0，
   落在峡谷底才有那 7 km。数字必须跟着地点走，否则就是假仪表。 */
(function labelSite() {
  const fmt = (v, p, n) => Math.abs(v).toFixed(2) + '°' + (v >= 0 ? p : n);
  const summary = document.querySelector('.summary');
  if (summary) {
    summary.textContent = fmt(SITE.lat, 'N', 'S') + ' / ' +
      SITE.lon.toFixed(3) + '°E · 穹顶外的地形取自 MOLA 实测高程。';
  }
  /* 仪表读的是实测值 molaH，不是渲染用的 molaSharp。
     反锐化是为了把画面里的崖还原成崖，是绘图手段；
     把它当成高程报出去就成了假数据。 */
  const raw = molaH(SITE.lat, SITE.lon);
  const north = molaH(SITE.lat + 30000 / (R_M * D2R), SITE.lon) - raw;
  for (const row of document.querySelectorAll('.telemetry dl > div')) {
    const key = row.querySelector('dt');
    const val = row.querySelector('dd');
    if (!key || !val) continue;
    if (key.textContent === '站点高程') val.textContent = (raw / 1000).toFixed(2) + ' km';
    if (key.textContent === '北壁') val.textContent = '30 km / ' + (north >= 0 ? '+' : '') + (north / 1000).toFixed(1) + ' km';
  }
})();

// 本地米 → 经纬度。+X 东，+Z 南，所以正北是 −Z。
function siteLatLon(x, z) {
  const lat = SITE.lat + (-z) / (R_M * D2R);
  const lon = SITE.lon + x / (R_M * Math.max(0.05, Math.cos(lat * D2R)) * D2R);
  return [lat, lon];
}
function molaSlopeAt(lat, lon) {
  const d = 0.25;
  const gx = (molaH(lat, lon + d) - molaH(lat, lon - d)) / (2 * d * D2R * R_M * Math.cos(lat * D2R));
  const gy = (molaH(lat + d, lon) - molaH(lat - d, lon)) / (2 * d * D2R * R_M);
  return Math.hypot(gx, gy);
}
const DOME_BASE_RADIUS = 130;
const DOME_HEIGHT = 64;
const DOME_SPHERE_RADIUS = (DOME_BASE_RADIUS ** 2 + DOME_HEIGHT ** 2) / (2 * DOME_HEIGHT);
const DOME_CENTER_Y = DOME_HEIGHT - DOME_SPHERE_RADIUS;
const DOME_THETA = Math.acos((0 - DOME_CENTER_Y) / DOME_SPHERE_RADIUS);

const palette = {
  terrain: new THREE.Color('#8a4f39'),
  terrainDark: new THREE.Color('#4a3029'),
  rock: new THREE.Color('#6b4435'),
  steel: new THREE.Color('#8e918d'),
  steelDark: new THREE.Color('#292d2c'),
  shell: new THREE.Color('#c9c8bf'),
  path: new THREE.Color('#55534e'),
  accent: new THREE.Color('#a7e3dd'),
  green: new THREE.Color('#607c5f'),
  greenLight: new THREE.Color('#92a977'),
};

const scene = new THREE.Scene();
/* 原型的 0.00145 相当于能见度 700 m —— 那是沙尘暴。真实晴日火星
   的水平能见度是几十公里，北壁必须看得见，否则换真实地形就白换了。 */
scene.fog = new THREE.FogExp2('#c17654', 0.0000295);

/* 远平面从 1800 m 推到 600 km，跨度 600 万倍 —— 普通深度缓冲会在近处
   全部撞在一起（z-fighting）。必须开对数深度缓冲。 */
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 600000);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: true,
  });
} catch (error) {
  loading.hidden = true;
  unsupported.hidden = false;
  throw error;
}

function pixelRatio() {
  if (!JOURNEY) return Math.min(devicePixelRatio, 1.8);
  const low = getSettings().quality === 'low';
  return Math.min(devicePixelRatio, low ? 1 : 1.5,
    Math.sqrt((low ? 1200000 : 2200000) / Math.max(1, innerWidth * innerHeight)));
}
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = true;      // 建造动画靠一张向上扫的裁剪面

const world = new THREE.Group();
world.name = 'Mars Dome World';
scene.add(world);

const animated = {
  tram: null,
  dust: null,
  water: null,
  vegetation: null,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** 线性插值。原型里没用到，整平区的过渡带需要它。 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, ux),
    THREE.MathUtils.lerp(c, d, ux),
    uy,
  );
}

function fbm(x, y) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < 5; octave += 1) {
    total += noise2(x * frequency, y * frequency) * amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

function ridgeNoise(x, y) { return 1 - Math.abs(noise2(x, y) * 2 - 1); }

/* 真实高程 + 分形补细节。
   cell 是本地网格间距：每一倍频只有在波长明显大于它时才计入，
   否则远处每个格子都会采到高频噪声，崖面会闪成一片盐粒。 */
function realHeight(x, z, cell) {
  const [lat, lon] = siteLatLon(x, z);
  const base = molaSharp(lat, lon) - SITE_H;
  const curve = (x * x + z * z) / (2 * R_M);       // 球面沉降，30 km 外 133 m
  const slope = Math.min(1, molaSlopeAt(lat, lon) * 4.2);
  const cut = (wl) => Math.min(1, Math.max(0, (wl - cell * 1.5) / (cell * 2.2)));

  let sum = 0;
  let amp = 42 * (1 - 0.55 * slope), freq = 1 / 5200;
  for (let i = 0; i < 8; i += 1) {
    const w = cut(1 / freq);
    if (w > 0.001) sum += amp * (noise2(x * freq + i * 7.3, z * freq - i * 4.1) - 0.5) * 2 * w;
    amp *= 0.52; freq *= 2.07;
  }
  // 陡坡用脊状多重分形：普通 fBm 只会长出圆丘，糊在崖面上就是沙丘
  if (slope > 0.02) {
    let a = 430 * slope, f = 1 / 2700, weight = 1;
    for (let i = 0; i < 9; i += 1) {
      const w = cut(1 / f);
      if (w > 0.001) {
        const r = ridgeNoise(x * f + i * 11.7, z * f + i * 5.9);
        const r2 = r * r;
        sum += a * (r2 - 0.42) * weight * w;
        weight = 0.55 + 0.45 * r2;
      }
      a *= 0.53; f *= 2.11;
    }
  }
  return base - curve + sum;
}

/* ============================================================
   园区基面
   ------------------------------------------------------------
   第一版把基面钉死在 y = −0.45，也就是站点的绝对高程上。
   问题是周围的真实地形在几百米内起伏可达几十米，于是整平区变成了
   一座凭空长出来的台地 —— 从外面看就是个大土包。

   现在基面高度由当地地形决定：取园区中心和半径 180 m 一圈共 9 个点的
   平均高程，用粗采样（不要细节），得到这块地「本来大概多高」。
   整平区就坐在这个高度上，于是它是「铲平的一块地」，而不是「堆起来的一个包」。
   过渡带也从 98 m 拉宽到 260 m，坡度降下来，远看几乎注意不到。
   ============================================================ */
const PAD_R = 150, PAD_APRON = 260;
const CAMPUSES = [];              // { name, x, z, rot, level, group, label }

function padLevelAt(cx, cz) {
  let sum = realHeight(cx, cz, 40), n = 1;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    sum += realHeight(cx + Math.cos(a) * 180, cz + Math.sin(a) * 180, 40);
    n += 1;
  }
  return sum / n;
}

function terrainHeight(x, z, cell) {
  const real = realHeight(x, z, cell === undefined ? 8 : cell);
  if (!CAMPUSES.length) return real;
  // 多个园区时按最近的那块整平区算；重叠部分自然过渡
  let y = real, nearest = 1;
  for (const c of CAMPUSES) {
    const d = Math.hypot(x - c.x, z - c.z);
    const f = smoothstep(PAD_R, PAD_R + PAD_APRON, d);   // 0 = 区内，1 = 区外
    if (f < nearest) { nearest = f; y = lerp(c.level - 0.45, real, f); }
  }
  return y;
}

function reportProgress(value) {
  const percent = Math.round(value * 100);
  loadBar.style.width = `${percent}%`;
  loadPercent.textContent = `${percent}%`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function applyShadow(root, cast = true, receive = true) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = cast;
    node.receiveShadow = receive;
  });
  return root;
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#342725') },
      horizonColor: { value: new THREE.Color('#c17654') },
      floorColor: { value: new THREE.Color('#7d4d3b') },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 floorColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float skyMix = smoothstep(-0.08, 0.58, h);
        vec3 color = mix(horizonColor, topColor, skyMix);
        color = mix(floorColor, color, smoothstep(-0.22, 0.02, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420000, 48, 24), material);
  sky.name = 'Atmosphere Gradient';
  scene.add(sky);

  /* 太阳方位 250°（西偏南）、高度角 18°，和 tools/mars-vista.html 一致。
     原型那个方位把太阳放在北壁背后，7 km 高的墙会整面逆光变黑。 */
  const sunDirection = new THREE.Vector3(-0.894, 0.309, 0.325).normalize();
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6400, 32, 16),
    new THREE.MeshBasicMaterial({ color: '#ffe1ae', fog: false }),
  );
  sun.position.copy(sunDirection).multiplyScalar(330000);
  sun.name = 'Sun Disc';
  scene.add(sun);

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(3400, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#b7c2c8', fog: false }),
  );
  planet.position.set(195000, 124000, -270000);
  scene.add(planet);

  return sunDirection;
}

function createLighting(sunDirection) {
  const hemisphere = new THREE.HemisphereLight('#cf9b7d', '#3d302b', 1.6);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight('#ffd6a2', 4.2);
  sun.position.copy(sunDirection).multiplyScalar(420);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 820;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const interiorFill = new THREE.PointLight('#a7e3dd', 90, 150, 1.7);
  interiorFill.position.set(-22, 22, 5);
  scene.add(interiorFill);
}

/* 远景地形。
   原型这里是一圈随机摆的圆锥假山，半径不到 800 m。换成实测高程之后，
   要一直铺到 200 km 才够 —— 北壁在 30 km 外，它才是这个场景真正的背景。

   用以园区为中心的极坐标网：分辨率天然随距离衰减，而且是一张连通的网，
   不存在多级方形网格之间的 T 型接缝。 */
function createDistantTerrain() {
  const NT = 512, NR = 340, R0 = 760, RMAX = 200000;
  const growth = Math.exp(Math.log(RMAX / R0) / (NR - 1));
  const count = NT * NR;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const idx = new Uint32Array((NR - 1) * NT * 6);
  const dust = new THREE.Color('#a46a4a');
  const rock = new THREE.Color('#5c3b2f');
  const tmp = new THREE.Color();

  for (let ri = 0; ri < NR; ri += 1) {
    const r = R0 * growth ** ri;
    const cell = Math.max(1, r * (growth - 1));
    for (let ti = 0; ti < NT; ti += 1) {
      const a = (ti / NT) * TAU;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = realHeight(x, z, cell);
      const i = ri * NT + ti;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;

      const [lat, lon] = siteLatLon(x, z);
      const sl = Math.min(1, molaSlopeAt(lat, lon) * 4.5);
      tmp.copy(dust).lerp(rock, sl * 0.85);
      // 陡坡叠水平层理 —— 没有横向条带，任何高度的斜坡看起来都一样高
      if (sl > 0.15) {
        const band = Math.sin(y / 135 + noise2(x / 3400, z / 3400) * 4);
        tmp.offsetHSL(0, 0, band * 0.085 * sl);
      }
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
  }
  let k = 0;
  for (let ri = 0; ri < NR - 1; ri += 1) {
    const a0 = ri * NT, b0 = (ri + 1) * NT;
    for (let ti = 0; ti < NT; ti += 1) {
      const tn = (ti + 1) % NT;
      idx[k++] = a0 + ti; idx[k++] = b0 + tn; idx[k++] = b0 + ti;
      idx[k++] = a0 + ti; idx[k++] = a0 + tn; idx[k++] = b0 + tn;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0,
  }));
  mesh.name = 'Coprates Chasma (MOLA)';
  world.add(mesh);
}

const groundGroup = new THREE.Group();
groundGroup.name = 'Ground';

/* 加一个园区就要重铲一次地基，所以近景地面必须能重建。
   远景那张极坐标网不用动 —— 它从 760 m 起步，整平区最远只到 410 m。 */
function rebuildGround() {
  for (const child of [...groundGroup.children]) {
    child.geometry?.dispose();
    groundGroup.remove(child);
  }
  createNearTerrain();
}

function createTerrain() {
  world.add(groundGroup);
  createDistantTerrain();
  createNearTerrain();
}

function createNearTerrain() {
  const geometry = new THREE.PlaneGeometry(1600, 1600, 180, 180);
  const positions = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getY(index);
    const height = terrainHeight(x, z, 8.9);   // 1600 m / 180 段 = 8.9 m 一格
    positions.setZ(index, height);
    const shade = clamp(0.74 + height * 0.006 + (noise2(x * 0.03, z * 0.03) - 0.5) * 0.18, 0.45, 1.12);
    color.copy(palette.terrain).multiplyScalar(shade);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.01,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'Procedural Mars Terrain';
  terrain.receiveShadow = true;
  groundGroup.add(terrain);

  const rand = mulberry32(20520114);
  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: palette.rock,
    roughness: 1,
    flatShading: true,
  });
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeometry, mountainMaterial, 180);
  for (let index = 0; index < 180; index += 1) {
    const angle = rand() * TAU;
    const radius = 150 + rand() * 500;
    const size = 0.7 + rand() ** 3 * 7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    position.set(x, terrainHeight(x, z) + size * 0.32, z);
    quaternion.setFromEuler(new THREE.Euler(rand() * TAU, rand() * TAU, rand() * TAU));
    scale.set(size * (0.7 + rand() * 0.6), size, size * (0.8 + rand() * 0.4));
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.name = 'Rock Field';
  groundGroup.add(rocks);
}

function createDome() {
  const group = new THREE.Group();
  group.name = '260 m Spherical Cap Dome';
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: palette.steel,
    roughness: 0.34,
    metalness: 0.78,
  });
  const darkSteelMaterial = new THREE.MeshStandardMaterial({
    color: palette.steelDark,
    roughness: 0.46,
    metalness: 0.7,
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#d8eee8',
    transparent: true,
    opacity: 0.115,
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const shellGeometry = new THREE.SphereGeometry(
    DOME_SPHERE_RADIUS,
    112,
    40,
    0,
    TAU,
    0,
    DOME_THETA,
  );
  const shell = new THREE.Mesh(shellGeometry, glassMaterial);
  shell.position.y = DOME_CENTER_Y;
  shell.renderOrder = 4;
  shell.name = 'Glass Shell';
  group.add(shell);

  for (let rib = 0; rib < 24; rib += 1) {
    const angle = rib / 24 * TAU;
    const points = [];
    for (let step = 0; step <= 22; step += 1) {
      const y = step / 22 * DOME_HEIGHT;
      const radius = Math.sqrt(Math.max(0, DOME_SPHERE_RADIUS ** 2 - (y - DOME_CENTER_Y) ** 2));
      points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 52, 0.31, 6, false);
    const mesh = new THREE.Mesh(geometry, rib % 2 === 0 ? steelMaterial : darkSteelMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (let ring = 1; ring <= 13; ring += 1) {
    const y = ring / 14 * DOME_HEIGHT;
    const radius = Math.sqrt(Math.max(0, DOME_SPHERE_RADIUS ** 2 - (y - DOME_CENTER_Y) ** 2));
    const geometry = new THREE.TorusGeometry(radius, ring % 4 === 0 ? 0.24 : 0.15, 6, 128);
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, ring % 4 === 0 ? steelMaterial : darkSteelMaterial);
    mesh.position.y = y;
    mesh.castShadow = true;
    group.add(mesh);
  }

  const baseGeometry = new THREE.TorusGeometry(DOME_BASE_RADIUS, 0.86, 8, 160);
  baseGeometry.rotateX(Math.PI / 2);
  const baseRing = new THREE.Mesh(baseGeometry, darkSteelMaterial);
  baseRing.position.y = 0.28;
  baseRing.castShadow = true;
  group.add(baseRing);

  world.add(group);
  return group;
}

function roundedRectShape(width, depth, radius) {
  const x = -width / 2;
  const y = -depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function roundedBuilding(width, depth, height, radius, material) {
  const geometry = new THREE.ExtrudeGeometry(roundedRectShape(width, depth, radius), {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.36,
    bevelThickness: 0.36,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createGroundworks() {
  const group = new THREE.Group();
  group.name = 'Park Groundworks';
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#59483f', roughness: 0.94 });
  const pathMaterial = new THREE.MeshStandardMaterial({ color: palette.path, roughness: 0.72, metalness: 0.06 });
  const plazaMaterial = new THREE.MeshStandardMaterial({ color: '#767069', roughness: 0.68, metalness: 0.08 });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(128.4, 128), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.22;
  floor.receiveShadow = true;
  group.add(floor);

  const boulevard = new THREE.Mesh(new THREE.RingGeometry(69, 79, 128), pathMaterial);
  boulevard.rotation.x = -Math.PI / 2;
  boulevard.position.y = -0.05;
  boulevard.receiveShadow = true;
  group.add(boulevard);

  const plaza = new THREE.Mesh(new THREE.CircleGeometry(30, 72), plazaMaterial);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  group.add(plaza);

  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * TAU;
    const path = new THREE.Mesh(new THREE.BoxGeometry(7, 0.11, 91), pathMaterial);
    path.position.set(Math.sin(angle) * 45, -0.01, Math.cos(angle) * 45);
    path.rotation.y = angle;
    path.receiveShadow = true;
    group.add(path);
  }

  const trackA = new THREE.Mesh(new THREE.TorusGeometry(91, 0.14, 5, 160), new THREE.MeshStandardMaterial({ color: '#6e716e', metalness: 0.8, roughness: 0.38 }));
  const trackB = trackA.clone();
  trackA.geometry = new THREE.TorusGeometry(89.8, 0.14, 5, 160);
  trackA.geometry.rotateX(Math.PI / 2);
  trackB.geometry = new THREE.TorusGeometry(92.2, 0.14, 5, 160);
  trackB.geometry.rotateX(Math.PI / 2);
  trackA.position.y = trackB.position.y = 0.1;
  group.add(trackA, trackB);

  world.add(group);
}

function createCommons() {
  const group = new THREE.Group();
  group.name = 'Commons and Habitat Arc';
  const shellMaterial = new THREE.MeshStandardMaterial({ color: palette.shell, roughness: 0.34, metalness: 0.2 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: palette.steelDark, roughness: 0.45, metalness: 0.62 });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: '#7ca29d',
    emissive: '#46736f',
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.16,
  });

  const commons = roundedBuilding(38, 22, 7.5, 5.2, shellMaterial);
  commons.position.set(-8, 0.1, -6);
  commons.rotation.y = -0.18;
  group.add(commons);

  const roof = new THREE.Mesh(new THREE.SphereGeometry(11, 48, 18, 0, TAU, 0, Math.PI / 2), shellMaterial);
  roof.scale.set(1.5, 0.5, 0.92);
  roof.position.set(-8, 7.6, -6);
  roof.rotation.y = -0.18;
  group.add(roof);

  const observation = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 2.8, 48), windowMaterial);
  observation.position.set(-8, 7.4, -6);
  observation.scale.set(1.42, 1, 0.86);
  observation.rotation.y = -0.18;
  group.add(observation);

  for (let index = 0; index < 7; index += 1) {
    const angle = -1.02 + index * 0.34;
    const radius = 55;
    const center = new THREE.Vector3(Math.sin(angle) * radius - 18, 5.2, Math.cos(angle) * radius + 4);
    const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).normalize();
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(3.8, 10.5, 8, 18), index % 2 ? shellMaterial : darkMaterial);
    pod.position.copy(center);
    pod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    group.add(pod);

    const window = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.7, 0.16), windowMaterial);
    window.position.copy(center).add(new THREE.Vector3(Math.sin(angle) * 3.3, 0.6, Math.cos(angle) * 3.3));
    window.rotation.y = angle;
    group.add(window);
  }

  const tower = new THREE.Group();
  tower.position.set(-57, 0, -37);
  const towerCore = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.2, 31, 32), shellMaterial);
  towerCore.position.y = 15.5;
  tower.add(towerCore);
  for (let level = 0; level < 5; level += 1) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(7.3 - level * 0.08, 0.48, 8, 48), level % 2 ? darkMaterial : windowMaterial);
    band.rotation.x = Math.PI / 2;
    band.position.y = 5.2 + level * 5.1;
    tower.add(band);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 7.1, 3.5, 32), darkMaterial);
  crown.position.y = 32.6;
  tower.add(crown);
  group.add(tower);

  const entry = roundedBuilding(18, 9, 6.2, 3.2, shellMaterial);
  entry.position.set(0, 0.2, 103);
  group.add(entry);
  const entryGlass = roundedBuilding(10, 0.35, 3.5, 1.4, windowMaterial);
  entryGlass.position.set(0, 1.4, 98.25);
  group.add(entryGlass);

  applyShadow(group, true, true);
  world.add(group);
}

function createGreenhouses() {
  const group = new THREE.Group();
  group.name = 'Farmside Greenhouses';
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#bfe1d7',
    transparent: true,
    opacity: 0.2,
    roughness: 0.12,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const frame = new THREE.MeshStandardMaterial({ color: '#5f6866', roughness: 0.34, metalness: 0.78 });
  const base = new THREE.MeshStandardMaterial({ color: '#373a38', roughness: 0.64, metalness: 0.3 });

  for (let house = 0; house < 3; house += 1) {
    const greenhouse = new THREE.Group();
    greenhouse.position.set(48 + house * 14, 0, -17 + house * 4);
    greenhouse.rotation.y = -0.44;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 11.6), base);
    slab.position.y = 0.35;
    greenhouse.add(slab);

    const shellGeometry = new THREE.CylinderGeometry(5.8, 5.8, 34, 48, 1, true, 0, Math.PI);
    shellGeometry.rotateZ(Math.PI / 2);
    const shell = new THREE.Mesh(shellGeometry, glass);
    shell.position.y = 0.72;
    shell.renderOrder = 3;
    greenhouse.add(shell);

    for (let rib = 0; rib <= 8; rib += 1) {
      const archGeometry = new THREE.TorusGeometry(5.8, 0.12, 6, 48, Math.PI);
      archGeometry.rotateY(Math.PI / 2);
      const arch = new THREE.Mesh(archGeometry, frame);
      arch.position.set(-17 + rib * 4.25, 0.72, 0);
      greenhouse.add(arch);
    }

    for (const z of [-5.8, 5.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(34, 0.16, 0.18), frame);
      rail.position.set(0, 0.82, z);
      greenhouse.add(rail);
    }

    group.add(greenhouse);
  }

  applyShadow(group, true, true);
  world.add(group);
}

function createVegetation(sunDirection) {
  const group = new THREE.Group();
  group.name = 'Vegetation';
  const rand = mulberry32(73194);
  const planterMaterial = new THREE.MeshStandardMaterial({ color: '#4c504b', roughness: 0.7, metalness: 0.18 });
  const cropMaterial = new THREE.MeshStandardMaterial({ color: palette.green, roughness: 0.9 });

  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = spoke / 8 * TAU + 0.18;
    for (let step = 0; step < 7; step += 1) {
      const radius = 37 + step * 5.1;
      const planter = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.72, 4.2), planterMaterial);
      planter.position.set(Math.sin(angle) * radius, 0.36, Math.cos(angle) * radius);
      planter.rotation.y = angle;
      group.add(planter);
    }
  }

  const cropGeometry = new THREE.ConeGeometry(0.32, 1.25, 7);
  const crops = new THREE.InstancedMesh(cropGeometry, cropMaterial, 260);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  for (let index = 0; index < 260; index += 1) {
    const greenhouse = index % 3;
    const localX = (rand() - 0.5) * 29;
    const localZ = (rand() - 0.5) * 8.4;
    const angle = -0.44;
    const baseX = 48 + greenhouse * 14;
    const baseZ = -17 + greenhouse * 4;
    const x = baseX + localX * Math.cos(angle) + localZ * Math.sin(angle);
    const z = baseZ - localX * Math.sin(angle) + localZ * Math.cos(angle);
    position.set(x, 1.24, z);
    quaternion.setFromEuler(new THREE.Euler(0, rand() * TAU, (rand() - 0.5) * 0.12));
    const size = 0.72 + rand() * 0.75;
    scale.set(size, size, size);
    matrix.compose(position, quaternion, scale);
    crops.setMatrixAt(index, matrix);
  }
  crops.castShadow = true;
  group.add(crops);

  const treeIsland = new THREE.Group();
  treeIsland.name = 'First Tree Island';
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.4, 1.4, 48), planterMaterial);
  planter.position.y = 0.7;
  treeIsland.add(planter);
  treeIsland.position.set(18, 0, 8);
  group.add(treeIsland);

  const treeSystem = createStructuredTree({ sunDirection });
  treeSystem.object.name = 'First Tree, structured growth';
  treeSystem.object.position.set(18, 1.38, 8);
  group.add(treeSystem.object);

  const grovePositions = [
    [34, 0.04, 33, 0.5, 0.7],
    [42, 0.04, 29, 0.43, -0.35],
    [36, 0.04, 42, 0.38, 1.8],
    [-38, 0.04, 38, 0.46, 2.45],
  ];
  for (const [x, y, z, scaleValue, rotation] of grovePositions) {
    const tree = treeSystem.object.clone(true);
    tree.name = 'Dome Ash grove tree';
    tree.position.set(x, y, z);
    tree.rotation.y = rotation;
    tree.scale.setScalar(scaleValue);
    group.add(tree);
  }

  function sampleGrass(random, index) {
    if (index < 2600) {
      const angle = random() * TAU;
      const edgeNoise = noise2(Math.cos(angle) * 1.7 + 19, Math.sin(angle) * 1.7 - 7);
      const outerRadius = 13.6 + edgeNoise * 3.4;
      const radius = Math.sqrt(6.8 ** 2 + random() * (outerRadius ** 2 - 6.8 ** 2));
      const edgeFade = smoothstep(0, 2.6, outerRadius - radius);
      const clump = noise2(Math.cos(angle) * radius * 0.12 + 31, Math.sin(angle) * radius * 0.12 - 18);
      return {
        x: 18 + Math.cos(angle) * radius,
        y: 0.055,
        z: 8 + Math.sin(angle) * radius,
        scale: (0.64 + clump * 0.52) * (0.46 + edgeFade * 0.68),
      };
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = random() * TAU;
      const radius = Math.sqrt(31 ** 2 + random() * (67 ** 2 - 31 ** 2));
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const spokeUnit = TAU / 8;
      const nearestSpoke = Math.abs(((angle + spokeUnit * 0.5) % spokeUnit) - spokeUnit * 0.5);
      const roadClearance = Math.asin(Math.min(0.95, 5.2 / radius));
      const greenhouseBlocked = x > 25 && x < 91 && z > -47 && z < 17;
      const commonsBlocked = x > -32 && x < 17 && z > -23 && z < 12;
      const towerBlocked = Math.hypot(x + 57, z + 37) < 12;
      if (nearestSpoke < roadClearance || greenhouseBlocked || commonsBlocked || towerBlocked) continue;
      const clump = noise2(x * 0.072 + 23, z * 0.072 - 41);
      if (clump < 0.36) continue;
      return { x, y: 0.035, z, scale: 0.66 + clump * 0.62 };
    }
    const fallbackAngle = index * 2.399963229728653;
    const fallbackRadius = 43 + index % 19;
    return {
      x: Math.sin(fallbackAngle) * fallbackRadius,
      y: 0.035,
      z: Math.cos(fallbackAngle) * fallbackRadius,
      scale: 0.82,
    };
  }

  const grassSystem = createGrassField({
    count: 6800,
    seed: 90210,
    sunDirection,
    samplePosition: sampleGrass,
  });
  group.add(grassSystem.object);
  animated.vegetation = {
    update(elapsed, motionEnabled) {
      treeSystem.update(elapsed, motionEnabled);
      grassSystem.update(elapsed, motionEnabled);
    },
  };
  animated.vegetation.update(0, !reduceMotion);

  window.__MARS_DIAGNOSTICS__ = {
    ...(window.__MARS_DIAGNOSTICS__ ?? {}),
    vegetation: {
      tree: treeSystem.stats,
      grass: grassSystem.stats,
      treeInstances: grovePositions.length + 1,
    },
  };

  console.info('[vegetation]', window.__MARS_DIAGNOSTICS__.vegetation);

  world.add(group);
}

function createFountain() {
  const group = new THREE.Group();
  group.position.set(-12, 0, 14);
  const stone = new THREE.MeshStandardMaterial({ color: '#73716c', roughness: 0.62, metalness: 0.06 });
  const water = new THREE.MeshPhysicalMaterial({
    color: '#6fbab8',
    transparent: true,
    opacity: 0.72,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const basin = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.8, 64), stone);
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = 0.24;
  group.add(basin);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(4.35, 64), water);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.18;
  group.add(surface);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.48, 3.6, 16), stone);
  spire.position.y = 2;
  group.add(spire);
  animated.water = surface;
  world.add(group);
}

function createSolarField() {
  const group = new THREE.Group();
  group.name = 'Solar Field';
  const frame = new THREE.MeshStandardMaterial({ color: '#4f5453', roughness: 0.4, metalness: 0.78 });
  const panel = new THREE.MeshStandardMaterial({ color: '#273f49', roughness: 0.24, metalness: 0.52 });
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const assembly = new THREE.Group();
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.8, 8), frame);
      support.position.y = 1.4;
      assembly.add(support);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.16, 3.4), panel);
      plate.position.set(0, 3.2, 0);
      plate.rotation.x = -0.36;
      assembly.add(plate);
      assembly.position.set(-85 + column * 10.5, 0, 48 + row * 7.3);
      group.add(assembly);
    }
  }
  applyShadow(group, true, true);
  world.add(group);
}

function createTram() {
  const group = new THREE.Group();
  group.name = 'Loop Tram';
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#d0cec5', roughness: 0.32, metalness: 0.24 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#5f8d8a', emissive: '#315653', emissiveIntensity: 1.5, roughness: 0.18, metalness: 0.24 });
  for (let car = 0; car < 2; car += 1) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.75, 6.2, 6, 14), bodyMaterial);
    body.rotation.z = Math.PI / 2;
    body.position.x = car * 8.1;
    group.add(body);
    const window = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.1, 0.12), glassMaterial);
    window.position.set(car * 8.1, 0.45, 1.67);
    group.add(window);
  }
  group.position.set(0, 2.2, 91);
  applyShadow(group, true, true);
  world.add(group);
  animated.tram = group;
}

function createDust() {
  const rand = mulberry32(492811);
  const count = 1100;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const angle = rand() * TAU;
    const radius = 135 + rand() * 620;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0.6 + rand() * 52;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    speeds[index] = 0.3 + rand() * 1.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#d69b78',
    size: 0.7,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const dust = new THREE.Points(geometry, material);
  dust.userData.speeds = speeds;
  dust.name = 'Atmospheric Dust';
  scene.add(dust);
  animated.dust = dust;
}

const cameraState = {
  yaw: 0.76,
  pitch: 0.31,
  distance: 252,
  target: new THREE.Vector3(0, 18, 0),
  tween: null,
};

/* 机位是「相对基地的偏移」，不是绝对坐标。
   写成绝对坐标的话，切到第二座基地再点「温室」，镜头会飞回主穹顶去。 */
const presets = {
  overview: { yaw: 0.76, pitch: 0.31, distance: 252, offset: new THREE.Vector3(0, 18, 0) },
  entry: { yaw: 0.03, pitch: 0.15, distance: 104, offset: new THREE.Vector3(0, 9, 52) },
  greenhouse: { yaw: -1.02, pitch: 0.2, distance: 82, offset: new THREE.Vector3(57, 7, -12) },
  vegetation: { yaw: -0.58, pitch: 0.1, distance: 48, offset: new THREE.Vector3(18, 8.5, 8) },
};
let ACTIVE = null;                     // 当前焦点基地
let ACTIVE_VIEW = 'overview';

/** 把相对偏移套到某座基地上，得到一个可用的绝对机位。
    偏移要跟着基地自身的朝向一起转 —— 每座基地朝向都不同，
    不转的话「入口」机位会指到侧墙上去。 */
function presetFor(name, campus) {
  const pr = presets[name] || presets.overview;
  const c = campus || ACTIVE;
  if (!c) return { yaw: pr.yaw, pitch: pr.pitch, distance: pr.distance, target: pr.offset.clone() };
  const off = pr.offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
  return {
    yaw: pr.yaw + c.rot,
    pitch: pr.pitch,
    distance: pr.distance,
    target: new THREE.Vector3(c.x + off.x, c.level + off.y, c.z + off.z),
  };
}

const initialView = PARK_QS.get('view');
if (initialView && presets[initialView]) {
  ACTIVE_VIEW = initialView;
  const preset = presets[initialView];
  cameraState.yaw = preset.yaw;
  cameraState.pitch = preset.pitch;
  cameraState.distance = preset.distance;
  cameraState.target.copy(preset.offset);
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === initialView);
  });
}

function updateCamera() {
  const horizontal = Math.cos(cameraState.pitch) * cameraState.distance;
  camera.position.set(
    cameraState.target.x + Math.sin(cameraState.yaw) * horizontal,
    cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance,
    cameraState.target.z + Math.cos(cameraState.yaw) * horizontal,
  );
  camera.lookAt(cameraState.target);
}

function setPreset(name, campus) {
  if (!presets[name]) return;
  ACTIVE_VIEW = name;
  if (campus) ACTIVE = campus;
  const preset = presetFor(name, ACTIVE);
  cameraState.tween = {
    started: sceneTime,
    duration: reduceMotion ? 1 : 980,
    from: {
      yaw: cameraState.yaw,
      pitch: cameraState.pitch,
      distance: cameraState.distance,
      target: cameraState.target.clone(),
    },
    to: preset,
  };
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === name);
  });
}

function updateCameraTween(time) {
  if (!cameraState.tween) return;
  const tween = cameraState.tween;
  const raw = clamp((time - tween.started) / tween.duration, 0, 1);
  const t = 1 - (1 - raw) ** 4;
  cameraState.yaw = THREE.MathUtils.lerp(tween.from.yaw, tween.to.yaw, t);
  cameraState.pitch = THREE.MathUtils.lerp(tween.from.pitch, tween.to.pitch, t);
  cameraState.distance = THREE.MathUtils.lerp(tween.from.distance, tween.to.distance, t);
  cameraState.target.lerpVectors(tween.from.target, tween.to.target, t);
  if (raw >= 1) cameraState.tween = null;
}

/* 出图锁：?lock=1 时不装任何输入监听。
   验收截图必须完全由 URL 决定 —— 只要还能被一次路过的滚轮改掉机位，
   两次「同一帧」就不是同一帧，视觉对比也就失去意义。 */
const LOCKED = PARK_QS.get('lock') === '1';

function installControls() {
  if (LOCKED) return () => {};
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  const keys = new Set();
  resetCameraInput = () => {
    keys.clear();
    pointerId = null;
    canvas.classList.remove('is-dragging');
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!canAct() || DRIVING || mobility?.active || mobility?.walking || PLACING) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(pointerId);
    canvas.classList.add('is-dragging');
    cameraState.tween = null;
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!canAct() || DRIVING || mobility?.active || mobility?.walking || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    cameraState.yaw -= dx * 0.004;
    cameraState.pitch = clamp(cameraState.pitch + dy * 0.0032, 0.04, 1.18);
  });

  const releasePointer = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (!canAct() || DRIVING || mobility?.active || mobility?.walking) return;
    cameraState.tween = null;
    /* 上限从 380 m 提到 6000 m。380 m 是「只有一座穹顶」时代的数字 ——
       穹顶直径才 260 m，那时候拉到 380 就够了。现在园区之间隔着几百米，
       拉不远就永远看不到全貌。远平面是 600 km，对数深度缓冲，撑得住。 */
    cameraState.distance = clamp(cameraState.distance * Math.exp(event.deltaY * 0.0011), 24, 6000);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (!canAct() || editingText(event.target)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (event.code === 'KeyK') saveFrame();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', resetCameraInput);
  document.addEventListener('focusin', (event) => {
    if (editingText(event.target)) resetCameraInput();
  });

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!canAct()) return;
      stopDriving();
      setPreset(button.dataset.view);
      if (JOURNEY && button.dataset.view === 'greenhouse') visitGreenhouse();
    });
  });

  return function updateMovement(delta) {
    if (!canAct() || editingText(document.activeElement)) { keys.clear(); return; }
    const moveX = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const moveZ = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    if (moveX === 0 && moveZ === 0) return;
    cameraState.tween = null;
    const forward = new THREE.Vector3(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw));
    const right = new THREE.Vector3(Math.cos(cameraState.yaw), 0, -Math.sin(cameraState.yaw));
    const motion = forward.multiplyScalar(moveZ).add(right.multiplyScalar(moveX));
    if (motion.lengthSq() > 1) motion.normalize();
    cameraState.target.addScaledVector(motion, delta * clamp(cameraState.distance * 0.22, 8, 42));
    /* 活动范围以「当前基地」为圆心，不是以世界原点。
       原来写死在离原点 122 m 以内 —— 一旦有了第二座基地，
       你会发现镜头被一根看不见的皮筋拽回主穹顶，怎么走都走不过去。
       半径也随缩放放大：拉得越远，允许平移得越远。 */
    const anchor = ACTIVE || { x: 0, z: 0 };
    const lim = Math.max(160, cameraState.distance * 1.6);
    const dx = cameraState.target.x - anchor.x, dz = cameraState.target.z - anchor.z;
    const planar = Math.hypot(dx, dz);
    if (planar > lim) {
      cameraState.target.x = anchor.x + dx * (lim / planar);
      cameraState.target.z = anchor.z + dz * (lim / planar);
    }
  };
}

function saveFrame() {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = `mars-dome-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}

function updateAutomaticMotion(time, delta) {
  if (reduceMotion) return;
  if (animated.tram) {
    const angle = time * 0.000055;
    animated.tram.position.set(Math.sin(angle) * 91, 2.2, Math.cos(angle) * 91);
    animated.tram.rotation.y = angle + Math.PI / 2;
  }
  if (animated.dust) {
    const position = animated.dust.geometry.attributes.position;
    const speeds = animated.dust.userData.speeds;
    for (let index = 0; index < position.count; index += 1) {
      let x = position.getX(index) + speeds[index] * delta * 1.8;
      let z = position.getZ(index) + speeds[index] * delta * 0.5;
      if (x > 760) x = -760;
      if (z > 760) z = -760;
      position.setX(index, x);
      position.setZ(index, z);
    }
    position.needsUpdate = true;
  }
  if (animated.water) {
    animated.water.material.opacity = 0.67 + Math.sin(time * 0.0013) * 0.06;
  }
  if (animated.vegetation) {
    animated.vegetation.update(time * 0.001, true);
  }
}

async function init() {
  reportProgress(0.08);
  const sunDirection = createSky();
  createLighting(sunDirection);
  await nextFrame();

  reportProgress(0.28);
  createTerrain();
  await nextFrame();

  reportProgress(0.52);
  createGroundworks();
  createDome();
  await nextFrame();

  reportProgress(0.73);
  createCommons();
  createGreenhouses();
  await nextFrame();

  reportProgress(0.9);
  createVegetation(sunDirection);
  createFountain();
  createSolarField();
  createTram();
  createDust();

  updateCamera();
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  reportProgress(1);
  await nextFrame();
  harvestTemplate(savedCampuses[0]?.name || (JOURNEY ? '曙光主站' : PARK_QS.get('name') || '主穹顶'));
  for (const saved of savedCampuses.slice(1)) {
    addCampus(saved.name, saved.x, saved.z, { restore: true });
  }
  rebuildGround();                 // 第一座的基面也要按当地地形重铲一次
  for (let i = 1; i < CAMPUSES.length; i += 1) linkTo(CAMPUSES[i], CAMPUSES.slice(0, i));
  refreshList();
  if (JOURNEY) saveCampuses();
  loading.classList.add('is-complete');
  armBuildAnimation();
  if (!BUILD.on) finishLoading();
  const fade = document.getElementById('fade');
  if (fade) requestAnimationFrame(() => fade.classList.remove('on'));
}

/* ============================================================
   建造动画
   ------------------------------------------------------------
   从地面视角点「在此建站」进来时，园区不是一下子出现的，而是被一张
   自下而上扫过的裁剪面逐层放出来：先是基座和路面，然后是建筑和温室，
   钢网架一环环合拢，最后草和树从地里长出来。

   用裁剪面而不是逐个物体做动画，是因为它天然尊重几何的真实高度 ——
   任何一根梁露出多少，取决于它自己在多高，不需要为每个构件写关键帧。
   扫完就把裁剪面摘掉，避免每帧都付这份开销。
   ============================================================ */
const BUILD = {
  on: PARK_QS.get('build') === '1' && !reduceMotion && (!JOURNEY || savedCampuses.length === 0),
  t0: 0, ms: 3600, from: -3, to: 82,
  plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
  materials: [],
};
const BUILD_SKIP = ['Procedural Mars Terrain', 'Coprates Chasma (MOLA)', 'Rock Field'];

function armBuildAnimation() {
  const tag = document.getElementById('build-tag');
  if (!BUILD.on) { if (tag) tag.classList.add('is-done'); return; }
  world.traverse((node) => {
    if (!node.material || BUILD_SKIP.includes(node.name)) return;
    for (const m of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (BUILD.materials.includes(m)) continue;
      m.clippingPlanes = [BUILD.plane];
      m.clipShadows = true;
      BUILD.materials.push(m);
    }
  });
  BUILD.plane.constant = BUILD.from;
}
function stepBuild(time) {
  if (!BUILD.on) return;
  if (!BUILD.t0) BUILD.t0 = time;
  const t = Math.min(1, (time - BUILD.t0) / BUILD.ms);
  const e = t * t * (3 - 2 * t);
  BUILD.plane.constant = BUILD.from + (BUILD.to - BUILD.from) * e;
  if (t >= 1) {
    BUILD.on = false;
    for (const m of BUILD.materials) { m.clippingPlanes = null; m.needsUpdate = true; }
    BUILD.materials.length = 0;
    renderer.shadowMap.needsUpdate = true;
    const tag = document.getElementById('build-tag');
    if (tag) tag.classList.add('is-done');
    finishLoading();
  }
}

/* ============================================================
   园区管理
   ------------------------------------------------------------
   第一版把整个公园写死在原点。要「在同一个界面里再建一个」，
   就得先把「公园」从场景里剥出来，变成一个可以复制的东西。

   做法是：正常建好第一座，然后把 world 里除地形之外的所有东西
   收进一个 Group 当模板，之后每加一座就克隆一次。
   three.js 的 clone 共享几何体和材质，所以第二座几乎不要钱 ——
   一万多个草叶实例也是共享同一份 InstancedMesh 数据。

   代价是每座园区长得一样。真实的模块化基地本来就该长得一样，
   所以给每座随机一个朝向，避免看上去像复制粘贴。
   ============================================================ */
const campusRoot = new THREE.Group();
campusRoot.name = 'Campuses';
let CAMPUS_TEMPLATE = null;
const linkRoot = new THREE.Group();
linkRoot.name = 'Links';
const TRAMS = [];

const GROUND_NAMES = ['Ground', 'Procedural Mars Terrain', 'Coprates Chasma (MOLA)', 'Rock Field'];

/** 把已经建好的园区内容收成模板，并把第一座登记进注册表。 */
function harvestTemplate(name) {
  CAMPUS_TEMPLATE = new THREE.Group();
  CAMPUS_TEMPLATE.name = 'Campus Template';
  for (const child of [...world.children]) {
    if (GROUND_NAMES.includes(child.name) || child === campusRoot || child === linkRoot) continue;
    CAMPUS_TEMPLATE.add(child);
  }
  world.add(campusRoot, linkRoot);
  /* 模板本身就是第一座园区，必须挂回场景 —— 只把它收进 Group 而不 add，
     第一座就只剩一块名牌浮在空中。 */
  campusRoot.add(CAMPUS_TEMPLATE);
  ACTIVE = registerCampus(name, 0, 0, 0, CAMPUS_TEMPLATE);
}

/** 名牌。用画布纹理做的 Sprite —— 它永远正对镜头，
    在一个可以绕着走的场景里，这是唯一不用管朝向的做法。 */
function makeLabel(text) {
  const pad = 24, fs = 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(10,14,18,.72)';
  g2.fillRect(0, 0, c.width, c.height);
  g2.strokeStyle = 'rgba(167,227,221,.55)'; g2.lineWidth = 3;
  g2.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  g2.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  g2.fillStyle = '#a7e3dd';
  g2.textBaseline = 'middle';
  g2.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sp.scale.set(c.width / fs * 9, c.height / fs * 9, 1);
  return sp;
}

function registerCampus(name, x, z, rot, group) {
  const level = padLevelAt(x, z);
  group.position.set(x, level, z);
  group.rotation.y = rot;
  const label = makeLabel(name);
  label.position.set(x, level + DOME_HEIGHT + 22, z);
  campusRoot.add(label);
  const c = { name, x, z, rot, level, group, label };
  CAMPUSES.push(c);
  return c;
}

/** 在 (x,z) 新建一座园区。 */
function addCampus(name, x, z, { restore = false } = {}) {
  if (!CAMPUS_TEMPLATE) return null;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (!restore && (!canAct() || (JOURNEY && CAMPUSES.length >= 4))) return null;
  if (JOURNEY && (Math.abs(x) > 4000 || Math.abs(z) > 4000)) return null;
  /* 不能和已有园区叠在一起：整平区半径 150 m，穹顶半径 130 m，
     两座中心至少要隔开一个整平区直径，否则地基互相打架。 */
  for (const c of CAMPUSES) {
    if (Math.hypot(x - c.x, z - c.z) < PAD_R * 2 + 40) return null;
  }
  const clone = CAMPUS_TEMPLATE.clone(true);
  clone.name = 'Campus ' + name;
  campusRoot.add(clone);
  const c = registerCampus(name, x, z, (CAMPUSES.length * 2.399) % TAU, clone);
  if (restore) return c;
  rebuildGround();          // 地基变了，重铲一次
  linkTo(c);                // 连到最近的一座
  renderer.shadowMap.needsUpdate = true;
  focusCampus(c);           // 刚建好的那座直接成为焦点
  if (JOURNEY) {
    saveCampuses();
    journeyUI.toast(`${name}已接入加压连廊，建设进度已保存。`);
    refreshJourney();
  }
  return c;
}

/* ------------------------------------------------------------
   连廊与轨道
   ------------------------------------------------------------
   两座穹顶之间是一条加压连廊：一根贴地的管，外面套一圈肋，
   下面是双轨。轨道车在两端之间往返，端点减速停靠。

   连廊沿地形铺，不是一条直线悬空 —— 每 12 m 采一次地形高度，
   贴着地走。这也是为什么整平区的过渡带要缓：连廊要爬上去。
   ------------------------------------------------------------ */
function corridorPath(a, b) {
  const pts = [];
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const ux = dx / dist, uz = dz / dist;
  /* 从穹顶「外沿」接出去，不是从 128 m。穹顶底面半径就是 130 m，
     128 意味着连廊有 2 m 扎在壳体里面 —— 从外面看就是管子穿过了玻璃。
     留 5 m 余量，让连廊和穹顶是「靠上」而不是「插进去」。 */
  const start = DOME_BASE_RADIUS + 5, end = dist - (DOME_BASE_RADIUS + 5);
  const steps = Math.max(6, Math.round((end - start) / 12));
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (end - start) * (i / steps);
    const px = a.x + ux * t, pz = a.z + uz * t;
    pts.push(new THREE.Vector3(px, terrainHeight(px, pz, 4) + 3.1, pz));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function buildLink(a, b) {
  const curve = corridorPath(a, b);
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: palette.steel, roughness: 0.42, metalness: 0.8 });
  const shell = new THREE.MeshStandardMaterial({ color: palette.shell, roughness: 0.7, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: palette.steelDark, roughness: 0.5, metalness: 0.7 });

  const segs = Math.max(24, Math.round(curve.getLength() / 6));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 2.6, 14, false), shell);
  tube.castShadow = tube.receiveShadow = true;
  g.add(tube);

  // 加强肋：让这根管看起来是有结构的，而不是一根塑料水管
  const ribs = Math.max(4, Math.round(curve.getLength() / 14));
  for (let i = 0; i <= ribs; i += 1) {
    const t = i / ribs;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.14, 8, 20), steel);
    rib.position.copy(p);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    rib.castShadow = true;
    g.add(rib);
    // 支腿落到地面
    const gy = terrainHeight(p.x, p.z, 4);
    const h = Math.max(0.4, p.y - 2.6 - gy);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), dark);
    leg.position.set(p.x, gy + h / 2, p.z);
    leg.castShadow = true;
    g.add(leg);
  }

  // 双轨：贴在连廊下方
  for (const side of [-1, 1]) {
    const railPts = [];
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const nrm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      railPts.push(p.clone().addScaledVector(nrm, side * 1.15).setY(p.y - 2.75));
    }
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), segs, 0.07, 6, false), steel);
    g.add(rail);
  }

  // 轨道车
  const car = new THREE.Group();
  // 车厢：一个躺着的胶囊。加压车辆不会有尖角，圆端也省得自己做倒角
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 3.6, 6, 18), shell);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true; car.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 3.0, 18, 1, true), dark);
  band.rotation.x = Math.PI / 2; band.scale.y = 1;
  band.position.y = 0.24; car.add(band);
  for (const s of [-1, 1]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.2), dark);
    truck.position.set(0, -0.95, s * 1.7); car.add(truck);
  }
  g.add(car);

  linkRoot.add(g);
  TRAMS.push({ curve, car, t: Math.random(), dir: 1, group: g });
  return g;
}

/** 新园区连到最近的一座已有园区。 */
function linkTo(c, candidates = CAMPUSES) {
  let best = null, bestD = Infinity;
  for (const o of candidates) {
    if (o === c) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d < bestD) { bestD = d; best = o; }
  }
  if (best) buildLink(best, c);
}

/** 轨道车沿曲线往返，端点用平方项减速停靠。
    匀速跑到头再瞬间反向，看着像穿模；真实轨道车要进站停车。 */
function updateTrams(dt) {
  for (const tr of TRAMS) {
    const len = tr.curve.getLength();
    const cruise = 14 / Math.max(len, 1);            // 约 14 m/s
    const ease = Math.min(1, Math.min(tr.t, 1 - tr.t) * 8 + 0.06);
    tr.t += tr.dir * cruise * dt * ease;
    if (tr.t >= 1) { tr.t = 1; tr.dir = -1; }
    if (tr.t <= 0) { tr.t = 0; tr.dir = 1; }
    const p = tr.curve.getPointAt(clamp(tr.t, 0, 1));
    const tan = tr.curve.getTangentAt(clamp(tr.t, 0, 1));
    tr.car.position.copy(p).setY(p.y - 1.35);
    tr.car.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
      tan.clone().multiplyScalar(tr.dir).normalize());
  }
}

/* ============================================================
   放置、命名与火星车
   ============================================================ */
const ui = {
  name: document.getElementById('campus-name'),
  add: document.getElementById('campus-add'),
  list: document.getElementById('campus-list'),
  drive: document.getElementById('rover-toggle'),
  recommend: document.getElementById('campus-recommend'),
  rescue: document.getElementById('rover-rescue'),
  hintWalk: document.getElementById('controls-hint'),
  hintDrive: document.getElementById('drive-hint'),
  hintCam: document.getElementById('drive-cam'),
  hint: document.getElementById('place-hint'),
};
let PLACING = false;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function defaultName() {
  const n = CAMPUSES.length + 1;
  if (JOURNEY) return ['曙光主站', '生命花园', '居住穹顶', '科研穹顶'][n - 1] || '新穹顶';
  return '穹顶 ' + String(n).padStart(2, '0');
}
/** 切换焦点基地：沿用当前的机位类型，只换基地。
    这样在「温室」视角下切基地，看到的还是新基地的温室。 */
function focusCampus(c) {
  ACTIVE = c;
  setPreset(ACTIVE_VIEW, c);
  refreshList();
}

function refreshList() {
  if (!ui.list) return;
  ui.list.innerHTML = '';
  for (const c of CAMPUSES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.name;
    b.title = `切换焦点到 ${c.name}`;
    b.classList.toggle('is-active', c === ACTIVE);
    b.disabled = !canAct();
    b.addEventListener('click', () => { if (canAct()) { stopDriving(); focusCampus(c); } });
    ui.list.appendChild(b);
  }
  if (ui.name) ui.name.placeholder = defaultName();
}

/* 点地面放置。射线只打近景地形那一张网 —— 打整个场景的话，
   点在穹顶玻璃上也会返回命中点，新园区就会盖在半空中。 */
function pickGround(event) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((event.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const near = groundGroup.children.find((o) => o.name === 'Procedural Mars Terrain');
  if (!near) return null;
  const hit = raycaster.intersectObject(near, false)[0];
  return hit ? hit.point : null;
}

function beginPlacing() {
  if (!canAct() || DRIVING || (JOURNEY && CAMPUSES.length >= 4)) return;
  PLACING = !PLACING;
  if (ui.hint) ui.hint.classList.toggle('is-on', PLACING);
  if (ui.add) ui.add.classList.toggle('is-active', PLACING);
  canvas.style.cursor = PLACING ? 'crosshair' : '';
}

function cancelPlacing() {
  PLACING = false;
  ui.hint?.classList.remove('is-on');
  ui.add?.classList.remove('is-active');
  canvas.style.cursor = '';
}

canvas.addEventListener('click', (event) => {
  if (!PLACING || !canAct()) return;
  const p = pickGround(event);
  if (!p) return;
  const name = (ui.name?.value || '').trim() || defaultName();
  const c = addCampus(name, p.x, p.z);
  if (!c) {
    if (JOURNEY && (Math.abs(p.x) > 4000 || Math.abs(p.z) > 4000)) {
      ui.hint.textContent = '请在主站周围 4 km 内建设，或使用推荐扩建位置。';
      return;
    }
    let d = Infinity;
    for (const o of CAMPUSES) d = Math.min(d, Math.hypot(p.x - o.x, p.z - o.z));
    if (ui.hint) ui.hint.textContent =
      `离 ${Math.round(d)} m，至少要 ${PAD_R * 2 + 40} m —— 整平区会打架`;
    return;
  }
  if (ui.name) ui.name.value = '';
  if (ui.hint) ui.hint.textContent = '点击地面放置新的穹顶';
  refreshList();
  cancelPlacing();
});

if (ui.add) ui.add.addEventListener('click', beginPlacing);

/* ---- 火星车 ---- */
let ROVER = null, DRIVING = false, rig = null, drvIn = null, terrainAdapter = null;
let CAM_MODE = null;
let roverLoading = false;
let roverSaveTime = 0;

function saveParkRover() {
  if (!JOURNEY || !ROVER) return;
  const forward = ROVER.forward;
  updateJourney({ parkRover: { x: ROVER.pos.x, z: ROVER.pos.z,
    heading: Math.atan2(forward.x, forward.z), odo: ROVER.odo } });
}

function stopDriving() {
  if (!DRIVING) return;
  DRIVING = false;
  drvIn?.setEnabled(false);
  drvIn?.reset();
  resetCameraInput();
  ROVER.vel.set(0, 0, 0);
  ROVER.omega.set(0, 0, 0);
  saveParkRover();
  ui.drive.classList.remove('is-active');
  ui.drive.textContent = '遥控探测车';
  showDriveHint(false);
  camera.fov = 46;
  camera.updateProjectionMatrix();
  updateCamera();
  refreshJourney();
}

async function toggleRover() {
  if (!canAct() || roverLoading) return;
  if (DRIVING) { stopDriving(); return; }
  cancelPlacing();
  resetCameraInput();
  roverLoading = true;
  ui.drive.disabled = true;
  try {
   if (!ROVER) {
    ui.drive.textContent = '正在展开…';
    const [{ Rover, DRIVE }, { makeTerrainAdapter }, { makeDriveInput }, 相机] =
      await Promise.all([
        import('../../tools/rover/载具.js'),
        import('../../tools/rover/地形适配.js'),
        import('../../tools/rover/输入.js'),
        import('../../tools/rover/相机机架.js'),
      ]);
    const { makeCameraRig } = 相机;
    CAM_MODE = 相机.CAM_MODE;
    DRIVE.fence = 0;
    terrainAdapter = makeTerrainAdapter((x, z, cell) => terrainHeight(x, z, cell === undefined ? 0.05 : cell));
    ROVER = new Rover(terrainAdapter, scene);
    const c0 = CAMPUSES[0];
    const parked = JOURNEY ? getJourney()?.parkRover : null;
    if (parked && Number.isFinite(parked.x) && Number.isFinite(parked.z)) {
      ROVER.placeAt(parked.x, parked.z, Number.isFinite(parked.heading) ? parked.heading : -Math.PI / 2);
      ROVER.odo = Math.max(0, Number(parked.odo) || 0);
      resolveRoverCollisions();
    } else {
      ROVER.placeAt(c0.x + DOME_BASE_RADIUS + 26, c0.z + 40, -Math.PI / 2);
    }
    ROVER.panelDeploy = 1;
    drvIn = makeDriveInput(window, { canvas });
    drvIn.setEnabled(false);
    /* 园区里视距上限给到 90 m：穹顶半径 130，拉太近看不出车在哪座楼下面。
       但也不能给到看园区的那个 6000 —— 那是俯瞰机位的量级，驾驶时用不上。 */
    rig = makeCameraRig(camera, terrainAdapter, { fov: 52, fovGain: 13, dist: 9.2, distMin: 1.6, distMax: 240 });
    ROVER.__drive = DRIVE;
   }
   if (!canAct()) { ui.drive.textContent = '遥控探测车'; return; }
   DRIVING = true;
   drvIn.reset();
   drvIn.setEnabled(true);
   rig.setMode(CAM_MODE.CHASE, ROVER);
   rig.first = true;
   rig.yaw = Math.atan2(ROVER.forward.x, ROVER.forward.z) + Math.PI;
   ui.drive.classList.add('is-active');
   ui.drive.textContent = '结束遥控';
   showDriveHint(true);
  } catch (error) {
    drvIn?.dispose();
    drvIn = null;
    ROVER?.root.removeFromParent();
    ROVER = null;
    rig = null;
    DRIVING = false;
    throw error;
  } finally {
    roverLoading = false;
    ui.drive.disabled = !canAct();
    refreshJourney();
  }
}

/* 两套操作提示只显示一套。驾驶时「WASD 平移」是错的 ——
   那时候 WASD 是油门和转向，照着提示按会以为坏了。 */
function showDriveHint(on) {
  // 用 display 而不是 hidden 属性：.controls 的 display:flex 优先级更高，
  // 挂 hidden 上去两条提示会原地叠在一起。
  if (ui.hintWalk) ui.hintWalk.style.display = on ? 'none' : '';
  if (ui.hintDrive) ui.hintDrive.style.display = on ? '' : 'none';
  if (on && ui.hintCam && rig) ui.hintCam.textContent = rig.modeName;
}

/* 载入失败要说出来。之前 importmap 少了 three/addons 那一条，
   模块解析不到，按钮就永远停在「正在展开…」，什么提示都没有。 */
function roverFailed(err) {
  ui.drive.textContent = '火星车载入失败';
  ui.drive.title = String(err && err.message || err);
  journeyUI?.toast('火星车暂时无法载入，请重试。建设进度已保存。');
  console.error('[火星车]', err);
}
if (ui.drive) ui.drive.addEventListener('click', () => (mobility ? (DRIVING ? mobility.walk() : mobility.boardRover()) : toggleRover()).catch(roverFailed));

function rescueRover() {
  if (!canAct() || !ROVER) return;
  const c = CAMPUSES[0];
  drvIn?.reset();
  ROVER.placeAt(c.x + DOME_BASE_RADIUS + 26, c.z + 40, -Math.PI / 2);
  if (rig) rig.first = true;
  saveParkRover();
  journeyUI?.toast('火星车已移回主站外，按 W / S 行驶，空格刹车。');
}
ui.rescue?.addEventListener('click', rescueRover);

/* ---- 任务进度：场景恢复、建设检查与启动确认 ---- */
function saveCampuses() {
  updateJourney({ campuses: CAMPUSES.map(({ name, x, z }) => ({ name, x, z })) });
}

function recommendedSite() {
  const options = [[380, 0], [0, -380], [-380, 0], [0, 380]];
  return options.map(([x, z]) => ({ x, z })).find((p) =>
    CAMPUSES.every((c) => Math.hypot(p.x - c.x, p.z - c.z) >= PAD_R * 2 + 40));
}

function buildRecommended() {
  if (!canAct() || CAMPUSES.length >= 4) return;
  const p = recommendedSite();
  if (!p) { journeyUI?.toast('推荐位置已使用，可点击「新建」自由选择地面。'); return; }
  stopDriving();
  cancelPlacing();
  const name = (ui.name?.value || '').trim() || defaultName();
  if (addCampus(name, p.x, p.z)) {
    if (ui.name) ui.name.value = '';
    showStationOverview();
  }
}
ui.recommend?.addEventListener('click', buildRecommended);

function showStationOverview() {
  setPreset('overview', CAMPUSES[0]);
  if (CAMPUSES.length < 2) return;
  const x = CAMPUSES.reduce((sum, c) => sum + c.x, 0) / CAMPUSES.length;
  const z = CAMPUSES.reduce((sum, c) => sum + c.z, 0) / CAMPUSES.length;
  const spread = Math.max(...CAMPUSES.map((c) => Math.hypot(c.x - x, c.z - z)));
  cameraState.tween.to.target.set(x, terrainHeight(x, z, 8) + 18, z);
  cameraState.tween.to.distance = Math.max(650, (spread + DOME_BASE_RADIUS) * 2.35);
  cameraState.tween.to.pitch = 0.58;
}

function visitGreenhouse() {
  if (!canAct()) return;
  if (!getJourney()?.greenhouseVisited) {
    updateJourney({ greenhouseVisited: true });
    journeyUI.toast('温室巡视完成：供水与植被已确认，记录已保存。');
  }
  refreshJourney();
}

function commissionStation() {
  const state = getJourney();
  if (!canAct() || CAMPUSES.length < 2 || !state?.greenhouseVisited || state.commissioned) return;
  stopDriving();
  cancelPlacing();
  updateJourney({ commissioned: true });
  showStationOverview();
  refreshJourney();
  journeyUI.showBrief({
    title: '曙光先遣站，正式启用',
    body: `从轨道选址、地表勘测到穹顶建成，你已经在火星建立了第一处可持续驻地。${CAMPUSES.length} 座穹顶已通过加压连廊互联，温室巡视完成。进度已保存；可以继续扩建，或用「返回轨道」俯瞰这次旅程。`,
    button: '继续建设',
    onStart: () => refreshJourney(),
  });
}

function finishLoading() {
  sceneReady = true;
  if (!mobility) initMobility();
  refreshList();
  if (!JOURNEY) {
    ui.add.disabled = false;
    ui.drive.disabled = false;
    document.querySelectorAll('[data-view]').forEach((button) => { button.disabled = false; });
    return;
  }
  refreshJourney();
  if (savedCampuses.length > 1) showStationOverview();
  if (!savedCampuses.length) {
    journeyUI.showBrief({
      title: '第一座穹顶已经就位',
      body: '这里是你的曙光主站。接下来，在距主站 380 米的推荐位置扩建第二座穹顶，连廊会自动接通。点击顶部「温室」视角完成巡视，最后亲手启动先遣站。命名框可给下一座穹顶取名，所有建设会自动保存。',
      button: '开始建设',
      onStart: () => refreshJourney(),
    });
  }
}

function refreshJourney() {
  if (!JOURNEY || !journeyUI) return;
  const state = getJourney();
  const connected = CAMPUSES.length >= 2;
  const inspected = !!state?.greenhouseVisited;
  const done = !!state?.commissioned;
  const available = canAct();
  const objective = !sceneReady ? ['正在准备先遣站', '正在构建地形与穹顶，请稍候。']
    : done ? ['先遣站已启用', '继续建设至多 4 座穹顶，或返回轨道回顾这次旅程。']
    : !connected ? ['扩建第二座穹顶', '使用推荐位置，在主站 380 米外建造第二座穹顶，连廊将自动接通。']
    : !inspected ? ['巡视温室', '点击顶部「温室」视角，确认先遣站的绿色生命支持区。']
    : ['启动先遣站', '两座穹顶已连通，温室巡视完成。亲手启动驻地，完成这次火星任务。'];
  journeyUI.setObjective({ kicker: '第三阶段 · 建设', title: objective[0], body: objective[1],
    progress: done ? 1 : 0.65 + (connected ? 0.15 : 0) + (inspected ? 0.1 : 0) });
  journeyUI.setTelemetry([
    { label: '穹顶', value: `${CAMPUSES.length} / 4` },
    { label: '连廊', value: `${TRAMS.length} 条` },
    { label: '温室', value: inspected ? '已巡视' : '待巡视' },
    { label: '状态', value: done ? '已启用' : '筹建中' },
  ]);
  const actions = [];
  if (!connected) actions.push({ id: 'expand', label: '建造第二座穹顶', primary: true, disabled: !available,
    onClick: buildRecommended });
  else if (!inspected) actions.push({ id: 'greenhouse', label: '巡视温室', primary: true, disabled: !available,
    onClick: () => { stopDriving(); setPreset('greenhouse'); visitGreenhouse(); } });
  else if (!done) actions.push({ id: 'commission', label: '启动先遣站', primary: true, disabled: !available,
    onClick: commissionStation });
  if (done) actions.push({ id: 'orbit', label: '返回轨道', primary: true, disabled: !available,
    onClick: () => { saveParkRover(); location.href = sceneURL('orbit'); } });
  actions.push({ id: 'surface', label: '返回地表', disabled: !available,
    onClick: () => { saveParkRover(); location.href = sceneURL('surface'); } });
  journeyUI.setActions(actions);
  ui.recommend.hidden = false;
  ui.recommend.disabled = !available || CAMPUSES.length >= 4 || !recommendedSite();
  ui.recommend.textContent = CAMPUSES.length >= 4 ? '先遣站已达到 4 座穹顶' : '在推荐位置扩建 · 380 m';
  ui.rescue.hidden = !ROVER;
  ui.rescue.disabled = !available;
  ui.add.disabled = !available || DRIVING || CAMPUSES.length >= 4;
  ui.name.disabled = !available || CAMPUSES.length >= 4;
  ui.drive.disabled = !available || roverLoading;
  if (ui.hint) ui.hint.textContent = CAMPUSES.length >= 4 ? '园区建设已达上限，可巡视或驾驶探索。'
    : DRIVING ? 'W / S 行驶 · A / D 转向 · 空格刹车 · 拖动环视'
    : '也可点「新建」自由放置，中心至少相距 340 m。';
  document.querySelectorAll('[data-view], #campus-list button').forEach((button) => { button.disabled = !available; });
}

/* 也开放一个程序接口。手点只能放在看得见的地方，
   而整平区要求两座中心至少隔 340 m —— 拉远镜头去点很别扭。 */
window.__PARK = {
  建园: (name, x, z) => { const c = addCampus(name, x, z); refreshList(); return !!c; },
  园区: CAMPUSES,
  轨道车: TRAMS,
  火星车: () => ROVER,
  相机机架: () => rig,
};

/* ------------------------------------------------------------
   火星车碰撞
   ------------------------------------------------------------
   载具那套物理只认地形，不认场景里的建筑 —— 它原本跑在一片空旷的
   月面上，除了地面没有别的东西可撞。搬到有穹顶和连廊的园区里，
   就会直接从玻璃里穿过去。

   这里不引入完整的碰撞系统，只做两类圆柱体的平面推回：
   穹顶是半径 130 m 的立柱，连廊是一条有粗细的线段。
   两者都是加压结构，撞上去本来也不该有任何弹性 —— 停住就是对的。

   推回之后要把「指向障碍物的那一半速度」清掉，只保留切向。
   不清的话车会贴着墙一直抖，因为每帧都被推出来又被油门顶回去。
   ------------------------------------------------------------ */
const ROVER_R = 1.75;

function pushOutOfCircle(p, v, cx, cz, radius) {
  const dx = p.x - cx, dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= radius || d < 1e-4) return false;
  const nx = dx / d, nz = dz / d;
  p.x = cx + nx * radius;
  p.z = cz + nz * radius;
  const vn = v.x * nx + v.z * nz;
  if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
  return true;
}

function resolveRoverCollisions() {
  const p = ROVER.pos, v = ROVER.vel;
  let hit = false;

  for (const c of CAMPUSES) {
    if (pushOutOfCircle(p, v, c.x, c.z, DOME_BASE_RADIUS + ROVER_R)) hit = true;
  }

  /* 连廊按线段算：把车心投影到线段上，取最近点当圆心推。
     连廊底面离地只有半米，车钻不过去，所以整条都是墙。 */
  for (const tr of TRAMS) {
    const a = tr.curve.getPoint(0), b = tr.curve.getPoint(1);
    const ax = b.x - a.x, az = b.z - a.z;
    const len2 = ax * ax + az * az;
    if (len2 < 1e-6) continue;
    let t = ((p.x - a.x) * ax + (p.z - a.z) * az) / len2;
    t = clamp(t, 0, 1);
    if (pushOutOfCircle(p, v, a.x + ax * t, a.z + az * t, 2.6 + ROVER_R)) hit = true;
  }

  if (hit) ROVER.sync();          // 改了 pos 就得把渲染变换同步回去
}

/* 自由机位下 WASD 在飞相机，车必须停住 —— 否则一按 W 车往前冲、
   相机也往前飞，两件事叠在一起没法用。 */
const 停车指令 = { throttle: 0, steer: 0, brake: 1, tc: true };

function updateRover(dt) {
  if (!canAct() || !DRIVING || !ROVER) return;
  const rawControl = drvIn.update(dt);
  const ctl = mobility?.driveControl(rawControl,dt) || rawControl;
  if (ctl.camCycle) {
    rig.cycle(ROVER);
    if (ui.hintCam) ui.hintCam.textContent = rig.modeName;
  }
  const drive = rig.mode === CAM_MODE.PHOTO ? 停车指令 : ctl;
  ROVER.step(dt, drive, terrainAdapter);
  resolveRoverCollisions();
  ROVER.updateVisuals(dt, drive);
  rig.update(dt, ROVER, ctl);
  if (JOURNEY) {
    roverSaveTime += dt;
    if (roverSaveTime >= 2) { saveParkRover(); roverSaveTime = 0; }
  }
}

const updateMovement = installControls();
const clock = new THREE.Clock();

function render(time) {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (!scenePaused) {
    sceneTime += delta * 1000;
    stepBuild(sceneTime);
    updateTrams(delta);
    updateRover(delta);
    if (!DRIVING && !mobility?.active && !mobility?.walking) {
      updateCameraTween(sceneTime);
      updateMovement(delta);
      updateCamera();
    }
    updateAutomaticMotion(sceneTime, delta);
  }
  mobility?.update(scenePaused ? 0 : delta, time);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
});

window.addEventListener('cosmos:quality', () => {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
});
window.addEventListener('pagehide', saveParkRover);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveParkRover(); });

ui.add.disabled = true;
ui.drive.disabled = true;
document.querySelectorAll('[data-view]').forEach((button) => { button.disabled = true; });

if (JOURNEY && (!savedJourney?.landed || !SURVEY_IDS.every((id) => savedJourney.survey.includes(id)))) {
  location.replace(sceneURL(savedJourney?.landed ? 'surface' : 'orbit'));
} else {
  if (JOURNEY) {
    journeyUI = mountJourneyUI({ scene: 'park', title: '先遣站建设', onPause(paused) {
      scenePaused = paused;
      mobility?.setPaused(paused);
      resetCameraInput();
      drvIn?.reset();
      drvIn?.setEnabled(!paused && DRIVING);
      if (paused) {
        cancelPlacing();
        if (ROVER) { ROVER.vel.set(0, 0, 0); ROVER.omega.set(0, 0, 0); }
        saveParkRover();
      }
      refreshJourney();
    } });
    refreshJourney();
  }
  init().then(() => requestAnimationFrame(render)).catch((error) => {
    loading.querySelector('.loading-copy > span').textContent = '场景未能载入，请刷新后重试';
    console.error('[先遣站]', error);
  });
}

function initMobility() {
  const obstacles = () => [
    ...CAMPUSES.map(c=>({x:c.x,z:c.z,radius:DOME_BASE_RADIUS+4,height:DOME_HEIGHT+3})),
    ...TRAMS.map(t=>({type:'line',a:t.curve.getPoint(0),b:t.curve.getPoint(1),radius:6,height:12})),
  ];
  mobility=mountMobility({kind:'park',site:SITE,scene,camera,canvas,
    heightAt:(x,z)=>terrainHeight(x,z,.05),getObstacles:obstacles,
    rover:{traction:()=>drvIn?.ctl.tc??true,toggleTraction:()=>{if(drvIn)drvIn.ctl.tc=!drvIn.ctl.tc;},model:()=>ROVER,photo:()=>{if(rig){rig.setMode(rig.mode===CAM_MODE.PHOTO?CAM_MODE.CHASE:CAM_MODE.PHOTO,ROVER);}},cycle:()=>rig?.cycle(ROVER),view:()=>rig?.modeName,ready:()=>!!ROVER,driving:()=>DRIVING,speed:()=>ROVER?.speed||0,
      position:()=>ROVER?{x:ROVER.pos.x,z:ROVER.pos.z,heading:Math.atan2(ROVER.forward.x,ROVER.forward.z)}:{x:CAMPUSES[0].x+156,z:CAMPUSES[0].z+40,heading:-Math.PI/2},
      ensure:async()=>{if(!ROVER)await toggleRover();},enter:toggleRover,exit:stopDriving},
    onOverview:()=>{resetCameraInput();updateCamera();},
    getPlayer:()=>ROVER?{x:ROVER.pos.x,z:ROVER.pos.z,heading:Math.atan2(ROVER.forward.x,ROVER.forward.z)}:{x:CAMPUSES[0].x+156,z:CAMPUSES[0].z+40,heading:-Math.PI/2},
    getLandmarks:()=>CAMPUSES.flatMap((c,i)=>{
      const point=(x,z)=>({x:c.x+x*Math.cos(c.rot)+z*Math.sin(c.rot),z:c.z-x*Math.sin(c.rot)+z*Math.cos(c.rot)});
      const approach=point(0,147);
      return [{id:'campus-'+i,name:c.name,x:c.x,z:c.z,type:'穹顶',approach},
        ...[['入口气闸',0,103],['公共大厅',-8,-6],['温室',55,-13],['观测塔',-57,-37],['太阳能场',-64,59],['轨道车站',0,91]].map(([name,x,z],j)=>({id:`building-${i}-${j}`,name:c.name+' · '+name,...point(x,z),type:'建筑',approach}))];
    }).concat(TRAMS.map((t,i)=>{const p=t.curve.getPoint(.5);return{id:'link-'+i,name:'加压连廊 '+(i+1),x:p.x,z:p.z,type:'连廊',approach:{x:p.x,z:p.z+14}};})),
    onBoard:()=>{stopDriving();cancelPlacing();resetCameraInput();},
    onBlock:value=>{scenePaused=value||!!journeyUI?.paused;resetCameraInput();drvIn?.setEnabled(DRIVING&&!scenePaused);},
    onOrbit:({lat,lon,target})=>{
      saveParkRover();const url=new URL('../tools/mars-orbit.html',location.href);
      url.searchParams.set('flight','1');url.searchParams.set('lat',target?.lat??lat);url.searchParams.set('lon',target?.lon??lon);
      if(target)url.searchParams.set('target','1');
      if(JOURNEY)url.searchParams.set('journey','1');location.href=url.href;
    },notify:message=>journeyUI?.toast(message),
  });
  window.__MOBILITY=mobility;
}
