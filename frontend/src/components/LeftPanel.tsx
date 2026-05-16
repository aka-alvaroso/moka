import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import type {
  Background, CanvasConfig, CanvasRatio, ContentOptions,
  BorderRadiusConfig, ShadowConfig, MeshConfig,
} from '@mockup-forge/shared';
import type { EditorState } from '../hooks/useEditor';
import { MeshEditor, meshToCss } from './MeshEditor';
import { uploadFile, fetchMediaInfo } from '../lib/api';

const ACCENT  = '#e94f37';
const FG      = '#E9E9E9';
const FG_DIM  = '#666';
const ROW_BG  = '#161616';
const ROW_BORDER = 'rgba(255,255,255,0.06)';

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  state: EditorState;
  onUploaded: (fileId: string, previewUrl: string, isVideo: boolean, w: number, h: number) => void;
  onBackground: (b: Background) => void;
  onCanvas: (c: CanvasConfig) => void;
  onContent: (p: Partial<ContentOptions>) => void;
  onExport: () => void;
}

export function LeftPanel({ state, onUploaded, onBackground, onCanvas, onContent, onExport }: Props) {
  return (
    <div style={{
      margin: '24px 0 24px 24px',
      padding: '16px 12px',
      width: 264,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#0d0d0d',
      borderRadius: 24,
      border: '1px solid rgba(255,255,255,0.07)',
      color: FG,
      overflow: 'hidden',
    }}>
      <style>{`
        .panel-scroll::-webkit-scrollbar { width: 3px; }
        .panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        .panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        input[type=range].split-slider-track {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 100%; height: 100%;
          background: transparent !important;
          cursor: ew-resize;
          position: absolute; inset: 0; margin: 0; padding: 0;
        }
        input[type=range].split-slider-track::-webkit-slider-runnable-track {
          background: transparent !important;
          height: 2px;
        }
        input[type=range].split-slider-track::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          width: 3px !important;
          height: 22px !important;
          border-radius: 99px !important;
          background: #e9e9e9 !important;
          cursor: ew-resize;
          margin-top: -10px;
        }
        input[type=range].split-slider-track::-moz-range-track {
          background: transparent !important;
          height: 2px;
        }
        input[type=range].split-slider-track::-moz-range-thumb {
          width: 3px !important; height: 22px !important;
          border-radius: 99px !important; border: none !important;
          background: #e9e9e9 !important;
          cursor: ew-resize;
        }
      `}</style>
      <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>

        <MediaSection state={state} onUploaded={onUploaded} />
        <SectionDivider />
        <BackgroundSection background={state.background} onBackground={onBackground} />
        <SectionDivider />
        <AspectRatioSection canvas={state.canvas} onCanvas={onCanvas} />
        <SectionDivider />
        <RotationSection rotation={state.content.rotation} onContent={onContent} />
        <SectionDivider />
        <ZoomSection scale={state.content.scale} onContent={onContent} />
        <SectionDivider />
        <BorderRadiusSection borderRadius={state.content.borderRadius} onContent={onContent} />
        <SectionDivider />
        <ShadowSection shadow={state.content.shadow} onContent={onContent} />

      </div>

      <div style={{ paddingTop: 14, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <ExportButton state={state} onExport={onExport} />
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 -4px' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
      textTransform: 'uppercase', color: '#555', margin: '0 0 8px',
    }}>{children}</p>
  );
}

// ── Media ─────────────────────────────────────────────────────────────────────

