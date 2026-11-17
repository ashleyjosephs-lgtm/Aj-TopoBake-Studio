import * as THREE from 'three';
import { MeshStats, SamplePresetId, SourceAsset } from '../types/studio';

export interface SamplePresetMeta {
  id: SamplePresetId;
  title: string;
  subtitle: string;
  approxTris: string;
}

export const SAMPLE_PRESETS: SamplePresetMeta[] = [
  {
    id: 'medallion',
    title: 'Ornate Bronze Medallion',
    subtitle: 'Sculpted relief crest, radial flutes & hammered patina',
    approxTris: '~49k tris',
  },
  {
    id: 'bust',
    title: 'Carved Basalt Totem',
    subtitle: 'Chiseled monolith mask with mineral striations & moss',
    approxTris: '~45k tris',
  },
  {
    id: 'valve',
    title: 'Precision Turret Gear',
    subtitle: 'Machined bolted flange, helical teeth & brushed alloy',
    approxTris: '~42k tris',
  },
];

// Deterministic pseudo-noise helpers for high-poly surface micro-detail
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2D(x: number, y: number): number {
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
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

function fbm3D(x: number, y: number, z: number): number {
  return (
    fbm2D(x * 2.1 + z * 1.3, y * 2.1 - z * 0.9, 4) * 0.6 +
    fbm2D(y * 3.4 - x * 1.7, z * 3.1 + x * 1.1, 3) * 0.4
  );
}

export function computeGeometryStats(
  geometry: THREE.BufferGeometry,
  name: string,
  format: string,
  hasDiffuseTexture = false
): MeshStats {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size = new THREE.Vector3();
  box.getSize(size);
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const vertices = pos ? pos.count : 0;
  const triangles = index ? Math.floor(index.count / 3) : Math.floor(vertices / 3);

  return {
    name,
    format,
    triangles,
    vertices,
    hasUVs: Boolean(geometry.getAttribute('uv')),
    hasVertexColors: Boolean(geometry.getAttribute('color')),
    hasDiffuseTexture,
    boundsSize: [
      Number(size.x.toFixed(3)),
      Number(size.y.toFixed(3)),
      Number(size.z.toFixed(3)),
    ],
  };
}

export function normalizeGeometryToStudio(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.0 / maxDim;

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  return geometry;
}

function buildMedallionGeometry(): THREE.BufferGeometry {
  // High-poly sculpted disc/shield (~49k tris) using dense polar/sphere displacement
  const geo = new THREE.SphereGeometry(1, 160, 154);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const bronzeDark = new THREE.Color('#4A3222');
  const bronzeGold = new THREE.Color('#C98A42');
  const verdigris = new THREE.Color('#4B7D72');
  const highlightGold = new THREE.Color('#E8BD70');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Flatten slightly along Z to create an ornate double-sided relief medallion
    z *= 0.34;

    const r = Math.sqrt(x * x + y * y);
    const angle = Math.atan2(y, x);
    const frontSign = z >= 0 ? 1 : -1;

    // Stepped concentric rings & bevels
    const outerRim = Math.exp(-Math.pow((r - 0.86) / 0.075, 2)) * 0.14;
    const innerRing = Math.exp(-Math.pow((r - 0.56) / 0.045, 2)) * 0.09;
    const centerBoss = Math.exp(-Math.pow(r / 0.24, 2)) * 0.17;

    // Radial fluted sun-rays between r=0.25 and r=0.80
    const rayMask =
      THREE.MathUtils.smoothstep(r, 0.24, 0.36) *
      (1 - THREE.MathUtils.smoothstep(r, 0.72, 0.83));
    const flutes = Math.pow(Math.abs(Math.sin(angle * 12)), 1.6) * 0.065 * rayMask;

    // Lotus / crest petals
    const petalMask =
      THREE.MathUtils.smoothstep(r, 0.12, 0.22) *
      (1 - THREE.MathUtils.smoothstep(r, 0.48, 0.58));
    const petals = Math.max(0, Math.cos(angle * 6)) * 0.07 * petalMask;

    // Rim studs (24 rivets along the outer bezel)
    const studMask = Math.exp(-Math.pow((r - 0.86) / 0.032, 2));
    const studs = Math.pow(Math.max(0, Math.cos(angle * 24)), 6) * 0.045 * studMask;

    // Hammered metallic micro-relief
    const hammered = (fbm3D(x * 7.5, y * 7.5, z * 7.5) - 0.5) * 0.028;

    const relief = outerRim + innerRing + centerBoss + flutes + petals + studs;
    z += frontSign * (relief + hammered);
    x += (x / (r + 1e-4)) * hammered * 0.35;
    y += (y / (r + 1e-4)) * hammered * 0.35;

    pos.setXYZ(i, x, y, z);

    // Rich patina + raised gold vertex coloring
    const cavity = THREE.MathUtils.clamp(relief / 0.18, 0, 1);
    const noisePatina = fbm3D(x * 4.2 + 3.1, y * 4.2, z * 4.2);

    tmpColor.copy(bronzeDark).lerp(bronzeGold, cavity * 0.85 + 0.12);
    if (cavity < 0.32 && noisePatina > 0.52) {
      tmpColor.lerp(verdigris, THREE.MathUtils.clamp((noisePatina - 0.52) * 2.1, 0, 0.78));
    }
    if (cavity > 0.65) {
      tmpColor.lerp(highlightGold, (cavity - 0.65) * 1.9);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return normalizeGeometryToStudio(geo);
}

function buildBustGeometry(): THREE.BufferGeometry {
  // Carved Basalt Totem / Stylized Mask Head (~45k tris)
  const geo = new THREE.SphereGeometry(1, 150, 150);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const basalt = new THREE.Color('#3B4048');
  const sandstone = new THREE.Color('#9E8B73');
  const ochre = new THREE.Color('#B5763D');
  const moss = new THREE.Color('#466346');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Elongate head & taper jaw
    y *= 1.32;
    const jawTaper = y < 0 ? 1 - Math.min(0.32, -y * 0.25) : 1.04;
    x *= 0.86 * jawTaper;
    z *= 0.92 * (y < -0.5 ? 0.85 : 1.0);

    let relief = 0;
    let pigmentZone = 0;

    if (z > -0.1) {
      const frontBlend = THREE.MathUtils.smoothstep(z, -0.1, 0.25);

      // Brow ridge
      const browDist = Math.abs(y - 0.26) / 0.11;
      const brow = Math.exp(-browDist * browDist) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.15, 0.62)) * 0.13;

      // Eye sockets (recessed)
      const eyeL = Math.hypot(x + 0.24, (y - 0.1) * 1.4);
      const eyeR = Math.hypot(x - 0.24, (y - 0.1) * 1.4);
      const sockets =
        (Math.exp(-Math.pow(eyeL / 0.14, 2)) + Math.exp(-Math.pow(eyeR / 0.14, 2))) * -0.14;

      // Nose bridge
      const noseX = Math.abs(x) / 0.11;
      const noseY = THREE.MathUtils.smoothstep(y, -0.25, -0.05) * (1 - THREE.MathUtils.smoothstep(y, 0.15, 0.3));
      const nose = Math.exp(-noseX * noseX) * noseY * 0.18;

      // Cheekbones & carved crown bands
      const cheeks =
        (Math.exp(-Math.pow(Math.hypot(x + 0.34, y + 0.14) / 0.18, 2)) +
          Math.exp(-Math.pow(Math.hypot(x - 0.34, y + 0.14) / 0.18, 2))) *
        0.09;

      const crownBand =
        y > 0.45
          ? Math.sin(x * 18) * 0.028 * THREE.MathUtils.smoothstep(y, 0.45, 0.7)
          : 0;

      // Mouth slit
      const mouth =
        Math.exp(-Math.pow((y + 0.42) / 0.05, 2)) *
        (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.14, 0.3)) *
        -0.08;

      relief += (brow + sockets + nose + cheeks + crownBand + mouth) * frontBlend;
      pigmentZone = THREE.MathUtils.clamp((brow + nose + cheeks) * 4.5, 0, 1);
    }

    // Chiseled stone facets & erosion pitting
    const stoneGrain = fbm3D(x * 4.8, y * 4.8, z * 4.8);
    const strata = Math.sin(y * 14 + stoneGrain * 3.5) * 0.014;
    const pitting = stoneGrain < 0.36 ? (stoneGrain - 0.36) * 0.14 : (stoneGrain - 0.5) * 0.04;

    const len = Math.hypot(x, y, z) || 1;
    const disp = relief + strata + pitting;
    x += (x / len) * disp;
    y += (y / len) * disp;
    z += (z / len) * disp;

    pos.setXYZ(i, x, y, z);

    // Mineral basalt + sandstone + moss coloring
    tmpColor.copy(basalt).lerp(sandstone, THREE.MathUtils.clamp(stoneGrain * 0.9 + pigmentZone * 0.4, 0, 1));
    if (y > 0.48 && z > 0.15) {
      tmpColor.lerp(ochre, 0.45);
    }
    if (y > 0.35 && stoneGrain < 0.44) {
      tmpColor.lerp(moss, THREE.MathUtils.clamp((0.44 - stoneGrain) * 2.5, 0, 0.72));
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return normalizeGeometryToStudio(geo);
}

