import React, { useState } from 'react';
import {
  Boxes,
  Copy,
  Crosshair,
  Link2,
  Link2Off,
  Palette,
  PanelRightClose,
  Sliders,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { createDefaultMaterial, useSceneStore } from '../../store/sceneStore';
import { EntityCategory, MaterialPreset, Vec3 } from '../../types/scene';

const PRESET_OPTIONS: Array<{ value: MaterialPreset; label: string }> = [
  { value: 'wall', label: 'Parede (Alvenaria/Gesso)' },
  { value: 'ceramic', label: 'Chão Cerâmico (Rejunte)' },
  { value: 'wood', label: 'Madeira (Tábuas/Veios)' },
  { value: 'concrete', label: 'Concreto (Industrial)' },
  { value: 'original', label: 'Original do GLB' },
];

export const InspectorPanel: React.FC = () => {
  const entities = useSceneStore((s) => s.entities);
  const selectedId = useSceneStore((s) => s.selectedId);
  const commitEntityTransform = useSceneStore((s) => s.commitEntityTransform);
  const updateEntityMaterial = useSceneStore((s) => s.updateEntityMaterial);
  const updateEntityProps = useSceneStore((s) => s.updateEntityProps);
  const duplicateEntity = useSceneStore((s) => s.duplicateEntity);
  const deleteEntity = useSceneStore((s) => s.deleteEntity);
  const triggerFocusSelected = useSceneStore((s) => s.triggerFocusSelected);
  const toggleInspector = useSceneStore((s) => s.toggleInspector);
  const groupTransformMode = useSceneStore((s) => s.groupTransformMode);
  const setGroupTransformMode = useSceneStore((s) => s.setGroupTransformMode);
  const uniformScale = useSceneStore((s) => s.uniformScale);
  const toggleUniformScale = useSceneStore((s) => s.toggleUniformScale);
  const splitGlbEntity = useSceneStore((s) => s.splitGlbEntity);
  const [splitting, setSplitting] = useState(false);

  const entity = entities.find((e) => e.id === selectedId) || null;

  if (!entity) {
    return (
      <aside className="w-72 bg-[#161922] border-l border-[#2a3040] flex flex-col shrink-0 h-full">
        <div className="px-3 py-2.5 border-b border-[#2a3040] flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            Inspector
          </span>
          <button
            onClick={toggleInspector}
            title="Ocultar Inspector"
            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-gray-500">
          <Sliders className="w-8 h-8 mb-3 opacity-30" />
          <p className="font-medium text-gray-400 mb-1">Nenhuma entidade selecionada</p>
          <p>Clique em um objeto na viewport 3D ou na Hierarquia à esquerda para editar suas propriedades.</p>
        </div>
      </aside>
    );
  }

  const updateAxis = (
    field: 'position' | 'rotation' | 'scale',
    axisIdx: 0 | 1 | 2,
    rawVal: string
  ) => {
    const val = parseFloat(rawVal);
    if (Number.isNaN(val)) return;
    const before = {
      position: [...entity.position] as Vec3,
      rotation: [...entity.rotation] as Vec3,
      scale: [...entity.scale] as Vec3,
    };
    const after = {
      position: [...entity.position] as Vec3,
      rotation: [...entity.rotation] as Vec3,
      scale: [...entity.scale] as Vec3,
    };
    if (field === 'scale' && uniformScale) {
      const oldVal = Math.max(0.001, entity.scale[axisIdx]);
      const newVal = Math.max(0.02, val);
      const ratio = newVal / oldVal;
      after.scale = [
        Math.max(0.02, Number((entity.scale[0] * ratio).toFixed(4))),
        Math.max(0.02, Number((entity.scale[1] * ratio).toFixed(4))),
        Math.max(0.02, Number((entity.scale[2] * ratio).toFixed(4))),
      ];
    } else {
      after[field][axisIdx] = field === 'scale' ? Math.max(0.02, val) : val;
    }
    commitEntityTransform(entity.id, before, after);
  };

  const handlePresetChange = (preset: MaterialPreset) => {
    const defaults = createDefaultMaterial(preset);
    updateEntityMaterial(entity.id, {
      ...defaults,
      tilingU: entity.material.tilingU,
      tilingV: entity.material.tilingV,
    });
  };

  const realWidth = (entity.baseSize ? entity.baseSize[0] * entity.scale[0] : entity.scale[0]).toFixed(2);
  const realHeight = (entity.baseSize ? entity.baseSize[1] * entity.scale[1] : entity.scale[1]).toFixed(2);
  const realDepth = (entity.baseSize ? entity.baseSize[2] * entity.scale[2] : entity.scale[2]).toFixed(2);

  const axisColors = ['text-red-400', 'text-emerald-400', 'text-blue-400'];
  const axisLabels = ['X', 'Y', 'Z'];

  return (
    <aside className="w-72 bg-[#161922] border-l border-[#2a3040] flex flex-col shrink-0 h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[#2a3040] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          Inspector
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1d212d] text-blue-300 uppercase">
            {entity.kind}
          </span>
          <button
            onClick={toggleInspector}
            title="Ocultar Inspector"
            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* Identification */}
        <section className="space-y-2">
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Nome</label>
            <input
              type="text"
              value={entity.name}
              onChange={(e) => updateEntityProps(entity.id, { name: e.target.value })}
              className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>ID:</span>
            <span className="font-mono truncate max-w-[170px]" title={entity.id}>
              {entity.id}
            </span>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Categoria na Hierarquia</label>
            <select
              value={entity.category}
              onChange={(e) =>
                updateEntityProps(entity.id, { category: e.target.value as EntityCategory })
              }
              className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="structure">Estruturas (Parede / Porta / Janela / Piso)</option>
              <option value="furniture">Móveis / Objetos</option>
              <option value="lighting">Iluminação</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Tags (separadas por vírgula)</label>
            <input
              type="text"
              value={entity.tags.join(', ')}
              onChange={(e) =>
                updateEntityProps(entity.id, {
                  tags: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </section>

        {/* GLB Sub-Element & Multi-Part Assembly Controls */}
        {entity.kind === 'glb' && (
          <section className="pt-3 border-t border-[#2a3040] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Ungroup className="w-3.5 h-3.5" />
                Elementos 3D do GLB
              </span>
              {entity.glbPart && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono">
                  Malha #{entity.glbPart.primIndex + 1}
                </span>
              )}
            </div>

            {entity.groupId && (
              <div className="p-2 rounded bg-[#0f1117] border border-[#2a3040] space-y-2">
                <div className="text-[11px] text-gray-300 truncate">
                  Conjunto: <strong className="text-white">{entity.groupName || 'Modelo GLB'}</strong>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setGroupTransformMode(false)}
                    className={`py-1.5 px-2 rounded text-[11px] font-medium border flex items-center justify-center gap-1 ${
                      !groupTransformMode
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#161922] border-[#2a3040] text-gray-300 hover:text-white'
                    }`}
                    title="Mover, rotacionar e escalar apenas esta peça (ex: uma janela, porta ou parede individual)"
                  >
                    <Ungroup className="w-3 h-3" />
                    Peça Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupTransformMode(true)}
                    className={`py-1.5 px-2 rounded text-[11px] font-medium border flex items-center justify-center gap-1 ${
                      groupTransformMode
                        ? 'bg-cyan-600 border-cyan-500 text-white'
                        : 'bg-[#161922] border-[#2a3040] text-gray-300 hover:text-white'
                    }`}
                    title="Mover todas as peças deste modelo GLB juntas mantendo o alinhamento"
                  >
                    <Boxes className="w-3 h-3" />
                    Mover Conjunto
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={splitting}
              onClick={async () => {
                setSplitting(true);
                try {
                  await splitGlbEntity(entity.id, 'fine');
                } finally {
                  setSplitting(false);
                }
              }}
              className="w-full py-1.5 px-2.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Separa sub-malhas e ilhas 3D desconectadas dentro desta peça em objetos independentes com pivôs próprios"
            >
              <Ungroup className="w-3.5 h-3.5 text-cyan-400" />
              {splitting ? 'Analisando Malha 3D...' : 'Desmembrar Sub-Partes / Ilhas 3D'}
            </button>
          </section>
        )}

        {/* Transform */}
        <section className="pt-3 border-t border-[#2a3040] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Transform
            </h3>
            <span className="text-[10px] text-gray-500 font-mono">
              {realWidth}m × {realHeight}m × {realDepth}m
            </span>
          </div>

          {(['position', 'rotation', 'scale'] as const).map((field) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-gray-400 capitalize">
                  {field === 'position'
                    ? 'Posição (m)'
                    : field === 'rotation'
                    ? 'Rotação (°)'
                    : 'Escala / Dimensão'}
                </label>
                {field === 'scale' && (
                  <label
                    className="flex items-center gap-1.5 text-[10px] cursor-pointer select-none text-gray-300 hover:text-white"
                    title="Quando ativado, altera X, Y e Z proporcionalmente (tanto no Inspector quanto no Gizmo R)"
                  >
                    <input
                      type="checkbox"
                      checked={uniformScale}
                      onChange={toggleUniformScale}
                      className="accent-blue-500"
                    />
                    {uniformScale ? (
                      <Link2 className="w-3 h-3 text-blue-400" />
                    ) : (
                      <Link2Off className="w-3 h-3 text-gray-500" />
                    )}
                    <span>Proporcional</span>
                  </label>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([0, 1, 2] as const).map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center bg-[#0f1117] border border-[#2a3040] rounded overflow-hidden focus-within:border-blue-500"
                  >
                    <span className={`px-1.5 text-[10px] font-bold ${axisColors[idx]}`}>
                      {axisLabels[idx]}
                    </span>
                    <input
                      type="number"
                      step={field === 'rotation' ? 5 : 0.05}
                      value={Number(entity[field][idx].toFixed(3))}
                      onChange={(e) => updateAxis(field, idx, e.target.value)}
                      className="w-full bg-transparent py-1 pr-1 text-[11px] text-gray-100 focus:outline-none font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Light Settings */}
        {entity.kind === 'light' && (
          <section className="pt-3 border-t border-[#2a3040] space-y-2.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Iluminação
            </h3>
            <div className="flex items-center justify-between">
              <label className="text-gray-300">Cor da Luz</label>
              <input
                type="color"
                value={entity.lightColor || '#fff2d6'}
                onChange={(e) => updateEntityProps(entity.id, { lightColor: e.target.value })}
                className="w-8 h-6 bg-transparent border border-[#2a3040] rounded cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>Intensidade</span>
                <span className="font-mono">{(entity.lightIntensity ?? 1).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                step="0.05"
                value={entity.lightIntensity ?? 1}
                onChange={(e) =>
                  updateEntityProps(entity.id, { lightIntensity: parseFloat(e.target.value) })
                }
                className="w-full accent-blue-500"
              />
            </div>
          </section>
        )}

        {/* Procedural Material Editor */}
        {entity.kind !== 'light' && (
          <section className="pt-3 border-t border-[#2a3040] space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Material PBR Procedural
              </h3>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Preset</label>
              <select
                value={entity.material.preset}
                onChange={(e) => handlePresetChange(e.target.value as MaterialPreset)}
                className="w-full bg-[#0f1117] border border-[#2a3040] rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
              >
                {PRESET_OPTIONS.filter(
                  (opt) => opt.value !== 'original' || entity.kind === 'glb'
                ).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {entity.material.preset !== 'original' && (
              <>
                <div className="flex items-center justify-between">
                  <label className="text-gray-300">Cor Base</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-gray-400">
                      {entity.material.color}
                    </span>
                    <input
                      type="color"
                      value={entity.material.color}
                      onChange={(e) =>
                        updateEntityMaterial(entity.id, { color: e.target.value })
                      }
                      className="w-8 h-6 bg-transparent border border-[#2a3040] rounded cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                    <span>Rugosidade (Roughness)</span>
                    <span className="font-mono">{entity.material.roughness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.02"
                    value={entity.material.roughness}
                    onChange={(e) =>
                      updateEntityMaterial(entity.id, {
                        roughness: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* UV Tiling */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-gray-400">Escala UV (Tiling)</label>
                    <button
                      onClick={() =>
                        updateEntityMaterial(entity.id, {
                          tilingU: Number(Math.max(0.5, entity.scale[0] * 0.5).toFixed(2)),
                          tilingV: Number(
                            Math.max(
                              0.5,
                              (entity.kind === 'floor' ? entity.scale[2] : entity.scale[1]) * 0.5
                            ).toFixed(2)
                          ),
                        })
                      }
                      className="text-[10px] text-blue-400 hover:underline"
                    >
                      Auto-ajustar UV
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex items-center bg-[#0f1117] border border-[#2a3040] rounded px-1.5">
                      <span className="text-[10px] text-gray-500 mr-1">U</span>
                      <input
                        type="number"
                        step="0.25"
                        min="0.1"
                        value={entity.material.tilingU}
                        onChange={(e) =>
                          updateEntityMaterial(entity.id, {
                            tilingU: Math.max(0.1, parseFloat(e.target.value) || 1),
                          })
                        }
                        className="w-full bg-transparent py-1 text-[11px] text-gray-100 focus:outline-none font-mono"
                      />
                    </div>
                    <div className="flex items-center bg-[#0f1117] border border-[#2a3040] rounded px-1.5">
                      <span className="text-[10px] text-gray-500 mr-1">V</span>
                      <input
                        type="number"
                        step="0.25"
                        min="0.1"
                        value={entity.material.tilingV}
                        onChange={(e) =>
                          updateEntityMaterial(entity.id, {
                            tilingV: Math.max(0.1, parseFloat(e.target.value) || 1),
                          })
                        }
                        className="w-full bg-transparent py-1 text-[11px] text-gray-100 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Ceramic-specific parameters */}
                {entity.material.preset === 'ceramic' && (
                  <div className="p-2.5 bg-[#0f1117] rounded border border-[#2a3040] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-gray-300">Cor do Rejunte</label>
                      <input
                        type="color"
                        value={entity.material.groutColor || '#9aa0a8'}
                        onChange={(e) =>
                          updateEntityMaterial(entity.id, { groutColor: e.target.value })
                        }
                        className="w-7 h-5 bg-transparent border border-[#2a3040] rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                        <span>Placas por UV</span>
                        <span className="font-mono">{entity.material.tileSize ?? 2}×{entity.material.tileSize ?? 2}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={entity.material.tileSize ?? 2}
                        onChange={(e) =>
                          updateEntityMaterial(entity.id, {
                            tileSize: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                        <span>Espessura do Rejunte</span>
                        <span className="font-mono">{((entity.material.groutWidth ?? 0.04) * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="0.14"
                        step="0.01"
                        value={entity.material.groutWidth ?? 0.04}
                        onChange={(e) =>
                          updateEntityMaterial(entity.id, {
                            groutWidth: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* Wood-specific parameters */}
                {entity.material.preset === 'wood' && (
                  <div className="p-2.5 bg-[#0f1117] rounded border border-[#2a3040]">
                    <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                      <span>Variação Tonal das Tábuas</span>
                      <span className="font-mono">
                        {Math.round((entity.material.plankVariation ?? 0.35) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={entity.material.plankVariation ?? 0.35}
                      onChange={(e) =>
                        updateEntityMaterial(entity.id, {
                          plankVariation: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-blue-500"
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-2.5 border-t border-[#2a3040] grid grid-cols-3 gap-1.5">
        <button
          onClick={triggerFocusSelected}
          title="Focar câmera no objeto (Tecla F)"
          className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#1d212d] hover:bg-[#272d3d] text-xs text-gray-200 border border-[#2a3040]"
        >
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          Focar
        </button>
        <button
          onClick={() => duplicateEntity(entity.id)}
          title="Duplicar (Ctrl+D)"
          className="flex items-center justify-center gap-1 py-1.5 rounded bg-[#1d212d] hover:bg-[#272d3d] text-xs text-gray-200 border border-[#2a3040]"
        >
          <Copy className="w-3.5 h-3.5 text-blue-400" />
          Duplicar
        </button>
        <button
          onClick={() => deleteEntity(entity.id)}
          disabled={entity.locked}
          title="Excluir (Delete)"
          className="flex items-center justify-center gap-1 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 text-xs text-red-300 border border-red-500/30 disabled:opacity-35"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir
        </button>
      </div>
    </aside>
  );
};
