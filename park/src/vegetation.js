import * as THREE from 'three';

const TAU = Math.PI * 2;

class SeededRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  value(min = 0, max = 1) {
    this.state += 0x6D2B79F5;
    let value = this.state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    const normalized = ((value ^ value >>> 14) >>> 0) / 4294967296;
    return min + (max - min) * normalized;
  }

  shuffledIndices(count) {
    const values = Array.from({ length: count }, (_, index) => index);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.value(0, index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }
}

export const domeAshPreset = {
  name: 'Dome Ash 01',
  seed: 48371,
  branchLevels: 3,
  growthForce: new THREE.Vector3(0, 1, 0),
  forceStrength: 0.012,
  branch: {
    angle: [0, 49, 67, 56],
    children: [5, 3, 2, 0],
    gnarliness: [0.025, 0.13, 0.18, 0.22],
    length: [9.4, 5.6, 2.15, 0.82],
    radius: [0.76, 0.62, 0.7, 0.68],
    sections: [8, 6, 5, 3],
    segments: [10, 7, 5, 4],
    start: [0, 0.28, 0.33, 0.18],
    taper: [0.66, 0.72, 0.78, 0.92],
    twist: [0.055, -0.045, 0.035, 0],
  },
  leaves: {
    angle: 54,
    count: 7,
    start: 0.12,
    size: 0.88,
    sizeVariance: 0.24,
  },
};

function createBranchBuffers() {
  return {
    positions: [],
    normals: [],
    uvs: [],
    levels: [],
    continuations: [],
    indices: [],
  };
}

function createLeafBuffers() {
  return {
    positions: [],
    normals: [],
    uvs: [],
    phases: [],
    tints: [],
    indices: [],
  };
}

