import React, { useMemo, useState } from 'react';
import {
  Box,
  BrickWall,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Lightbulb,
  Lock,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useSceneStore } from '../../store/sceneStore';
import { EntityCategory, SceneEntityData } from '../../types/scene';

const CATEGORY_META: Record<
  EntityCategory,
  { label: string; icon: React.ReactNode }
> = {
  structure: {
    label: 'Estruturas',
    icon: <BrickWall className="w-3.5 h-3.5 text-cyan-400" />,
  },
  furniture: {
    label: 'Móveis / Objetos',
    icon: <Box className="w-3.5 h-3.5 text-amber-400" />,
  },
  lighting: {
    label: 'Iluminação',
    icon: <Lightbulb className="w-3.5 h-3.5 text-yellow-300" />,
  },
};

export const HierarchyPanel: React.FC = () => {
  const entities = useSceneStore((s) => s.entities);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectEntity = useSceneStore((s) => s.selectEntity);
  const updateEntityProps = useSceneStore((s) => s.updateEntityProps);
  const deleteEntity = useSceneStore((s) => s.deleteEntity);
  const duplicateEntity = useSceneStore((s) => s.duplicateEntity);

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<EntityCategory, boolean>>({
    structure: false,
    furniture: false,
    lighting: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entities.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.kind.toLowerCase().includes(q) ||
            e.tags.some((t) => t.toLowerCase().includes(q))
        )
      : entities;

    const groups: Record<EntityCategory, SceneEntityData[]> = {
      structure: [],
      furniture: [],
      lighting: [],
    };
    for (const item of filtered) {
      groups[item.category]?.push(item);
    }
    return groups;
  }, [entities, query]);

  const commitRename = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      updateEntityProps(id, { name: trimmed });
    }
    setEditingId(null);
  };

  return (
    <aside className="w-64 bg-[#161922] border-r border-[#2a3040] flex flex-col shrink-0 h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-[#2a3040] flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          Hierarquia
        </span>
        <span className="text-[11px] text-gray-500 font-mono">{entities.length}</span>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-[#2a3040]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar entidades..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a3040] rounded pl-8 pr-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {(['structure', 'furniture', 'lighting'] as EntityCategory[]).map((cat) => {
          const items = grouped[cat];
          const isCollapsed = collapsed[cat];
          return (
            <div key={cat}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                className="w-full flex items-center justify-between px-1.5 py-1 rounded hover:bg-[#1d212d] text-xs font-medium text-gray-300"
              >
                <span className="flex items-center gap-1.5">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  {CATEGORY_META[cat].icon}
                  {CATEGORY_META[cat].label}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">{items.length}</span>
              </button>

              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {items.length === 0 && (
                    <div className="text-[11px] text-gray-600 italic px-3 py-1">Vazio</div>
                  )}
                  {items.map((item) => {
                    const isSelected = item.id === selectedId;
                    const isEditing = editingId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => selectEntity(item.id)}
                        onDoubleClick={() => {
                          setEditingId(item.id);
                          setEditingName(item.name);
                        }}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-600/25 text-white border border-blue-500/50'
                            : 'text-gray-300 hover:bg-[#1d212d] border border-transparent'
                        } ${!item.visible ? 'opacity-50' : ''}`}
                      >
                        <div className="flex-1 min-w-0 pr-1">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => commitRename(item.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(item.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-[#0f1117] border border-blue-500 rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                            />
                          ) : (
                            <span className="block truncate" title={`${item.name} (duplo clique para renomear)`}>
                              {item.name}
                            </span>
                          )}
                        </div>

                        <div
                          className="flex items-center gap-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() =>
                              updateEntityProps(item.id, { visible: !item.visible })
                            }
                            title={item.visible ? 'Ocultar' : 'Exibir'}
                            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
                          >
                            {item.visible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-gray-600" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              updateEntityProps(item.id, { locked: !item.locked })
                            }
                            title={item.locked ? 'Desbloquear seleção' : 'Bloquear seleção'}
                            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white"
                          >
                            {item.locked ? (
                              <Lock className="w-3 h-3 text-amber-400" />
                            ) : (
                              <Unlock className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                            )}
                          </button>
                          <button
                            onClick={() => duplicateEntity(item.id)}
                            title="Duplicar (Ctrl+D)"
                            className="p-1 rounded hover:bg-[#2a3040] text-gray-400 hover:text-white hidden group-hover:inline-flex"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteEntity(item.id)}
                            disabled={item.locked}
                            title="Excluir (Del)"
                            className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 hidden group-hover:inline-flex disabled:opacity-30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
