import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore — ffprobe-static has no bundled types
import ffprobeStatic from 'ffprobe-static';
import { meanAbsError } from './pixelDiff';
import type {
  MultiRenderPayload, MultiAnimationRenderPayload, ContentOptions, Background, AnimationKeyframe,
} from '@mockup-forge/shared';

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

// ── Export smoke tests: every format must produce a valid, correctly-sized file ─
//
// These guard "does the export actually succeed and yield a usable file?" — the
// class of failure we hit repeatedly (FFmpeg filter errors, SIGKILL timeouts,
// wrong dimensions). Rather than pixel baselines (fragile for motion), they
// assert structural validity: a decodable file of the requested size/duration.

interface Mp4Info { durationSec: number; width: number; height: number; hasVideo: boolean }

function probeMp4(file: string): Promise<Mp4Info> {
  return new Promise((resolve, reject) => {
    const bin = (ffprobeStatic as { path: string }).path;
    const proc = spawn(bin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      try {
        const j = JSON.parse(out) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }> };
        const v = (j.streams ?? []).find((s) => s.codec_type === 'video');
        resolve({
          durationSec: Number(j.format?.duration ?? v?.duration ?? 0),
          width: v?.width ?? 0, height: v?.height ?? 0, hasVideo: !!v,
        });
      } catch (e) { reject(e as Error); }
    });
  });
}

async function renderAnimationToFile(payload: MultiAnimationRenderPayload): Promise<string> {
  const res = await fetch(`${API}/render/animation`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`animation render failed: ${res.status} ${await res.text()}`);
  const { fileId } = await res.json() as { fileId: string };
  const dl = await fetch(`${API}/download/${fileId}`);
  if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
  const outPath = path.join(os.tmpdir(), `anim_${fileId}`);
  fs.writeFileSync(outPath, Buffer.from(await dl.arrayBuffer()));
  return outPath;
}

const skipOpt = { skip: RUN ? false : 'set RUN_VISUAL=1 (needs running app + Chrome)' };

// Scale-in over the first 0.5s, then hold — a minimal but real keyframe animation.
const scaleInKeyframes: AnimationKeyframe[] = [
  { id: 'k0', time: 0,   easing: 'ease-out', props: { x: 50, y: 50, scale: 0.5, rotation: 0, opacity: 1, borderRadius: 0 } },
  { id: 'k1', time: 0.5, easing: 'linear',   props: { x: 50, y: 50, scale: 1,   rotation: 0, opacity: 1, borderRadius: 0 } },
];

// ── Photos: JPG ──
test('JPG export is a valid JPEG of the requested size', skipOpt, async () => {
  const payload: MultiRenderPayload = {
    items: [{ id: 'a', fileId, isVideo: false, srcW: SRC, srcH: SRC, content: centred, zIndex: 0 }],
    background: { type: 'solid', color: '#101014' },
    canvas: { ratio: 'custom', width: SRC, height: SRC },
    format: 'jpg', resolution: '1x',
  };
  const out = await renderToFile(payload);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg', 'output is JPEG');
  assert.equal(meta.width, SRC);
  assert.equal(meta.height, SRC);
});

// ── Animation: image keyframes → universal per-frame path ──
test('animation export (image keyframes) yields a valid MP4', skipOpt, async () => {
  const payload: MultiAnimationRenderPayload = {
    items: [{ id: 'a', fileId, isVideo: false, srcW: SRC, srcH: SRC, content: centred, zIndex: 0, keyframes: scaleInKeyframes }],
    background: { type: 'solid', color: '#101014' },
    canvas: { ratio: 'custom', width: SRC, height: SRC },
    duration: 1, fps: 30,
  };
  const out = await renderAnimationToFile(payload);
  const info = await probeMp4(out);
  assert.ok(info.hasVideo, 'MP4 has a video stream');
  assert.equal(info.width, SRC);
  assert.equal(info.height, SRC);
  assert.ok(Math.abs(info.durationSec - 1) < 0.2, `duration ~1s (got ${info.durationSec.toFixed(3)})`);
});

// ── Animation: video keyframes + static hold → split path (mask + concat) ──
test('animation export (video + hold, split path) yields a valid MP4', skipOpt, async () => {
  // Rounded corners exercise the alpha-mask branch of the split renderer.
  const content: ContentOptions = {
    ...centred, scale: 0.8,
    borderRadius: { linked: true, all: 0.2, tl: 0.2, tr: 0.2, br: 0.2, bl: 0.2 },
  };
  const payload: MultiAnimationRenderPayload = {
    items: [{ id: 'v', fileId: videoFileId, isVideo: true, srcW: 320, srcH: 240, content, zIndex: 0, keyframes: scaleInKeyframes }],
    background: { type: 'solid', color: '#101014' },
    canvas: { ratio: 'custom', width: SRC, height: SRC },
    duration: 1, fps: 30, // 0.5s animated span + 0.5s hold (video is 1s) → triggers the split path
  };
  const out = await renderAnimationToFile(payload);
  const info = await probeMp4(out);
  assert.ok(info.hasVideo, 'MP4 has a video stream');
  assert.equal(info.width, SRC);
  assert.equal(info.height, SRC);
  assert.ok(Math.abs(info.durationSec - 1) < 0.3, `duration ~1s (got ${info.durationSec.toFixed(3)})`);
});
