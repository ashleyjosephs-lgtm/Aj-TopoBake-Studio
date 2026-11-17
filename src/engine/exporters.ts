import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import JSZip from 'jszip';

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode canvas to PNG.'));
    }, 'image/png');
  });
}

function buildExportMesh(
  geometry: THREE.BufferGeometry,
  diffuseCanvas?: HTMLCanvasElement | null,
  normalCanvas?: HTMLCanvasElement | null
): { mesh: THREE.Mesh; cleanup: () => void } {
  const geo = geometry.clone();
  const textures: THREE.Texture[] = [];

  const matOptions: THREE.MeshStandardMaterialParameters = {
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.12,
  };

  if (diffuseCanvas) {
    const mapTex = new THREE.CanvasTexture(diffuseCanvas);
    mapTex.colorSpace = THREE.SRGBColorSpace;
    mapTex.flipY = true;
    mapTex.needsUpdate = true;
    matOptions.map = mapTex;
    textures.push(mapTex);
  }

  if (normalCanvas) {
    const normTex = new THREE.CanvasTexture(normalCanvas);
    normTex.flipY = true;
    normTex.needsUpdate = true;
    matOptions.normalMap = normTex;
    textures.push(normTex);
  }

  const mat = new THREE.MeshStandardMaterial(matOptions);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Retopologized_Asset';

  return {
    mesh,
    cleanup: () => {
      geo.dispose();
      mat.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}

export async function generateGlbBuffer(
  geometry: THREE.BufferGeometry,
  diffuseCanvas?: HTMLCanvasElement | null,
  normalCanvas?: HTMLCanvasElement | null
): Promise<ArrayBuffer> {
  const { mesh, cleanup } = buildExportMesh(geometry, diffuseCanvas, normalCanvas);
  const exporter = new GLTFExporter();
  try {
    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        mesh,
        (result) => {
          if (result instanceof ArrayBuffer) resolve(result);
          else reject(new Error('Expected binary GLB ArrayBuffer output.'));
        },
        reject,
        { binary: true }
      );
    });
    return glb;
  } finally {
    cleanup();
  }
}

export function generateObjAndMtl(
  geometry: THREE.BufferGeometry,
  assetSlug: string
): { objText: string; mtlText: string } {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = assetSlug;
  const exporter = new OBJExporter();
  const rawObj = exporter.parse(mesh);

  const mtlFilename = `${assetSlug}.mtl`;
  const objText = `mtllib ${mtlFilename}\nusemtl ${assetSlug}_mat\n${rawObj}`;
  const mtlText = [
    `# TopoBake Studio Material`,
    `newmtl ${assetSlug}_mat`,
    `Ka 0.100 0.100 0.100`,
    `Kd 1.000 1.000 1.000`,
    `Ks 0.250 0.250 0.250`,
    `Ns 64.0`,
    `d 1.0`,
    `illum 2`,
    `map_Kd ${assetSlug}_diffuse.png`,
    `map_Bump ${assetSlug}_normal.png`,
    `bump ${assetSlug}_normal.png`,
    '',
  ].join('\n');

  return { objText, mtlText };
}

