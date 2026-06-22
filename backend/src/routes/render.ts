import { Router, Request, Response, NextFunction } from 'express';
import { renderVideo } from '../services/videoRenderer';
import { renderAnimation } from '../services/animationRenderer';
import { screenshotRenderState } from '../services/puppeteerRenderer';
import { getRenderState } from '../services/renderStateStore';
import { getCanvasSize, resolutionScale } from '../services/frameRenderer';
import {
  enqueueRender, renderQueueStats,
  QueueFullError, RenderTimeoutError, PayloadValidationError,
} from '../services/renderQueue';
import type { MultiRenderPayload, MultiAnimationRenderPayload, PuppeteerRenderState } from '@mockup-forge/shared';

export const renderRouter = Router();

// ── Optional bearer-token auth ────────────────────────────────────────────────
// Set RENDER_TOKEN in the environment to require callers to present
// "Authorization: Bearer <token>" on every POST render request.
// GET /state/:token is intentionally excluded (internal Puppeteer polling).

const RENDER_TOKEN = process.env.RENDER_TOKEN ?? '';

function requireRenderToken(req: Request, res: Response, next: NextFunction) {
  if (!RENDER_TOKEN) return next();
  const auth = req.headers['authorization'] ?? '';
  if (auth === `Bearer ${RENDER_TOKEN}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Payload limits ────────────────────────────────────────────────────────────
// Configurable via env; defaults chosen for a small single-CPU host.

// Maximum total output pixels (width × height after canvas preset + scale).
// 16 MP covers yt-banner at 2x (5120×2880 = 14.7 MP) while blocking all 3x
// renders of large presets (yt-banner at 3x = 33 MP).
const MAX_CANVAS_MPIX   = Number(process.env.MAX_CANVAS_MPIX    ?? 16);
const MAX_RENDER_DURATION = Number(process.env.MAX_RENDER_DURATION ?? 300); // seconds
const MAX_RENDER_FPS    = Number(process.env.MAX_RENDER_FPS     ?? 60);
const MAX_RENDER_FRAMES = Number(process.env.MAX_RENDER_FRAMES  ?? 3600);
const MAX_RENDER_ITEMS  = Number(process.env.MAX_RENDER_ITEMS   ?? 20);

/**
 * Validates the final rendered pixel count (preset size × resolution scale).
 * This catches both oversized custom canvases and large presets at high scale.
 */
function validateCanvasPixels(payload: { canvas?: MultiRenderPayload['canvas']; resolution?: MultiRenderPayload['resolution'] }): string | null {
  if (payload.canvas?.ratio === 'custom') {
    const w = payload.canvas.width;
    const h = payload.canvas.height;
    if (!Number.isInteger(w) || (w as number) < 100 || (w as number) > 8192 ||
        !Number.isInteger(h) || (h as number) < 100 || (h as number) > 8192) {
      return 'Custom canvas width and height must be integers between 100 and 8192 px';
    }
  }
  const { w, h } = getCanvasSize(payload.canvas as MultiRenderPayload['canvas']);
  const scale = resolutionScale(payload.resolution as MultiRenderPayload['resolution']);
  const totalMpix = (w * scale * h * scale) / 1_000_000;
  if (totalMpix > MAX_CANVAS_MPIX) {
    return `Output canvas too large (${(totalMpix).toFixed(1)} MP; max ${MAX_CANVAS_MPIX} MP). Use a smaller preset or lower resolution.`;
  }
  return null;
}

function validateStaticPayload(payload: MultiRenderPayload): string | null {
  const canvasErr = validateCanvasPixels(payload);
  if (canvasErr) return canvasErr;
  if (!payload.items?.length || !payload.format) return 'Missing items or format';
  if (payload.items.length > MAX_RENDER_ITEMS) return `Too many items (max ${MAX_RENDER_ITEMS})`;
  return null;
}

function validateAnimationPayload(payload: MultiAnimationRenderPayload): string | null {
  const canvasErr = validateCanvasPixels(payload);
  if (canvasErr) return canvasErr;
  if (!payload.items?.length || !payload.duration || !payload.fps) {
    return 'Missing items, duration, or fps';
  }
  if (payload.items.length > MAX_RENDER_ITEMS) return `Too many items (max ${MAX_RENDER_ITEMS})`;
  if (payload.duration > MAX_RENDER_DURATION) return `Duration too long (max ${MAX_RENDER_DURATION}s)`;
  if (payload.fps > MAX_RENDER_FPS) return `FPS too high (max ${MAX_RENDER_FPS})`;
  const frames = Math.ceil(payload.duration * payload.fps);
  if (frames > MAX_RENDER_FRAMES) return `Too many frames (max ${MAX_RENDER_FRAMES})`;
  return null;
}

// ── Queue / error handler ─────────────────────────────────────────────────────

function handleRenderError(err: unknown, res: Response, context: string) {
  if (err instanceof QueueFullError) {
    res.status(503).json({ error: err.message, stats: renderQueueStats() });
    return;
  }
  if (err instanceof RenderTimeoutError) {
    res.status(504).json({ error: err.message });
    return;
  }
  if (err instanceof PayloadValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // Log the full error server-side; return only a generic message so internal
  // paths / FFmpeg command lines never reach the client.
  console.error(`[${context}]`, err);
  res.status(500).json({ error: `${context} failed` });
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

// ── POST / — static render (PNG/JPG via Puppeteer, MP4 via frame capture) ─────

renderRouter.post('/', requireRenderToken, async (req, res) => {
  const payload = req.body as MultiRenderPayload;

  const validationError = validateStaticPayload(payload);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const outputFilename = await enqueueRender(async (signal) => {
      if (payload.format === 'mp4') {
        return renderVideo(payload, signal);
      }

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

      return screenshotRenderState(puppeteerState, payload.format, {}, signal);
    });

    res.json({ fileId: outputFilename, downloadUrl: `/api/download/${outputFilename}` });
  } catch (err) {
    handleRenderError(err, res, 'render');
  }
});

// ── POST /animation — animation MP4 (Puppeteer frames + FFmpeg) ───────────────

renderRouter.post('/animation', requireRenderToken, async (req, res) => {
  const payload = req.body as MultiAnimationRenderPayload;

  const validationError = validateAnimationPayload(payload);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const outputFilename = await enqueueRender((signal) => renderAnimation(payload, signal));
    res.json({ fileId: outputFilename, downloadUrl: `/api/download/${outputFilename}` });
  } catch (err) {
    handleRenderError(err, res, 'render-animation');
  }
});
