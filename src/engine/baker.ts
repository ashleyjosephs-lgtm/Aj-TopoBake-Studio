import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { BakeOptions, BakedMapsResult, UvTriangleOverlay } from '../types/studio';

const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function sampleImageDataBilinear(
  img: ImageData,
  u: number,
  v: number,
  outRgb: [number, number, number]
): void {
  const uu = ((u % 1) + 1) % 1;
  const vv = 1 - (((v % 1) + 1) % 1);
  const fx = uu * (img.width - 1);
  const fy = vv * (img.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const idx00 = (y0 * img.width + x0) * 4;
  const idx10 = (y0 * img.width + x1) * 4;
  const idx01 = (y1 * img.width + x0) * 4;
  const idx11 = (y1 * img.width + x1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  outRgb[0] =
    img.data[idx00] * w00 +
    img.data[idx10] * w10 +
    img.data[idx01] * w01 +
    img.data[idx11] * w11;
  outRgb[1] =
    img.data[idx00 + 1] * w00 +
    img.data[idx10 + 1] * w10 +
    img.data[idx01 + 1] * w01 +
    img.data[idx11 + 1] * w11;
  outRgb[2] =
    img.data[idx00 + 2] * w00 +
    img.data[idx10 + 2] * w10 +
    img.data[idx01 + 2] * w01 +
    img.data[idx11 + 2] * w11;
}

function dilateMaps(
  normalBuf: Uint8ClampedArray,
  diffuseBuf: Uint8ClampedArray,
  mask: Uint8Array,
  size: number,
  passes: number
): void {
  let currMask = new Uint8Array(mask);
  const nextMask = new Uint8Array(mask.length);
  const tempNormal = new Uint8ClampedArray(normalBuf.length);
  const tempDiffuse = new Uint8ClampedArray(diffuseBuf.length);

  for (let pass = 0; pass < passes; pass++) {
    nextMask.set(currMask);
    tempNormal.set(normalBuf);
    tempDiffuse.set(diffuseBuf);
    let expanded = false;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        if (currMask[idx] === 1) continue;

        let nr = 0,
          ng = 0,
          nb = 0;
        let dr = 0,
          dg = 0,
          db = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= size) continue;
            const nIdx = ny * size + nx;
            if (currMask[nIdx] === 1) {
              const p = nIdx * 4;
              nr += normalBuf[p];
              ng += normalBuf[p + 1];
              nb += normalBuf[p + 2];
              dr += diffuseBuf[p];
              dg += diffuseBuf[p + 1];
              db += diffuseBuf[p + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          const p = idx * 4;
          tempNormal[p] = Math.round(nr / count);
          tempNormal[p + 1] = Math.round(ng / count);
          tempNormal[p + 2] = Math.round(nb / count);
          tempNormal[p + 3] = 255;

          tempDiffuse[p] = Math.round(dr / count);
          tempDiffuse[p + 1] = Math.round(dg / count);
          tempDiffuse[p + 2] = Math.round(db / count);
          tempDiffuse[p + 3] = 255;

          nextMask[idx] = 1;
          expanded = true;
        }
      }
    }

    normalBuf.set(tempNormal);
    diffuseBuf.set(tempDiffuse);
    currMask.set(nextMask);
    if (!expanded) break;
  }
}

