import { useRef, useState, useEffect, useCallback } from 'react';
import type { MeshBlob, MeshConfig } from '@mockup-forge/shared';

// ── Presets ───────────────────────────────────────────────────────────────────

export const MESH_PRESETS: { name: string; config: MeshConfig }[] = [
  {
    name: 'Cosmos',
    config: {
      base: '#0f0c29',
      blobs: [
        { id: '1', x: 20, y: 30, color: '#6366f1', size: 90, opacity: 0.85 },
        { id: '2', x: 78, y: 65, color: '#a855f7', size: 75, opacity: 0.75 },
        { id: '3', x: 50, y: 85, color: '#3b82f6', size: 60, opacity: 0.60 },
      ],
    },
  },
  {
    name: 'Neon',
    config: {
      base: '#0a0a0f',
      blobs: [
        { id: '1', x: 15, y: 75, color: '#fc466b', size: 85, opacity: 0.90 },
        { id: '2', x: 85, y: 20, color: '#3f5efb', size: 80, opacity: 0.85 },
        { id: '3', x: 50, y: 50, color: '#7c3aed', size: 55, opacity: 0.50 },
      ],
    },
  },
  {
    name: 'Emerald',
    config: {
      base: '#0d1f1a',
      blobs: [
        { id: '1', x: 25, y: 65, color: '#10b981', size: 90, opacity: 0.85 },
        { id: '2', x: 75, y: 30, color: '#34d399', size: 70, opacity: 0.75 },
        { id: '3', x: 55, y: 80, color: '#059669', size: 55, opacity: 0.55 },
      ],
    },
  },
  {
    name: 'Sunset',
    config: {
      base: '#1a0a00',
      blobs: [
        { id: '1', x: 20, y: 20, color: '#f59e0b', size: 85, opacity: 0.85 },
        { id: '2', x: 75, y: 70, color: '#ef4444', size: 80, opacity: 0.80 },
        { id: '3', x: 50, y: 50, color: '#f97316', size: 60, opacity: 0.60 },
      ],
    },
  },
  {
    name: 'Ocean',
    config: {
      base: '#020b18',
      blobs: [
        { id: '1', x: 30, y: 25, color: '#0ea5e9', size: 85, opacity: 0.80 },
        { id: '2', x: 70, y: 70, color: '#06b6d4', size: 75, opacity: 0.75 },
        { id: '3', x: 15, y: 75, color: '#3b82f6', size: 65, opacity: 0.55 },
      ],
    },
  },
  {
    name: 'Mint',
    config: {
      base: '#021a14',
      blobs: [
        { id: '1', x: 35, y: 60, color: '#00b09b', size: 90, opacity: 0.85 },
        { id: '2', x: 65, y: 35, color: '#96c93d', size: 70, opacity: 0.80 },
        { id: '3', x: 80, y: 80, color: '#22d3ee', size: 55, opacity: 0.50 },
      ],
    },
  },
];

// ── CSS helper ────────────────────────────────────────────────────────────────

export function meshToCss(mesh: MeshConfig): string {
  const layers = mesh.blobs.map((b) => {
    const r = parseInt(b.color.slice(1, 3), 16);
    const g = parseInt(b.color.slice(3, 5), 16);
    const bv = parseInt(b.color.slice(5, 7), 16);
    return `radial-gradient(circle at ${b.x}% ${b.y}%, rgba(${r},${g},${bv},${b.opacity}) 0%, transparent ${b.size}%)`;
  });
  return [...layers, mesh.base].join(', ');
}

// ── Unique id ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  value: MeshConfig;
  onChange: (v: MeshConfig) => void;
}

