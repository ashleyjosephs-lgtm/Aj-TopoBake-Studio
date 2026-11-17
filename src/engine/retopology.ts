import * as THREE from 'three';
import { RetopoOptions, RetopoResult, UvTriangleOverlay } from '../types/studio';
import { computeGeometryStats } from './samples';

interface CollapseCandidate {
  a: number;
  b: number;
  cost: number;
  vx: number;
  vy: number;
  vz: number;
  verA: number;
  verB: number;
}

class MinHeap {
  private data: CollapseCandidate[] = [];

  get size(): number {
    return this.data.length;
  }

  push(item: CollapseCandidate): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): CollapseCandidate | undefined {
    const top = this.data[0];
    const bottom = this.data.pop();
    if (this.data.length > 0 && bottom) {
      this.data[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    const item = this.data[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.data[parentIdx];
      if (item.cost >= parent.cost) break;
      this.data[idx] = parent;
      idx = parentIdx;
    }
    this.data[idx] = item;
  }

  private sinkDown(idx: number): void {
    const len = this.data.length;
    const item = this.data[idx];
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < len && this.data[left].cost < this.data[smallest].cost) {
        smallest = left;
      }
      if (right < len && this.data[right].cost < this.data[smallest].cost) {
        smallest = right;
      }
      if (smallest === idx) break;
      this.data[idx] = this.data[smallest];
      idx = smallest;
    }
    this.data[idx] = item;
  }
}

function addPlaneQuadric(
  quadrics: Float64Array,
  vIdx: number,
  a: number,
  b: number,
  c: number,
  d: number,
  weight: number
): void {
  const o = vIdx * 10;
  quadrics[o + 0] += weight * a * a;
  quadrics[o + 1] += weight * a * b;
  quadrics[o + 2] += weight * a * c;
  quadrics[o + 3] += weight * a * d;
  quadrics[o + 4] += weight * b * b;
  quadrics[o + 5] += weight * b * c;
  quadrics[o + 6] += weight * b * d;
  quadrics[o + 7] += weight * c * c;
  quadrics[o + 8] += weight * c * d;
  quadrics[o + 9] += weight * d * d;
}

function evalQuadricError(
  q00: number,
  q01: number,
  q02: number,
  q03: number,
  q11: number,
  q12: number,
  q13: number,
  q22: number,
  q23: number,
  q33: number,
  x: number,
  y: number,
  z: number
): number {
  return Math.max(
    0,
    q00 * x * x +
      2 * q01 * x * y +
      2 * q02 * x * z +
      2 * q03 * x +
      q11 * y * y +
      2 * q12 * y * z +
      2 * q13 * y +
      q22 * z * z +
      2 * q23 * z +
      q33
  );
}

