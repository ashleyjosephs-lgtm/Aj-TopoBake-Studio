import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SourceAsset } from '../types/studio';
import { computeGeometryStats, normalizeGeometryToStudio } from './samples';

function extractTextureImageData(texture: THREE.Texture | null | undefined): ImageData | null {
  if (!texture || !texture.image) return null;
  const img = texture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  const width = (img as HTMLImageElement).naturalWidth || img.width || 0;
  const height = (img as HTMLImageElement).naturalHeight || img.height || 0;
  if (!width || !height) return null;

  const maxDim = 2048;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img as CanvasImageSource, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

function collectMeshesFromObject(root: THREE.Object3D): {
  geometry: THREE.BufferGeometry;
  diffuseImageData: ImageData | null;
} {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let firstDiffuseImageData: ImageData | null = null;

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.geometry) return;

    const rawGeo = mesh.geometry.clone();
    rawGeo.applyMatrix4(mesh.matrixWorld);

    // Convert to non-indexed so mergeGeometries works cleanly across heterogeneous attributes
    const nonIndexed = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    if (!nonIndexed.getAttribute('normal')) {
      nonIndexed.computeVertexNormals();
    }

    const posAttr = nonIndexed.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;

    // Ensure UV attribute exists for uniform merging
    if (!nonIndexed.getAttribute('uv')) {
      nonIndexed.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2)
      );
    }

    // Preserve or synthesize vertex colors from material color
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const stdMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | undefined;
    if (!firstDiffuseImageData && stdMat?.map) {
      firstDiffuseImageData = extractTextureImageData(stdMat.map);
    }

    if (!nonIndexed.getAttribute('color')) {
      const baseColor = stdMat?.color ? stdMat.color.clone() : new THREE.Color('#B8BEC8');
      const colors = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;
      }
      nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    } else {
      // Ensure 3-component float color attribute
      const existingColor = nonIndexed.getAttribute('color');
      if (existingColor.itemSize !== 3) {
        const colors = new Float32Array(posAttr.count * 3);
        for (let i = 0; i < posAttr.count; i++) {
          colors[i * 3] = existingColor.getX(i);
          colors[i * 3 + 1] = existingColor.getY(i);
          colors[i * 3 + 2] = existingColor.getZ(i);
        }
        nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
    }

    // Keep only position, normal, uv, color so mergeGeometries never mismatches
    for (const attrName of Object.keys(nonIndexed.attributes)) {
      if (
        attrName !== 'position' &&
        attrName !== 'normal' &&
        attrName !== 'uv' &&
        attrName !== 'color'
      ) {
        nonIndexed.deleteAttribute(attrName);
      }
    }

    parts.push(nonIndexed);
  });

  if (parts.length === 0) {
    throw new Error('No valid 3D mesh geometry was found in the uploaded file.');
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (!merged) {
    throw new Error('Failed to merge sub-meshes from uploaded file.');
  }

  const normalized = normalizeGeometryToStudio(merged);
  return {
    geometry: normalized,
    diffuseImageData: firstDiffuseImageData,
  };
}

export async function importMeshFile(file: File): Promise<SourceAsset> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Mesh';
  const buffer = await file.arrayBuffer();

  let rootObject: THREE.Object3D;
  let formatLabel = ext.toUpperCase();

  if (ext === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    rootObject = loader.parse(text);
    formatLabel = 'OBJ';
  } else if (ext === 'ply') {
    const loader = new PLYLoader();
    const geo = loader.parse(buffer);
    if (!geo.getAttribute('normal')) {
      geo.computeVertexNormals();
    }
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: Boolean(geo.getAttribute('color')),
      color: 0xb8bec8,
    });
    rootObject = new THREE.Mesh(geo, mat);
    formatLabel = 'PLY';
  } else if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });
    rootObject = gltf.scene;
    formatLabel = ext === 'glb' ? 'GLB' : 'GLTF';
  } else if (ext === 'fbx') {
    const loader = new FBXLoader();
    rootObject = loader.parse(buffer, '');
    formatLabel = 'FBX';
  } else {
    throw new Error(
      `Unsupported file format ".${ext}". Supported formats: .obj, .glb, .gltf, .ply, .fbx.`
    );
  }

  const { geometry, diffuseImageData } = collectMeshesFromObject(rootObject);
  const stats = computeGeometryStats(
    geometry,
    baseName,
    formatLabel,
    Boolean(diffuseImageData)
  );

  return {
    id: `upload-${Date.now()}`,
    name: baseName,
    format: formatLabel,
    geometry,
    diffuseImageData,
    stats,
  };
}
