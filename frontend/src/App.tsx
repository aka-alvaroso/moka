import { useEditor } from './hooks/useEditor';
import { UploadZone } from './components/UploadZone';
import { EditorCanvas } from './components/EditorCanvas';
import { ControlPanel } from './components/ControlPanel';
import { ExportButton } from './components/ExportButton';

export default function App() {
  const { state, setFile, setBackground, setCanvas, setContent } = useEditor();

  return (
    <div className="h-screen flex flex-col bg-surface-0 text-zinc-200 overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Moka</span>
        </div>
        <ExportButton state={state} />
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar */}
        <aside className="w-60 shrink-0 border-r border-border flex flex-col gap-4 p-4 overflow-y-auto">

          {/* Upload */}
          {state.fileId ? (
            <div className="flex flex-col gap-2">
              <FilePreviewChip state={state} />
              <UploadZone
                onUploaded={setFile}
                compact
              />
            </div>
          ) : (
            <UploadZone onUploaded={setFile} />
          )}

          <div className="border-t border-border" />

          <ControlPanel
            background={state.background}
            canvas={state.canvas}
            content={state.content}
            onBackground={setBackground}
            onCanvas={setCanvas}
            onContent={setContent}
          />
        </aside>

        {/* Canvas */}
        <main className="flex-1 min-w-0">
          <EditorCanvas state={state} onContentChange={setContent} />
        </main>

      </div>
    </div>
  );
}

function FilePreviewChip({ state }: { state: ReturnType<typeof useEditor>['state'] }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 bg-surface-2 rounded-lg border border-border">
      <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-surface-3">
        {state.previewUrl && (
          state.isVideo
            ? <video src={state.previewUrl} className="w-full h-full object-cover" muted />
            : <img src={state.previewUrl} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-300 truncate">
          {state.isVideo ? '🎬 Video' : '🖼 Image'}
        </p>
        <p className="text-[10px] text-zinc-600">{state.srcW} × {state.srcH}px</p>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </div>
  );
}
