import React, { useState } from 'react';
import { ArrowRight, Download, Maximize2, Play, X } from 'lucide-react';
import { exportPngCanvas } from '../../engine/exporters';
import { BakeOptions, BakedMapsResult, RetopoResult } from '../../types/studio';

interface BakePanelProps {
  hasSource: boolean;
  retopoResult: RetopoResult | null;
  options: BakeOptions;
  onChangeOptions: (next: BakeOptions) => void;
  isBaking: boolean;
  progress: number;
  progressLabel: string;
  bakedMaps: BakedMapsResult | null;
  onRunBake: () => void;
  onNextStep: () => void;
}

type MapPreviewTab = 'normal' | 'diffuse' | 'uv';

export const BakePanel: React.FC<BakePanelProps> = ({
  hasSource,
  retopoResult,
  options,
  onChangeOptions,
  isBaking,
  progress,
  progressLabel,
  bakedMaps,
  onRunBake,
  onNextStep,
}) => {
  const [previewTab, setPreviewTab] = useState<MapPreviewTab>('normal');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const activePreviewUrl =
    previewTab === 'normal'
      ? bakedMaps?.normalDataUrl
      : previewTab === 'diffuse'
      ? bakedMaps?.diffuseDataUrl
      : bakedMaps?.uvOverlayDataUrl;

  const activeCanvas =
    previewTab === 'normal'
      ? bakedMaps?.normalCanvas
      : previewTab === 'diffuse'
      ? bakedMaps?.diffuseCanvas
      : bakedMaps?.uvOverlayCanvas;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-base font-semibold text-white">
          03. Normal &amp; Diffuse Map Baking
        </h2>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Cast BVH cage rays from the low-poly surface onto the high-poly sculpt to bake tangent-space normals and albedo.
        </p>
      </div>

      {/* Resolution */}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <span className="text-xs font-medium text-slate-200">Texture Resolution</span>
        <div className="grid grid-cols-3 gap-1.5">
          {([512, 1024, 2048] as const).map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => onChangeOptions({ ...options, resolution: res })}
              className={`py-1.5 text-xs font-mono rounded-md border transition-colors ${
                options.resolution === res
                  ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-[#171A21] border-white/8 text-slate-400 hover:text-slate-200'
              }`}
            >
              {res}×{res}
            </button>
          ))}
        </div>
      </div>

      {/* Ray Cage & Padding */}
      <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Ray Cage Distance</span>
            <span className="font-mono text-slate-300">
              {options.cageDistance.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.04}
            max={0.35}
            step={0.01}
            value={options.cageDistance}
            onChange={(e) =>
              onChangeOptions({ ...options, cageDistance: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">UV Seam Edge Dilation</span>
            <span className="font-mono text-slate-300">{options.edgePadding} px</span>
          </div>
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={options.edgePadding}
            onChange={(e) =>
              onChangeOptions({ ...options, edgePadding: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/6">
          <span className="text-xs font-medium text-slate-200">Anti-Aliasing</span>
          <div className="flex items-center gap-1">
            {([1, 2] as const).map((ss) => (
              <button
                key={ss}
                type="button"
                onClick={() => onChangeOptions({ ...options, supersample: ss })}
                className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                  options.supersample === ss
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                    : 'bg-[#171A21] border-white/8 text-slate-400 hover:text-slate-200'
                }`}
              >
                {ss}× SSAA
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bake Button */}
      <button
        type="button"
        disabled={!hasSource || isBaking}
        onClick={onRunBake}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-500 text-xs font-semibold text-white transition-colors"
      >
        <Play className="w-3.5 h-3.5" />
        <span>
          {isBaking
            ? 'Baking Maps...'
            : retopoResult
            ? 'Bake Normal & Diffuse Maps'
            : 'Auto-Retopologize & Bake Maps'}
        </span>
      </button>

      {isBaking && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span>{progressLabel}</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 2D Map Inspector */}
      {bakedMaps && (
        <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300">2D Map Inspector</h3>
            <span className="text-[11px] font-mono text-slate-400">
              {(bakedMaps.hitRate * 100).toFixed(1)}% ray hits · {bakedMaps.durationMs} ms
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#111318] border border-white/5">
            {(
              [
                { id: 'normal', label: 'Normal' },
                { id: 'diffuse', label: 'Diffuse' },
                { id: 'uv', label: 'UV Islands' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPreviewTab(t.id)}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  previewTab === t.id
                    ? 'bg-[#262B36] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activePreviewUrl && (
            <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#0F1116]">
              <img
                src={activePreviewUrl}
                alt={`Baked ${previewTab} texture map`}
                referrerPolicy="no-referrer"
                className="w-full aspect-square object-contain block"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="p-1.5 rounded-lg bg-[#171A21]/90 border border-white/15 text-slate-200 hover:text-white transition-colors"
                  title="Expand texture preview"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                {activeCanvas && (
                  <button
                    type="button"
                    onClick={() => exportPngCanvas(activeCanvas, `${previewTab}_map.png`)}
                    className="p-1.5 rounded-lg bg-[#171A21]/90 border border-white/15 text-slate-200 hover:text-white transition-colors"
                    title="Download PNG map"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onNextStep}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-[#262B36] hover:bg-[#303644] text-xs font-semibold text-white transition-colors"
          >
            <span>Open AI Texture Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Lightbox Modal for full-res map inspection */}
      {lightboxOpen && activePreviewUrl && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full rounded-xl bg-[#171A21] border border-white/15 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white capitalize">
                {previewTab} Map ({bakedMaps?.resolution}×{bakedMaps?.resolution})
              </span>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={activePreviewUrl}
              alt={`Expanded ${previewTab} map`}
              referrerPolicy="no-referrer"
              className="w-full max-h-[72vh] object-contain rounded-lg bg-[#0F1116]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