function MediaSection({ state, onUploaded }: Pick<Props, 'state' | 'onUploaded'>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
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
      onUploaded(res.fileId, previewUrl, res.isVideo, w, h);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) handleFile(files[0]); },
    accept: { 'image/*': [], 'video/*': ['.mkv'] },
    maxFiles: 1,
    noClick: true,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <SectionLabel>Media</SectionLabel>

      <div
        {...getRootProps()}
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative', borderRadius: 14, overflow: 'hidden',
          height: 88, background: ROW_BG, cursor: 'pointer',
          border: isDragActive ? `1.5px dashed ${ACCENT}` : `1px solid ${ROW_BORDER}`,
          transition: 'border-color 0.15s',
        }}
      >
        <input {...getInputProps()} />
        <input ref={inputRef} type="file" accept="image/*,video/*,.mkv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

        {state.previewUrl ? (
          state.isVideo
            ? <video src={state.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
            : <img src={state.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <UploadIcon />
            <span style={{ fontSize: 11, color: FG_DIM, fontWeight: 500 }}>
              {isDragActive ? 'Drop to import' : 'Drop or click to upload'}
            </span>
          </div>
        )}

        <AnimatePresence>
          {(hovered || isDragActive) && state.previewUrl && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>
                {loading ? 'Uploading…' : isDragActive ? 'Drop to replace' : 'Replace'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state.fileId && (
        <p style={{ fontSize: 10, color: '#444', textAlign: 'center', margin: '6px 0 0' }}>
          {state.isVideo ? 'Video' : 'Image'} · {state.srcW}×{state.srcH}px
        </p>
      )}
    </div>
  );
}

// ── Background ────────────────────────────────────────────────────────────────

const BG_TYPES = ['solid', 'gradient', 'mesh', 'image'] as const;
type BgType = typeof BG_TYPES[number];

const SOLID_PRESETS  = ['#0f0f0f', '#1a1a2e', '#0f172a', '#18181b', '#1e1b4b', '#27272a', '#f8f8f8', '#ffffff'];
const GRAD_PRESETS: Array<{ from: string; to: string; direction: number }> = [
  { from: '#1a1a2e', to: '#16213e', direction: 135 },
  { from: '#0f0c29', to: '#302b63', direction: 135 },
  { from: '#0f2027', to: '#203a43', direction: 160 },
  { from: '#141414', to: '#434343', direction: 180 },
  { from: '#e94f37', to: '#1a1a2e', direction: 135 },
  { from: '#fc4a1a', to: '#f7b733', direction: 135 },
];
const MESH_PRESETS: MeshConfig[] = [
  { base: '#0f0c29', blobs: [{ id: 'a', x: 20, y: 30, color: '#6366f1', size: 90, opacity: 0.85 }, { id: 'b', x: 78, y: 65, color: '#ec4899', size: 75, opacity: 0.75 }] },
  { base: '#000', blobs: [{ id: 'a', x: 30, y: 20, color: '#e94f37', size: 80, opacity: 0.9 }, { id: 'b', x: 70, y: 70, color: '#f97316', size: 70, opacity: 0.8 }] },
  { base: '#001a28', blobs: [{ id: 'a', x: 20, y: 60, color: '#06b6d4', size: 90, opacity: 0.8 }, { id: 'b', x: 80, y: 30, color: '#8b5cf6', size: 80, opacity: 0.75 }] },
  { base: '#0a1628', blobs: [{ id: 'a', x: 25, y: 25, color: '#22d3ee', size: 85, opacity: 0.8 }, { id: 'b', x: 75, y: 75, color: '#6366f1', size: 80, opacity: 0.7 }] },
];

function BackgroundSection({ background, onBackground }: { background: Background; onBackground: (b: Background) => void }) {
  const type = background.type as BgType;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SectionLabel>Background</SectionLabel>

      {/* Type tabs */}
      <div style={{ display: 'flex', gap: 3, background: ROW_BG, borderRadius: 12, padding: 4, border: `1px solid ${ROW_BORDER}` }}>
        {BG_TYPES.map((t) => (
          <button key={t} onClick={() => onBackground({ ...background, type: t })}
            style={{
              flex: 1, padding: '5px 0', borderRadius: 8, fontSize: 10, fontWeight: 600,
              border: 'none', cursor: 'pointer', letterSpacing: '0.02em',
              background: type === t ? ACCENT : 'transparent',
              color: type === t ? '#fff' : '#666',
              transition: 'background 0.15s, color 0.15s',
              textTransform: 'capitalize',
            }}
          >{t}</button>
        ))}
      </div>

      {type === 'solid' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', background: ROW_BG, borderRadius: 12, border: `1px solid ${ROW_BORDER}` }}>
          {SOLID_PRESETS.map((c) => (
            <button key={c} onClick={() => onBackground({ type: 'solid', color: c })}
              style={{
                width: 26, height: 26, borderRadius: 8, background: c, border: 'none', cursor: 'pointer',
                boxShadow: (background.color === c) ? `0 0 0 2px ${ACCENT}` : '0 0 0 1px rgba(255,255,255,0.08)',
                transition: 'box-shadow 0.12s',
              }} />
          ))}
          <label style={{ position: 'relative', width: 26, height: 26, borderRadius: 8, cursor: 'pointer', overflow: 'hidden', flexShrink: 0,
            background: type === 'solid' ? (background.color || '#1a1a2e') : '#2a2a2a',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>
            <input type="color" value={background.color || '#1a1a2e'}
              onChange={(e) => onBackground({ type: 'solid', color: e.target.value })}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', pointerEvents: 'none', mixBlendMode: 'difference' }}>+</span>
          </label>
        </div>
      )}

      {type === 'gradient' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', background: ROW_BG, borderRadius: 12, border: `1px solid ${ROW_BORDER}` }}>
            {GRAD_PRESETS.map((g, i) => (
              <button key={i} onClick={() => onBackground({ type: 'gradient', gradient: g })}
                style={{
                  width: 40, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: `linear-gradient(${g.direction}deg,${g.from},${g.to})`,
                  boxShadow: (background.gradient?.from === g.from && background.gradient?.to === g.to)
                    ? `0 0 0 2px ${ACCENT}` : '0 0 0 1px rgba(255,255,255,0.08)',
                  transition: 'box-shadow 0.12s',
                }} />
            ))}
          </div>
          <Row label="Colors">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ColorSwatch value={background.gradient?.from || '#1a1a2e'}
                onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, from: v } })} />
              <div style={{ flex: 1, height: 18, borderRadius: 6, background: `linear-gradient(90deg,${background.gradient?.from ?? '#1a1a2e'},${background.gradient?.to ?? '#16213e'})` }} />
              <ColorSwatch value={background.gradient?.to || '#16213e'}
                onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, to: v } })} />
            </div>
          </Row>
          <RowSlider label="Angle" value={background.gradient?.direction ?? 135} min={0} max={360} unit="°"
            onChange={(v) => onBackground({ type: 'gradient', gradient: { ...background.gradient!, direction: v } })} />
        </div>
      )}

      {type === 'mesh' && (
        <MeshEditor
          value={background.mesh ?? MESH_PRESETS[0]}
          onChange={(mesh) => onBackground({ type: 'mesh', mesh })}
        />
      )}

      {type === 'image' && (
        <BgImageDrop currentFileId={background.imageFileId}
          onUploaded={(id) => onBackground({ type: 'image', imageFileId: id })} />
      )}
    </div>
  );
}

