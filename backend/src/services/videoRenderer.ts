// Static MP4 export (no keyframe animation).
//
// Two strategies, same WYSIWYG result:
//
//  • HYBRID (fast path, used when there is exactly one video layer and it sits on
//    top): Puppeteer renders the static scene ONCE — background, shadows and any
//    other layers — leaving a transparent hole where the video goes (plate mode).
//    FFmpeg then composites the scaled/rounded/rotated video into that hole using
//    the video's NATIVE frames. No per-frame browser capture → near real-time.
//    Shadow, background and layout come from the shared CSS engine, so the only
//    thing FFmpeg draws is the video fill (mask/rotation), keeping it pixel-close
//    to the preview. A golden MP4 test guards the small edge-AA difference.
//
//  • FRAME CAPTURE (fallback): multi-video, a layer above the video, etc. Captures
//    the whole scene frame-by-frame through the browser (parallelised). Slower but
//    fully general. See frameRenderer.

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import { screenshotRenderState } from './puppeteerRenderer';
import {
  renderFrames, getCanvasSize, resolutionScale, probeMedia,
} from './frameRenderer';
import { computeItemGeometry } from '@mockup-forge/shared';
import type { MultiRenderPayload, PuppeteerItem, PuppeteerRenderState, RenderItem } from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const DEFAULT_FPS = 30;

export async function renderVideo(payload: MultiRenderPayload): Promise<string> {
  const baseSize = getCanvasSize(payload.canvas);
  const resScale = resolutionScale(payload.resolution);
  const canvasW = baseSize.w * resScale;
  const canvasH = baseSize.h * resScale;

  // Output length = longest video layer; audio from the first layer with a track.
  let durationSec = 0;
  let audioFromFile: string | undefined;
  for (const item of payload.items) {
    if (!item.isVideo) continue;
    const info = await probeMedia(item.fileId);
    durationSec = Math.max(durationSec, info.duration);
    if (!audioFromFile && info.hasAudio) audioFromFile = item.fileId;
  }
  if (durationSec <= 0) durationSec = 5;

  // Hybrid fast path: a single video layer that is the top-most layer. Anything
  // rendered above the video would be covered by the FFmpeg overlay, so those
  // cases fall back to the fully general frame-capture renderer.
  const videoLayers = payload.items.filter((i) => i.isVideo);
  const topZ = Math.max(...payload.items.map((i) => i.zIndex));
  const hybridVideo = videoLayers.length === 1 && videoLayers[0].zIndex === topZ
    ? videoLayers[0]
    : null;

  if (hybridVideo) {
    return renderVideoHybrid(payload, hybridVideo, canvasW, canvasH, durationSec, audioFromFile);
  }

  // Fallback — capture the whole scene frame-by-frame (parallelised).
  const items: PuppeteerItem[] = payload.items.map(toPuppeteerItem);
  return renderFrames({
    items,
    background: payload.background,
    canvas: payload.canvas,
    canvasW, canvasH,
    durationSec,
    fps: DEFAULT_FPS,
    audioFromFile,
  });
}

// ── Hybrid renderer ─────────────────────────────────────────────────────────