function computeBestCollapse(
  a: number,
  b: number,
  verts: Float64Array,
  quadrics: Float64Array,
  verA: number,
  verB: number
): CollapseCandidate {
  const oa = a * 10;
  const ob = b * 10;
  const q00 = quadrics[oa + 0] + quadrics[ob + 0];
  const q01 = quadrics[oa + 1] + quadrics[ob + 1];
  const q02 = quadrics[oa + 2] + quadrics[ob + 2];
  const q03 = quadrics[oa + 3] + quadrics[ob + 3];
  const q11 = quadrics[oa + 4] + quadrics[ob + 4];
  const q12 = quadrics[oa + 5] + quadrics[ob + 5];
  const q13 = quadrics[oa + 6] + quadrics[ob + 6];
  const q22 = quadrics[oa + 7] + quadrics[ob + 7];
  const q23 = quadrics[oa + 8] + quadrics[ob + 8];
  const q33 = quadrics[oa + 9] + quadrics[ob + 9];

  // Solve 3x3 symmetric linear system via determinant
  const det =
    q00 * (q11 * q22 - q12 * q12) -
    q01 * (q01 * q22 - q12 * q02) +
    q02 * (q01 * q12 - q11 * q02);

  if (Math.abs(det) > 1e-8) {
    const vx =
      (-q03 * (q11 * q22 - q12 * q12) +
        q13 * (q01 * q22 - q12 * q02) -
        q23 * (q01 * q12 - q11 * q02)) /
      det;
    const vy =
      (q00 * (-q13 * q22 + q12 * q23) -
        q01 * (-q03 * q22 + q02 * q23) +
        q02 * (-q03 * q12 + q02 * q13)) /
      det;
    const vz =
      (q00 * (q11 * -q23 - q12 * -q13) -
        q01 * (q01 * -q23 - q02 * -q13) +
        q02 * (q01 * -q13 - q02 * -q11)) /
      det;

    const ax = verts[a * 3],
      ay = verts[a * 3 + 1],
      az = verts[a * 3 + 2];
    const bx = verts[b * 3],
      by = verts[b * 3 + 1],
      bz = verts[b * 3 + 2];
    const edgeLenSq = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    const midX = (ax + bx) * 0.5,
      midY = (ay + by) * 0.5,
      midZ = (az + bz) * 0.5;
    const distSq = (vx - midX) ** 2 + (vy - midY) ** 2 + (vz - midZ) ** 2;

    if (
      Number.isFinite(vx) &&
      Number.isFinite(vy) &&
      Number.isFinite(vz) &&
      distSq <= edgeLenSq * 4 + 1e-4
    ) {
      const cost = evalQuadricError(
        q00,
        q01,
        q02,
        q03,
        q11,
        q12,
        q13,
        q22,
        q23,
        q33,
        vx,
        vy,
        vz
      );
      return { a, b, cost, vx, vy, vz, verA, verB };
    }
  }

  // Fallback to best of endpoints & midpoint
  const ax = verts[a * 3],
    ay = verts[a * 3 + 1],
    az = verts[a * 3 + 2];
  const bx = verts[b * 3],
    by = verts[b * 3 + 1],
    bz = verts[b * 3 + 2];
  const mx = (ax + bx) * 0.5,
    my = (ay + by) * 0.5,
    mz = (az + bz) * 0.5;

  const cA = evalQuadricError(q00, q01, q02, q03, q11, q12, q13, q22, q23, q33, ax, ay, az);
  const cB = evalQuadricError(q00, q01, q02, q03, q11, q12, q13, q22, q23, q33, bx, by, bz);
  const cM = evalQuadricError(q00, q01, q02, q03, q11, q12, q13, q22, q23, q33, mx, my, mz);

  if (cM <= cA && cM <= cB) return { a, b, cost: cM, vx: mx, vy: my, vz: mz, verA, verB };
  if (cA <= cB) return { a, b, cost: cA, vx: ax, vy: ay, vz: az, verA, verB };
  return { a, b, cost: cB, vx: bx, vy: by, vz: bz, verA, verB };
}

function edgeKey(u: number, v: number): number {
  const min = u < v ? u : v;
  const max = u < v ? v : u;
  return min * 1000003 + max;
}

const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface ChartProjection {
  faces: number[];
  localUvs: Map<number, [number, number]>;
  width: number;
  height: number;
}

