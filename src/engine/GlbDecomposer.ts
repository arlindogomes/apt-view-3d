import * as pc from 'playcanvas';
import {
  EntityCategory,
  GlbPartSelector,
  MaterialConfig,
  SceneEntityData,
  Vec3,
} from '../types/scene';

export interface ExtractedRawPrimitive {
  primIndex: number;
  nodeName: string;
  materialName: string;
  material: pc.Material;
  /** World-transformed positions inside the raw GLB container (3 floats per vertex) */
  positions: Float32Array;
  /** World-transformed normals inside the raw GLB container (3 floats per vertex) */
  normals: Float32Array;
  /** UV0 coordinates (2 floats per vertex) */
  uvs: Float32Array;
  /** Triangle vertex indices (3 ints per triangle) */
  indices: Uint32Array;
  /** Connected-component triangle islands: each entry is an array of triangle indices (0..numTris-1) */
  islands: number[][];
}

export interface ParsedGlbAssetCache {
  assetId: string;
  primitives: ExtractedRawPrimitive[];
  defaultNormScale: number;
  defaultNormOffset: Vec3;
  modelMaxDim: number;
  rawBoundsSize: Vec3;
}

export interface DecomposedGlbPartDescriptor {
  name: string;
  category: EntityCategory;
  tags: string[];
  glbPart: GlbPartSelector;
  baseSize: Vec3;
  /** Offset from model drop point in world meters */
  localCenter: Vec3;
}

/**
 * Cleans up raw glTF node/material names into human-readable labels.
 */
