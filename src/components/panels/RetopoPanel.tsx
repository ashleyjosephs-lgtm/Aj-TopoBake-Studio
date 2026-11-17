import React from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { RetopoOptions, RetopoResult, SourceAsset } from '../../types/studio';

interface RetopoPanelProps {
  sourceAsset: SourceAsset | null;
  options: RetopoOptions;
  onChangeOptions: (next: RetopoOptions) => void;
  isProcessing: boolean;
  progress: number;
  progressLabel: string;
  retopoResult: RetopoResult | null;
  onRunRetopo: () => void;
  onNextStep: () => void;
}

const TARGET_PRESETS = [
  { label: 'Game LOD 5%', ratio: 0.05 },
  { label: 'Balanced 12%', ratio: 0.12 },
  { label: 'Hero 25%', ratio: 0.25 },
];

export const RetopoPanel: React.FC<RetopoPanelProps> = ({
  sourceAsset,
  options,
  onChangeOptions,
  isProcessing,
  progress,
  progressLabel,
  retopoResult,
  onRunRetopo,
  onNextStep,
}) => {
  const srcTris = sourceAsset?.stats.triangles ?? 0;
  const estTargetTris = Math.max(12, Math.round(srcTris * options.targetRatio));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-base font-semibold text-white">
          02. Retopology &amp; UV Unwrap
        </h2>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Simplify geometry with Quadric Error Metric edge collapse and automatically pack non-overlapping UV islands.
        </p>
      </div>

      {/* Target Triangle Budget */}
      <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-200">Target Triangle Ratio</span>
          <span className="font-mono text-blue-400">
            {Math.round(options.targetRatio * 100)}% (~{estTargetTris.toLocaleString()} tris)
          </span>
        </div>
        <input
          type="range"
          min={0.02}
          max={0.5}
          step={0.01}
          value={options.targetRatio}
          onChange={(e) =>
            onChangeOptions({ ...options, targetRatio: Number(e.target.value) })
          }
          className="w-full"
        />
        <div className="flex items-center gap-1.5 pt-1">
          {TARGET_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChangeOptions({ ...options, targetRatio: p.ratio })}
              className={`flex-1 py-1.5 px-2 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap ${
                Math.abs(options.targetRatio - p.ratio) < 0.005
                  ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-[#171A21] border-white/8 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topology Options */}
      <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <div className="text-xs font-medium text-slate-200">Preserve Open Borders</div>
            <div className="text-[11px] text-slate-500">
              Lock silhouette boundary edges against shrinkage
            </div>
          </div>
          <input
            type="checkbox"
            checked={options.preserveBoundaries}
            onChange={(e) =>
              onChangeOptions({ ...options, preserveBoundaries: e.target.checked })
            }
            className="w-4 h-4 accent-blue-600 rounded"
          />
        </label>

        <div className="pt-2 border-t border-white/6 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Taubin Smoothing Passes</span>
            <span className="font-mono text-slate-300">{options.smoothingPasses}</span>
          </div>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={options.smoothingPasses}
            onChange={(e) =>
              onChangeOptions({ ...options, smoothingPasses: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>
      </div>

      {/* UV Unwrap Controls */}
      <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">UV Chart Angle Threshold</span>
            <span className="font-mono text-slate-300">{options.angleThreshold}°</span>
          </div>
          <input
            type="range"
            min={25}
            max={75}
            step={1}
            value={options.angleThreshold}
            onChange={(e) =>
              onChangeOptions({ ...options, angleThreshold: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">UV Island Gutter Margin</span>
            <span className="font-mono text-slate-300">
              {(options.uvMargin * 100).toFixed(1)}%
            </span>
          </div>
          <input
            type="range"
            min={0.005}
            max={0.03}
            step={0.001}
            value={options.uvMargin}
            onChange={(e) =>
              onChangeOptions({ ...options, uvMargin: Number(e.target.value) })
            }
            className="w-full"
          />
        </div>
      </div>

      {/* Run Retopology Button + Progress */}
      <button
        type="button"
        disabled={!sourceAsset || isProcessing}
        onClick={onRunRetopo}
        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-500 text-xs font-semibold text-white transition-colors"
      >
        <Play className="w-3.5 h-3.5" />
        <span>
          {isProcessing ? 'Retopologizing...' : 'Run Retopology & UV Unwrap'}
        </span>
      </button>

      {isProcessing && (
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

      {/* Results Summary */}
      {retopoResult && (
        <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-slate-300">
            Low-Poly Topology &amp; UV Summary
          </h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            <span className="text-slate-400">Output Triangles</span>
            <span className="text-right font-mono text-blue-400">
              {retopoResult.stats.triangles.toLocaleString()}
            </span>

            <span className="text-slate-400">UV Islands</span>
            <span className="text-right font-mono text-slate-200">
              {retopoResult.chartCount}
            </span>

            <span className="text-slate-400">UV Packing Coverage</span>
            <span className="text-right font-mono text-slate-200">
              {(retopoResult.uvCoverage * 100).toFixed(1)}%
            </span>

            <span className="text-slate-400">Compute Time</span>
            <span className="text-right font-mono text-slate-200">
              {retopoResult.durationMs} ms
            </span>
          </div>

          <button
            type="button"
            onClick={onNextStep}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-[#262B36] hover:bg-[#303644] text-xs font-semibold text-white transition-colors"
          >
            <span>Proceed to Bake Maps</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
