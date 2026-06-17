import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { TMP_DIR, enforceDiskBudget } from '../services/fileManager';
import type { UploadResponse } from '@mockup-forge/shared';

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'webm', 'mkv']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv']);

// Validates actual file content against expected magic bytes — not client-supplied mimetype.
function hasValidMagicBytes(filePath: string, ext: string): boolean {
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, 12, 0);
    } finally {
      fs.closeSync(fd);
    }
    switch (ext) {
      case 'png':
        return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      case 'jpg':
      case 'jpeg':
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      case 'webp':
        return buf.slice(0, 4).toString('ascii') === 'RIFF' &&
               buf.slice(8, 12).toString('ascii') === 'WEBP';
      case 'mp4':
      case 'mov':
        // ftyp box at offset 4 (present in virtually all modern MP4/MOV files)
        return buf.slice(4, 8).toString('ascii') === 'ftyp';
      case 'webm':
      case 'mkv':
        return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: TMP_DIR,
  filename: (_req, file, cb) => {
    // ext is already validated by fileFilter to be in ALLOWED_EXTENSIONS
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, `${uuidv4()}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    cb(null, ALLOWED_EXTENSIONS.has(ext));
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded or unsupported type' });
    return;
  }

  const ext = path.extname(req.file.filename).slice(1).toLowerCase();
  if (!hasValidMagicBytes(req.file.path, ext)) {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'File content does not match its declared extension' });
    return;
  }

  // Keep the tmp dir under its size budget (evicts oldest files if a burst of
  // large uploads would otherwise fill the disk before the periodic sweep).
  enforceDiskBudget();

  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const response: UploadResponse = {
    fileId: req.file.filename,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    isVideo,
  };

  res.json(response);
});
