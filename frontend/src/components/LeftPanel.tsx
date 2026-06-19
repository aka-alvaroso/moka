import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import type {
  Background, CanvasConfig, CanvasRatio, MediaItem,
} from '@mockup-forge/shared';
import type { EditorState } from '../hooks/useEditor';
import { MeshEditor, meshToCss, MESH_PRESETS } from './MeshEditor';
import { uploadFile, fetchMediaInfo } from '../lib/api';
import { useTheme } from '../context/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  state: EditorState;
  onItemAdded: (fileId: string, previewUrl: string, isVideo: boolean, w: number, h: number) => void;
  onItemRemoved: (id: string) => void;
  onItemSelected: (id: string) => void;
  onItemReorder: (id: string, toIndex: number) => void;
  onBackground: (b: Background) => void;
  onCanvas: (c: CanvasConfig) => void;
  onExport: () => void;
}

export function LeftPanel({ state, onItemAdded, onItemRemoved, onItemSelected, onItemReorder, onBackground, onCanvas, onExport }: Props) {
  const { colors, mode } = useTheme();
  const hasItems = state.mediaItems.length > 0;

  return (
    <div style={{
      margin: '24px 0 24px 24px',
      padding: '16px 12px',
      width: 264,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: colors.bgPanel,
      borderRadius: 24,
      color: colors.fg,
      overflow: 'hidden',
      transition: 'background 0.2s',
    }}>
      <style>{`
        .panel-scroll::-webkit-scrollbar { width: 3px; }
        .panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 99px; }
        .panel-scroll::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
        input[type=range].split-slider-track {
          -webkit-appearance: none !important; appearance: none !important;
          width: 100%; height: 100%; background: transparent !important;
          cursor: ew-resize; position: absolute; inset: 0; margin: 0; padding: 0;
        }
        input[type=range].split-slider-track::-webkit-slider-runnable-track { background: transparent !important; height: 2px; }
        input[type=range].split-slider-track::-webkit-slider-thumb {
          -webkit-appearance: none !important; width: 3px !important; height: 22px !important;
          border-radius: 99px !important; background: var(--slider-thumb) !important; cursor: ew-resize; margin-top: -10px;
        }
        input[type=range].split-slider-track::-moz-range-track { background: transparent !important; height: 2px; }
        input[type=range].split-slider-track::-moz-range-thumb {
          width: 3px !important; height: 22px !important; border-radius: 99px !important; border: none !important;
          background: var(--slider-thumb) !important; cursor: ew-resize;
        }
      `}</style>
      <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>
        <MediaSection
          items={state.mediaItems}
          selectedId={state.selectedItemId}
          onAdded={onItemAdded}
          onRemoved={onItemRemoved}
          onSelected={onItemSelected}
          onReorder={onItemReorder}
        />
        <SectionDivider />
        <BackgroundSection background={state.background} onBackground={onBackground} />
        <SectionDivider />
        <AspectRatioSection canvas={state.canvas} onCanvas={onCanvas} />
      </div>

      <div style={{ paddingTop: 14, marginTop: 4, borderTop: `1px solid ${colors.divider}` }}>
        <ExportButton hasItems={hasItems} onExport={onExport} />
      </div>
    </div>
  );
}

function SectionDivider() {
  const { colors } = useTheme();
  return <div style={{ height: 1, background: colors.divider, margin: '0 -4px' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: colors.sectionLabel, margin: '0 0 8px' }}>{children}</p>
  );
}

// ── Media list ────────────────────────────────────────────────────────────────

interface MediaProps {
  items: MediaItem[];
  selectedId: string | null;
  onAdded: (fileId: string, previewUrl: string, isVideo: boolean, w: number, h: number) => void;
  onRemoved: (id: string) => void;
  onSelected: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
}

