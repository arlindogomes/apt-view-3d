import * as pc from 'playcanvas';
import { getHdriPresetMeta, HdriEnvironmentFactory } from '../materials/HdriEnvironmentFactory';
import { ProceduralMaterialFactory } from '../materials/ProceduralMaterialFactory';
import { getGlbAsset, saveGlbAsset } from '../services/assetDb';
import { sanitizeGlbFileName, sanitizePublicAssetUrl } from '../services/security';
import { createDefaultMaterial, useSceneStore } from '../store/sceneStore';
import {
  CameraMode,
  GizmoMode,
  LightingPreset,
  SceneEntityData,
  SnapConfig,
  ToolMode,
  Vec3,
} from '../types/scene';
import { CameraController } from './CameraController';
import {
  computeEntityWorldAABB,
  createPolygonSlabMesh,
  intersectRayAABB,
  intersectRayPlaneY,
  intersectRayTriangleMeshWorld,
} from './GeometryUtils';
import {
  buildCenteredMeshForGlbPart,
  buildDecomposedPartDescriptors,
  descriptorsToEntityInputs,
  ParsedGlbAssetCache,
  parseGlbContainerPrimitives,
} from './GlbDecomposer';

interface ManagedEntityRecord {
  data: SceneEntityData;
  entity: pc.Entity;
  materialKey: string;
  meshSignature: string;
  originalMaterials?: Map<pc.MeshInstance, pc.Material>;
  localPositions?: Float32Array;
  localIndices?: Uint32Array;
}

export class PlayCanvasEngine {
  private canvas: HTMLCanvasElement;
  private app: pc.Application;
  private cameraEntity: pc.Entity;
  private cameraController: CameraController;
  private materialFactory: ProceduralMaterialFactory;
  private hdriFactory: HdriEnvironmentFactory;

  private sunLight: pc.Entity;
  private fillLight: pc.Entity;
  private rimLight: pc.Entity;
  private sceneRoot: pc.Entity;

  private gizmoLayer: pc.Layer;
  private gizmos: Record<GizmoMode, pc.TransformGizmo>;
  private activeGizmoMode: GizmoMode = 'translate';
  private isGizmoDragging = false;
  private justFinishedGizmoDrag = false;
  private attachedGizmoKey: string | null = null;
  private multiTransformStartSnapshots = new Map<
    string,
    { position: Vec3; rotation: Vec3; scale: Vec3 }
  >();
  private selectedIds: string[] = [];

  private records = new Map<string, ManagedEntityRecord>();
  private loadingGlbIds = new Set<string>();
  private parsedGlbCache = new Map<string, Promise<ParsedGlbAssetCache | null>>();
  private groupDragPeerStartPositions = new Map<string, Vec3>();
  private selectedId: string | null = null;
  private toolMode: ToolMode = 'select';
  private snap: SnapConfig = {
    enabled: true,
    gridStep: 0.25,
    angleStep: 15,
    floorClamp: true,
  };

  // Interactive drawing state
  private drawStartPoint: pc.Vec3 | null = null;
  private drawCurrentPoint: pc.Vec3 | null = null;
  private polygonPoints: pc.Vec3[] = [];
  private pointerDownPos: { x: number; y: number } | null = null;

  // Grid line buffers (precomputed for performance)
  private majorGridPositions: pc.Vec3[] = [];
  private minorGridPositions: pc.Vec3[] = [];
  private majorGridColor = new pc.Color(0.26, 0.29, 0.34, 0.65);
  private minorGridColor = new pc.Color(0.32, 0.35, 0.4, 0.35);

