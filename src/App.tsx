import React, { useEffect } from 'react';
import { GitPanelModal } from './components/editor/GitPanelModal';
import { HierarchyPanel } from './components/editor/HierarchyPanel';
import { InspectorPanel } from './components/editor/InspectorPanel';
import { PlayCanvasViewport } from './components/editor/PlayCanvasViewport';
import { SketchfabModal } from './components/editor/SketchfabModal';
import { StatusBar } from './components/editor/StatusBar';
import { TopToolbar } from './components/editor/TopToolbar';
import { useSceneStore } from './store/sceneStore';

export function App() {
  const toastMessage = useSceneStore((s) => s.toastMessage);
  const isInspectorVisible = useSceneStore((s) => s.isInspectorVisible);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput) return;

      const state = useSceneStore.getState();

      // Undo / Redo (Ctrl+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        state.redo();
        return;
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyD' || e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        if (state.selectedId) {
          state.duplicateEntity(state.selectedId);
        }
        return;
      }

      // Group (Ctrl+G) / Ungroup (Ctrl+Shift+G)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyG' || e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        if (e.shiftKey) {
          void state.ungroupSelectedEntities();
        } else {
          state.groupSelectedEntities();
        }
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedId) {
          e.preventDefault();
          state.deleteEntity(state.selectedId);
        }
        return;
      }

      // Skip W/E/R in FPS mode because WASD moves the camera
      if (state.cameraMode !== 'fps' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'KeyW' || e.key.toLowerCase() === 'w') {
          e.preventDefault();
          state.setToolMode('select');
          state.setGizmoMode('translate');
        } else if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
          e.preventDefault();
          state.setToolMode('select');
          state.setGizmoMode('rotate');
        } else if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
          e.preventDefault();
          state.setToolMode('select');
          state.setGizmoMode('scale');
        } else if (e.code === 'KeyF' || e.key.toLowerCase() === 'f') {
          e.preventDefault();
          state.triggerFocusSelected();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0f1117] text-gray-100 overflow-hidden">
      <TopToolbar />

      <main className="flex-1 flex min-h-0 overflow-hidden">
        <HierarchyPanel />
        <PlayCanvasViewport />
        {isInspectorVisible && <InspectorPanel />}
      </main>

      <StatusBar />

      {/* Modals */}
      <SketchfabModal />
      <GitPanelModal />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1d212d] border border-blue-500/50 text-gray-100 text-xs px-4 py-2 rounded-lg shadow-2xl z-50 pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