async function renderVideoHybrid(
  payload: MultiRenderPayload,
  video: RenderItem,
  canvasW: number,
  canvasH: number,
  durationSec: number,
  audioFromFile: string | undefined,
): Promise<string> {
  // 1. Static plate: full scene, but the video shows no media (just its shadow +
  //    a transparent hole). Captured once via the shared CSS engine.
  const plateState: PuppeteerRenderState = {
    items: payload.items.map((it) => ({ ...toPuppeteerItem(it), hideMedia: it.id === video.id })),
    background: payload.background,
    canvas: payload.canvas,
    canvasW, canvasH,
    time: 0,
  };
  const platePng = await screenshotRenderState(plateState, 'png');
  const platePath = tmpPath(platePng);

  // 2. Video geometry — SAME formula as the preview (shared module).
  const g = computeItemGeometry(video.content, video.srcW, video.srcH, canvasW, canvasH);
  const dispW = Math.max(2, Math.round(g.dispW));
  const dispH = Math.max(2, Math.round(g.dispH));
  const radius = Math.round(g.rFrac * g.half);
  const rotation = video.content.rotation || 0;
  const opacity = typeof video.content.opacity === 'number' ? video.content.opacity : 1;

  // 3. Optional rounded-corner mask (alpha-accurate, AA preserved).
  let maskPath: string | null = null;
  if (radius > 0) {
    maskPath = tmpPath(`mask_${uuidv4()}.png`);
    await sharp(Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${dispW}" height="${dispH}">
         <rect width="${dispW}" height="${dispH}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
       </svg>`,
    )).png().toFile(maskPath);
  }

  // 4. Build filter graph: scale → [round] → [opacity] → [rotate] → overlay on plate.
  const filters: string[] = [];
  let v = '[1:v]';
  filters.push(`${v}scale=${dispW}:${dispH},format=rgba[v0]`); v = '[v0]';

  if (maskPath) {
    filters.push(`[2:v]alphaextract[mk]`);
    filters.push(`${v}[mk]alphamerge[v1]`); v = '[v1]';
  }
  if (opacity < 1) {
    filters.push(`${v}colorchannelmixer=aa=${opacity}[vo]`); v = '[vo]';
  }

  let ox: number;
  let oy: number;
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const rotW = Math.ceil(dispW * c + dispH * s);
    const rotH = Math.ceil(dispW * s + dispH * c);
    // FFmpeg rotate: positive radians = clockwise, matching CSS rotate(+deg).
    filters.push(`${v}rotate=${rad}:ow=${rotW}:oh=${rotH}:c=none[vr]`); v = '[vr]';
    ox = Math.round(g.cx - rotW / 2);
    oy = Math.round(g.cy - rotH / 2);
  } else {
    ox = Math.round(g.cx - dispW / 2);
    oy = Math.round(g.cy - dispH / 2);
  }

  // shortest=1 ends the overlay when the VIDEO ends, regardless of audio. Without
  // it the looping plate ([0:v] -loop 1) would drive an infinite output whenever
  // the source has no audio track to bound `-shortest`.
  filters.push(`[0:v]${v}overlay=${ox}:${oy}:shortest=1:format=auto[ov]`);
  filters.push(`[ov]scale=trunc(iw/2)*2:trunc(ih/2)*2[out]`);

  // 5. Encode.
  const outputFilename = `vid_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
      // Bound the looping plate to the video length as a hard safety net on top
      // of overlay shortest=1.
      .input(platePath).inputOptions(['-loop 1', `-t ${durationSec}`])
      .input(tmpPath(video.fileId));
    if (maskPath) cmd.input(maskPath);

    const out = [
      '-map [out]',
      '-c:v libx264', '-crf 18', '-preset fast', '-pix_fmt yuv420p',
      '-colorspace bt709', '-color_primaries bt709', '-color_trc bt709',
      '-movflags +faststart',
      ...(audioFromFile ? ['-map 1:a?', '-c:a aac'] : []),
      '-shortest',
    ];

    cmd
      .complexFilter(filters.join(';'))
      .outputOptions(out)
      .output(outputPath)
      .on('start', (c) => console.log('[hybrid ffmpeg]', c))
      .on('stderr', (line) => console.log('[hybrid ffmpeg]', line))
      .on('end', () => resolve())
      .on('error', (err) => { console.error('[hybrid ffmpeg error]', err.message); reject(err); })
      .run();
  });

  return outputFilename;
}

function toPuppeteerItem(item: RenderItem): PuppeteerItem {
  return {
    id: item.id,
    fileId: item.fileId,
    isVideo: item.isVideo,
    srcW: item.srcW,
    srcH: item.srcH,
    content: item.content,
    zIndex: item.zIndex,
  };
}
