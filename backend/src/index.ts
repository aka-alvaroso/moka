import express from 'express';
import cors from 'cors';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { uploadRouter } from './routes/upload';
import { renderRouter } from './routes/render';
import { downloadRouter } from './routes/download';
import { mediainfoRouter } from './routes/mediainfo';
import { ensureTmpDir } from './services/fileManager';

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 30,
  message: { error: 'Too many uploads, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const renderLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 20,
  message: { error: 'Too many render requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '2mb' }));

app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/render', renderLimiter, renderRouter);
app.use('/api/download', downloadRouter);
app.use('/api/mediainfo', mediainfoRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Serve built frontend (production) ─────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  const index = path.join(frontendDist, 'index.html');
  res.sendFile(index);
});

ensureTmpDir();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${allowedOrigin}`);
});