export function generateFbxAscii(
  geometry: THREE.BufferGeometry,
  assetSlug: string
): string {
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  const index = geometry.getIndex();

  const vertCount = posAttr.count;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(vertCount / 3);

  const verticesArr: string[] = [];
  for (let i = 0; i < vertCount; i++) {
    verticesArr.push(
      posAttr.getX(i).toFixed(6),
      posAttr.getY(i).toFixed(6),
      posAttr.getZ(i).toFixed(6)
    );
  }

  const polyIndicesArr: number[] = [];
  const normalsArr: string[] = [];
  const uvsArr: string[] = [];
  const uvIndexArr: number[] = [];

  // Deduplicate UVs per vertex index for clean FBX LayerElementUV
  for (let i = 0; i < vertCount; i++) {
    if (uvAttr) {
      uvsArr.push(uvAttr.getX(i).toFixed(6), uvAttr.getY(i).toFixed(6));
    } else {
      uvsArr.push('0.000000', '0.000000');
    }
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    // FBX encodes the last vertex index of a polygon as bitwise NOT (~idx)
    polyIndicesArr.push(i0, i1, ~i2);
    uvIndexArr.push(i0, i1, i2);

    if (normAttr) {
      normalsArr.push(
        normAttr.getX(i0).toFixed(6),
        normAttr.getY(i0).toFixed(6),
        normAttr.getZ(i0).toFixed(6),
        normAttr.getX(i1).toFixed(6),
        normAttr.getY(i1).toFixed(6),
        normAttr.getZ(i1).toFixed(6),
        normAttr.getX(i2).toFixed(6),
        normAttr.getY(i2).toFixed(6),
        normAttr.getZ(i2).toFixed(6)
      );
    } else {
      normalsArr.push('0', '1', '0', '0', '1', '0', '0', '1', '0');
    }
  }

  const geomId = 100001;
  const modelId = 200001;
  const matId = 300001;
  const texDiffId = 400001;
  const texNormId = 400002;
  const vidDiffId = 500001;
  const vidNormId = 500002;

  return `; FBX 7.4.0 project file
; Generated by TopoBake Studio
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreator: "TopoBake Studio FBX Exporter"
}

GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UpAxisSign", "int", "Integer", "",1
\t\tP: "FrontAxis", "int", "Integer", "",2
\t\tP: "FrontAxisSign", "int", "Integer", "",1
\t\tP: "CoordAxis", "int", "Integer", "",0
\t\tP: "CoordAxisSign", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",100
\t}
}

Documents:  {
\tCount: 1
\tDocument: 1000, "", "Scene" {
\t\tProperties70:  {
\t\t\tP: "SourceObject", "object", "", ""
\t\t\tP: "ActiveAnimStackName", "KString", "", "", ""
\t\t}
\t\tRootNode: 0
\t}
}

Definitions:  {
\tVersion: 100
\tCount: 5
\tObjectType: "Geometry" {
\t\tCount: 1
\t}
\tObjectType: "Model" {
\t\tCount: 1
\t}
\tObjectType: "Material" {
\t\tCount: 1
\t}
\tObjectType: "Texture" {
\t\tCount: 2
\t}
\tObjectType: "Video" {
\t\tCount: 2
\t}
}

Objects:  {
\tGeometry: ${geomId}, "Geometry::${assetSlug}_Geo", "Mesh" {
\t\tVertices: *${verticesArr.length} {
\t\t\ta: ${verticesArr.join(',')}
\t\t}
\t\tPolygonVertexIndex: *${polyIndicesArr.length} {
\t\t\ta: ${polyIndicesArr.join(',')}
\t\t}
\t\tGeometryVersion: 124
\t\tLayerElementNormal: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tNormals: *${normalsArr.length} {
\t\t\t\ta: ${normalsArr.join(',')}
\t\t\t}
\t\t}
\t\tLayerElementUV: 0 {
\t\t\tVersion: 101
\t\t\tName: "UVMap"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "IndexToDirect"
\t\t\tUV: *${uvsArr.length} {
\t\t\t\ta: ${uvsArr.join(',')}
\t\t\t}
\t\t\tUVIndex: *${uvIndexArr.length} {
\t\t\t\ta: ${uvIndexArr.join(',')}
\t\t\t}
\t\t}
\t\tLayer: 0 {
\t\t\tVersion: 100
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementNormal"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementUV"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t}
\t}
\tModel: ${modelId}, "Model::${assetSlug}", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "ScalingMax", "Vector3D", "Vector", "",0,0,0
\t\t\tP: "DefaultAttributeIndex", "int", "Integer", "",0
\t\t}
\t\tShading: T
\t\tCulling: "CullingOff"
\t}
\tMaterial: ${matId}, "Material::${assetSlug}_Mat", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tMultiLayer: 0
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",0.85,0.85,0.85
\t\t\tP: "SpecularColor", "Color", "", "A",0.25,0.25,0.25
\t\t\tP: "Shininess", "Number", "", "A",32
\t\t}
\t}
\tTexture: ${texDiffId}, "Texture::${assetSlug}_diffuse", "" {
\t\tType: "TextureVideoClip"
\t\tVersion: 202
\t\tTextureName: "Texture::${assetSlug}_diffuse"
\t\tFileName: "${assetSlug}_diffuse.png"
\t\tRelativeFilename: "${assetSlug}_diffuse.png"
\t\tModelUVTranslation: 0,0
\t\tModelUVScaling: 1,1
\t\tTexture_Alpha_Source: "None"
\t}
\tTexture: ${texNormId}, "Texture::${assetSlug}_normal", "" {
\t\tType: "TextureVideoClip"
\t\tVersion: 202
\t\tTextureName: "Texture::${assetSlug}_normal"
\t\tFileName: "${assetSlug}_normal.png"
\t\tRelativeFilename: "${assetSlug}_normal.png"
\t\tModelUVTranslation: 0,0
\t\tModelUVScaling: 1,1
\t\tTexture_Alpha_Source: "None"
\t}
\tVideo: ${vidDiffId}, "Video::${assetSlug}_diffuse.png", "Clip" {
\t\tType: "Clip"
\t\tFileName: "${assetSlug}_diffuse.png"
\t\tRelativeFilename: "${assetSlug}_diffuse.png"
\t}
\tVideo: ${vidNormId}, "Video::${assetSlug}_normal.png", "Clip" {
\t\tType: "Clip"
\t\tFileName: "${assetSlug}_normal.png"
\t\tRelativeFilename: "${assetSlug}_normal.png"
\t}
}

Connections:  {
\tC: "OO",${modelId},0
\tC: "OO",${geomId},${modelId}
\tC: "OO",${matId},${modelId}
\tC: "OP",${texDiffId},${matId},"DiffuseColor"
\tC: "OP",${texNormId},${matId},"NormalMap"
\tC: "OO",${vidDiffId},${texDiffId}
\tC: "OO",${vidNormId},${texNormId}
}
`;
}

