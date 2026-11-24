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

// Deterministic pseudo-random hash for procedural noise
function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

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

function fbmTileable(u: number, v: number, baseFreq: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * freq, v * freq, freq);
    norm += amp;
    amp *= 0.5;
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
    mat.bumpiness = cfg.preset === 'wall' ? 0.45 : cfg.preset === 'concrete' ? 0.7 : 0.65;

    // PlayCanvas StandardMaterial uses glossMap (higher = glossier) or useMetalness + gloss
    // We invert roughness into gloss in roughnessCanvas so roughness directly controls appearance
    mat.glossMap = glossTex;
    mat.glossMapChannel = 'r';
    mat.gloss = 1.0;
    mat.useMetalness = true;
    mat.metalness = cfg.preset === 'ceramic' ? 0.04 : 0.0;

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
      const groutWidth = Math.max(0.01, Math.min(0.18, cfg.groutWidth ?? 0.04));
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
            const grain = (hash2D(x * 0.7, y * 0.7) - 0.5) * 18;
            albedoImg.data[p] = clampByte(gR + grain);
            albedoImg.data[p + 1] = clampByte(gG + grain);
            albedoImg.data[p + 2] = clampByte(gB + grain);
            albedoImg.data[p + 3] = 255;

            heightField[idx] = 0.15 + hash2D(x, y) * 0.08;
            // Grout is matte (high roughness -> low gloss)
            const glossByte = clampByte((1 - 0.92) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          } else {
            const tileTint = (hash2D(tileCol * 13, tileRow * 29) - 0.5) * 10;
            const subtleMarble = (fbmTileable(u, v, 8, 3) - 0.5) * 14;
            albedoImg.data[p] = clampByte(baseR + tileTint + subtleMarble);
            albedoImg.data[p + 1] = clampByte(baseG + tileTint + subtleMarble);
            albedoImg.data[p + 2] = clampByte(baseB + tileTint + subtleMarble);
            albedoImg.data[p + 3] = 255;

            // Slight bevel near grout
            const edgeDist = Math.min(
              fx - groutWidth,
              1 - groutWidth - fx,
              fy - groutWidth,
              1 - groutWidth - fy
            );
            const bevel = Math.min(1, edgeDist / 0.04);
            heightField[idx] = 0.65 + 0.35 * bevel + subtleMarble * 0.002;

            const localRough = Math.max(0.05, Math.min(1, cfg.roughness + subtleMarble * 0.004));
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
          const seamX = shiftedU < 0.008 || shiftedU > 0.992;
          const seamY = py < 0.025 || py > 0.975;

          const idx = y * size + x;
          const p = idx * 4;

          // Longitudinal wood grain waves
          const warp = fbmTileable(u * 1.5, v * 6, 4, 3) * 0.25;
          const grainWave = Math.sin((py * 18 + warp * 14 + plankRow * 2.1) * Math.PI);
          const fineGrain = (fbmTileable(u * 2, v * 16, 8, 2) - 0.5) * 18;
          const plankTint = (hash2D(plankRow * 11, Math.floor(u + rowOffset)) - 0.5) * 48 * variation;

          if (seamX || seamY) {
            albedoImg.data[p] = clampByte(baseR * 0.42);
            albedoImg.data[p + 1] = clampByte(baseG * 0.42);
            albedoImg.data[p + 2] = clampByte(baseB * 0.42);
            albedoImg.data[p + 3] = 255;
            heightField[idx] = 0.1;

            const glossByte = clampByte((1 - 0.9) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          } else {
            const delta = grainWave * 16 + fineGrain + plankTint;
            albedoImg.data[p] = clampByte(baseR + delta);
            albedoImg.data[p + 1] = clampByte(baseG + delta * 0.85);
            albedoImg.data[p + 2] = clampByte(baseB + delta * 0.65);
            albedoImg.data[p + 3] = 255;

            heightField[idx] = 0.6 + grainWave * 0.12 + fineGrain * 0.005;

            const localRough = Math.max(0.1, Math.min(1, cfg.roughness + grainWave * 0.07));
            const glossByte = clampByte((1 - localRough) * 255);
            roughImg.data[p] = glossByte;
            roughImg.data[p + 1] = glossByte;
            roughImg.data[p + 2] = glossByte;
            roughImg.data[p + 3] = 255;
          }
        }
      }
    } else if (cfg.preset === 'concrete') {
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const idx = y * size + x;
          const p = idx * 4;

          const macro = fbmTileable(u, v, 6, 4);
          const micro = fbmTileable(u, v, 24, 3);
          const poreNoise = hash2D(x * 1.3, y * 1.7);
          const isPore = poreNoise > 0.985;

          const shade = (macro - 0.5) * 44 + (micro - 0.5) * 26 - (isPore ? 32 : 0);
          albedoImg.data[p] = clampByte(baseR + shade);
          albedoImg.data[p + 1] = clampByte(baseG + shade);
          albedoImg.data[p + 2] = clampByte(baseB + shade);
          albedoImg.data[p + 3] = 255;

          heightField[idx] = isPore ? 0.15 : 0.5 + (macro - 0.5) * 0.35 + (micro - 0.5) * 0.25;

          const localRough = Math.max(0.2, Math.min(1, cfg.roughness + (micro - 0.5) * 0.12));
          const glossByte = clampByte((1 - localRough) * 255);
          roughImg.data[p] = glossByte;
          roughImg.data[p + 1] = glossByte;
          roughImg.data[p + 2] = glossByte;
          roughImg.data[p + 3] = 255;
        }
      }
    } else {
      // 'wall' (plaster / masonry micro-grain)
      for (let y = 0; y < size; y++) {
        const v = y / size;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const idx = y * size + x;
          const p = idx * 4;

          const plaster = fbmTileable(u, v, 10, 3);
          const grain = (hash2D(x, y) - 0.5) * 9;
          const delta = (plaster - 0.5) * 14 + grain;

          albedoImg.data[p] = clampByte(baseR + delta);
          albedoImg.data[p + 1] = clampByte(baseG + delta);
          albedoImg.data[p + 2] = clampByte(baseB + delta);
          albedoImg.data[p + 3] = 255;

          heightField[idx] = 0.5 + (plaster - 0.5) * 0.25 + grain * 0.015;

          const localRough = Math.max(0.15, Math.min(1, cfg.roughness + (plaster - 0.5) * 0.06));
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

    // Build tangent-space Normal Map from heightField via Sobel filter
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d')!;
    const normalImg = normalCtx.createImageData(size, size);
    const strength = cfg.preset === 'ceramic' ? 2.8 : cfg.preset === 'concrete' ? 2.2 : 1.5;

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
