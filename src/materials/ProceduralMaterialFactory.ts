import * as pc from 'playcanvas';
import { MaterialConfig } from '../types/scene';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [220, 220, 220];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Smooth quintic interpolation for silky, noise-free transitions
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const a = hash2D(x0, y0);
  const b = hash2D(x1, y0);
  const c = hash2D(x0, y1);
  const d = hash2D(x1, y1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function smoothFbm(u: number, v: number, baseFreq: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.55;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * freq, v * freq, freq);
    norm += amp;
    amp *= 0.45;
    freq *= 2;
  }
  return sum / norm;
}

interface GeneratedMaps {
  albedoCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
}

export class ProceduralMaterialFactory {
  private device: pc.GraphicsDevice;
  private cache = new Map<string, pc.StandardMaterial>();

  constructor(device: pc.GraphicsDevice) {
    this.device = device;
  }

  private getCacheKey(cfg: MaterialConfig): string {
    return JSON.stringify({
      preset: cfg.preset,
      color: cfg.color,
      roughness: Number(cfg.roughness.toFixed(2)),
      tilingU: Number(cfg.tilingU.toFixed(2)),
      tilingV: Number(cfg.tilingV.toFixed(2)),
      groutColor: cfg.groutColor || '',
      tileSize: cfg.tileSize || 2,
      groutWidth: cfg.groutWidth || 0.04,
      plankVariation: cfg.plankVariation || 0.35,
    });
  }

  public getMaterial(cfg: MaterialConfig): pc.StandardMaterial {
    const key = this.getCacheKey(cfg);
    const existing = this.cache.get(key);
    if (existing) return existing;

    const maps = this.synthesizeMaps(cfg);
    const mat = new pc.StandardMaterial();

    const diffuseTex = this.createTexture(maps.albedoCanvas, true);
    const normalTex = this.createTexture(maps.normalCanvas, false);
    const glossTex = this.createTexture(maps.roughnessCanvas, false);

    mat.diffuseMap = diffuseTex;
    mat.normalMap = normalTex;
    // Smooth, subtle architectural normal relief (no harsh grain)
    mat.bumpiness =
      cfg.preset === 'wall'
        ? 0.08
        : cfg.preset === 'concrete'
        ? 0.14
        : cfg.preset === 'wood'
        ? 0.16
        : 0.22;

    mat.glossMap = glossTex;
    mat.glossMapChannel = 'r';
    mat.gloss = 1.0;
    mat.useMetalness = true;
    mat.metalness = cfg.preset === 'ceramic' ? 0.03 : 0.0;

    const tiling = new pc.Vec2(Math.max(0.05, cfg.tilingU), Math.max(0.05, cfg.tilingV));
    mat.diffuseMapTiling = tiling;
    mat.normalMapTiling = tiling;
    mat.glossMapTiling = tiling;

    mat.update();
    this.cache.set(key, mat);
    return mat;
  }

  private createTexture(canvas: HTMLCanvasElement, srgb: boolean): pc.Texture {
    const tex = new pc.Texture(this.device, {
      width: canvas.width,
      height: canvas.height,
      format: pc.PIXELFORMAT_RGBA8,
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_REPEAT,
      srgb,
    });
    tex.setSource(canvas);
    return tex;
  }

