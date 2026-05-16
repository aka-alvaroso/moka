import { useState } from 'react';
import { useEditor } from './hooks/useEditor';
import { EditorCanvas } from './components/EditorCanvas';
import { LeftPanel } from './components/LeftPanel';
import { ExportDrawer } from './components/ExportDrawer';

export default function App() {
  const { state, setFile, setBackground, setCanvas, setContent } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden select-none" style={{ display: 'flex', background: '#161616' }}>
      {/* Wordmark */}
      <span style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, fontSize: 18, color: '#3a3a3a', fontFamily: 'FreshChunky, sans-serif', letterSpacing: '0.01em', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        moka
      </span>

      <LeftPanel
        state={state}
        onUploaded={setFile}
        onBackground={setBackground}
        onCanvas={setCanvas}
        onContent={setContent}
        onExport={() => setExportOpen(true)}
      />

      {/* Preview area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <EditorCanvas state={state} onContentChange={setContent} onUploaded={setFile} />
      </div>

      <ExportDrawer state={state} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
