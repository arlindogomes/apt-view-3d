import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitFork,
  GitPullRequest,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import { GitHubSceneService, saveGitConfig } from '../../services/github';
import { useSceneStore } from '../../store/sceneStore';

export const GitPanelModal: React.FC = () => {
  const isOpen = useSceneStore((s) => s.isGitModalOpen);
  const setOpen = useSceneStore((s) => s.setGitModalOpen);
  const git = useSceneStore((s) => s.git);
  const updateGitState = useSceneStore((s) => s.updateGitState);
  const getSceneDocument = useSceneStore((s) => s.getSceneDocument);
  const loadSceneDocument = useSceneStore((s) => s.loadSceneDocument);
  const setProjectName = useSceneStore((s) => s.setProjectName);
  const showToast = useSceneStore((s) => s.showToast);

  const [owner, setOwner] = useState(git.owner);
  const [repo, setRepo] = useState(git.repo);
  const [token, setToken] = useState(git.token);
  const [projectName, setLocalProjectName] = useState(git.projectName);
  const [customBranch, setCustomBranch] = useState('');
  const [commitMessage, setCommitMessage] = useState('Atualiza layout da planta baixa 3D');
  const [prTitle, setPrTitle] = useState('');
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const createService = () => new GitHubSceneService(owner, repo, token);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner.trim() || !repo.trim() || !token.trim()) {
      updateGitState({ lastError: 'Informe owner, repositório e Personal Access Token (PAT).' });
      return;
    }

    setBusy(true);
    updateGitState({ lastError: null, statusMessage: 'Conectando ao GitHub...' });
    try {
      saveGitConfig({ owner, repo, token, projectName });
      setProjectName(projectName);

      const svc = createService();
      const res = await svc.connectAndEnsureCollabBranch(customBranch);
      const commits = await svc.getBranchCommits(res.activeBranch);

      updateGitState({
        connected: true,
        owner,
        repo,
        token,
        projectName,
        userLogin: res.userLogin,
        userAvatar: res.userAvatar,
        defaultBranch: res.defaultBranch,
        currentBranch: res.activeBranch,
        isReadOnlyBranch: false,
        branches: res.branches,
        commits,
        statusMessage: `Conectado como @${res.userLogin}`,
        lastError: null,
      });

      // Load scene from branch if it already exists
      const remoteDoc = await svc.loadSceneFromBranch(res.activeBranch, projectName);
      if (remoteDoc) {
        loadSceneDocument(remoteDoc);
        showToast(`Cena carregada da branch ${res.activeBranch}`);
      } else {
        showToast(`Branch exclusiva ${res.activeBranch} pronta para trabalho!`);
      }
    } catch (err) {
      updateGitState({
        connected: false,
        lastError: err instanceof Error ? err.message : 'Erro ao conectar no GitHub.',
        statusMessage: 'Erro de conexão',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    if (!git.connected) return;
    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      const commits = await svc.getBranchCommits(branchName);
      const isMainOrOther =
        branchName === git.defaultBranch ||
        branchName === 'main' ||
        (branchName.startsWith('collab/') &&
          !branchName.startsWith(`collab/${git.userLogin.toLowerCase()}-`));

      updateGitState({
        currentBranch: branchName,
        isReadOnlyBranch: isMainOrOther,
        commits,
        statusMessage: isMainOrOther
          ? `Inspecionando ${branchName} (somente leitura)`
          : `Trabalhando em ${branchName}`,
      });

      const remoteDoc = await svc.loadSceneFromBranch(branchName, projectName);
      if (remoteDoc) {
        loadSceneDocument(remoteDoc);
        showToast(`Planta da branch "${branchName}" carregada!`);
      } else {
        showToast(`Branch "${branchName}" ainda não possui projects/${projectName}/scene.json.`);
      }
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao trocar branch.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleForkBranch = async () => {
    if (!git.connected) return;
    const suggested = `collab/${git.userLogin.toLowerCase()}-fork-${Date.now().toString(36).slice(-4)}`;
    const newName = window.prompt('Nome da nova branch a partir da branch atual:', suggested);
    if (!newName?.trim()) return;

    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      await svc.createBranchFrom(newName.trim(), git.currentBranch);
      const branches = await svc.listBranches();
      const commits = await svc.getBranchCommits(newName.trim());
      updateGitState({
        branches,
        commits,
        currentBranch: newName.trim(),
        isReadOnlyBranch: false,
        statusMessage: `Fork criado: ${newName.trim()}`,
      });
      showToast(`Nova branch "${newName.trim()}" criada com sucesso!`);
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao criar fork de branch.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCommitPush = async () => {
    if (!git.connected) return;
    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      const doc = { ...getSceneDocument(), projectName };
      const res = await svc.commitSceneAndAssets(
        git.currentBranch,
        git.defaultBranch,
        doc,
        commitMessage
      );
      const commits = await svc.getBranchCommits(git.currentBranch);
      updateGitState({
        commits,
        statusMessage: `Commit ${res.commitSha} enviado (${res.uploadedAssets} GLB)`,
      });
      showToast(`Commit ${res.commitSha} enviado para ${git.currentBranch}!`);
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Falha ao enviar commit.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPr = async () => {
    if (!git.connected || git.currentBranch === git.defaultBranch) return;
    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      const pr = await svc.createPullRequest(
        git.currentBranch,
        git.defaultBranch,
        prTitle || `Planta 3D (${projectName}): ${git.currentBranch}`,
        `Revisão das alterações de planta baixa 3D na branch \`${git.currentBranch}\`.`
      );
      setPrUrl(pr.url);
      showToast(`Pull Request #${pr.number} criado com sucesso!`);
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao abrir Pull Request.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[88vh] bg-[#161922] border border-[#2a3040] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a3040] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">
              Controle de Versão Git &amp; Colaboração Multi-Branch
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Error Banner */}
          {git.lastError && (
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{git.lastError}</span>
            </div>
          )}

          {/* Connection Form */}
          <form
            onSubmit={handleConnect}
            className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-200">Repositório GitHub (REST API)</h3>
              {git.connected && (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />@{git.userLogin}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-gray-400 block mb-1">Owner (usuário/org)</label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="seu-usuario"
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Repositório</label>
                <input
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="apt-view"
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">
                  GitHub PAT (Contents + Pull Requests)
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_... ou ghp_..."
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Pasta do Projeto</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setLocalProjectName(e.target.value)}
                  placeholder="planta-principal"
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="text-gray-400 block mb-1">
                  Branch de sessão (opcional — padrão: collab/&lt;login&gt;-&lt;data&gt;)
                </label>
                <input
                  type="text"
                  value={customBranch}
                  onChange={(e) => setCustomBranch(e.target.value)}
                  placeholder="collab/minha-revisao"
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {git.connected ? 'Reconectar / Sincronizar' : 'Conectar & Criar Branch'}
              </button>
            </div>
          </form>

          {/* Connected Workspace Controls */}
          {git.connected && (
            <>
              {/* Branch Selector & Isolation Guard */}
              <div className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-200">Branch Ativa:</span>
                    <select
                      value={git.currentBranch}
                      onChange={(e) => handleSwitchBranch(e.target.value)}
                      disabled={busy}
                      className="bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1 text-gray-100 font-mono"
                    >
                      {git.branches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} {b.name === git.defaultBranch ? '(protegida)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleForkBranch}
                    disabled={busy}
                    className="px-3 py-1 rounded bg-[#1d212d] hover:bg-[#272d3d] border border-[#2a3040] text-gray-200 flex items-center gap-1.5"
                  >
                    <GitFork className="w-3.5 h-3.5 text-cyan-400" />
                    Criar Fork desta Branch
                  </button>
                </div>

                {git.isReadOnlyBranch && (
                  <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-200 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      Modo Inspeção ({git.currentBranch}): commits diretos nesta branch estão
                      desabilitados para evitar sobreposição. Use &ldquo;Criar Fork desta
                      Branch&rdquo; para editar sua própria cópia.
                    </span>
                  </div>
                )}

                {/* Commit & Push */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Mensagem do commit..."
                    className="flex-1 bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleCommitPush}
                    disabled={busy || git.isReadOnlyBranch}
                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Commit &amp; Push
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Salva <code>projects/{projectName}/scene.json</code> (ordenado por ID) e envia
                  arquivos <code>.glb</code> locais para{' '}
                  <code>projects/{projectName}/assets/</code>.
                </p>
              </div>

              {/* Pull Request Section */}
              <div className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-2.5">
                <h3 className="font-semibold text-gray-200 flex items-center gap-1.5">
                  <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
                  Abrir Pull Request para {git.defaultBranch}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder={`Planta 3D (${projectName}): ${git.currentBranch}`}
                    className="flex-1 bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleOpenPr}
                    disabled={busy || git.currentBranch === git.defaultBranch}
                    className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    Criar Pull Request
                  </button>
                </div>
                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-purple-300 hover:underline"
                  >
                    Pull Request aberto no GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {/* Commit History */}
              <div className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-2">
                <h3 className="font-semibold text-gray-200 flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-blue-400" />
                  Histórico de Commits ({git.currentBranch})
                </h3>
                <div className="max-h-40 overflow-y-auto divide-y divide-[#2a3040]">
                  {git.commits.map((c) => (
                    <div
                      key={c.sha}
                      className="py-1.5 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-200 hover:text-blue-400 truncate block"
                        >
                          {c.message}
                        </a>
                        <span className="text-gray-500">
                          {c.author} • {c.date ? new Date(c.date).toLocaleString('pt-BR') : ''}
                        </span>
                      </div>
                      <span className="font-mono text-blue-400 shrink-0">{c.sha}</span>
                    </div>
                  ))}
                  {git.commits.length === 0 && (
                    <p className="text-gray-500 py-2">Nenhum commit listado.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
