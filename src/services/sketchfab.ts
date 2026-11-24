import { sanitizeGlbFileName } from './security';

const TOKEN_SESSION_KEY = 'apt_view_sketchfab_token_session';
const TOKEN_PERSIST_KEY = 'apt_view_sketchfab_token';
const TOKEN_REMEMBER_FLAG = 'apt_view_sketchfab_remember';

export interface CatalogModelItem {
  uid: string;
  name: string;
  author: string;
  license: string;
  thumbnail: string;
  source: 'sketchfab' | 'khronos';
  directGlbUrl?: string;
  vertexCount?: number;
}

export const FREE_KHRONOS_CATALOG: CatalogModelItem[] = [
  {
    uid: 'khronos-sheen-chair',
    name: 'Poltrona Sheen (SheenChair)',
    author: 'Khronos Group / Wayfair',
    license: 'CC-BY 4.0',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/screenshot/screenshot.jpg',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/glTF-Binary/SheenChair.glb',
  },
  {
    uid: 'khronos-velvet-sofa',
    name: 'Sofá Veludo (GlamVelvetSofa)',
    author: 'Khronos Group / Wayfair',
    license: 'CC-BY 4.0',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlamVelvetSofa/screenshot/screenshot.jpg',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb',
  },
  {
    uid: 'khronos-lantern',
    name: 'Luminária Vintage (Lantern)',
    author: 'Khronos Group',
    license: 'CC0 Public Domain',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/screenshot/screenshot.jpg',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb',
  },
  {
    uid: 'khronos-stained-glass-lamp',
    name: 'Abajur Vitral (StainedGlassLamp)',
    author: 'Khronos Group / Wayfair',
    license: 'CC-BY 4.0',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/StainedGlassLamp/screenshot/screenshot.jpg',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/StainedGlassLamp/glTF-Binary/StainedGlassLamp.glb',
  },
  {
    uid: 'khronos-antique-camera',
    name: 'Câmera Decorativa (AntiqueCamera)',
    author: 'Khronos Group',
    license: 'CC-BY 4.0',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AntiqueCamera/screenshot/screenshot.jpg',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
  },
  {
    uid: 'khronos-barramundi-fish',
    name: 'Escultura Decorativa (Duck)',
    author: 'Khronos Group / Sony',
    license: 'SCEA Shared Source',
    thumbnail:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/screenshot/screenshot.png',
    source: 'khronos',
    directGlbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb',
  },
];

export function isSketchfabTokenPersisted(): boolean {
  try {
    return localStorage.getItem(TOKEN_REMEMBER_FLAG) === 'true';
  } catch {
    return false;
  }
}

export function getSketchfabToken(): string {
  try {
    const sessionToken = sessionStorage.getItem(TOKEN_SESSION_KEY);
    if (sessionToken) return sessionToken;

    const remember = isSketchfabTokenPersisted();
    const persistedToken = localStorage.getItem(TOKEN_PERSIST_KEY) || '';
    if (persistedToken && !remember) {
      // Migrate legacy plaintext token out of shared localStorage into tab-scoped sessionStorage
      sessionStorage.setItem(TOKEN_SESSION_KEY, persistedToken);
      localStorage.removeItem(TOKEN_PERSIST_KEY);
      return persistedToken;
    }
    return remember ? persistedToken : '';
  } catch {
    return '';
  }
}

