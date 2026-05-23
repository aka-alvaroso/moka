import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { EditorState } from '../hooks/useEditor';
import type { CanvasRatio, ExportFormat } from '@mockup-forge/shared';
import { renderExport, renderAnimationExport, downloadUrl } from '../lib/api';

const CANVAS_SIZES: Record<CanvasRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 }, '4:5': { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 }, '4:3': { w: 1440, h: 1080 }, 'custom': { w: 1080, h: 1080 },
  'ig-post': { w: 1080, h: 1080 }, 'ig-portrait': { w: 1080, h: 1350 },
  'ig-landscape': { w: 1080, h: 566 }, 'ig-story': { w: 1080, h: 1920 },
  'x-post': { w: 1200, h: 675 }, 'x-banner': { w: 1500, h: 500 }, 'x-profile': { w: 400, h: 400 },
  'yt-thumbnail': { w: 1280, h: 720 }, 'yt-banner': { w: 2560, h: 1440 },
  'fb-post': { w: 1200, h: 630 }, 'fb-cover': { w: 820, h: 312 },
  'li-banner': { w: 1584, h: 396 }, 'li-post': { w: 1200, h: 627 }, 'profile-pic': { w: 400, h: 400 },
};

const ACCENT = '#e94f37';
type Resolution = '1x' | '2x' | '3x';

interface Props {
  state: EditorState;
  open: boolean;
  onClose: () => void;
}

export function ExportDrawer({ state, open, onClose }: Props) {
  const [resolution, setResolution] = useState<Resolution>('2x');
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasItems = state.mediaItems.length > 0;
  const hasVideo = state.mediaItems.some((i) => i.isVideo);
  const hasAnimation = state.mediaItems.some((i) => i.keyframes.length >= 2);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const buildRenderItems = () =>
    state.mediaItems.map((item) => ({
      id: item.id,
      fileId: item.fileId,
      isVideo: item.isVideo,
      srcW: item.srcW,
      srcH: item.srcH,
      content: item.content,
      zIndex: item.zIndex,
    }));

  const trigger = async (fmt: ExportFormat) => {
    if (!hasItems) return;
    setLoading(true);
    try {
      const res = await renderExport({
        items: buildRenderItems(),
        background: state.background,
        canvas: state.canvas,
        format: fmt,
        resolution: fmt === 'mp4' ? '1x' : resolution,
      });
      const a = document.createElement('a');
      a.href = downloadUrl(res.fileId);
      a.download = `moka-export.${fmt}`;
      a.click();
      onClose();
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed. Check backend logs.');
    } finally {
      setLoading(false);
    }
  };

  const triggerAnimation = async () => {
    if (!hasItems) return;
    setLoading(true);
    try {
      const res = await renderAnimationExport({
        items: buildRenderItems().map((item) => {
          const mediaItem = state.mediaItems.find((i) => i.id === item.id)!;
          return { ...item, keyframes: mediaItem.keyframes };
        }),
        background: state.background,
        canvas: state.canvas,
        duration: state.animationDuration,
        fps: state.animationFps,
      });
      const a = document.createElement('a');
      a.href = downloadUrl(res.fileId);
      a.download = 'moka-animation.mp4';
      a.click();
      onClose();
    } catch (err) {
      console.error('Animation export failed', err);
      alert('Animation export failed. Check backend logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, background: '#fff', borderRadius: 20, boxShadow: '0 16px 56px rgba(0,0,0,0.35)',
            padding: '18px 20px', width: 320, display: 'flex', flexDirection: 'column', gap: 14, color: '#111',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Export</p>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#aaa', display: 'flex' }}>
              <CloseIcon />
            </button>
          </div>

          {hasVideo && !hasAnimation ? (
            <button onClick={() => trigger('mp4')} disabled={loading} style={triggerBtnStyle(loading)}>
              {loading ? 'Rendering…' : 'Export MP4'}
            </button>
          ) : (
            <>
              {/* Resolution */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Resolution</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['1x', '2x', '3x'] as Resolution[]).map((r) => {
                    const base = CANVAS_SIZES[state.canvas.ratio] ?? CANVAS_SIZES['1:1'];
                    const mult = r === '1x' ? 1 : r === '2x' ? 2 : 3;
                    const label = r === '1x' ? 'Standard' : r === '2x' ? 'High' : 'Ultra';
                    return (
                      <button key={r} onClick={() => setResolution(r)} style={optionBtnStyle(resolution === r)}>
                        <span style={{ fontWeight: 700 }}>{label}</span>
                        <span style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>{base.w * mult}×{base.h * mult}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Format</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['png', 'jpg'] as const).map((f) => (
                    <button key={f} onClick={() => setFormat(f)} style={optionBtnStyle(format === f)}>
                      <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{f}</span>
                      <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.6 }}>{f === 'png' ? 'Lossless' : 'Compressed'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => trigger(format)} disabled={loading} style={triggerBtnStyle(loading)}>
                {loading ? 'Rendering…' : `Export ${format.toUpperCase()} — ${resolution === '1x' ? 'Standard' : resolution === '2x' ? 'High' : 'Ultra'}`}
              </button>

              {hasAnimation && (
                <>
                  <div style={{ borderTop: '1px solid #f0f0f0', margin: '2px 0' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={labelStyle}>Animation</span>
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {state.animationDuration}s · {state.animationFps} fps
                    </span>
                  </div>
                  <button onClick={triggerAnimation} disabled={loading} style={{ ...triggerBtnStyle(loading), background: '#111' }}>
                    {loading ? 'Rendering…' : 'Export Animation MP4'}
                  </button>
                </>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#aaa',
};

function optionBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    fontSize: 12, fontWeight: 600,
    background: active ? '#111' : '#f3f3f3', color: active ? '#fff' : '#555',
    transition: 'background 0.12s, color 0.12s',
  };
}

function triggerBtnStyle(loading: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
    fontSize: 13, fontWeight: 900, letterSpacing: '0.01em',
    background: ACCENT, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s',
  };
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