function unwrapAndPackUVs(
  verts: Float64Array,
  faces: Int32Array,
  angleThresholdDeg: number,
  uvMargin: number
): {
  geometry: THREE.BufferGeometry;
  chartCount: number;
  uvCoverage: number;
  uvTriangles: UvTriangleOverlay[];
} {
  const faceCount = Math.floor(faces.length / 3);
  const faceNormals = new Float64Array(faceCount * 3);
  const faceAreas = new Float64Array(faceCount);

  for (let f = 0; f < faceCount; f++) {
    const i0 = faces[f * 3],
      i1 = faces[f * 3 + 1],
      i2 = faces[f * 3 + 2];
    const ax = verts[i0 * 3],
      ay = verts[i0 * 3 + 1],
      az = verts[i0 * 3 + 2];
    const bx = verts[i1 * 3] - ax,
      by = verts[i1 * 3 + 1] - ay,
      bz = verts[i1 * 3 + 2] - az;
    const cx = verts[i2 * 3] - ax,
      cy = verts[i2 * 3 + 1] - ay,
      cz = verts[i2 * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    const len = Math.hypot(nx, ny, nz);
    faceAreas[f] = len * 0.5;
    if (len > 1e-12) {
      faceNormals[f * 3] = nx / len;
      faceNormals[f * 3 + 1] = ny / len;
      faceNormals[f * 3 + 2] = nz / len;
    } else {
      faceNormals[f * 3 + 1] = 1;
    }
  }

  // Build face adjacency over shared edges
  const edgeToFaces = new Map<number, number[]>();
  for (let f = 0; f < faceCount; f++) {
    const i0 = faces[f * 3],
      i1 = faces[f * 3 + 1],
      i2 = faces[f * 3 + 2];
    const keys = [edgeKey(i0, i1), edgeKey(i1, i2), edgeKey(i2, i0)];
    for (const k of keys) {
      let arr = edgeToFaces.get(k);
      if (!arr) {
        arr = [];
        edgeToFaces.set(k, arr);
      }
      arr.push(f);
    }
  }

  const faceNeighbors: number[][] = Array.from({ length: faceCount }, () => []);
  for (const list of edgeToFaces.values()) {
    if (list.length === 2) {
      faceNeighbors[list[0]].push(list[1]);
      faceNeighbors[list[1]].push(list[0]);
    } else if (list.length > 2) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          faceNeighbors[list[i]].push(list[j]);
          faceNeighbors[list[j]].push(list[i]);
        }
      }
    }
  }

  // Region-growing chart segmentation
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(angleThresholdDeg));
  const visited = new Uint8Array(faceCount);
  const rawCharts: number[][] = [];

  for (let seed = 0; seed < faceCount; seed++) {
    if (visited[seed]) continue;
    visited[seed] = 1;
    const chartFaces: number[] = [seed];
    const queue: number[] = [seed];

    let avgNx = faceNormals[seed * 3] * (faceAreas[seed] + 1e-6);
    let avgNy = faceNormals[seed * 3 + 1] * (faceAreas[seed] + 1e-6);
    let avgNz = faceNormals[seed * 3 + 2] * (faceAreas[seed] + 1e-6);

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const len = Math.hypot(avgNx, avgNy, avgNz) || 1;
      const cnx = avgNx / len,
        cny = avgNy / len,
        cnz = avgNz / len;

      for (const nb of faceNeighbors[curr]) {
        if (visited[nb]) continue;
        const dotSeed =
          faceNormals[nb * 3] * faceNormals[seed * 3] +
          faceNormals[nb * 3 + 1] * faceNormals[seed * 3 + 1] +
          faceNormals[nb * 3 + 2] * faceNormals[seed * 3 + 2];
        const dotAvg =
          faceNormals[nb * 3] * cnx +
          faceNormals[nb * 3 + 1] * cny +
          faceNormals[nb * 3 + 2] * cnz;

        if (dotSeed >= cosLimit && dotAvg >= Math.max(0.25, cosLimit * 0.85)) {
          visited[nb] = 1;
          chartFaces.push(nb);
          queue.push(nb);
          const w = faceAreas[nb] + 1e-6;
          avgNx += faceNormals[nb * 3] * w;
          avgNy += faceNormals[nb * 3 + 1] * w;
          avgNz += faceNormals[nb * 3 + 2] * w;
        }
      }
    }
    rawCharts.push(chartFaces);
  }

  // Project each chart onto orthonormal tangent basis; split any inverted faces to guarantee zero UV overlaps
  const charts: ChartProjection[] = [];

  const projectFaceGroup = (groupFaces: number[]) => {
    let nx = 0,
      ny = 0,
      nz = 0;
    for (const f of groupFaces) {
      const w = faceAreas[f] + 1e-6;
      nx += faceNormals[f * 3] * w;
      ny += faceNormals[f * 3 + 1] * w;
      nz += faceNormals[f * 3 + 2] * w;
    }
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    const normal = new THREE.Vector3(nx, ny, nz);
    const ref =
      Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangentU = new THREE.Vector3().crossVectors(ref, normal).normalize();
    const tangentV = new THREE.Vector3().crossVectors(normal, tangentU).normalize();

    const validFaces: number[] = [];
    const flippedFaces: number[] = [];
    const uvMap = new Map<number, [number, number]>();

    for (const f of groupFaces) {
      const i0 = faces[f * 3],
        i1 = faces[f * 3 + 1],
        i2 = faces[f * 3 + 2];
      const u0 =
        verts[i0 * 3] * tangentU.x +
        verts[i0 * 3 + 1] * tangentU.y +
        verts[i0 * 3 + 2] * tangentU.z;
      const v0 =
        verts[i0 * 3] * tangentV.x +
        verts[i0 * 3 + 1] * tangentV.y +
        verts[i0 * 3 + 2] * tangentV.z;
      const u1 =
        verts[i1 * 3] * tangentU.x +
        verts[i1 * 3 + 1] * tangentU.y +
        verts[i1 * 3 + 2] * tangentU.z;
      const v1 =
        verts[i1 * 3] * tangentV.x +
        verts[i1 * 3 + 1] * tangentV.y +
        verts[i1 * 3 + 2] * tangentV.z;
      const u2 =
        verts[i2 * 3] * tangentU.x +
        verts[i2 * 3 + 1] * tangentU.y +
        verts[i2 * 3 + 2] * tangentU.z;
      const v2 =
        verts[i2 * 3] * tangentV.x +
        verts[i2 * 3 + 1] * tangentV.y +
        verts[i2 * 3 + 2] * tangentV.z;

      const area2d = (u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0);
      if (area2d > 1e-10 || groupFaces.length === 1) {
        validFaces.push(f);
        uvMap.set(i0, [u0, v0]);
        uvMap.set(i1, [u1, v1]);
        uvMap.set(i2, [u2, v2]);
      } else {
        flippedFaces.push(f);
      }
    }

    if (validFaces.length > 0) {
      let minU = Infinity,
        maxU = -Infinity,
        minV = Infinity,
        maxV = -Infinity;
      for (const f of validFaces) {
        for (let k = 0; k < 3; k++) {
          const [u, v] = uvMap.get(faces[f * 3 + k])!;
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
      const normMap = new Map<number, [number, number]>();
      for (const f of validFaces) {
        for (let k = 0; k < 3; k++) {
          const vid = faces[f * 3 + k];
          const [u, v] = uvMap.get(vid)!;
          normMap.set(vid, [u - minU, v - minV]);
        }
      }
      charts.push({
        faces: validFaces,
        localUvs: normMap,
        width: Math.max(maxU - minU, 1e-4),
        height: Math.max(maxV - minV, 1e-4),
      });
    }

    if (flippedFaces.length > 0 && groupFaces.length > 1) {
      for (const ff of flippedFaces) {
        projectFaceGroup([ff]);
      }
    }
  };

  for (const ch of rawCharts) {
    projectFaceGroup(ch);
  }

  // Sort charts by height descending for efficient shelf packing
  charts.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));

  const tryPack = (
    scale: number
  ): Array<{ x: number; y: number; w: number; h: number }> | null => {
    const pad = uvMargin;
    const placements: Array<{ x: number; y: number; w: number; h: number }> = new Array(
      charts.length
    );
    let cursorX = pad;
    let cursorY = pad;
    let shelfHeight = 0;

    for (let i = 0; i < charts.length; i++) {
      const cw = charts[i].width * scale;
      const ch = charts[i].height * scale;
      if (cw + pad * 2 > 1 || ch + pad * 2 > 1) return null;

      if (cursorX + cw + pad > 1) {
        cursorX = pad;
        cursorY += shelfHeight + pad;
        shelfHeight = 0;
      }
      if (cursorY + ch + pad > 1) return null;

      placements[i] = { x: cursorX, y: cursorY, w: cw, h: ch };
      cursorX += cw + pad;
      if (ch > shelfHeight) shelfHeight = ch;
    }
    return placements;
  };

  // Binary search maximum packing scale
  let lo = 0.01;
  let hi = 4.0;
  let bestScale = lo;
  let bestPlacements: Array<{ x: number; y: number; w: number; h: number }> | null = null;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) * 0.5;
    const attempt = tryPack(mid);
    if (attempt) {
      bestScale = mid;
      bestPlacements = attempt;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!bestPlacements) {
    bestPlacements = tryPack(0.005) ?? charts.map(() => ({ x: 0.01, y: 0.01, w: 0.01, h: 0.01 }));
    bestScale = 0.005;
  }

  // Build indexed BufferGeometry splitting vertices across UV chart seams
  const outPositions: number[] = [];
  const outUvs: number[] = [];
  const outIndices: number[] = [];
  const uvTriangles: UvTriangleOverlay[] = [];
  let totalUvArea = 0;

  for (let c = 0; c < charts.length; c++) {
    const chart = charts[c];
    const place = bestPlacements[c];
    const localToOutIdx = new Map<number, number>();

    for (const f of chart.faces) {
      const triVerts: number[] = [];
      const triUvs: Array<[number, number]> = [];

      for (let k = 0; k < 3; k++) {
        const vid = faces[f * 3 + k];
        const [lu, lv] = chart.localUvs.get(vid)!;
        const u = place.x + lu * bestScale;
        const v = place.y + lv * bestScale;
        triUvs.push([u, v]);

        let outIdx = localToOutIdx.get(vid);
        if (outIdx === undefined) {
          outIdx = outPositions.length / 3;
          localToOutIdx.set(vid, outIdx);
          outPositions.push(verts[vid * 3], verts[vid * 3 + 1], verts[vid * 3 + 2]);
          outUvs.push(u, v);
        }
        triVerts.push(outIdx);
      }

      outIndices.push(triVerts[0], triVerts[1], triVerts[2]);
      const [[u0, v0], [u1, v1], [u2, v2]] = triUvs;
      totalUvArea += Math.abs((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0)) * 0.5;
      uvTriangles.push({ u0, v0, u1, v1, u2, v2, chartId: c });
    }
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
  outGeo.setAttribute('uv', new THREE.Float32BufferAttribute(outUvs, 2));
  outGeo.setIndex(outIndices);
  outGeo.computeVertexNormals();
  outGeo.computeTangents();
  outGeo.computeBoundingBox();
  outGeo.computeBoundingSphere();

  return {
    geometry: outGeo,
    chartCount: charts.length,
    uvCoverage: Math.min(1, totalUvArea),
    uvTriangles,
  };
}