export function setSketchfabToken(token: string, persistInLocalStorage = false): void {
  try {
    const trimmed = token.trim();
    if (!trimmed) {
      sessionStorage.removeItem(TOKEN_SESSION_KEY);
      localStorage.removeItem(TOKEN_PERSIST_KEY);
      localStorage.removeItem(TOKEN_REMEMBER_FLAG);
      return;
    }

    // Always keep in sessionStorage for current tab
    sessionStorage.setItem(TOKEN_SESSION_KEY, trimmed);

    if (persistInLocalStorage) {
      localStorage.setItem(TOKEN_REMEMBER_FLAG, 'true');
      localStorage.setItem(TOKEN_PERSIST_KEY, trimmed);
    } else {
      localStorage.removeItem(TOKEN_REMEMBER_FLAG);
      localStorage.removeItem(TOKEN_PERSIST_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearSketchfabToken(): void {
  setSketchfabToken('', false);
}

interface SketchfabSearchModel {
  uid: string;
  name: string;
  user?: { displayName?: string; username?: string };
  license?: { label?: string };
  thumbnails?: { images?: Array<{ url: string; width: number }> };
  vertexCount?: number;
}

export async function searchSketchfabModels(
  query: string,
  token?: string
): Promise<CatalogModelItem[]> {
  const url = new URL('https://api.sketchfab.com/v3/search');
  url.searchParams.set('type', 'models');
  url.searchParams.set('downloadable', 'true');
  url.searchParams.set('q', query.trim() || 'furniture');
  url.searchParams.set('count', '18');
  url.searchParams.set('sort_by', '-likeCount');

  const headers: Record<string, string> = {};
  if (token?.trim()) {
    headers['Authorization'] = `Token ${token.trim()}`;
  }

  const res = await fetch(url.toString(), {
    headers,
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) {
    throw new Error(`Sketchfab API retornou status ${res.status}`);
  }

  const data = (await res.json()) as { results?: SketchfabSearchModel[] };
  const results = data.results || [];

  return results.map((m) => {
    const images = m.thumbnails?.images || [];
    const sorted = [...images].sort((a, b) => Math.abs(a.width - 400) - Math.abs(b.width - 400));
    const thumb = sorted[0]?.url || '';
    return {
      uid: m.uid,
      name: m.name || 'Modelo Sketchfab',
      author: m.user?.displayName || m.user?.username || 'Autor desconhecido',
      license: m.license?.label || 'CC',
      thumbnail: thumb,
      source: 'sketchfab',
      vertexCount: m.vertexCount,
    };
  });
}

export async function downloadSketchfabGlb(
  uid: string,
  token: string
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  if (!token.trim()) {
    throw new Error('Informe seu Sketchfab Personal API Token para baixar modelos do Sketchfab.');
  }

  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  const res = await fetch(`https://api.sketchfab.com/v3/models/${safeUid}/download`, {
    headers: {
      Authorization: `Token ${token.trim()}`,
    },
    referrerPolicy: 'no-referrer',
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Token do Sketchfab inválido ou expirado.');
    }
    throw new Error(`Falha ao obter link de download do Sketchfab (${res.status}).`);
  }

  const data = (await res.json()) as {
    glb?: { url: string; size?: number };
    gltf?: { url: string; size?: number };
  };

  // Temporary pre-signed S3 URL is used only in memory to fetch the binary and is NEVER saved to scene.json
  const downloadUrl = data.glb?.url;
  if (!downloadUrl) {
    throw new Error(
      'Este modelo não possui formato .glb direto disponível na API do Sketchfab. Tente outro modelo.'
    );
  }

  const fileRes = await fetch(downloadUrl, { referrerPolicy: 'no-referrer' });
  if (!fileRes.ok) {
    throw new Error(`Falha ao baixar arquivo GLB (${fileRes.status}).`);
  }

  const buffer = await fileRes.arrayBuffer();
  return { buffer, fileName: sanitizeGlbFileName(`sketchfab_${safeUid}.glb`) };
}

export async function downloadDirectGlb(
  url: string,
  fallbackName: string
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const res = await fetch(url, { referrerPolicy: 'no-referrer' });
  if (!res.ok) {
    throw new Error(`Erro ao baixar modelo (${res.status}): ${url}`);
  }
  const buffer = await res.arrayBuffer();
  return { buffer, fileName: sanitizeGlbFileName(`${fallbackName}.glb`) };
}
