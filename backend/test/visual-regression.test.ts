import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { meanAbsError } from './pixelDiff';
import type { MultiRenderPayload, ContentOptions, Background } from '@mockup-forge/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Golden-frame visual regression — REAL end-to-end integration.
//
// Drives the actual production HTTP pipeline against a running backend:
//   POST /upload → POST /render (Puppeteer screenshots RenderView, which renders
//   through the shared layout module) → GET /download → diff vs committed
//   baseline. Any drift between what the preview shows and what is exported
//   surfaces here automatically.
//
// Opt-in (needs the app running with Chrome available):
//   1. Start the app:        pnpm dev
//   2. Seed baselines once:   RUN_VISUAL=1 UPDATE_BASELINES=1 pnpm --filter @mockup-forge/backend test
//   3. Thereafter guard:      RUN_VISUAL=1 pnpm --filter @mockup-forge/backend test
//
// Baselines are environment-specific (Chrome version / font AA). Item geometry is
// additionally locked, browser-free, by frontend/src/render/layout.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const RUN = process.env.RUN_VISUAL === '1';
const UPDATE = process.env.UPDATE_BASELINES === '1';
const API = process.env.RENDER_API ?? 'http://localhost:3001/api';
const TOLERANCE = 2.0; // mean abs error per channel (0–255)

const BASELINE_DIR = path.join(__dirname, 'baselines');
const SRC = 256; // test image + canvas size (small, fast, deterministic)

// Deterministic test asset: four solid quadrants → unambiguous geometry/rotation.
async function makeTestImage(): Promise<Buffer> {
  const half = SRC / 2;
  const quad = (r: number, g: number, b: number) =>
    sharp({ create: { width: half, height: half, channels: 3, background: { r, g, b } } }).png().toBuffer();
  const [tl, tr, bl, br] = await Promise.all([
    quad(233, 79, 55), quad(99, 102, 241), quad(16, 185, 129), quad(245, 158, 11),
  ]);
  return sharp({ create: { width: SRC, height: SRC, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: tl, left: 0, top: 0 }, { input: tr, left: half, top: 0 },
      { input: bl, left: 0, top: half }, { input: br, left: half, top: half },
    ]).png().toBuffer();
}

async function uploadAsset(buf: Buffer, name: string, type: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  const res = await fetch(`${API}/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return (await res.json() as { fileId: string }).fileId;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic as unknown as string, args);
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

// Synthesise a tiny H.264 clip so the MP4 golden is self-contained.
async function makeTestVideo(): Promise<Buffer> {
  const out = path.join(os.tmpdir(), `moka_testvid_${Date.now()}.mp4`);
  await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out]);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return buf;
}

async function extractFrame0(mp4Path: string): Promise<string> {
  const out = path.join(os.tmpdir(), `moka_frame0_${Date.now()}.png`);
  await runFfmpeg(['-y', '-i', mp4Path, '-vf', 'select=eq(n\\,0)', '-vframes', '1', out]);
  return out;
}

async function renderToFile(payload: MultiRenderPayload): Promise<string> {
  const res = await fetch(`${API}/render`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`render failed: ${res.status} ${await res.text()}`);
  const { fileId } = await res.json() as { fileId: string };
  const dl = await fetch(`${API}/download/${fileId}`);
  if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
  const out = path.join(os.tmpdir(), `visual_${fileId}`);
  fs.writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
  return out;
}

const centred: ContentOptions = {
  scale: 1, x: 50, y: 50, rotation: 0, opacity: 1,
  borderRadius: { linked: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 },
  shadow: { color: '#000000', opacity: 0, x: 0, y: 20, blur: 40, spread: 0 },
};

const scenes: { name: string; background: Background; content: ContentOptions }[] = [
  { name: 'solid', background: { type: 'solid', color: '#0f0f0f' }, content: centred },
  { name: 'gradient', background: { type: 'gradient', gradient: { from: '#1a1a2e', to: '#6366f1', direction: 135 } }, content: centred },
  {
    name: 'transform', background: { type: 'solid', color: '#202024' },
    content: {
      ...centred, scale: 0.6, rotation: 20,
      borderRadius: { linked: true, all: 0.3, tl: 0.3, tr: 0.3, br: 0.3, bl: 0.3 },
      shadow: { color: '#000000', opacity: 0.5, x: 0, y: 16, blur: 32, spread: 0 },
    },
  },
];

let fileId = '';
let videoFileId = '';
before(async () => {
  if (!RUN) return;
  fileId = await uploadAsset(await makeTestImage(), 'visual-test.png', 'image/png');
  videoFileId = await uploadAsset(await makeTestVideo(), 'visual-test.mp4', 'video/mp4');
});

for (const scene of scenes) {
  test(`export matches baseline: ${scene.name}`, { skip: RUN ? false : 'set RUN_VISUAL=1 (needs running app + Chrome)' }, async () => {
    const payload: MultiRenderPayload = {
      items: [{ id: 'a', fileId, isVideo: false, srcW: SRC, srcH: SRC, content: scene.content, zIndex: 0 }],
      background: scene.background,
      canvas: { ratio: 'custom', width: SRC, height: SRC },
      format: 'png',
      resolution: '1x',
    };

    const outPath = await renderToFile(payload);
    const baseline = path.join(BASELINE_DIR, `${scene.name}.png`);

    if (UPDATE || !fs.existsSync(baseline)) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.copyFileSync(outPath, baseline);
      console.log(`[visual] seeded baseline ${scene.name}.png`);
      return;
    }

    const mae = await meanAbsError(outPath, baseline);
    assert.ok(mae < TOLERANCE, `${scene.name}: mean abs error ${mae.toFixed(3)} exceeds ${TOLERANCE}`);
  });
}

// ── Hybrid MP4 must match the WYSIWYG render ──────────────────────────────────
//
// The fast video path composites the scene differently (Puppeteer plate + FFmpeg
// overlay) than the per-frame/PNG path. This guards that they agree: frame 0 of
// the hybrid MP4 vs a PNG screenshot of the same scene. The (looser) tolerance
// absorbs the YUV420 colour shift and rounded/rotated edge AA that FFmpeg adds.
const MP4_TOLERANCE = 12.0;

test('hybrid MP4 frame 0 matches WYSIWYG PNG', { skip: RUN ? false : 'set RUN_VISUAL=1 (needs running app + Chrome)' }, async () => {
  const content: ContentOptions = {
    ...centred, scale: 0.8, rotation: 10,
    borderRadius: { linked: true, all: 0.2, tl: 0.2, tr: 0.2, br: 0.2, bl: 0.2 },
    shadow: { color: '#000000', opacity: 0.5, x: 0, y: 16, blur: 32, spread: 0 },
  };
  const base = {
    items: [{ id: 'v', fileId: videoFileId, isVideo: true, srcW: 320, srcH: 240, content, zIndex: 0 }],
    background: { type: 'gradient', gradient: { from: '#1a1a2e', to: '#6366f1', direction: 135 } } as Background,
    canvas: { ratio: 'custom', width: SRC, height: SRC } as MultiRenderPayload['canvas'],
    resolution: '1x' as const,
  };

  const pngPath = await renderToFile({ ...base, format: 'png' });
  const mp4Path = await renderToFile({ ...base, format: 'mp4' });
  const framePath = await extractFrame0(mp4Path);

  const mae = await meanAbsError(framePath, pngPath);
  assert.ok(mae < MP4_TOLERANCE, `hybrid MP4 vs WYSIWYG mean abs error ${mae.toFixed(3)} exceeds ${MP4_TOLERANCE}`);
});