  private resizeObserver: ResizeObserver;
  private unsubscribeStore: () => void;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      },
      mouse: new pc.Mouse(canvas),
      touch: new pc.TouchDevice(canvas),
    });

    this.app.setCanvasFillMode(pc.FILLMODE_NONE);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.resizeToContainer();

    this.materialFactory = new ProceduralMaterialFactory(this.app.graphicsDevice);
    this.hdriFactory = new HdriEnvironmentFactory(this.app.graphicsDevice);

    // Scene root
    this.sceneRoot = new pc.Entity('SceneRoot');
    this.app.root.addChild(this.sceneRoot);

    // Camera (transparent clearColor so CSS neutral gray studio gradient shows through)
    this.cameraEntity = new pc.Entity('MainCamera');
    this.cameraEntity.addComponent('camera', {
      clearColor: new pc.Color(0, 0, 0, 0),
      fov: 48,
      nearClip: 0.08,
      farClip: 250,
      toneMapping: pc.TONEMAP_ACES,
      gammaCorrection: pc.GAMMA_SRGB,
    });
    this.app.root.addChild(this.cameraEntity);

    // Gizmo layer & official PlayCanvas Gizmos
    this.gizmoLayer = pc.Gizmo.createLayer(this.app);
    const camComp = this.cameraEntity.camera!;
    if (!camComp.layers.includes(this.gizmoLayer.id)) {
      camComp.layers = [...camComp.layers, this.gizmoLayer.id];
    }

    this.gizmos = {
      translate: new pc.TranslateGizmo(camComp, this.gizmoLayer),
      rotate: new pc.RotateGizmo(camComp, this.gizmoLayer),
      scale: new pc.ScaleGizmo(camComp, this.gizmoLayer),
    };
    this.setupGizmos();

    // Uniform Sketchfab-style studio 3-point lighting with soft shadows + AO feel
    this.sunLight = new pc.Entity('SunLight');
    this.sunLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.99, 0.98),
      intensity: 0.82,
      castShadows: true,
      shadowBias: 0.2,
      normalOffsetBias: 0.03,
      shadowResolution: 2048,
      shadowDistance: 26,
      shadowType: pc.SHADOW_PCF5,
      shadowIntensity: 0.42,
    });
    this.sunLight.setEulerAngles(58, 32, 0);
    this.app.root.addChild(this.sunLight);

    this.fillLight = new pc.Entity('FillLight');
    this.fillLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.85, 0.89, 0.95),
      intensity: 0.45,
      castShadows: false,
    });
    this.fillLight.setEulerAngles(38, -135, 0);
    this.app.root.addChild(this.fillLight);

    this.rimLight = new pc.Entity('RimLight');
    this.rimLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.92, 0.94, 0.98),
      intensity: 0.28,
      castShadows: false,
    });
    this.rimLight.setEulerAngles(25, 165, 0);
    this.app.root.addChild(this.rimLight);

    // Subtle Ambient Occlusion grounding shadow plane under the floor
    this.createGroundAmbientOcclusionPlane();

    // Camera controller
    this.cameraController = new CameraController(this.cameraEntity, canvas);

    // Precompute metric grid (24m x 24m)
    this.buildMetricGrid(12);

    // Store sync
    const initial = useSceneStore.getState();
    this.applyLightingPreset(initial.lighting, initial.envIntensity);
    this.syncEntitiesFromStore(initial.entities);
    this.setSelectedIds(initial.selectedIds, initial.selectedId);
    this.setGizmoMode(initial.gizmoMode);
    this.setCameraMode(initial.cameraMode);
    this.setToolMode(initial.toolMode);
    this.snap = initial.snap;
    this.updateGizmoSnapSettings();

    this.unsubscribeStore = useSceneStore.subscribe((state, prev) => {
      if (state.entities !== prev.entities) {
        this.syncEntitiesFromStore(state.entities);
      }
      if (state.selectedIds !== prev.selectedIds || state.selectedId !== prev.selectedId) {
        this.setSelectedIds(state.selectedIds, state.selectedId);
      }
      if (state.gizmoMode !== prev.gizmoMode) {
        this.setGizmoMode(state.gizmoMode);
      }
      if (state.cameraMode !== prev.cameraMode) {
        this.setCameraMode(state.cameraMode);
      }
      if (state.toolMode !== prev.toolMode) {
        this.setToolMode(state.toolMode);
      }
      if (state.lighting !== prev.lighting || state.envIntensity !== prev.envIntensity) {
        this.applyLightingPreset(state.lighting, state.envIntensity);
      }
      if (state.snap !== prev.snap) {
        this.snap = state.snap;
        this.updateGizmoSnapSettings();
      }
    });

    // Register callbacks for Focus (F), Screenshot, and 3D GLB Sub-Element Decomposition
    useSceneStore
      .getState()
      .registerEngineCallbacks(
        () => this.focusOnSelected(),
        () => this.captureScreenshot(),
        (params) => this.importAndDecomposeGlb(params),
        (entityId, granularity) => this.splitExistingGlbEntity(entityId, granularity)
      );

    // Pointer & keyboard handlers for selection & parametric drawing
    this.attachInputListeners();

    // Update loop
    this.app.on('update', this.onUpdate);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.resizeToContainer());
    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }

    this.app.start();
  }

  private setupGizmos(): void {
    Object.values(this.gizmos).forEach((gizmo) => {
      gizmo.size = 1.1;
      gizmo.coordSpace = 'world';

      gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMSTART, () => {
        this.isGizmoDragging = true;
        this.cameraController.setSuppressed(true);
        this.multiTransformStartSnapshots.clear();
        for (const id of this.selectedIds) {
          const rec = this.records.get(id);
          if (rec && rec.data.visible && !rec.data.locked) {
            this.multiTransformStartSnapshots.set(id, {
              position: [...rec.data.position] as Vec3,
              rotation: [...rec.data.rotation] as Vec3,
              scale: [...rec.data.scale] as Vec3,
            });
          }
        }
      });

      gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMMOVE, () => {
        if (this.selectedIds.length === 0) return;
        const store = useSceneStore.getState();
        const isUniformScale = this.activeGizmoMode === 'scale' && store.uniformScale;

        for (const id of this.selectedIds) {
          const rec = this.records.get(id);
          if (!rec || rec.data.locked) continue;

          if (this.activeGizmoMode === 'translate' && this.snap.floorClamp) {
            this.clampEntityToFloor(rec);
          }

          const pos = rec.entity.getLocalPosition();
          const rot = rec.entity.getLocalEulerAngles();
          const scl = rec.entity.getLocalScale();
          let sx = Math.max(0.02, scl.x);
          let sy = Math.max(0.02, scl.y);
          let sz = Math.max(0.02, scl.z);

          // Enforce uniform proportional scale across X, Y, Z when uniformScale boolean is enabled
          if (isUniformScale) {
            const start = this.multiTransformStartSnapshots.get(id);
            if (start) {
              const rx = sx / Math.max(0.001, start.scale[0]);
              const ry = sy / Math.max(0.001, start.scale[1]);
              const rz = sz / Math.max(0.001, start.scale[2]);
              const dx = Math.abs(rx - 1);
              const dy = Math.abs(ry - 1);
              const dz = Math.abs(rz - 1);
              const ratio = dx >= dy && dx >= dz ? rx : dy >= dz ? ry : rz;
              const safeRatio = Math.max(0.02, ratio);
              sx = Math.max(0.02, start.scale[0] * safeRatio);
              sy = Math.max(0.02, start.scale[1] * safeRatio);
              sz = Math.max(0.02, start.scale[2] * safeRatio);
              rec.entity.setLocalScale(sx, sy, sz);
            }
          }

          store.updateEntityDirect(id, {
            position: [pos.x, pos.y, pos.z],
            rotation: [rot.x, rot.y, rot.z],
            scale: [sx, sy, sz],
          });
        }
      });

      gizmo.on(pc.TransformGizmo.EVENT_TRANSFORMEND, () => {
        this.isGizmoDragging = false;
        this.justFinishedGizmoDrag = true;
        window.setTimeout(() => {
          this.justFinishedGizmoDrag = false;
        }, 120);
        this.cameraController.setSuppressed(false);

        if (this.multiTransformStartSnapshots.size > 0) {
          const batch: Array<{
            id: string;
            before: { position: Vec3; rotation: Vec3; scale: Vec3 };
            after: { position: Vec3; rotation: Vec3; scale: Vec3 };
          }> = [];

          for (const [id, before] of this.multiTransformStartSnapshots.entries()) {
            const rec = this.records.get(id);
            if (!rec) continue;
            const pos = rec.entity.getLocalPosition();
            const rot = rec.entity.getLocalEulerAngles();
            const scl = rec.entity.getLocalScale();
            batch.push({
              id,
              before,
              after: {
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z],
                scale: [Math.max(0.02, scl.x), Math.max(0.02, scl.y), Math.max(0.02, scl.z)],
              },
            });
          }

          useSceneStore.getState().commitEntitiesTransformBatch(batch);
          this.multiTransformStartSnapshots.clear();
        }
      });
    });
  }

  private clampEntityToFloor(rec: ManagedEntityRecord): void {
    const kind = rec.data.kind;
    if (kind === 'light') return;

    // Determine target floor top Y: 0 for floor slabs, or highest floor slab top (default 0.10m) for objects on floor
    let floorY = 0;
    if (kind !== 'floor' && kind !== 'polygon_floor') {
      const pos = rec.entity.getPosition();
      for (const other of this.records.values()) {
        if (other.data.id === rec.data.id || !other.data.visible) continue;
        if (other.data.kind === 'floor' || other.data.kind === 'polygon_floor') {
          const aabb = computeEntityWorldAABB(other.entity);
          if (aabb) {
            const min = aabb.getMin();
            const max = aabb.getMax();
            if (pos.x >= min.x && pos.x <= max.x && pos.z >= min.z && pos.z <= max.z) {
              floorY = Math.max(floorY, max.y);
            }
          }
        }
      }
    }

    const aabb = computeEntityWorldAABB(rec.entity);
    if (aabb) {
      const minY = aabb.getMin().y;
      if (minY < floorY) {
        const diff = floorY - minY;
        const p = rec.entity.getLocalPosition();
        rec.entity.setLocalPosition(p.x, p.y + diff, p.z);
      }
    }
  }

  private updateGizmoSnapSettings(): void {
    this.gizmos.translate.snap = this.snap.enabled;
    this.gizmos.translate.snapIncrement = this.snap.gridStep;
    this.gizmos.rotate.snap = this.snap.enabled;
    this.gizmos.rotate.snapIncrement = this.snap.angleStep;
    this.gizmos.scale.snap = this.snap.enabled;
    this.gizmos.scale.snapIncrement = Math.max(0.05, this.snap.gridStep);
  }

  private buildMetricGrid(halfExtent: number): void {
    this.majorGridPositions = [];
    this.minorGridPositions = [];
    const step = 0.25;
    const count = Math.round(halfExtent / step);

    for (let i = -count; i <= count; i++) {
      const coord = Number((i * step).toFixed(3));
      const isMajor = Math.abs(coord - Math.round(coord)) < 1e-4;
      const target = isMajor ? this.majorGridPositions : this.minorGridPositions;

      // Skip origin X/Z axes (drawn separately in red/blue)
      if (Math.abs(coord) < 1e-4) continue;

      target.push(new pc.Vec3(coord, 0.002, -halfExtent), new pc.Vec3(coord, 0.002, halfExtent));
      target.push(new pc.Vec3(-halfExtent, 0.002, coord), new pc.Vec3(halfExtent, 0.002, coord));
    }
  }

  private createGroundAmbientOcclusionPlane(): void {
    const size = 256;
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = size;
    aoCanvas.height = size;
    const ctx = aoCanvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(15, 18, 24, 0.32)');
    grad.addColorStop(0.55, 'rgba(15, 18, 24, 0.14)');
    grad.addColorStop(1, 'rgba(15, 18, 24, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const aoTex = new pc.Texture(this.app.graphicsDevice, {
      width: size,
      height: size,
      format: pc.PIXELFORMAT_RGBA8,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      mipmaps: false,
      srgb: true,
    });
    aoTex.setSource(aoCanvas);

    const aoMat = new pc.StandardMaterial();
    aoMat.diffuse = new pc.Color(0, 0, 0);
    aoMat.opacityMap = aoTex;
    aoMat.opacityMapChannel = 'a';
    aoMat.blendType = pc.BLEND_NORMAL;
    aoMat.depthWrite = false;
    aoMat.useLighting = false;
    aoMat.update();

    const aoPlane = new pc.Entity('GroundAO');
    aoPlane.addComponent('render', {
      type: 'plane',
      castShadows: false,
      receiveShadows: false,
      material: aoMat,
    });
    aoPlane.setLocalPosition(0, -0.002, 0);
    aoPlane.setLocalScale(15, 1, 13);
    this.app.root.addChild(aoPlane);
  }

  private applyLightingPreset(preset: LightingPreset, envIntensity = 1.0): void {
    const meta = getHdriPresetMeta(preset);
    const atlas = this.hdriFactory.getEnvAtlas(preset);

    this.app.scene.envAtlas = atlas;
    this.app.scene.skyboxIntensity = envIntensity;
    this.app.scene.ambientLight = new pc.Color(
      meta.ambientColor[0] * envIntensity,
      meta.ambientColor[1] * envIntensity,
      meta.ambientColor[2] * envIntensity
    );

    if (this.sunLight.light) {
      this.sunLight.light.color = new pc.Color(
        meta.sunColor[0],
        meta.sunColor[1],
        meta.sunColor[2]
      );
      this.sunLight.light.intensity = meta.sunIntensity * envIntensity;
      this.sunLight.light.shadowIntensity = meta.shadowIntensity;
    }
    this.sunLight.setEulerAngles(meta.sunAngles[0], meta.sunAngles[1], meta.sunAngles[2]);

    if (this.fillLight.light) {
      this.fillLight.light.color = new pc.Color(
        meta.fillColor[0],
        meta.fillColor[1],
        meta.fillColor[2]
      );
      this.fillLight.light.intensity = meta.fillIntensity * envIntensity;
    }

    if (this.rimLight.light) {
      this.rimLight.light.intensity = 0.28 * envIntensity;
    }
  }

  private syncEntitiesFromStore(entities: SceneEntityData[]): void {
    const incomingIds = new Set(entities.map((e) => e.id));

    // Remove deleted entities
    for (const [id, rec] of this.records.entries()) {
      if (!incomingIds.has(id)) {
        if (this.selectedId === id) {
          this.detachAllGizmos();
        }
        rec.entity.destroy();
        this.records.delete(id);
      }
    }

    // Add or update entities
    for (const data of entities) {
      const existing = this.records.get(data.id);
      if (!existing) {
        this.createEntityRecord(data);
      } else {
        this.updateEntityRecord(existing, data);
      }
    }

    // Refresh gizmo attachment
    this.refreshGizmoAttachment();
  }

  private createEntityRecord(data: SceneEntityData): void {
    const entity = new pc.Entity(data.name);
    entity.tags.add(data.id);
    this.sceneRoot.addChild(entity);

    const rec: ManagedEntityRecord = {
      data,
      entity,
      materialKey: '',
      meshSignature: '',
    };
    this.records.set(data.id, rec);

    if (data.kind === 'glb') {
      this.loadGlbIntoEntity(rec);
    } else if (data.kind === 'light') {
      entity.addComponent('light', {
        type: 'point',
        color: this.hexToPcColor(data.lightColor || '#fff2d6'),
        intensity: data.lightIntensity ?? 1.0,
        range: 10,
        castShadows: false,
      });
      entity.addComponent('render', {
        type: 'sphere',
        castShadows: false,
      });
      const bulbMat = new pc.StandardMaterial();
      bulbMat.emissive = this.hexToPcColor(data.lightColor || '#fff2d6');
      bulbMat.diffuse = new pc.Color(0.1, 0.1, 0.1);
      bulbMat.update();
      if (entity.render) {
        entity.render.material = bulbMat;
      }
    } else if (data.kind === 'polygon_floor' && data.polygonPoints && data.polygonPoints.length >= 3) {
      const mesh = createPolygonSlabMesh(this.app.graphicsDevice, data.polygonPoints, 1.0);
      const mat = this.materialFactory.getMaterial(data.material);
      const mi = new pc.MeshInstance(mesh, mat);
      entity.addComponent('render', {
        meshInstances: [mi],
        castShadows: true,
        receiveShadows: true,
      });
      rec.meshSignature = JSON.stringify(data.polygonPoints);
      rec.materialKey = JSON.stringify(data.material);
    } else {
      // Architectural primitives: wall, floor, door, window, pillar, block
      entity.addComponent('render', {
        type: 'box',
        castShadows: data.kind !== 'window',
        receiveShadows: true,
      });
    }

    this.updateEntityRecord(rec, data);
  }

  private updateEntityRecord(rec: ManagedEntityRecord, data: SceneEntityData): void {
    rec.data = data;
    const entity = rec.entity;
    entity.name = data.name;
    entity.enabled = data.visible;

    // Avoid fighting active gizmo drag
    if (!this.isGizmoDragging || !this.selectedIds.includes(data.id)) {
      entity.setLocalPosition(data.position[0], data.position[1], data.position[2]);
      entity.setLocalEulerAngles(data.rotation[0], data.rotation[1], data.rotation[2]);
      entity.setLocalScale(data.scale[0], data.scale[1], data.scale[2]);
    }

    if (data.kind === 'light' && entity.light) {
      entity.light.color = this.hexToPcColor(data.lightColor || '#fff2d6');
      entity.light.intensity = data.lightIntensity ?? 1.0;
      return;
    }

    const matKey = JSON.stringify(data.material);
    if (rec.materialKey !== matKey) {
      rec.materialKey = matKey;
      this.applyMaterialToRecord(rec);
    }
  }

  private applyMaterialToRecord(rec: ManagedEntityRecord): void {
    const { data, entity } = rec;
    if (data.kind === 'light') return;

    const renders = entity.findComponents('render') as pc.RenderComponent[];
    if (renders.length === 0) return;

    if (data.kind === 'glb' && data.material.preset === 'original') {
      if (rec.originalMaterials) {
        for (const [mi, origMat] of rec.originalMaterials.entries()) {
          mi.material = origMat;
        }
      }
      return;
    }

    const mat = this.materialFactory.getMaterial(data.material);

    // Semi-transparent glass look for window primitive
    if (data.kind === 'window') {
      const glass = mat.clone();
      glass.opacity = 0.45;
      glass.blendType = pc.BLEND_NORMAL;
      glass.update();
      for (const r of renders) {
        for (const mi of r.meshInstances) {
          mi.material = glass;
        }
      }
      return;
    }

    for (const r of renders) {
      for (const mi of r.meshInstances) {
        mi.material = mat;
      }
    }
  }

  private getOrLoadParsedGlb(
    assetId: string,
    hintName = '',
    sourceUrl?: string
  ): Promise<ParsedGlbAssetCache | null> {
    const existing = this.parsedGlbCache.get(assetId);
    if (existing) return existing;

    const promise = (async (): Promise<ParsedGlbAssetCache | null> => {
      try {
        let stored = await getGlbAsset(assetId);
        const safeSourceUrl = sanitizePublicAssetUrl(sourceUrl);
        if (!stored && safeSourceUrl) {
          const res = await fetch(safeSourceUrl, { referrerPolicy: 'no-referrer' });
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const safeFileName = sanitizeGlbFileName(`${assetId}.glb`, assetId);
            await saveGlbAsset(assetId, safeFileName, buf);
            stored = await getGlbAsset(assetId);
          }
        }

        if (!stored || this.disposed) return null;

        const blob = new Blob([stored.buffer], { type: 'model/gltf-binary' });
        const blobUrl = URL.createObjectURL(blob);

        return await new Promise<ParsedGlbAssetCache | null>((resolve) => {
          this.app.assets.loadFromUrlAndFilename(
            blobUrl,
            stored!.fileName || 'model.glb',
            'container',
            (err, asset) => {
              URL.revokeObjectURL(blobUrl);
              if (err || !asset || this.disposed) {
                console.error('Erro ao parsear container GLB:', err);
                resolve(null);
                return;
              }
              const container = asset.resource as pc.ContainerResource;
              const parsed = parseGlbContainerPrimitives(assetId, container, hintName);
              resolve(parsed);
            }
          );
        });
      } catch (e) {
        console.error('Erro ao carregar e analisar GLB:', e);
        return null;
      }
    })();

    this.parsedGlbCache.set(assetId, promise);
    return promise;
  }

  public async importAndDecomposeGlb(params: {
    assetId: string;
    fileName: string;
    modelName: string;
    sourceUrl?: string;
    author?: string;
    license?: string;
    decompose?: boolean;
  }): Promise<void> {
    const store = useSceneStore.getState();
    // Models arrive grouped by default unless decompose === true is explicitly requested
    const shouldDecompose = params.decompose === true;

    const parsed = await this.getOrLoadParsedGlb(
      params.assetId,
      params.modelName,
      params.sourceUrl
    );

    if (!parsed || parsed.primitives.length === 0) {
      store.showToast('Falha ao ler elementos 3D do arquivo GLB.');
      return;
    }

    if (!shouldDecompose) {
      // Import as a single grouped whole-GLB entity in exact 1:1 real-world meters
      store.addEntity({
        name: params.modelName,
        category: 'furniture',
        kind: 'glb',
        tags: ['glb', 'agrupado'],
        visible: true,
        locked: false,
        position: [0, 0.1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        baseSize: parsed.rawBoundsSize,
        material: createDefaultMaterial('original'),
        assetId: params.assetId,
        assetFileName: params.fileName,
        assetSourceUrl: params.sourceUrl,
        assetAuthor: params.author,
        assetLicense: params.license,
      });
      const [w, h, d] = parsed.rawBoundsSize;
      store.showToast(
        `"${params.modelName}" importado agrupado (${w}m × ${h}m × ${d}m). Use Desagrupar (Ctrl+Shift+G) para separar elementos 3D.`
      );
      return;
    }

    const descriptors = buildDecomposedPartDescriptors(parsed, params.modelName, {
      granularity: 'smart',
    });

    const entityInputs = descriptorsToEntityInputs(descriptors, {
      assetId: params.assetId,
      assetFileName: params.fileName,
      assetSourceUrl: params.sourceUrl,
      assetAuthor: params.author,
      assetLicense: params.license,
      groupId: undefined,
      groupName: undefined,
      dropPosition: [0, 0.1, 0],
      defaultMaterial: createDefaultMaterial('original'),
    });

    store.addEntitiesBatch(
      entityInputs,
      `Importar ${params.modelName} (${entityInputs.length} elementos 3D)`
    );
    store.showToast(
      `"${params.modelName}" importado com ${entityInputs.length} elementos 3D independentes!`
    );
  }

  public async splitExistingGlbEntity(
    entityId: string,
    granularity: 'smart' | 'fine' = 'fine'
  ): Promise<void> {
    const store = useSceneStore.getState();
    const target = store.entities.find((e) => e.id === entityId);
    if (!target || target.kind !== 'glb' || !target.assetId) return;

    const parsed = await this.getOrLoadParsedGlb(
      target.assetId,
      target.groupName || target.name,
      target.assetSourceUrl
    );
    if (!parsed) {
      store.showToast('Não foi possível analisar a geometria interna deste GLB.');
      return;
    }

    const baseName = target.groupName || target.name;
    // Leave ungrouped (groupId = undefined) so each separated 3D element is immediately independent
    const groupId = undefined;

    const descriptors = target.glbPart
      ? buildDecomposedPartDescriptors(parsed, target.name, {
          granularity,
          onlyPrimIndex: target.glbPart.primIndex,
          filterIslandIndices: target.glbPart.islandIndices,
          normScale: target.glbPart.normScale,
          normOffset: target.glbPart.normOffset,
          maxTotalParts: 64,
        })
      : buildDecomposedPartDescriptors(parsed, baseName, {
          granularity,
          maxTotalParts: 64,
        });

    if (descriptors.length <= 1) {
      store.showToast('Este elemento 3D já é uma malha única indivisível.');
      return;
    }

    // Compute world placement of each sub-part relative to the target entity's current transform
    const parentRec = this.records.get(entityId);
    const parentCenter = target.glbPart ? target.glbPart.localCenter : ([0, 0, 0] as Vec3);

    const replacementInputs: Array<Omit<SceneEntityData, 'id'>> = descriptors.map((desc) => {
      const relX = desc.localCenter[0] - parentCenter[0];
      const relY = desc.localCenter[1] - parentCenter[1];
      const relZ = desc.localCenter[2] - parentCenter[2];

      let worldPos: Vec3 = [
        Number((target.position[0] + relX * target.scale[0]).toFixed(4)),
        Number((target.position[1] + relY * target.scale[1]).toFixed(4)),
        Number((target.position[2] + relZ * target.scale[2]).toFixed(4)),
      ];

      if (parentRec) {
        const pt = new pc.Vec3(relX, relY, relZ);
        parentRec.entity.getWorldTransform().transformPoint(pt, pt);
        worldPos = [
          Number(pt.x.toFixed(4)),
          Number(pt.y.toFixed(4)),
          Number(pt.z.toFixed(4)),
        ];
      }

      return {
        name: desc.name,
        category: desc.category,
        kind: 'glb',
        tags: desc.tags,
        visible: target.visible,
        locked: false,
        position: worldPos,
        rotation: [...target.rotation] as Vec3,
        scale: [...target.scale] as Vec3,
        baseSize: desc.baseSize,
        material: structuredClone(target.material),
        assetId: target.assetId,
        assetFileName: target.assetFileName,
        assetSourceUrl: target.assetSourceUrl,
        assetAuthor: target.assetAuthor,
        assetLicense: target.assetLicense,
        glbPart: desc.glbPart,
        groupId,
        groupName: baseName,
      };
    });

    store.replaceEntityWithEntities(
      entityId,
      replacementInputs,
      `Desmembrar ${target.name} em ${replacementInputs.length} partes`
    );
    store.showToast(
      `"${target.name}" separado em ${replacementInputs.length} elementos 3D independentes!`
    );
  }

  private async loadGlbIntoEntity(rec: ManagedEntityRecord): Promise<void> {
    const { data, entity } = rec;
    if (!data.assetId || this.loadingGlbIds.has(data.id)) return;
    this.loadingGlbIds.add(data.id);

    try {
      const parsed = await this.getOrLoadParsedGlb(
        data.assetId,
        data.groupName || data.name,
        data.assetSourceUrl
      );

      this.loadingGlbIds.delete(data.id);
      if (!parsed || this.disposed || !entity.parent) return;

      // Case A: Entity represents a specific decomposed 3D element (or single centered part) inside the GLB
      if (data.glbPart) {
        const partBuilt = buildCenteredMeshForGlbPart(
          this.app.graphicsDevice,
          parsed,
          data.glbPart
        );
        if (!partBuilt) return;

        const mi = new pc.MeshInstance(partBuilt.mesh, partBuilt.material);
        const partEntity = new pc.Entity(`${data.name}_Mesh`);
        partEntity.addComponent('render', {
          meshInstances: [mi],
          castShadows: true,
          receiveShadows: true,
        });
        entity.addChild(partEntity);

        const origMap = new Map<pc.MeshInstance, pc.Material>();
        origMap.set(mi, partBuilt.material);
        rec.originalMaterials = origMap;
        rec.localPositions = partBuilt.localPositions;
        rec.localIndices = partBuilt.localIndices;

        if (data.material.preset !== 'original') {
          this.applyMaterialToRecord(rec);
        }
        this.refreshGizmoAttachment();
        return;
      }

      // Case B: Legacy whole-GLB entity without glbPart selector -> build all primitives centered
      const allDescriptors = buildDecomposedPartDescriptors(parsed, data.name, {
        granularity: 'smart',
        maxTotalParts: 1,
      });
      if (allDescriptors.length > 0 && parsed.primitives.length === 1) {
        const partBuilt = buildCenteredMeshForGlbPart(
          this.app.graphicsDevice,
          parsed,
          allDescriptors[0].glbPart
        );
        if (partBuilt) {
          const mi = new pc.MeshInstance(partBuilt.mesh, partBuilt.material);
          const partEntity = new pc.Entity(`${data.name}_Mesh`);
          partEntity.addComponent('render', {
            meshInstances: [mi],
            castShadows: true,
            receiveShadows: true,
          });
          entity.addChild(partEntity);
          const origMap = new Map<pc.MeshInstance, pc.Material>();
          origMap.set(mi, partBuilt.material);
          rec.originalMaterials = origMap;
          rec.localPositions = partBuilt.localPositions;
          rec.localIndices = partBuilt.localIndices;
          if (data.material.preset !== 'original') {
            this.applyMaterialToRecord(rec);
          }
          this.refreshGizmoAttachment();
          return;
        }
      }

      // Multi-primitive legacy whole GLB: render all primitives under entity
      const origMap = new Map<pc.MeshInstance, pc.Material>();
      const meshInstances: pc.MeshInstance[] = [];
      for (const prim of parsed.primitives) {
        const built = buildCenteredMeshForGlbPart(this.app.graphicsDevice, parsed, {
          primIndex: prim.primIndex,
          normScale: parsed.defaultNormScale,
          normOffset: parsed.defaultNormOffset,
          localCenter: [0, 0, 0],
        });
        if (built) {
          const mi = new pc.MeshInstance(built.mesh, built.material);
          meshInstances.push(mi);
          origMap.set(mi, built.material);
        }
      }
      if (meshInstances.length > 0) {
        const modelEntity = new pc.Entity(`${data.name}_Whole`);
        modelEntity.addComponent('render', {
          meshInstances,
          castShadows: true,
          receiveShadows: true,
        });
        entity.addChild(modelEntity);
        rec.originalMaterials = origMap;
        if (data.material.preset !== 'original') {
          this.applyMaterialToRecord(rec);
        }
        this.refreshGizmoAttachment();
      }
    } catch (e) {
      this.loadingGlbIds.delete(data.id);
      console.error('Falha ao carregar asset GLB:', e);
    }
  }

  private setSelectedIds(ids: string[], primaryId: string | null): void {
    this.selectedIds = ids;
    this.selectedId = primaryId;
    this.refreshGizmoAttachment();
  }

  private setGizmoMode(mode: GizmoMode): void {
    this.activeGizmoMode = mode;
    this.refreshGizmoAttachment();
  }

  private setCameraMode(mode: CameraMode): void {
    this.cameraController.setMode(mode);
  }

  private setToolMode(mode: ToolMode): void {
    this.toolMode = mode;
    this.drawStartPoint = null;
    this.drawCurrentPoint = null;
    this.polygonPoints = [];
    useSceneStore.getState().setWallPreviewLength(null);
    useSceneStore.getState().setPolygonVertexCount(0);
    this.cameraController.setSuppressed(false);
    this.refreshGizmoAttachment();
  }

  private detachAllGizmos(): void {
    Object.values(this.gizmos).forEach((g) => g.detach());
    this.attachedGizmoKey = null;
  }

  private refreshGizmoAttachment(): void {
    // CRITICAL: Never detach/re-attach gizmos while user is actively dragging!
    if (this.isGizmoDragging) return;

    if (this.toolMode !== 'select' || this.selectedIds.length === 0) {
      if (this.attachedGizmoKey !== null) {
        this.detachAllGizmos();
      }
      return;
    }

    const targets: pc.Entity[] = [];
    const targetIds: string[] = [];
    for (const id of this.selectedIds) {
      const rec = this.records.get(id);
      if (rec && rec.data.visible && !rec.data.locked) {
        targets.push(rec.entity);
        targetIds.push(id);
      }
    }

    if (targets.length === 0) {
      if (this.attachedGizmoKey !== null) {
        this.detachAllGizmos();
      }
      return;
    }

    const key = `${this.activeGizmoMode}:${targetIds.join(',')}`;
    if (this.attachedGizmoKey === key) return;

    this.detachAllGizmos();
    this.gizmos[this.activeGizmoMode].attach(targets);
    this.attachedGizmoKey = key;
  }

  public focusOnSelected(): void {
    if (!this.selectedId) {
      this.cameraController.focusOnPoint(new pc.Vec3(0, 0.8, 0), 4.5);
      return;
    }
    const rec = this.records.get(this.selectedId);
    if (!rec) return;
    const aabb = computeEntityWorldAABB(rec.entity);
    if (aabb) {
      const radius = aabb.halfExtents.length();
      this.cameraController.focusOnPoint(aabb.center, Math.max(1.0, radius));
    } else {
      this.cameraController.focusOnPoint(rec.entity.getPosition(), 2.0);
    }
  }

  public captureScreenshot(): void {
    this.app.render();
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    const project = useSceneStore.getState().projectName || 'planta-3d';
    a.download = `${project}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
    useSceneStore.getState().showToast('Screenshot PNG salvo!');
  }

  private snapPoint(pt: pc.Vec3): pc.Vec3 {
    if (!this.snap.enabled) return pt.clone();
    const step = this.snap.gridStep;
    return new pc.Vec3(
      Math.round(pt.x / step) * step,
      pt.y,
      Math.round(pt.z / step) * step
    );
  }

  private screenToRay(clientX: number, clientY: number): pc.Ray {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cam = this.cameraEntity.camera!;
    const from = cam.screenToWorld(x, y, cam.nearClip);
    const to = cam.screenToWorld(x, y, cam.farClip);
    const dir = to.clone().sub(from).normalize();
    return new pc.Ray(from, dir);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.isGizmoDragging) return;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };

    if (this.toolMode !== 'select') {
      this.cameraController.setSuppressed(true);
      const ray = this.screenToRay(e.clientX, e.clientY);
      const hit = intersectRayPlaneY(ray, 0.1);
      if (!hit) return;
      const snapped = this.snapPoint(hit);

      if (this.toolMode === 'draw_wall' || this.toolMode === 'draw_floor') {
        if (!this.drawStartPoint) {
          this.drawStartPoint = snapped;
          this.drawCurrentPoint = snapped.clone();
        } else {
          this.finishTwoPointDraw(this.drawStartPoint, snapped);
          this.drawStartPoint = null;
          this.drawCurrentPoint = null;
          useSceneStore.getState().setWallPreviewLength(null);
        }
      } else if (this.toolMode === 'draw_polygon_floor') {
        // Close polygon if clicking near first vertex and >= 3 points
        if (
          this.polygonPoints.length >= 3 &&
          this.polygonPoints[0].distance(snapped) < Math.max(0.35, this.snap.gridStep * 1.4)
        ) {
          this.finishPolygonFloor();
        } else {
          this.polygonPoints.push(snapped);
          useSceneStore.getState().setPolygonVertexCount(this.polygonPoints.length);
        }
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.toolMode === 'select') return;
    const ray = this.screenToRay(e.clientX, e.clientY);
    const hit = intersectRayPlaneY(ray, 0.1);
    if (!hit) return;
    const snapped = this.snapPoint(hit);
    this.drawCurrentPoint = snapped;

    if (this.toolMode === 'draw_wall' && this.drawStartPoint) {
      const len = this.drawStartPoint.distance(snapped);
      useSceneStore.getState().setWallPreviewLength(Number(len.toFixed(2)));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.toolMode !== 'select') {
      this.cameraController.setSuppressed(false);
      return;
    }
    if (e.button !== 0 || this.isGizmoDragging || this.justFinishedGizmoDrag || !this.pointerDownPos) {
      this.pointerDownPos = null;
      return;
    }
    const moved = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y
    );
    this.pointerDownPos = null;
    if (moved > 5) return; // User was orbiting camera

    // Raycast against all visible unlocked entities (broadphase AABB + exact triangle mesh intersection for GLB elements)
    const ray = this.screenToRay(e.clientX, e.clientY);
    let closestId: string | null = null;
    let closestDist = Infinity;

    for (const [id, rec] of this.records.entries()) {
      if (!rec.data.visible || rec.data.locked) continue;
      const aabb = computeEntityWorldAABB(rec.entity);
      if (!aabb) continue;
      const aabbT = intersectRayAABB(ray, aabb);
      if (aabbT === null || aabbT > closestDist) continue;

      let exactT: number | null = aabbT;
      if (rec.localPositions && rec.localIndices && rec.localIndices.length >= 3) {
        exactT = intersectRayTriangleMeshWorld(
          ray,
          rec.entity.getWorldTransform(),
          rec.localPositions,
          rec.localIndices
        );
      }

      if (exactT !== null && exactT < closestDist) {
        closestDist = exactT;
        closestId = id;
      }
    }

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    useSceneStore.getState().selectEntity(closestId, additive);
  };

  private onDoubleClick = () => {
    if (this.toolMode === 'draw_polygon_floor' && this.polygonPoints.length >= 3) {
      this.finishPolygonFloor();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Escape') {
      this.drawStartPoint = null;
      this.drawCurrentPoint = null;
      this.polygonPoints = [];
      useSceneStore.getState().setToolMode('select');
    } else if (e.key === 'Enter' && this.toolMode === 'draw_polygon_floor' && this.polygonPoints.length >= 3) {
      this.finishPolygonFloor();
    }
  };

  private finishTwoPointDraw(start: pc.Vec3, end: pc.Vec3): void {
    const store = useSceneStore.getState();

    if (this.toolMode === 'draw_wall') {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.15) return;

      const angleDeg = -Math.atan2(dz, dx) * pc.math.RAD_TO_DEG;
      const midX = (start.x + end.x) / 2;
      const midZ = (start.z + end.z) / 2;
      const { height, thickness } = store.wallConfig;
      const count = store.entities.filter((e) => e.kind === 'wall').length + 1;

      store.addEntity({
        name: `Parede ${count}`,
        category: 'structure',
        kind: 'wall',
        tags: ['parede', 'alvenaria'],
        visible: true,
        locked: false,
        position: [midX, height / 2 + 0.1, midZ],
        rotation: [0, Number(angleDeg.toFixed(1)), 0],
        scale: [Number(length.toFixed(3)), height, thickness],
        material: {
          ...createDefaultMaterial('wall'),
          tilingU: Number(Math.max(0.5, length * 0.5).toFixed(2)),
          tilingV: Number(Math.max(0.5, height * 0.5).toFixed(2)),
        },
      });
      store.showToast(`Parede criada (${length.toFixed(2)}m)`);
    } else if (this.toolMode === 'draw_floor') {
      const w = Math.abs(end.x - start.x);
      const d = Math.abs(end.z - start.z);
      if (w < 0.2 || d < 0.2) return;

      const midX = (start.x + end.x) / 2;
      const midZ = (start.z + end.z) / 2;
      const count = store.entities.filter((e) => e.kind === 'floor' || e.kind === 'polygon_floor').length + 1;

      store.addEntity({
        name: `Piso ${count}`,
        category: 'structure',
        kind: 'floor',
        tags: ['piso', 'laje'],
        visible: true,
        locked: false,
        position: [midX, 0.05, midZ],
        rotation: [0, 0, 0],
        scale: [Number(w.toFixed(3)), 0.1, Number(d.toFixed(3))],
        material: {
          ...createDefaultMaterial('ceramic'),
          tilingU: Number(Math.max(0.5, w * 0.5).toFixed(2)),
          tilingV: Number(Math.max(0.5, d * 0.5).toFixed(2)),
        },
      });
      store.showToast(`Piso criado (${w.toFixed(2)}m × ${d.toFixed(2)}m)`);
    }
  }

  private finishPolygonFloor(): void {
    if (this.polygonPoints.length < 3) return;
    const store = useSceneStore.getState();

    // Compute centroid so entity position is centered
    let cx = 0;
    let cz = 0;
    for (const p of this.polygonPoints) {
      cx += p.x;
      cz += p.z;
    }
    cx /= this.polygonPoints.length;
    cz /= this.polygonPoints.length;

    const localPts: [number, number][] = this.polygonPoints.map((p) => [
      Number((p.x - cx).toFixed(3)),
      Number((p.z - cz).toFixed(3)),
    ]);

    const count =
      store.entities.filter((e) => e.kind === 'floor' || e.kind === 'polygon_floor').length + 1;

    store.addEntity({
      name: `Laje Poligonal ${count}`,
      category: 'structure',
      kind: 'polygon_floor',
      tags: ['piso', 'laje', 'poligonal'],
      visible: true,
      locked: false,
      position: [Number(cx.toFixed(3)), 0.05, Number(cz.toFixed(3))],
      rotation: [0, 0, 0],
      scale: [1, 0.1, 1],
      polygonPoints: localPts,
      material: {
        ...createDefaultMaterial('ceramic'),
        tilingU: 1,
        tilingV: 1,
      },
    });

    this.polygonPoints = [];
    store.setPolygonVertexCount(0);
    store.setToolMode('select');
    store.showToast('Laje poligonal criada!');
  }

  private onUpdate = (dt: number) => {
    this.cameraController.update(dt);

    // Draw metric grid
    this.app.drawLines(this.minorGridPositions, this.minorGridColor);
    this.app.drawLines(this.majorGridPositions, this.majorGridColor);

    // Draw origin X (red) and Z (blue) axes
    this.app.drawLine(
      new pc.Vec3(-12, 0.004, 0),
      new pc.Vec3(12, 0.004, 0),
      new pc.Color(0.85, 0.25, 0.25, 0.9)
    );
    this.app.drawLine(
      new pc.Vec3(0, 0.004, -12),
      new pc.Vec3(0, 0.004, 12),
      new pc.Color(0.25, 0.5, 0.95, 0.9)
    );

    // Draw selection bounding box highlight for all selected entities
    for (const id of this.selectedIds) {
      const rec = this.records.get(id);
      if (rec && rec.data.visible) {
        const aabb = computeEntityWorldAABB(rec.entity);
        if (aabb) {
          this.drawWireBox(aabb, new pc.Color(0.23, 0.56, 1.0, 1));
        }
      }
    }

    // Draw interactive tool previews
    this.drawToolPreviews();
  };

  private drawWireBox(aabb: pc.BoundingBox, color: pc.Color): void {
    const min = aabb.getMin();
    const max = aabb.getMax();
    const c000 = new pc.Vec3(min.x, min.y, min.z);
    const c100 = new pc.Vec3(max.x, min.y, min.z);
    const c110 = new pc.Vec3(max.x, max.y, min.z);
    const c010 = new pc.Vec3(min.x, max.y, min.z);
    const c001 = new pc.Vec3(min.x, min.y, max.z);
    const c101 = new pc.Vec3(max.x, min.y, max.z);
    const c111 = new pc.Vec3(max.x, max.y, max.z);
    const c011 = new pc.Vec3(min.x, max.y, max.z);

    this.app.drawLines(
      [
        c000, c100, c100, c110, c110, c010, c010, c000,
        c001, c101, c101, c111, c111, c011, c011, c001,
        c000, c001, c100, c101, c110, c111, c010, c011,
      ],
      color
    );
  }

  private drawToolPreviews(): void {
    const cyan = new pc.Color(0.15, 0.85, 0.95, 1);
    const amber = new pc.Color(0.98, 0.72, 0.18, 1);

    if (this.toolMode === 'draw_wall' && this.drawStartPoint && this.drawCurrentPoint) {
      const h = useSceneStore.getState().wallConfig.height;
      const a = this.drawStartPoint;
      const b = this.drawCurrentPoint;
      const aTop = new pc.Vec3(a.x, a.y + h, a.z);
      const bTop = new pc.Vec3(b.x, b.y + h, b.z);
      this.app.drawLines([a, b, aTop, bTop, a, aTop, b, bTop], cyan);
    } else if (this.toolMode === 'draw_floor' && this.drawStartPoint && this.drawCurrentPoint) {
      const a = this.drawStartPoint;
      const b = this.drawCurrentPoint;
      const c1 = new pc.Vec3(a.x, 0.12, a.z);
      const c2 = new pc.Vec3(b.x, 0.12, a.z);
      const c3 = new pc.Vec3(b.x, 0.12, b.z);
      const c4 = new pc.Vec3(a.x, 0.12, b.z);
      this.app.drawLines([c1, c2, c2, c3, c3, c4, c4, c1], amber);
    } else if (this.toolMode === 'draw_polygon_floor' && this.polygonPoints.length > 0) {
      const lines: pc.Vec3[] = [];
      for (let i = 0; i < this.polygonPoints.length - 1; i++) {
        lines.push(this.polygonPoints[i], this.polygonPoints[i + 1]);
      }
      if (this.drawCurrentPoint) {
        lines.push(
          this.polygonPoints[this.polygonPoints.length - 1],
          this.drawCurrentPoint
        );
      }
      if (lines.length >= 2) {
        this.app.drawLines(lines, amber);
      }
    }
  }

  private hexToPcColor(hex: string): pc.Color {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return new pc.Color(1, 1, 1);
    return new pc.Color(((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255);
  }

  private resizeToContainer(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.app.resizeCanvas(width, height);
  }

  private attachInputListeners(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
  }

  public dispose(): void {
    this.disposed = true;
    this.unsubscribeStore();
    useSceneStore.getState().registerEngineCallbacks(null, null);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    this.resizeObserver.disconnect();
    this.cameraController.dispose();
    Object.values(this.gizmos).forEach((g) => g.destroy());
    this.materialFactory.dispose();
    this.hdriFactory.dispose();
    this.app.off('update', this.onUpdate);
    this.app.destroy();
  }
}
