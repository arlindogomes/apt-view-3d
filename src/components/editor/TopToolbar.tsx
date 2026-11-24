import React, { useRef, useState } from 'react';
import {
  AppWindow,
  Box,
  DoorOpen,
  Eye,
  GitBranch,
  Globe,
  Grid3X3,
  Group,
  Layers,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  RotateCw,
  Square,
  Sun,
  Undo2,
  Ungroup,
  Upload,
  User,
} from 'lucide-react';
import { getHdriPresetMeta, HDRI_PRESETS } from '../../materials/HdriEnvironmentFactory';
import { saveGlbAsset } from '../../services/assetDb';
import { sanitizeGlbFileName } from '../../services/security';
import { useSceneStore } from '../../store/sceneStore';

export const TopToolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [showHdriMenu, setShowHdriMenu] = useState(false);

  const projectName = useSceneStore((s) => s.projectName);
  const setProjectName = useSceneStore((s) => s.setProjectName);
  const toolMode = useSceneStore((s) => s.toolMode);
  const setToolMode = useSceneStore((s) => s.setToolMode);
  const gizmoMode = useSceneStore((s) => s.gizmoMode);
  const setGizmoMode = useSceneStore((s) => s.setGizmoMode);
  const cameraMode = useSceneStore((s) => s.cameraMode);
  const setCameraMode = useSceneStore((s) => s.setCameraMode);
  const lighting = useSceneStore((s) => s.lighting);
  const setLighting = useSceneStore((s) => s.setLighting);
  const envIntensity = useSceneStore((s) => s.envIntensity);
  const setEnvIntensity = useSceneStore((s) => s.setEnvIntensity);
  const snap = useSceneStore((s) => s.snap);
  const updateSnap = useSceneStore((s) => s.updateSnap);
  const undoStack = useSceneStore((s) => s.undoStack);
  const redoStack = useSceneStore((s) => s.redoStack);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const entities = useSceneStore((s) => s.entities);
  const groupSelectedEntities = useSceneStore((s) => s.groupSelectedEntities);
  const ungroupSelectedEntities = useSceneStore((s) => s.ungroupSelectedEntities);
  const addPrimitive = useSceneStore((s) => s.addPrimitive);
  const importGlbAsset = useSceneStore((s) => s.importGlbAsset);
  const setSketchfabOpen = useSceneStore((s) => s.setSketchfabOpen);
  const setGitModalOpen = useSceneStore((s) => s.setGitModalOpen);
  const isInspectorVisible = useSceneStore((s) => s.isInspectorVisible);
  const toggleInspector = useSceneStore((s) => s.toggleInspector);
  const showToast = useSceneStore((s) => s.showToast);
  const git = useSceneStore((s) => s.git);

  const activeHdri = getHdriPresetMeta(lighting);

  const handleGlbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const assetId = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const safeFileName = sanitizeGlbFileName(file.name, assetId);
      const modelName = file.name.replace(/\.(glb|gltf)$/i, '');
      await saveGlbAsset(assetId, safeFileName, buffer);
      await importGlbAsset({
        assetId,
        fileName: safeFileName,
        modelName,
        decompose: false,
      });
    } catch {
      showToast('Erro ao importar arquivo GLB.');
    } finally {
      e.target.value = '';
    }
  };

  const btnBase =
    'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap';
  const btnIdle = 'text-gray-300 hover:bg-[#252b3b] hover:text-white';
  const btnActive = 'bg-blue-600 text-white shadow-sm';

  return (
    <header className="h-12 bg-[#161922] border-b border-[#2a3040] px-3 flex items-center justify-between gap-2 z-30 shrink-0">
      {/* Left: Brand + Project + Tools */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 pr-2 border-r border-[#2a3040]">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-bold text-xs text-white shadow">
            3D
          </div>
          <div className="hidden xl:flex flex-col">
            <span className="text-xs font-bold leading-tight text-white">APT-View 3D</span>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              title="Nome do projeto"
              className="text-[10px] text-gray-400 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500 focus:outline-none w-28"
            />
          </div>
        </div>

        {/* Selection & Floor Builder */}
        <div className="flex items-center gap-0.5 bg-[#0f1117] p-0.5 rounded-md border border-[#2a3040]">
          <button
            onClick={() => setToolMode('select')}
            title="Selecionar (ESC)"
            className={`${btnBase} ${toolMode === 'select' ? btnActive : btnIdle}`}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setToolMode('draw_floor')}
            title="Criar Piso (clique nos dois cantos opostos)"
            className={`${btnBase} ${toolMode === 'draw_floor' ? btnActive : btnIdle}`}
          >
            <Square className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Criar Piso</span>
          </button>
        </div>

        {/* Architectural Primitives (Porta, Janela, Bloco) */}
        <div className="flex items-center gap-0.5 border-l border-[#2a3040] pl-2">
          <button
            onClick={() => addPrimitive('door')}
            title="Inserir Porta"
            className={`${btnBase} ${btnIdle}`}
          >
            <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden 2xl:inline">Porta</span>
          </button>
          <button
            onClick={() => addPrimitive('window')}
            title="Inserir Janela"
            className={`${btnBase} ${btnIdle}`}
          >
            <AppWindow className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden 2xl:inline">Janela</span>
          </button>
          <button
            onClick={() => addPrimitive('block')}
            title="Inserir Bloco / Móvel"
            className={`${btnBase} ${btnIdle}`}
          >
            <Box className="w-3.5 h-3.5 text-orange-300" />
          </button>
        </div>

        {/* Import GLB & Sketchfab */}
        <div className="flex items-center gap-1 border-l border-[#2a3040] pl-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleGlbFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importar arquivo .GLB / .GLTF local"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-200 hover:bg-[#272d3d]`}
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">.GLB</span>
          </button>
          <button
            onClick={() => setSketchfabOpen(true)}
            title="Catálogo 3D & Sketchfab API"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-200 hover:bg-[#272d3d]`}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Sketchfab</span>
          </button>
        </div>

        {/* Transform Gizmos (W / E / R) */}
        <div className="flex items-center gap-0.5 bg-[#0f1117] p-0.5 rounded-md border border-[#2a3040] ml-1">
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('translate');
            }}
            title="Mover (W)"
            className={`${btnBase} ${
              gizmoMode === 'translate' && toolMode === 'select' ? btnActive : btnIdle
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span className="text-[10px] opacity-75 font-mono">W</span>
          </button>
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('rotate');
            }}
            title="Rotacionar (E)"
            className={`${btnBase} ${
              gizmoMode === 'rotate' && toolMode === 'select' ? btnActive : btnIdle
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] opacity-75 font-mono">E</span>
          </button>
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('scale');
            }}
            title="Escalar (R)"
            className={`${btnBase} ${
              gizmoMode === 'scale' && toolMode === 'select' ? btnActive : btnIdle
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-[10px] opacity-75 font-mono">R</span>
          </button>
        </div>

        {/* Group / Ungroup (Ctrl+G / Ctrl+Shift+G) */}
        <div className="flex items-center gap-1 border-l border-[#2a3040] pl-2">
          <button
            onClick={() => groupSelectedEntities()}
            disabled={selectedIds.length < 2}
            title="Agrupar objetos selecionados (Ctrl+G — use Shift+Clique para selecionar vários)"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] ${
              selectedIds.length < 2
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-cyan-300 hover:bg-[#272d3d] hover:text-white'
            }`}
          >
            <Group className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Agrupar</span>
          </button>
          <button
            onClick={() => ungroupSelectedEntities()}
            disabled={
              selectedIds.length === 0 ||
              !entities.some(
                (e) =>
                  selectedIds.includes(e.id) &&
                  (Boolean(e.groupId) || e.kind === 'glb')
              )
            }
            title="Desagrupar grupo ou separar elementos 3D de um modelo GLB (Ctrl+Shift+G)"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] ${
              selectedIds.length === 0 ||
              !entities.some(
                (e) =>
                  selectedIds.includes(e.id) &&
                  (Boolean(e.groupId) || e.kind === 'glb')
              )
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-amber-300 hover:bg-[#272d3d] hover:text-white'
            }`}
          >
            <Ungroup className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Desagrupar</span>
          </button>
        </div>

        {/* Undo / Redo (Ctrl+Z / Ctrl+Y) */}
        <div className="flex items-center gap-1 border-l border-[#2a3040] pl-2">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Desfazer (Ctrl+Z)"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] ${
              undoStack.length === 0
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-gray-200 hover:bg-[#272d3d] hover:text-white'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Desfazer</span>
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Refazer (Ctrl+Y)"
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] ${
              redoStack.length === 0
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-gray-200 hover:bg-[#272d3d] hover:text-white'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Refazer</span>
          </button>
        </div>
      </div>

      {/* Right: Camera Modes, Snap, HDRI Lighting, Git, Toggle Inspector */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Camera Switcher */}
        <div className="flex items-center gap-0.5 bg-[#0f1117] p-0.5 rounded-md border border-[#2a3040]">
          <button
            onClick={() => setCameraMode('perspective')}
            title="Perspectiva 3D (Orbit)"
            className={`${btnBase} ${cameraMode === 'perspective' ? btnActive : btnIdle}`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">3D</span>
          </button>
          <button
            onClick={() => setCameraMode('top2d')}
            title="Planta Baixa 2D (Topo Ortográfica)"
            className={`${btnBase} ${cameraMode === 'top2d' ? btnActive : btnIdle}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">2D</span>
          </button>
          <button
            onClick={() => setCameraMode('fps')}
            title="Primeira Pessoa (WASD)"
            className={`${btnBase} ${cameraMode === 'fps' ? btnActive : btnIdle}`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">FPS</span>
          </button>
        </div>

        {/* Snap Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowSnapMenu((v) => !v);
              setShowHdriMenu(false);
            }}
            title="Configurações de Grid e Snap"
            className={`${btnBase} ${
              snap.enabled
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[#1d212d] text-gray-400 border border-[#2a3040]'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{snap.gridStep}m</span>
          </button>
          {showSnapMenu && (
            <div className="absolute right-0 mt-1.5 w-56 bg-[#161922] border border-[#2a3040] rounded-lg shadow-2xl p-3 z-50 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-200 flex items-center gap-1.5">
                  <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" /> Snap to Grid
                </span>
                <input
                  type="checkbox"
                  checked={snap.enabled}
                  onChange={(e) => updateSnap({ enabled: e.target.checked })}
                  className="accent-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Passo da Grade</label>
                <div className="grid grid-cols-3 gap-1">
                  {[0.1, 0.25, 0.5].map((step) => (
                    <button
                      key={step}
                      onClick={() => updateSnap({ gridStep: step })}
                      className={`py-1 rounded border ${
                        snap.gridStep === step
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-[#0f1117] border-[#2a3040] text-gray-300'
                      }`}
                    >
                      {step}m
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-400 block mb-1">Angle Snap</label>
                <div className="grid grid-cols-3 gap-1">
                  {[15, 45, 90].map((ang) => (
                    <button
                      key={ang}
                      onClick={() => updateSnap({ angleStep: ang })}
                      className={`py-1 rounded border ${
                        snap.angleStep === ang
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-[#0f1117] border-[#2a3040] text-gray-300'
                      }`}
                    >
                      {ang}°
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#2a3040]">
                <span className="text-gray-300">Colisão de Piso (Y ≥ 0)</span>
                <input
                  type="checkbox"
                  checked={snap.floorClamp}
                  onChange={(e) => updateSnap({ floorClamp: e.target.checked })}
                  className="accent-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sketchfab-style HDRI Environment Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setShowHdriMenu((v) => !v);
              setShowSnapMenu(false);
            }}
            title={`Ambiente HDRI: ${activeHdri.name}`}
            className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-200 hover:bg-[#272d3d]`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden lg:inline max-w-[100px] truncate">{activeHdri.name}</span>
          </button>

          {showHdriMenu && (
            <div className="absolute right-0 mt-1.5 w-72 bg-[#161922] border border-[#2a3040] rounded-lg shadow-2xl p-3 z-50 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-[#2a3040] pb-2">
                <span className="font-semibold text-gray-100">Ambiente HDRI (Iluminação)</span>
                <span className="text-[10px] text-gray-400">IBL + AO</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {HDRI_PRESETS.map((preset) => {
                  const isActive = preset.id === lighting;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setLighting(preset.id)}
                      className={`text-left rounded-md overflow-hidden border transition-all ${
                        isActive
                          ? 'border-blue-500 ring-1 ring-blue-500/60 bg-[#1d2536]'
                          : 'border-[#2a3040] bg-[#0f1117] hover:border-gray-500'
                      }`}
                    >
                      <div
                        className="h-9 w-full"
                        style={{ background: preset.previewGradient }}
                      />
                      <div className="px-2 py-1.5">
                        <div className="text-[11px] font-semibold text-gray-100 truncate">
                          {preset.name}
                        </div>
                        <div className="text-[9px] text-gray-400 truncate">
                          {preset.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[#2a3040]">
                <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                  <span>Intensidade / Exposição</span>
                  <span className="font-mono">{envIntensity.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.8"
                  step="0.05"
                  value={envIntensity}
                  onChange={(e) => setEnvIntensity(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Git Collaboration Button */}
        <button
          onClick={() => setGitModalOpen(true)}
          title="Controle de Versão Git / GitHub Multi-Branch"
          className={`${btnBase} border ${
            git.connected
              ? git.isReadOnlyBranch
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-indigo-600/25 border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/40'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span className="max-w-[100px] truncate">
            {git.connected ? git.currentBranch : 'Git / Branch'}
          </span>
        </button>

        {/* Toggle Inspector Panel */}
        <button
          onClick={toggleInspector}
          title={isInspectorVisible ? 'Ocultar Inspector' : 'Exibir Inspector'}
          className={`${btnBase} border ${
            isInspectorVisible
              ? 'bg-[#1d212d] border-[#2a3040] text-blue-300 hover:bg-[#272d3d]'
              : 'bg-[#0f1117] border-[#2a3040] text-gray-400 hover:text-white'
          }`}
        >
          {isInspectorVisible ? (
            <PanelRightClose className="w-3.5 h-3.5" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" />
          )}
          <span className="hidden lg:inline">Inspector</span>
        </button>
      </div>
    </header>
  );
};
