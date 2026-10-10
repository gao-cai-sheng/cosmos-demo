import * as THREE from 'three';

/** Small, repeatable surface finishes for the playable outpost. No downloaded images or runtime randomness. */
export const OUTPOST_MATERIAL_SEED = 0x51c0a7;
const SIZE = 128;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function hash(x, y, seed) {
  let n = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// A periodic low frequency field lets the color and roughness follow the same surface structure.
function field(x, y, cells, seed) {
  const gx = x * cells / SIZE, gy = y * cells / SIZE;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const sx = (gx - ix) ** 2 * (3 - 2 * (gx - ix));
  const sy = (gy - iy) ** 2 * (3 - 2 * (gy - iy));
  const h = (dx, dy) => hash((ix + dx + cells) % cells, (iy + dy + cells) % cells, seed);
  const a = h(0, 0) * (1 - sx) + h(1, 0) * sx;
  const b = h(0, 1) * (1 - sx) + h(1, 1) * sx;
  return (a * (1 - sy) + b * sy) * 2 - 1;
}

function surface(name, repeat, sample) {
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = SIZE;
  colorCanvas.height = roughCanvas.height = SIZE;
  const colorContext = colorCanvas.getContext('2d');
  const roughContext = roughCanvas.getContext('2d');
  if (!colorContext || !roughContext) throw new Error('Outpost materials require a 2D canvas');
  const color = colorContext.createImageData(SIZE, SIZE);
  const rough = roughContext.createImageData(SIZE, SIZE);
  const seed = OUTPOST_MATERIAL_SEED ^ [...name].reduce((n, c) => Math.imul(n, 33) ^ c.charCodeAt(0), 5381);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fine = hash(x, y, seed + 1) * 2 - 1;
    const broad = field(x, y, 8, seed + 2);
    const [tone, microsurface] = sample(x, y, broad, fine);
    const i = (y * SIZE + x) * 4;
    const c = Math.round(clamp(tone) * 255), r = Math.round(clamp(microsurface) * 255);
    color.data[i] = color.data[i + 1] = color.data[i + 2] = c;
    rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = r;
    color.data[i + 3] = rough.data[i + 3] = 255;
  }
  colorContext.putImageData(color, 0, 0);
  roughContext.putImageData(rough, 0, 0);
  const texture = (canvas, channel) => {
    const t = new THREE.CanvasTexture(canvas);
    t.name = `outpost.${name}.${channel}`;
    t.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    return t;
  };
  return {map: texture(colorCanvas, 'color'), roughnessMap: texture(roughCanvas, 'roughness')};
}

function makeSurfaces() {
  return {
    // Powder coat has a very small mottled variation, without suggesting corrosion.
    coat: surface('coat', 4, (_x, _y, broad, fine) =>
      [.975 + broad * .018 + fine * .006, .67 + broad * .035 + fine * .012]),
    // A restrained circular grip pattern. No apparent height is needed for the floor to read.
    grip: surface('grip', 8, (x, y, broad, fine) => {
      const dx = x % 8 - 3.5, dy = y % 8 - 3.5;
      const pit = dx * dx + dy * dy < 1.5 ? 1 : 0;
      return [.965 - pit * .055 + broad * .012 + fine * .006,
              .85 + pit * .045 + broad * .018 + fine * .01];
    }),
    // Brushing is directional and finer than a panel seam.
    metal: surface('metal', 4, (x, _y, broad, fine) => {
      const brush = Math.sin(x * Math.PI * 2 / 5) * .5 + fine * .5;
      return [.96 + brush * .022 + broad * .01, .48 + brush * .035 + broad * .015];
    }),
    weave: surface('weave', 4, (x, y, broad, fine) => {
      const thread = Math.sin(x * Math.PI / 3) * Math.sin(y * Math.PI / 3);
      return [.955 + thread * .026 + broad * .014 + fine * .005,
              .87 + thread * .025 + broad * .016 + fine * .009];
    }),
    rubber: surface('rubber', 6, (_x, _y, broad, fine) =>
      [.96 + broad * .014 + fine * .009, .93 + broad * .017 + fine * .014]),
    // Warm composite laminate for a few touch surfaces, not a broad timber interior.
    laminate: surface('laminate', 3, (x, y, broad, fine) => {
      const grain = Math.sin((y + Math.sin(x / 17) * 2) * Math.PI * 2 / 21);
      return [.95 + grain * .025 + broad * .018 + fine * .005,
              .59 + grain * .026 + broad * .022 + fine * .009];
    }),
  };
}

/**
 * Compatible with every slot used by outpost-interior.js. Maps are shared by finish, so only
 * twelve 128px textures are uploaded even when many meshes use these materials.
 * Call disposeOutpostInteriorMaterials() after the interior's dispose() when supplying this set.
 */
export function createOutpostInteriorMaterials() {
  const s = makeSurfaces();
  const pbr = (color, metalness, finish, extra = {}) => new THREE.MeshStandardMaterial({
    color, metalness, roughness: 1, map: s[finish].map, roughnessMap: s[finish].roughnessMap, ...extra,
  });
  const materials = {
    deck: pbr(0x69777a, .14, 'grip'),
    panel: pbr(0xd9dbd4, .11, 'coat'),
    trim: pbr(0xb9c3c1, .64, 'metal'),
    dark: pbr(0x35454a, .52, 'metal'),
    seal: pbr(0x182327, .02, 'rubber'),
    fabric: pbr(0x557275, .02, 'weave'),
    linen: pbr(0xd7cbbb, .01, 'weave'),
    glass: new THREE.MeshStandardMaterial({color:0xa6d7df,transparent:true,opacity:.26,
      roughness:.13,metalness:.02,depthWrite:false,side:THREE.DoubleSide}),
    screen: new THREE.MeshBasicMaterial({color:0x183743}),
    readout: new THREE.MeshBasicMaterial({color:0x8bded4}),
    accent: new THREE.MeshBasicMaterial({color:0xf6ac6c}),
    warm: new THREE.MeshBasicMaterial({color:0xffe7c2}),
    cool: new THREE.MeshBasicMaterial({color:0x9bcacb}),
    grow: new THREE.MeshBasicMaterial({color:0xd7b0a3}),
    soil: pbr(0x584437, .0, 'rubber'),
    leaf: pbr(0x618755, .0, 'coat', {side:THREE.DoubleSide}),
    leafDeep: pbr(0x3f7058, .0, 'coat', {side:THREE.DoubleSide}),
    ochre: pbr(0xa8724f, .16, 'coat'),
    // Optional slots for the new living-area geometry.
    floorInset: pbr(0x34474b, .03, 'grip'),
    muted: pbr(0x899693, .15, 'coat'),
    cushion: pbr(0x957466, .02, 'weave'),
    wood: pbr(0x9b7862, .02, 'laminate'),
    brass: pbr(0xaa8967, .72, 'metal'),
  };
  Object.defineProperty(materials, 'dispose', {
    value: () => disposeOutpostInteriorMaterials(materials), enumerable: false,
  });
  return materials;
}

/** Dispose each shared texture exactly once, then its materials. Safe for sets with shared maps. */
export function disposeOutpostInteriorMaterials(materials) {
  const textures = new Set();
  for (const material of Object.values(materials)) {
    if (!material?.isMaterial) continue;
    for (const key of ['map','roughnessMap','normalMap','bumpMap','metalnessMap','aoMap','emissiveMap']) {
      if (material[key]?.isTexture) textures.add(material[key]);
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}
