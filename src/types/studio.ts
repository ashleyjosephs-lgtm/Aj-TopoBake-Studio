import * as THREE from 'three';

export type WorkflowTab = 'inspect' | 'retopology' | 'bake' | 'ai-studio';

export type ViewportViewMode = 'high-poly' | 'low-poly' | 'split' | 'baked-pbr';

export type ShadingMode = 'pbr' | 'clay' | 'normals' | 'uv-checker';

export type SamplePresetId = 'medallion' | 'bust' | 'valve';

export type AiModelId = 'gemini-3-pro-image-preview' | 'gemini-nano-banana-2.1';
export type AiImageSize = '1K' | '2K' | '4K';
export type AiAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '21:9';
export type AiStudioMode = 'diffuse-texture' | 'studio-render';

export interface MeshStats {
  name: string;
  format: string;
  triangles: number;
  vertices: number;
  hasUVs: boolean;
  hasVertexColors: boolean;
  hasDiffuseTexture: boolean;
  boundsSize: [number, number, number];
}

export interface SourceAsset {
  id: string;
  name: string;
  format: string;
  geometry: THREE.BufferGeometry;
  diffuseImageData: ImageData | null;
  stats: MeshStats;
}

export interface RetopoOptions {
  targetRatio: number; // 0.02 to 0.50
  preserveBoundaries: boolean;
  smoothingPasses: number; // 0 to 3
  angleThreshold: number; // 25 to 75 degrees for UV chart segmentation
  uvMargin: number; // 0.005 to 0.03
}

export interface UvTriangleOverlay {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
  chartId: number;
}

export interface RetopoResult {
  geometry: THREE.BufferGeometry;
  stats: MeshStats;
  chartCount: number;
  uvCoverage: number; // 0 to 1
  uvTriangles: UvTriangleOverlay[];
  durationMs: number;
}

export interface BakeOptions {
  resolution: 512 | 1024 | 2048;
  cageDistance: number; // 0.02 to 0.35
  edgePadding: number; // 0 to 16 px
  supersample: 1 | 2;
}

export interface BakedMapsResult {
  normalCanvas: HTMLCanvasElement;
  diffuseCanvas: HTMLCanvasElement;
  uvOverlayCanvas: HTMLCanvasElement;
  normalDataUrl: string;
  diffuseDataUrl: string;
  uvOverlayDataUrl: string;
  resolution: number;
  hitRate: number; // 0 to 1
  durationMs: number;
}

export interface AiGeneratedItem {
  id: string;
  prompt: string;
  mode: AiStudioMode;
  model: AiModelId;
  imageSize: AiImageSize;
  aspectRatio: AiAspectRatio;
  imageDataUrl: string;
  createdAt: number;
  appliedToMesh: boolean;
}
