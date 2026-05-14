import { Router } from 'express';
import { renderImage } from '../services/imageRenderer';
import { renderVideo } from '../services/videoRenderer';
import type { RenderPayload } from '@mockup-forge/shared';

export const renderRouter = Router();

// Unified render endpoint — format drives the pipeline
renderRouter.post('/', async (req, res) => {
  const payload = req.body as RenderPayload;

  if (!payload.fileId || !payload.format) {
    res.status(400).json({ error: 'Missing fileId or format' });
    return;
  }

  try {
    let outputFilename: string;

    if (payload.format === 'mp4') {
      outputFilename = await renderVideo(payload);
    } else {
      outputFilename = await renderImage(payload);
    }

    res.json({
      fileId: outputFilename,
      downloadUrl: `/api/download/${outputFilename}`,
    });
  } catch (err) {
    console.error('[render]', err);
    res.status(500).json({ error: 'Render failed', detail: String(err) });
  }
});