function cleanNodeLabel(raw: string): string {
  return (raw || '')
    .replace(/^RootNode[._/-]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies a 3D sub-element inside a GLB by inspecting its node/material names
 * and its 3D bounding dimensions (width, height, depth).
 */
export function classifyGlbSubElement(
  nodeName: string,
  materialName: string,
  size: Vec3,
  partIndex: number
): { category: EntityCategory; roleLabel: string; tags: string[] } {
  const combined = `${nodeName} ${materialName}`.toLowerCase();
  const [wx, wy, wz] = size;
  const minHoriz = Math.min(wx, wz);
  const maxHoriz = Math.max(wx, wz);

  if (/\b(window|janela|vidro|glass|pane|esquadria|vitral)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Janela', tags: ['glb', 'janela', 'estrutura'] };
  }
  if (/\b(door|porta|portao|portal|gate)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Porta', tags: ['glb', 'porta', 'estrutura'] };
  }
  if (/\b(wall|parede|muro|divisoria|partition|facade|fachada)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Parede', tags: ['glb', 'parede', 'estrutura'] };
  }
  if (/\b(floor|piso|chao|slab|laje|ground|terreno|carpet|tapete)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Piso / Laje', tags: ['glb', 'piso', 'estrutura'] };
  }
  if (/\b(roof|telhado|ceiling|teto|forro|cobertura)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Telhado / Teto', tags: ['glb', 'teto', 'estrutura'] };
  }
  if (/\b(column|pillar|pilar|coluna|beam|viga|post|poste)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Pilar / Viga', tags: ['glb', 'pilar', 'estrutura'] };
  }
  if (/\b(stair|escada|degrau|step|railing|corrimao)\b/i.test(combined)) {
    return { category: 'structure', roleLabel: 'Escada', tags: ['glb', 'escada', 'estrutura'] };
  }
  if (/\b(lamp|light|luminaria|abajur|lustre|bulb|lantern|led)\b/i.test(combined)) {
    return { category: 'lighting', roleLabel: 'Luminária', tags: ['glb', 'iluminacao'] };
  }

  // Geometric heuristics when names are generic (e.g., "Mesh_0", "Object_12")
  if (wy >= 1.8 && minHoriz <= 0.45 && maxHoriz >= 1.2) {
    return { category: 'structure', roleLabel: 'Parede', tags: ['glb', 'parede', 'estrutura'] };
  }
  if (wy >= 1.7 && wy <= 2.5 && minHoriz <= 0.25 && maxHoriz >= 0.65 && maxHoriz <= 1.3) {
    return { category: 'structure', roleLabel: 'Porta / Painel', tags: ['glb', 'porta', 'estrutura'] };
  }
  if (wy <= 0.35 && wx >= 2.0 && wz >= 2.0) {
    return { category: 'structure', roleLabel: 'Piso / Laje', tags: ['glb', 'piso', 'estrutura'] };
  }

  const cleanNode = cleanNodeLabel(nodeName);
  const cleanMat = cleanNodeLabel(materialName);
  const bestLabel =
    cleanNode && !/^(mesh|node|object|primitive|default|root|scene)\s*\d*$/i.test(cleanNode)
      ? cleanNode
      : cleanMat && !/^(material|default|standard|mat)\s*\d*$/i.test(cleanMat)
      ? cleanMat
      : `Elemento #${partIndex + 1}`;

  return {
    category: 'furniture',
    roleLabel: bestLabel,
    tags: ['glb', 'elemento-3d'],
  };
}

/**
 * Finds connected 3D triangle islands using Union-Find on quantized 3D vertex positions (0.5mm tolerance).
 * This ensures triangles sharing a physical 3D edge stay in the same island even across UV/normal seams,
 * while physically separate 3D parts (e.g., separate windows, doors, walls, or cushions) split cleanly.
 */
function computeConnectedTriangleIslands(
  positions: Float32Array,
  indices: Uint32Array
): number[][] {
  const numTris = Math.floor(indices.length / 3);
  if (numTris <= 1) {
    return numTris === 1 ? [[0]] : [];
  }

  const parent = new Int32Array(numTris);
  for (let i = 0; i < numTris; i++) parent[i] = i;

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
  };

  // Map quantized 3D coordinate key -> first triangle index that touched it
  const posKeyToTri = new Map<string, number>();
  const QUANT = 2000; // 0.5 mm precision

  for (let t = 0; t < numTris; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const verts = [i0, i1, i2];

    for (const v of verts) {
      const vx = Math.round(positions[v * 3] * QUANT);
      const vy = Math.round(positions[v * 3 + 1] * QUANT);
      const vz = Math.round(positions[v * 3 + 2] * QUANT);
      const key = `${vx},${vy},${vz}`;
      const prevTri = posKeyToTri.get(key);
      if (prevTri !== undefined) {
        union(t, prevTri);
      } else {
        posKeyToTri.set(key, t);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let t = 0; t < numTris; t++) {
    const r = find(t);
    let list = groups.get(r);
    if (!list) {
      list = [];
      groups.set(r, list);
    }
    list.push(t);
  }

  return Array.from(groups.values());
}

/**
 * Computes the 3D bounding box of a subset of triangles within a primitive.
 */
function computeTrianglesBounds(
  positions: Float32Array,
  indices: Uint32Array,
  triList: number[]
): { min: Vec3; max: Vec3; center: Vec3; size: Vec3; diag: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < triList.length; i++) {
    const t = triList[i] * 3;
    for (let k = 0; k < 3; k++) {
      const v = indices[t + k] * 3;
      const x = positions[v];
      const y = positions[v + 1];
      const z = positions[v + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }

  if (!Number.isFinite(minX)) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: [0.1, 0.1, 0.1],
      diag: 0.1,
    };
  }

  const sx = Math.max(0.01, maxX - minX);
  const sy = Math.max(0.01, maxY - minY);
  const sz = Math.max(0.01, maxZ - minZ);
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
    size: [sx, sy, sz],
    diag: Math.hypot(sx, sy, sz),
  };
}

/**
 * Distance between two 3D Axis-Aligned Bounding Boxes (0 if touching or overlapping).
 */
function aabbDistance(aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3): number {
  const dx = Math.max(0, aMin[0] - bMax[0], bMin[0] - aMax[0]);
  const dy = Math.max(0, aMin[1] - bMax[1], bMin[1] - aMax[1]);
  const dz = Math.max(0, aMin[2] - bMax[2], bMin[2] - aMax[2]);
  return Math.hypot(dx, dy, dz);
}

/**
 * Extracts all primitives and their connected triangle islands from a PlayCanvas ContainerResource.
 */
export function parseGlbContainerPrimitives(
  assetId: string,
  container: pc.ContainerResource,
  modelHintName = ''
): ParsedGlbAssetCache {
  const tempRoot = container.instantiateRenderEntity({
    castShadows: true,
    receiveShadows: true,
  });
  tempRoot.syncHierarchy();

  const renders = tempRoot.findComponents('render') as pc.RenderComponent[];
  const primitives: ExtractedRawPrimitive[] = [];

  let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity;
  let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity;

  const tmpPos = new pc.Vec3();
  const tmpNorm = new pc.Vec3();

  for (const r of renders) {
    for (const mi of r.meshInstances) {
      const mesh = mi.mesh;
      if (!mesh) continue;

      const rawPos: number[] = [];
      const numVerts = mesh.getPositions(rawPos);
      if (!numVerts || rawPos.length < 9) continue;

      const rawNorm: number[] = [];
      mesh.getNormals(rawNorm);

      const rawUv: number[] = [];
      mesh.getUvs(0, rawUv);

      const rawIdx: number[] = [];
      mesh.getIndices(rawIdx);

      const worldMat = mi.node.getWorldTransform().clone();
      const normalMat = worldMat.clone().invert().transpose();

      const positions = new Float32Array(numVerts * 3);
      const normals = new Float32Array(numVerts * 3);
      const uvs = new Float32Array(numVerts * 2);

      for (let v = 0; v < numVerts; v++) {
        tmpPos.set(rawPos[v * 3], rawPos[v * 3 + 1], rawPos[v * 3 + 2]);
        worldMat.transformPoint(tmpPos, tmpPos);
        positions[v * 3] = tmpPos.x;
        positions[v * 3 + 1] = tmpPos.y;
        positions[v * 3 + 2] = tmpPos.z;

        if (tmpPos.x < globalMinX) globalMinX = tmpPos.x;
        if (tmpPos.y < globalMinY) globalMinY = tmpPos.y;
        if (tmpPos.z < globalMinZ) globalMinZ = tmpPos.z;
        if (tmpPos.x > globalMaxX) globalMaxX = tmpPos.x;
        if (tmpPos.y > globalMaxY) globalMaxY = tmpPos.y;
        if (tmpPos.z > globalMaxZ) globalMaxZ = tmpPos.z;

        if (rawNorm.length >= (v + 1) * 3) {
          tmpNorm.set(rawNorm[v * 3], rawNorm[v * 3 + 1], rawNorm[v * 3 + 2]);
          normalMat.transformVector(tmpNorm, tmpNorm);
          tmpNorm.normalize();
          normals[v * 3] = tmpNorm.x;
          normals[v * 3 + 1] = tmpNorm.y;
          normals[v * 3 + 2] = tmpNorm.z;
        } else {
          normals[v * 3] = 0;
          normals[v * 3 + 1] = 1;
          normals[v * 3 + 2] = 0;
        }

        if (rawUv.length >= (v + 1) * 2) {
          uvs[v * 2] = rawUv[v * 2];
          uvs[v * 2 + 1] = rawUv[v * 2 + 1];
        }
      }

      let indices: Uint32Array;
      if (rawIdx.length >= 3) {
        indices = new Uint32Array(rawIdx);
      } else {
        indices = new Uint32Array(numVerts);
        for (let i = 0; i < numVerts; i++) indices[i] = i;
      }

      const islands = computeConnectedTriangleIslands(positions, indices);
      const nodeName = mi.node?.name || r.entity?.name || `Node_${primitives.length}`;
      const materialName = mi.material?.name || '';

      primitives.push({
        primIndex: primitives.length,
        nodeName,
        materialName,
        material: mi.material || new pc.StandardMaterial(),
        positions,
        normals,
        uvs,
        indices,
        islands,
      });
    }
  }

  tempRoot.destroy();

  if (!Number.isFinite(globalMinX)) {
    globalMinX = -0.5; globalMaxX = 0.5;
    globalMinY = 0; globalMaxY = 1;
    globalMinZ = -0.5; globalMaxZ = 0.5;
  }

  const rawW = Math.max(0.001, globalMaxX - globalMinX);
  const rawH = Math.max(0.001, globalMaxY - globalMinY);
  const rawD = Math.max(0.001, globalMaxZ - globalMinZ);
  const maxDim = Math.max(rawW, rawH, rawD);

  // Preserve exact 1:1 real-world glTF scale in meters (1 glTF unit = 1 meter)
  const defaultNormScale = 1.0;

  const cx = (globalMinX + globalMaxX) * 0.5;
  const cz = (globalMinZ + globalMaxZ) * 0.5;
  const defaultNormOffset: Vec3 = [
    Number((-cx * defaultNormScale).toFixed(4)),
    Number((-globalMinY * defaultNormScale).toFixed(4)),
    Number((-cz * defaultNormScale).toFixed(4)),
  ];

  return {
    assetId,
    primitives,
    defaultNormScale,
    defaultNormOffset,
    modelMaxDim: maxDim,
    rawBoundsSize: [
      Number(rawW.toFixed(3)),
      Number(rawH.toFixed(3)),
      Number(rawD.toFixed(3)),
    ],
  };
}

/**
 * Decomposes a parsed GLB asset into individual 3D elements (nodes/primitives + spatially distinct 3D islands).
 * - When `granularity === 'smart'` (default on import):
 *   Every primitive is extracted, AND spatially separated major 3D islands within a primitive
 *   (such as 6 separate windows in a "Windows" mesh or separate doors/walls in a merged house mesh)
 *   are split into independent 3D parts while keeping tiny hardware/details attached to their parent part.
 * - When `granularity === 'fine'` (triggered when user clicks "Desmembrar Sub-Partes" on a specific part):
 *   Splits all connected triangle islands of the target primitive without merging touching sub-parts.
 */
export function buildDecomposedPartDescriptors(
  parsed: ParsedGlbAssetCache,
  baseModelName: string,
  options: {
    granularity?: 'smart' | 'fine';
    onlyPrimIndex?: number;
    filterIslandIndices?: number[];
    normScale?: number;
    normOffset?: Vec3;
    maxTotalParts?: number;
  } = {}
): DecomposedGlbPartDescriptor[] {
  const {
    granularity = 'smart',
    onlyPrimIndex,
    filterIslandIndices,
    normScale = parsed.defaultNormScale,
    normOffset = parsed.defaultNormOffset,
    maxTotalParts = 64,
  } = options;

  const targetPrims =
    onlyPrimIndex !== undefined
      ? parsed.primitives.filter((p) => p.primIndex === onlyPrimIndex)
      : parsed.primitives;

  if (targetPrims.length === 0) return [];

  // Decide whether to split connected islands inside each primitive
  const shouldSplitIslands =
    granularity === 'fine' || targetPrims.length <= 16;

  interface CandidateGroup {
    prim: ExtractedRawPrimitive;
    islandIndices: number[];
    tris: number[];
    bounds: ReturnType<typeof computeTrianglesBounds>;
  }

  const candidates: CandidateGroup[] = [];

  for (const prim of targetPrims) {
    const allowedIslandSet = filterIslandIndices ? new Set(filterIslandIndices) : null;
    const rawIslands = prim.islands
      .map((tris, idx) => ({ idx, tris }))
      .filter((item) => !allowedIslandSet || allowedIslandSet.has(item.idx));

    if (!shouldSplitIslands || rawIslands.length <= 1) {
      const allTris = rawIslands.flatMap((i) => i.tris);
      const allIdxs =
        allowedIslandSet !== null ? rawIslands.map((i) => i.idx) : undefined;
      candidates.push({
        prim,
        islandIndices: allIdxs || [],
        tris: allTris,
        bounds: computeTrianglesBounds(prim.positions, prim.indices, allTris),
      });
      continue;
    }

    // Compute bounds for each island in raw coordinates
    const islandMetas = rawIslands.map((item) => ({
      idx: item.idx,
      tris: item.tris,
      bounds: computeTrianglesBounds(prim.positions, prim.indices, item.tris),
    }));

    // Sort largest islands first
    islandMetas.sort((a, b) => b.bounds.diag - a.bounds.diag);

    const minMajorDiag =
      granularity === 'fine'
        ? (parsed.modelMaxDim / normScale) * 0.008
        : (parsed.modelMaxDim / normScale) * 0.045;

    const majorClusters: Array<{
      islandIndices: number[];
      tris: number[];
      bounds: ReturnType<typeof computeTrianglesBounds>;
    }> = [];
    const minorIslands: typeof islandMetas = [];

    for (const meta of islandMetas) {
      const isMajor =
        majorClusters.length === 0 ||
        (meta.bounds.diag >= minMajorDiag &&
          meta.tris.length >= 4 &&
          majorClusters.length < 32);

      if (!isMajor) {
        minorIslands.push(meta);
        continue;
      }

      // In 'smart' mode, if this island touches or overlaps an existing major cluster of the SAME primitive
      // within 2mm (e.g. door frame + door panel in the same material primitive), merge if very close
      const mergeTouchDist =
        granularity === 'fine' ? -1 : (parsed.modelMaxDim / normScale) * 0.002;

      let mergedIntoExisting = false;
      if (mergeTouchDist >= 0) {
        for (const cluster of majorClusters) {
          const dist = aabbDistance(
            meta.bounds.min,
            meta.bounds.max,
            cluster.bounds.min,
            cluster.bounds.max
          );
          if (dist <= mergeTouchDist) {
            cluster.islandIndices.push(meta.idx);
            for (let k = 0; k < meta.tris.length; k++) cluster.tris.push(meta.tris[k]);
            cluster.bounds = computeTrianglesBounds(
              prim.positions,
              prim.indices,
              cluster.tris
            );
            mergedIntoExisting = true;
            break;
          }
        }
      }

      if (!mergedIntoExisting) {
        majorClusters.push({
          islandIndices: [meta.idx],
          tris: [...meta.tris],
          bounds: meta.bounds,
        });
      }
    }

    // Attach minor islands (screws, handles, small trim pieces) to the nearest major cluster
    for (const minor of minorIslands) {
      let bestCluster = majorClusters[0];
      let bestDist = Infinity;
      for (const cluster of majorClusters) {
        const d = aabbDistance(
          minor.bounds.min,
          minor.bounds.max,
          cluster.bounds.min,
          cluster.bounds.max
        );
        if (d < bestDist) {
          bestDist = d;
          bestCluster = cluster;
        }
      }
      bestCluster.islandIndices.push(minor.idx);
      for (let k = 0; k < minor.tris.length; k++) bestCluster.tris.push(minor.tris[k]);
    }

    // Recompute final bounds for each cluster in this primitive
    const takesEntirePrim = majorClusters.length === 1 && !allowedIslandSet;
    for (const cluster of majorClusters) {
      cluster.islandIndices.sort((a, b) => a - b);
      candidates.push({
        prim,
        islandIndices: takesEntirePrim ? [] : cluster.islandIndices,
        tris: cluster.tris,
        bounds: computeTrianglesBounds(prim.positions, prim.indices, cluster.tris),
      });
    }
  }

  // Cap total parts to maxTotalParts by merging smallest overflow parts if needed
  while (candidates.length > maxTotalParts) {
    candidates.sort((a, b) => b.bounds.diag - a.bounds.diag);
    const smallest = candidates.pop()!;
    // Find another candidate with the same primIndex if possible
    const target =
      candidates.find((c) => c.prim.primIndex === smallest.prim.primIndex) ||
      candidates[candidates.length - 1];
    if (target.prim.primIndex === smallest.prim.primIndex) {
      const mergedSet = new Set([...target.islandIndices, ...smallest.islandIndices]);
      target.islandIndices = Array.from(mergedSet).sort((a, b) => a - b);
      for (let k = 0; k < smallest.tris.length; k++) target.tris.push(smallest.tris[k]);
      target.bounds = computeTrianglesBounds(
        target.prim.positions,
        target.prim.indices,
        target.tris
      );
    }
  }

  // Build final descriptors with normalized meter coordinates and smart architectural classification
  const descriptors: DecomposedGlbPartDescriptor[] = [];
  const roleCounts = new Map<string, number>();

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const scaledSize: Vec3 = [
      Number(Math.max(0.02, c.bounds.size[0] * normScale).toFixed(3)),
      Number(Math.max(0.02, c.bounds.size[1] * normScale).toFixed(3)),
      Number(Math.max(0.02, c.bounds.size[2] * normScale).toFixed(3)),
    ];
    const localCenter: Vec3 = [
      Number((c.bounds.center[0] * normScale + normOffset[0]).toFixed(4)),
      Number((c.bounds.center[1] * normScale + normOffset[1]).toFixed(4)),
      Number((c.bounds.center[2] * normScale + normOffset[2]).toFixed(4)),
    ];

    const classification = classifyGlbSubElement(
      c.prim.nodeName,
      c.prim.materialName,
      scaledSize,
      i
    );

    const count = (roleCounts.get(classification.roleLabel) || 0) + 1;
    roleCounts.set(classification.roleLabel, count);

    const partDisplayName =
      candidates.length === 1
        ? baseModelName
        : `${baseModelName} — ${classification.roleLabel}${count > 1 ? ` ${count}` : ''}`;

    descriptors.push({
      name: partDisplayName,
      category: classification.category,
      tags: classification.tags,
      baseSize: scaledSize,
      localCenter,
      glbPart: {
        primIndex: c.prim.primIndex,
        ...(c.islandIndices.length > 0 ? { islandIndices: c.islandIndices } : {}),
        normScale,
        normOffset,
        localCenter,
      },
    });
  }

  return descriptors;
}