async function processFile(file: File): Promise<{ fileId: string; previewUrl: string; isVideo: boolean; w: number; h: number }> {
  const isMkv = file.name.toLowerCase().endsWith('.mkv');
  const res = await uploadFile(file);
  let w = 0, h = 0;

  if (isMkv) {
    const info = await fetchMediaInfo(res.fileId);
    w = info.width; h = info.height;
  } else {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const url = URL.createObjectURL(file);
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video');
        v.onloadedmetadata = () => { resolve({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
        v.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
        v.src = url;
      } else {
        const img = new Image();
        img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
        img.src = url;
      }
    });
    w = dims.w; h = dims.h;
  }

  const previewUrl = isMkv ? `/api/download/${res.fileId}` : URL.createObjectURL(file);
  return { fileId: res.fileId, previewUrl, isVideo: res.isVideo, w, h };
}

function MediaSection({ items, selectedId, onAdded, onRemoved, onSelected, onReorder }: MediaProps) {
  const { colors } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [insertBefore, setInsertBefore] = useState<number | null>(null);
  const sorted = [...items].sort((a, b) => b.zIndex - a.zIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStateRef = useRef({ dragId, insertBefore, sorted });
  dragStateRef.current = { dragId, insertBefore, sorted };

  const getInsertIndex = useCallback((clientY: number): number => {
    const { sorted } = dragStateRef.current;
    for (let i = 0; i < sorted.length; i++) {
      const el = rowRefs.current.get(sorted[i].id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return sorted.length;
  }, []);

  const commitDrop = useCallback(() => {
    const { dragId, insertBefore, sorted } = dragStateRef.current;
    if (dragId !== null && insertBefore !== null) {
      const fromIndex = sorted.findIndex((i) => i.id === dragId);
      // no-op if dropping on same position
      if (fromIndex !== insertBefore && fromIndex + 1 !== insertBefore) {
        const corrected = insertBefore - (fromIndex < insertBefore ? 1 : 0);
        onReorder(dragId, sorted.length - 1 - corrected);
      }
    }
    setDragId(null);
    setInsertBefore(null);
  }, [onReorder]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const result = await processFile(file);
      onAdded(result.fileId, result.previewUrl, result.isVideo, result.w, result.h);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onAdded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) handleFile(files[0]); },
    accept: { 'image/*': [], 'video/*': ['.mkv'] },
    noClick: true,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel>Layers</SectionLabel>

      {sorted.length > 0 && (
        <div
          ref={containerRef}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          onPointerMove={(e) => {
            if (!dragStateRef.current.dragId) return;
            setInsertBefore(getInsertIndex(e.clientY));
          }}
          onPointerUp={commitDrop}
          onPointerCancel={commitDrop}
        >
          {sorted.map((item, idx) => (
            <motion.div
              key={item.id}
              layout
              transition={{ duration: dragId ? 0 : 0.18, ease: 'easeInOut' }}
              ref={(el) => { if (el) rowRefs.current.set(item.id, el); else rowRefs.current.delete(item.id); }}
            >
              <AnimatePresence initial={false}>
                {dragId && insertBefore === idx && <DropIndicator key="indicator" />}
              </AnimatePresence>
              <MediaItemRow
                item={item}
                selected={item.id === selectedId}
                isDragging={dragId === item.id}
                onSelect={() => onSelected(item.id)}
                onRemove={() => onRemoved(item.id)}
                onDragStart={(e) => {
                  containerRef.current?.setPointerCapture(e.pointerId);
                  setDragId(item.id);
                  setInsertBefore(idx);
                }}
              />
            </motion.div>
          ))}
          <AnimatePresence initial={false}>
            {dragId && insertBefore === sorted.length && <DropIndicator key="indicator-end" />}
          </AnimatePresence>
        </div>
      )}

      {/* Drop area — border kept intentionally */}
      <div
        {...getRootProps()}
        onClick={() => inputRef.current?.click()}
        style={{
          position: 'relative', borderRadius: 12, overflow: 'hidden',
          height: 56, background: colors.bgRow, cursor: 'pointer',
          border: isDragActive ? `1.5px dashed ${colors.accent}` : `1.5px dashed ${colors.dropBorder}`,
          transition: 'border-color 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <input {...getInputProps()} />
        <input ref={inputRef} type="file" accept="image/*,video/*,.mkv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        <UploadIcon color={colors.fgMuted} />
        <span style={{ fontSize: 11, color: loading ? colors.accent : colors.fgDim, fontWeight: 500 }}>
          {loading ? 'Uploading…' : isDragActive ? 'Drop to add' : 'Add media'}
        </span>
      </div>
    </div>
  );
}

function DropIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.7 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0.7 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 0', pointerEvents: 'none', originX: 0 }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#e94f37', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 2, borderRadius: 99, background: '#e94f37' }} />
    </motion.div>
  );
}

