import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TMP_DIR } from '../services/fileManager';
import type { UploadResponse } from '@mockup-forge/shared';

const storage = multer.diskStorage({
  destination: TMP_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/png', 'image/jpeg', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm',
      'video/x-matroska', 'video/matroska', // .mkv
    ];
    // Some browsers/OS report .mkv with a generic mimetype — allow by extension too
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    cb(null, allowed.includes(file.mimetype) || ext === 'mkv');
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded or unsupported type' });
    return;
  }

  const response: UploadResponse = {
    fileId: req.file.filename,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    isVideo: req.file.mimetype.startsWith('video/'),
  };

  res.json(response);
});
