import * as pc from 'playcanvas';

/**
 * Computes ray intersection with a horizontal plane Y = planeY.
 */
export function intersectRayPlaneY(
  ray: pc.Ray,
  planeY = 0
): pc.Vec3 | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = (planeY - ray.origin.y) / ray.direction.y;
  if (t < 0) return null;
  return new pc.Vec3(
    ray.origin.x + ray.direction.x * t,
    planeY,
    ray.origin.z + ray.direction.z * t
  );
}

/**
 * Ray vs Axis-Aligned Bounding Box intersection distance (returns t >= 0 or null).
 */
export function intersectRayAABB(ray: pc.Ray, aabb: pc.BoundingBox): number | null {
  const min = aabb.getMin();
  const max = aabb.getMax();
  let tmin = -Infinity;
  let tmax = Infinity;

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const axis of axes) {
    const dir = ray.direction[axis];
    const orig = ray.origin[axis];
    if (Math.abs(dir) < 1e-8) {
      if (orig < min[axis] || orig > max[axis]) return null;
    } else {
      let t1 = (min[axis] - orig) / dir;
      let t2 = (max[axis] - orig) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }

  return tmax >= 0 ? Math.max(0, tmin) : null;
}

/**
 * Möller–Trumbore ray-triangle intersection against local-space mesh buffers.
 * Transforms the world-space ray into the entity's local space and returns the closest
 * world-space distance `t` along `worldRay`, or `null` if no triangle is hit.
 */
export function intersectRayTriangleMeshWorld(
  worldRay: pc.Ray,
  entityWorldTransform: pc.Mat4,
  localPositions: Float32Array,
  localIndices: Uint32Array
): number | null {
  const invMat = entityWorldTransform.clone().invert();
  const localOrig = new pc.Vec3();
  const worldEnd = new pc.Vec3(
    worldRay.origin.x + worldRay.direction.x,
    worldRay.origin.y + worldRay.direction.y,
    worldRay.origin.z + worldRay.direction.z
  );
  const localEnd = new pc.Vec3();

  invMat.transformPoint(worldRay.origin, localOrig);
  invMat.transformPoint(worldEnd, localEnd);

  const localDir = localEnd.sub(localOrig);
  const dirLen = localDir.length();
  if (dirLen < 1e-8) return null;
  localDir.mulScalar(1 / dirLen);

  const EPS = 1e-7;
  let bestLocalT = Infinity;

  const numTris = Math.floor(localIndices.length / 3);
  for (let i = 0; i < numTris; i++) {
    const i0 = localIndices[i * 3] * 3;
    const i1 = localIndices[i * 3 + 1] * 3;
    const i2 = localIndices[i * 3 + 2] * 3;

    const v0x = localPositions[i0], v0y = localPositions[i0 + 1], v0z = localPositions[i0 + 2];
    const e1x = localPositions[i1] - v0x;
    const e1y = localPositions[i1 + 1] - v0y;
    const e1z = localPositions[i1 + 2] - v0z;
    const e2x = localPositions[i2] - v0x;
    const e2y = localPositions[i2 + 1] - v0y;
    const e2z = localPositions[i2 + 2] - v0z;

    // h = localDir x e2
    const hx = localDir.y * e2z - localDir.z * e2y;
    const hy = localDir.z * e2x - localDir.x * e2z;
    const hz = localDir.x * e2y - localDir.y * e2x;

    const a = e1x * hx + e1y * hy + e1z * hz;
    if (a > -EPS && a < EPS) continue;

    const f = 1.0 / a;
    const sx = localOrig.x - v0x;
    const sy = localOrig.y - v0y;
    const sz = localOrig.z - v0z;

    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0.0 || u > 1.0) continue;

    // q = s x e1
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;

    const v = f * (localDir.x * qx + localDir.y * qy + localDir.z * qz);
    if (v < 0.0 || u + v > 1.0) continue;

    const tLocal = f * (e2x * qx + e2y * qy + e2z * qz);
    if (tLocal > EPS && tLocal < bestLocalT) {
      bestLocalT = tLocal;
    }
  }

  if (!Number.isFinite(bestLocalT)) return null;
  // Convert local distance back to world-ray distance
  return bestLocalT / dirLen;
}