function MediaItemRow({ item, selected, isDragging, onSelect, onRemove, onDragStart }: {
  item: MediaItem; selected: boolean; isDragging: boolean;
  onSelect: () => void; onRemove: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        // Don't initiate drag from the delete button
        if ((e.target as HTMLElement).closest('button')) return;
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
        didDrag.current = false;
      }}
      onPointerMove={(e) => {
        if (!pointerDownPos.current || didDrag.current) return;
        const dx = Math.abs(e.clientX - pointerDownPos.current.x);
        const dy = Math.abs(e.clientY - pointerDownPos.current.y);
        if (dx > 4 || dy > 4) {
          didDrag.current = true;
          pointerDownPos.current = null;
          onDragStart(e);
        }
      }}
      onPointerUp={() => { pointerDownPos.current = null; }}
      onClick={() => { if (!didDrag.current) onSelect(); didDrag.current = false; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        borderRadius: 10, cursor: isDragging ? 'grabbing' : 'grab',
        background: selected ? colors.bgSelected : hovered ? colors.bgRowHover : colors.bgRow,
        opacity: isDragging ? 0.35 : 1,
        transition: 'background 0.1s, opacity 0.15s',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: colors.thumbnailBg }}>
        {item.isVideo
          ? <video src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
          : <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: selected ? colors.accent : colors.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name || (item.isVideo ? 'Video' : 'Image')}
        </div>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: colors.fgMuted, marginTop: 2 }}>
          {item.srcW}×{item.srcH}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: colors.fgMuted, display: 'flex', borderRadius: 5, flexShrink: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = colors.accent)}
        onMouseLeave={(e) => (e.currentTarget.style.color = colors.fgMuted)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

// ── Background ────────────────────────────────────────────────────────────────

const BG_TYPES = ['solid', 'gradient', 'mesh', 'image'] as const;
type BgType = typeof BG_TYPES[number];

const SOLID_PRESETS = [
  // Oscuros puros
  '#0d0d0d', '#0a0014', '#000d1a', '#001a0a', '#1a0000',
  // Saturados medios
  '#3d0080', '#005099', '#007a33', '#99001a', '#804000',
  // Vivos
  '#6600cc', '#0066ff', '#00aa44', '#ff1a1a', '#ff6600',
  // Brillantes
  '#9933ff', '#00aaff', '#00dd55', '#ff3366', '#ffaa00',
  // Claros
  '#f0e8ff', '#ffffff',
];
const GRAD_PRESETS: Array<{ from: string; to: string; direction: number }> = [
  { from: '#0d0221', to: '#5b21b6', direction: 135 },
  { from: '#0f0c29', to: '#302b63', direction: 135 },
  { from: '#0c1a2e', to: '#0e7490', direction: 160 },
  { from: '#141414', to: '#434343', direction: 180 },
  { from: '#e94f37', to: '#1a1a2e', direction: 135 },
  { from: '#fc4a1a', to: '#f7b733', direction: 135 },
  { from: '#0d1117', to: '#1d6fde', direction: 145 },
  { from: '#0a0a0a', to: '#e94f37', direction: 160 },
];

function BackgroundSection({ background, onBackground }: { background: Background; onBackground: (b: Background) => void }) {
  const { colors } = useTheme();
  const type = background.type as BgType;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionLabel>Background</SectionLabel>

      <div style={{ display: 'flex', gap: 3, background: colors.bgRow, borderRadius: 12, padding: 4 }}>
        {BG_TYPES.map((t) => (
          <button key={t} onClick={() => onBackground({ ...background, type: t })}
            style={{ flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', letterSpacing: '0.02em', background: type === t ? colors.accent : 'transparent', color: type === t ? '#fff' : colors.fgDim, transition: 'background 0.15s, color 0.15s', textTransform: 'capitalize' }}
          >{t}</button>
        ))}
      </div>

      {type === 'solid' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', background: colors.bgRow, borderRadius: 12 }}>
          {SOLID_PRESETS.map((c) => (
            <button key={c} onClick={() => onBackground({ type: 'solid', color: c })}
              style={{ width: 26, height: 26, borderRadius: 8, background: c, border: 'none', cursor: 'pointer', boxShadow: background.color === c ? `0 0 0 2px ${colors.accent}` : `0 0 0 1px ${colors.presetRing}`, transition: 'box-shadow 0.12s' }} />
          ))}
          <label style={{ position: 'relative', width: 26, height: 26, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', flexShrink: 0, background: type === 'solid' ? (background.color || '#1a1a2e') : '#2a2a2a', boxShadow: `0 0 0 1px ${colors.presetRing}` }}>
            <input type="color" value={background.color || '#1a1a2e'} onChange={(e) => onBackground({ type: 'solid', color: e.target.value })} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', pointerEvents: 'none', mixBlendMode: 'difference' }}>+</span>
          </label>
        </div>
      )}

      {type === 'gradient' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', background: colors.bgRow, borderRadius: 12 }}>
            {GRAD_PRESETS.map((g, i) => (
              <button key={i} onClick={() => onBackground({ type: 'gradient', gradient: g })}
                style={{ width: 40, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer', background: `linear-gradient(${g.direction}deg,${g.from},${g.to})`, boxShadow: (background.gradient?.from === g.from && background.gradient?.to === g.to) ? `0 0 0 2px ${colors.accent}` : `0 0 0 1px ${colors.presetRing}`, transition: 'box-shadow 0.12s' }} />
            ))}
          </div>
          <Row label="Colors">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ColorSwatch value={background.gradient?.from || '#1a1a2e'} onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, from: v } })} />
              <div style={{ flex: 1, height: 18, borderRadius: 6, background: `linear-gradient(90deg,${background.gradient?.from ?? '#1a1a2e'},${background.gradient?.to ?? '#16213e'})` }} />
              <ColorSwatch value={background.gradient?.to || '#16213e'} onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, to: v } })} />
            </div>
          </Row>
          <Row label="Direction">
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { deg: 180, title: 'Top to bottom', path: 'M12 5v14M8 15l4 4 4-4' },
                { deg: 0,   title: 'Bottom to top', path: 'M12 19V5M8 9l4-4 4 4' },
                { deg: 90,  title: 'Left to right', path: 'M5 12h14M15 8l4 4-4 4' },
                { deg: 270, title: 'Right to left', path: 'M19 12H5M9 8l-4 4 4 4' },
              ] as const).map(({ deg, title, path }) => {
                const active = (background.gradient?.direction ?? 135) === deg;
                return (
                  <button key={deg} title={title}
                    onClick={() => onBackground({ type: 'gradient', gradient: { ...background.gradient!, direction: deg } })}
                    style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? colors.accent : colors.bgInput, transition: 'background 0.12s' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : colors.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={path} />
                    </svg>
                  </button>
                );
              })}
            </div>
          </Row>
          <RowSlider label="Angle" value={background.gradient?.direction ?? 135} min={0} max={360} unit="°"
            onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, direction: v } })} />
        </div>
      )}

      {type === 'mesh' && (
        <MeshEditor value={background.mesh ?? MESH_PRESETS[0].config} onChange={(mesh) => onBackground({ type: 'mesh', mesh })} />
      )}

      {type === 'image' && (
        <BgImageDrop currentFileId={background.imageFileId} onUploaded={(id) => onBackground({ type: 'image', imageFileId: id })} />
      )}
    </div>
  );
}

