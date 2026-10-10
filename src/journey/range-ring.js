import * as THREE from 'three';

// Ground ring marking how close the operator must walk before a craft answers.
// A flat disc would sink into slopes and float over dips at this radius, so every
// vertex samples the terrain: the band follows the ground the walk actually crosses.
export function createRangeRing({scene, heightAt, radius, width = 3.6, segments = 240, lift = .16,
  color = 0x5fd8f5, reachedColor = 0x58e8a6}) {
  const positions = new Float32Array(segments * 2 * 3);
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', attribute);
  const index = [];
  for (let i = 0; i < segments; i++) {
    const inner = i * 2, outer = inner + 1, nextInner = ((i + 1) % segments) * 2, nextOuter = nextInner + 1;
    index.push(inner, outer, nextOuter, inner, nextOuter, nextInner);
  }
  geometry.setIndex(index);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3; mesh.frustumCulled = false; mesh.visible = false; mesh.name = '可操控范围';
  scene.add(mesh);
  const outside = new THREE.Color(color), inside = new THREE.Color(reachedColor);
  let centre = null, phase = 0, reached = false;

  // Re-sampling the whole band is only worth it when the craft actually parks somewhere new.
  function place(x, z) {
    if (centre && Math.hypot(centre.x - x, centre.z - z) < .5) return;
    centre = { x, z };
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      for (let edge = 0; edge < 2; edge++) {
        const r = radius + (edge ? width : -width) / 2, px = x + cos * r, pz = z + sin * r, o = (i * 2 + edge) * 3;
        positions[o] = px; positions[o + 1] = heightAt(px, pz) + lift; positions[o + 2] = pz;
      }
    }
    attribute.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  return {
    mesh, radius,
    // Inside the radius the ring turns green and pulses faster: the craft is answering now.
    update(dt, { visible = false, x = 0, z = 0, within = false } = {}) {
      mesh.visible = !!visible;
      if (!visible) return;
      place(x, z);
      if (within !== reached) { reached = within; material.color.copy(within ? inside : outside); }
      phase = (phase + dt * (within ? 3.4 : 1.7)) % (Math.PI * 2);
      const pulse = .5 + .5 * Math.sin(phase);
      material.opacity = (within ? .5 : .38) + pulse * (within ? .45 : .4);
    },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}
