import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { InspectPanel } from './components/panels/InspectPanel';
import { RetopoPanel } from './components/panels/RetopoPanel';
import { BakePanel } from './components/panels/BakePanel';
import { AiStudioPanel } from './components/panels/AiStudioPanel';
import { ExportModal } from './components/ExportModal';
import { createSampleAsset } from './engine/samples';
import { importMeshFile } from './engine/meshLoaders';
import { runRetopologyPipeline } from './engine/retopology';
import { bakeNormalAndDiffuseMaps } from './engine/baker';
import {
  AiAspectRatio,
  AiGeneratedItem,
  AiImageSize,
  AiModelId,
  AiStudioMode,
  BakeOptions,
  BakedMapsResult,
  RetopoOptions,
  RetopoResult,
  SamplePresetId,
  ShadingMode,
  SourceAsset,
  ViewportViewMode,
  WorkflowTab,
} from './types/studio';

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);

  const [activeTab, setActiveTab] = useState<WorkflowTab>('inspect');
  const [sourceAsset, setSourceAsset] = useState<SourceAsset | null>(null);
  const [activePresetId, setActivePresetId] = useState<SamplePresetId | null>('medallion');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Retopology state
  const [retopoOptions, setRetopoOptions] = useState<RetopoOptions>({
    targetRatio: 0.08,
    preserveBoundaries: true,
    smoothingPasses: 1,
    angleThreshold: 42,
    uvMargin: 0.014,
  });
  const [isRetopologizing, setIsRetopologizing] = useState(false);
  const [retopoProgress, setRetopoProgress] = useState(0);
  const [retopoLabel, setRetopoLabel] = useState('');
  const [retopoResult, setRetopoResult] = useState<RetopoResult | null>(null);

  // Baking state
  const [bakeOptions, setBakeOptions] = useState<BakeOptions>({
    resolution: 1024,
    cageDistance: 0.14,
    edgePadding: 8,
    supersample: 1,
  });
  const [isBaking, setIsBaking] = useState(false);
  const [bakeProgress, setBakeProgress] = useState(0);
  const [bakeLabel, setBakeLabel] = useState('');
  const [bakedMaps, setBakedMaps] = useState<BakedMapsResult | null>(null);

  // Viewport state
  const [viewMode, setViewMode] = useState<ViewportViewMode>('high-poly');
  const [shadingMode, setShadingMode] = useState<ShadingMode>('pbr');
  const [showWireframe, setShowWireframe] = useState(false);

  // AI Studio state
  const [aiMode, setAiMode] = useState<AiStudioMode>('diffuse-texture');
  const [aiModel, setAiModel] = useState<AiModelId>('gemini-3-pro-image-preview');
  const [aiImageSize, setAiImageSize] = useState<AiImageSize>('1K');
  const [aiAspectRatio, setAiAspectRatio] = useState<AiAspectRatio>('1:1');
  const [aiUseReference, setAiUseReference] = useState(true);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiGallery, setAiGallery] = useState<AiGeneratedItem[]>([]);
  const [customDiffuseUrl, setCustomDiffuseUrl] = useState<string | null>(null);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);

  // Load initial high-poly sculpt preset
  useEffect(() => {
    const initial = createSampleAsset('medallion');
    setSourceAsset(initial);
    return () => {
      initial.geometry.dispose();
    };
  }, []);

  const resetDerivedAssets = useCallback(() => {
    setRetopoResult((prev) => {
      prev?.geometry.dispose();
      return null;
    });
    setBakedMaps(null);
    setCustomDiffuseUrl(null);
    setViewMode('high-poly');
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: SamplePresetId) => {
      setImportError(null);
      resetDerivedAssets();
      setActivePresetId(presetId);
      setSourceAsset((prev) => {
        prev?.geometry.dispose();
        return createSampleAsset(presetId);
      });
    },
    [resetDerivedAssets]
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setImportError(null);
      try {
        const asset = await importMeshFile(file);
        resetDerivedAssets();
        setActivePresetId(null);
        setSourceAsset((prev) => {
          prev?.geometry.dispose();
          return asset;
        });
      } catch (err: unknown) {
        setImportError(
          err instanceof Error ? err.message : 'Failed to parse uploaded 3D file.'
        );
      } finally {
        setIsImporting(false);
      }
    },
    [resetDerivedAssets]
  );

  const executeRetopology = useCallback(async (): Promise<RetopoResult | null> => {
    if (!sourceAsset) return null;
    setIsRetopologizing(true);
    setRetopoProgress(0);
    setRetopoLabel('Initializing QEM solver...');
    try {
      const result = await runRetopologyPipeline(
        sourceAsset.geometry,
        sourceAsset.name,
        retopoOptions,
        (pct, stage) => {
          setRetopoProgress(pct);
          setRetopoLabel(stage);
        }
      );
      setRetopoResult((prev) => {
        prev?.geometry.dispose();
        return result;
      });
      setBakedMaps(null);
      setCustomDiffuseUrl(null);
      setViewMode('split');
      return result;
    } finally {
      setIsRetopologizing(false);
    }
  }, [sourceAsset, retopoOptions]);

  const executeBake = useCallback(async () => {
    if (!sourceAsset) return;
    let activeRetopo = retopoResult;
    if (!activeRetopo) {
      activeRetopo = await executeRetopology();
    }
    if (!activeRetopo) return;

    setIsBaking(true);
    setBakeProgress(0);
    setBakeLabel('Preparing BVH baker...');
    try {
      const result = await bakeNormalAndDiffuseMaps(
        sourceAsset.geometry,
        sourceAsset.diffuseImageData,
        activeRetopo.geometry,
        activeRetopo.uvTriangles,
        bakeOptions,
        (pct, stage) => {
          setBakeProgress(pct);
          setBakeLabel(stage);
        }
      );
      setBakedMaps(result);
      setCustomDiffuseUrl(null);
      setViewMode('split');
      setShadingMode('pbr');
    } finally {
      setIsBaking(false);
    }
  }, [sourceAsset, retopoResult, bakeOptions, executeRetopology]);

  const handleGenerateAiImage = useCallback(
    async (prompt: string) => {
      setAiError(null);
      setIsAiGenerating(true);
      try {
        let referenceImageBase64: string | undefined;
        if (aiUseReference) {
          if (aiMode === 'diffuse-texture' && bakedMaps?.diffuseDataUrl) {
            referenceImageBase64 = bakedMaps.diffuseDataUrl;
          } else {
            const shot = viewportRef.current?.captureFrame();
            if (shot) referenceImageBase64 = shot;
          }
        }

        const resp = await fetch('/api/ai/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: aiModel,
            imageSize: aiImageSize,
            aspectRatio: aiAspectRatio,
            mode: aiMode,
            referenceImageBase64,
            referenceMimeType: 'image/png',
          }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error || 'Image generation failed.');
        }

        const item: AiGeneratedItem = {
          id: `ai-${Date.now()}`,
          prompt,
          mode: aiMode,
          model: data.model ?? aiModel,
          imageSize: data.imageSize ?? aiImageSize,
          aspectRatio: data.aspectRatio ?? aiAspectRatio,
          imageDataUrl: data.imageDataUrl,
          createdAt: Date.now(),
          appliedToMesh: false,
        };

        setAiGallery((prev) => [item, ...prev]);
      } catch (err: unknown) {
        setAiError(err instanceof Error ? err.message : 'Failed to generate image.');
      } finally {
        setIsAiGenerating(false);
      }
    },
    [aiMode, aiModel, aiImageSize, aiAspectRatio, aiUseReference, bakedMaps]
  );

  const handleApplyAiDiffuse = useCallback(
    async (item: AiGeneratedItem | null) => {
      if (!item) {
        setCustomDiffuseUrl(null);
        return;
      }
      if (!retopoResult) {
        await executeRetopology();
      }
      setCustomDiffuseUrl(item.imageDataUrl);
      setViewMode(bakedMaps ? 'baked-pbr' : 'low-poly');
      setShadingMode('pbr');
    },
    [retopoResult, bakedMaps, executeRetopology]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#111318] text-[#F1F5F9] overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenExport={() => setExportOpen(true)}
        canExport={Boolean(sourceAsset)}
      />

      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Dominant Unobstructed 3D Viewport */}
        <div className="flex-1 min-w-0 min-h-[340px] lg:min-h-0 flex flex-col">
          <Viewport3D
            ref={viewportRef}
            highPolyGeometry={sourceAsset?.geometry ?? null}
            lowPolyGeometry={retopoResult?.geometry ?? null}
            normalCanvas={bakedMaps?.normalCanvas ?? null}
            diffuseCanvas={bakedMaps?.diffuseCanvas ?? null}
            customDiffuseDataUrl={customDiffuseUrl}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            shadingMode={shadingMode}
            onShadingModeChange={setShadingMode}
            showWireframe={showWireframe}
            onToggleWireframe={() => setShowWireframe((w) => !w)}
            highPolyTris={sourceAsset?.stats.triangles ?? 0}
            lowPolyTris={retopoResult?.stats.triangles ?? 0}
            hasBakedMaps={Boolean(bakedMaps || customDiffuseUrl)}
          />
        </div>

        {/* Docked Right Workbench Rail (never occludes 3D viewport center) */}
        <aside className="w-full lg:w-[390px] shrink-0 h-[44vh] lg:h-full bg-[#171A21] border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto p-5 flex flex-col">
          {activeTab === 'inspect' && (
            <InspectPanel
              sourceAsset={sourceAsset}
              activePresetId={activePresetId}
              isImporting={isImporting}
              importError={importError}
              onSelectPreset={handleSelectPreset}
              onUploadFile={handleUploadFile}
              onNextStep={() => setActiveTab('retopology')}
            />
          )}

          {activeTab === 'retopology' && (
            <RetopoPanel
              sourceAsset={sourceAsset}
              options={retopoOptions}
              onChangeOptions={setRetopoOptions}
              isProcessing={isRetopologizing}
              progress={retopoProgress}
              progressLabel={retopoLabel}
              retopoResult={retopoResult}
              onRunRetopo={executeRetopology}
              onNextStep={() => setActiveTab('bake')}
            />
          )}

          {activeTab === 'bake' && (
            <BakePanel
              hasSource={Boolean(sourceAsset)}
              retopoResult={retopoResult}
              options={bakeOptions}
              onChangeOptions={setBakeOptions}
              isBaking={isBaking}
              progress={bakeProgress}
              progressLabel={bakeLabel}
              bakedMaps={bakedMaps}
              onRunBake={executeBake}
              onNextStep={() => setActiveTab('ai-studio')}
            />
          )}

          {activeTab === 'ai-studio' && (
            <AiStudioPanel
              mode={aiMode}
              onChangeMode={setAiMode}
              model={aiModel}
              onChangeModel={setAiModel}
              imageSize={aiImageSize}
              onChangeImageSize={setAiImageSize}
              aspectRatio={aiAspectRatio}
              onChangeAspectRatio={setAiAspectRatio}
              useReference={aiUseReference}
              onChangeUseReference={setAiUseReference}
              isGenerating={isAiGenerating}
              error={aiError}
              gallery={aiGallery}
              activeCustomDiffuseUrl={customDiffuseUrl}
              onGenerate={handleGenerateAiImage}
              onApplyDiffuse={handleApplyAiDiffuse}
            />
          )}
        </aside>
      </main>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        sourceAsset={sourceAsset}
        retopoResult={retopoResult}
        bakedMaps={bakedMaps}
        onAutoPrepare={executeBake}
      />
    </div>
  );
}
