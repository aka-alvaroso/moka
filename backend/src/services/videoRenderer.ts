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
import { screenshotRenderState, closeBrowser } from './puppeteerRenderer';
import {
  renderFrames, getCanvasSize, resolutionScale, probeMedia, FFMPEG_THREADS,
} from './frameRenderer';
import { PayloadValidationError } from './renderQueue';
import { computeItemGeometry } from '@mockup-forge/shared';
import type { MultiRenderPayload, PuppeteerItem, PuppeteerRenderState, RenderItem } from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const DEFAULT_FPS = 30;
const MAX_VIDEO_DURATION = Number(process.env.MAX_RENDER_DURATION ?? 300);

export async function renderVideo(
  payload: MultiRenderPayload,
  signal?: AbortSignal,
): Promise<string> {
  const baseSize = getCanvasSize(payload.canvas);
  const resScale = resolutionScale(payload.resolution);
  const canvasW = baseSize.w * resScale;
  const canvasH = baseSize.h * resScale;

  // Output length = longest video layer; audio from the first layer with a track.
  let durationSec = 0;
  let audioFromFile: string | undefined;
  let videoFps = 30;
  for (const item of payload.items) {
    if (!item.isVideo) continue;
    const info = await probeMedia(item.fileId);
    durationSec = Math.max(durationSec, info.duration);
    videoFps = info.fps;
    if (!audioFromFile && info.hasAudio) audioFromFile = item.fileId;
  }
  if (durationSec <= 0) durationSec = 5;

  if (durationSec > MAX_VIDEO_DURATION) {
    throw new PayloadValidationError(
      `Source video too long for render (max ${MAX_VIDEO_DURATION}s, got ${Math.ceil(durationSec)}s)`,
    );
  }

  // Hybrid fast path: any scene with exactly ONE video layer. Static layers below
  // the video are baked into a bottom plate, static layers above into a top plate,
  // and FFmpeg only composites the video between them — no per-frame browser
  // capture, no streaming the video into N pages. Multi-video scenes still fall
  // back to the fully general frame-capture renderer.
  const videoLayers = payload.items.filter((i) => i.isVideo);
  const hybridVideo = videoLayers.length === 1 ? videoLayers[0] : null;

  if (hybridVideo) {
    return renderVideoHybrid(payload, hybridVideo, canvasW, canvasH, durationSec, videoFps, audioFromFile, signal);
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
    signal,
  });
}

// ── Hybrid renderer ─────────────────────────────────────────────────────────

