import * as pc from 'playcanvas';
import { LightingPreset } from '../types/scene';

export interface HdriPresetMeta {
  id: LightingPreset;
  name: string;
  subtitle: string;
  previewGradient: string;
  zenithColor: string;
  horizonColor: string;
  groundColor: string;
  softboxes: Array<{
    x: number; // 0..1
    y: number; // 0..1
    rx: number;
    ry: number;
    color: string;
    alpha: number;
  }>;
  sunColor: [number, number, number];
  sunIntensity: number;
  sunAngles: [number, number, number];
  fillColor: [number, number, number];
  fillIntensity: number;
  ambientColor: [number, number, number];
  shadowIntensity: number;
}

export const HDRI_PRESETS: HdriPresetMeta[] = [
  {
    id: 'studio_neutral',
    name: 'Studio Neutro',
    subtitle: 'Uniforme • Sombras suaves + AO',
    previewGradient: 'linear-gradient(180deg, #e5e8ee 0%, #c8cdd6 55%, #8b919c 100%)',
    zenithColor: '#eef1f6',
    horizonColor: '#d4d8e0',
    groundColor: '#9096a2',
    softboxes: [
      { x: 0.25, y: 0.22, rx: 0.18, ry: 0.12, color: '#ffffff', alpha: 0.85 },
      { x: 0.72, y: 0.26, rx: 0.22, ry: 0.13, color: '#f5f8ff', alpha: 0.7 },
      { x: 0.5, y: 0.12, rx: 0.35, ry: 0.1, color: '#ffffff', alpha: 0.6 },
    ],
    sunColor: [1.0, 0.99, 0.98],
    sunIntensity: 0.82,
    sunAngles: [58, 32, 0],
    fillColor: [0.85, 0.89, 0.95],
    fillIntensity: 0.45,
    ambientColor: [0.62, 0.64, 0.68],
    shadowIntensity: 0.42,
  },
  {
    id: 'studio_warm',
    name: 'Studio Quente',
    subtitle: 'Galeria arquitetônica suave',
    previewGradient: 'linear-gradient(180deg, #f6ece0 0%, #e0cdb8 55%, #8f8072 100%)',
    zenithColor: '#f7eee2',
    horizonColor: '#e4d3be',
    groundColor: '#8d7f71',
    softboxes: [
      { x: 0.3, y: 0.25, rx: 0.2, ry: 0.13, color: '#fff4e0', alpha: 0.9 },
      { x: 0.78, y: 0.3, rx: 0.18, ry: 0.12, color: '#ffebd0', alpha: 0.65 },
    ],
    sunColor: [1.0, 0.94, 0.85],
    sunIntensity: 0.95,
    sunAngles: [52, 40, 0],
    fillColor: [0.92, 0.86, 0.78],
    fillIntensity: 0.42,
    ambientColor: [0.62, 0.58, 0.54],
    shadowIntensity: 0.48,
  },
  {
    id: 'daylight',
    name: 'Luz do Dia',
    subtitle: 'Céu aberto e luz natural',
    previewGradient: 'linear-gradient(180deg, #6ba6e6 0%, #cfe3f8 55%, #9ca3ad 100%)',
    zenithColor: '#69a3e2',
    horizonColor: '#d7e7f7',
    groundColor: '#8e96a0',
    softboxes: [
      { x: 0.28, y: 0.24, rx: 0.08, ry: 0.08, color: '#fffbe8', alpha: 1.0 },
      { x: 0.65, y: 0.32, rx: 0.28, ry: 0.1, color: '#eef6ff', alpha: 0.45 },
    ],
    sunColor: [1.0, 0.98, 0.93],
    sunIntensity: 1.15,
    sunAngles: [48, 35, 0],
    fillColor: [0.68, 0.82, 0.98],
    fillIntensity: 0.48,
    ambientColor: [0.55, 0.6, 0.68],
    shadowIntensity: 0.55,
  },
  {
    id: 'sunset',
    name: 'Entardecer',
    subtitle: 'Golden Hour dourado',
    previewGradient: 'linear-gradient(180deg, #4b5d8a 0%, #e89b62 55%, #5c4b4e 100%)',
    zenithColor: '#485b8a',
    horizonColor: '#eb9d63',
    groundColor: '#5a4a4e',
    softboxes: [
      { x: 0.22, y: 0.44, rx: 0.14, ry: 0.08, color: '#ffd399', alpha: 0.95 },
      { x: 0.75, y: 0.28, rx: 0.25, ry: 0.12, color: '#8ea8db', alpha: 0.45 },
    ],
    sunColor: [1.0, 0.74, 0.48],
    sunIntensity: 1.2,
    sunAngles: [24, 58, 0],
    fillColor: [0.54, 0.62, 0.84],
    fillIntensity: 0.46,
    ambientColor: [0.52, 0.44, 0.44],
    shadowIntensity: 0.56,
  },
  {
    id: 'industrial_loft',
    name: 'Loft Industrial',
    subtitle: 'Claraboias frias e limpas',
    previewGradient: 'linear-gradient(180deg, #b8c6d8 0%, #8f9aa8 55%, #59606b 100%)',
    zenithColor: '#b7c6d9',
    horizonColor: '#8d98a6',
    groundColor: '#585f6a',
    softboxes: [
      { x: 0.2, y: 0.18, rx: 0.12, ry: 0.16, color: '#eef5ff', alpha: 0.9 },
      { x: 0.5, y: 0.18, rx: 0.12, ry: 0.16, color: '#eef5ff', alpha: 0.9 },
      { x: 0.8, y: 0.18, rx: 0.12, ry: 0.16, color: '#eef5ff', alpha: 0.9 },
    ],
    sunColor: [0.92, 0.96, 1.0],
    sunIntensity: 0.92,
    sunAngles: [64, 15, 0],
    fillColor: [0.76, 0.82, 0.9],
    fillIntensity: 0.44,
    ambientColor: [0.54, 0.57, 0.62],
    shadowIntensity: 0.48,
  },
  {
    id: 'night_showroom',
    name: 'Showroom Noturno',
    subtitle: 'Contraste suave e elegante',
    previewGradient: 'linear-gradient(180deg, #253047 0%, #3d4d6b 55%, #232730 100%)',
    zenithColor: '#242f46',
    horizonColor: '#3f506e',
    groundColor: '#22262f',
    softboxes: [
      { x: 0.35, y: 0.24, rx: 0.18, ry: 0.1, color: '#d8e6ff', alpha: 0.85 },
      { x: 0.72, y: 0.32, rx: 0.14, ry: 0.1, color: '#ffe4c4', alpha: 0.65 },
    ],
    sunColor: [0.85, 0.91, 1.0],
    sunIntensity: 0.88,
    sunAngles: [50, -35, 0],
    fillColor: [0.46, 0.56, 0.78],
    fillIntensity: 0.4,
    ambientColor: [0.38, 0.42, 0.5],
    shadowIntensity: 0.52,
  },
];

