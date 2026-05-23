import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { TMP_DIR } from '../services/fileManager';

export const downloadRouter = Router();

downloadRouter.get('/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  // Sanitize: no path traversal
  const safe = path.basename(fileId);
  const fp = path.join(TMP_DIR, safe);

  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.sendFile(fp);
});
