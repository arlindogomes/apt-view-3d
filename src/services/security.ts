/**
 * Security utilities for APT-View 3D when operating with a public GitHub repository
 * and hosted on shared-origin environments like GitHub Pages (*.github.io).
 */

const ALLOWED_REMOTE_ASSET_HOSTS = new Set([
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
]);

const SENSITIVE_QUERY_PARAMS = [
  'token',
  'access_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'signature',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'awsaccesskeyid',
];

const SECRET_REGEX_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  {
    name: 'GitHub Personal Access Token (Classic)',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/,
  },
  {
    name: 'GitHub Fine-Grained Personal Access Token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/,
  },
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'AWS Pre-Signed S3 URL Credentials',
    regex: /X-Amz-Signature=[0-9a-fA-F]{16,}|X-Amz-Credential=/i,
  },
  {
    name: 'Authorization Header / Token Literal',
    regex: /\bAuthorization\s*:\s*(Token|Bearer)\s+[A-Za-z0-9._-]{16,}/i,
  },
];

/**
 * Sanitizes a GLB asset filename to prevent path traversal (`../`) or arbitrary path injection
 * when committing to or loading from `projects/<slug>/assets/<fileName>`.
 */
export function sanitizeGlbFileName(rawName: string, fallbackId = 'model'): string {
  const base = (rawName || '')
    .split(/[/\\]/)
    .pop() || fallbackId;
  const withoutExt = base.replace(/\.(glb|gltf)$/i, '');
  const safeStem = withoutExt.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.').replace(/^_+|_+$/g, '') || fallbackId;
  return `${safeStem.slice(0, 80)}.glb`;
}

/**
 * Sanitizes a project folder slug so it can never traverse outside `projects/<slug>`.
 */
export function sanitizeProjectSlug(rawProjectName: string): string {
  const slug = (rawProjectName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 64) || 'planta-principal';
}

/**
 * Validates and cleans an external `assetSourceUrl`.
 * - Rejects non-HTTPS URLs, localhost/private network IPs, and signed temporary URLs (such as Sketchfab S3 links).
 * - Only permits trusted public static hosts (e.g., Khronos sample repository on raw.githubusercontent.com).
 */
export function sanitizePublicAssetUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return undefined;
    if (!ALLOWED_REMOTE_ASSET_HOSTS.has(parsed.hostname.toLowerCase())) {
      return undefined;
    }
    // Strip any query string or hash so tokens/signatures can never be persisted in scene.json
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_PARAMS.includes(key.toLowerCase())) {
        return undefined;
      }
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Scans outgoing content (scene.json, commit message, PR title/body, branch name)
 * to ensure neither the active Sketchfab/GitHub tokens nor any recognizable secret pattern
 * can ever be committed to a public GitHub repository.
 */
export function assertNoSecretsInPayload(
  payload: string,
  activeSecrets: Array<{ label: string; value?: string }> = []
): void {
  if (!payload) return;

  // 1. Exact check against currently configured tokens in memory/storage
  for (const secret of activeSecrets) {
    const trimmed = secret.value?.trim();
    if (trimmed && trimmed.length >= 8 && payload.includes(trimmed)) {
      throw new Error(
        `Bloqueio de Segurança: O valor do seu ${secret.label} foi detectado no conteúdo a ser enviado ao GitHub. Operação cancelada para evitar vazamento em repositório público.`
      );
    }
  }

  // 2. Pattern check against known token formats & signed URLs
  for (const pattern of SECRET_REGEX_PATTERNS) {
    if (pattern.regex.test(payload)) {
      throw new Error(
        `Bloqueio de Segurança: Um padrão de credencial (${pattern.name}) foi detectado nos dados do commit. Operação cancelada para proteger seu repositório público.`
      );
    }
  }
}
