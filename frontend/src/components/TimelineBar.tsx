import { useRef, useState, useEffect, useCallback } from 'react';
import type { AnimationConfig, AnimationKeyframe, EasingType } from '@mockup-forge/shared';

const ACCENT   = '#e94f37';
const ROW_BG   = '#161616';
const ROW_BORDER = 'rgba(255,255,255,0.06)';
const TRACK_H  = 48;

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear',      label: 'Linear'      },
  { value: 'ease-in',     label: 'Ease In'     },
  { value: 'ease-out',    label: 'Ease Out'    },
  { value: 'ease-in-out', label: 'Ease In-Out' },
];

interface Props {
  animation: AnimationConfig;
  currentTime: number;
  playing: boolean;
  onTimeChange: (t: number) => void;
  onPlayToggle: () => void;
  onRemoveKeyframe: (id: string) => void;
  onUpdateEasing: (id: string, easing: EasingType) => void;
  onAnimationChange: (patch: Partial<AnimationConfig>) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function TimelineBar({
  animation, currentTime, playing,
  onTimeChange, onPlayToggle,
  onRemoveKeyframe, onUpdateEasing, onAnimationChange,
  onScrubStart, onScrubEnd,
}: Props) {
  const trackRef      = useRef<HTMLDivElement>(null);
  const [selectedKf, setSelectedKf] = useState<string | null>(null);
  const [dragging, setDragging]     = useState(false);

  const selectedKeyframe = animation.keyframes.find((k) => k.id === selectedKf) ?? null;

  // ── Track click / drag ────────────────────────────────────────────────────

  const timeFromEvent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * animation.duration;
  }, [animation.duration]);

  const onTrackPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setSelectedKf(null);
    onScrubStart?.();
    onTimeChange(timeFromEvent(e.clientX));
  };

  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    onTimeChange(timeFromEvent(e.clientX));
  };

  const onTrackPointerUp = () => { setDragging(false); onScrubEnd?.(); };

  // ── Format helpers ────────────────────────────────────────────────────────

  const fmt = (t: number) => {
    const s = Math.floor(t);
    const ms = Math.floor((t - s) * 10);
    return `${s}.${ms}s`;
  };

  const pct = (t: number) => `${(t / animation.duration) * 100}%`;

  // ── Tick marks ───────────────────────────────────────────────────────────

  const ticks = Array.from({ length: Math.floor(animation.duration) + 1 }, (_, i) => i);

  return (
    <div style={{
      background: '#0d0d0d',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
    }}>

      {/* ── Top bar: controls ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>

        {/* Play / Pause */}
        <button onClick={onPlayToggle} style={iconBtnStyle()}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Current time */}
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#888', minWidth: 36 }}>
          {fmt(currentTime)}
        </span>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.07)' }} />

        {/* Duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Duration</span>
          <DurationInput value={animation.duration} onChange={(v) => onAnimationChange({ duration: v })} />
        </div>

        {/* FPS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>FPS</span>
          <select
            value={animation.fps}
            onChange={(e) => onAnimationChange({ fps: Number(e.target.value) as 24 | 30 | 60 })}
            style={selectStyle()}
          >
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Selected keyframe controls */}
        {selectedKeyframe && (
          <>
            <select
              value={selectedKeyframe.easing}
              onChange={(e) => onUpdateEasing(selectedKeyframe.id, e.target.value as EasingType)}
              style={selectStyle()}
            >
              {EASING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button
              onClick={() => { onRemoveKeyframe(selectedKeyframe.id); setSelectedKf(null); }}
              style={{ ...iconBtnStyle(), color: '#e94f37' }}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>

      {/* ── Timeline track ───────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 10px', position: 'relative' }}>

        {/* Tick labels */}
        <div style={{ position: 'relative', height: 16, marginBottom: 2 }}>
          {ticks.map((s) => (
            <span key={s} style={{
              position: 'absolute', left: pct(s),
              fontSize: 9, color: '#333', transform: 'translateX(-50%)',
              fontFamily: 'monospace',
            }}>{s}s</span>
          ))}
        </div>

        {/* Main track */}
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          style={{
            position: 'relative', height: TRACK_H,
            background: ROW_BG, borderRadius: 10,
            border: `1px solid ${ROW_BORDER}`,
            cursor: 'crosshair', overflow: 'visible',
          }}
        >
          {/* Segment fills between keyframes */}
          {animation.keyframes.map((kf, i) => {
            const next = animation.keyframes[i + 1];
            if (!next) return null;
            return (
              <div key={kf.id + '-seg'} style={{
                position: 'absolute',
                left: pct(kf.time), width: `calc(${pct(next.time)} - ${pct(kf.time)})`,
                top: '50%', transform: 'translateY(-50%)',
                height: 3, background: `${ACCENT}44`, borderRadius: 99,
                pointerEvents: 'none',
              }} />
            );
          })}

          {/* Tick lines on track */}
          {ticks.map((s) => (
            <div key={s} style={{
              position: 'absolute', left: pct(s),
              top: 0, bottom: 0, width: 1,
              background: s === 0 || s === animation.duration ? 'transparent' : 'rgba(255,255,255,0.04)',
              pointerEvents: 'none',
            }} />
          ))}

          {/* Keyframe diamonds */}
          {animation.keyframes.map((kf) => (
            <KeyframeDiamond
              key={kf.id}
              kf={kf}
              selected={kf.id === selectedKf}
              pct={pct(kf.time)}
              onSelect={() => setSelectedKf((prev) => prev === kf.id ? null : kf.id)}
            />
          ))}

          {/* Playhead */}
          <div style={{
            position: 'absolute', left: pct(currentTime),
            top: -4, bottom: -4, width: 2,
            background: '#fff',
            borderRadius: 99,
            pointerEvents: 'none',
            transform: 'translateX(-50%)',
            boxShadow: '0 0 6px rgba(255,255,255,0.4)',
          }}>
            {/* Playhead head */}
            <div style={{
              position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
              width: 8, height: 8, borderRadius: 2,
              background: '#fff',
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Keyframe diamond marker ───────────────────────────────────────────────────

function KeyframeDiamond({ kf, selected, pct, onSelect }: {
  kf: AnimationKeyframe; selected: boolean; pct: string;
  onSelect: () => void;
}) {
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: 'absolute', left: pct, top: '50%',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        width: selected ? 14 : 11, height: selected ? 14 : 11,
        background: selected ? '#fff' : ACCENT,
        border: selected ? `2px solid ${ACCENT}` : '2px solid rgba(255,255,255,0.3)',
        borderRadius: 3,
        cursor: 'pointer',
        transition: 'width 0.1s, height 0.1s, background 0.1s',
        zIndex: 2,
        boxShadow: selected ? `0 0 10px ${ACCENT}88` : 'none',
      }}
    />
  );
}

// ── Duration input ────────────────────────────────────────────────────────────

function DurationInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const v = parseFloat(draft);
    if (!isNaN(v) && v >= 0.5 && v <= 60) onChange(Math.round(v * 10) / 10);
  };

  if (editing) {
    return (
      <input ref={inputRef} type="text" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 40, ...selectStyle(), textAlign: 'center' }}
      />
    );
  }
  return (
    <span onClick={() => { setEditing(true); setDraft(String(value)); }}
      style={{ fontSize: 11, fontFamily: 'monospace', color: '#bbb', cursor: 'text', padding: '3px 6px', background: ROW_BG, borderRadius: 6, border: `1px solid ${ROW_BORDER}` }}>
      {value}s
    </span>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

function iconBtnStyle(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 8,
    background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
    cursor: 'pointer', color: '#aaa', flexShrink: 0,
  };
}

function selectStyle(): React.CSSProperties {
  return {
    background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
    color: '#aaa', fontSize: 11, borderRadius: 6,
    padding: '3px 6px', cursor: 'pointer', outline: 'none',
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0l10 6-10 6z"/></svg>;
}
function PauseIcon() {
  return <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3.5" height="12" rx="1"/><rect x="6.5" y="0" width="3.5" height="12" rx="1"/></svg>;
}
function DiamondIcon() {
  return <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1" transform="rotate(45 4 4)"/></svg>;
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  );
}