export async function runRetopologyPipeline(
  sourceGeometry: THREE.BufferGeometry,
  assetName: string,
  options: RetopoOptions,
  onProgress?: (pct: number, stage: string) => void
): Promise<RetopoResult> {
  const startTime = performance.now();
  onProgress?.(4, 'Welding manifold topology...');
  await yieldFrame();

  const posAttr = sourceGeometry.getAttribute('position');
  const srcIndex = sourceGeometry.getIndex();
  const triCount = srcIndex ? Math.floor(srcIndex.count / 3) : Math.floor(posAttr.count / 3);

  // Step 1: Weld coincident vertices so edge-collapse preserves watertight surfaces
  const weldMap = new Map<string, number>();
  const vertCoords: number[] = [];
  const rawToWelded = new Int32Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${Math.round(x * 1e4)}_${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`;
    let wid = weldMap.get(key);
    if (wid === undefined) {
      wid = vertCoords.length / 3;
      weldMap.set(key, wid);
      vertCoords.push(x, y, z);
    }
    rawToWelded[i] = wid;
  }

  const vertCount = vertCoords.length / 3;
  const verts = new Float64Array(vertCoords);

  const faceList: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = rawToWelded[srcIndex ? srcIndex.getX(t * 3) : t * 3];
    const i1 = rawToWelded[srcIndex ? srcIndex.getX(t * 3 + 1) : t * 3 + 1];
    const i2 = rawToWelded[srcIndex ? srcIndex.getX(t * 3 + 2) : t * 3 + 2];
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      faceList.push(i0, i1, i2);
    }
  }

  const faceCount = faceList.length / 3;
  const faces = new Int32Array(faceList);
  const aliveFace = new Uint8Array(faceCount).fill(1);
  const aliveVert = new Uint8Array(vertCount).fill(1);
  const vertVer = new Int32Array(vertCount);
  const vertFaces: Array<Set<number>> = Array.from({ length: vertCount }, () => new Set());
  const quadrics = new Float64Array(vertCount * 10);

  onProgress?.(16, 'Computing quadric error matrices...');
  await yieldFrame();

  const edgeCounts = new Map<number, number>();
  const edgeSampleFace = new Map<number, number>();
  const uniqueEdges = new Map<number, [number, number]>();

  for (let f = 0; f < faceCount; f++) {
    const v0 = faces[f * 3],
      v1 = faces[f * 3 + 1],
      v2 = faces[f * 3 + 2];
    vertFaces[v0].add(f);
    vertFaces[v1].add(f);
    vertFaces[v2].add(f);

    const ax = verts[v0 * 3],
      ay = verts[v0 * 3 + 1],
      az = verts[v0 * 3 + 2];
    const bx = verts[v1 * 3],
      by = verts[v1 * 3 + 1],
      bz = verts[v1 * 3 + 2];
    const cx = verts[v2 * 3],
      cy = verts[v2 * 3 + 1],
      cz = verts[v2 * 3 + 2];

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);

    if (len > 1e-12) {
      const a = nx / len,
        b = ny / len,
        c = nz / len;
      const d = -(a * ax + b * ay + c * az);
      const area = len * 0.5;
      addPlaneQuadric(quadrics, v0, a, b, c, d, area);
      addPlaneQuadric(quadrics, v1, a, b, c, d, area);
      addPlaneQuadric(quadrics, v2, a, b, c, d, area);
    }

    const pairs: Array<[number, number]> = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];
    for (const [u, v] of pairs) {
      const k = edgeKey(u, v);
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
      edgeSampleFace.set(k, f);
      if (!uniqueEdges.has(k)) {
        uniqueEdges.set(k, u < v ? [u, v] : [v, u]);
      }
    }
  }

  // Add boundary-preservation quadrics on open mesh edges
  if (options.preserveBoundaries) {
    for (const [k, count] of edgeCounts.entries()) {
      if (count !== 1) continue;
      const pair = uniqueEdges.get(k);
      const f = edgeSampleFace.get(k);
      if (!pair || f === undefined) continue;
      const [u, v] = pair;
      const f0 = faces[f * 3],
        f1 = faces[f * 3 + 1],
        f2 = faces[f * 3 + 2];

      const ax = verts[f0 * 3],
        ay = verts[f0 * 3 + 1],
        az = verts[f0 * 3 + 2];
      const bx = verts[f1 * 3],
        by = verts[f1 * 3 + 1],
        bz = verts[f1 * 3 + 2];
      const cx = verts[f2 * 3],
        cy = verts[f2 * 3 + 1],
        cz = verts[f2 * 3 + 2];
      const fnx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const fny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const fnz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

      const ex = verts[v * 3] - verts[u * 3];
      const ey = verts[v * 3 + 1] - verts[u * 3 + 1];
      const ez = verts[v * 3 + 2] - verts[u * 3 + 2];

      const pnx = ey * fnz - ez * fny;
      const pny = ez * fnx - ex * fnz;
      const pnz = ex * fny - ey * fnx;
      const pLen = Math.hypot(pnx, pny, pnz);
      if (pLen > 1e-12) {
        const pa = pnx / pLen,
          pb = pny / pLen,
          pc = pnz / pLen;
        const pd = -(pa * verts[u * 3] + pb * verts[u * 3 + 1] + pc * verts[u * 3 + 2]);
        const edgeLenSq = ex * ex + ey * ey + ez * ez;
        addPlaneQuadric(quadrics, u, pa, pb, pc, pd, edgeLenSq * 12);
        addPlaneQuadric(quadrics, v, pa, pb, pc, pd, edgeLenSq * 12);
      }
    }
  }

  const heap = new MinHeap();
  for (const [u, v] of uniqueEdges.values()) {
    heap.push(computeBestCollapse(u, v, verts, quadrics, 0, 0));
  }

  let activeFaces = faceCount;
  const targetTriangles = Math.max(12, Math.round(faceCount * options.targetRatio));
  const totalToRemove = Math.max(1, activeFaces - targetTriangles);
  let iterations = 0;

  onProgress?.(28, 'Collapsing low-error edges...');
  await yieldFrame();

  while (activeFaces > targetTriangles && heap.size > 0) {
    const cand = heap.pop()!;
    const { a, b, vx, vy, vz, verA, verB } = cand;
    if (a === b || !aliveVert[a] || !aliveVert[b]) continue;
    if (verA !== vertVer[a] || verB !== vertVer[b]) continue;

    // Prevent normal flip or triangle inversion on neighboring faces
    let causesFlip = false;
    const checkFaces = new Set<number>([...vertFaces[a], ...vertFaces[b]]);
    for (const f of checkFaces) {
      if (!aliveFace[f]) continue;
      const v0 = faces[f * 3],
        v1 = faces[f * 3 + 1],
        v2 = faces[f * 3 + 2];
      const hasA = v0 === a || v1 === a || v2 === a;
      const hasB = v0 === b || v1 === b || v2 === b;
      if (hasA && hasB) continue; // Face will be deleted

      const ox0 = verts[v0 * 3],
        oy0 = verts[v0 * 3 + 1],
        oz0 = verts[v0 * 3 + 2];
      const ox1 = verts[v1 * 3],
        oy1 = verts[v1 * 3 + 1],
        oz1 = verts[v1 * 3 + 2];
      const ox2 = verts[v2 * 3],
        oy2 = verts[v2 * 3 + 1],
        oz2 = verts[v2 * 3 + 2];

      const onx = (oy1 - oy0) * (oz2 - oz0) - (oz1 - oz0) * (oy2 - oy0);
      const ony = (oz1 - oz0) * (ox2 - ox0) - (ox1 - ox0) * (oz2 - oz0);
      const onz = (ox1 - ox0) * (oy2 - oy0) - (oy1 - oy0) * (ox2 - ox0);
      const oLen = Math.hypot(onx, ony, onz);

      const nx0 = v0 === a || v0 === b ? vx : ox0;
      const ny0 = v0 === a || v0 === b ? vy : oy0;
      const nz0 = v0 === a || v0 === b ? vz : oz0;
      const nx1 = v1 === a || v1 === b ? vx : ox1;
      const ny1 = v1 === a || v1 === b ? vy : oy1;
      const nz1 = v1 === a || v1 === b ? vz : oz1;
      const nx2 = v2 === a || v2 === b ? vx : ox2;
      const ny2 = v2 === a || v2 === b ? vy : oy2;
      const nz2 = v2 === a || v2 === b ? vz : oz2;

      const nnx = (ny1 - ny0) * (nz2 - nz0) - (nz1 - nz0) * (ny2 - ny0);
      const nny = (nz1 - nz0) * (nx2 - nx0) - (nx1 - nx0) * (nz2 - nz0);
      const nnz = (nx1 - nx0) * (ny2 - ny0) - (ny1 - ny0) * (nx2 - nx0);
      const nLen = Math.hypot(nnx, nny, nnz);

      if (nLen < 1e-11 || (oLen > 1e-11 && (onx * nnx + ony * nny + onz * nnz) / (oLen * nLen) < 0.12)) {
        causesFlip = true;
        break;
      }
    }

    if (causesFlip) continue;

    // Commit collapse b -> a
    verts[a * 3] = vx;
    verts[a * 3 + 1] = vy;
    verts[a * 3 + 2] = vz;

    const oa = a * 10;
    const ob = b * 10;
    for (let k = 0; k < 10; k++) {
      quadrics[oa + k] += quadrics[ob + k];
    }

    aliveVert[b] = 0;
    vertVer[a]++;

    const bFaces = Array.from(vertFaces[b]);
    for (const f of bFaces) {
      if (!aliveFace[f]) continue;
      for (let k = 0; k < 3; k++) {
        if (faces[f * 3 + k] === b) {
          faces[f * 3 + k] = a;
        }
      }
      const v0 = faces[f * 3],
        v1 = faces[f * 3 + 1],
        v2 = faces[f * 3 + 2];
      if (v0 === v1 || v1 === v2 || v2 === v0) {
        aliveFace[f] = 0;
        activeFaces--;
        vertFaces[v0].delete(f);
        vertFaces[v1].delete(f);
        vertFaces[v2].delete(f);
      } else {
        vertFaces[a].add(f);
      }
    }
    vertFaces[b].clear();

    // Push updated incident edge collapses
    const neighbors = new Set<number>();
    for (const f of vertFaces[a]) {
      if (!aliveFace[f]) continue;
      for (let k = 0; k < 3; k++) {
        const v = faces[f * 3 + k];
        if (v !== a && aliveVert[v]) neighbors.add(v);
      }
    }
    for (const nb of neighbors) {
      const u = a < nb ? a : nb;
      const v = a < nb ? nb : a;
      heap.push(computeBestCollapse(u, v, verts, quadrics, vertVer[u], vertVer[v]));
    }

    iterations++;
    if (iterations % 1200 === 0) {
      const pct = Math.min(72, 28 + Math.round(((faceCount - activeFaces) / totalToRemove) * 44));
      onProgress?.(pct, `Decimating mesh (${activeFaces.toLocaleString()} tris)...`);
      await yieldFrame();
    }
  }

  // Compact surviving vertices and faces
  const oldToNewVert = new Int32Array(vertCount).fill(-1);
  const compactVertsList: number[] = [];
  const compactFacesList: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    if (!aliveFace[f]) continue;
    for (let k = 0; k < 3; k++) {
      const ov = faces[f * 3 + k];
      let nv = oldToNewVert[ov];
      if (nv === -1) {
        nv = compactVertsList.length / 3;
        oldToNewVert[ov] = nv;
        compactVertsList.push(verts[ov * 3], verts[ov * 3 + 1], verts[ov * 3 + 2]);
      }
      compactFacesList.push(nv);
    }
  }

  const compactVerts = new Float64Array(compactVertsList);
  const compactFaces = new Int32Array(compactFacesList);
  const compactVertCount = compactVerts.length / 3;

  // Optional volume-preserving Taubin smoothing
  if (options.smoothingPasses > 0 && compactVertCount > 0) {
    onProgress?.(76, 'Smoothing low-poly topology...');
    await yieldFrame();

    const adj: Array<Set<number>> = Array.from({ length: compactVertCount }, () => new Set());
    for (let f = 0; f < compactFaces.length; f += 3) {
      const a = compactFaces[f],
        b = compactFaces[f + 1],
        c = compactFaces[f + 2];
      adj[a].add(b);
      adj[a].add(c);
      adj[b].add(a);
      adj[b].add(c);
      adj[c].add(a);
      adj[c].add(b);
    }

    const laplacianStep = (factor: number) => {
      const next = new Float64Array(compactVerts);
      for (let v = 0; v < compactVertCount; v++) {
        const nbs = adj[v];
        if (nbs.size === 0) continue;
        let sx = 0,
          sy = 0,
          sz = 0;
        for (const nb of nbs) {
          sx += compactVerts[nb * 3];
          sy += compactVerts[nb * 3 + 1];
          sz += compactVerts[nb * 3 + 2];
        }
        const inv = 1 / nbs.size;
        next[v * 3] += factor * (sx * inv - compactVerts[v * 3]);
        next[v * 3 + 1] += factor * (sy * inv - compactVerts[v * 3 + 1]);
        next[v * 3 + 2] += factor * (sz * inv - compactVerts[v * 3 + 2]);
      }
      compactVerts.set(next);
    };

    for (let p = 0; p < options.smoothingPasses; p++) {
      laplacianStep(0.32);
      laplacianStep(-0.33);
    }
  }

  onProgress?.(85, 'Unwrapping & packing UV islands...');
  await yieldFrame();

  const { geometry, chartCount, uvCoverage, uvTriangles } = unwrapAndPackUVs(
    compactVerts,
    compactFaces,
    options.angleThreshold,
    options.uvMargin
  );

  onProgress?.(100, 'Retopology complete');
  const durationMs = Math.round(performance.now() - startTime);
  const stats = computeGeometryStats(geometry, `${assetName} (Low-Poly)`, 'RETOPO', false);

  return {
    geometry,
    stats,
    chartCount,
    uvCoverage,
    uvTriangles,
    durationMs,
  };
}
