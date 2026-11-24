import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { PlayCanvasEngine } from '../../engine/PlayCanvasEngine';
import { saveGlbAsset } from '../../services/assetDb';
import { sanitizeGlbFileName } from '../../services/security';
import { useSceneStore } from '../../store/sceneStore';

export const PlayCanvasViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PlayCanvasEngine | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const toolMode = useSceneStore((s) => s.toolMode);
  const cameraMode = useSceneStore((s) => s.cameraMode);
  const wallPreviewLength = useSceneStore((s) => s.wallPreviewLength);
  const polygonVertexCount = useSceneStore((s) => s.polygonVertexCount);
  const wallConfig = useSceneStore((s) => s.wallConfig);
  const updateWallConfig = useSceneStore((s) => s.updateWallConfig);
  const importGlbAsset = useSceneStore((s) => s.importGlbAsset);
  const showToast = useSceneStore((s) => s.showToast);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PlayCanvasEngine(canvas);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(glb|gltf)$/i.test(f.name)
    );
    if (files.length === 0) {
      showToast('Arraste arquivos .glb ou .gltf válidos.');
      return;
    }

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const assetId = `glb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const safeFileName = sanitizeGlbFileName(file.name, assetId);
        await saveGlbAsset(assetId, safeFileName, buffer);

        await importGlbAsset({
          assetId,
          fileName: safeFileName,
          modelName: file.name.replace(/\.(glb|gltf)$/i, ''),
          decompose: false,
        });
      } catch (err) {
        console.error(err);
        showToast(`Erro ao importar ${file.name}`);
      }
    }
  };

  return (
    <div
      className="relative flex-1 h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 50% 44%, #7a808a 0%, #525760 55%, #373b43 100%)',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block outline-none cursor-crosshair"
        style={{ cursor: toolMode === 'select' ? 'default' : 'crosshair' }}
      />

      {/* Parametric Wall Build HUD */}
      {toolMode === 'draw_wall' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#161922]/95 border border-cyan-500/50 rounded-lg px-4 py-2 shadow-xl flex items-center gap-4 text-xs backdrop-blur-sm">
          <span className="font-semibold text-cyan-400">Construtor de Parede</span>
          <span className="text-gray-300">
            Clique no ponto inicial e depois no final (ESC cancela)
          </span>
          <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
            <label className="text-gray-400">Alt (m):</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="8"
              value={wallConfig.height}
              onChange={(e) =>
                updateWallConfig({ height: Math.max(0.5, Number(e.target.value) || 2.8) })
              }
              className="w-14 bg-[#0f1117] border border-gray-700 rounded px-1.5 py-0.5 text-gray-100"
            />
            <label className="text-gray-400">Esp (m):</label>
            <input
              type="number"
              step="0.05"
              min="0.05"
              max="1"
              value={wallConfig.thickness}
              onChange={(e) =>
                updateWallConfig({ thickness: Math.max(0.05, Number(e.target.value) || 0.15) })
              }
              className="w-14 bg-[#0f1117] border border-gray-700 rounded px-1.5 py-0.5 text-gray-100"
            />
          </div>
          {wallPreviewLength !== null && (
            <span className="bg-cyan-500/20 text-cyan-300 font-mono font-bold px-2 py-0.5 rounded">
              {wallPreviewLength.toFixed(2)} m
            </span>
          )}
        </div>
      )}

      {/* Rect Floor HUD */}
      {toolMode === 'draw_floor' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#161922]/95 border border-amber-500/50 rounded-lg px-4 py-2 shadow-xl text-xs text-amber-300 backdrop-blur-sm">
          <span className="font-semibold mr-2">Piso Retangular:</span>
          Clique no primeiro canto e depois no canto oposto (ESC cancela)
        </div>
      )}

      {/* Polygon Floor HUD */}
      {toolMode === 'draw_polygon_floor' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#161922]/95 border border-amber-500/50 rounded-lg px-4 py-2 shadow-xl text-xs text-amber-300 backdrop-blur-sm flex items-center gap-3">
          <span className="font-semibold">Laje Poligonal:</span>
          <span>Clique para adicionar vértices. Duplo-clique ou Enter para fechar.</span>
          <span className="bg-amber-500/20 px-2 py-0.5 rounded font-mono">
            {polygonVertexCount} vértices
          </span>
        </div>
      )}

      {/* FPS Walk-through HUD */}
      {cameraMode === 'fps' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#161922]/90 border border-gray-700 rounded-full px-4 py-1.5 text-xs text-gray-200 backdrop-blur-sm pointer-events-none">
          Modo Primeira Pessoa (Y = 1.65m) • <span className="text-blue-400 font-semibold">WASD</span> andar • <span className="text-blue-400 font-semibold">Arrastar Mouse</span> olhar • <span className="text-blue-400 font-semibold">Shift</span> correr
        </div>
      )}

      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-600/20 border-2 border-dashed border-blue-400 flex flex-col items-center justify-center backdrop-blur-xs z-20 pointer-events-none">
          <Upload className="w-12 h-12 text-blue-300 mb-2" />
          <p className="text-lg font-semibold text-white">Solte o arquivo .GLB / .GLTF aqui</p>
          <p className="text-xs text-blue-200">O modelo será salvo localmente no IndexedDB e inserido na cena</p>
        </div>
      )}
    </div>
  );
};