async function renderVideoHybrid(
  payload: MultiRenderPayload,
  video: RenderItem,
  canvasW: number,
  canvasH: number,
  durationSec: number,
  fps: number,
  audioFromFile: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  // Split the static layers around the video by stacking order.
  const others = payload.items.filter((it) => it.id !== video.id);
  const aboveItems = others.filter((it) => it.zIndex > video.zIndex);
  const belowItems = others.filter((it) => it.zIndex <= video.zIndex);

  // 1a. Bottom plate: background + layers below the video + the video's own shadow
  //     (the video is hidden, leaving a hole the FFmpeg overlay fills).
  const bottomState: PuppeteerRenderState = {
    items: [...belowItems.map(toPuppeteerItem), { ...toPuppeteerItem(video), hideMedia: true }],
    background: payload.background,
    canvas: payload.canvas,
    canvasW, canvasH,
    time: 0,
  };
  const platePath = tmpPath(await screenshotRenderState(bottomState, 'png', {}, signal));

  // 1b. Top plate (only if layers sit above the video): those layers on a
  //     transparent canvas, composited over the video at the very end.
  let topPlatePath: string | null = null;
  if (aboveItems.length > 0) {
    const topState: PuppeteerRenderState = {
      items: aboveItems.map(toPuppeteerItem),
      background: { type: 'transparent' },
      canvas: payload.canvas,
      canvasW, canvasH,
      time: 0,
    };
    topPlatePath = tmpPath(await screenshotRenderState(topState, 'png', { omitBackground: true }, signal));
  }

  signal?.throwIfAborted();

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

  // 4. Build filter graph: scale → [round] → [opacity] → [rotate] → overlay on the
  //    bottom plate → [overlay top plate] → output.
  // Input indices: 0 = bottom plate, 1 = video, then mask / top plate as present.
  let nextInput = 2;
  const maskIdx = maskPath ? nextInput++ : -1;
  const topIdx = topPlatePath ? nextInput++ : -1;

  // rgba is only needed when we actually touch the video's alpha (rounded mask,
  // partial opacity or rotation with transparent corners). For a plain overlay it
  // just doubles memory — skip it. This matters on RAM-constrained hosts.
  const needsAlpha = !!maskPath || opacity < 1 || rotation !== 0;

  const filters: string[] = [];
  let v = '[1:v]';
  filters.push(needsAlpha
    ? `${v}scale=${dispW}:${dispH},format=rgba[v0]`
    : `${v}scale=${dispW}:${dispH}[v0]`);
  v = '[v0]';

  if (maskPath) {
    filters.push(`[${maskIdx}:v]alphaextract[mk]`);
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
  filters.push(`[0:v]${v}overlay=${ox}:${oy}:shortest=1:format=auto[base]`);
  let last = 'base';
  if (topIdx >= 0) {
    filters.push(`[base][${topIdx}:v]overlay=0:0:shortest=1:format=auto[withtop]`);
    last = 'withtop';
  }
  filters.push(`[${last}]scale=trunc(iw/2)*2:trunc(ih/2)*2[out]`);

  // 5. Encode.
  const outputFilename = `vid_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  // The looping plate is generated at the VIDEO's framerate. A mismatch (e.g. the
  // default 25fps plate vs a 30fps source) makes overlay buffer plate frames while
  // it waits for the video — with B-frame sources that buffer grows unbounded and
  // the process is OOM-killed (stuck at frame=0). Matching fps keeps it lockstep.
  const r = fps > 0 && Number.isFinite(fps) ? fps.toFixed(3) : '30';

  // Plates are captured; release Chrome's RAM before the heavy ffmpeg encode.
  await closeBrowser();

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
      // Bound the looping plate to the video length as a hard safety net on top
      // of overlay shortest=1.
      .input(platePath).inputOptions(['-loop 1', `-framerate ${r}`, `-t ${durationSec}`])
      .input(tmpPath(video.fileId));
    if (maskPath) cmd.input(maskPath);
    if (topPlatePath) cmd.input(topPlatePath).inputOptions(['-loop 1', `-framerate ${r}`, `-t ${durationSec}`]);

    const out = [
      '-map [out]',
      '-c:v libx264', '-crf 18', '-preset fast', '-pix_fmt yuv420p',
      '-colorspace bt709', '-color_primaries bt709', '-color_trc bt709',
      // Constant output framerate + bounded muxer queue: defend against VFR/B-frame
      // sources that otherwise stall or balloon memory in the filter graph.
      '-fps_mode cfr', `-r ${r}`, '-max_muxing_queue_size 1024',
      `-threads ${FFMPEG_THREADS}`,
      '-movflags +faststart',
      ...(audioFromFile ? ['-map 1:a?', '-c:a aac'] : []),
      '-shortest',
    ];

    const onAbort = () => { try { cmd.kill('SIGKILL'); } catch { /* already done */ } };
    signal?.addEventListener('abort', onAbort, { once: true });

    cmd
      .complexFilter(filters.join(';'))
      .outputOptions(out)
      .output(outputPath)
      .on('start', (c) => console.log('[hybrid ffmpeg]', c))
      .on('stderr', (line) => console.log('[hybrid ffmpeg]', line))
      .on('end', () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      })
      .on('error', (err) => {
        signal?.removeEventListener('abort', onAbort);
        console.error('[hybrid ffmpeg error]', err.message);
        reject(err);
      })
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
