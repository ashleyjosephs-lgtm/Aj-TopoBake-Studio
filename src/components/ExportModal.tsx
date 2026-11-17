import React, { useState } from 'react';
import * as THREE from 'three';
import { Archive, Download, X } from 'lucide-react';
import {
  exportFbxFile,
  exportGlbFile,
  exportObjFile,
  exportPngCanvas,
  exportZipBundle,
} from '../engine/exporters';
import { BakedMapsResult, RetopoResult, SourceAsset } from '../types/studio';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  sourceAsset: SourceAsset | null;
  retopoResult: RetopoResult | null;
  bakedMaps: BakedMapsResult | null;
  onAutoPrepare: () => Promise<void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  sourceAsset,
  retopoResult,
  bakedMaps,
  onAutoPrepare,
}) => {
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!open) return null;

  const targetGeometry: THREE.BufferGeometry | null =
    retopoResult?.geometry ?? sourceAsset?.geometry ?? null;
  const rawName = sourceAsset?.name ?? 'topobake_asset';
  const slug = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const runExport = async (key: string, task: () => Promise<void> | void) => {
    setExportError(null);
    setBusyFormat(key);
    try {
      await task();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusyFormat(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#171A21] border border-white/12 p-6 shadow-2xl flex flex-col gap-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Export Low-Poly Asset &amp; Baked Maps
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {retopoResult
                ? `Ready: ${retopoResult.stats.triangles.toLocaleString()} tris · ${
                    bakedMaps ? `${bakedMaps.resolution}px Normal & Diffuse` : 'UVs Ready'
                  }`
                : 'Using source geometry (run Retopology & Bake for optimized low-poly + maps).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(!retopoResult || !bakedMaps) && sourceAsset && (
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3">
            <span className="text-xs text-blue-200">
              Optimize mesh &amp; bake Normal + Diffuse maps before exporting?
            </span>
            <button
              type="button"
              disabled={busyFormat !== null}
              onClick={() => runExport('prepare', onAutoPrepare)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap shrink-0"
            >
              {busyFormat === 'prepare' ? 'Processing...' : 'Retopo & Bake'}
            </button>
          </div>
        )}

        {exportError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {exportError}
          </div>
        )}

        {/* 3D Mesh Formats */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-300">3D Mesh Formats</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={!targetGeometry || busyFormat !== null}
              onClick={() =>
                targetGeometry &&
                runExport('glb', () =>
                  exportGlbFile(
                    targetGeometry,
                    slug,
                    bakedMaps?.diffuseCanvas,
                    bakedMaps?.normalCanvas
                  )
                )
              }
              className="flex flex-col items-start gap-1 p-3 rounded-xl bg-[#111318] border border-white/10 hover:border-blue-500/50 transition-colors text-left"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-mono font-semibold text-white">.GLB</span>
                <Download className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span className="text-[11px] text-slate-400">Embedded PBR maps</span>
            </button>

            <button
              type="button"
              disabled={!targetGeometry || busyFormat !== null}
              onClick={() =>
                targetGeometry && runExport('fbx', () => exportFbxFile(targetGeometry, slug))
              }
              className="flex flex-col items-start gap-1 p-3 rounded-xl bg-[#111318] border border-white/10 hover:border-blue-500/50 transition-colors text-left"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-mono font-semibold text-white">.FBX</span>
                <Download className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span className="text-[11px] text-slate-400">ASCII FBX 7.4 + UVs</span>
            </button>

            <button
              type="button"
              disabled={!targetGeometry || busyFormat !== null}
              onClick={() =>
                targetGeometry && runExport('obj', () => exportObjFile(targetGeometry, slug))
              }
              className="flex flex-col items-start gap-1 p-3 rounded-xl bg-[#111318] border border-white/10 hover:border-blue-500/50 transition-colors text-left"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-mono font-semibold text-white">.OBJ</span>
                <Download className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span className="text-[11px] text-slate-400">Wavefront OBJ + MTL</span>
            </button>
          </div>
        </div>

        {/* Texture Maps */}
        {bakedMaps && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-300">
              Baked Texture Maps (PNG)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  runExport('norm-png', () =>
                    exportPngCanvas(bakedMaps.normalCanvas, `${slug}_normal.png`)
                  )
                }
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#111318] border border-white/10 hover:border-white/25 text-xs text-slate-200"
              >
                <span>Normal Map</span>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() =>
                  runExport('diff-png', () =>
                    exportPngCanvas(bakedMaps.diffuseCanvas, `${slug}_diffuse.png`)
                  )
                }
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#111318] border border-white/10 hover:border-white/25 text-xs text-slate-200"
              >
                <span>Diffuse Map</span>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() =>
                  runExport('uv-png', () =>
                    exportPngCanvas(bakedMaps.uvOverlayCanvas, `${slug}_uv_layout.png`)
                  )
                }
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#111318] border border-white/10 hover:border-white/25 text-xs text-slate-200"
              >
                <span>UV Layout</span>
                <Download className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {/* Complete ZIP Bundle */}
        <button
          type="button"
          disabled={!targetGeometry || busyFormat !== null}
          onClick={() =>
            targetGeometry &&
            runExport('zip', () =>
              exportZipBundle({
                geometry: targetGeometry,
                assetSlug: slug,
                diffuseCanvas: bakedMaps?.diffuseCanvas,
                normalCanvas: bakedMaps?.normalCanvas,
                uvOverlayCanvas: bakedMaps?.uvOverlayCanvas,
                report: {
                  assetName: rawName,
                  sourceTriangles: sourceAsset?.stats.triangles ?? 0,
                  lowPolyTriangles: retopoResult?.stats.triangles ?? 0,
                  uvIslands: retopoResult?.chartCount ?? 0,
                  uvCoverage: retopoResult?.uvCoverage ?? 0,
                  bakeResolution: bakedMaps?.resolution ?? null,
                  exportedAt: new Date().toISOString(),
                },
              })
            )
          }
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-500 text-xs font-semibold text-white transition-colors"
        >
          <Archive className="w-4 h-4" />
          <span>
            {busyFormat === 'zip'
              ? 'Bundling ZIP Archive...'
              : 'Download Complete ZIP Bundle (GLB + FBX + OBJ + PNG Maps)'}
          </span>
        </button>
      </div>
    </div>
  );
};
