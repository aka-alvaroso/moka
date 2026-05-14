import { Router } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import { tmpPath } from '../services/fileManager';

export const mediainfoRouter = Router();

mediainfoRouter.get('/:fileId', (req, res) => {
  const filePath = tmpPath(req.params.fileId);

  ffmpeg.ffprobe(filePath, (err, data) => {
    if (err) {
      res.status(404).json({ error: 'Could not probe file' });
      return;
    }
    const stream = data.streams.find((s) => s.codec_type === 'video');
    res.json({
      width:  stream?.width  ?? 0,
      height: stream?.height ?? 0,
    });
  });
});
