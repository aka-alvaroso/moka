import { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import type { AnimatedProps, AnimationKeyframe, EasingType } from '@mockup-forge/shared';
import { PRESETS, PRESET_MOTION, generateKeyframes } from '../lib/animationPresets';

const ACCENT = '#e94f37';
const BG     = '#0d0d0d';
const ROW_BG = '#161616';
const BORDER = 'rgba(255,255,255,0.06)';

type PresetCategory = 'in' | 'out';

interface Props {
  baseProps: AnimatedProps | null;
  animationDuration: number;
  onApply: (keyframes: AnimationKeyframe[]) => void;
}

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'ease-out',    label: 'Smooth' },
  { value: 'ease-in-out', label: 'Ease'   },
  { value: 'spring',      label: 'Spring' },
  { value: 'ease-in',     label: 'Sharp'  },
  { value: 'linear',      label: 'Linear' },
];

const CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: 'in',  label: 'Entrance' },
  { id: 'out', label: 'Exit'     },
];

const CARD_W   = 88;
const CARD_H   = 70;
const CARD_GAP = 6;

export function AnimationPresetsPanel({ baseProps, animationDuration, onApply }: Props) {
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('in');
  const [selectedPreset, setSelectedPreset] = useState('fade-in');
  const [effectDuration, setEffectDuration] = useState(0.6);
  const [delay, setDelay]                   = useState(0);
  const [easing, setEasing]                 = useState<EasingType>('ease-out');

  const maxEffect     = Math.max(0.1, animationDuration - delay);
  const clampedEffect = Math.min(effectDuration, maxEffect);

  const visiblePresets = PRESETS.filter((p) => p.category === activeCategory);

  // When switching category, auto-select first preset in new category
  const handleCategoryChange = (cat: PresetCategory) => {
    setActiveCategory(cat);
    const first = PRESETS.find((p) => p.category === cat);
    if (first) setSelectedPreset(first.id);
  };

  const handleApply = () => {
    if (!baseProps) return;
    const isExit = activeCategory === 'out';
    // Exit presets are placed at the END of the animation
    const startDelay = isExit
      ? Math.max(0, animationDuration - clampedEffect - delay)
      : delay;
    onApply(generateKeyframes(selectedPreset, baseProps, { effectDuration: clampedEffect, delay: startDelay, easing }));
  };

  return (
    <div style={{ background: BG, padding: '16px 28px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {!baseProps ? (
        <div style={{ textAlign: 'center', color: '#333', fontSize: 12, padding: '20px 0' }}>
          Select an element to animate it
        </div>
      ) : (
        <>
          {/* ── Category tabs + preset cards ─────────────────────────────── */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

            {/* Category pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, paddingTop: 2 }}>
              {CATEGORIES.map((cat) => {
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, border: 'none',
                      background: active ? ROW_BG : 'transparent',
                      color: active ? '#ccc' : '#444',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap',
                      transition: 'color 0.15s, background 0.15s',
                      borderLeft: `2px solid ${active ? ACCENT : 'transparent'}`,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#777'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = '#444'; }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: BORDER, alignSelf: 'stretch', flexShrink: 0 }} />

            {/* Preset cards */}
            <div style={{ display: 'flex', gap: CARD_GAP, overflowX: 'auto', flex: 1 }}>
              {visiblePresets.map((preset) => {
                const m        = PRESET_MOTION[preset.id];
                const selected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    style={{
                      width: CARD_W, height: CARD_H, flexShrink: 0,
                      background: selected ? `${ACCENT}12` : ROW_BG,
                      border: `1.5px solid ${selected ? `${ACCENT}88` : BORDER}`,
                      borderRadius: 10, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'border-color 0.15s, background 0.15s', padding: 0,
                    }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = BORDER; }}
                  >
                    <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      <motion.div
                        key={preset.id}
                        initial={m.initial}
                        animate={m.animate}
                        transition={{
                          ...(m.transition ?? { duration: 0.55, ease: 'easeOut' }),
                          repeat: Infinity,
                          repeatType: m.repeatType ?? 'reverse',
                          repeatDelay: 1,
                        }}
                        style={{
                          width: 18, height: 18, flexShrink: 0,
                          background: selected ? ACCENT : '#484848',
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', lineHeight: 1,
                      color: selected ? '#ddd' : '#555',
                      transition: 'color 0.15s',
                    }}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Controls strip ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            <div style={{ flex: '0 0 220px' }}>
              <DarkRowSlider
                label="Duration"
                valueTenths={Math.round(clampedEffect * 10)}
                min={1}
                max={Math.round(Math.min(3, maxEffect) * 10)}
                onChange={(tenths) => setEffectDuration(tenths / 10)}
                display={`${clampedEffect.toFixed(1)}s`}
              />
            </div>

            <div style={{ flex: '0 0 220px' }}>
              <DarkRowSlider
                label={activeCategory === 'out' ? 'Before end' : 'Delay'}
                valueTenths={Math.round(delay * 10)}
                min={0}
                max={Math.round(Math.max(0, animationDuration - clampedEffect) * 10)}
                onChange={(tenths) => setDelay(tenths / 10)}
                display={`${delay.toFixed(1)}s`}
              />
            </div>

            <div style={{ width: 1, height: 28, background: BORDER, flexShrink: 0 }} />

            {/* Easing pills */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {EASING_OPTIONS.map((opt) => {
                const active = easing === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setEasing(opt.value)}
                    style={{
                      padding: '6px 11px', borderRadius: 8,
                      border: `1px solid ${active ? `${ACCENT}88` : BORDER}`,
                      background: active ? `${ACCENT}14` : ROW_BG,
                      color: active ? '#ddd' : '#555',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.12s', letterSpacing: '0.02em', whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1 }} />

            <button
              onClick={handleApply}
              style={{
                padding: '0 28px', height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                background: ACCENT, color: '#fff',
                fontSize: 12, fontWeight: 800, letterSpacing: '0.05em',
                cursor: 'pointer', transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.82'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Dark slider (matches RightPanel RowSlider visually) ───────────────────────

function DarkRowSlider({ label, valueTenths, min, max, onChange, display }: {
  label: string; valueTenths: number; min: number; max: number;
  onChange: (tenths: number) => void; display: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) onChange(Math.round(Math.max(min, Math.min(max, parsed * 10))));
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      borderRadius: 11, overflow: 'hidden', height: 40,
      background: ROW_BG, position: 'relative',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        paddingLeft: 12, paddingRight: 10,
        background: '#0a0a0a', flexShrink: 0, minWidth: 80,
      }}>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: 10, paddingRight: 12, gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', height: '100%' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.13)', flexShrink: 0, pointerEvents: 'none' }} />
          ))}
          <input
            type="range" min={min} max={max} step={1} value={valueTenths}
            onChange={(e) => onChange(Number(e.target.value))}
            className="rp-slider"
          />
        </div>
        {editing ? (
          <input
            ref={inputRef} type="text" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
            style={{ width: 44, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontFamily: 'monospace', color: '#ccc', padding: 0, position: 'relative', zIndex: 1 }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(String(valueTenths / 10)); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: 12, fontFamily: 'monospace', color: '#ccc', cursor: 'text', minWidth: 36, textAlign: 'right', flexShrink: 0, position: 'relative', zIndex: 1 }}
          >
            {display}
          </span>
        )}
      </div>
    </div>
  );
}
