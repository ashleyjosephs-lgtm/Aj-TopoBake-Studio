import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Columns2,
  Grid3x3,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { ShadingMode, ViewportViewMode } from '../types/studio';

export interface Viewport3DHandle {
  captureFrame: () => string | null;
  resetCamera: () => void;
}

interface Viewport3DProps {
  highPolyGeometry: THREE.BufferGeometry | null;
  lowPolyGeometry: THREE.BufferGeometry | null;
  normalCanvas: HTMLCanvasElement | null;
  diffuseCanvas: HTMLCanvasElement | null;
  customDiffuseDataUrl: string | null;
  viewMode: ViewportViewMode;
  onViewModeChange: (mode: ViewportViewMode) => void;
  shadingMode: ShadingMode;
  onShadingModeChange: (mode: ShadingMode) => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  highPolyTris: number;
  lowPolyTris: number;
  hasBakedMaps: boolean;
}

function createUvCheckerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cells = 8;
  const cellSize = size / cells;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const even = (x + y) % 2 === 0;
      ctx.fillStyle = even ? '#2B3240' : '#E2E8F0';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      if (even) {
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(x * cellSize + 4, y * cellSize + 4, 8, 8);
      }
    }
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(size, i * cellSize);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size * 0.5
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  function Viewport3D(
    {
      highPolyGeometry,
      lowPolyGeometry,
      normalCanvas,
      diffuseCanvas,
      customDiffuseDataUrl,
      viewMode,
      onViewModeChange,
      shadingMode,
      onShadingModeChange,
      showWireframe,
      onToggleWireframe,
      highPolyTris,
      lowPolyTris,
      hasBakedMaps,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [dockCollapsed, setDockCollapsed] = useState(false);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [isDraggingSplit, setIsDraggingSplit] = useState(false);
    const [contextLost, setContextLost] = useState(false);

    const viewStateRef = useRef({
      viewMode,
      shadingMode,
      showWireframe,
      splitRatio,
    });
    viewStateRef.current = { viewMode, shadingMode, showWireframe, splitRatio };

    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      highMesh: THREE.Mesh;
      lowMesh: THREE.Mesh;
      highWire: THREE.Mesh;
      lowWire: THREE.Mesh;
      shadowPlane: THREE.Mesh;
      gridHelper: THREE.GridHelper;
      checkerTex: THREE.CanvasTexture;
      normalTex: THREE.CanvasTexture | null;
      diffuseTex: THREE.CanvasTexture | null;
      customDiffuseTex: THREE.Texture | null;
      clayMat: THREE.MeshStandardMaterial;
      highClayMat: THREE.MeshStandardMaterial;
      normalMat: THREE.MeshNormalMaterial;
      checkerMat: THREE.MeshStandardMaterial;
      highPbrMat: THREE.MeshStandardMaterial;
      lowPbrMat: THREE.MeshStandardMaterial;
      requestRender: () => void;
      resetCamera: () => void;
      captureFrame: () => string | null;
    } | null>(null);

    // Keyboard shortcut 'H' to toggle cinema/zen dock
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (
          e.key.toLowerCase() === 'h' &&
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          setDockCollapsed((prev) => !prev);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Initialize WebGL Scene once
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = (() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      container.appendChild(renderer.domElement);

      const handleContextLost = (ev: Event) => {
        ev.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#13161D');
      scene.fog = new THREE.Fog('#13161D', 7.5, 18);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();

      const camera = new THREE.PerspectiveCamera(
        38,
        (container.clientWidth || 800) / (container.clientHeight || 600),
        0.05,
        50
      );
      camera.position.set(2.4, 1.45, 3.0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 0.8;
      controls.maxDistance = 10;
      controls.target.set(0, 0, 0);

      // 3-Point Studio Lighting Rig
      const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.1);
      keyLight.position.set(3.2, 4.4, 3.4);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -2.5;
      keyLight.shadow.camera.right = 2.5;
      keyLight.shadow.camera.top = 2.5;
      keyLight.shadow.camera.bottom = -2.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const hemiFill = new THREE.HemisphereLight(0xbcd2f0, 0x1e222b, 0.85);
      scene.add(hemiFill);

      const rimLight = new THREE.DirectionalLight(0xc2d8ff, 1.15);
      rimLight.position.set(-3.2, 2.2, -3.5);
      scene.add(rimLight);

      // Contact Shadow & Studio Floor Grid
      const shadowTex = createContactShadowTexture();
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 3.4),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
        })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = -1.02;
      scene.add(shadowPlane);

      const gridHelper = new THREE.GridHelper(10, 24, 0x2f384a, 0x1e232e);
      gridHelper.position.y = -1.04;
      (gridHelper.material as THREE.Material).transparent = true;
      (gridHelper.material as THREE.Material).opacity = 0.55;
      scene.add(gridHelper);

      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      const checkerTex = createUvCheckerTexture(maxAnisotropy);

      // Shared Materials
      const highPbrMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.18,
      });

      const lowPbrMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.44,
        metalness: 0.18,
      });

      const clayMat = new THREE.MeshStandardMaterial({
        color: 0xc2c8d2,
        roughness: 0.58,
        metalness: 0.05,
      });

      const highClayMat = new THREE.MeshStandardMaterial({
        color: 0xc2c8d2,
        roughness: 0.58,
        metalness: 0.05,
      });

      const normalMat = new THREE.MeshNormalMaterial();

      const checkerMat = new THREE.MeshStandardMaterial({
        map: checkerTex,
        roughness: 0.55,
        metalness: 0.05,
      });

      const wireMatHigh = new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        wireframe: true,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const wireMatLow = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });

      const emptyGeo = new THREE.BufferGeometry();
      const highMesh = new THREE.Mesh(emptyGeo, highPbrMat);
      highMesh.castShadow = true;
      highMesh.receiveShadow = true;
      scene.add(highMesh);

      const lowMesh = new THREE.Mesh(emptyGeo, lowPbrMat);
      lowMesh.castShadow = true;
      lowMesh.receiveShadow = true;
      lowMesh.visible = false;
      scene.add(lowMesh);

      const highWire = new THREE.Mesh(emptyGeo, wireMatHigh);
      highWire.visible = false;
      scene.add(highWire);

      const lowWire = new THREE.Mesh(emptyGeo, wireMatLow);
      lowWire.visible = false;
      scene.add(lowWire);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Render pipeline with coalesced on-demand pacing & Software WebGL fenceSync
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let camAnimActive = false;
      const camTargetPos = new THREE.Vector3(2.4, 1.45, 3.0);
      const camTargetLook = new THREE.Vector3(0, 0, 0);
      let lastTime = performance.now();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      function renderSceneFrame() {
        const w = container?.clientWidth || 800;
        const h = container?.clientHeight || 600;
        const { viewMode: vm, showWireframe: wf, splitRatio: sr } = viewStateRef.current;

        const hasLow =
          lowMesh.geometry !== emptyGeo &&
          (lowMesh.geometry.getAttribute('position')?.count ?? 0) > 0;

        if (vm === 'split' && hasLow) {
          const splitPx = Math.round(w * sr);

          renderer.setScissorTest(true);

          // Left half: High-Poly Source
          highMesh.visible = true;
          highWire.visible = wf;
          lowMesh.visible = false;
          lowWire.visible = false;
          renderer.setViewport(0, 0, w, h);
          renderer.setScissor(0, 0, splitPx, h);
          renderer.render(scene, camera);

          // Right half: Low-Poly / Baked Asset
          highMesh.visible = false;
          highWire.visible = false;
          lowMesh.visible = true;
          lowWire.visible = wf;
          renderer.setViewport(0, 0, w, h);
          renderer.setScissor(splitPx, 0, w - splitPx, h);
          renderer.render(scene, camera);

          renderer.setScissorTest(false);
        } else if ((vm === 'low-poly' || vm === 'baked-pbr') && hasLow) {
          highMesh.visible = false;
          highWire.visible = false;
          lowMesh.visible = true;
          lowWire.visible = wf;
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, w, h);
          renderer.render(scene, camera);
        } else {
          highMesh.visible = true;
          highWire.visible = wf;
          lowMesh.visible = false;
          lowWire.visible = false;
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, w, h);
          renderer.render(scene, camera);
        }
      }

      function requestRender() {
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame((now) => {
          renderDirty = false;
          const dt = Math.min(0.1, (now - lastTime) / 1000);
          lastTime = now;

          if (camAnimActive) {
            camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetPos.x, 8, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetPos.y, 8, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, camTargetPos.z, 8, dt);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, camTargetLook.x, 8, dt);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, camTargetLook.y, 8, dt);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, camTargetLook.z, 8, dt);
            if (camera.position.distanceTo(camTargetPos) < 0.01) {
              camAnimActive = false;
            } else {
              renderDirty = true;
            }
          }

          controls.update();
          renderSceneFrame();

          const done = () => {
            renderBusy = false;
            if (renderDirty) requestRender();
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      }

      const onControlStart = () => {
        camAnimActive = false;
      };
      const onControlChange = () => {
        requestRender();
      };
      controls.addEventListener('start', onControlStart);
      controls.addEventListener('change', onControlChange);

      const resizeObserver = new ResizeObserver(() => {
        if (!container) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      });
      resizeObserver.observe(container);

      const resetCamera = () => {
        camTargetPos.set(2.4, 1.45, 3.0);
        camTargetLook.set(0, 0, 0);
        camAnimActive = true;
        requestRender();
      };

      const captureFrame = (): string | null => {
        renderSceneFrame();
        return renderer.domElement.toDataURL('image/png');
      };

      engineRef.current = {
        renderer,
        scene,
        camera,
        controls,
        highMesh,
        lowMesh,
        highWire,
        lowWire,
        shadowPlane,
        gridHelper,
        checkerTex,
        normalTex: null,
        diffuseTex: null,
        customDiffuseTex: null,
        clayMat,
        highClayMat,
        normalMat,
        checkerMat,
        highPbrMat,
        lowPbrMat,
        requestRender,
        resetCamera,
        captureFrame,
      };

      requestRender();

      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        controls.removeEventListener('start', onControlStart);
        controls.removeEventListener('change', onControlChange);
        controls.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

        checkerTex.dispose();
        shadowTex.dispose();
        clayMat.dispose();
        highClayMat.dispose();
        normalMat.dispose();
        checkerMat.dispose();
        highPbrMat.dispose();
        lowPbrMat.dispose();
        wireMatHigh.dispose();
        wireMatLow.dispose();
        emptyGeo.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        engineRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      captureFrame: () => engineRef.current?.captureFrame() ?? null,
      resetCamera: () => engineRef.current?.resetCamera(),
    }));

    // Sync High-Poly Geometry
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng || !highPolyGeometry) return;

      eng.highMesh.geometry = highPolyGeometry;
      eng.highWire.geometry = highPolyGeometry;
      eng.highPbrMat.vertexColors = Boolean(highPolyGeometry.getAttribute('color'));
      eng.highPbrMat.needsUpdate = true;

      highPolyGeometry.computeBoundingBox();
      const minY = highPolyGeometry.boundingBox?.min.y ?? -1;
      eng.shadowPlane.position.y = minY - 0.02;
      eng.gridHelper.position.y = minY - 0.04;
      eng.requestRender();
    }, [highPolyGeometry]);

    // Sync Low-Poly Geometry
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;
      if (lowPolyGeometry) {
        eng.lowMesh.geometry = lowPolyGeometry;
        eng.lowWire.geometry = lowPolyGeometry;
      } else {
        const empty = new THREE.BufferGeometry();
        eng.lowMesh.geometry = empty;
        eng.lowWire.geometry = empty;
      }
      eng.requestRender();
    }, [lowPolyGeometry]);

    // Sync Baked Normal & Diffuse Canvas Textures
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.normalTex) {
        eng.normalTex.dispose();
        eng.normalTex = null;
      }
      if (normalCanvas) {
        const tex = new THREE.CanvasTexture(normalCanvas);
        tex.anisotropy = eng.renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;
        eng.normalTex = tex;
      }

      if (eng.diffuseTex) {
        eng.diffuseTex.dispose();
        eng.diffuseTex = null;
      }
      if (diffuseCanvas) {
        const tex = new THREE.CanvasTexture(diffuseCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = eng.renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;
        eng.diffuseTex = tex;
      }

      eng.lowPbrMat.normalMap = eng.normalTex;
      eng.lowPbrMat.map = eng.customDiffuseTex ?? eng.diffuseTex;
      eng.lowPbrMat.color.setHex(eng.lowPbrMat.map ? 0xffffff : 0xc2c8d2);
      eng.lowPbrMat.needsUpdate = true;

      eng.clayMat.normalMap = eng.normalTex;
      eng.clayMat.needsUpdate = true;

      eng.requestRender();
    }, [normalCanvas, diffuseCanvas]);

    // Sync AI-generated Custom Diffuse Texture override
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (eng.customDiffuseTex) {
        eng.customDiffuseTex.dispose();
        eng.customDiffuseTex = null;
      }

      if (!customDiffuseDataUrl) {
        eng.lowPbrMat.map = eng.diffuseTex;
        eng.lowPbrMat.color.setHex(eng.diffuseTex ? 0xffffff : 0xc2c8d2);
        eng.lowPbrMat.needsUpdate = true;
        eng.requestRender();
        return;
      }

      const loader = new THREE.TextureLoader();
      loader.load(customDiffuseDataUrl, (tex) => {
        if (!engineRef.current) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = eng.renderer.capabilities.getMaxAnisotropy();
        tex.needsUpdate = true;
        eng.customDiffuseTex = tex;
        eng.lowPbrMat.map = tex;
        eng.lowPbrMat.color.setHex(0xffffff);
        eng.lowPbrMat.needsUpdate = true;
        eng.requestRender();
      });
    }, [customDiffuseDataUrl]);

    // Sync Shading & View Modes
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (shadingMode === 'clay') {
        eng.highMesh.material = eng.highClayMat;
        eng.lowMesh.material = eng.clayMat;
      } else if (shadingMode === 'normals') {
        eng.highMesh.material = eng.normalMat;
        eng.lowMesh.material = eng.normalMat;
      } else if (shadingMode === 'uv-checker') {
        eng.highMesh.material = eng.checkerMat;
        eng.lowMesh.material = eng.checkerMat;
      } else {
        eng.highMesh.material = eng.highPbrMat;
        eng.lowMesh.material = eng.lowPbrMat;
      }

      eng.requestRender();
    }, [shadingMode, viewMode, showWireframe, splitRatio]);

    // Split slider dragging
    const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingSplit || !mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      const ratio = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0.1, 0.9);
      setSplitRatio(ratio);
    };

    const reductionPct =
      highPolyTris > 0 && lowPolyTris > 0
        ? (((highPolyTris - lowPolyTris) / highPolyTris) * 100).toFixed(1)
        : null;

    return (
      <div
        className="relative flex-1 h-full overflow-hidden bg-[#13161D] select-none"
        onPointerMove={handleSplitPointerMove}
        onPointerUp={() => setIsDraggingSplit(false)}
        onPointerLeave={() => setIsDraggingSplit(false)}
      >
        {/* Dedicated Isolated WebGL Container */}
        <div ref={mountRef} className="w-full h-full" />

        {contextLost && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#13161D] text-slate-300 z-20 p-6 text-center">
            <p className="text-sm font-medium mb-2">WebGL Context Interrupted</p>
            <p className="text-xs text-slate-400">
              Hardware graphics context was paused. Reload or restore window focus to resume 3D inspection.
            </p>
          </div>
        )}

        {/* Top-Left Minimal Spec Readout (unboxed clean metadata) */}
        <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <span>High: {highPolyTris.toLocaleString()} tris</span>
            {lowPolyTris > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-blue-400">
                  Low: {lowPolyTris.toLocaleString()} tris ({reductionPct}% reduced)
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            Drag to orbit · Scroll to zoom · Right-drag to pan
          </div>
        </div>

        {/* Split Comparison Divider Handle */}
        {viewMode === 'split' && lowPolyTris > 0 && (
          <>
            <div
              style={{ left: `${splitRatio * 100}%` }}
              className="absolute top-0 bottom-0 z-10 w-px bg-blue-400/80 pointer-events-none"
            />
            <button
              type="button"
              aria-label="Drag split comparison divider"
              style={{ left: `${splitRatio * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setIsDraggingSplit(true);
              }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-[#171A21] border border-blue-400/70 text-blue-400 shadow-lg cursor-ew-resize hover:scale-105 transition-transform"
            >
              <Columns2 className="w-4 h-4" />
            </button>
            <div className="pointer-events-none absolute top-4 right-4 z-10 flex items-center gap-3 text-[11px] font-mono text-slate-300 bg-[#171A21] border border-white/10 px-2.5 py-1 rounded-md">
              <span>Left: High-Poly</span>
              <span className="text-slate-600">/</span>
              <span className="text-blue-400">
                Right: {hasBakedMaps ? 'Baked Low-Poly' : 'Low-Poly'}
              </span>
            </div>
          </>
        )}

        {/* Collapsible Bottom Control Dock (solid backing, no backdrop-blur over WebGL) */}
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center transition-transform duration-200 ease-out ${
            dockCollapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
          }`}
        >
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#171A21] border border-b-0 border-white/10 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#171A21] border border-white/10 shadow-2xl max-w-[92vw]">
            {/* View Mode Segmented Controls */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111318] border border-white/5">
              {(
                [
                  { id: 'high-poly', label: 'High-Poly', disabled: false },
                  { id: 'low-poly', label: 'Low-Poly', disabled: lowPolyTris === 0 },
                  { id: 'baked-pbr', label: 'Baked PBR', disabled: !hasBakedMaps },
                  { id: 'split', label: 'Split Compare', disabled: lowPolyTris === 0 },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => onViewModeChange(item.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === item.id
                      ? 'bg-blue-600 text-white'
                      : item.disabled
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/10 hidden sm:block" />

            {/* Shading Mode Segmented Controls */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111318] border border-white/5">
              {(
                [
                  { id: 'pbr', label: 'PBR' },
                  { id: 'clay', label: 'Clay' },
                  { id: 'normals', label: 'Normals' },
                  { id: 'uv-checker', label: 'UV Grid' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onShadingModeChange(mode.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    shadingMode === mode.id
                      ? 'bg-[#262B36] text-white border border-white/15'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/10 hidden sm:block" />

            {/* Wireframe & Camera Actions */}
            <button
              type="button"
              onClick={onToggleWireframe}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                showWireframe
                  ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-[#111318] border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              <span>Wireframe</span>
            </button>

            <button
              type="button"
              onClick={() => engineRef.current?.resetCamera()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#111318] border border-white/10 text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
              title="Reset Studio Camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Cam</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);

export const ViewportIcons = { Layers, Camera };
