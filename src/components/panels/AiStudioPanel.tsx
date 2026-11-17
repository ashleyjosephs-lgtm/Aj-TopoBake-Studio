import React, { useState } from 'react';
import { Check, Download, Image as ImageIcon, RotateCcw } from 'lucide-react';
import {
  AiAspectRatio,
  AiGeneratedItem,
  AiImageSize,
  AiModelId,
  AiStudioMode,
} from '../../types/studio';

interface AiStudioPanelProps {
  mode: AiStudioMode;
  onChangeMode: (mode: AiStudioMode) => void;
  model: AiModelId;
  onChangeModel: (model: AiModelId) => void;
  imageSize: AiImageSize;
  onChangeImageSize: (size: AiImageSize) => void;
  aspectRatio: AiAspectRatio;
  onChangeAspectRatio: (ratio: AiAspectRatio) => void;
  useReference: boolean;
  onChangeUseReference: (val: boolean) => void;
  isGenerating: boolean;
  error: string | null;
  gallery: AiGeneratedItem[];
  activeCustomDiffuseUrl: string | null;
  onGenerate: (prompt: string) => void;
  onApplyDiffuse: (item: AiGeneratedItem | null) => void;
}

const ASPECT_RATIOS: AiAspectRatio[] = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
];

const IMAGE_SIZES: AiImageSize[] = ['1K', '2K', '4K'];

const QUICK_PROMPTS: Record<AiStudioMode, Array<{ label: string; prompt: string }>> = {
  'diffuse-texture': [
    {
      label: 'Damask Forged Steel',
      prompt: 'Seamless brushed Damascus steel with subtle hammered tool marks and dark oil-rubbed recesses',
    },
    {
      label: 'Aged Verdigris Bronze',
      prompt: 'Oxidized antique bronze metal with turquoise verdigris patina in crevices and burnished gold highlights',
    },
    {
      label: 'Carved Obsidian & Gold',
      prompt: 'Matte volcanic obsidian stone texture with delicate kintsugi gold leaf veins',
    },
  ],
  'studio-render': [
    {
      label: 'Museum Plinth Shot',
      prompt: 'Museum artifact studio photography on dark basalt plinth, dramatic rim lighting, razor sharp micro-detail',
    },
    {
      label: 'Industrial Turntable',
      prompt: 'Clean commercial product render in a neutral architectural studio with soft diffused overhead softboxes',
    },
  ],
};

