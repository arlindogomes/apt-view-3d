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
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  clearSavedGitToken,
  GitHubSceneService,
  loadSavedGitConfig,
  saveGitConfig,
} from '../../services/github';
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
  const [rememberToken, setRememberToken] = useState(
    () => Boolean(loadSavedGitConfig().rememberToken)
  );
  const [projectName, setLocalProjectName] = useState(git.projectName);

  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');

  const [commitMessage, setCommitMessage] = useState('Atualiza layout da planta baixa 3D');
  const [prTitle, setPrTitle] = useState('');
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const createService = () => new GitHubSceneService(owner, repo, token);

  // Step 1: Connect and list existing branches (does NOT auto-create a branch)
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner.trim() || !repo.trim() || !token.trim()) {
      updateGitState({ lastError: 'Informe owner, repositório e Personal Access Token (PAT).' });
      return;
    }

    setBusy(true);
    updateGitState({ lastError: null, statusMessage: 'Conectando ao GitHub...' });
    try {
      saveGitConfig({ owner, repo, token, projectName, rememberToken });
      setProjectName(projectName);

      const svc = createService();
      const res = await svc.connectRepository();
      const today = new Date().toISOString().slice(0, 10);
      setNewBranchName(`collab/${res.userLogin.toLowerCase()}-${today}`);
      setBaseBranch(res.defaultBranch);

      updateGitState({
        connected: true,
        owner,
        repo,
        token,
        projectName,
        userLogin: res.userLogin,
        userAvatar: res.userAvatar,
        defaultBranch: res.defaultBranch,
        currentBranch: '',
        isReadOnlyBranch: false,
        branches: res.branches,
        commits: [],
        statusMessage: `Conectado como @${res.userLogin} — selecione uma branch`,
        lastError: null,
      });

      showToast(
        `Conectado como @${res.userLogin}! Escolha uma branch existente ou crie uma nova.`
      );
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

  // Step 2A: Select an existing branch to work on
  const handleSelectBranch = async (branchName: string) => {
    if (!git.connected || !branchName) return;
    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      const commits = await svc.getBranchCommits(branchName);
      const isProtectedMain = branchName === git.defaultBranch || branchName === 'main';

      updateGitState({
        currentBranch: branchName,
        isReadOnlyBranch: isProtectedMain,
        commits,
        statusMessage: isProtectedMain
          ? `Inspecionando ${branchName} (protegida)`
          : `Trabalhando em ${branchName}`,
      });

      const remoteDoc = await svc.loadSceneFromBranch(branchName, projectName);
      if (remoteDoc) {
        loadSceneDocument(remoteDoc);
        showToast(`Planta da branch "${branchName}" carregada!`);
      } else {
        showToast(`Branch "${branchName}" selecionada (pronta para primeiro commit).`);
      }
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao carregar branch.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Step 2B: Explicitly create a new branch when the user chooses to
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!git.connected) return;
    const cleanName = newBranchName.trim();
    if (!cleanName) {
      updateGitState({ lastError: 'Informe um nome válido para a nova branch.' });
      return;
    }
    if (cleanName === git.defaultBranch || cleanName === 'main') {
      updateGitState({ lastError: `Escolha um nome diferente da branch "${git.defaultBranch}".` });
      return;
    }

    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      const source = baseBranch || git.currentBranch || git.defaultBranch;
      await svc.createBranchFrom(cleanName, source);
      const branches = await svc.listBranches();
      const commits = await svc.getBranchCommits(cleanName);

      updateGitState({
        branches,
        commits,
        currentBranch: cleanName,
        isReadOnlyBranch: false,
        statusMessage: `Trabalhando em ${cleanName}`,
      });
      setShowCreateBranch(false);
      showToast(`Branch "${cleanName}" criada a partir de "${source}" e ativada!`);
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao criar nova branch.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleForkCurrentBranch = async () => {
    if (!git.connected || !git.currentBranch) return;
    const suggested = `collab/${git.userLogin.toLowerCase()}-fork-${Date.now().toString(36).slice(-4)}`;
    const name = window.prompt(
      `Nome da nova branch a partir de "${git.currentBranch}":`,
      suggested
    );
    if (!name?.trim()) return;

    setBusy(true);
    updateGitState({ lastError: null });
    try {
      const svc = createService();
      await svc.createBranchFrom(name.trim(), git.currentBranch);
      const branches = await svc.listBranches();
      const commits = await svc.getBranchCommits(name.trim());
      updateGitState({
        branches,
        commits,
        currentBranch: name.trim(),
        isReadOnlyBranch: false,
        statusMessage: `Fork criado: ${name.trim()}`,
      });
      showToast(`Nova branch "${name.trim()}" criada com sucesso!`);
    } catch (err) {
      updateGitState({
        lastError: err instanceof Error ? err.message : 'Erro ao criar fork de branch.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCommitPush = async () => {
    if (!git.connected || !git.currentBranch) return;
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
    if (!git.connected || !git.currentBranch || git.currentBranch === git.defaultBranch) return;
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

          {/* Step 1: Repository Connection */}
          <form
            onSubmit={handleConnect}
            className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-200">
                1. Conectar ao Repositório Privado de Projetos
              </h3>
              {git.connected && (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />@{git.userLogin}
                </span>
              )}
            </div>

            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex flex-wrap items-center justify-between gap-2">
              <span>
                Repositório privado <strong className="font-mono">{owner || 'arlindogomes'}/{repo || 'apt-view-projetos'}</strong> pronto — suas branches, plantas e arquivos <code>.glb</code> ficam acessíveis apenas por você.
              </span>
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-300 hover:underline font-medium shrink-0"
              >
                Gerar Token (PAT) <ExternalLink className="w-3 h-3" />
              </a>
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
                  placeholder="apt-view-3d"
                  className="w-full bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-gray-400">
                    GitHub PAT (Fine-Grained: Contents + PRs)
                  </label>
                  <div className="flex items-center gap-2">
                    <label
                      className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer"
                      title="Por padrão o token fica apenas na sessão da aba atual (sessionStorage) para proteger seu domínio github.io."
                    >
                      <input
                        type="checkbox"
                        checked={rememberToken}
                        onChange={(e) => {
                          setRememberToken(e.target.checked);
                          saveGitConfig({
                            owner,
                            repo,
                            token,
                            projectName,
                            rememberToken: e.target.checked,
                          });
                        }}
                        className="accent-blue-500"
                      />
                      Lembrar
                    </label>
                    {token && (
                      <button
                        type="button"
                        onClick={() => {
                          clearSavedGitToken();
                          setToken('');
                          setRememberToken(false);
                          updateGitState({
                            connected: false,
                            token: '',
                            statusMessage: 'Token removido',
                          });
                          showToast('GitHub PAT removido do navegador.');
                        }}
                        title="Apagar token da sessão e do navegador"
                        className="text-gray-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_... (restrito apenas a este repositório)"
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

            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong>Segurança em Repositório Público:</strong> Seus tokens (GitHub e Sketchfab)
                ficam isolados apenas na sessão da sua aba (<code>sessionStorage</code>) e passam
                por um filtro anti-vazamento antes de cada commit. Recomendamos usar um{' '}
                <strong>Fine-Grained Personal Access Token</strong> com acesso restrito{' '}
                <em>somente a este repositório</em> (permissões: <code>Contents: Read &amp; Write</code>{' '}
                e <code>Pull Requests: Read &amp; Write</code>).
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {git.connected ? 'Atualizar Lista de Branches' : 'Conectar ao Repositório'}
              </button>
            </div>
          </form>

          {/* Step 2: Choose an existing branch OR create a new one */}
          {git.connected && (
            <div className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-200">
                  2. Escolher Branch de Trabalho ({git.branches.length} disponíveis)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateBranch((v) => !v)}
                  className="px-2.5 py-1 rounded bg-[#1d212d] hover:bg-[#272d3d] border border-[#2a3040] text-cyan-300 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showCreateBranch ? 'Cancelar Nova Branch' : 'Criar Nova Branch'}
                </button>
              </div>

              {/* Existing Branches List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {git.branches.map((b) => {
                  const isSelected = b.name === git.currentBranch;
                  const isDefault = b.name === git.defaultBranch || b.name === 'main';
                  return (
                    <button
                      key={b.name}
                      type="button"
                      disabled={busy}
                      onClick={() => handleSelectBranch(b.name)}
                      className={`flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-[#161922] border-[#2a3040] text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-mono truncate">
                        <GitBranch className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                        <span className="truncate">{b.name}</span>
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                          isDefault
                            ? 'bg-amber-500/20 text-amber-300'
                            : isSelected
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-[#1d212d] text-gray-400'
                        }`}
                      >
                        {isDefault ? 'protegida' : isSelected ? 'ativa' : 'selecionar'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Optional Create New Branch Form */}
              {showCreateBranch && (
                <form
                  onSubmit={handleCreateBranch}
                  className="p-3 rounded-md bg-[#161922] border border-cyan-500/40 space-y-2.5"
                >
                  <div className="text-[11px] font-semibold text-cyan-300">
                    Criar Nova Branch
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-gray-400 block mb-1">Nome da nova branch</label>
                      <input
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder={`collab/${git.userLogin.toLowerCase()}-revisao`}
                        className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Criar a partir de</label>
                      <select
                        value={baseBranch || git.defaultBranch}
                        onChange={(e) => setBaseBranch(e.target.value)}
                        className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 font-mono focus:outline-none focus:border-cyan-500"
                      >
                        {git.branches.map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Criar e Selecionar Branch
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Step 3: Active Branch Actions (Commit, Fork, PR, History) */}
          {git.connected && git.currentBranch && (
            <>
              <div className="p-3.5 rounded-lg bg-[#0f1117] border border-[#2a3040] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-200">3. Salvar na Branch:</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 font-mono">
                      {git.currentBranch}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleForkCurrentBranch}
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
                      Branch protegida ({git.currentBranch}): commits diretos estão bloqueados para
                      evitar sobreposição. Escolha outra branch acima ou clique em &ldquo;Criar
                      Nova Branch&rdquo;.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Mensagem do commit..."
                    className="flex-1 bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
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
              {!git.isReadOnlyBranch && (
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
                      type="button"
                      onClick={handleOpenPr}
                      disabled={busy}
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
              )}

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
