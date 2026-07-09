import puppeteer, { type Browser, type Page, type ElementHandle } from 'puppeteer';
import { writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import { storeRenderState } from './renderStateStore';
import type { PuppeteerRenderState } from '@mockup-forge/shared';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  // Web-security / cert / insecure-content flags were removed: the render view is
  // always loaded same-origin from RENDERER_URL, so they only widened the attack
  // surface while decoding untrusted user media inside Chrome.
  //
  // Sandbox is ON by default (the safest posture when rendering untrusted media).
  // Set PUPPETEER_NO_SANDBOX=true ONLY when Chrome genuinely cannot initialise its
  // sandbox — typically when the process runs as root inside a container. Never
  // disable the sandbox on a host where unprivileged user namespaces are available.
  const noSandbox = process.env.PUPPETEER_NO_SANDBOX === 'true';
  const args = ['--disable-dev-shm-usage', '--disable-gpu'];
  if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');

  _browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args,
  });
  return _browser;
}

// In dev, Vite serves the frontend separately (default port 5173). In
// production (NODE_ENV=production — set by the Docker image, and required in
// backend/.env.example for non-Docker deploys), the backend serves the built
// frontend itself, so Puppeteer should hit the backend's own port instead.
const RENDERER_URL = process.env.RENDERER_URL ?? (
  process.env.NODE_ENV === 'production'
    ? `http://localhost:${process.env.PORT || 3001}`
    : 'http://localhost:5173'
);

// Free the shared Chrome instance — called before the long FFmpeg encode of the
// hybrid path so the (idle) browser's RAM is available to ffmpeg on small hosts.
// getBrowser() relaunches lazily on the next render.
export async function closeBrowser(): Promise<void> {
  const b = _browser;
  _browser = null;
  if (b) { try { await b.close(); } catch { /* already gone */ } }
}

export async function screenshotRenderState(
  state: PuppeteerRenderState,
  format: 'png' | 'jpg',
  opts: { omitBackground?: boolean } = {},
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();

  const token = storeRenderState(state);
  const url = `${RENDERER_URL}/render?token=${token}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  // Close the page immediately if the job is cancelled while we navigate / wait.
  const onAbort = () => { page.close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    page.on('console', (msg) => console.log(`[puppeteer:${msg.type()}]`, msg.text()));
    page.on('pageerror', (err) => console.error('[puppeteer:pageerror]', err instanceof Error ? err.message : String(err)));
    page.on('requestfailed', (req) => console.error('[puppeteer:requestfailed]', req.url(), req.failure()?.errorText));

    await page.setViewport({ width: state.canvasW + 200, height: state.canvasH + 200 });
    console.log('[puppeteer] navigating to', url);
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('#render-ready', { timeout: 30_000 });

    signal?.throwIfAborted();

    const element = await page.$('[data-export-canvas]');
    if (!element) throw new Error('Canvas element not found in render view');

    // omitBackground keeps the PNG transparent where the scene has no content —
    // needed for the "top plate" (layers above a video) so it composites cleanly.
    const screenshot = await element.screenshot(
      format === 'jpg'
        ? { type: 'jpeg', quality: 92 }
        : { type: 'png', omitBackground: opts.omitBackground ?? false },
    );

    const ext = format === 'jpg' ? 'jpg' : 'png';
    const outputFilename = `render_${uuidv4()}.${ext}`;
    await writeFile(tmpPath(outputFilename), screenshot);
    return outputFilename;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await page.close().catch(() => {});
  }
}

// Each parallel page streams the scene's video(s) over HTTP and holds the
// connection open. Too many at once starves Chrome's ~6-connections-per-host
// budget and aborts video loads, so keep this conservative (override per host).
const RENDER_CONCURRENCY = Math.max(1, Number(process.env.RENDER_CONCURRENCY ?? 2));

export interface CaptureOptions {
  frameDir: string;
  ext: 'jpg' | 'png';
  quality?: number;          // JPEG quality (ignored for png)
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

// Capture a whole frame sequence into `frameDir` as frame%06d.<ext>.
//
// Frames are split across N parallel pages; each page loads the scene (and its
// video) ONCE and then only re-seeks + screenshots its slice. Output frames are
// written at their global index, so parallelism never reorders them. JPEG is the
// default intermediate — the final H.264/yuv420 encode is lossy anyway, so a q95
// JPEG is visually free while being far cheaper to encode than PNG.
export async function captureFrameSequence(
  state: PuppeteerRenderState,
  times: number[],
  opts: CaptureOptions,
): Promise<number> {
  opts.signal?.throwIfAborted();

  const token = storeRenderState(state);
  const url = `${RENDERER_URL}/render?token=${token}`;
  const workers = Math.min(opts.concurrency ?? RENDER_CONCURRENCY, times.length);
  const browser = await getBrowser();

  let done = 0;
  const total = times.length;

  // Contiguous slices: worker w handles indices [w, w+workers, w+2·workers, …].
  const captureSlice = async (worker: number) => {
    const page = await browser.newPage();

    const onAbort = () => { page.close().catch(() => {}); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      page.on('pageerror', (err) => console.error('[puppeteer:pageerror]', err instanceof Error ? err.message : String(err)));
      page.on('requestfailed', (req) => console.error('[puppeteer:requestfailed]', req.url(), req.failure()?.errorText));

      await page.setViewport({ width: state.canvasW + 200, height: state.canvasH + 200 });
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForFunction('window.__mokaReady === true', { timeout: 60_000 });

      const element = (await page.$('[data-export-canvas]')) as ElementHandle<Element> | null;
      if (!element) throw new Error('Canvas element not found in render view');

      for (let i = worker; i < times.length; i += workers) {
        opts.signal?.throwIfAborted();
        await renderOneFrame(page, element, times[i]);
        const shot = await element.screenshot(
          opts.ext === 'jpg' ? { type: 'jpeg', quality: opts.quality ?? 95 } : { type: 'png' },
        );
        await writeFile(path.join(opts.frameDir, `frame${String(i).padStart(6, '0')}.${opts.ext}`), shot);
        done += 1;
        if (opts.onProgress && (done % 30 === 0 || done === total)) opts.onProgress(done, total);
      }
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
      await page.close().catch(() => {});
    }
  };

  await Promise.all(Array.from({ length: workers }, (_, w) => captureSlice(w)));
  return total;
}

async function renderOneFrame(page: Page, _element: ElementHandle<Element>, time: number): Promise<void> {
  await page.evaluate(
    (t) => (window as unknown as { __mokaRenderFrame: (t: number) => Promise<void> }).__mokaRenderFrame(t),
    time,
  );
}