function buildValveGeometry(): THREE.BufferGeometry {
  // Precision Turret Gear / Valve Assembly (~42k tris)
  const geo = new THREE.TorusKnotGeometry(0.62, 0.24, 240, 88, 2, 3);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const steel = new THREE.Color('#5A6472');
  const brass = new THREE.Color('#C49547');
  const anodizedBlue = new THREE.Color('#2F5B88');
  const darkGrease = new THREE.Color('#252930');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    const angle = Math.atan2(y, x);
    const r = Math.hypot(x, y);

    // Machined gear-teeth ribs & knurled rings along the knot surface
    const knurl = Math.sin(angle * 36) * Math.sin(z * 28) * 0.022;
    const collars = Math.pow(Math.abs(Math.sin(r * 16 + angle * 4)), 6) * 0.036;
    const micro = (fbm3D(x * 8, y * 8, z * 8) - 0.5) * 0.012;
    const disp = knurl + collars + micro;

    pos.setXYZ(i, x + nx * disp, y + ny * disp, z + nz * disp);

    // Anodized mechanical finish bands
    const collarMask = THREE.MathUtils.clamp(collars / 0.03, 0, 1);
    const band = Math.sin(r * 9 + z * 5) * 0.5 + 0.5;
    tmpColor.copy(steel).lerp(anodizedBlue, band * 0.55);
    tmpColor.lerp(brass, collarMask * 0.88);
    if (knurl < -0.008) {
      tmpColor.lerp(darkGrease, 0.55);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return normalizeGeometryToStudio(geo);
}

export function createSampleAsset(presetId: SamplePresetId): SourceAsset {
  let geometry: THREE.BufferGeometry;
  let name: string;

  switch (presetId) {
    case 'bust':
      geometry = buildBustGeometry();
      name = 'Carved Basalt Totem';
      break;
    case 'valve':
      geometry = buildValveGeometry();
      name = 'Precision Turret Gear';
      break;
    case 'medallion':
    default:
      geometry = buildMedallionGeometry();
      name = 'Ornate Bronze Medallion';
      break;
  }

  const stats = computeGeometryStats(geometry, name, 'Procedural Sculpt', false);
  return {
    id: `sample-${presetId}-${Date.now()}`,
    name,
    format: 'SCULPT',
    geometry,
    diffuseImageData: null,
    stats,
  };
}
