import { Octokit } from '@octokit/rest';
import {
  GitBranchInfo,
  GitCommitInfo,
  SceneDocument,
} from '../types/scene';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  getGlbAsset,
  saveGlbAsset,
} from './assetDb';

const GIT_CONFIG_STORAGE_KEY = 'apt_view_git_config';

export interface SavedGitConfig {
  owner: string;
  repo: string;
  token: string;
  projectName: string;
}

export function detectRepoFromGitHubPages(): { owner: string; repo: string } | null {
  try {
    const host = window.location.hostname;
    if (host.endsWith('.github.io')) {
      const owner = host.replace('.github.io', '');
      const segments = window.location.pathname.split('/').filter(Boolean);
      const repo = segments[0] || `${owner}.github.io`;
      return { owner, repo };
    }
  } catch {
    // ignore
  }
  return null;
}

export function loadSavedGitConfig(): SavedGitConfig {
  const detected = detectRepoFromGitHubPages();
  try {
    const raw = localStorage.getItem(GIT_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedGitConfig>;
      return {
        owner: parsed.owner || detected?.owner || '',
        repo: parsed.repo || detected?.repo || '',
        token: parsed.token || '',
        projectName: parsed.projectName || 'planta-principal',
      };
    }
  } catch {
    // ignore
  }
  return {
    owner: detected?.owner || '',
    repo: detected?.repo || '',
    token: '',
    projectName: 'planta-principal',
  };
}

