import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

// ── Security headers ──────────────────────────────────────────────────────────
// nosniff, Referrer-Policy, etc. via helmet defaults, plus:
//  • CSP: allows same-origin scripts/styles/fonts + blob: for local media
//    previews (URL.createObjectURL) + unsafe-inline for React inline styles.
//    No external origins are permitted.
//  • frame-ancestors 'none' (CSP) + X-Frame-Options: DENY — double-locks
//    clickjacking since CSP takes precedence in modern browsers.
//  • CORP cross-origin: lets the render view (served same-origin in production,
//    different port in dev) load uploaded media from the download endpoint.
//  • COEP is disabled: enabling it requires CORP on every served resource;
//    leaving it off avoids breaking existing behaviour while CSP is the primary
//    defence layer.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "blob:", "data:"],
      mediaSrc:       ["'self'", "blob:"],
      fontSrc:        ["'self'"],
      connectSrc:     ["'self'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
}));

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
  // Only throttle user-triggered POST renders. The GET /render/state/:token
  // endpoint is polled once per frame by the internal Puppeteer renderer, so a
  // single animation/video export legitimately makes hundreds of GETs — those
  // must not count against the limit.
  skip: (req) => req.method === 'GET',
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

// ── Security startup checks ───────────────────────────────────────────────────
if (!process.env.RENDER_TOKEN) {
  const msg = '[security] RENDER_TOKEN is not set — render endpoints are open to the network.';
  if (process.env.NODE_ENV === 'production') {
    console.error(msg + ' Set RENDER_TOKEN in your environment before deploying.');
  } else {
    console.warn(msg + ' Acceptable for local dev.');
  }
}

if (process.env.PUPPETEER_NO_SANDBOX === 'true') {
  console.warn('[security] PUPPETEER_NO_SANDBOX=true — Chrome sandbox is disabled. Only do this when running as root in a container.');
}

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`CORS allowed origin: ${allowedOrigin}`);
});