// ── Aspect ratio ──────────────────────────────────────────────────────────────

interface RatioPreset { value: CanvasRatio; label: string; w: number; h: number }

const BASE_RATIOS: RatioPreset[] = [
  { value: '1:1', label: '1:1', w: 1080, h: 1080 }, { value: '4:5', label: '4:5', w: 1080, h: 1350 },
  { value: '16:9', label: '16:9', w: 1920, h: 1080 }, { value: '9:16', label: '9:16', w: 1080, h: 1920 },
  { value: '4:3', label: '4:3', w: 1440, h: 1080 },
];

const SOCIAL_GROUPS: { id: string; name: string; icon: React.ReactNode; presets: RatioPreset[] }[] = [
  { id: 'instagram', name: 'Instagram', icon: <IgIcon />, presets: [{ value: 'ig-portrait', label: 'Portrait', w: 1080, h: 1350 }, { value: 'ig-story', label: 'Story', w: 1080, h: 1920 }] },
  { id: 'x', name: 'X / Twitter', icon: <XIcon />, presets: [{ value: 'x-post', label: 'Post', w: 1200, h: 675 }, { value: 'x-banner', label: 'Banner', w: 1500, h: 500 }] },
  { id: 'youtube', name: 'YouTube', icon: <YtIcon />, presets: [{ value: 'yt-thumbnail', label: 'Thumbnail', w: 1280, h: 720 }, { value: 'yt-banner', label: 'Banner', w: 2560, h: 1440 }] },
  { id: 'facebook', name: 'Facebook', icon: <FbIcon />, presets: [{ value: 'fb-post', label: 'Post', w: 1200, h: 630 }, { value: 'fb-cover', label: 'Cover', w: 820, h: 312 }] },
  { id: 'linkedin', name: 'LinkedIn', icon: <LiIcon />, presets: [{ value: 'li-post', label: 'Post', w: 1200, h: 627 }, { value: 'li-banner', label: 'Banner', w: 1584, h: 396 }] },
];