/**
 * Computes combined world-space BoundingBox of all mesh instances under an entity.
 */
export function computeEntityWorldAABB(entity: pc.Entity): pc.BoundingBox | null {
  const renders = entity.findComponents('render') as pc.RenderComponent[];
  let combined: pc.BoundingBox | null = null;

  for (const r of renders) {
    if (!r.enabled) continue;
    for (const mi of r.meshInstances) {
      if (!combined) {
        combined = new pc.BoundingBox();
        combined.copy(mi.aabb);
      } else {
        combined.add(mi.aabb);
      }
    }
  }
  return combined;
}

/**
 * Simple ear-clipping triangulation for a 2D polygon in XZ plane.
 */
function triangulateXZ(points: [number, number][]): number[] {
  const n = points.length;
  if (n < 3) return [];

  // Ensure counter-clockwise winding in XZ
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % n];
    area += x1 * z2 - x2 * z1;
  }

  const indices = Array.from({ length: n }, (_, i) => i);
  if (area < 0) indices.reverse();

  const triangles: number[] = [];

  const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  const pointInTri = (
    p: [number, number],
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ) => {
    const c1 = cross(a, b, p);
    const c2 = cross(b, c, p);
    const c3 = cross(c, a, p);
    return c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6;
  };

  let guard = 0;
  while (indices.length > 3 && guard < 500) {
    guard++;
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const prevIdx = indices[(i - 1 + indices.length) % indices.length];
      const currIdx = indices[i];
      const nextIdx = indices[(i + 1) % indices.length];

      const a = points[prevIdx];
      const b = points[currIdx];
      const c = points[nextIdx];

      if (cross(a, b, c) <= 1e-6) continue;

      let containsOther = false;
      for (let j = 0; j < indices.length; j++) {
        const testIdx = indices[j];
        if (testIdx === prevIdx || testIdx === currIdx || testIdx === nextIdx) continue;
        if (pointInTri(points[testIdx], a, b, c)) {
          containsOther = true;
          break;
        }
      }

      if (!containsOther) {
        triangles.push(prevIdx, currIdx, nextIdx);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
  }

  if (indices.length === 3) {
    triangles.push(indices[0], indices[1], indices[2]);
  }
  return triangles;
}

/**
 * Creates an extruded 3D slab pc.Mesh from 2D local XZ polygon points.
 */
export function createPolygonSlabMesh(
  device: pc.GraphicsDevice,
  points: [number, number][],
  thickness = 0.1
): pc.Mesh {
  const halfH = thickness * 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const triIndices = triangulateXZ(points);

  // Top face (+Y)
  const topOffset = 0;
  for (const [x, z] of points) {
    positions.push(x, halfH, z);
    normals.push(0, 1, 0);
    uvs.push(x * 0.5, z * 0.5);
  }
  for (let i = 0; i < triIndices.length; i += 3) {
    // Flip winding so normal points +Y
    indices.push(
      topOffset + triIndices[i],
      topOffset + triIndices[i + 2],
      topOffset + triIndices[i + 1]
    );
  }

  // Bottom face (-Y)
  const botOffset = positions.length / 3;
  for (const [x, z] of points) {
    positions.push(x, -halfH, z);
    normals.push(0, -1, 0);
    uvs.push(x * 0.5, z * 0.5);
  }
  for (let i = 0; i < triIndices.length; i += 3) {
    indices.push(
      botOffset + triIndices[i],
      botOffset + triIndices[i + 1],
      botOffset + triIndices[i + 2]
    );
  }

  // Side walls
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % points.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;

    const base = positions.length / 3;
    positions.push(x1, -halfH, z1, x2, -halfH, z2, x2, halfH, z2, x1, halfH, z1);
    normals.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
    uvs.push(0, 0, len * 0.5, 0, len * 0.5, thickness * 0.5, 0, thickness * 0.5);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}
