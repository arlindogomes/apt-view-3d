export type EntityCategory = 'structure' | 'furniture' | 'lighting';

export type EntityKind =
  | 'wall'
  | 'floor'
  | 'polygon_floor'
  | 'door'
  | 'window'
  | 'pillar'
  | 'block'
  | 'glb'
  | 'light';

export type MaterialPreset = 'wall' | 'ceramic' | 'wood' | 'concrete' | 'original';

export type Vec3 = [number, number, number];

export interface MaterialConfig {
  preset: MaterialPreset;
  color: string;
  roughness: number;
  tilingU: number;
  tilingV: number;
  // Ceramic parameters
  groutColor?: string;
  tileSize?: number; // tiles per UV unit (e.g. 2 = 2x2 tiles per meter)
  groutWidth?: number; // 0.01 to 0.15
  // Wood parameters
  plankVariation?: number; // 0 to 1
}

export interface SceneEntityData {
  id: string;
  name: string;
  category: EntityCategory;
  kind: EntityKind;
  tags: string[];
  visible: boolean;
  locked: boolean;
  position: Vec3;
  rotation: Vec3; // Euler degrees
  scale: Vec3; // Dimensions in meters for primitives, or scale factor for GLB
  baseSize?: Vec3; // Base unscaled bounding dimensions in meters (for GLB)
  polygonPoints?: [number, number][]; // Local XZ points for polygon_floor
  material: MaterialConfig;
  assetId?: string; // IndexedDB key for GLB binary
  assetFileName?: string; // Filename in projects/<name>/assets/
  assetSourceUrl?: string; // Optional remote URL fallback
  lightColor?: string;
  lightIntensity?: number;
}

export type CameraMode = 'perspective' | 'top2d' | 'fps';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ToolMode = 'select' | 'draw_wall' | 'draw_floor' | 'draw_polygon_floor';
export type LightingPreset = 'day' | 'sunset';

export interface SnapConfig {
  enabled: boolean;
  gridStep: number;
  angleStep: number;
  floorClamp: boolean;
}

export interface WallBuildConfig {
  height: number;
  thickness: number;
}

export interface SceneDocument {
  version: number;
  projectName: string;
  lighting: LightingPreset;
  entities: SceneEntityData[];
}

export interface GitBranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

export interface GitCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitConnectionState {
  connected: boolean;
  owner: string;
  repo: string;
  token: string;
  projectName: string;
  userLogin: string;
  userAvatar: string;
  currentBranch: string;
  defaultBranch: string;
  isReadOnlyBranch: boolean;
  branches: GitBranchInfo[];
  commits: GitCommitInfo[];
  statusMessage: string;
  lastError: string | null;
}
