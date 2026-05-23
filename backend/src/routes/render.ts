import { Router } from 'express';
import { renderVideo } from '../services/videoRenderer';
import { renderAnimation } from '../services/animationRenderer';
import { screenshotRenderState } from '../services/puppeteerRenderer';
import { getRenderState } from '../services/renderStateStore';
import type { MultiRenderPayload, MultiAnimationRenderPayload, PuppeteerRenderState } from '@mockup-forge/shared';

export const renderRouter = Router();

// ── Canvas sizes ──────────────────────────────────────────────────────────────

const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 },
  '4:5':  { w: 1080, h: 1350 }, '9:16': { w: 1080, h: 1920 },
  '4:3':  { w: 1440, h: 1080 },
  'ig-post': { w: 1080, h: 1080 }, 'ig-portrait': { w: 1080, h: 1350 },
  'ig-landscape': { w: 1080, h: 566 }, 'ig-story': { w: 1080, h: 1920 },
  'x-post': { w: 1200, h: 675 }, 'x-banner': { w: 1500, h: 500 },
  'x-profile': { w: 400, h: 400 }, 'yt-thumbnail': { w: 1280, h: 720 },
  'yt-banner': { w: 2560, h: 1440 }, 'fb-post': { w: 1200, h: 630 },
  'fb-cover': { w: 820, h: 312 }, 'li-banner': { w: 1584, h: 396 },
  'li-post': { w: 1200, h: 627 }, 'profile-pic': { w: 800, h: 800 },
};

function getCanvasSize(canvas: MultiRenderPayload['canvas']): { w: number; h: number } {
  if (canvas.ratio === 'custom') return { w: canvas.width || 1080, h: canvas.height || 1080 };
  return CANVAS_SIZES[canvas.ratio] ?? CANVAS_SIZES['1:1'];
}

// ── GET /state/:token — fetch stored render state ─────────────────────────────

renderRouter.get('/state/:token', (req, res) => {
  const state = getRenderState(req.params.token);
  if (!state) {
    res.status(404).json({ error: 'Token not found or expired' });
    return;
  }
  res.json(state);
});

// ── POST / — static render (PNG/JPG via Puppeteer, MP4 via FFmpeg) ────────────

renderRouter.post('/', async (req, res) => {
  const payload = req.body as MultiRenderPayload;

  if (!payload.items?.length || !payload.format) {
    res.status(400).json({ error: 'Missing items or format' });
    return;
  }

  try {
    let outputFilename: string;

    if (payload.format === 'mp4') {
      // Single-video MP4 — delegate to FFmpeg renderer (fast, preserves audio)
      const item = payload.items[0];
      outputFilename = await renderVideo({
        fileId: item.fileId,
        background: payload.background,
        canvas: payload.canvas,
        content: item.content,
        format: 'mp4',
        resolution: payload.resolution,
      });
    } else {
      // PNG/JPG — Puppeteer (WYSIWYG)
      const baseSize = getCanvasSize(payload.canvas);
      const resScale = payload.resolution === '3x' ? 3 : payload.resolution === '2x' ? 2 : 1;
      const canvasW = baseSize.w * resScale;
      const canvasH = baseSize.h * resScale;

      const puppeteerState: PuppeteerRenderState = {
        items: payload.items.map((item) => ({
          id: item.id,
          fileId: item.fileId,
          isVideo: item.isVideo,
          srcW: item.srcW,
          srcH: item.srcH,
          content: item.content,
          zIndex: item.zIndex,
        })),
        background: payload.background,
        canvas: payload.canvas,
        canvasW,
        canvasH,
      };

      outputFilename = await screenshotRenderState(puppeteerState, payload.format);
    }

    res.json({ fileId: outputFilename, downloadUrl: `/api/download/${outputFilename}` });
  } catch (err) {
    console.error('[render]', err);
    res.status(500).json({ error: 'Render failed', detail: String(err) });
  }
});

// ── POST /animation — animation MP4 (Puppeteer frames + FFmpeg) ───────────────

renderRouter.post('/animation', async (req, res) => {
  const payload = req.body as MultiAnimationRenderPayload;

  if (!payload.items?.length || !payload.duration || !payload.fps) {
    res.status(400).json({ error: 'Missing items, duration, or fps' });
    return;
  }

  try {
    const outputFilename = await renderAnimation(payload);
    res.json({ fileId: outputFilename, downloadUrl: `/api/download/${outputFilename}` });
  } catch (err) {
    console.error('[render-animation]', err);
    res.status(500).json({ error: 'Animation render failed', detail: String(err) });
  }
});
