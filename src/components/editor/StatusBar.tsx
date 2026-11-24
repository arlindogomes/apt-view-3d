import React from 'react';
import { GitBranch, Magnet, Layers } from 'lucide-react';
import { useSceneStore } from '../../store/sceneStore';

export const StatusBar: React.FC = () => {
  const entitiesCount = useSceneStore((s) => s.entities.length);
  const cameraMode = useSceneStore((s) => s.cameraMode);
  const gizmoMode = useSceneStore((s) => s.gizmoMode);
  const snap = useSceneStore((s) => s.snap);
  const git = useSceneStore((s) => s.git);
  const setGitModalOpen = useSceneStore((s) => s.setGitModalOpen);

  const cameraLabel =
    cameraMode === 'perspective'
      ? 'Perspectiva 3D'
      : cameraMode === 'top2d'
      ? 'Planta Baixa 2D (Topo)'
      : 'Primeira Pessoa (1.65m)';

  const gizmoLabel =
    gizmoMode === 'translate'
      ? 'Mover (W)'
      : gizmoMode === 'rotate'
      ? 'Rotacionar (E)'
      : 'Escalar (R)';

  return (
    <footer className="h-7 bg-[#12151e] border-t border-[#2a3040] px-3 flex items-center justify-between text-[11px] text-gray-400 shrink-0 select-none">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3 text-blue-400" />
          {entitiesCount} entidades
        </span>
        <span className="hidden sm:inline">Câmera: {cameraLabel}</span>
        <span className="hidden md:inline">Gizmo: {gizmoLabel}</span>
        <span className="hidden lg:flex items-center gap-1">
          <Magnet className="w-3 h-3 text-emerald-400" />
          Snap: {snap.enabled ? `${snap.gridStep}m / ${snap.angleStep}°` : 'Off'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden xl:inline text-gray-500">
          W Mover • E Girar • R Escalar • F Focar • Ctrl+Z/Y Undo/Redo • Ctrl+D Duplicar • Del Excluir
        </span>
        <button
          onClick={() => setGitModalOpen(true)}
          className="flex items-center gap-1 hover:text-white transition-colors"
        >
          <GitBranch className="w-3 h-3 text-indigo-400" />
          <span>{git.connected ? `${git.owner}/${git.repo} (${git.currentBranch})` : 'Git: Local Draft'}</span>
        </button>
      </div>
    </footer>
  );
};