  private synthesizeMaps(cfg: MaterialConfig): GeneratedMaps {
    const size = 256;
    const albedoCanvas = document.createElement('canvas');
    albedoCanvas.width = size;
    albedoCanvas.height = size;
    const albedoCtx = albedoCanvas.getContext('2d')!;
    const albedoImg = albedoCtx.createImageData(size, size);

    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = size;
    roughnessCanvas.height = size;
    const roughCtx = roughnessCanvas.getContext('2d')!;
    const roughImg = roughCtx.createImageData(size, size);

    const heightField = new Float32Array(size * size);
    const [baseR, baseG, baseB] = hexToRgb(cfg.color);

    if (cfg.preset === 'ceramic') {
      const tiles = Math.max(1, Math.round(cfg.tileSize ?? 2));
      const groutWidth = Math.max(0.01, Math.min(0.16, cfg.groutWidth ?? 0.04));
      const [gR, gG, gB] = hexToRgb(cfg.groutColor || '#9aa0a8');

      for (let y = 0; y < size; y++) {
        const v = y / size;
        const ty = v * tiles;
        const fy = ty - Math.floor(ty);
        const tileRow = Math.floor(ty);

        for (let x = 0; x < size; x++) {
          const u = x / size;
          const tx = u * tiles;
          const fx = tx - Math.floor(tx);
          const tileCol = Math.floor(tx);

          const isGrout =
            fx < groutWidth || fx > 1 - groutWidth || fy < groutWidth || fy > 1 - groutWidth;

          const idx = y * size + x;
          const p = idx * 4;

          if (isGrout) {
            albedoImg.data[p] = clampByte(gR);
            albedoImg.data[p + 1] = clampByte(gG);
            albedoImg.data[p + 2] = clampByte(gB);
            albedoImg.data[p + 3] = 255;

            heightField[idx] = 0.25;
            const glossByte = clampByte((1 - 0.88) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          } else {
            const tileTint = (hash2D(tileCol * 13, tileRow * 29) - 0.5) * 5;
            const softCloud = (smoothFbm(u, v, 4, 2) - 0.5) * 6;
            albedoImg.data[p] = clampByte(baseR + tileTint + softCloud);
            albedoImg.data[p + 1] = clampByte(baseG + tileTint + softCloud);
            albedoImg.data[p + 2] = clampByte(baseB + tileTint + softCloud);
            albedoImg.data[p + 3] = 255;

            const edgeDist = Math.min(
              fx - groutWidth,
              1 - groutWidth - fx,
              fy - groutWidth,
              1 - groutWidth - fy
            );
            const bevel = Math.min(1, edgeDist / 0.035);
            heightField[idx] = 0.72 + 0.28 * bevel;

            const localRough = Math.max(0.06, Math.min(1, cfg.roughness + softCloud * 0.002));
            const glossByte = clampByte((1 - localRough) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          }
        }
      }
    } else if (cfg.preset === 'wood') {
      const planks = 6;
      const variation = cfg.plankVariation ?? 0.35;

      for (let y = 0; y < size; y++) {
        const v = y / size;
        const plankY = v * planks;
        const plankRow = Math.floor(plankY);
        const py = plankY - plankRow;
        const rowOffset = hash2D(plankRow * 17, 3) * 0.7;

        for (let x = 0; x < size; x++) {
          const u = x / size;
          const shiftedU = (u + rowOffset) % 1;
          const seamX = shiftedU < 0.006 || shiftedU > 0.994;
          const seamY = py < 0.018 || py > 0.982;

          const idx = y * size + x;
          const p = idx * 4;

          // Silky longitudinal wood grain
          const warp = smoothFbm(u, v * 3, 4, 2) * 0.22;
          const grainWave = Math.sin((py * 12 + warp * 10 + plankRow * 2.1) * Math.PI);
          const plankTint =
            (hash2D(plankRow * 11, Math.floor(u + rowOffset)) - 0.5) * 28 * variation;

          if (seamX || seamY) {
            albedoImg.data[p] = clampByte(baseR * 0.62);
            albedoImg.data[p + 1] = clampByte(baseG * 0.62);
            albedoImg.data[p + 2] = clampByte(baseB * 0.62);
            albedoImg.data[p + 3] = 255;
            heightField[idx] = 0.25;

            const glossByte = clampByte((1 - 0.85) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          } else {
            const delta = grainWave * 8 + plankTint;
            albedoImg.data[p] = clampByte(baseR + delta);
            albedoImg.data[p + 1] = clampByte(baseG + delta * 0.88);
            albedoImg.data[p + 2] = clampByte(baseB + delta * 0.72);
            albedoImg.data[p + 3] = 255;

            heightField[idx] = 0.65 + grainWave * 0.06;

            const localRough = Math.max(0.12, Math.min(1, cfg.roughness + grainWave * 0.03));
            const glossByte = clampByte((1 - localRough) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          }
        }
      }
    } else if (cfg.preset === 'concrete') {
      // Smooth architectural concrete (cimento queimado suave)
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const idx = y * size + x;
          const p = idx * 4;

          const macro = smoothFbm(u, v, 4, 3);
          const subtle = smoothFbm(u, v, 10, 2);
          const shade = (macro - 0.5) * 18 + (subtle - 0.5) * 7;

          albedoImg.data[p] = clampByte(baseR + shade);
          albedoImg.data[p + 1] = clampByte(baseG + shade);
          albedoImg.data[p + 2] = clampByte(baseB + shade);
          albedoImg.data[p + 3] = 255;

          heightField[idx] = 0.5 + (macro - 0.5) * 0.14 + (subtle - 0.5) * 0.06;

          const localRough = Math.max(0.2, Math.min(1, cfg.roughness + (macro - 0.5) * 0.06));
          const glossByte = clampByte((1 - localRough) * 255);
          roughImg.data[p] = glossByte;
          roughImg.data[p + 1] = glossByte;
          roughImg.data[p + 2] = glossByte;
          roughImg.data[p + 3] = 255;
        }
      }
    } else {
      // Smooth matte painted wall / plaster (textura lisa e suave)
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const idx = y * size + x;
          const p = idx * 4;

          const softCloud = (smoothFbm(u, v, 4, 2) - 0.5) * 5;
          albedoImg.data[p] = clampByte(baseR + softCloud);
          albedoImg.data[p + 1] = clampByte(baseG + softCloud);
          albedoImg.data[p + 2] = clampByte(baseB + softCloud);
          albedoImg.data[p + 3] = 255;

          heightField[idx] = 0.5 + softCloud * 0.015;

          const localRough = Math.max(0.15, Math.min(1, cfg.roughness));
          const glossByte = clampByte((1 - localRough) * 255);
          roughImg.data[p] = glossByte;
          roughImg.data[p + 1] = glossByte;
          roughImg.data[p + 2] = glossByte;
          roughImg.data[p + 3] = 255;
        }
      }
    }

    albedoCtx.putImageData(albedoImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);

    // Build gentle tangent-space Normal Map from heightField
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d')!;
    const normalImg = normalCtx.createImageData(size, size);
    const strength = cfg.preset === 'ceramic' ? 1.4 : cfg.preset === 'wood' ? 0.9 : 0.6;

    for (let y = 0; y < size; y++) {
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;

        const hL = heightField[y * size + xm];
        const hR = heightField[y * size + xp];
        const hD = heightField[ym * size + x];
        const hU = heightField[yp * size + x];

        let nx = (hL - hR) * strength;
        let ny = (hD - hU) * strength;
        let nz = 1.0;
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        const p = (y * size + x) * 4;
        normalImg.data[p] = clampByte((nx * 0.5 + 0.5) * 255);
        normalImg.data[p + 1] = clampByte((ny * 0.5 + 0.5) * 255);
        normalImg.data[p + 2] = clampByte((nz * 0.5 + 0.5) * 255);
        normalImg.data[p + 3] = 255;
      }
    }
    normalCtx.putImageData(normalImg, 0, 0);

    return { albedoCanvas, normalCanvas, roughnessCanvas };
  }

  public dispose(): void {
    this.cache.forEach((mat) => {
      mat.diffuseMap?.destroy();
      mat.normalMap?.destroy();
      mat.glossMap?.destroy();
      mat.destroy();
    });
    this.cache.clear();
  }
}