function makeGeometry(buffers, extraAttributes = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  for (const [name, definition] of Object.entries(extraAttributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(definition.values, definition.size));
  }
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function interpolateSection(sections, normalizedDistance) {
  const scaled = normalizedDistance * (sections.length - 1);
  const indexA = Math.min(Math.floor(scaled), sections.length - 1);
  const indexB = Math.min(indexA + 1, sections.length - 1);
  const alpha = scaled - indexA;
  const sectionA = sections[indexA];
  const sectionB = sections[indexB];
  const quaternionA = sectionA.quaternion.clone();
  const quaternionB = sectionB.quaternion.clone();
  return {
    origin: new THREE.Vector3().lerpVectors(sectionA.origin, sectionB.origin, alpha),
    radius: THREE.MathUtils.lerp(sectionA.radius, sectionB.radius, alpha),
    quaternion: quaternionB.slerp(quaternionA, alpha),
  };
}

function pushBranchVertex(buffers, position, normal, uv, level, continuation) {
  const index = buffers.positions.length / 3;
  buffers.positions.push(position.x, position.y, position.z);
  buffers.normals.push(normal.x, normal.y, normal.z);
  buffers.uvs.push(uv.x, uv.y);
  buffers.levels.push(level);
  buffers.continuations.push(continuation ? 1 : 0);
  return index;
}

function createLeafMaterial(sunDirection) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 0.16 },
      uWindDirection: { value: new THREE.Vector2(0.88, 0.47).normalize() },
      uSunDirection: { value: sunDirection.clone().normalize() },
      uRootColor: { value: new THREE.Color('#38553f') },
      uTipColor: { value: new THREE.Color('#a5bd75') },
      uAccentColor: { value: new THREE.Color('#718e57') },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aTint;
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uWindDirection;
      varying vec2 vUv;
      varying float vTint;
      varying float vPhase;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        float rooted = pow(clamp(uv.y, 0.0, 1.0), 1.65);
        float low = sin(uTime * 0.72 + aPhase);
        float high = sin(uTime * 2.35 + aPhase * 1.83) * 0.32;
        float gust = 0.72 + 0.28 * sin(uTime * 0.21 + aPhase * 0.41);
        float displacement = (low + high) * gust * uWindStrength * rooted;
        vec3 transformed = position;
        transformed.xz += uWindDirection * displacement;
        transformed.y -= abs(displacement) * rooted * 0.12;
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vUv = uv;
        vTint = aTint;
        vPhase = aPhase;
        vNormal = normalize(normalMatrix * normal);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uRootColor;
      uniform vec3 uTipColor;
      uniform vec3 uAccentColor;
      varying vec2 vUv;
      varying float vTint;
      varying float vPhase;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        float body = pow(max(sin(y * 3.14159265), 0.0), 0.62);
        float serration = 0.94 + sin(y * 54.0 + vPhase) * 0.045;
        float halfWidth = max(0.025, body * 0.47 * serration);
        float distanceFromStem = abs(vUv.x - 0.5);
        float edge = 1.0 - smoothstep(halfWidth - 0.025, halfWidth, distanceFromStem);
        if (edge < 0.5) discard;

        vec3 normal = normalize(vNormal);
        if (!gl_FrontFacing) normal *= -1.0;
        vec3 lightDirection = normalize(uSunDirection);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float diffuse = max(dot(normal, lightDirection), 0.0);
        float backlight = pow(max(dot(viewDirection, -lightDirection), 0.0), 2.0) * y;
        float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
        vec3 color = mix(uRootColor, uTipColor, pow(y, 0.72));
        color = mix(color, uAccentColor, vTint * 0.34);
        color *= 0.56 + diffuse * 0.58;
        color += uTipColor * backlight * 0.18 + vec3(0.48, 0.62, 0.39) * rim * 0.1;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createStructuredTree({
  preset = domeAshPreset,
  sunDirection = new THREE.Vector3(-0.62, 0.34, -0.71),
} = {}) {
  const random = new SeededRandom(preset.seed);
  const branchBuffers = createBranchBuffers();
  const leafBuffers = createLeafBuffers();
  const finalBranches = [];
  const jobs = [{
    origin: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    length: preset.branch.length[0],
    radius: preset.branch.radius[0],
    level: 0,
    sectionCount: preset.branch.sections[0],
    segmentCount: preset.branch.segments[0],
    continuation: true,
  }];
  const stats = {
    preset: preset.name,
    seed: preset.seed,
    branchJobs: [0, 0, 0, 0],
    continuations: [0, 0, 0, 0],
    lateralChildren: [0, 0, 0, 0],
    leafCards: 0,
  };
  const localUp = new THREE.Vector3(0, 1, 0);

  function enqueueLateralChildren(parentLevel, sections) {
    const level = parentLevel + 1;
    const count = preset.branch.children[parentLevel];
    const start = preset.branch.start[level];
    const angularSlots = random.shuffledIndices(count);
    const radialOffset = random.value();
    const step = (1 - start) / count;
    for (let slot = 0; slot < count; slot += 1) {
      const along = start + (slot + random.value()) * step;
      const parent = interpolateSection(sections, along);
      const azimuth = TAU * (radialOffset + (angularSlots[slot] + random.value(-0.5, 0.5)) / count);
      const emergence = THREE.MathUtils.degToRad(preset.branch.angle[level]);
      const localAzimuth = new THREE.Quaternion().setFromAxisAngle(localUp, azimuth);
      const localTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), emergence);
      const quaternion = parent.quaternion.clone().multiply(localAzimuth.multiply(localTilt));
      jobs.push({
        origin: parent.origin,
        quaternion,
        length: preset.branch.length[level],
        radius: preset.branch.radius[level] * parent.radius,
        level,
        sectionCount: preset.branch.sections[level],
        segmentCount: preset.branch.segments[level],
        continuation: false,
      });
      stats.lateralChildren[level] += 1;
    }
  }

  while (jobs.length > 0) {
    const branch = jobs.shift();
    stats.branchJobs[branch.level] += 1;
    if (branch.continuation) stats.continuations[branch.level] += 1;
    const indexOffset = branchBuffers.positions.length / 3;
    const sections = [];
    let quaternion = branch.quaternion.clone();
    let origin = branch.origin.clone();
    const sectionLength = branch.length / branch.sectionCount;

    for (let sectionIndex = 0; sectionIndex <= branch.sectionCount; sectionIndex += 1) {
      let sectionRadius = branch.radius * (1 - preset.branch.taper[branch.level] * sectionIndex / branch.sectionCount);
      if (sectionIndex === branch.sectionCount && branch.level === preset.branchLevels) sectionRadius = 0.002;
      let seamPosition;
      let seamNormal;
      for (let radialIndex = 0; radialIndex < branch.segmentCount; radialIndex += 1) {
        const angle = TAU * radialIndex / branch.segmentCount;
        const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const normal = radial.clone().applyQuaternion(quaternion).normalize();
        const position = radial.clone().multiplyScalar(sectionRadius).applyQuaternion(quaternion).add(origin);
        if (radialIndex === 0) {
          seamPosition = position.clone();
          seamNormal = normal.clone();
        }
        pushBranchVertex(
          branchBuffers,
          position,
          normal,
          new THREE.Vector2(radialIndex / branch.segmentCount, sectionIndex / branch.sectionCount),
          branch.level / preset.branchLevels,
          branch.continuation,
        );
      }
      pushBranchVertex(
        branchBuffers,
        seamPosition,
        seamNormal,
        new THREE.Vector2(1, sectionIndex / branch.sectionCount),
        branch.level / preset.branchLevels,
        branch.continuation,
      );
      sections.push({ origin: origin.clone(), quaternion: quaternion.clone(), radius: sectionRadius });
      origin.add(localUp.clone().multiplyScalar(sectionLength).applyQuaternion(quaternion));

      const safeRadius = Math.max(sectionRadius, 0.002);
      const gnarliness = Math.max(1, 1 / Math.sqrt(safeRadius)) * preset.branch.gnarliness[branch.level];
      const bendX = random.value(-gnarliness, gnarliness);
      const bendZ = random.value(-gnarliness, gnarliness);
      quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bendX, preset.branch.twist[branch.level], bendZ)));
      const sectionUp = localUp.clone().applyQuaternion(quaternion);
      const forceAxis = new THREE.Vector3().crossVectors(sectionUp, preset.growthForce);
      const sine = forceAxis.length();
      if (sine > 1e-6) {
        forceAxis.divideScalar(sine);
        const fullAngle = Math.atan2(sine, sectionUp.dot(preset.growthForce));
        const forceStep = preset.forceStrength / safeRadius;
        quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(forceAxis, THREE.MathUtils.clamp(forceStep, -fullAngle, fullAngle)),
        );
      }
      quaternion.normalize();
    }

    const ringSize = branch.segmentCount + 1;
    for (let sectionIndex = 0; sectionIndex < branch.sectionCount; sectionIndex += 1) {
      for (let radialIndex = 0; radialIndex < branch.segmentCount; radialIndex += 1) {
        const a = indexOffset + sectionIndex * ringSize + radialIndex;
        const b = a + 1;
        const c = a + ringSize;
        const d = b + ringSize;
        branchBuffers.indices.push(a, c, b, b, c, d);
      }
    }

    const finalSection = sections.at(-1);
    if (branch.level < preset.branchLevels) {
      const nextLevel = branch.level + 1;
      jobs.push({
        origin: finalSection.origin,
        quaternion: finalSection.quaternion,
        length: preset.branch.length[nextLevel],
        radius: finalSection.radius,
        level: nextLevel,
        sectionCount: branch.sectionCount,
        segmentCount: branch.segmentCount,
        continuation: true,
      });
      enqueueLateralChildren(branch.level, sections);
    } else {
      finalBranches.push(sections);
    }
  }

  function emitLeaf(origin, quaternion) {
    const size = preset.leaves.size * (1 + random.value(-preset.leaves.sizeVariance, preset.leaves.sizeVariance));
    const phase = random.value(0, TAU);
    const tint = random.value();
    const crownDirection = origin.clone().setY(origin.y * 0.24).normalize();
    for (const cardRotation of [0, Math.PI * 0.5]) {
      const cardQuaternion = quaternion.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(localUp, cardRotation),
      );
      const baseIndex = leafBuffers.positions.length / 3;
      const localVertices = [
        new THREE.Vector3(-size * 0.42, size, 0),
        new THREE.Vector3(-size * 0.42, 0, 0),
        new THREE.Vector3(size * 0.42, 0, 0),
        new THREE.Vector3(size * 0.42, size, 0),
      ];
      const uvs = [[0, 1], [0, 0], [1, 0], [1, 1]];
      const cardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(cardQuaternion).normalize();
      for (let index = 0; index < localVertices.length; index += 1) {
        const position = localVertices[index].clone().applyQuaternion(cardQuaternion).add(origin);
        const roundedNormal = cardNormal.clone()
          .multiplyScalar(0.58)
          .add(crownDirection.clone().multiplyScalar(0.32))
          .add(position.clone().sub(origin).normalize().multiplyScalar(0.1))
          .normalize();
        leafBuffers.positions.push(position.x, position.y, position.z);
        leafBuffers.normals.push(roundedNormal.x, roundedNormal.y, roundedNormal.z);
        leafBuffers.uvs.push(...uvs[index]);
        leafBuffers.phases.push(phase);
        leafBuffers.tints.push(tint);
      }
      leafBuffers.indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
      stats.leafCards += 1;
    }
  }

  for (const sections of finalBranches) {
    const finalSection = sections.at(-1);
    emitLeaf(finalSection.origin, finalSection.quaternion);
    const count = preset.leaves.count;
    const angularSlots = random.shuffledIndices(count);
    const radialOffset = random.value();
    const step = (1 - preset.leaves.start) / count;
    for (let slot = 0; slot < count; slot += 1) {
      const along = preset.leaves.start + (slot + random.value()) * step;
      const parent = interpolateSection(sections, along);
      const azimuth = TAU * (radialOffset + (angularSlots[slot] + random.value(-0.5, 0.5)) / count);
      const tilt = THREE.MathUtils.degToRad(preset.leaves.angle);
      const quaternion = parent.quaternion.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(localUp, azimuth))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt));
      emitLeaf(parent.origin, quaternion);
    }
  }

  const branchGeometry = makeGeometry(branchBuffers, {
    aLevel: { values: branchBuffers.levels, size: 1 },
    aContinuation: { values: branchBuffers.continuations, size: 1 },
  });
  const leafGeometry = makeGeometry(leafBuffers, {
    aPhase: { values: leafBuffers.phases, size: 1 },
    aTint: { values: leafBuffers.tints, size: 1 },
  });
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: '#6a5142',
    roughness: 0.96,
    metalness: 0,
  });
  const leafMaterial = createLeafMaterial(sunDirection);
  const branchMesh = new THREE.Mesh(branchGeometry, branchMaterial);
  branchMesh.name = 'Structured branches';
  branchMesh.castShadow = true;
  branchMesh.receiveShadow = true;
  const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
  leafMesh.name = 'Rooted leaf cards';
  leafMesh.castShadow = false;
  leafMesh.receiveShadow = false;
  const object = new THREE.Group();
  object.name = preset.name;
  object.add(branchMesh, leafMesh);

  stats.branchVertices = branchGeometry.attributes.position.count;
  stats.branchTriangles = branchGeometry.index.count / 3;
  stats.leafVertices = leafGeometry.attributes.position.count;
  stats.leafTriangles = leafGeometry.index.count / 3;
  object.userData.vegetationStats = stats;

  return {
    object,
    stats,
    update(elapsed, motionEnabled = true) {
      leafMaterial.uniforms.uTime.value = motionEnabled ? elapsed : 0;
      leafMaterial.uniforms.uWindStrength.value = motionEnabled ? 0.16 : 0;
    },
  };
}

