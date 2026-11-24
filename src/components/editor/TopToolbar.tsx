import React, { useRef, useState } from 'react';
import {
  Box,
  Camera,
  Columns3,
  DoorOpen,
  Eye,
  GitBranch,
  Globe,
  Grid3X3,
  Layers,
  Lightbulb,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  Pentagon,
  Redo2,
  RotateCcw,
  RotateCw,
  Square,
  Sun,
  Sunset,
  Undo2,
  Upload,
  User,
  BrickWall,
  AppWindow,
} from 'lucide-react';
import { saveGlbAsset } from '../../services/assetDb';
import { createDefaultMaterial, useSceneStore } from '../../store/sceneStore';

export const TopToolbar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showSnapMenu, setShowSnapMenu] = useState(false);

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
  const snap = useSceneStore((s) => s.snap);
  const updateSnap = useSceneStore((s) => s.updateSnap);
  const undoStack = useSceneStore((s) => s.undoStack);
  const redoStack = useSceneStore((s) => s.redoStack);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const addPrimitive = useSceneStore((s) => s.addPrimitive);
  const addEntity = useSceneStore((s) => s.addEntity);
  const setSketchfabOpen = useSceneStore((s) => s.setSketchfabOpen);
  const setGitModalOpen = useSceneStore((s) => s.setGitModalOpen);
  const triggerScreenshot = useSceneStore((s) => s.triggerScreenshot);
  const resetToSampleScene = useSceneStore((s) => s.resetToSampleScene);
  const showToast = useSceneStore((s) => s.showToast);
  const git = useSceneStore((s) => s.git);

  const handleGlbFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const assetId = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await saveGlbAsset(assetId, file.name, buffer);
      addEntity({
        name: file.name.replace(/\.(glb|gltf)$/i, ''),
        category: 'furniture',
        kind: 'glb',
        tags: ['glb', 'importado'],
        visible: true,
        locked: false,
        position: [0, 0.1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: createDefaultMaterial('original'),
        assetId,
        assetFileName: file.name,
      });
      showToast(`Arquivo "${file.name}" importado para a cena!`);
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
      {/* Left: Brand + Project + Drawing Tools */}
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

        {/* Selection & Parametric Builders */}
        <div className="flex items-center gap-0.5 bg-[#0f1117] p-0.5 rounded-md border border-[#2a3040]">
          <button
            onClick={() => setToolMode('select')}
            title="Selecionar (ESC)"
            className={`${btnBase} ${toolMode === 'select' ? btnActive : btnIdle}`}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setToolMode('draw_wall')}
            title="Desenhar Parede (clique inicial e final)"
            className={`${btnBase} ${toolMode === 'draw_wall' ? btnActive : btnIdle}`}
          >
            <BrickWall className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Parede</span>
          </button>
          <button
            onClick={() => setToolMode('draw_floor')}
            title="Desenhar Piso Retangular"
            className={`${btnBase} ${toolMode === 'draw_floor' ? btnActive : btnIdle}`}
          >
            <Square className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Piso</span>
          </button>
          <button
            onClick={() => setToolMode('draw_polygon_floor')}
            title="Desenhar Laje Poligonal"
            className={`${btnBase} ${toolMode === 'draw_polygon_floor' ? btnActive : btnIdle}`}
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Polígono</span>
          </button>
        </div>

        {/* Quick Architectural Primitives */}
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
            onClick={() => addPrimitive('pillar')}
            title="Inserir Pilar"
            className={`${btnBase} ${btnIdle}`}
          >
            <Columns3 className="w-3.5 h-3.5 text-gray-300" />
          </button>
          <button
            onClick={() => addPrimitive('block')}
            title="Inserir Bloco / Móvel"
            className={`${btnBase} ${btnIdle}`}
          >
            <Box className="w-3.5 h-3.5 text-orange-300" />
          </button>
          <button
            onClick={() => addPrimitive('light')}
            title="Inserir Ponto de Luz"
            className={`${btnBase} ${btnIdle}`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-yellow-300" />
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

        {/* Transform Gizmos */}
        <div className="flex items-center gap-0.5 bg-[#0f1117] p-0.5 rounded-md border border-[#2a3040] ml-1">
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('translate');
            }}
            title="Mover (W)"
            className={`${btnBase} ${gizmoMode === 'translate' && toolMode === 'select' ? btnActive : btnIdle}`}
          >
            <Move className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('rotate');
            }}
            title="Rotacionar (E)"
            className={`${btnBase} ${gizmoMode === 'rotate' && toolMode === 'select' ? btnActive : btnIdle}`}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setToolMode('select');
              setGizmoMode('scale');
            }}
            title="Escalar (R)"
            className={`${btnBase} ${gizmoMode === 'scale' && toolMode === 'select' ? btnActive : btnIdle}`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-l border-[#2a3040] pl-2">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Desfazer (Ctrl+Z)"
            className={`${btnBase} ${undoStack.length === 0 ? 'opacity-35 cursor-not-allowed' : btnIdle}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Refazer (Ctrl+Y)"
            className={`${btnBase} ${redoStack.length === 0 ? 'opacity-35 cursor-not-allowed' : btnIdle}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Camera Modes, Snap, Lighting, Screenshot, Git */}
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
            onClick={() => setShowSnapMenu((v) => !v)}
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

        {/* Lighting Preset */}
        <button
          onClick={() => setLighting(lighting === 'day' ? 'sunset' : 'day')}
          title={lighting === 'day' ? 'Iluminação: Dia (clique para Entardecer)' : 'Iluminação: Entardecer (clique para Dia)'}
          className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-200 hover:bg-[#272d3d]`}
        >
          {lighting === 'day' ? (
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
          ) : (
            <Sunset className="w-3.5 h-3.5 text-orange-400" />
          )}
        </button>

        {/* Screenshot */}
        <button
          onClick={triggerScreenshot}
          title="Capturar Screenshot PNG"
          className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-200 hover:bg-[#272d3d]`}
        >
          <Camera className="w-3.5 h-3.5 text-gray-300" />
        </button>

        {/* Reset Sample */}
        <button
          onClick={() => {
            if (window.confirm('Restaurar a planta de exemplo inicial?')) {
              resetToSampleScene();
            }
          }}
          title="Restaurar planta exemplo"
          className={`${btnBase} bg-[#1d212d] border border-[#2a3040] text-gray-400 hover:text-white`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

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
          <span className="max-w-[110px] truncate">
            {git.connected ? git.currentBranch : 'Git / Branch'}
          </span>
        </button>
      </div>
    </header>
  );
};
