import { useRef, useEffect, useState, useCallback } from 'react';
import type { EditorState } from '../hooks/useEditor';
import type { ContentOptions } from '@mockup-forge/shared';
import { meshToCss } from './MeshEditor';

const RATIO_MAP: Record<string, number> = {
  '1:1': 1, '16:9': 16 / 9, '4:5': 4 / 5, '9:16': 9 / 16,
};

// Snap to center when within this % of canvas
const SNAP_THRESHOLD = 2.5;

function backgroundCss(bg: EditorState['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid': return { background: bg.color || '#1a1a2e' };
    case 'gradient': {
      const { from, to, direction } = bg.gradient!;
      return { background: `linear-gradient(${direction}deg,${from},${to})` };
    }
    case 'mesh':
      return { background: bg.mesh ? meshToCss(bg.mesh) : '#0f0c29' };
    case 'transparent':
      return { background: 'repeating-conic-gradient(#1c1c1f 0% 25%,#141416 0% 50%) 0 0/20px 20px' };
    default: return { background: '#1a1a2e' };
  }
}

type DragMode = 'move' | 'resize' | 'rotate' | 'radius' | 'shadow' | null;

interface DragState {
  mode: DragMode;
  startMx: number; startMy: number;
  startContent: ContentOptions;
  dispW: number; dispH: number;
  centerX: number; centerY: number;
  startAngle: number; startDist: number;
}

interface Props {
  state: EditorState;
  onContentChange: (patch: Partial<ContentOptions>) => void;
}