export async function bakeNormalAndDiffuseMaps(
  highPolyGeo: THREE.BufferGeometry,
  highPolyDiffuse: ImageData | null,
  lowPolyGeo: THREE.BufferGeometry,
  uvTriangles: UvTriangleOverlay[],
  options: BakeOptions,
  onProgress?: (pct: number, stage: string) => void
): Promise<BakedMapsResult> {
  const startTime = performance.now();
  const res = options.resolution;
  onProgress?.(5, 'Building high-poly spatial BVH...');
  await yieldFrame();

  // Ensure high-poly has normals
  if (!highPolyGeo.getAttribute('normal')) {
    highPolyGeo.computeVertexNormals();
  }
  const bvh = new MeshBVH(highPolyGeo);

  const hpPos = highPolyGeo.getAttribute('position');
  const hpNorm = highPolyGeo.getAttribute('normal');
  const hpColor = highPolyGeo.getAttribute('color');
  const hpUv = highPolyGeo.getAttribute('uv');
  const hpIndex = highPolyGeo.getIndex();

  const lpPos = lowPolyGeo.getAttribute('position');
  const lpNorm = lowPolyGeo.getAttribute('normal');
  const lpTan = lowPolyGeo.getAttribute('tangent');
  const lpUv = lowPolyGeo.getAttribute('uv');
  const lpIndex = lowPolyGeo.getIndex();
  const lpTriCount = lpIndex ? Math.floor(lpIndex.count / 3) : Math.floor(lpPos.count / 3);

  const normalPixels = new Uint8ClampedArray(res * res * 4);
  const diffusePixels = new Uint8ClampedArray(res * res * 4);
  const filledMask = new Uint8Array(res * res);

  // Initialize neutral tangent-space normal (128, 128, 255) and dark slate diffuse base
  for (let i = 0; i < res * res; i++) {
    const p = i * 4;
    normalPixels[p] = 128;
    normalPixels[p + 1] = 128;
    normalPixels[p + 2] = 255;
    normalPixels[p + 3] = 255;

    diffusePixels[p] = 56;
    diffusePixels[p + 1] = 60;
    diffusePixels[p + 2] = 68;
    diffusePixels[p + 3] = 255;
  }

  onProgress?.(18, `Rasterizing ${res}×${res} UV texels...`);
  await yieldFrame();

  // Pre-allocated math helpers outside inner loop
  const p0 = new THREE.Vector3(),
    p1 = new THREE.Vector3(),
    p2 = new THREE.Vector3();
  const n0 = new THREE.Vector3(),
    n1 = new THREE.Vector3(),
    n2 = new THREE.Vector3();
  const t0 = new THREE.Vector3(),
    t1 = new THREE.Vector3(),
    t2 = new THREE.Vector3();

  const hpV0 = new THREE.Vector3(),
    hpV1 = new THREE.Vector3(),
    hpV2 = new THREE.Vector3();
  const hpN0 = new THREE.Vector3(),
    hpN1 = new THREE.Vector3(),
    hpN2 = new THREE.Vector3();
  const hpTri = new THREE.Triangle();
  const bary = new THREE.Vector3();

  const surfPos = new THREE.Vector3();
  const surfNorm = new THREE.Vector3();
  const surfTan = new THREE.Vector3();
  const surfBitan = new THREE.Vector3();
  const hpSampleNorm = new THREE.Vector3();

  const rayInward = new THREE.Ray();
  const rayOutward = new THREE.Ray();
  const closestInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const rgbTmp: [number, number, number] = [180, 184, 192];

  const ss = options.supersample;
  const subOffsets = ss === 2 ? [0.25, 0.75] : [0.5];
  const invSamples = 1 / (subOffsets.length * subOffsets.length);
  const cageDist = options.cageDistance;

  let rayHits = 0;
  let totalTexels = 0;

  for (let triIdx = 0; triIdx < lpTriCount; triIdx++) {
    const i0 = lpIndex ? lpIndex.getX(triIdx * 3) : triIdx * 3;
    const i1 = lpIndex ? lpIndex.getX(triIdx * 3 + 1) : triIdx * 3 + 1;
    const i2 = lpIndex ? lpIndex.getX(triIdx * 3 + 2) : triIdx * 3 + 2;

    const u0 = lpUv.getX(i0) * res,
      v0 = (1 - lpUv.getY(i0)) * res;
    const u1 = lpUv.getX(i1) * res,
      v1 = (1 - lpUv.getY(i1)) * res;
    const u2 = lpUv.getX(i2) * res,
      v2 = (1 - lpUv.getY(i2)) * res;

    const minX = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1);
    const maxX = Math.min(res - 1, Math.ceil(Math.max(u0, u1, u2)) + 1);
    const minY = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 1);
    const maxY = Math.min(res - 1, Math.ceil(Math.max(v0, v1, v2)) + 1);

    const denom = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
    if (Math.abs(denom) < 1e-8) continue;
    const invDenom = 1 / denom;

    p0.fromBufferAttribute(lpPos, i0);
    p1.fromBufferAttribute(lpPos, i1);
    p2.fromBufferAttribute(lpPos, i2);

    n0.fromBufferAttribute(lpNorm, i0);
    n1.fromBufferAttribute(lpNorm, i1);
    n2.fromBufferAttribute(lpNorm, i2);

    const hasTangent = Boolean(lpTan);
    const tw = hasTangent ? lpTan.getW(i0) : 1;
    if (hasTangent) {
      t0.set(lpTan.getX(i0), lpTan.getY(i0), lpTan.getZ(i0));
      t1.set(lpTan.getX(i1), lpTan.getY(i1), lpTan.getZ(i1));
      t2.set(lpTan.getX(i2), lpTan.getY(i2), lpTan.getZ(i2));
    }

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let accNx = 0,
          accNy = 0,
          accNz = 0;
        let accR = 0,
          accG = 0,
          accB = 0;
        let covered = 0;

        for (let sy = 0; sy < subOffsets.length; sy++) {
          for (let sx = 0; sx < subOffsets.length; sx++) {
            const su = px + subOffsets[sx];
            const sv = py + subOffsets[sy];

            const b0 = ((v1 - v2) * (su - u2) + (u2 - u1) * (sv - v2)) * invDenom;
            const b1 = ((v2 - v0) * (su - u2) + (u0 - u2) * (sv - v2)) * invDenom;
            const b2 = 1 - b0 - b1;

            if (b0 < -0.005 || b1 < -0.005 || b2 < -0.005) continue;
            covered++;

            // Interpolate low-poly position & tangent frame
            surfPos
              .set(0, 0, 0)
              .addScaledVector(p0, b0)
              .addScaledVector(p1, b1)
              .addScaledVector(p2, b2);
            surfNorm
              .set(0, 0, 0)
              .addScaledVector(n0, b0)
              .addScaledVector(n1, b1)
              .addScaledVector(n2, b2)
              .normalize();

            if (hasTangent) {
              surfTan
                .set(0, 0, 0)
                .addScaledVector(t0, b0)
                .addScaledVector(t1, b1)
                .addScaledVector(t2, b2);
              // Gram-Schmidt orthogonalize tangent against interpolated normal
              surfTan.addScaledVector(surfNorm, -surfTan.dot(surfNorm)).normalize();
            } else {
              surfTan.set(1, 0, 0);
              if (Math.abs(surfNorm.x) > 0.9) surfTan.set(0, 1, 0);
              surfTan.addScaledVector(surfNorm, -surfTan.dot(surfNorm)).normalize();
            }
            surfBitan.crossVectors(surfNorm, surfTan).multiplyScalar(tw).normalize();

            // Bidirectional cage raycast onto high-poly BVH
            rayInward.origin.copy(surfPos).addScaledVector(surfNorm, cageDist);
            rayInward.direction.copy(surfNorm).negate();
            const hitIn = bvh.raycastFirst(rayInward, THREE.DoubleSide, 0, cageDist * 2.2);

            let hitFaceIdx = -1;
            let hitPoint = surfPos;

            if (hitIn && typeof hitIn.faceIndex === 'number') {
              hitFaceIdx = hitIn.faceIndex;
              hitPoint = hitIn.point;
              rayHits++;
            } else {
              rayOutward.origin.copy(surfPos).addScaledVector(surfNorm, -cageDist * 0.5);
              rayOutward.direction.copy(surfNorm);
              const hitOut = bvh.raycastFirst(rayOutward, THREE.DoubleSide, 0, cageDist * 1.8);
              if (hitOut && typeof hitOut.faceIndex === 'number') {
                hitFaceIdx = hitOut.faceIndex;
                hitPoint = hitOut.point;
                rayHits++;
              } else {
                const nearHit = bvh.closestPointToPoint(surfPos, closestInfo);
                if (nearHit) {
                  hitFaceIdx = nearHit.faceIndex;
                  hitPoint = nearHit.point;
                }
              }
            }

            if (hitFaceIdx >= 0) {
              const ha = hpIndex ? hpIndex.getX(hitFaceIdx * 3) : hitFaceIdx * 3;
              const hb = hpIndex ? hpIndex.getX(hitFaceIdx * 3 + 1) : hitFaceIdx * 3 + 1;
              const hc = hpIndex ? hpIndex.getX(hitFaceIdx * 3 + 2) : hitFaceIdx * 3 + 2;

              hpV0.fromBufferAttribute(hpPos, ha);
              hpV1.fromBufferAttribute(hpPos, hb);
              hpV2.fromBufferAttribute(hpPos, hc);
              hpTri.set(hpV0, hpV1, hpV2);
              hpTri.getBarycoord(hitPoint, bary);

              hpN0.fromBufferAttribute(hpNorm, ha);
              hpN1.fromBufferAttribute(hpNorm, hb);
              hpN2.fromBufferAttribute(hpNorm, hc);
              hpSampleNorm
                .set(0, 0, 0)
                .addScaledVector(hpN0, bary.x)
                .addScaledVector(hpN1, bary.y)
                .addScaledVector(hpN2, bary.z)
                .normalize();

              // Transform world-space high-poly normal into low-poly tangent space
              const tnx = hpSampleNorm.dot(surfTan);
              const tny = hpSampleNorm.dot(surfBitan);
              const tnz = Math.max(0.05, hpSampleNorm.dot(surfNorm));
              const tLen = Math.hypot(tnx, tny, tnz) || 1;
              accNx += tnx / tLen;
              accNy += tny / tLen;
              accNz += tnz / tLen;

              // Sample diffuse color (texture + vertex color)
              let cr = 0.72,
                cg = 0.74,
                cb = 0.78;
              if (hpColor) {
                cr =
                  hpColor.getX(ha) * bary.x +
                  hpColor.getX(hb) * bary.y +
                  hpColor.getX(hc) * bary.z;
                cg =
                  hpColor.getY(ha) * bary.x +
                  hpColor.getY(hb) * bary.y +
                  hpColor.getY(hc) * bary.z;
                cb =
                  hpColor.getZ(ha) * bary.x +
                  hpColor.getZ(hb) * bary.y +
                  hpColor.getZ(hc) * bary.z;
              }
              if (highPolyDiffuse && hpUv) {
                const hu =
                  hpUv.getX(ha) * bary.x + hpUv.getX(hb) * bary.y + hpUv.getX(hc) * bary.z;
                const hv =
                  hpUv.getY(ha) * bary.x + hpUv.getY(hb) * bary.y + hpUv.getY(hc) * bary.z;
                sampleImageDataBilinear(highPolyDiffuse, hu, hv, rgbTmp);
                cr *= rgbTmp[0] / 255;
                cg *= rgbTmp[1] / 255;
                cb *= rgbTmp[2] / 255;
              }
              accR += cr * 255;
              accG += cg * 255;
              accB += cb * 255;
            } else {
              accNz += 1;
              accR += 180;
              accG += 184;
              accB += 192;
            }
          }
        }

        if (covered > 0) {
          const factor = ss === 2 && covered === 4 ? invSamples : 1 / covered;
          const nLen = Math.hypot(accNx, accNy, accNz) || 1;
          const fnx = accNx / nLen;
          const fny = accNy / nLen;
          const fnz = accNz / nLen;

          const idx = py * res + px;
          const p = idx * 4;
          normalPixels[p] = Math.round((fnx * 0.5 + 0.5) * 255);
          normalPixels[p + 1] = Math.round((fny * 0.5 + 0.5) * 255);
          normalPixels[p + 2] = Math.round((fnz * 0.5 + 0.5) * 255);
          normalPixels[p + 3] = 255;

          diffusePixels[p] = Math.min(255, Math.max(0, Math.round(accR * factor)));
          diffusePixels[p + 1] = Math.min(255, Math.max(0, Math.round(accG * factor)));
          diffusePixels[p + 2] = Math.min(255, Math.max(0, Math.round(accB * factor)));
          diffusePixels[p + 3] = 255;

          filledMask[idx] = 1;
          totalTexels++;
        }
      }
    }

    if (triIdx % 120 === 0) {
      const pct = Math.min(90, 18 + Math.round((triIdx / Math.max(1, lpTriCount)) * 72));
      onProgress?.(pct, `Baking maps (${Math.round((triIdx / lpTriCount) * 100)}%)...`);
      await yieldFrame();
    }
  }

  if (options.edgePadding > 0) {
    onProgress?.(93, 'Dilating UV seam gutters...');
    await yieldFrame();
    dilateMaps(normalPixels, diffusePixels, filledMask, res, options.edgePadding);
  }

  onProgress?.(98, 'Finalizing texture buffers...');
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = res;
  normalCanvas.height = res;
  const nCtx = normalCanvas.getContext('2d')!;
  nCtx.putImageData(new ImageData(normalPixels, res, res), 0, 0);

  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = res;
  diffuseCanvas.height = res;
  const dCtx = diffuseCanvas.getContext('2d')!;
  dCtx.putImageData(new ImageData(diffusePixels, res, res), 0, 0);

  // Render crisp UV Island wireframe overlay
  const uvOverlayCanvas = document.createElement('canvas');
  uvOverlayCanvas.width = res;
  uvOverlayCanvas.height = res;
  const uCtx = uvOverlayCanvas.getContext('2d')!;
  uCtx.fillStyle = '#0F1116';
  uCtx.fillRect(0, 0, res, res);
  uCtx.lineWidth = Math.max(1, res / 512);

  for (const tri of uvTriangles) {
    const hue = (tri.chartId * 47) % 360;
    uCtx.fillStyle = `hsla(${hue}, 65%, 55%, 0.22)`;
    uCtx.strokeStyle = `hsla(${hue}, 78%, 72%, 0.85)`;
    uCtx.beginPath();
    uCtx.moveTo(tri.u0 * res, (1 - tri.v0) * res);
    uCtx.lineTo(tri.u1 * res, (1 - tri.v1) * res);
    uCtx.lineTo(tri.u2 * res, (1 - tri.v2) * res);
    uCtx.closePath();
    uCtx.fill();
    uCtx.stroke();
  }

  onProgress?.(100, 'Baking complete');
  const durationMs = Math.round(performance.now() - startTime);
  const hitRate = totalTexels > 0 ? Math.min(1, rayHits / (totalTexels * subOffsets.length * subOffsets.length)) : 1;

  return {
    normalCanvas,
    diffuseCanvas,
    uvOverlayCanvas,
    normalDataUrl: normalCanvas.toDataURL('image/png'),
    diffuseDataUrl: diffuseCanvas.toDataURL('image/png'),
    uvOverlayDataUrl: uvOverlayCanvas.toDataURL('image/png'),
    resolution: res,
    hitRate,
    durationMs,
  };
}
