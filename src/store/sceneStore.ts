import { create } from 'zustand';
import {
  CameraMode,
  EntityCategory,
  EntityKind,
  GizmoMode,
  GitConnectionState,
  LightingPreset,
  MaterialConfig,
  MaterialPreset,
  SceneDocument,
  SceneEntityData,
  SnapConfig,
  ToolMode,
  Vec3,
  WallBuildConfig,
} from '../types/scene';
import { loadSavedGitConfig } from '../services/github';

const DRAFT_STORAGE_KEY = 'apt_view_scene_draft_v1';

export interface SceneCommand {
  label: string;
  execute: () => void;
  undo: () => void;
}

export function createDefaultMaterial(preset: MaterialPreset): MaterialConfig {
  switch (preset) {
    case 'wall':
      return {
        preset: 'wall',
        color: '#f3f5f8',
        roughness: 0.85,
        tilingU: 1,
        tilingV: 1,
      };
    case 'ceramic':
      return {
        preset: 'ceramic',
        color: '#e8e4dc',
        roughness: 0.25,
        tilingU: 1,
        tilingV: 1,
        groutColor: '#9aa0a8',
        tileSize: 2,
        groutWidth: 0.04,
      };
    case 'wood':
      return {
        preset: 'wood',
        color: '#b5835a',
        roughness: 0.45,
        tilingU: 1,
        tilingV: 1,
        plankVariation: 0.35,
      };
    case 'concrete':
      return {
        preset: 'concrete',
        color: '#8f949a',
        roughness: 0.9,
        tilingU: 1,
        tilingV: 1,
      };
    case 'original':
    default:
      return {
        preset: 'original',
        color: '#ffffff',
        roughness: 0.5,
        tilingU: 1,
        tilingV: 1,
      };
  }
}

export function createSampleEntities(): SceneEntityData[] {
  return [
    {
      id: 'floor-main-01',
      name: 'Piso Principal (Sala)',
      category: 'structure',
      kind: 'floor',
      tags: ['piso', 'sala'],
      visible: true,
      locked: false,
      position: [0, 0.05, 0],
      rotation: [0, 0, 0],
      scale: [8, 0.1, 6],
      material: {
        ...createDefaultMaterial('ceramic'),
        tilingU: 4,
        tilingV: 3,
      },
    },
    {
      id: 'wall-north-01',
      name: 'Parede Norte',
      category: 'structure',
      kind: 'wall',
      tags: ['parede', 'alvenaria'],
      visible: true,
      locked: false,
      position: [0, 1.5, -2.925],
      rotation: [0, 0, 0],
      scale: [8, 2.8, 0.15],
      material: {
        ...createDefaultMaterial('wall'),
        tilingU: 4,
        tilingV: 1.4,
      },
    },
    {
      id: 'wall-west-01',
      name: 'Parede Oeste',
      category: 'structure',
      kind: 'wall',
      tags: ['parede', 'alvenaria'],
      visible: true,
      locked: false,
      position: [-3.925, 1.5, 0],
      rotation: [0, 90, 0],
      scale: [6, 2.8, 0.15],
      material: {
        ...createDefaultMaterial('wall'),
        tilingU: 3,
        tilingV: 1.4,
      },
    },
    {
      id: 'door-entry-01',
      name: 'Porta de Entrada',
      category: 'structure',
      kind: 'door',
      tags: ['porta', 'madeira'],
      visible: true,
      locked: false,
      position: [-1.8, 1.15, -2.84],
      rotation: [0, 0, 0],
      scale: [0.9, 2.1, 0.08],
      material: createDefaultMaterial('wood'),
    },
    {
      id: 'window-north-01',
      name: 'Janela Panorâmica',
      category: 'structure',
      kind: 'window',
      tags: ['janela', 'vidro'],
      visible: true,
      locked: false,
      position: [1.5, 1.65, -2.84],
      rotation: [0, 0, 0],
      scale: [1.8, 1.2, 0.08],
      material: {
        preset: 'concrete',
        color: '#8cc5e8',
        roughness: 0.15,
        tilingU: 1,
        tilingV: 1,
      },
    },
    {
      id: 'pillar-corner-01',
      name: 'Pilar Estrutural',
      category: 'structure',
      kind: 'pillar',
      tags: ['pilar', 'concreto'],
      visible: true,
      locked: false,
      position: [3.75, 1.5, 2.75],
      rotation: [0, 0, 0],
      scale: [0.35, 2.8, 0.35],
      material: createDefaultMaterial('concrete'),
    },
    {
      id: 'block-table-01',
      name: 'Ilha / Bancada',
      category: 'furniture',
      kind: 'block',
      tags: ['movel', 'bancada'],
      visible: true,
      locked: false,
      position: [0.5, 0.55, 0.25],
      rotation: [0, 0, 0],
      scale: [1.8, 0.9, 0.85],
      material: createDefaultMaterial('wood'),
    },
    {
      id: 'light-sun-01',
      name: 'Luz Solar Principal',
      category: 'lighting',
      kind: 'light',
      tags: ['luz', 'sol'],
      visible: true,
      locked: false,
      position: [6, 9, 5],
      rotation: [45, 35, 0],
      scale: [0.4, 0.4, 0.4],
      material: createDefaultMaterial('wall'),
      lightColor: '#fff6e6',
      lightIntensity: 1.35,
    },
  ];
}

