// ─────────────────────────────────────────────────────────────────────────────
// Unified frame-based MP4 renderer.
//
// Every MP4 (single video OR keyframe animation) is produced by capturing the
// SAME browser scene (RenderView, via Puppeteer) once per frame and encoding the
// PNG sequence with FFmpeg. FFmpeg no longer composites the scene — it only
// encodes frames and muxes the original audio. This guarantees the export is
// pixel-identical to the live preview, because both render through one engine.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore — ffprobe-static has no bundled types
import ffprobeStatic from 'ffprobe-static';
import { tmpPath } from './fileManager';
import { captureFrameSequence } from './puppeteerRenderer';
import type {
  PuppeteerRenderState, PuppeteerItem, Background, CanvasConfig,
} from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

// ── Canvas sizes (single source for every renderer) ───────────────────────────

export const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 },
  '4:5':  { w: 1080, h: 1350 }, '9:16': { w: 1080, h: 1920 },
  '4:3':  { w: 1440, h: 1080 },
  'ig-post': { w: 1080, h: 1080 }, 'ig-portrait': { w: 1080, h: 1350 },
  'ig-landscape': { w: 1080, h: 566 }, 'ig-story': { w: 1080, h: 1920 },
  'x-post': { w: 1200, h: 675 }, 'x-banner': { w: 1500, h: 500 },
  'x-profile': { w: 400, h: 400 }, 'yt-thumbnail': { w: 1280, h: 720 },
  'yt-banner': { w: 2560, h: 1440 }, 'fb-post': { w: 1200, h: 630 },
  'fb-cover': { w: 820, h: 312 }, 'li-banner': { w: 1584, h: 396 },
  'li-post': { w: 1200, h: 627 }, 'profile-pic': { w: 800, h: 800 },
};

export function getCanvasSize(canvas: CanvasConfig): { w: number; h: number } {
  if (canvas.ratio === 'custom') return { w: canvas.width || 1080, h: canvas.height || 1080 };
  return CANVAS_SIZES[canvas.ratio] ?? CANVAS_SIZES['1:1'];
}

export function resolutionScale(resolution?: '1x' | '2x' | '3x'): number {
  return resolution === '3x' ? 3 : resolution === '2x' ? 2 : 1;
}

// ── Media probing ─────────────────────────────────────────────────────────────

export interface MediaInfo { width: number; height: number; duration: number; hasAudio: boolean; fps: number }

function parseFps(rate?: string): number {
  if (!rate) return 0;
  const [n, d] = rate.split('/').map(Number);
  if (!n) return 0;
  return d ? n / d : n;
}

export function probeMedia(fileId: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tmpPath(fileId), (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      const hasAudio = data.streams.some((s) => s.codec_type === 'audio');
      const duration = Number(data.format?.duration ?? v?.duration ?? 0) || 0;
      const fps = parseFps(v?.avg_frame_rate) || parseFps(v?.r_frame_rate) || 30;
      resolve({ width: v?.width ?? 0, height: v?.height ?? 0, duration, hasAudio, fps });
    });
  });
}

// ── Core ──────────────────────────────────────────────────────────────────────

export interface FrameRenderOptions {
  items: PuppeteerItem[];
  background: Background;
  canvas: CanvasConfig;
  canvasW: number;
  canvasH: number;
  durationSec: number;
  fps: number;
  /** fileId whose audio track is muxed into the output (optional). */
  audioFromFile?: string;
}

export async function renderFrames(opts: FrameRenderOptions): Promise<string> {
  const { items, background, canvas, canvasW, canvasH, durationSec, fps, audioFromFile } = opts;
  const totalFrames = Math.max(2, Math.round(durationSec * fps));

  const frameDir = tmpPath(`frames_${uuidv4()}`);
  fs.mkdirSync(frameDir, { recursive: true });

  // All timeline positions, captured in parallel (each page loads the video once).
  const times = Array.from({ length: totalFrames }, (_, i) =>
    totalFrames > 1 ? (i / (totalFrames - 1)) * durationSec : 0);
  const baseState: PuppeteerRenderState = { items, background, canvas, canvasW, canvasH, time: times[0] };

  // Each parallel page streams the scene's video over HTTP; multiple at once
  // starve Chrome's per-host connection budget and abort the load. So when the
  // scene has any video, capture single-threaded (one page, video loaded once) —
  // reliable over fast. Pure-image animations keep the parallel default.
  const hasVideo = items.some((it) => it.isVideo);
  const captured = await captureFrameSequence(baseState, times, {
    frameDir, ext: 'jpg', quality: 95,
    concurrency: hasVideo ? 1 : undefined,
    onProgress: (d, t) => console.log(`[frameRenderer] captured ${d}/${t} frames`),
  });

  console.log(`[frameRenderer] frameDir=${frameDir} frames=${captured} audio=${audioFromFile ?? 'none'}`);
  if (captured === 0) throw new Error('No frames were rendered');

  const outputFilename = `vid_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg().input(`${frameDir}/frame%06d.jpg`).inputFPS(fps);
    if (audioFromFile) cmd = cmd.input(tmpPath(audioFromFile));

    cmd
      .videoCodec('libx264')
      .videoFilter('scale=trunc(iw/2)*2:trunc(ih/2)*2')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-crf 18',
        // Pin colour metadata so players interpret the YUV the same way.
        '-colorspace bt709', '-color_primaries bt709', '-color_trc bt709',
        '-movflags +faststart',
        `-r ${fps}`,
        ...(audioFromFile ? ['-map 0:v', '-map 1:a?', '-c:a aac', '-shortest'] : ['-map 0:v']),
      ])
      .output(outputPath)
      .on('stderr', (line: string) => console.log('[ffmpeg]', line))
      .on('end', () => resolve())
      .on('error', (err: Error) => { console.error('[ffmpeg error]', err.message); reject(err); })
      .run();
  });

  fs.rmSync(frameDir, { recursive: true, force: true });
  return outputFilename;
}