export function saveGitConfig(config: SavedGitConfig): void {
  try {
    localStorage.setItem(GIT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function serializeSceneDeterministic(doc: SceneDocument): string {
  const sortedEntities = [...doc.entities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entity) => ({
      ...entity,
      position: entity.position.map((v) => Number(v.toFixed(4))) as [number, number, number],
      rotation: entity.rotation.map((v) => Number(v.toFixed(2))) as [number, number, number],
      scale: entity.scale.map((v) => Number(v.toFixed(4))) as [number, number, number],
    }));

  const cleanDoc: SceneDocument = {
    version: doc.version,
    projectName: doc.projectName,
    lighting: doc.lighting,
    entities: sortedEntities,
  };

  return JSON.stringify(cleanDoc, null, 2) + '\n';
}

export class GitHubSceneService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(owner: string, repo: string, token: string) {
    this.owner = owner.trim();
    this.repo = repo.trim();
    this.octokit = new Octokit({ auth: token.trim() });
  }

  async connectRepository(): Promise<{
    userLogin: string;
    userAvatar: string;
    defaultBranch: string;
    branches: GitBranchInfo[];
  }> {
    const [{ data: user }, { data: repoData }] = await Promise.all([
      this.octokit.users.getAuthenticated(),
      this.octokit.repos.get({ owner: this.owner, repo: this.repo }),
    ]);

    const defaultBranch = repoData.default_branch || 'main';
    const branches = await this.listBranches();

    return {
      userLogin: user.login,
      userAvatar: user.avatar_url,
      defaultBranch,
      branches,
    };
  }

  async connectAndEnsureCollabBranch(customBranch?: string): Promise<{
    userLogin: string;
    userAvatar: string;
    defaultBranch: string;
    activeBranch: string;
    branches: GitBranchInfo[];
  }> {
    const [{ data: user }, { data: repoData }] = await Promise.all([
      this.octokit.users.getAuthenticated(),
      this.octokit.repos.get({ owner: this.owner, repo: this.repo }),
    ]);

    const defaultBranch = repoData.default_branch || 'main';
    const branches = await this.listBranches();

    const today = new Date().toISOString().slice(0, 10);
    const targetBranch =
      customBranch?.trim() || `collab/${user.login.toLowerCase()}-${today}`;

    const safeTarget =
      targetBranch === defaultBranch || targetBranch === 'main'
        ? `collab/${user.login.toLowerCase()}-${today}`
        : targetBranch;

    const exists = branches.some((b) => b.name === safeTarget);
    if (!exists) {
      await this.createBranchFrom(safeTarget, defaultBranch);
    }

    const updatedBranches = await this.listBranches();
    return {
      userLogin: user.login,
      userAvatar: user.avatar_url,
      defaultBranch,
      activeBranch: safeTarget,
      branches: updatedBranches,
    };
  }

  async listBranches(): Promise<GitBranchInfo[]> {
    const { data } = await this.octokit.repos.listBranches({
      owner: this.owner,
      repo: this.repo,
      per_page: 100,
    });
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
  }

  async createBranchFrom(newBranch: string, fromBranch: string): Promise<void> {
    const { data: refData } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${fromBranch}`,
    });

    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${newBranch}`,
      sha: refData.object.sha,
    });
  }

  async getBranchCommits(branch: string): Promise<GitCommitInfo[]> {
    const { data } = await this.octokit.repos.listCommits({
      owner: this.owner,
      repo: this.repo,
      sha: branch,
      per_page: 20,
    });
    return data.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split('\n')[0],
      author: c.commit.author?.name || c.author?.login || 'Desconhecido',
      date: c.commit.author?.date || '',
      url: c.html_url,
    }));
  }

  async commitSceneAndAssets(
    branch: string,
    defaultBranch: string,
    doc: SceneDocument,
    commitMessage: string
  ): Promise<{ commitSha: string; uploadedAssets: number }> {
    if (branch === 'main' || branch === defaultBranch) {
      throw new Error(
        `Por segurança, commits diretos na branch "${branch}" estão bloqueados. Selecione ou crie uma branch de colaboração.`
      );
    }

    const projectSlug =
      doc.projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-') || 'planta-principal';

    // 1. Get latest commit on target branch
    const { data: refData } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = refData.object.sha;

    const { data: commitData } = await this.octokit.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 2. Create blobs for scene.json and referenced GLB assets
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    const sceneContent = serializeSceneDeterministic(doc);
    const { data: sceneBlob } = await this.octokit.git.createBlob({
      owner: this.owner,
      repo: this.repo,
      content: sceneContent,
      encoding: 'utf-8',
    });

    treeEntries.push({
      path: `projects/${projectSlug}/scene.json`,
      mode: '100644',
      type: 'blob',
      sha: sceneBlob.sha,
    });

    // Collect unique assetIds used in the scene
    const seenAssets = new Set<string>();
    let uploadedAssets = 0;

    for (const entity of doc.entities) {
      if (entity.kind === 'glb' && entity.assetId && !seenAssets.has(entity.assetId)) {
        seenAssets.add(entity.assetId);
        const stored = await getGlbAsset(entity.assetId);
        if (stored) {
          const safeFileName = (entity.assetFileName || stored.fileName || `${entity.assetId}.glb`)
            .replace(/[^a-zA-Z0-9._-]/g, '_');
          const b64 = arrayBufferToBase64(stored.buffer);
          const { data: assetBlob } = await this.octokit.git.createBlob({
            owner: this.owner,
            repo: this.repo,
            content: b64,
            encoding: 'base64',
          });
          treeEntries.push({
            path: `projects/${projectSlug}/assets/${safeFileName}`,
            mode: '100644',
            type: 'blob',
            sha: assetBlob.sha,
          });
          uploadedAssets++;
        }
      }
    }

    // 3. Create tree, commit, and update ref
    const { data: newTree } = await this.octokit.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: baseTreeSha,
      tree: treeEntries,
    });

    const { data: newCommit } = await this.octokit.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: commitMessage.trim() || `Atualiza planta 3D (${projectSlug})`,
      tree: newTree.sha,
      parents: [latestCommitSha],
    });

    await this.octokit.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return { commitSha: newCommit.sha.slice(0, 7), uploadedAssets };
  }

  async loadSceneFromBranch(
    branch: string,
    projectName: string
  ): Promise<SceneDocument | null> {
    const projectSlug =
      projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-') || 'planta-principal';

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: `projects/${projectSlug}/scene.json`,
        ref: branch,
      });

      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        return null;
      }

      const decoded = new TextDecoder().decode(base64ToArrayBuffer(data.content));
      const doc = JSON.parse(decoded) as SceneDocument;

      // Download referenced GLB assets from branch into IndexedDB if missing locally
      for (const entity of doc.entities) {
        if (entity.kind === 'glb' && entity.assetId && entity.assetFileName) {
          const existing = await getGlbAsset(entity.assetId);
          if (!existing) {
            try {
              const assetPath = `projects/${projectSlug}/assets/${entity.assetFileName}`;
              const { data: assetData } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: assetPath,
                ref: branch,
              });
              if (!Array.isArray(assetData) && assetData.type === 'file') {
                let buffer: ArrayBuffer | null = null;
                if (assetData.content) {
                  buffer = base64ToArrayBuffer(assetData.content);
                } else if (assetData.sha) {
                  const { data: blob } = await this.octokit.git.getBlob({
                    owner: this.owner,
                    repo: this.repo,
                    file_sha: assetData.sha,
                  });
                  buffer = base64ToArrayBuffer(blob.content);
                }
                if (buffer) {
                  await saveGlbAsset(entity.assetId, entity.assetFileName, buffer);
                }
              }
            } catch {
              // Asset may not exist in repo yet, fallback to assetSourceUrl if present
            }
          }
        }
      }

      return doc;
    } catch {
      return null;
    }
  }

  async createPullRequest(
    headBranch: string,
    baseBranch: string,
    title: string,
    body: string
  ): Promise<{ url: string; number: number }> {
    const { data } = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      head: headBranch,
      base: baseBranch,
      title: title.trim() || `Merge planta 3D: ${headBranch}`,
      body:
        body.trim() ||
        `Alterações de planta baixa 3D enviadas a partir da branch \`${headBranch}\` via APT-View 3D.`,
    });
    return { url: data.html_url, number: data.number };
  }
}
