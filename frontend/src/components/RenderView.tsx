import { useEffect, useRef, useState } from 'react';
import type { PuppeteerRenderState } from '@mockup-forge/shared';
import { meshToCss } from './MeshEditor';

const BASE = import.meta.env.VITE_API_URL ?? `${import.meta.env.BASE_URL}api`;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function RenderView() {
  const [renderState, setRenderState] = useState<PuppeteerRenderState | null>(null);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(0);
  const totalRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    fetch(`${BASE}/render/state/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`State fetch failed: ${r.status}`);
        return r.json() as Promise<PuppeteerRenderState>;
      })
      .then((data) => {
        loadedRef.current = 0;
        const bgImg = data.background.type === 'image' ? 1 : 0;
        totalRef.current = data.items.length + bgImg;
        if (totalRef.current === 0) setReady(true);
        setRenderState(data);
      })
      .catch(console.error);
  }, []);

  const handleLoad = () => {
    loadedRef.current += 1;
    if (loadedRef.current >= totalRef.current) setReady(true);
  };

  if (!renderState) return null;

  const { items, background, canvasW, canvasH } = renderState;

  let bgCss: React.CSSProperties = {};
  switch (background.type) {
    case 'solid':
      bgCss = { background: background.color || '#1a1a2e' };
      break;
    case 'gradient': {
      const { from = '#1a1a2e', to = '#16213e', direction = 135 } = background.gradient ?? {};
      bgCss = { background: `linear-gradient(${direction}deg,${from},${to})` };
      break;
    }
    case 'mesh':
      bgCss = { background: background.mesh ? meshToCss(background.mesh) : '#0f0c29' };
      break;
    case 'transparent':
      bgCss = { background: 'transparent' };
      break;
    default:
      bgCss = { background: '#1a1a2e' };
  }

  const sortedItems = [...items].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', background: 'transparent', display: 'inline-block' }}>
      <div
        data-export-canvas
        style={{ width: canvasW, height: canvasH, position: 'relative', overflow: 'hidden', ...bgCss }}
      >
        {background.type === 'image' && background.imageFileId && (
          <img
            src={`${BASE}/download/${background.imageFileId}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onLoad={handleLoad}
            onError={handleLoad}
          />
        )}

        {sortedItems.map((item) => {
          const { content, srcW, srcH, fileId, isVideo } = item;
          const shortSide = Math.min(canvasW, canvasH) * 0.8;
          const fitScale = srcW > 0 && srcH > 0 ? Math.min(shortSide / srcW, shortSide / srcH) : 1;
          const dispW = Math.max(4, srcW * fitScale * content.scale);
          const dispH = Math.max(4, srcH * fitScale * content.scale);
          const cx = (content.x / 100) * canvasW;
          const cy = (content.y / 100) * canvasH;

          const br = content.borderRadius;
          const half = Math.min(dispW, dispH) / 2;
          const borderRadiusCss = br.linked
            ? `${Math.min(br.all, half)}px`
            : `${Math.min(br.tl, half)}px ${Math.min(br.tr, half)}px ${Math.min(br.br, half)}px ${Math.min(br.bl, half)}px`;

          const sh = content.shadow;
          const shadowCss = sh.opacity > 0
            ? `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${hexToRgba(sh.color, sh.opacity)}`
            : 'none';

          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                width: dispW,
                height: dispH,
                left: cx,
                top: cy,
                transform: `translate(-50%,-50%) rotate(${content.rotation}deg)`,
                borderRadius: borderRadiusCss,
                overflow: 'hidden',
                opacity: content.opacity,
                boxShadow: shadowCss,
              }}
            >
              {isVideo
                ? (
                  <video
                    src={`${BASE}/download/${fileId}`}
                    autoPlay={false}
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                    onLoadedData={handleLoad}
                    onError={handleLoad}
                  />
                )
                : (
                  <img
                    src={`${BASE}/download/${fileId}`}
                    style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                    onLoad={handleLoad}
                    onError={handleLoad}
                  />
                )}
            </div>
          );
        })}
      </div>

      {ready && <div id="render-ready" />}
    </div>
  );
}