const ALL_SOCIAL_PRESETS = SOCIAL_GROUPS.flatMap((g) => g.presets);

function AspectRatioSection({ canvas, onCanvas }: { canvas: CanvasConfig; onCanvas: (c: CanvasConfig) => void }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const isSocial = ALL_SOCIAL_PRESETS.some((p) => p.value === canvas.ratio);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Aspect Ratio</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {BASE_RATIOS.map(({ value, label, w, h }) => (
          <button key={value} onClick={() => onCanvas({ ratio: value, width: w, height: h })} style={chipBtnStyle(canvas.ratio === value, colors)}>{label}</button>
        ))}
      </div>

      <button onClick={() => setExpanded((v) => !v)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderRadius: 11, border: 'none', cursor: 'pointer',
        background: (expanded || isSocial) ? colors.bgSelected : colors.bgRow,
        transition: 'background 0.15s',
      }}>
        <span style={{ fontSize: 12, color: (expanded || isSocial) ? colors.accent : colors.fgDim, fontWeight: 600 }}>Social media</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: colors.fgMuted }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SOCIAL_GROUPS.map(({ id, name, icon, presets }) => (
              <div key={id} style={{ padding: '8px 10px', background: colors.bgRow, borderRadius: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>{icon}<span style={{ fontSize: 11, fontWeight: 600, color: colors.fgDim }}>{name}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {presets.map(({ value, label, w, h }) => {
                    const isActive = canvas.ratio === value;
                    return (
                      <button key={value} onClick={() => onCanvas({ ratio: value, width: w, height: h })}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '7px 9px', borderRadius: 8, cursor: 'pointer', border: 'none', background: isActive ? colors.accent : colors.bgRowHover, transition: 'background 0.12s' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#fff' : colors.fg, lineHeight: 1 }}>{label}</span>
                        <span style={{ fontSize: 9, fontFamily: 'monospace', color: isActive ? 'rgba(255,255,255,0.6)' : colors.fgMuted, marginTop: 3 }}>{w}×{h}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportButton({ hasItems, onExport }: { hasItems: boolean; onExport: () => void }) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onExport} disabled={!hasItems} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 700, border: 'none', letterSpacing: '0.05em', textTransform: 'uppercase', background: !hasItems ? colors.bgRow : colors.accent, color: !hasItems ? colors.fgMuted : '#fff', cursor: !hasItems ? 'not-allowed' : 'pointer', transition: 'box-shadow 0.18s, opacity 0.12s', boxShadow: (hasItems && hovered) ? `0 0 22px 2px ${colors.accent}44` : 'none', opacity: (hasItems && hovered) ? 0.9 : 1 }}>
      Export
    </button>
  );
}

// ── Background image drop zone ────────────────────────────────────────────────

function BgImageDrop({ currentFileId, onUploaded }: { currentFileId?: string; onUploaded: (id: string) => void }) {
  const { colors } = useTheme();
  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try { onUploaded((await uploadFile(file)).fileId); } catch (err) { console.error(err); }
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, maxFiles: 1 });

  return (
    <div {...getRootProps()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px dashed ${isDragActive ? colors.accent : colors.dropBorder}`, background: isDragActive ? colors.bgSelected : colors.bgRow, cursor: 'pointer', transition: 'all 0.15s' }}>
      <input {...getInputProps()} />
      {currentFileId
        ? <img src={`/api/download/${currentFileId}`} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.thumbnailBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UploadIcon color={colors.fgDim} /></div>
      }
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: colors.fg, margin: 0 }}>{isDragActive ? 'Drop to set' : currentFileId ? 'Background set' : 'Drop image'}</p>
        <p style={{ fontSize: 10, color: colors.fgDim, margin: '2px 0 0' }}>PNG · JPG · WebP</p>
      </div>
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: colors.bgRow, borderRadius: 11 }}>
      <span style={{ fontSize: 12, color: colors.fgDim, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function RowSlider({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const DOT_COUNT = 5;

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 11, overflow: 'hidden', position: 'relative', height: 40, background: colors.bgRow }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 10, background: colors.bgInput, flexShrink: 0, minWidth: 72 }}>
        <span style={{ fontSize: 12, color: colors.fgDim, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: 10, paddingRight: 12, gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '100%' }}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--dot-color)', flexShrink: 0, pointerEvents: 'none' }} />
          ))}
          <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="split-slider-track" />
        </div>
        {editing ? (
          <input ref={inputRef} type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft} onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{ width: 44, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'monospace', color: colors.fg, padding: 0, position: 'relative', zIndex: 1 }} />
        ) : (
          <span onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(String(value)); }} onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: 12, fontFamily: 'monospace', color: colors.fg, cursor: 'text', minWidth: 36, textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
            {value}{unit}
          </span>
        )}
      </div>
    </div>
  );
}

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ display: 'block', width: 28, height: 28, borderRadius: 8, background: value, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.15), 0 0 0 1px ${colors.presetRing}` }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
    </label>
  );
}

function chipBtnStyle(active: boolean, colors: ReturnType<typeof useTheme>['colors']): React.CSSProperties {
  return { padding: '7px 4px', borderRadius: 10, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', letterSpacing: '0.02em', background: active ? colors.accent : colors.bgRow, color: active ? '#fff' : colors.fgDim, transition: 'background 0.12s, color 0.12s' };
}

function UploadIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

const ICON_ACCENT = '#e94f37';
function IgIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill={ICON_ACCENT}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>; }
function XIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill={ICON_ACCENT}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.26 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon() { return <svg width="16" height="12" viewBox="0 0 24 17" fill={ICON_ACCENT}><path d="M23.495 2.205a3.02 3.02 0 0 0-2.122-2.136C19.545 0 12 0 12 0S4.455 0 2.627.069a3.02 3.02 0 0 0-2.122 2.136C0 4.04 0 8.507 0 8.507s0 4.466.505 6.302a3.02 3.02 0 0 0 2.122 2.136C4.455 17 12 17 12 17s7.545 0 9.373-.055a3.02 3.02 0 0 0 2.122-2.136C24 12.973 24 8.507 24 8.507s0-4.467-.505-6.302zM9.545 12.078V4.936l6.272 3.571-6.272 3.571z"/></svg>; }
function FbIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill={ICON_ACCENT}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>; }
function LiIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill={ICON_ACCENT}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>; }