export const AiStudioPanel: React.FC<AiStudioPanelProps> = ({
  mode,
  onChangeMode,
  model,
  onChangeModel,
  imageSize,
  onChangeImageSize,
  aspectRatio,
  onChangeAspectRatio,
  useReference,
  onChangeUseReference,
  isGenerating,
  error,
  gallery,
  activeCustomDiffuseUrl,
  onGenerate,
  onApplyDiffuse,
}) => {
  const [prompt, setPrompt] = useState(
    'Oxidized antique bronze metal with turquoise verdigris patina and warm burnished edges'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim());
  };

  const downloadImage = (dataUrl: string, id: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `topobake_${id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-base font-semibold text-white">
          04. AI Texture &amp; Render Studio
        </h2>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Synthesize custom diffuse textures for your retopologized UVs or generate studio showcase renders from your 3D viewport.
        </p>
      </div>

      {/* Mode Switch */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#111318] border border-white/8">
        <button
          type="button"
          onClick={() => onChangeMode('diffuse-texture')}
          className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'diffuse-texture'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          AI Diffuse Texture
        </button>
        <button
          type="button"
          onClick={() => onChangeMode('studio-render')}
          className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'studio-render'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Studio Showcase
        </button>
      </div>

      {/* Model Selector */}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <span className="text-xs font-medium text-slate-200">Generation Model</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onChangeModel('gemini-3-pro-image-preview')}
            className={`p-2 text-left rounded-lg border transition-colors ${
              model === 'gemini-3-pro-image-preview'
                ? 'bg-blue-600/20 border-blue-500/60'
                : 'bg-[#171A21] border-white/8 hover:border-white/20'
            }`}
          >
            <div className="text-xs font-semibold text-slate-100">Studio Pro</div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              gemini-3-pro-image-preview
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChangeModel('gemini-nano-banana-2.1')}
            className={`p-2 text-left rounded-lg border transition-colors ${
              model === 'gemini-nano-banana-2.1'
                ? 'bg-blue-600/20 border-blue-500/60'
                : 'bg-[#171A21] border-white/8 hover:border-white/20'
            }`}
          >
            <div className="text-xs font-semibold text-slate-100">Nano Banana 2.1</div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              gemini-nano-banana-2.1
            </div>
          </button>
        </div>
      </div>

      {/* Size & Aspect Ratio Controls */}
      <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-[#111318] border border-white/8">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-200">Image Resolution</span>
            <span className="text-[11px] font-mono text-blue-400">{imageSize}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {IMAGE_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onChangeImageSize(sz)}
                className={`py-1.5 text-xs font-mono rounded-md border transition-colors ${
                  imageSize === sz
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                    : 'bg-[#171A21] border-white/8 text-slate-400 hover:text-slate-200'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-white/6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-200">Aspect Ratio</span>
            <span className="text-[11px] font-mono text-blue-400">{aspectRatio}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeAspectRatio(ratio)}
                className={`py-1.5 text-[11px] font-mono rounded-md border transition-colors ${
                  aspectRatio === ratio
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                    : 'bg-[#171A21] border-white/8 text-slate-400 hover:text-slate-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reference Input & Prompt */}
      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[#111318] border border-white/8 cursor-pointer">
          <div>
            <div className="text-xs font-medium text-slate-200">
              {mode === 'diffuse-texture'
                ? 'Guide with Baked Diffuse Map'
                : 'Guide with Live 3D Viewport'}
            </div>
            <div className="text-[11px] text-slate-500">
              Send current asset image as multimodal reference
            </div>
          </div>
          <input
            type="checkbox"
            checked={useReference}
            onChange={(e) => onChangeUseReference(e.target.checked)}
            className="w-4 h-4 accent-blue-600 rounded"
          />
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Prompt
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe surface material, patina, or studio lighting..."
            className="w-full p-2.5 rounded-lg bg-[#111318] border border-white/12 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS[mode].map((qp) => (
            <button
              key={qp.label}
              type="button"
              onClick={() => setPrompt(qp.prompt)}
              className="px-2.5 py-1 text-[11px] rounded-md bg-[#111318] border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition-colors"
            >
              {qp.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-slate-500 text-xs font-semibold text-white transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>{isGenerating ? 'Generating Image...' : 'Generate Image'}</span>
        </button>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Generated Gallery */}
      {gallery.length > 0 && (
        <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300">
              Generated Outputs ({gallery.length})
            </h3>
            {activeCustomDiffuseUrl && (
              <button
                type="button"
                onClick={() => onApplyDiffuse(null)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore Baked Map</span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {gallery.map((item) => {
              const isApplied = activeCustomDiffuseUrl === item.imageDataUrl;
              return (
                <div
                  key={item.id}
                  className="rounded-xl overflow-hidden bg-[#111318] border border-white/10 flex flex-col"
                >
                  <img
                    src={item.imageDataUrl}
                    alt={item.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-48 object-cover bg-[#0F1116]"
                  />
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>{item.imageSize} · {item.aspectRatio}</span>
                      <span className="truncate max-w-[160px]">{item.model}</span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{item.prompt}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onApplyDiffuse(isApplied ? null : item)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                          isApplied
                            ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {isApplied && <Check className="w-3.5 h-3.5" />}
                        <span>{isApplied ? 'Applied to Mesh' : 'Apply as Diffuse'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadImage(item.imageDataUrl, item.id)}
                        className="p-1.5 rounded-md bg-[#171A21] border border-white/10 text-slate-300 hover:text-white"
                        title="Download PNG"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
};
