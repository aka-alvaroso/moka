import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { TMP_DIR } from '../services/fileManager';

// Explicit allowlist — rejects any extension that could render as HTML/JS in a browser.
const SAFE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

export const downloadRouter = Router();

downloadRouter.get('/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const safe = path.basename(fileId);

  const ext = path.extname(safe).slice(1).toLowerCase();
  const contentType = SAFE_CONTENT_TYPES[ext];
  if (!contentType) {
    res.status(400).json({ error: 'Invalid file type' });
    return;
  }

  const fp = path.join(TMP_DIR, safe);
  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Set Content-Type before sendFile so Express does not override it from the path extension.
  // attachment prevents browsers from rendering the response inline (blocks stored XSS).
  // nosniff prevents MIME-sniffing bypasses in older browsers.
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(fp);
});