function normalizeLighting(val: unknown): LightingPreset {
  const valid: LightingPreset[] = [
    'studio_neutral',
    'studio_warm',
    'daylight',
    'sunset',
    'industrial_loft',
    'night_showroom',
  ];
  if (typeof val === 'string' && valid.includes(val as LightingPreset)) {
    return val as LightingPreset;
  }
  if (val === 'day') return 'daylight';
  return 'studio_neutral';
}

function loadDraft(): {
  projectName: string;
  lighting: LightingPreset;
  entities: SceneEntityData[];
} {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SceneDocument>;
      if (Array.isArray(parsed.entities) && parsed.entities.length > 0) {
        return {
          projectName: parsed.projectName || 'planta-principal',
          lighting: normalizeLighting(parsed.lighting),
          entities: parsed.entities,
        };
      }
    }
  } catch {
    // fallback to sample
  }
  return {
    projectName: 'planta-principal',
    lighting: 'studio_neutral',
    entities: createSampleEntities(),
  };
}

function persistDraft(projectName: string, lighting: LightingPreset, entities: SceneEntityData[]) {
  try {
    const doc: SceneDocument = {
      version: 1,
      projectName,
      lighting,
      entities,
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // ignore quota errors
  }
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const initialDraft = loadDraft();
const savedGit = loadSavedGitConfig();

interface SceneStoreState {
  projectName: string;
  entities: SceneEntityData[];
  selectedId: string | null;
  selectedIds: string[];
  cameraMode: CameraMode;
  gizmoMode: GizmoMode;
  toolMode: ToolMode;
  lighting: LightingPreset;
  snap: SnapConfig;
  wallConfig: WallBuildConfig;

  // Undo / Redo Command stacks
  undoStack: SceneCommand[];
  redoStack: SceneCommand[];

  // Modals & UI state
  isSketchfabOpen: boolean;
  isGitModalOpen: boolean;
  isInspectorVisible: boolean;
  groupTransformMode: boolean;
  uniformScale: boolean;
  envIntensity: number;
  toastMessage: string | null;
  wallPreviewLength: number | null;
  polygonVertexCount: number;

  // Git state
  git: GitConnectionState;

  // Engine callbacks (registered by PlayCanvasViewport)
  focusSelectedCallback: (() => void) | null;
  screenshotCallback: (() => void) | null;
  importGlbCallback:
    | ((params: {
        assetId: string;
        fileName: string;
        modelName: string;
        sourceUrl?: string;
        author?: string;
        license?: string;
        decompose?: boolean;
      }) => Promise<void>)
    | null;
  splitGlbEntityCallback:
    | ((entityId: string, granularity: 'smart' | 'fine') => Promise<void>)
    | null;

  // Actions
  setProjectName: (name: string) => void;
  selectEntity: (id: string | null, additive?: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  setCameraMode: (mode: CameraMode) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  setToolMode: (mode: ToolMode) => void;
  setLighting: (preset: LightingPreset) => void;
  updateSnap: (patch: Partial<SnapConfig>) => void;
  updateWallConfig: (patch: Partial<WallBuildConfig>) => void;
  setWallPreviewLength: (len: number | null) => void;
  setPolygonVertexCount: (count: number) => void;

  setSketchfabOpen: (open: boolean) => void;
  setGitModalOpen: (open: boolean) => void;
  setInspectorVisible: (visible: boolean) => void;
  toggleInspector: () => void;
  setGroupTransformMode: (enabled: boolean) => void;
  setUniformScale: (enabled: boolean) => void;
  toggleUniformScale: () => void;
  setEnvIntensity: (intensity: number) => void;
  showToast: (msg: string) => void;

  registerEngineCallbacks: (
    focusCb: (() => void) | null,
    screenshotCb: (() => void) | null,
    importGlbCb?:
      | ((params: {
          assetId: string;
          fileName: string;
          modelName: string;
          sourceUrl?: string;
          author?: string;
          license?: string;
          decompose?: boolean;
        }) => Promise<void>)
      | null,
    splitGlbCb?: ((entityId: string, granularity: 'smart' | 'fine') => Promise<void>) | null
  ) => void;
  triggerFocusSelected: () => void;
  triggerScreenshot: () => void;
  importGlbAsset: (params: {
    assetId: string;
    fileName: string;
    modelName: string;
    sourceUrl?: string;
    author?: string;
    license?: string;
    decompose?: boolean;
  }) => Promise<void>;
  splitGlbEntity: (entityId: string, granularity?: 'smart' | 'fine') => Promise<void>;

  // Command-backed CRUD
  executeCommand: (cmd: SceneCommand) => void;
  undo: () => void;
  redo: () => void;

  addEntity: (entity: Omit<SceneEntityData, 'id'> & { id?: string }) => SceneEntityData;
  addEntitiesBatch: (
    entityInputs: Array<Omit<SceneEntityData, 'id'> & { id?: string }>,
    label?: string
  ) => SceneEntityData[];
  replaceEntityWithEntities: (
    targetId: string,
    replacementInputs: Array<Omit<SceneEntityData, 'id'> & { id?: string }>,
    label?: string
  ) => SceneEntityData[];
  addPrimitive: (kind: EntityKind) => SceneEntityData;
  deleteEntity: (id: string) => void;
  duplicateEntity: (id: string) => SceneEntityData | null;

  // Group operations for multi-part GLB assemblies & user-created groups
  setGroupVisibility: (groupId: string, visible: boolean) => void;
  setGroupLocked: (groupId: string, locked: boolean) => void;
  deleteGroup: (groupId: string) => void;
  commitGroupTranslation: (groupId: string, delta: Vec3) => void;
  groupSelectedEntities: (customName?: string) => void;
  ungroupSelectedEntities: () => Promise<void>;

  updateEntityDirect: (id: string, patch: Partial<SceneEntityData>) => void;
  commitEntityTransform: (
    id: string,
    before: { position: Vec3; rotation: Vec3; scale: Vec3 },
    after: { position: Vec3; rotation: Vec3; scale: Vec3 }
  ) => void;
  commitEntitiesTransformBatch: (
    items: Array<{
      id: string;
      before: { position: Vec3; rotation: Vec3; scale: Vec3 };
      after: { position: Vec3; rotation: Vec3; scale: Vec3 };
    }>
  ) => void;
  updateEntityMaterial: (id: string, patch: Partial<MaterialConfig>) => void;
  updateEntityProps: (id: string, patch: Partial<SceneEntityData>) => void;

  loadSceneDocument: (doc: SceneDocument) => void;
  resetToSampleScene: () => void;
  getSceneDocument: () => SceneDocument;

  // Git state updater
  updateGitState: (patch: Partial<GitConnectionState>) => void;
}

export const useSceneStore = create<SceneStoreState>((set, get) => ({
  projectName: initialDraft.projectName,
  entities: initialDraft.entities,
  selectedId: null,
  selectedIds: [],
  cameraMode: 'perspective',
  gizmoMode: 'translate',
  toolMode: 'select',
  lighting: initialDraft.lighting,
  snap: {
    enabled: true,
    gridStep: 0.25,
    angleStep: 15,
    floorClamp: true,
  },
  wallConfig: {
    height: 2.8,
    thickness: 0.15,
  },

  undoStack: [],
  redoStack: [],

  isSketchfabOpen: false,
  isGitModalOpen: false,
  isInspectorVisible: true,
  groupTransformMode: false,
  uniformScale: true,
  envIntensity: 1.0,
  toastMessage: null,
  wallPreviewLength: null,
  polygonVertexCount: 0,

  git: {
    connected: false,
    owner: savedGit.owner,
    repo: savedGit.repo,
    token: savedGit.token,
    projectName: savedGit.projectName || initialDraft.projectName,
    userLogin: '',
    userAvatar: '',
    currentBranch: '',
    defaultBranch: 'main',
    isReadOnlyBranch: false,
    branches: [],
    commits: [],
    statusMessage: 'Desconectado',
    lastError: null,
  },

  focusSelectedCallback: null,
  screenshotCallback: null,
  importGlbCallback: null,
  splitGlbEntityCallback: null,

  setProjectName: (name) => {
    set({ projectName: name });
    const s = get();
    persistDraft(name, s.lighting, s.entities);
  },

  selectEntity: (id, additive = false) => {
    if (!id) {
      set({ selectedId: null, selectedIds: [] });
      return;
    }
    const { entities, selectedIds } = get();
    const clicked = entities.find((e) => e.id === id);
    if (!clicked) {
      set({ selectedId: null, selectedIds: [] });
      return;
    }

    if (additive) {
      const exists = selectedIds.includes(id);
      const nextIds = exists
        ? selectedIds.filter((sid) => sid !== id)
        : [...selectedIds, id];
      set({
        selectedIds: nextIds,
        selectedId: nextIds.length > 0 ? nextIds[nextIds.length - 1] : null,
      });
      return;
    }

    // If entity belongs to a user-grouped set (groupId with >=2 unlocked members), select the whole group
    if (clicked.groupId) {
      const groupMembers = entities
        .filter((e) => e.groupId === clicked.groupId && e.visible && !e.locked)
        .map((e) => e.id);
      if (groupMembers.length >= 2) {
        set({
          selectedIds: groupMembers,
          selectedId: id,
        });
        return;
      }
    }

    set({ selectedId: id, selectedIds: [id] });
  },

  setSelectedIds: (ids) => {
    const unique = Array.from(new Set(ids));
    set({
      selectedIds: unique,
      selectedId: unique.length > 0 ? unique[unique.length - 1] : null,
    });
  },
  setCameraMode: (mode) => set({ cameraMode: mode }),
  setGizmoMode: (mode) => set({ gizmoMode: mode }),
  setToolMode: (mode) =>
    set({
      toolMode: mode,
      wallPreviewLength: null,
      polygonVertexCount: 0,
    }),

  setLighting: (preset) => {
    set({ lighting: preset });
    const s = get();
    persistDraft(s.projectName, preset, s.entities);
  },

  updateSnap: (patch) => set((s) => ({ snap: { ...s.snap, ...patch } })),
  updateWallConfig: (patch) => set((s) => ({ wallConfig: { ...s.wallConfig, ...patch } })),
  setWallPreviewLength: (len) => set({ wallPreviewLength: len }),
  setPolygonVertexCount: (count) => set({ polygonVertexCount: count }),

  setSketchfabOpen: (open) => set({ isSketchfabOpen: open }),
  setGitModalOpen: (open) => set({ isGitModalOpen: open }),
  setInspectorVisible: (visible) => set({ isInspectorVisible: visible }),
  toggleInspector: () => set((s) => ({ isInspectorVisible: !s.isInspectorVisible })),
  setGroupTransformMode: (enabled) => set({ groupTransformMode: enabled }),
  setUniformScale: (enabled) => set({ uniformScale: enabled }),
  toggleUniformScale: () => set((s) => ({ uniformScale: !s.uniformScale })),
  setEnvIntensity: (intensity) => set({ envIntensity: intensity }),

  showToast: (msg) => {
    set({ toastMessage: msg });
    window.setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 3500);
  },

  registerEngineCallbacks: (focusCb, screenshotCb, importGlbCb = null, splitGlbCb = null) =>
    set({
      focusSelectedCallback: focusCb,
      screenshotCallback: screenshotCb,
      importGlbCallback: importGlbCb,
      splitGlbEntityCallback: splitGlbCb,
    }),

  triggerFocusSelected: () => {
    get().focusSelectedCallback?.();
  },

  triggerScreenshot: () => {
    get().screenshotCallback?.();
  },

  importGlbAsset: async (params) => {
    const cb = get().importGlbCallback;
    if (cb) {
      await cb(params);
    } else {
      // Fallback if engine isn't mounted yet
      get().addEntity({
        name: params.modelName,
        category: 'furniture',
        kind: 'glb',
        tags: ['glb', '3d'],
        visible: true,
        locked: false,
        position: [0, 0.1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: createDefaultMaterial('original'),
        assetId: params.assetId,
        assetFileName: params.fileName,
        assetSourceUrl: params.sourceUrl,
        assetAuthor: params.author,
        assetLicense: params.license,
      });
    }
  },

  splitGlbEntity: async (entityId, granularity = 'fine') => {
    const cb = get().splitGlbEntityCallback;
    if (cb) {
      await cb(entityId, granularity);
    }
  },

  executeCommand: (cmd) => {
    cmd.execute();
    set((s) => ({
      undoStack: [...s.undoStack.slice(-59), cmd],
      redoStack: [],
    }));
    const s = get();
    persistDraft(s.projectName, s.lighting, s.entities);
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    cmd.undo();
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, cmd],
    }));
    const s = get();
    persistDraft(s.projectName, s.lighting, s.entities);
    s.showToast(`Desfeito: ${cmd.label}`);
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const cmd = redoStack[redoStack.length - 1];
    cmd.execute();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, cmd],
    }));
    const s = get();
    persistDraft(s.projectName, s.lighting, s.entities);
    s.showToast(`Refeito: ${cmd.label}`);
  },

  addEntity: (entityInput) => {
    const existingIds = new Set(get().entities.map((e) => e.id));
    const safeId =
      entityInput.id && !existingIds.has(entityInput.id)
        ? entityInput.id
        : generateId(entityInput.kind);
    const entity: SceneEntityData = {
      ...entityInput,
      id: safeId,
    };
    const prevSelected = get().selectedId;
    const prevSelectedIds = [...get().selectedIds];
    get().executeCommand({
      label: `Criar ${entity.name}`,
      execute: () =>
        set((s) => ({
          entities: [...s.entities, entity],
          selectedId: entity.id,
          selectedIds: [entity.id],
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.filter((e) => e.id !== entity.id),
          selectedId: prevSelected,
          selectedIds: prevSelectedIds,
        })),
    });
    return entity;
  },

  addEntitiesBatch: (entityInputs, label = 'Importar elementos 3D') => {
    if (entityInputs.length === 0) return [];
    const created: SceneEntityData[] = entityInputs.map((inp) => ({
      ...inp,
      id: inp.id || generateId(inp.kind),
    }));
    const createdIds = new Set(created.map((e) => e.id));
    const prevSelected = get().selectedId;

    get().executeCommand({
      label,
      execute: () =>
        set((s) => ({
          entities: [...s.entities, ...created],
          selectedId: created[0].id,
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.filter((e) => !createdIds.has(e.id)),
          selectedId: prevSelected,
        })),
    });
    return created;
  },

  replaceEntityWithEntities: (targetId, replacementInputs, label = 'Separar elementos 3D') => {
    const prevEntities = get().entities;
    const targetIdx = prevEntities.findIndex((e) => e.id === targetId);
    if (targetIdx === -1 || replacementInputs.length === 0) return [];

    const targetEntity = prevEntities[targetIdx];
    const created: SceneEntityData[] = replacementInputs.map((inp) => ({
      ...inp,
      id: inp.id || generateId(inp.kind),
    }));
    const createdIds = new Set(created.map((e) => e.id));
    const prevSelected = get().selectedId;

    get().executeCommand({
      label,
      execute: () =>
        set((s) => {
          const idx = s.entities.findIndex((e) => e.id === targetId);
          if (idx === -1) return s;
          const next = [...s.entities];
          next.splice(idx, 1, ...created);
          return {
            entities: next,
            selectedId: created[0].id,
          };
        }),
      undo: () =>
        set((s) => {
          const firstIdx = s.entities.findIndex((e) => createdIds.has(e.id));
          const filtered = s.entities.filter((e) => !createdIds.has(e.id));
          const insertAt = firstIdx >= 0 ? Math.min(firstIdx, filtered.length) : filtered.length;
          filtered.splice(insertAt, 0, targetEntity);
          return {
            entities: filtered,
            selectedId: prevSelected,
          };
        }),
    });
    return created;
  },

  addPrimitive: (kind) => {
    const count = get().entities.filter((e) => e.kind === kind).length + 1;
    const { wallConfig } = get();
    let category: EntityCategory = 'structure';
    let name = `Objeto ${count}`;
    let position: Vec3 = [0, 0.5, 0];
    let scale: Vec3 = [1, 1, 1];
    let material = createDefaultMaterial('wall');
    let tags: string[] = [kind];

    switch (kind) {
      case 'wall':
        name = `Parede ${count}`;
        position = [0, wallConfig.height / 2 + 0.1, 0];
        scale = [3, wallConfig.height, wallConfig.thickness];
        material = { ...createDefaultMaterial('wall'), tilingU: 1.5, tilingV: 1.4 };
        break;
      case 'floor':
        name = `Laje / Piso ${count}`;
        position = [0, 0.05, 0];
        scale = [4, 0.1, 4];
        material = { ...createDefaultMaterial('ceramic'), tilingU: 2, tilingV: 2 };
        break;
      case 'door':
        name = `Porta ${count}`;
        position = [0, 1.15, 0];
        scale = [0.9, 2.1, 0.08];
        material = createDefaultMaterial('wood');
        tags = ['porta', 'abertura'];
        break;
      case 'window':
        name = `Janela ${count}`;
        position = [0, 1.65, 0];
        scale = [1.4, 1.1, 0.08];
        material = {
          preset: 'concrete',
          color: '#8cc5e8',
          roughness: 0.15,
          tilingU: 1,
          tilingV: 1,
        };
        tags = ['janela', 'abertura'];
        break;
      case 'pillar':
        name = `Pilar ${count}`;
        position = [0, wallConfig.height / 2 + 0.1, 0];
        scale = [0.35, wallConfig.height, 0.35];
        material = createDefaultMaterial('concrete');
        tags = ['pilar', 'estrutura'];
        break;
      case 'block':
        category = 'furniture';
        name = `Bloco ${count}`;
        position = [0, 0.55, 0];
        scale = [1.2, 0.9, 0.8];
        material = createDefaultMaterial('wood');
        tags = ['bloco', 'movel'];
        break;
      case 'light':
        category = 'lighting';
        name = `Ponto de Luz ${count}`;
        position = [0, 2.5, 0];
        scale = [0.25, 0.25, 0.25];
        tags = ['luz'];
        break;
      default:
        break;
    }

    return get().addEntity({
      name,
      category,
      kind,
      tags,
      visible: true,
      locked: false,
      position,
      rotation: [0, 0, 0],
      scale,
      material,
      ...(kind === 'light' ? { lightColor: '#fff2d6', lightIntensity: 1.0 } : {}),
    });
  },

  deleteEntity: (id) => {
    const target = get().entities.find((e) => e.id === id);
    if (!target || target.locked) return;
    const index = get().entities.findIndex((e) => e.id === id);

    get().executeCommand({
      label: `Excluir ${target.name}`,
      execute: () =>
        set((s) => {
          const nextIds = s.selectedIds.filter((sid) => sid !== id);
          return {
            entities: s.entities.filter((e) => e.id !== id),
            selectedIds: nextIds,
            selectedId: s.selectedId === id ? (nextIds[nextIds.length - 1] ?? null) : s.selectedId,
          };
        }),
      undo: () =>
        set((s) => {
          const next = [...s.entities];
          next.splice(Math.min(index, next.length), 0, target);
          return { entities: next, selectedId: target.id, selectedIds: [target.id] };
        }),
    });
  },

  duplicateEntity: (id) => {
    const target = get().entities.find((e) => e.id === id);
    if (!target) return null;
    const { id: _discardId, ...clonedWithoutId } = structuredClone(target);
    const clone: Omit<SceneEntityData, 'id'> = {
      ...clonedWithoutId,
      name: `${target.name} (Cópia)`,
      locked: false,
      groupId: undefined,
      groupName: undefined,
      position: [target.position[0] + 0.5, target.position[1], target.position[2] + 0.5],
    };
    return get().addEntity(clone);
  },

  setGroupVisibility: (groupId, visible) => {
    const prevVis = new Map<string, boolean>();
    for (const e of get().entities) {
      if (e.groupId === groupId) prevVis.set(e.id, e.visible);
    }
    if (prevVis.size === 0) return;

    get().executeCommand({
      label: `${visible ? 'Exibir' : 'Ocultar'} grupo 3D`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.groupId === groupId ? { ...e, visible } : e)),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            prevVis.has(e.id) ? { ...e, visible: prevVis.get(e.id)! } : e
          ),
        })),
    });
  },

  setGroupLocked: (groupId, locked) => {
    const prevLock = new Map<string, boolean>();
    for (const e of get().entities) {
      if (e.groupId === groupId) prevLock.set(e.id, e.locked);
    }
    if (prevLock.size === 0) return;

    get().executeCommand({
      label: `${locked ? 'Bloquear' : 'Desbloquear'} grupo 3D`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.groupId === groupId ? { ...e, locked } : e)),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            prevLock.has(e.id) ? { ...e, locked: prevLock.get(e.id)! } : e
          ),
        })),
    });
  },

  deleteGroup: (groupId) => {
    const snapshot = [...get().entities];
    const toRemove = snapshot.filter((e) => e.groupId === groupId && !e.locked);
    if (toRemove.length === 0) return;
    const removeIds = new Set(toRemove.map((e) => e.id));
    const prevSelected = get().selectedId;

    get().executeCommand({
      label: `Excluir conjunto (${toRemove.length} partes)`,
      execute: () =>
        set((s) => ({
          entities: s.entities.filter((e) => !removeIds.has(e.id)),
          selectedId: s.selectedId && removeIds.has(s.selectedId) ? null : s.selectedId,
        })),
      undo: () =>
        set({
          entities: snapshot,
          selectedId: prevSelected,
        }),
    });
  },

  commitGroupTranslation: (groupId, delta) => {
    if (Math.hypot(delta[0], delta[1], delta[2]) < 1e-4) return;
    const affectedIds = new Set(
      get()
        .entities.filter((e) => e.groupId === groupId && !e.locked)
        .map((e) => e.id)
    );
    if (affectedIds.size === 0) return;

    get().executeCommand({
      label: `Mover conjunto (${affectedIds.size} elementos)`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            affectedIds.has(e.id)
              ? {
                  ...e,
                  position: [
                    Number((e.position[0] + delta[0]).toFixed(4)),
                    Number((e.position[1] + delta[1]).toFixed(4)),
                    Number((e.position[2] + delta[2]).toFixed(4)),
                  ],
                }
              : e
          ),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            affectedIds.has(e.id)
              ? {
                  ...e,
                  position: [
                    Number((e.position[0] - delta[0]).toFixed(4)),
                    Number((e.position[1] - delta[1]).toFixed(4)),
                    Number((e.position[2] - delta[2]).toFixed(4)),
                  ],
                }
              : e
          ),
        })),
    });
  },

  groupSelectedEntities: (customName) => {
    const { selectedIds, entities } = get();
    const validIds = selectedIds.filter((id) => {
      const e = entities.find((item) => item.id === id);
      return e && !e.locked;
    });
    if (validIds.length < 2) {
      get().showToast('Selecione 2 ou mais objetos (Shift+Clique ou Ctrl+Clique) para agrupar.');
      return;
    }

    const newGroupId = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const existingGroupCount = new Set(entities.map((e) => e.groupId).filter(Boolean)).size;
    const newGroupName = customName?.trim() || `Grupo ${existingGroupCount + 1}`;

    const prevMap = new Map<string, { groupId?: string; groupName?: string }>();
    for (const id of validIds) {
      const item = entities.find((e) => e.id === id);
      if (item) {
        prevMap.set(id, { groupId: item.groupId, groupName: item.groupName });
      }
    }

    const idSet = new Set(validIds);
    get().executeCommand({
      label: `Agrupar ${validIds.length} objetos (${newGroupName})`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            idSet.has(e.id) ? { ...e, groupId: newGroupId, groupName: newGroupName } : e
          ),
          selectedIds: validIds,
          selectedId: validIds[0],
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) => {
            const prev = prevMap.get(e.id);
            return prev ? { ...e, groupId: prev.groupId, groupName: prev.groupName } : e;
          }),
        })),
    });
    get().showToast(`${validIds.length} objetos agrupados em "${newGroupName}"!`);
  },

  ungroupSelectedEntities: async () => {
    const { selectedIds, entities } = get();
    if (selectedIds.length === 0) return;

    const selectedEntities = entities.filter((e) => selectedIds.includes(e.id));

    // Case 1: Single grouped/whole GLB entity -> decompose into its real 3D sub-elements!
    if (
      selectedEntities.length === 1 &&
      selectedEntities[0].kind === 'glb' &&
      !selectedEntities[0].glbPart
    ) {
      await get().splitGlbEntity(selectedEntities[0].id, 'smart');
      return;
    }

    // Case 2: User-grouped entities (shared groupId) -> dissolve the group
    const groupIds = new Set(
      selectedEntities.map((e) => e.groupId).filter((g): g is string => Boolean(g))
    );
    if (groupIds.size > 0) {
      const members = entities.filter((e) => e.groupId && groupIds.has(e.groupId));
      const prevMap = new Map<string, { groupId?: string; groupName?: string }>();
      for (const m of members) {
        prevMap.set(m.id, { groupId: m.groupId, groupName: m.groupName });
      }
      const memberIds = new Set(members.map((m) => m.id));

      get().executeCommand({
        label: `Desagrupar ${members.length} objetos`,
        execute: () =>
          set((s) => ({
            entities: s.entities.map((e) =>
              memberIds.has(e.id) ? { ...e, groupId: undefined, groupName: undefined } : e
            ),
            selectedIds: members.length > 0 ? [members[0].id] : [],
            selectedId: members.length > 0 ? members[0].id : null,
          })),
        undo: () =>
          set((s) => ({
            entities: s.entities.map((e) => {
              const prev = prevMap.get(e.id);
              return prev ? { ...e, groupId: prev.groupId, groupName: prev.groupName } : e;
            }),
          })),
      });
      get().showToast(`${members.length} objetos desagrupados! Agora podem ser movidos separadamente.`);
      return;
    }

    // Case 3: Single GLB sub-part with further islands -> fine split
    if (selectedEntities.length === 1 && selectedEntities[0].kind === 'glb') {
      await get().splitGlbEntity(selectedEntities[0].id, 'fine');
      return;
    }

    get().showToast('Selecione um modelo GLB ou um grupo para desagrupar.');
  },

  updateEntityDirect: (id, patch) => {
    set((s) => ({
      entities: s.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  commitEntitiesTransformBatch: (items) => {
    const changedItems = items.filter(
      (item) =>
        item.before.position.some((v, i) => Math.abs(v - item.after.position[i]) > 1e-4) ||
        item.before.rotation.some((v, i) => Math.abs(v - item.after.rotation[i]) > 1e-3) ||
        item.before.scale.some((v, i) => Math.abs(v - item.after.scale[i]) > 1e-4)
    );
    if (changedItems.length === 0) return;

    const afterMap = new Map(changedItems.map((i) => [i.id, i.after]));
    const beforeMap = new Map(changedItems.map((i) => [i.id, i.before]));

    get().executeCommand({
      label:
        changedItems.length === 1
          ? `Transformar objeto`
          : `Transformar ${changedItems.length} objetos`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) => {
            const next = afterMap.get(e.id);
            return next
              ? {
                  ...e,
                  position: [...next.position] as Vec3,
                  rotation: [...next.rotation] as Vec3,
                  scale: [...next.scale] as Vec3,
                }
              : e;
          }),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) => {
            const prev = beforeMap.get(e.id);
            return prev
              ? {
                  ...e,
                  position: [...prev.position] as Vec3,
                  rotation: [...prev.rotation] as Vec3,
                  scale: [...prev.scale] as Vec3,
                }
              : e;
          }),
        })),
    });
  },

  commitEntityTransform: (id, before, after) => {
    const target = get().entities.find((e) => e.id === id);
    if (!target) return;
    const changed =
      before.position.some((v, i) => Math.abs(v - after.position[i]) > 1e-4) ||
      before.rotation.some((v, i) => Math.abs(v - after.rotation[i]) > 1e-3) ||
      before.scale.some((v, i) => Math.abs(v - after.scale[i]) > 1e-4);
    if (!changed) return;

    get().executeCommand({
      label: `Transformar ${target.name}`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            e.id === id
              ? {
                  ...e,
                  position: [...after.position] as Vec3,
                  rotation: [...after.rotation] as Vec3,
                  scale: [...after.scale] as Vec3,
                }
              : e
          ),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) =>
            e.id === id
              ? {
                  ...e,
                  position: [...before.position] as Vec3,
                  rotation: [...before.rotation] as Vec3,
                  scale: [...before.scale] as Vec3,
                }
              : e
          ),
        })),
    });
  },

  updateEntityMaterial: (id, patch) => {
    const target = get().entities.find((e) => e.id === id);
    if (!target) return;
    const prevMat = { ...target.material };
    const nextMat = { ...target.material, ...patch };

    get().executeCommand({
      label: `Material de ${target.name}`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.id === id ? { ...e, material: nextMat } : e)),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.id === id ? { ...e, material: prevMat } : e)),
        })),
    });
  },

  updateEntityProps: (id, patch) => {
    const target = get().entities.find((e) => e.id === id);
    if (!target) return;
    const prevSnapshot: Partial<SceneEntityData> = {};
    for (const key of Object.keys(patch) as Array<keyof SceneEntityData>) {
      (prevSnapshot as Record<string, unknown>)[key] = structuredClone(target[key]);
    }

    get().executeCommand({
      label: `Editar ${target.name}`,
      execute: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      undo: () =>
        set((s) => ({
          entities: s.entities.map((e) => (e.id === id ? { ...e, ...prevSnapshot } : e)),
        })),
    });
  },

  loadSceneDocument: (doc) => {
    const normalizedLighting = normalizeLighting(doc.lighting);
    set({
      projectName: doc.projectName || 'planta-principal',
      lighting: normalizedLighting,
      entities: doc.entities || [],
      selectedId: null,
      undoStack: [],
      redoStack: [],
    });
    persistDraft(doc.projectName || 'planta-principal', normalizedLighting, doc.entities || []);
  },

  resetToSampleScene: () => {
    const sample = createSampleEntities();
    set({
      entities: sample,
      selectedId: null,
      lighting: 'studio_neutral',
      undoStack: [],
      redoStack: [],
    });
    persistDraft(get().projectName, 'studio_neutral', sample);
  },

  getSceneDocument: () => {
    const s = get();
    return {
      version: 1,
      projectName: s.projectName,
      lighting: s.lighting,
      entities: s.entities,
    };
  },

  updateGitState: (patch) => set((s) => ({ git: { ...s.git, ...patch } })),
}));