function createGrassBladeGeometry({ height = 1.05, width = 0.075, segments = 5, planes = 3 } = {}) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let plane = 0; plane < planes; plane += 1) {
    const angle = plane / planes * Math.PI;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const normal = new THREE.Vector3(sine, 0.3, cosine).normalize();
    const baseIndex = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const taper = Math.pow(1 - t, 1.25);
      const lean = Math.pow(t, 1.75) * 0.13;
      const halfWidth = width * (0.14 + 0.86 * taper);
      for (const side of [-1, 1]) {
        const x = side * halfWidth;
        positions.push(x * cosine - lean * sine, t * height, x * sine + lean * cosine);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(side < 0 ? 0 : 1, t);
      }
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const row = baseIndex + segment * 2;
      indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createGrassMaterial({ bladeHeight, sunDirection }) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uBladeHeight: { value: bladeHeight },
      uWindStrength: { value: 0.28 },
      uWindSpeed: { value: 1.35 },
      uWindDirection: { value: new THREE.Vector2(0.88, 0.47).normalize() },
      uSunDirection: { value: sunDirection.clone().normalize() },
      uRootColor: { value: new THREE.Color('#36543b') },
      uTipColor: { value: new THREE.Color('#9eb96a') },
      uRootColorB: { value: new THREE.Color('#415d36') },
      uTipColorB: { value: new THREE.Color('#c0c978') },
    },
    vertexShader: `
      attribute vec2 aOrigin;
      attribute vec2 aFacing;
      attribute float aSeed;
      uniform float uTime;
      uniform float uBladeHeight;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform vec2 uWindDirection;
      varying vec2 vUv;
      varying vec2 vWorldXZ;
      varying float vSeed;
      varying float vGust;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), u.x), u.y);
      }

      void main() {
        float bladeT = clamp(uv.y, 0.0, 1.0);
        float bladePhase = aSeed * 6.28318530718;
        float macro = valueNoise(aOrigin * 0.105 + vec2(31.7, 12.4));
        float heightFactor = mix(0.68, 1.34, macro) * mix(0.88, 1.12, aSeed);
        vec3 local = position;
        local.y *= heightFactor;

        float along = dot(aOrigin, uWindDirection);
        float gustWave = sin(along * 0.19 - uTime * uWindSpeed + bladePhase * 0.16) * 0.5 + 0.5;
        float chop = sin(along * 0.46 - uTime * uWindSpeed * 1.9 + bladePhase) * 0.5 + 0.5;
        float intensity = 0.28 + pow(gustWave, 1.5) * 0.72 + chop * 0.12;
        float rooted = pow(bladeT, 1.55);
        float phi = clamp(uWindStrength * intensity * 1.8, 0.0, 1.2);
        float angle = phi * rooted;
        float radius = uBladeHeight * heightFactor / max(phi, 0.001);
        float arc = radius * (1.0 - cos(angle));
        float drop = radius * sin(angle) - local.y * rooted;
        vec2 localWind = vec2(
          aFacing.x * uWindDirection.x - aFacing.y * uWindDirection.y,
          aFacing.y * uWindDirection.x + aFacing.x * uWindDirection.y
        );
        local.xz += localWind * arc;
        local.y += drop;
        float flutter = sin(uTime * 7.5 + bladePhase * 3.2) * smoothstep(0.62, 1.0, bladeT) * 0.025;
        local.xz += vec2(-localWind.y, localWind.x) * flutter;

        vec4 world = modelMatrix * instanceMatrix * vec4(local, 1.0);
        vUv = uv;
        vWorldXZ = world.xz;
        vSeed = aSeed;
        vGust = gustWave;
        vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uRootColor;
      uniform vec3 uTipColor;
      uniform vec3 uRootColorB;
      uniform vec3 uTipColorB;
      varying vec2 vUv;
      varying vec2 vWorldXZ;
      varying float vSeed;
      varying float vGust;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        float bladeT = clamp(vUv.y, 0.0, 1.0);
        float patchValue = hash21(floor(vWorldXZ * 0.22));
        vec3 gradientA = mix(uRootColor, uTipColor, pow(bladeT, 1.22));
        vec3 gradientB = mix(uRootColorB, uTipColorB, pow(bladeT, 1.1));
        vec3 color = mix(gradientA, gradientB, patchValue * 0.52);
        color *= mix(0.86, 1.12, vSeed);
        vec3 normal = normalize(vNormal + vec3(0.0, 0.42, 0.0));
        if (!gl_FrontFacing) normal *= -1.0;
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 lightDirection = normalize(uSunDirection);
        float diffuse = max(dot(normal, lightDirection), 0.0);
        float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
        float back = pow(max(dot(viewDirection, -lightDirection), 0.0), 3.0) * bladeT;
        color *= 0.52 + diffuse * 0.52;
        color += uTipColor * (back * 0.22 + rim * 0.07) * bladeT;
        color *= mix(0.94, 1.04, vGust);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createGrassField({
  count = 6800,
  seed = 90210,
  bladeHeight = 1.05,
  bladeWidth = 0.075,
  sunDirection = new THREE.Vector3(-0.62, 0.34, -0.71),
  samplePosition,
} = {}) {
  if (typeof samplePosition !== 'function') throw new TypeError('createGrassField requires samplePosition(random, index)');
  const random = new SeededRandom(seed);
  const geometry = createGrassBladeGeometry({ height: bladeHeight, width: bladeWidth });
  const origins = new Float32Array(count * 2);
  const facings = new Float32Array(count * 2);
  const seeds = new Float32Array(count);
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 2));
  geometry.setAttribute('aFacing', new THREE.InstancedBufferAttribute(facings, 2));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  const material = createGrassMaterial({ bladeHeight, sunDirection });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'Rooted grass field';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const randomValue = () => random.value();
  for (let index = 0; index < count; index += 1) {
    const sample = samplePosition(randomValue, index);
    const yaw = random.value(0, TAU);
    const scale = (sample.scale ?? 1) * random.value(0.82, 1.22);
    origins[index * 2] = sample.x;
    origins[index * 2 + 1] = sample.z;
    facings[index * 2] = Math.cos(yaw);
    facings[index * 2 + 1] = Math.sin(yaw);
    seeds[index] = random.value();
    dummy.position.set(sample.x, sample.y ?? 0.03, sample.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  geometry.attributes.aOrigin.needsUpdate = true;
  geometry.attributes.aFacing.needsUpdate = true;
  geometry.attributes.aSeed.needsUpdate = true;
  const stats = {
    seed,
    blades: count,
    verticesPerBlade: geometry.attributes.position.count,
    trianglesPerBlade: geometry.index.count / 3,
  };
  mesh.userData.vegetationStats = stats;
  return {
    object: mesh,
    stats,
    update(elapsed, motionEnabled = true) {
      material.uniforms.uTime.value = motionEnabled ? elapsed : 0;
      material.uniforms.uWindStrength.value = motionEnabled ? 0.28 : 0;
    },
  };
}
