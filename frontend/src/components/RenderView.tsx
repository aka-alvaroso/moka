import { useEffect, useRef, useState } from 'react';
import type { PuppeteerRenderState, PuppeteerItem } from '@mockup-forge/shared';
import { backgroundCss, computeItemLayout, applyAnimatedProps, shadowCss } from '../render/layout';
import { interpolateProps } from '../lib/interpolate';

const BASE = import.meta.env.VITE_API_URL ?? `${import.meta.env.BASE_URL}api`;

// ── Off-screen render target captured by Puppeteer ────────────────────────────
//
// Renders the EXACT same scene as the live preview via the shared `layout`
// module. Two capture modes share one page:
//   • Single shot (PNG/JPG): backend waits for #render-ready, screenshots once.
//   • Frame sequence (MP4):   backend calls window.__mokaRenderFrame(t) per frame
//     — the video loads ONCE and we only re-seek + re-interpolate per frame, so a
//     150-frame export is one page load and one download, not 150 of each.

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

// Seek a <video> to `t` (clamped to its duration) and resolve once the frame is
// actually presented. Resolves immediately if already on that frame.
function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(v.duration) ? v.duration : Infinity;
    const target = Math.min(t, Math.max(0, dur - 1e-3));
    if (Math.abs(v.currentTime - target) < 1 / 240) return resolve();
    const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
    v.addEventListener('seeked', onSeeked);
    v.currentTime = target;
  });
}

export function RenderView() {
  const [renderState, setRenderState] = useState<PuppeteerRenderState | null>(null);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);

  const timeRef = useRef(0);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const loadedRef = useRef(0);
  const totalRef = useRef(0);

  // index.css paints body black; clear it so Puppeteer's omitBackground can
  // capture transparent "top plate" screenshots (layers above a video). This
  // page is only ever the off-screen export target, so it's always safe.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    fetch(`${BASE}/render/state/${token}`)
      .then((r) => { if (!r.ok) throw new Error(`State fetch failed: ${r.status}`); return r.json() as Promise<PuppeteerRenderState>; })
      .then((data) => {
        const t0 = data.time ?? 0;
        timeRef.current = t0;
        setTime(t0);
        loadedRef.current = 0;
        // Plate-mode items (hideMedia) render no asset, so they don't count.
        totalRef.current = data.items.filter((it) => !it.hideMedia).length + (data.background.type === 'image' ? 1 : 0);
        setRenderState(data);
        if (totalRef.current === 0) finalizeInitial();
      })
      .catch(console.error);
  }, []);

  // All assets reported in → seek videos to the first frame, then signal ready.
  const finalizeInitial = async () => {
    await Promise.all([...videosRef.current.values()].map((v) => seekVideo(v, timeRef.current)));
    setReady(true);
  };

  const handleAssetLoad = () => {
    loadedRef.current += 1;
    if (loadedRef.current >= totalRef.current) finalizeInitial();
  };

  // Expose the per-frame controller once the scene is ready.
  useEffect(() => {
    if (!ready) return;
    (window as Window & typeof globalThis & { __mokaRenderFrame?: (t: number) => Promise<void>; __mokaReady?: boolean })
      .__mokaRenderFrame = async (t: number) => {
        timeRef.current = t;
        // Re-render interpolated transforms, then seek every video to t, then paint.
        await new Promise<void>((resolve) => { setTime(t); requestAnimationFrame(() => requestAnimationFrame(() => resolve())); });
        await Promise.all([...videosRef.current.values()].map((v) => seekVideo(v, t)));
        await raf();
      };
    (window as Window & typeof globalThis & { __mokaReady?: boolean }).__mokaReady = true;
  }, [ready]);

  if (!renderState) return null;

  const { items, background, canvasW, canvasH } = renderState;
  const sortedItems = [...items].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', background: 'transparent', display: 'inline-block' }}>
      <div data-export-canvas style={{ width: canvasW, height: canvasH, position: 'relative', overflow: 'hidden', ...backgroundCss(background, 'alpha') }}>
        {background.type === 'image' && background.imageFileId && (
          <img
            src={`${BASE}/download/${background.imageFileId}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onLoad={handleAssetLoad}
            onError={handleAssetLoad}
          />
        )}

        {sortedItems.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            canvasW={canvasW}
            canvasH={canvasH}
            time={time}
            registerVideo={(el) => { if (el) videosRef.current.set(item.id, el); else videosRef.current.delete(item.id); }}
            onAssetLoad={handleAssetLoad}
          />
        ))}
      </div>

      {ready && <div id="render-ready" />}
    </div>
  );
}

// ── Single item ───────────────────────────────────────────────────────────────

function ItemView({ item, canvasW, canvasH, time, registerVideo, onAssetLoad }: {
  item: PuppeteerItem;
  canvasW: number;
  canvasH: number;
  time: number;
  registerVideo: (el: HTMLVideoElement | null) => void;
  onAssetLoad: () => void;
}) {
  const { content, srcW, srcH, fileId, isVideo, keyframes, hideMedia } = item;

  // Interpolate exactly like the preview when this item is animated.
  const anim = keyframes && keyframes.length >= 2 ? interpolateProps(keyframes, time) : null;
  const live = applyAnimatedProps(content, anim);
  const { dispW, dispH, cx, cy, borderRadiusCss } = computeItemLayout(live, srcW, srcH, canvasW, canvasH);

  return (
    <div
      style={{
        position: 'absolute',
        width: dispW, height: dispH, left: cx, top: cy,
        transform: `translate(-50%,-50%) rotate(${live.rotation}deg)`,
        borderRadius: borderRadiusCss,
        overflow: 'hidden',
        opacity: live.opacity,
        boxShadow: shadowCss(live.shadow),
      }}
    >
      {hideMedia
        ? null
        : isVideo
        ? (
          <video
            ref={registerVideo}
            src={`${BASE}/download/${fileId}`}
            autoPlay={false}
            muted
            playsInline
            preload="auto"
            onLoadedData={onAssetLoad}
            onError={onAssetLoad}
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          />
        )
        : (
          <img
            src={`${BASE}/download/${fileId}`}
            onLoad={onAssetLoad}
            onError={onAssetLoad}
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
          />
        )}
    </div>
  );
}