export async function exportGlbFile(
  geometry: THREE.BufferGeometry,
  assetSlug: string,
  diffuseCanvas?: HTMLCanvasElement | null,
  normalCanvas?: HTMLCanvasElement | null
): Promise<void> {
  const glb = await generateGlbBuffer(geometry, diffuseCanvas, normalCanvas);
  triggerBlobDownload(new Blob([glb], { type: 'model/gltf-binary' }), `${assetSlug}.glb`);
}

export function exportObjFile(geometry: THREE.BufferGeometry, assetSlug: string): void {
  const { objText, mtlText } = generateObjAndMtl(geometry, assetSlug);
  triggerBlobDownload(new Blob([objText], { type: 'text/plain;charset=utf-8' }), `${assetSlug}.obj`);
  setTimeout(() => {
    triggerBlobDownload(new Blob([mtlText], { type: 'text/plain;charset=utf-8' }), `${assetSlug}.mtl`);
  }, 250);
}

export function exportFbxFile(geometry: THREE.BufferGeometry, assetSlug: string): void {
  const fbxText = generateFbxAscii(geometry, assetSlug);
  triggerBlobDownload(new Blob([fbxText], { type: 'text/plain;charset=utf-8' }), `${assetSlug}.fbx`);
}

export async function exportPngCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await canvasToBlob(canvas);
  triggerBlobDownload(blob, filename);
}

export async function exportZipBundle(params: {
  geometry: THREE.BufferGeometry;
  assetSlug: string;
  diffuseCanvas?: HTMLCanvasElement | null;
  normalCanvas?: HTMLCanvasElement | null;
  uvOverlayCanvas?: HTMLCanvasElement | null;
  report: Record<string, unknown>;
}): Promise<void> {
  const { geometry, assetSlug, diffuseCanvas, normalCanvas, uvOverlayCanvas, report } = params;
  const zip = new JSZip();

  const glb = await generateGlbBuffer(geometry, diffuseCanvas, normalCanvas);
  zip.file(`${assetSlug}.glb`, glb);

  const { objText, mtlText } = generateObjAndMtl(geometry, assetSlug);
  zip.file(`${assetSlug}.obj`, objText);
  zip.file(`${assetSlug}.mtl`, mtlText);

  const fbxText = generateFbxAscii(geometry, assetSlug);
  zip.file(`${assetSlug}.fbx`, fbxText);

  if (diffuseCanvas) {
    zip.file(`${assetSlug}_diffuse.png`, await canvasToBlob(diffuseCanvas));
  }
  if (normalCanvas) {
    zip.file(`${assetSlug}_normal.png`, await canvasToBlob(normalCanvas));
  }
  if (uvOverlayCanvas) {
    zip.file(`${assetSlug}_uv_layout.png`, await canvasToBlob(uvOverlayCanvas));
  }

  zip.file('bake_report.json', JSON.stringify(report, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(blob, `${assetSlug}_topobake_bundle.zip`);
}
