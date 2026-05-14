import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { Background, CanvasConfig, CanvasRatio, ContentOptions } from '@mockup-forge/shared';
import { uploadFile } from '../lib/api';
import { MeshEditor, meshToCss } from './MeshEditor';

interface Props {
  background: Background;
  canvas: CanvasConfig;
  content: ContentOptions;
  onBackground: (b: Background) => void;
  onCanvas: (c: CanvasConfig) => void;
  onContent: (p: Partial<ContentOptions>) => void;
}

const RATIOS: { value: CanvasRatio; label: string }[] = [
  { value: '1:1',  label: '1:1'  },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5',  label: '4:5'  },
];


export function ControlPanel({ background, canvas, content, onBackground, onCanvas, onContent }: Props) {
  const bgType = background.type;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Background ── */}
      <Section title="Background">
        {/* Type selector — with inline previews */}
        <div className="grid grid-cols-2 gap-1 mb-3">
          <BgTypeBtn
            active={bgType === 'solid'}
            onClick={() => onBackground({ ...background, type: 'solid', color: background.color || '#1a1a2e' })}
            preview={<div className="w-4 h-4 rounded-sm" style={{ background: background.color || '#1a1a2e' }} />}
            label="Solid"
          />
          <BgTypeBtn
            active={bgType === 'gradient'}
            onClick={() => onBackground({ ...background, type: 'gradient', gradient: background.gradient || { from: '#1a1a2e', to: '#16213e', direction: 135 } })}
            preview={
              <div className="w-4 h-4 rounded-sm" style={{
                background: background.gradient
                  ? `linear-gradient(${background.gradient.direction}deg,${background.gradient.from},${background.gradient.to})`
                  : 'linear-gradient(135deg,#1a1a2e,#16213e)',
              }} />
            }
            label="Gradient"
          />
          <BgTypeBtn
            active={bgType === 'mesh'}
            onClick={() => onBackground({ ...background, type: 'mesh' })}
            preview={
              <div className="w-4 h-4 rounded-sm" style={{
                background: background.mesh
                  ? meshToCss(background.mesh)
                  : 'linear-gradient(135deg,#6366f1,#ec4899)',
              }} />
            }
            label="Mesh"
          />
          <BgTypeBtn
            active={bgType === 'image'}
            onClick={() => onBackground({ ...background, type: 'image' })}
            preview={
              background.imageFileId
                ? <img src={`/api/download/${background.imageFileId}`} className="w-4 h-4 rounded-sm object-cover" />
                : <div className="w-4 h-4 rounded-sm border border-dashed border-zinc-600 flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
            }
            label="Image"
          />
        </div>

        {/* Type-specific controls */}
        {bgType === 'solid' && (
          <div className="flex items-center gap-2.5">
            <ColorSwatch
              value={background.color || '#1a1a2e'}
              onChange={(v) => onBackground({ type: 'solid', color: v })}
            />
            <span className="text-xs font-mono text-zinc-500 select-all">{background.color || '#1a1a2e'}</span>
          </div>
        )}

        {bgType === 'gradient' && (
          <div className="flex flex-col gap-2.5">
            {/* Gradient preview bar */}
            <div
              className="w-full h-6 rounded-lg"
              style={{
                background: `linear-gradient(${background.gradient?.direction ?? 135}deg, ${background.gradient?.from ?? '#1a1a2e'}, ${background.gradient?.to ?? '#16213e'})`,
              }}
            />
            <div className="flex items-center gap-2">
              <ColorSwatch
                value={background.gradient?.from || '#1a1a2e'}
                onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, from: v } })}
              />
              <div className="flex-1 h-px bg-border" />
              <ColorSwatch
                value={background.gradient?.to || '#16213e'}
                onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, to: v } })}
              />
            </div>
            <Slider
              label="Angle" value={background.gradient?.direction ?? 135}
              min={0} max={360} unit="°"
              onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, direction: v } })}
            />
          </div>
        )}

        {bgType === 'mesh' && (
          <MeshEditor
            value={background.mesh ?? {
              base: '#0f0c29',
              blobs: [
                { id: 'a', x: 20, y: 30, color: '#6366f1', size: 90, opacity: 0.85 },
                { id: 'b', x: 78, y: 65, color: '#ec4899', size: 75, opacity: 0.75 },
              ],
            }}
            onChange={(mesh) => onBackground({ type: 'mesh', mesh })}
          />
        )}

        {bgType === 'image' && (
          <BgImageDropZone
            currentFileId={background.imageFileId}
            onUploaded={(fileId) => onBackground({ type: 'image', imageFileId: fileId })}
          />
        )}
      </Section>

      {/* ── Canvas ── */}
      <Section title="Canvas">
        <div className="grid grid-cols-4 gap-1">
          {RATIOS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onCanvas({ ratio: value })}
              className={`py-1.5 rounded-lg text-xs font-medium transition-colors
                ${canvas.ratio === value
                  ? 'bg-accent text-white'
                  : 'bg-surface-3 text-zinc-400 hover:bg-surface-4 hover:text-zinc-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Content ── */}
      <Section title="Content">
        <div className="flex flex-col gap-3">
          <Slider label="Scale"  value={Math.round(content.scale * 100)} min={5} max={400} unit="%" onChange={(v) => onContent({ scale: v / 100 })} />
          <Slider label="Radius" value={content.borderRadius} min={0} max={200} unit="px" onChange={(v) => onContent({ borderRadius: v })} />
          <Slider label="Shadow" value={Math.round(content.shadow * 100)} min={0} max={100} unit="%" onChange={(v) => onContent({ shadow: v / 100 })} />
          <Slider label="Rotate" value={content.rotation} min={-180} max={180} unit="°" onChange={(v) => onContent({ rotation: v })} />
        </div>
        <p className="text-[10px] text-zinc-600 mt-2.5">
          Drag handles on canvas to edit visually
        </p>
      </Section>
    </div>
  );
}

// ── Background image drop zone ────────────────────────────────────────────────

function BgImageDropZone({
  currentFileId,
  onUploaded,
}: {
  currentFileId?: string;
  onUploaded: (fileId: string) => void;
}) {
  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    try {
      const res = await uploadFile(file);
      onUploaded(res.fileId);
    } catch (err) {
      console.error('BG image upload failed', err);
    }
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed cursor-pointer transition-colors overflow-hidden
        ${isDragActive ? 'border-accent bg-accent/10' : 'border-border hover:border-zinc-600'}`}
    >
      <input {...getInputProps()} />

      {/* Current bg thumbnail */}
      {currentFileId ? (
        <img
          src={`/api/download/${currentFileId}`}
          className="w-10 h-10 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>
      )}

      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-300 truncate">
          {isDragActive ? 'Drop to set as background' : currentFileId ? 'Background image' : 'Drop background image'}
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5">PNG · JPG · WebP</p>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">{title}</p>
      {children}
    </div>
  );
}

function BgTypeBtn({
  active, onClick, preview, label,
}: {
  active: boolean;
  onClick: () => void;
  preview: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors
        ${active
          ? 'bg-accent text-white'
          : 'bg-surface-3 text-zinc-400 hover:bg-surface-4 hover:text-zinc-200'}`}
    >
      <span className="shrink-0">{preview}</span>
      {label}
    </button>
  );
}

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative cursor-pointer shrink-0">
      <span className="block w-8 h-8 rounded-lg border border-white/10" style={{ background: value }} />
      <input
        type="color" value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
      />
    </label>
  );
}

function Slider({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="text-xs font-mono text-zinc-500">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer appearance-none accent-indigo-500"
        style={{ background: `linear-gradient(to right,#6366f1 ${pct}%,#2c2c31 0%)` }}
      />
    </div>
  );
}
