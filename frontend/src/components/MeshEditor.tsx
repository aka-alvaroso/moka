import { useRef, useState, useEffect, useCallback } from 'react';
import type { MeshBlob, MeshConfig } from '@mockup-forge/shared';
import { useTheme } from '../context/ThemeContext';
import { meshToCss } from '../render/mesh';

// Re-exported for existing importers (LeftPanel, …); canonical home is render/mesh.
export { meshToCss };

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
  const { colors } = useTheme();
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

      {/* Preset swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MESH_PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => { onChange(deepClonePreset(p.config)); setSelectedId(null); }}
            title={p.name}
            style={{
              width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: meshToCss(p.config),
              boxShadow: `0 0 0 1px ${colors.presetRing}`,
              transition: 'box-shadow 0.12s',
            }}
          />
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
          <span className="block w-7 h-7 rounded-lg" style={{ background: value.base, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 1px ${colors.presetRing}` }} />
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
      {selectedBlob && <BlobControls blob={selectedBlob} onDelete={() => deleteBlob(selectedBlob.id)} onUpdate={(p) => updateBlob(selectedBlob.id, p)} />}
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

function BlobControls({ blob, onDelete, onUpdate }: {
  blob: MeshBlob;
  onDelete: () => void;
  onUpdate: (patch: Partial<MeshBlob>) => void;
}) {
  const { colors } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px', background: colors.bgInput, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.sectionLabel }}>Blob</span>
        <button onClick={onDelete}
          style={{ fontSize: 10, color: colors.accent, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 5 }}>
          Delete
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: colors.bgRow, borderRadius: 11 }}>
        <span style={{ fontSize: 12, color: colors.fgDim, fontWeight: 500 }}>Color</span>
        <label style={{ position: 'relative', cursor: 'pointer' }}>
          <span style={{ display: 'block', width: 28, height: 28, borderRadius: 8, background: blob.color, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 1px ${colors.presetRing}` }} />
          <input type="color" value={blob.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
        </label>
      </div>

      <BlobSlider label="Size"    value={blob.size}    min={15}  max={150} unit="%" onChange={(v) => onUpdate({ size: v })} />
      <BlobSlider label="Opacity" value={Math.round(blob.opacity * 100)} min={5} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v / 100 })} />
    </div>
  );
}

function BlobSlider({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const DOT_COUNT = 5;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 11, overflow: 'hidden', position: 'relative', height: 40, background: colors.bgRow }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 10, background: colors.bgInput, flexShrink: 0, minWidth: 72 }}>
        <span style={{ fontSize: 12, color: colors.fgDim, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: 10, paddingRight: 12, gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '100%' }}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--dot-color)', flexShrink: 0, pointerEvents: 'none' }} />
          ))}
          <input type="range" min={min} max={max} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="split-slider-track"
          />
        </div>
        {editing ? (
          <input ref={inputRef} type="text" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{ width: 44, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'monospace', color: colors.fg, padding: 0, position: 'relative', zIndex: 1 }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(String(value)); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: 12, fontFamily: 'monospace', color: colors.fg, cursor: 'text', minWidth: 36, textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}
          >{value}{unit}</span>
        )}
      </div>
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
