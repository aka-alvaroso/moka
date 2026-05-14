import { useState, useRef, useEffect } from 'react';
import { renderExport, downloadUrl } from '../lib/api';
import type { EditorState } from '../hooks/useEditor';
import type { ExportFormat, RenderPayload } from '@mockup-forge/shared';

interface Props {
  state: EditorState;
}

type Resolution = '1x' | '2x' | '3x';

export function ExportButton({ state }: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('2x');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const trigger = async (format: ExportFormat) => {
    if (!state.fileId) return;
    setOpen(false);
    setLoading(true);
    try {
      const payload: RenderPayload = {
        fileId: state.fileId,
        background: state.background,
        canvas: state.canvas,
        content: state.content,
        format,
        resolution: format !== 'mp4' ? resolution : '1x',
      };
      const res = await renderExport(payload);
      const a = document.createElement('a');
      a.href = downloadUrl(res.fileId);
      a.download = `moka-export.${format}`;
      a.click();
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed. Check backend logs.');
    } finally {
      setLoading(false);
    }
  };

  const disabled = !state.fileId || loading;

  return (
    <div className="flex items-center gap-2" ref={menuRef}>
      {/* Resolution (images only) */}
      <div className="flex gap-0.5 bg-surface-2 rounded-lg p-0.5">
        {(['1x', '2x', '3x'] as Resolution[]).map((r) => (
          <button
            key={r}
            onClick={() => setResolution(r)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
              ${resolution === r ? 'bg-surface-4 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Export button + dropdown */}
      <div className="relative">
        <div className="flex rounded-lg overflow-hidden">
          {/* Main action — PNG for images, MP4 for videos */}
          <button
            onClick={() => trigger(state.isVideo ? 'mp4' : 'png')}
            disabled={disabled}
            className={`flex items-center gap-1.5 pl-4 pr-2 py-2 text-sm font-semibold transition-all
              ${!disabled ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-surface-3 text-zinc-600 cursor-not-allowed'}`}
          >
            {loading ? <SpinnerIcon /> : <ExportIcon />}
            {loading ? 'Rendering…' : state.isVideo ? 'Export MP4' : 'Export'}
          </button>

          {/* Dropdown arrow */}
          <button
            disabled={disabled}
            onClick={() => !disabled && setOpen((v) => !v)}
            className={`px-2 py-2 border-l transition-all
              ${!disabled ? 'bg-accent hover:bg-accent-hover text-white border-indigo-400/40' : 'bg-surface-3 text-zinc-600 border-zinc-700 cursor-not-allowed'}`}
          >
            <ChevronIcon />
          </button>
        </div>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-44 bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden z-50">
            <MenuItem icon="🖼" label="PNG" sub="Lossless" onClick={() => trigger('png')} />
            <MenuItem icon="📷" label="JPG" sub="Compressed" onClick={() => trigger('jpg')} />
            {state.isVideo && (
              <MenuItem icon="🎬" label="MP4" sub="Video + background" onClick={() => trigger('mp4')} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, sub, onClick }: {
  icon: string; label: string; sub: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-3 transition-colors text-left"
    >
      <span className="text-base">{icon}</span>
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-[11px] text-zinc-500">{sub}</p>
      </div>
    </button>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}
