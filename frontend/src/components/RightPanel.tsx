import { useRef, useState, useEffect } from 'react';
import type { ContentOptions, BorderRadiusConfig, ShadowConfig, MediaItem } from '@mockup-forge/shared';

const ACCENT    = '#e94f37';
const FG        = '#E9E9E9';
const FG_DIM    = '#666';
const ROW_BG    = '#161616';
const ROW_BORDER = 'rgba(255,255,255,0.06)';

interface Props {
  item: MediaItem | null;
  onContent: (patch: Partial<ContentOptions>) => void;
  onVideoEndBehavior: (behavior: MediaItem['videoEndBehavior']) => void;
}

export function RightPanel({ item, onContent, onVideoEndBehavior }: Props) {
  return (
    <div style={{
      margin: '24px 24px 24px 0',
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
        .rpanel-scroll::-webkit-scrollbar { width: 3px; }
        .rpanel-scroll::-webkit-scrollbar-track { background: transparent; }
        .rpanel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        input[type=range].rp-slider {
          -webkit-appearance: none !important; appearance: none !important;
          width: 100%; height: 100%; background: transparent !important;
          cursor: ew-resize; position: absolute; inset: 0; margin: 0; padding: 0;
        }
        input[type=range].rp-slider::-webkit-slider-runnable-track { background: transparent !important; height: 2px; }
        input[type=range].rp-slider::-webkit-slider-thumb {
          -webkit-appearance: none !important; width: 3px !important; height: 22px !important;
          border-radius: 99px !important; background: #e9e9e9 !important; cursor: ew-resize; margin-top: -10px;
        }
        input[type=range].rp-slider::-moz-range-track { background: transparent !important; height: 2px; }
        input[type=range].rp-slider::-moz-range-thumb {
          width: 3px !important; height: 22px !important; border-radius: 99px !important;
          border: none !important; background: #e9e9e9 !important; cursor: ew-resize;
        }
      `}</style>

      {!item ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.35 }}>
          <LayersIcon />
          <span style={{ fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 1.4 }}>Select a layer<br/>to edit its properties</span>
        </div>
      ) : (
        <div className="rpanel-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 4 }}>
          <RotationSection rotation={item.content.rotation} onContent={onContent} />
          <SectionDivider />
          <ZoomSection scale={item.content.scale} onContent={onContent} />
          <SectionDivider />
          <OpacitySection opacity={item.content.opacity} onContent={onContent} />
          <SectionDivider />
          <BorderRadiusSection borderRadius={item.content.borderRadius} onContent={onContent} />
          <SectionDivider />
          <ShadowSection shadow={item.content.shadow} onContent={onContent} />
          {item.isVideo && (
            <>
              <SectionDivider />
              <VideoEndSection behavior={item.videoEndBehavior} onChange={onVideoEndBehavior} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 -4px' }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#555', margin: '0 0 8px' }}>
      {children}
    </p>
  );
}

// ── Rotation ──────────────────────────────────────────────────────────────────

const ROTATION_PRESETS = [{ label: '0°', value: 0 }, { label: '90°', value: 90 }, { label: '180°', value: 180 }, { label: '-90°', value: -90 }];

function RotationSection({ rotation, onContent }: { rotation: number; onContent: (p: Partial<ContentOptions>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Rotation</SectionLabel>
      <RowSlider label="Angle" value={rotation} min={-180} max={180} unit="°" onChange={(v) => onContent({ rotation: v })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {ROTATION_PRESETS.map(({ label, value }) => (
          <button key={label} onClick={() => onContent({ rotation: value })} style={chipBtnStyle(rotation === value)}>{label}</button>
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
      <RowSlider label="Scale" value={Math.round(scale * 100)} min={5} max={400} unit="%" onChange={(v) => onContent({ scale: v / 100 })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {ZOOM_PRESETS.map(({ label, value }) => (
          <button key={label} onClick={() => onContent({ scale: value })} style={chipBtnStyle(Math.abs(scale - value) < 0.01)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Opacity ───────────────────────────────────────────────────────────────────

function OpacitySection({ opacity, onContent }: { opacity: number; onContent: (p: Partial<ContentOptions>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>Opacity</SectionLabel>
      <RowSlider label="Opacity" value={Math.round(opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onContent({ opacity: v / 100 })} />
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
      <RowSlider label="X"      value={shadow.x}      min={-100} max={100} unit="px" onChange={(v) => set({ x: v })} />
      <RowSlider label="Y"      value={shadow.y}      min={-100} max={100} unit="px" onChange={(v) => set({ y: v })} />
      <RowSlider label="Blur"   value={shadow.blur}   min={0}    max={150} unit="px" onChange={(v) => set({ blur: v })} />
      <RowSlider label="Spread" value={shadow.spread} min={-50}  max={100} unit="px" onChange={(v) => set({ spread: v })} />
    </div>
  );
}

// ── Video end behavior ────────────────────────────────────────────────────────

const END_OPTIONS: Array<{ value: MediaItem['videoEndBehavior']; label: string; desc: string }> = [
  { value: 'loop',   label: 'Loop',   desc: 'Restart from beginning' },
  { value: 'freeze', label: 'Freeze', desc: 'Pause on last frame' },
  { value: 'hide',   label: 'Hide',   desc: 'Become invisible' },
];

function VideoEndSection({ behavior, onChange }: { behavior: MediaItem['videoEndBehavior']; onChange: (b: MediaItem['videoEndBehavior']) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SectionLabel>When video ends</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {END_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
              background: behavior === opt.value ? '#1e100e' : ROW_BG,
              border: `1px solid ${behavior === opt.value ? ACCENT + '55' : ROW_BORDER}`,
              transition: 'all 0.12s',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: behavior === opt.value ? ACCENT : '#bbb' }}>{opt.label}</span>
            <span style={{ fontSize: 10, color: '#555' }}>{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: ROW_BG, borderRadius: 11, border: `1px solid ${ROW_BORDER}` }}>
      <span style={{ fontSize: 12, color: '#777', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function RowSlider({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const DOT_COUNT = 5;

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 11, overflow: 'hidden', border: `1px solid ${ROW_BORDER}`, position: 'relative', height: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 10, background: '#121212', borderRight: '1px solid rgba(255,255,255,0.05)', flexShrink: 0, minWidth: 72 }}>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: ROW_BG, paddingLeft: 10, paddingRight: 12, gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '100%' }}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.13)', flexShrink: 0, pointerEvents: 'none' }} />
          ))}
          <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="rp-slider" />
        </div>
        {editing ? (
          <input ref={inputRef} type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft} onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{ width: 44, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'monospace', color: '#ddd', padding: 0, position: 'relative', zIndex: 1 }} />
        ) : (
          <span onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(String(value)); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: 12, fontFamily: 'monospace', color: '#bbb', cursor: 'text', minWidth: 36, textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}>
            {value}{unit}
          </span>
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
    border: active ? 'none' : `1px solid ${ROW_BORDER}`, cursor: 'pointer', letterSpacing: '0.02em',
    background: active ? ACCENT : ROW_BG, color: active ? '#fff' : '#888',
    transition: 'background 0.12s, color 0.12s',
  };
}

function LayersIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}