// ── Aspect ratio ──────────────────────────────────────────────────────────────

const RATIOS: { value: CanvasRatio; label: string }[] = [
  { value: '1:1', label: '1:1' }, { value: '4:5', label: '4:5' },
  { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
];

function AspectRatioSection({ canvas, onCanvas }: { canvas: CanvasConfig; onCanvas: (c: CanvasConfig) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionLabel>Aspect Ratio</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        {RATIOS.map(({ value, label }) => (
          <button key={value} onClick={() => onCanvas({ ratio: value })}
            style={chipBtnStyle(canvas.ratio === value)}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Rotation ──────────────────────────────────────────────────────────────────

const ROTATION_PRESETS = [{ label: '0°', value: 0 }, { label: '90°', value: 90 }, { label: '180°', value: 180 }, { label: '-90°', value: -90 }];

function RotationSection({ rotation, onContent }: { rotation: number; onContent: (p: Partial<ContentOptions>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Rotation</SectionLabel>
      <RowSlider label="Angle" value={rotation} min={-180} max={180} unit="°"
        onChange={(v) => onContent({ rotation: v })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {ROTATION_PRESETS.map(({ label, value }) => (
          <button key={label} onClick={() => onContent({ rotation: value })}
            style={chipBtnStyle(rotation === value)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

const ZOOM_PRESETS = [{ label: '50%', value: 0.5 }, { label: '100%', value: 1 }, { label: '150%', value: 1.5 }, { label: '200%', value: 2 }];

function ZoomSection({ scale, onContent }: { scale: number; onContent: (p: Partial<ContentOptions>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Zoom</SectionLabel>
      <RowSlider label="Scale" value={Math.round(scale * 100)} min={5} max={400} unit="%"
        onChange={(v) => onContent({ scale: v / 100 })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {ZOOM_PRESETS.map(({ label, value }) => (
          <button key={label} onClick={() => onContent({ scale: value })}
            style={chipBtnStyle(Math.abs(scale - value) < 0.01)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Border radius ─────────────────────────────────────────────────────────────

function BorderRadiusSection({ borderRadius: br, onContent }: { borderRadius: BorderRadiusConfig; onContent: (p: Partial<ContentOptions>) => void }) {
  const set = (patch: Partial<BorderRadiusConfig>) => onContent({ borderRadius: { ...br, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <SectionLabel>Border Radius</SectionLabel>
        <button
          onClick={() => {
            const avg = Math.round((br.tl + br.tr + br.br + br.bl) / 4);
            set({ linked: !br.linked, all: br.linked ? avg : br.all });
          }}
          style={{
            background: br.linked ? ACCENT : ROW_BG,
            border: br.linked ? 'none' : `1px solid ${ROW_BORDER}`,
            cursor: 'pointer', borderRadius: 7, padding: '3px 10px',
            fontSize: 10, fontWeight: 600,
            color: br.linked ? '#fff' : '#888',
            transition: 'background 0.12s, color 0.12s',
            marginBottom: 8,
          }}
        >
          {br.linked ? 'All' : 'Each'}
        </button>
      </div>

      {br.linked ? (
        <RowSlider label="Radius" value={br.all} min={0} max={200} unit="px"
          onChange={(v) => set({ all: v, tl: v, tr: v, br: v, bl: v })} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <RowSlider label="↖ TL" value={br.tl} min={0} max={200} unit="px" onChange={(v) => set({ tl: v })} />
          <RowSlider label="↗ TR" value={br.tr} min={0} max={200} unit="px" onChange={(v) => set({ tr: v })} />
          <RowSlider label="↙ BL" value={br.bl} min={0} max={200} unit="px" onChange={(v) => set({ bl: v })} />
          <RowSlider label="↘ BR" value={br.br} min={0} max={200} unit="px" onChange={(v) => set({ br: v })} />
        </div>
      )}
    </div>
  );
}

// ── Shadow ────────────────────────────────────────────────────────────────────

function ShadowSection({ shadow, onContent }: { shadow: ShadowConfig; onContent: (p: Partial<ContentOptions>) => void }) {
  const set = (patch: Partial<ShadowConfig>) => onContent({ shadow: { ...shadow, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <SectionLabel>Shadow</SectionLabel>
      <Row label="Color">
        <ColorSwatch value={shadow.color} onChange={(v) => set({ color: v })} />
      </Row>
      <RowSlider label="Opacity" value={Math.round(shadow.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => set({ opacity: v / 100 })} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <RowSlider label="X"      value={shadow.x}      min={-100} max={100} unit="px" onChange={(v) => set({ x: v })} />
        <RowSlider label="Y"      value={shadow.y}      min={-100} max={100} unit="px" onChange={(v) => set({ y: v })} />
        <RowSlider label="Blur"   value={shadow.blur}   min={0}    max={150} unit="px" onChange={(v) => set({ blur: v })} />
        <RowSlider label="Spread" value={shadow.spread} min={-50}  max={100} unit="px" onChange={(v) => set({ spread: v })} />
      </div>
    </div>
  );
}

// ── Export button ─────────────────────────────────────────────────────────────

function ExportButton({ state, onExport }: { state: EditorState; onExport: () => void }) {
  const disabled = !state.fileId;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onExport}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 700,
        border: 'none', letterSpacing: '0.05em', textTransform: 'uppercase',
        background: disabled ? '#161616' : ACCENT,
        color: disabled ? '#333' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'box-shadow 0.18s, opacity 0.12s',
        boxShadow: (!disabled && hovered) ? `0 0 22px 2px ${ACCENT}44` : 'none',
        opacity: (!disabled && hovered) ? 0.9 : 1,
      }}
    >
      Export
    </button>
  );
}

// ── Background image drop zone ────────────────────────────────────────────────

function BgImageDrop({ currentFileId, onUploaded }: { currentFileId?: string; onUploaded: (id: string) => void }) {
  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try { onUploaded((await uploadFile(file)).fileId); } catch (err) { console.error(err); }
  }, [onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [] }, maxFiles: 1,
  });

  return (
    <div {...getRootProps()} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderRadius: 12, border: `1.5px dashed ${isDragActive ? ACCENT : 'rgba(255,255,255,0.1)'}`,
      background: isDragActive ? '#1a0f0d' : ROW_BG, cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <input {...getInputProps()} />
      {currentFileId
        ? <img src={`/api/download/${currentFileId}`} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UploadIcon />
          </div>
      }
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: FG, margin: 0 }}>
          {isDragActive ? 'Drop to set' : currentFileId ? 'Background set' : 'Drop image'}
        </p>
        <p style={{ fontSize: 10, color: FG_DIM, margin: '2px 0 0' }}>PNG · JPG · WebP</p>
      </div>
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

/** Full-width row container with label on left, content on right */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 12px', background: ROW_BG, borderRadius: 11,
      border: `1px solid ${ROW_BORDER}`,
    }}>
      <span style={{ fontSize: 12, color: '#777', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

/** Split-style slider row: label section left | dots track + value right */
function RowSlider({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const DOT_COUNT = 5;

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', borderRadius: 11, overflow: 'hidden',
      border: `1px solid ${ROW_BORDER}`, position: 'relative', height: 40,
    }}>
      {/* Label section — darker left half */}
      <div style={{
        display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 10,
        background: '#121212', borderRight: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0, minWidth: 72,
      }}>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </div>

      {/* Track + value section */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        background: ROW_BG, paddingLeft: 10, paddingRight: 12, gap: 8,
      }}>
        {/* Dot markers + range input confined to this area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '100%' }}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <div key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'rgba(255,255,255,0.13)',
              flexShrink: 0, pointerEvents: 'none',
            }} />
          ))}
          <input
            type="range" min={min} max={max} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="split-slider-track"
          />
        </div>

        {/* Editable value — stopPropagation prevents the range overlay from stealing focus */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 44, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none',
              fontSize: 12, fontFamily: 'monospace', color: '#ddd', padding: 0, position: 'relative', zIndex: 1,
            }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(String(value)); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              fontSize: 12, fontFamily: 'monospace', color: '#bbb', cursor: 'text',
              minWidth: 36, textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1,
            }}
          >{value}{unit}</span>
        )}
      </div>

    </div>
  );
}

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ display: 'block', width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
    </label>
  );
}

function chipBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 4px', borderRadius: 10, fontSize: 10, fontWeight: 600,
    border: active ? 'none' : `1px solid ${ROW_BORDER}`,
    cursor: 'pointer', letterSpacing: '0.02em',
    background: active ? ACCENT : ROW_BG,
    color: active ? '#fff' : '#888',
    transition: 'background 0.12s, color 0.12s',
  };
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
