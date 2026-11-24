import React, { useState } from 'react';
import {
  Download,
  Globe,
  KeyRound,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import { saveGlbAsset } from '../../services/assetDb';
import { sanitizePublicAssetUrl } from '../../services/security';
import {
  CatalogModelItem,
  clearSketchfabToken,
  downloadDirectGlb,
  downloadSketchfabGlb,
  FREE_KHRONOS_CATALOG,
  getSketchfabToken,
  isSketchfabTokenPersisted,
  searchSketchfabModels,
  setSketchfabToken,
} from '../../services/sketchfab';
import { useSceneStore } from '../../store/sceneStore';

export const SketchfabModal: React.FC = () => {
  const isOpen = useSceneStore((s) => s.isSketchfabOpen);
  const setOpen = useSceneStore((s) => s.setSketchfabOpen);
  const importGlbAsset = useSceneStore((s) => s.importGlbAsset);
  const showToast = useSceneStore((s) => s.showToast);

  const [token, setTokenState] = useState(getSketchfabToken);
  const [rememberToken, setRememberToken] = useState(isSketchfabTokenPersisted);
  const [decomposeOnImport, setDecomposeOnImport] = useState(false);
  const [tab, setTab] = useState<'free' | 'sketchfab'>(
    getSketchfabToken() ? 'sketchfab' : 'free'
  );
  const [query, setQuery] = useState('modern sofa');
  const [results, setResults] = useState<CatalogModelItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingUid, setImportingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveToken = (val: string, persist = rememberToken) => {
    setTokenState(val);
    setRememberToken(persist);
    setSketchfabToken(val, persist);
  };

  const handleClearToken = () => {
    clearSketchfabToken();
    setTokenState('');
    setRememberToken(false);
    showToast('Token do Sketchfab removido do navegador.');
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSearching(true);
    try {
      const items = await searchSketchfabModels(query, token);
      setResults(items);
      if (items.length === 0) {
        setError('Nenhum modelo baixável encontrado para esta busca.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar Sketchfab API.');
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (item: CatalogModelItem) => {
    setError(null);
    setImportingUid(item.uid);
    try {
      const { buffer, fileName } =
        item.source === 'khronos' && item.directGlbUrl
          ? await downloadDirectGlb(item.directGlbUrl, item.name)
          : await downloadSketchfabGlb(item.uid, token);

      const assetId = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await saveGlbAsset(assetId, fileName, buffer);

      // Notice: Only public allowlisted URLs (like Khronos) are saved in assetSourceUrl;
      // Sketchfab temporary signed S3 URLs and API tokens are NEVER stored in the entity or scene.json.
      await importGlbAsset({
        assetId,
        fileName,
        modelName: item.name,
        sourceUrl:
          item.source === 'khronos' ? sanitizePublicAssetUrl(item.directGlbUrl) : undefined,
        author: item.author,
        license: item.license,
        decompose: decomposeOnImport,
      });

      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar modelo GLB.');
    } finally {
      setImportingUid(null);
    }
  };

  const displayedItems = tab === 'free' ? FREE_KHRONOS_CATALOG : results;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[85vh] bg-[#161922] border border-[#2a3040] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a3040] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">
              Biblioteca 3D — Sketchfab API &amp; Catálogo Gratuito GLB
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs & Token */}
        <div className="px-4 py-2.5 bg-[#0f1117] border-b border-[#2a3040] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('free')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${
                tab === 'free'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1d212d] text-gray-300 hover:bg-[#252b3b]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Catálogo Gratuito (Khronos glTF)
            </button>
            <button
              onClick={() => setTab('sketchfab')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 ${
                tab === 'sketchfab'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1d212d] text-gray-300 hover:bg-[#252b3b]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Buscar no Sketchfab API v3
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="password"
              autoComplete="off"
              placeholder="Sketchfab API Token (apenas sessão)"
              value={token}
              onChange={(e) => handleSaveToken(e.target.value, rememberToken)}
              className="w-56 bg-[#161922] border border-[#2a3040] rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <label
              className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer select-none"
              title="Desmarcado (recomendado): o token fica apenas na memória da aba atual (sessionStorage) e nunca é compartilhado com outros projetos no domínio github.io."
            >
              <input
                type="checkbox"
                checked={rememberToken}
                onChange={(e) => handleSaveToken(token, e.target.checked)}
                className="accent-blue-500"
              />
              Lembrar
            </label>
            {token && (
              <button
                type="button"
                onClick={handleClearToken}
                title="Remover token do navegador"
                className="p-1 rounded bg-[#1d212d] hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-[#2a3040]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Security & 3D Element Separation Bar */}
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span>
              <strong>Proteção GitHub Público:</strong> Token isolado em{' '}
              <code>sessionStorage</code> (nunca salvo em <code>scene.json</code>).
            </span>
          </div>
          <label className="flex items-center gap-1.5 text-cyan-200 font-medium cursor-pointer select-none bg-[#161922]/80 px-2.5 py-1 rounded border border-cyan-500/30">
            <input
              type="checkbox"
              checked={decomposeOnImport}
              onChange={(e) => setDecomposeOnImport(e.target.checked)}
              className="accent-cyan-500"
            />
            <Ungroup className="w-3.5 h-3.5 text-cyan-400" />
            Separar elementos 3D internos (janelas, portas, paredes, sub-malhas)
          </label>
        </div>

        {/* Search bar for Sketchfab tab */}
        {tab === 'sketchfab' && (
          <form
            onSubmit={handleSearch}
            className="px-4 py-2.5 border-b border-[#2a3040] flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar modelos 3D baixáveis (ex: chair, table, plant, bed)..."
                className="w-full bg-[#0f1117] border border-[#2a3040] rounded pl-9 pr-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white flex items-center gap-1.5 disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Buscar
            </button>
          </form>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded bg-red-500/15 border border-red-500/40 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Info banner if Sketchfab tab has no token */}
        {tab === 'sketchfab' && !token.trim() && (
          <div className="mx-4 mt-3 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            Dica: Você pode buscar sem token, mas para baixar via Download API é necessário informar seu{' '}
            <strong>Sketchfab Personal API Token</strong> acima. Ou use o{' '}
            <button onClick={() => setTab('free')} className="underline font-semibold">
              Catálogo Gratuito Khronos
            </button>{' '}
            para importação imediata sem conta.
          </div>
        )}

        {/* Grid of models */}
        <div className="flex-1 overflow-y-auto p-4">
          {displayedItems.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-xs text-gray-500">
              <Globe className="w-8 h-8 mb-2 opacity-30" />
              <p>Clique em &ldquo;Buscar&rdquo; para listar modelos 3D do Sketchfab.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedItems.map((item) => {
                const isLoading = importingUid === item.uid;
                return (
                  <div
                    key={item.uid}
                    className="bg-[#0f1117] border border-[#2a3040] rounded-lg overflow-hidden flex flex-col"
                  >
                    <div className="h-36 bg-[#1d212d] relative overflow-hidden">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                          Sem prévia
                        </div>
                      )}
                      <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-gray-200">
                        {item.license}
                      </span>
                    </div>
                    <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-100 truncate" title={item.name}>
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-gray-400 truncate">por {item.author}</p>
                      </div>
                      <button
                        onClick={() => handleImport(item)}
                        disabled={importingUid !== null}
                        className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Baixando GLB...
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            Importar para Cena
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