export function getHdriPresetMeta(id: LightingPreset): HdriPresetMeta {
  return HDRI_PRESETS.find((p) => p.id === id) || HDRI_PRESETS[0];
}

export class HdriEnvironmentFactory {
  private device: pc.GraphicsDevice;
  private atlasCache = new Map<LightingPreset, pc.Texture>();

  constructor(device: pc.GraphicsDevice) {
    this.device = device;
  }

  public getEnvAtlas(presetId: LightingPreset): pc.Texture {
    const cached = this.atlasCache.get(presetId);
    if (cached) return cached;

    const meta = getHdriPresetMeta(presetId);
    const width = 256;
    const height = 128;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Equirectangular sky-horizon-ground gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0.0, meta.zenithColor);
    grad.addColorStop(0.48, meta.horizonColor);
    grad.addColorStop(0.54, meta.groundColor);
    grad.addColorStop(1.0, meta.groundColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Paint softbox lights / sun disc
    for (const box of meta.softboxes) {
      const cx = box.x * width;
      const cy = box.y * height;
      const r = Math.max(box.rx * width, box.ry * height);
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      radGrad.addColorStop(0, box.color);
      radGrad.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.save();
      ctx.globalAlpha = box.alpha;
      ctx.translate(cx, cy);
      ctx.scale((box.rx * width) / r, (box.ry * height) / r);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const sourceTex = new pc.Texture(this.device, {
      width,
      height,
      format: pc.PIXELFORMAT_RGBA8,
      projection: pc.TEXTUREPROJECTION_EQUIRECT,
      minFilter: pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: pc.ADDRESS_REPEAT,
      addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      mipmaps: false,
      srgb: true,
    });
    sourceTex.setSource(canvas);

    const atlas = pc.EnvLighting.generateAtlas(sourceTex, { size: 256 });
    sourceTex.destroy();

    this.atlasCache.set(presetId, atlas);
    return atlas;
  }

  public dispose(): void {
    this.atlasCache.forEach((tex) => tex.destroy());
    this.atlasCache.clear();
  }
}