export function MeshEditor({ value, onChange }: Props) {
  const editorRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<{ id: string; startMx: number; startMy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedBlob = value.blobs.find((b) => b.id === selectedId) ?? null;

  // ── Update helpers ──────────────────────────────────────────────────────────

  const updateBlob = useCallback((id: string, patch: Partial<MeshBlob>) => {
    onChange({
      ...value,
      blobs: value.blobs.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  }, [value, onChange]);

  const deleteBlob = useCallback((id: string) => {
    setSelectedId(null);
    onChange({ ...value, blobs: value.blobs.filter((b) => b.id !== id) });
  }, [value, onChange]);

  const addBlob = useCallback(() => {
    const newBlob: MeshBlob = {
      id: uid(),
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
      color: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`,
      size: 60 + Math.random() * 40,
      opacity: 0.7 + Math.random() * 0.25,
    };
    const updated = { ...value, blobs: [...value.blobs, newBlob] };
    onChange(updated);
    setSelectedId(newBlob.id);
  }, [value, onChange]);

  // ── Drag ────────────────────────────────────────────────────────────────────

  const onBlobMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const blob = value.blobs.find((b) => b.id === id)!;
    dragRef.current = { id, startMx: e.clientX, startMy: e.clientY, startX: blob.x, startY: blob.y, moved: false };
  }, [value.blobs]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !editorRef.current) return;
      const rect = editorRef.current.getBoundingClientRect();
      const dx = ((e.clientX - d.startMx) / rect.width)  * 100;
      const dy = ((e.clientY - d.startMy) / rect.height) * 100;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) d.moved = true;
      updateBlob(d.id, {
        x: Math.min(100, Math.max(0, d.startX + dx)),
        y: Math.min(100, Math.max(0, d.startY + dy)),
      });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d) {
        if (!d.moved) setSelectedId((prev) => (prev === d.id ? null : d.id));
        dragRef.current = null;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [updateBlob]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* Preset row */}
      <div className="flex gap-1.5 flex-wrap">
        {MESH_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => { onChange(deepClonePreset(p.config)); setSelectedId(null); }}
            className="h-6 px-2 rounded text-[10px] font-semibold text-white/80 hover:scale-105 transition-transform"
            style={{ background: meshToCss(p.config) }}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Mini canvas */}
      <div
        ref={editorRef}
        className="relative rounded-xl overflow-hidden cursor-crosshair"
        style={{ height: 140, background: meshToCss(value) }}
        onMouseDown={() => setSelectedId(null)}
      >
        {value.blobs.map((blob) => (
          <BlobHandle
            key={blob.id}
            blob={blob}
            selected={blob.id === selectedId}
            onMouseDown={(e) => onBlobMouseDown(e, blob.id)}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {/* Base color */}
        <label className="relative cursor-pointer shrink-0" title="Base color">
          <span className="block w-7 h-7 rounded-lg border-2 border-white/10" style={{ background: value.base }} />
          <input type="color" value={value.base}
            onChange={(e) => onChange({ ...value, base: e.target.value })}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
        <span className="text-[10px] text-zinc-600 flex-1">base</span>

        <button
          onClick={addBlob}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-4 text-zinc-300 text-xs transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>

        <button
          onClick={() => { onChange(randomizeMesh(value)); setSelectedId(null); }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-4 text-zinc-300 text-xs transition-colors"
          title="Randomize blob positions"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
          Shuffle
        </button>
      </div>

      {/* Selected blob controls */}
      {selectedBlob && (
        <div className="flex flex-col gap-2.5 p-2.5 bg-surface-2 rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Blob</span>
            <button
              onClick={() => deleteBlob(selectedBlob.id)}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors px-1.5 py-0.5 rounded hover:bg-red-500/10"
            >
              Delete
            </button>
          </div>

          {/* Color */}
          <div className="flex items-center gap-2">
            <label className="relative cursor-pointer shrink-0">
              <span className="block w-8 h-8 rounded-lg border border-white/10" style={{ background: selectedBlob.color }} />
              <input type="color" value={selectedBlob.color}
                onChange={(e) => updateBlob(selectedBlob.id, { color: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </label>
            <span className="text-xs font-mono text-zinc-500 select-all">{selectedBlob.color}</span>
          </div>

          <BlobSlider label="Size"    value={selectedBlob.size}    min={15}  max={150} unit="%" onChange={(v) => updateBlob(selectedBlob.id, { size: v })} />
          <BlobSlider label="Opacity" value={Math.round(selectedBlob.opacity * 100)} min={5} max={100} unit="%" onChange={(v) => updateBlob(selectedBlob.id, { opacity: v / 100 })} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BlobHandle({ blob, selected, onMouseDown }: {
  blob: MeshBlob;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: `${blob.x}%`,
        top:  `${blob.y}%`,
        transform: 'translate(-50%,-50%)',
        width:  selected ? 16 : 12,
        height: selected ? 16 : 12,
        borderRadius: '50%',
        background: blob.color,
        border: selected ? '2.5px solid white' : '2px solid rgba(255,255,255,0.5)',
        boxShadow: selected
          ? `0 0 0 2px #6366f1, 0 2px 8px rgba(0,0,0,0.5)`
          : '0 1px 4px rgba(0,0,0,0.4)',
        cursor: 'grab',
        transition: 'width 0.1s, height 0.1s',
        zIndex: selected ? 10 : 1,
      }}
    />
  );
}

function BlobSlider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
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

// ── Utils ─────────────────────────────────────────────────────────────────────

function deepClonePreset(config: MeshConfig): MeshConfig {
  return {
    base: config.base,
    blobs: config.blobs.map((b) => ({ ...b, id: uid() })),
  };
}

function randomizeMesh(config: MeshConfig): MeshConfig {
  return {
    ...config,
    blobs: config.blobs.map((b) => ({
      ...b,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
    })),
  };
}