/**
 * Constructs a PlayCanvas `pc.Mesh` + `pc.Material` for a specific `GlbPartSelector`,
 * with all vertex positions centered around `(0, 0, 0)` (by subtracting `glbPart.localCenter`).
 */
export function buildCenteredMeshForGlbPart(
  device: pc.GraphicsDevice,
  parsed: ParsedGlbAssetCache,
  glbPart: GlbPartSelector
): {
  mesh: pc.Mesh;
  material: pc.Material;
  localPositions: Float32Array;
  localIndices: Uint32Array;
} | null {
  const prim =
    parsed.primitives[glbPart.primIndex] || parsed.primitives[0];
  if (!prim) return null;

  const { normScale, normOffset, localCenter, islandIndices } = glbPart;

  // Determine which triangles belong to this part
  let selectedTris: number[];
  if (islandIndices && islandIndices.length > 0 && prim.islands.length > 0) {
    selectedTris = [];
    for (const islIdx of islandIndices) {
      const isl = prim.islands[islIdx];
      if (isl) {
        for (let k = 0; k < isl.length; k++) selectedTris.push(isl[k]);
      }
    }
    if (selectedTris.length === 0) {
      const numTris = Math.floor(prim.indices.length / 3);
      selectedTris = Array.from({ length: numTris }, (_, i) => i);
    }
  } else {
    const numTris = Math.floor(prim.indices.length / 3);
    selectedTris = Array.from({ length: numTris }, (_, i) => i);
  }

  // Remap only referenced vertices into a compact vertex buffer
  const oldToNewVert = new Map<number, number>();
  const newIndices = new Uint32Array(selectedTris.length * 3);
  const posList: number[] = [];
  const normList: number[] = [];
  const uvList: number[] = [];

  const offX = normOffset[0] - localCenter[0];
  const offY = normOffset[1] - localCenter[1];
  const offZ = normOffset[2] - localCenter[2];

  for (let t = 0; t < selectedTris.length; t++) {
    const triBase = selectedTris[t] * 3;
    for (let k = 0; k < 3; k++) {
      const oldV = prim.indices[triBase + k];
      let newV = oldToNewVert.get(oldV);
      if (newV === undefined) {
        newV = posList.length / 3;
        oldToNewVert.set(oldV, newV);

        const px = prim.positions[oldV * 3] * normScale + offX;
        const py = prim.positions[oldV * 3 + 1] * normScale + offY;
        const pz = prim.positions[oldV * 3 + 2] * normScale + offZ;
        posList.push(px, py, pz);

        normList.push(
          prim.normals[oldV * 3],
          prim.normals[oldV * 3 + 1],
          prim.normals[oldV * 3 + 2]
        );

        uvList.push(prim.uvs[oldV * 2], prim.uvs[oldV * 2 + 1]);
      }
      newIndices[t * 3 + k] = newV;
    }
  }

  const mesh = new pc.Mesh(device);
  const localPositions = new Float32Array(posList);
  mesh.setPositions(localPositions);
  mesh.setNormals(new Float32Array(normList));
  mesh.setUvs(0, new Float32Array(uvList));
  mesh.setIndices(newIndices);
  mesh.update();

  return {
    mesh,
    material: prim.material,
    localPositions,
    localIndices: newIndices,
  };
}