export function EditorCanvas({ state, onContentChange }: Props) {
  const { background, canvas, content, previewUrl, isVideo, srcW, srcH } = state;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<DragState | null>(null);

  // container size (the padded area around the canvas)
  const [container, setContainer] = useState({ w: 600, h: 600 });
  const [selected, setSelected]   = useState(false);
  const [guides, setGuides]        = useState({ x: false, y: false });

  // Observe the wrapper (not the canvas) so we know available space
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainer({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Deselect when content is removed
  useEffect(() => { if (!previewUrl) setSelected(false); }, [previewUrl]);

  const ratio = RATIO_MAP[canvas.ratio] ?? 1;
  const PAD   = 48; // p-6 on each side
  const avW   = Math.max(1, container.w - PAD * 2);
  const avH   = Math.max(1, container.h - PAD * 2);
  // Largest rectangle with correct ratio that fits in available space
  const cw = avW / avH > ratio ? Math.round(avH * ratio) : avW;
  const ch = Math.round(cw / ratio);

  const shortSide = Math.min(cw, ch) * 0.8;
  const fitScale  = srcW > 0 && srcH > 0 ? Math.min(shortSide / srcW, shortSide / srcH) : 1;
  const dispW     = Math.max(4, srcW * fitScale * content.scale);
  const dispH     = Math.max(4, srcH * fitScale * content.scale);
  const cx        = (content.x / 100) * cw;
  const cy        = (content.y / 100) * ch;
  const r         = Math.min(content.borderRadius, Math.min(dispW, dispH) / 2);

  // ── Start drag ──────────────────────────────────────────────────────────────
  const startDrag = useCallback((mode: DragMode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const centerX = rect.left + cx;
    const centerY = rect.top + cy;
    dragRef.current = {
      mode, startMx: e.clientX, startMy: e.clientY,
      startContent: { ...content },
      dispW, dispH, centerX, centerY,
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI,
      startDist:  Math.hypot(e.clientX - centerX, e.clientY - centerY),
    };
  }, [cx, cy, dispW, dispH, content]);

  // ── Global mouse events ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      if (d.mode === 'move') {
        const dx = ((e.clientX - d.startMx) / rect.width)  * 100;
        const dy = ((e.clientY - d.startMy) / rect.height) * 100;
        let newX = d.startContent.x + dx;
        let newY = d.startContent.y + dy;

        // Snap to center + show guides
        const snapX = Math.abs(newX - 50) < SNAP_THRESHOLD;
        const snapY = Math.abs(newY - 50) < SNAP_THRESHOLD;
        setGuides({ x: snapX, y: snapY });
        if (snapX) newX = 50;
        if (snapY) newY = 50;

        onContentChange({
          x: Math.min(130, Math.max(-30, newX)),
          y: Math.min(130, Math.max(-30, newY)),
        });
      }

      else if (d.mode === 'resize') {
        const newDist = Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY);
        if (d.startDist > 2) {
          onContentChange({ scale: Math.max(0.05, Math.min(6, d.startContent.scale * (newDist / d.startDist))) });
        }
      }

      else if (d.mode === 'rotate') {
        const newAngle = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) * 180 / Math.PI;
        let rot = d.startContent.rotation + (newAngle - d.startAngle);
        while (rot >  180) rot -= 360;
        while (rot < -180) rot += 360;
        if (Math.abs(rot) < 2) rot = 0;
        onContentChange({ rotation: Math.round(rot * 2) / 2 });
      }

      else if (d.mode === 'radius') {
        const dx  = -(e.clientX - d.startMx);
        const max = Math.min(d.dispW, d.dispH) / 2;
        onContentChange({ borderRadius: Math.max(0, Math.min(max, Math.round(d.startContent.borderRadius + dx * 0.6))) });
      }

      else if (d.mode === 'shadow') {
        const dx = e.clientX - d.startMx;
        onContentChange({ shadow: Math.round(Math.max(0, Math.min(1, d.startContent.shadow + dx / 200)) * 100) / 100 });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setGuides({ x: false, y: false });
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onContentChange]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="w-full h-full flex items-center justify-center">
      <div
        ref={canvasRef}
        className="relative overflow-hidden rounded-xl select-none shrink-0"
        style={{
          width: cw,
          height: ch,
          ...backgroundCss(background),
        }}
        // Click on canvas background → deselect
        onMouseDown={() => setSelected(false)}
      >
        {/* BG image */}
        {background.type === 'image' && background.imageFileId && (
          <img src={`/api/download/${background.imageFileId}`}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false} />
        )}

        {/* ── Snap guides ── */}
        {guides.x && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: '50%', width: 1,
            background: 'rgba(99,102,241,0.7)',
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(99,102,241,0.5)',
          }} />
        )}
        {guides.y && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: '50%', height: 1,
            background: 'rgba(99,102,241,0.7)',
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(99,102,241,0.5)',
          }} />
        )}

        {/* ── Content ── */}
        {previewUrl && (
          <>
            {/* Media layer — always visible */}
            <div
              style={{
                position: 'absolute',
                width: dispW, height: dispH,
                left: cx, top: cy,
                transform: `translate(-50%,-50%) rotate(${content.rotation}deg)`,
                borderRadius: r,
                overflow: 'hidden',
                cursor: selected ? 'move' : 'pointer',
                boxShadow: content.shadow > 0
                  ? `0 ${content.shadow * 20}px ${content.shadow * 48}px rgba(0,0,0,${content.shadow * 0.7})`
                  : 'none',
                // Subtle hover ring when not selected
                outline: !selected ? '0px solid transparent' : 'none',
                transition: 'box-shadow 0.15s',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelected(true);
                if (selected) startDrag('move', e);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(true);
              }}
            >
              {isVideo ? (
                <video src={previewUrl} autoPlay loop muted playsInline
                  style={{ width:'100%', height:'100%', objectFit:'fill', display:'block' }} draggable={false} />
              ) : (
                <img src={previewUrl}
                  style={{ width:'100%', height:'100%', objectFit:'fill', display:'block' }} draggable={false} />
              )}
            </div>

            {/* ── Selection + handles — only when selected ── */}
            {selected && (
              <div
                style={{
                  position: 'absolute',
                  width: dispW, height: dispH,
                  left: cx, top: cy,
                  transform: `translate(-50%,-50%) rotate(${content.rotation}deg)`,
                  pointerEvents: 'none',
                }}
              >
                {/* Selection border */}
                <div style={{
                  position: 'absolute', inset: 0,
                  border: '1.5px solid rgba(99,102,241,0.9)',
                  borderRadius: r,
                  pointerEvents: 'none',
                }} />

                {/* Corner resize handles */}
                <Handle style={{ top: -5, left: -5,   cursor: 'nwse-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
                <Handle style={{ top: -5, right: -5,  cursor: 'nesw-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
                <Handle style={{ bottom: -5, left: -5,  cursor: 'nesw-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
                <Handle style={{ bottom: -5, right: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => startDrag('resize', e)} />

                {/* Rotation handle — above top-center */}
                <div
                  style={{
                    position: 'absolute', top: -40, left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    pointerEvents: 'auto', cursor: 'crosshair',
                  }}
                  onMouseDown={(e) => startDrag('rotate', e)}
                >
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid #6366f1', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }} />
                  <div style={{ width: 1, height: 18, background: 'rgba(99,102,241,0.6)' }} />
                </div>

                {/* Border-radius handle — inside top-right corner */}
                <div
                  title="Border radius"
                  style={{
                    position: 'absolute',
                    top:   Math.max(6, Math.min(r + 4, dispH / 2 - 10)),
                    right: Math.max(6, Math.min(r + 4, dispW / 2 - 10)),
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#6366f1', border: '2px solid white',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    pointerEvents: 'auto', cursor: 'col-resize',
                  }}
                  onMouseDown={(e) => startDrag('radius', e)}
                />

                {/* Shadow handle — below bottom-center */}
                <div
                  title="Shadow"
                  style={{
                    position: 'absolute', bottom: -40, left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    pointerEvents: 'auto', cursor: 'ew-resize',
                  }}
                  onMouseDown={(e) => startDrag('shadow', e)}
                >
                  <div style={{ width: 1, height: 18, background: 'rgba(99,102,241,0.6)' }} />
                  <ShadowIcon active={content.shadow > 0} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <span className="text-xs text-zinc-600">Upload an image or video</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Handle({ style, onMouseDown }: { style: React.CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute', width: 10, height: 10,
        background: 'white', border: '2px solid #6366f1', borderRadius: 2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        ...style,
      }}
    />
  );
}

function ShadowIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? '#6366f1' : 'rgba(99,102,241,0.5)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/>  <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22"   x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1"  y1="12" x2="3"  y2="12"/> <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
    </svg>
  );
}
