import * as THREE from 'three';
import {createBootTrail} from './boot-trail.js';

/** Scene mesh for the EVA boot prints. One geometry, one draw call, one shared sole texture;
 *  the left boot gets it mirrored in u so the tread is not the same stamp twice. */

/** The sole, drawn once into a canvas: toe at the top (v=1), heel at the bottom, a waist between
 *  them, and lugs cut out of the middle. Alpha carries the shape, so the mesh can tint it. */
function soleTexture() {
  const w = 64, h = 128, canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(w * .5, h * .02);
  c.bezierCurveTo(w * .95, h * .06, w * .96, h * .32, w * .74, h * .42);   // outer edge, toe to waist
  c.bezierCurveTo(w * .66, h * .5, w * .68, h * .62, w * .8, h * .72);     // waist to heel
  c.bezierCurveTo(w * .94, h * .84, w * .86, h * .98, w * .5, h * .985);
  c.bezierCurveTo(w * .14, h * .98, w * .06, h * .84, w * .2, h * .72);
  c.bezierCurveTo(w * .32, h * .62, w * .34, h * .5, w * .26, h * .42);
  c.bezierCurveTo(w * .04, h * .32, w * .05, h * .06, w * .5, h * .02);
  c.fill();
  // Lugs: grooves across the tread. Cutting them out keeps the print from reading as a blob.
  c.globalCompositeOperation = 'destination-out';
  c.lineWidth = h * .022;
  c.strokeStyle = '#000';
  for (const y of [.11, .19, .27, .35, .78, .87]) {
    c.beginPath(); c.moveTo(0, h * y); c.lineTo(w, h * y); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createBootPrints({parent, name = 'EVA boot prints', ...options}) {
  let geometry = null;
  const trail = createBootTrail({...options, onWrite: count => {
    geometry.setDrawRange(0, count * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
  }});
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(trail.positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(trail.uvs, 2).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: soleTexture(), color: 0x4a2115, transparent: true, opacity: .62, alphaTest: .04,
    side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3}));
  mesh.name = name;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return {mesh, step: trail.step, reset: trail.reset, get count() { return trail.count; }};
}
