import React, { useRef, useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { SAMPLE_PRESETS } from '../../engine/samples';
import { SamplePresetId, SourceAsset } from '../../types/studio';

interface InspectPanelProps {
  sourceAsset: SourceAsset | null;
  activePresetId: SamplePresetId | null;
  isImporting: boolean;
  importError: string | null;
  onSelectPreset: (id: SamplePresetId) => void;
  onUploadFile: (file: File) => void;
  onNextStep: () => void;
}

export const InspectPanel: React.FC<InspectPanelProps> = ({
  sourceAsset,
  activePresetId,
  isImporting,
  importError,
  onSelectPreset,
  onUploadFile,
  onNextStep,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUploadFile(files[0]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-base font-semibold text-white">
          01. Source High-Poly Mesh
        </h2>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Import an existing 3D model or start from a sculpted high-poly preset to test retopology and map baking.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-white/15 bg-[#111318] hover:border-white/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".obj,.glb,.gltf,.ply,.fbx"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="w-5 h-5 text-blue-400" />
        <div className="text-center">
          <p className="text-xs font-medium text-slate-200">
            {isImporting ? 'Parsing 3D Geometry...' : 'Drop 3D file or click to browse'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            OBJ · GLB / GLTF · PLY · FBX
          </p>
        </div>
      </div>

      {importError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
          {importError}
        </div>
      )}

      {/* Sample High-Poly Presets */}
      <div>
        <h3 className="text-xs font-semibold text-slate-300 mb-2.5">
          Built-in Sculpt Presets
        </h3>
        <div className="flex flex-col gap-2">
          {SAMPLE_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  active
                    ? 'bg-blue-600/15 border-blue-500/60'
                    : 'bg-[#111318] border-white/8 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">
                    {preset.title}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {preset.approxTris}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                  {preset.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mesh Diagnostics */}
      {sourceAsset && (
        <div className="pt-4 border-t border-white/10">
          <h3 className="text-xs font-semibold text-slate-300 mb-2.5">
            Active Source Diagnostics
          </h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            <span className="text-slate-400">Asset</span>
            <span className="text-right font-medium text-slate-200 truncate">
              {sourceAsset.stats.name}
            </span>

            <span className="text-slate-400">Format</span>
            <span className="text-right font-mono text-slate-200">
              {sourceAsset.stats.format}
            </span>

            <span className="text-slate-400">Triangles</span>
            <span className="text-right font-mono text-slate-100">
              {sourceAsset.stats.triangles.toLocaleString()}
            </span>

            <span className="text-slate-400">Vertices</span>
            <span className="text-right font-mono text-slate-200">
              {sourceAsset.stats.vertices.toLocaleString()}
            </span>

            <span className="text-slate-400">Bounds (XYZ)</span>
            <span className="text-right font-mono text-slate-200">
              {sourceAsset.stats.boundsSize.join(' × ')}
            </span>

            <span className="text-slate-400">Color Source</span>
            <span className="text-right text-slate-200">
              {sourceAsset.stats.hasDiffuseTexture
                ? 'Diffuse Texture'
                : sourceAsset.stats.hasVertexColors
                ? 'Vertex Colors'
                : 'Default Clay'}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!sourceAsset}
        onClick={onNextStep}
        className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-500 text-xs font-semibold text-white transition-colors"
      >
        <span>Continue to Retopology</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