/**
 * Helper to create `SceneEntityData` inputs from decomposed part descriptors.
 */
export function descriptorsToEntityInputs(
  descriptors: DecomposedGlbPartDescriptor[],
  params: {
    assetId: string;
    assetFileName: string;
    assetSourceUrl?: string;
    assetAuthor?: string;
    assetLicense?: string;
    groupId?: string;
    groupName?: string;
    dropPosition?: Vec3;
    defaultMaterial: MaterialConfig;
  }
): Array<Omit<SceneEntityData, 'id'>> {
  const drop = params.dropPosition || [0, 0.1, 0];
  return descriptors.map((desc) => ({
    name: desc.name,
    category: desc.category,
    kind: 'glb',
    tags: desc.tags,
    visible: true,
    locked: false,
    position: [
      Number((drop[0] + desc.localCenter[0]).toFixed(4)),
      Number((drop[1] + desc.localCenter[1]).toFixed(4)),
      Number((drop[2] + desc.localCenter[2]).toFixed(4)),
    ],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    baseSize: desc.baseSize,
    material: { ...params.defaultMaterial },
    assetId: params.assetId,
    assetFileName: params.assetFileName,
    assetSourceUrl: params.assetSourceUrl,
    assetAuthor: params.assetAuthor,
    assetLicense: params.assetLicense,
    glbPart: desc.glbPart,
    groupId: params.groupId,
    groupName: params.groupName,
  }));
}
