import { useRef, useEffect, useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { EditorState } from '../hooks/useEditor';
import type { ContentOptions, MediaItem, AnimatedProps } from '@mockup-forge/shared';
import { meshToCss } from './MeshEditor';
import { uploadFile, fetchMediaInfo } from '../lib/api';

const RATIO_MAP: Record<string, number> = {
  '1:1': 1, '16:9': 16 / 9, '4:5': 4 / 5, '9:16': 9 / 16, '4:3': 4 / 3,
};

function canvasAspectRatio(canvas: { ratio: string; width?: number; height?: number }): number {
  if (canvas.width && canvas.height) return canvas.width / canvas.height;
  return RATIO_MAP[canvas.ratio] ?? 1;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

const SNAP_THRESHOLD = 2.5;

function backgroundCss(bg: EditorState['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid': return { background: bg.color || '#1a1a2e' };
    case 'gradient': {
      const { from = '#1a1a2e', to = '#16213e', direction = 135 } = bg.gradient ?? {};
      return { background: `linear-gradient(${direction}deg,${from},${to})` };
    }
    case 'mesh': return { background: bg.mesh ? meshToCss(bg.mesh) : '#0f0c29' };
    case 'transparent': return { background: 'repeating-conic-gradient(#1c1c1f 0% 25%,#141416 0% 50%) 0 0/20px 20px' };
    default: return { background: '#1a1a2e' };
  }
}

type DragMode = 'move' | 'resize' | 'rotate' | 'radius' | 'shadow' | null;

interface DragState {
  mode: DragMode;
  itemId: string;
  startMx: number; startMy: number;
  startContent: ContentOptions;
  dispW: number; dispH: number;
  centerX: number; centerY: number;
  startAngle: number; startDist: number;
}

interface Props {
  state: EditorState;
  onItemContentChange: (id: string, patch: Partial<ContentOptions>) => void;
  onItemSelected: (id: string | null) => void;
  onItemAdded: (fileId: string, previewUrl: string, isVideo: boolean, w: number, h: number) => void;
  allAnimatedProps: Record<string, AnimatedProps>;
  isAnimating: boolean;
}

export function EditorCanvas({ state, onItemContentChange, onItemSelected, onItemAdded, allAnimatedProps, isAnimating }: Props) {
  const { background, canvas, mediaItems, selectedItemId } = state;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLDivElement>(null);
  const dragRef    = useRef<DragState | null>(null);

  const [container, setContainer] = useState({ w: 600, h: 600 });
  const [guides, setGuides] = useState({ x: false, y: false });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainer({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ratio = canvasAspectRatio(canvas);
  const PAD = 48;
  const avW = Math.max(1, container.w - PAD * 2);
  const avH = Math.max(1, container.h - PAD * 2);
  const cw = avW / avH > ratio ? Math.round(avH * ratio) : avW;
  const ch = Math.round(cw / ratio);

  // ── File drop ─────────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const isMkv = file.name.toLowerCase().endsWith('.mkv');
    const res = await uploadFile(file);
    let dims: { w: number; h: number };
    if (isMkv) {
      const info = await fetchMediaInfo(res.fileId);
      dims = { w: info.width, h: info.height };
    } else {
      dims = await new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('video/')) {
          const v = document.createElement('video');
          v.onloadedmetadata = () => { resolve({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
          v.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
          v.src = url;
        } else {
          const img = new Image();
          img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
          img.src = url;
        }
      });
    }
    const localUrl = isMkv ? `/api/download/${res.fileId}` : URL.createObjectURL(file);
    onItemAdded(res.fileId, localUrl, res.isVideo, dims.w, dims.h);
  }, [onItemAdded]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'video/*': ['.mp4', '.mov', '.webm', '.mkv'] },
    noClick: true, noKeyboard: true,
  });

  // ── Global mouse events ────────────────────────────────────────────────────
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
        const snapX = Math.abs(newX - 50) < SNAP_THRESHOLD;
        const snapY = Math.abs(newY - 50) < SNAP_THRESHOLD;
        setGuides({ x: snapX, y: snapY });
        if (snapX) newX = 50;
        if (snapY) newY = 50;
        onItemContentChange(d.itemId, { x: Math.min(130, Math.max(-30, newX)), y: Math.min(130, Math.max(-30, newY)) });
      } else if (d.mode === 'resize') {
        const newDist = Math.hypot(e.clientX - d.centerX, e.clientY - d.centerY);
        if (d.startDist > 2) {
          onItemContentChange(d.itemId, { scale: Math.max(0.05, Math.min(6, d.startContent.scale * (newDist / d.startDist))) });
        }
      } else if (d.mode === 'rotate') {
        const newAngle = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) * 180 / Math.PI;
        let rot = d.startContent.rotation + (newAngle - d.startAngle);
        while (rot > 180) rot -= 360;
        while (rot < -180) rot += 360;
        if (Math.abs(rot) < 2) rot = 0;
        onItemContentChange(d.itemId, { rotation: Math.round(rot * 2) / 2 });
      } else if (d.mode === 'radius') {
        const dx  = -(e.clientX - d.startMx);
        const max = Math.min(d.dispW, d.dispH) / 2;
        // br.all is stored as a fraction 0–1 (0 = square, 1 = fully circular).
        // Convert to pixels for delta math, then store back as fraction.
        const currentPx = d.startContent.borderRadius.all * max;
        const newPx = Math.max(0, Math.min(max, currentPx + dx * 0.6));
        const val = max > 0 ? newPx / max : 0;
        onItemContentChange(d.itemId, { borderRadius: { ...d.startContent.borderRadius, all: val, tl: val, tr: val, br: val, bl: val } });
      } else if (d.mode === 'shadow') {
        const dx = e.clientX - d.startMx;
        const opacity = Math.round(Math.max(0, Math.min(1, d.startContent.shadow.opacity + dx / 200)) * 100) / 100;
        onItemContentChange(d.itemId, { shadow: { ...d.startContent.shadow, opacity } });
      }
    };

    const onUp = () => { dragRef.current = null; setGuides({ x: false, y: false }); document.body.style.cursor = ''; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onItemContentChange]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const sortedItems = [...mediaItems].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div ref={wrapperRef} className="w-full h-full flex items-center justify-center">
      <div
        ref={canvasRef}
        className="relative overflow-hidden rounded-xl shrink-0"
        style={{ width: cw, height: ch, ...backgroundCss(background) }}
        onMouseDown={() => onItemSelected(null)}
      >
        {/* Drop overlay */}
        <div {...getRootProps()} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <input {...getInputProps()} />
        </div>

        {/* BG image */}
        {background.type === 'image' && background.imageFileId && (
          <img src={`${import.meta.env.BASE_URL}api/download/${background.imageFileId}`}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />
        )}

        {/* Snap guides */}
        {guides.x && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(99,102,241,0.7)', pointerEvents: 'none', boxShadow: '0 0 4px rgba(99,102,241,0.5)' }} />}
        {guides.y && <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(99,102,241,0.7)', pointerEvents: 'none', boxShadow: '0 0 4px rgba(99,102,241,0.5)' }} />}

        {/* Media items */}
        {sortedItems.map((item) => (
          <ItemLayer
            key={item.id}
            item={item}
            cw={cw} ch={ch}
            selected={item.id === selectedItemId}
            animatedProps={allAnimatedProps[item.id] ?? null}
            isAnimating={isAnimating}
            canvasRef={canvasRef}
            dragRef={dragRef}
            onSelect={(e) => { e.stopPropagation(); onItemSelected(item.id); }}
            onContentChange={(patch) => onItemContentChange(item.id, patch)}
          />
        ))}

        {/* Drag-over overlay */}
        {isDragActive && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none', zIndex: 50 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>Drop to add layer</span>
          </div>
        )}

        {/* Empty state */}
        {mediaItems.length === 0 && !isDragActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer" style={{ zIndex: 1, border: `2px dashed rgba(233,79,55,0.35)`, borderRadius: 'inherit' }} onClick={open}>
            <img src={`${import.meta.env.BASE_URL}empty_state.svg`} style={{ width: 200, height: 'auto', opacity: 0.7 }} draggable={false} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#e94f37', fontSize: 13, fontWeight: 500, margin: 0 }}>Drop image or video</p>
              <p style={{ color: 'rgba(233,79,55,0.6)', fontSize: 11, margin: '4px 0 0' }}>PNG · JPG · WebP · MP4 · MKV</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single item layer ─────────────────────────────────────────────────────────

interface LayerProps {
  item: MediaItem;
  cw: number; ch: number;
  selected: boolean;
  animatedProps: AnimatedProps | null;
  isAnimating: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  dragRef: React.MutableRefObject<DragState | null>;
  onSelect: (e: React.MouseEvent) => void;
  onContentChange: (patch: Partial<ContentOptions>) => void;
}

function ItemLayer({ item, cw, ch, selected, animatedProps, isAnimating, canvasRef, dragRef, onSelect, onContentChange }: LayerProps) {
  const live = animatedProps ? {
    ...item.content,
    x: animatedProps.x, y: animatedProps.y, scale: animatedProps.scale,
    rotation: animatedProps.rotation, opacity: animatedProps.opacity,
    borderRadius: { ...item.content.borderRadius, linked: true, all: animatedProps.borderRadius, tl: animatedProps.borderRadius, tr: animatedProps.borderRadius, br: animatedProps.borderRadius, bl: animatedProps.borderRadius },
  } : item.content;

  const shortSide = Math.min(cw, ch) * 0.8;
  const fitScale = item.srcW > 0 && item.srcH > 0 ? Math.min(shortSide / item.srcW, shortSide / item.srcH) : 1;
  const dispW = Math.max(4, item.srcW * fitScale * live.scale);
  const dispH = Math.max(4, item.srcH * fitScale * live.scale);
  const cx = (live.x / 100) * cw;
  const cy = (live.y / 100) * ch;

  const br = live.borderRadius;
  const half = Math.min(dispW, dispH) / 2;
  // br values are fractions 0–1; multiply by half to get actual CSS pixels.
  // This ensures the radius scales correctly at any export resolution.
  const rFrac = br.linked ? br.all : Math.max(br.tl, br.tr, br.br, br.bl);
  const r = rFrac * half;
  const borderRadiusCss = br.linked
    ? `${br.all * half}px`
    : `${br.tl * half}px ${br.tr * half}px ${br.br * half}px ${br.bl * half}px`;

  const sh = live.shadow;
  const shadowCss = sh.opacity > 0
    ? `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${hexToRgba(sh.color, sh.opacity)}`
    : 'none';

  const startDrag = (mode: DragMode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const centerX = rect.left + cx;
    const centerY = rect.top + cy;
    dragRef.current = {
      mode, itemId: item.id, startMx: e.clientX, startMy: e.clientY,
      startContent: { ...item.content },
      dispW, dispH, centerX, centerY,
      startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI,
      startDist: Math.hypot(e.clientX - centerX, e.clientY - centerY),
    };
  };

  const videoEl = item.isVideo ? (
    <video
      src={item.previewUrl}
      autoPlay loop={item.videoEndBehavior === 'loop'}
      muted playsInline
      style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
      draggable={false}
    />
  ) : (
    <img src={item.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} draggable={false} />
  );

  return (
    // Wrapper covers full canvas but must NOT intercept pointer events —
    // only the actual image area and handles should be clickable.
    // Selected items get a high zIndex so their handles always render on top.
    <div style={{ position: 'absolute', inset: 0, zIndex: selected ? 9999 : item.zIndex + 1, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute', width: dispW, height: dispH, left: cx, top: cy,
          transform: `translate(-50%,-50%) rotate(${live.rotation}deg)`,
          borderRadius: borderRadiusCss, overflow: 'hidden',
          opacity: live.opacity, cursor: selected ? 'move' : 'pointer',
          boxShadow: shadowCss,
          transition: animatedProps ? 'none' : 'box-shadow 0.15s',
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => { onSelect(e); startDrag('move', e); }}
      >
        {videoEl}
      </div>

      {selected && (
        <div style={{ position: 'absolute', width: dispW, height: dispH, left: cx, top: cy, transform: `translate(-50%,-50%) rotate(${live.rotation}deg)`, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(99,102,241,0.9)', borderRadius: borderRadiusCss, pointerEvents: 'none' }} />
          <Handle style={{ top: -5, left: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
          <Handle style={{ top: -5, right: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
          <Handle style={{ bottom: -5, left: -5, cursor: 'nesw-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
          <Handle style={{ bottom: -5, right: -5, cursor: 'nwse-resize' }} onMouseDown={(e) => startDrag('resize', e)} />
          {/* Rotation */}
          <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'auto', cursor: 'crosshair' }} onMouseDown={(e) => startDrag('rotate', e)}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'white', border: '2px solid #6366f1', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }} />
            <div style={{ width: 1, height: 18, background: 'rgba(99,102,241,0.6)' }} />
          </div>
          {/* Border radius */}
          <div title="Border radius" style={{ position: 'absolute', top: Math.max(6, Math.min(r + 4, dispH / 2 - 10)), right: Math.max(6, Math.min(r + 4, dispW / 2 - 10)), width: 10, height: 10, borderRadius: '50%', background: '#6366f1', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'auto', cursor: 'col-resize' }} onMouseDown={(e) => startDrag('radius', e)} />
          {/* Shadow */}
          <div title="Shadow" style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'auto', cursor: 'ew-resize' }} onMouseDown={(e) => startDrag('shadow', e)}>
            <div style={{ width: 1, height: 18, background: 'rgba(99,102,241,0.6)' }} />
            <ShadowIcon active={live.shadow.opacity > 0} />
          </div>
        </div>
      )}
    </div>
  );
}

function Handle({ style, onMouseDown }: { style: React.CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div onMouseDown={onMouseDown} style={{ position: 'absolute', width: 10, height: 10, background: 'white', border: '2px solid #6366f1', borderRadius: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.35)', pointerEvents: 'auto', ...style }} />
  );
}

function ShadowIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#6366f1' : 'rgba(99,102,241,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
