import express, { Router } from 'express';
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

// Trust Caddy/nginx proxy so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of crashing
app.set('trust proxy', 1);

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

// ── API routes ────────────────────────────────────────────────────────────────
// Mounted at both /api/* (via Caddy, which strips /moka prefix) and
// /moka/api/* (for Puppeteer, which hits Express directly on localhost).
const apiRouter = Router();
apiRouter.use('/upload', uploadLimiter, uploadRouter);
apiRouter.use('/render', renderLimiter, renderRouter);
apiRouter.use('/download', downloadRouter);
apiRouter.use('/mediainfo', mediainfoRouter);

app.use('/api', apiRouter);
app.use('/moka/api', apiRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Serve built frontend (production) ─────────────────────────────────────────
// Also served under /moka/* so Puppeteer (hitting localhost directly, without
// Caddy stripping the prefix) can load JS assets at /moka/assets/*.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.use('/moka', express.static(frontendDist));
app.get('*', (_req, res) => {
  const index = path.join(frontendDist, 'index.html');
  res.sendFile(index);
});

ensureTmpDir();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${allowedOrigin}`);
});
