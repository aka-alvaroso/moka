import { Router } from 'express';
import { renderVideo } from '../services/videoRenderer';
import { renderAnimation } from '../services/animationRenderer';
import { screenshotRenderState } from '../services/puppeteerRenderer';
import { getRenderState } from '../services/renderStateStore';
import { getCanvasSize, resolutionScale } from '../services/frameRenderer';
import type { MultiRenderPayload, MultiAnimationRenderPayload, PuppeteerRenderState } from '@mockup-forge/shared';

export const renderRouter = Router();

// ── GET /state/:token — fetch stored render state ─────────────────────────────

renderRouter.get('/state/:token', (req, res) => {
  const state = getRenderState(req.params.token);
  if (!state) {
    res.status(404).json({ error: 'Token not found or expired' });
    return;
  }
  res.json(state);
});

// ── POST / — static render (PNG/JPG via Puppeteer, MP4 via frame capture) ─────

renderRouter.post('/', async (req, res) => {
  const payload = req.body as MultiRenderPayload;

  if (!payload.items?.length || !payload.format) {
    res.status(400).json({ error: 'Missing items or format' });
    return;
  }

  try {
    let outputFilename: string;

    if (payload.format === 'mp4') {
      // MP4 — full multi-layer scene captured frame-by-frame (WYSIWYG) + audio.
      outputFilename = await renderVideo(payload);
    } else {
      // PNG/JPG — single Puppeteer screenshot of the same scene.
      const baseSize = getCanvasSize(payload.canvas);
      const resScale = resolutionScale(payload.resolution);
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
