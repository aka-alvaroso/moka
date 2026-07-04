// Split animation renderer — fast AND pixel-correct for single-video scenes.
//
// A keyframe animation only changes the scene during the keyframe span
// [0, lastKeyframeTime]. After that every element holds its final transform and
// only the video CONTENT keeps advancing. Rendering those thousands of "hold"
// frames through Puppeteer (one screenshot + video seek each) is what makes long
// exports slow enough to hit the render-queue timeout.
//
// So we split the timeline:
//
//   • Animated segment [0, lastKf]  → Puppeteer per-frame (browser-exact: easing,
//     rounded corners, shadow, opacity — all correct). This span is short.
//
//   • Static-hold segment [lastKf, duration] → ONE FFmpeg pass. The static scene
//     (background, other layers, the video's empty box WITH its shadow/rounded
//     border/rotation) is baked into PNG plates by a single Puppeteer screenshot;
//     FFmpeg then composites the live video into the rounded hole at native speed
//     using only constant-parameter filters (no per-frame expression eval).
//
// The two segments are joined with FFmpeg's concat filter in the same pass, so
// codec/size/fps match by construction. Result: correct output (the piece the
// pure-FFmpeg "hybrid" attempt got wrong) at a fraction of the Puppeteer cost.

import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import { captureFrameSequence, screenshotRenderState, closeBrowser } from './puppeteerRenderer';
import { probeMedia, getCanvasSize } from './frameRenderer';
import { computeItemGeometry } from '@mockup-forge/shared';
import type {
  MultiAnimationRenderPayload, PuppeteerRenderState, PuppeteerItem,
  ContentOptions, AnimatedProps,
} from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

// Hold segments shorter than this aren't worth the extra plates+composite — the
// pure Puppeteer path captures them just as fast. (Also the degenerate "no real
// hold" case, e.g. Clip-mode exports.)
const MIN_HOLD_SECONDS = 0.3;

// ── Gate ──────────────────────────────────────────────────────────────────────

export function lastKeyframeTime(payload: MultiAnimationRenderPayload): number {
  return payload.items.reduce((max, item) => {
    const kfs = item.keyframes;
    if (!kfs?.length) return max;
    return Math.max(max, kfs[kfs.length - 1].time);
  }, 0);
}

export function canUseAnimationSplit(payload: MultiAnimationRenderPayload): boolean {
  // Exactly one video — the moving element FFmpeg composites into the plate hole.
  if (payload.items.filter((i) => i.isVideo).length !== 1) return false;
  // Need a meaningful hold after the animation for the split to pay off.
  const hold = payload.duration - lastKeyframeTime(payload);
  return hold > MIN_HOLD_SECONDS;
}

// ── Final (held) content ────────────────────────────────────────────────────
//
// Past the last keyframe the interpolation just returns the final keyframe's
// props, so the held state is simply the base content with the last keyframe's
// animated props folded in (mirrors frontend `applyAnimatedProps`).

function finalContent(item: MultiAnimationRenderPayload['items'][number]): ContentOptions {
  const kfs = item.keyframes;
  if (!kfs?.length) return item.content;
  const p: AnimatedProps = kfs[kfs.length - 1].props;
  return {
    ...item.content,
    x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, opacity: p.opacity,
    borderRadius: {
      ...item.content.borderRadius, linked: true,
      all: p.borderRadius, tl: p.borderRadius, tr: p.borderRadius,
      br: p.borderRadius, bl: p.borderRadius,
    },
  };
}

// ── Rounded-corner alpha mask (generated once) ───────────────────────────────
//
// White rounded-rect on black at the video's display size. Used by FFmpeg
// `alphamerge` so the composited video gets the SAME rounded corners CSS draws.

async function makeRoundedMask(w: number, h: number, radius: number): Promise<string> {
  const filename = `mask_${uuidv4()}.png`;
  const out = tmpPath(filename);
  // White rounded-rect on black. alphamerge reads luma as alpha, so white = opaque
  // (video shows) and the black corners = transparent (background shows through).
  //
  // Rendered with sharp (SVG → PNG) rather than FFmpeg: it needs no `lavfi` input
  // device (minimal/system ffmpeg builds on Linux servers often lack it) and the
  // SVG rounded rect matches CSS border-radius geometry more faithfully.
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="black"/>` +
    `<rect width="${w}" height="${h}" rx="${r.toFixed(3)}" ry="${r.toFixed(3)}" fill="white"/>` +
    `</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  return filename;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function renderAnimationSplit(
  payload: MultiAnimationRenderPayload,
  signal?: AbortSignal,
): Promise<string> {
  const { duration, fps, items, background, canvas } = payload;
  const { w: canvasW, h: canvasH } = getCanvasSize(canvas);

  const videoItem = items.find((i) => i.isVideo)!;
  const lastKf = lastKeyframeTime(payload);

  // Frame split on the global frame clock: seg1 = [0, splitFrame), seg2 = rest.
  const totalFrames = Math.max(2, Math.round(duration * fps));
  const splitFrame  = Math.min(totalFrames, Math.max(0, Math.round(lastKf * fps)));
  const seg2Frames  = totalFrames - splitFrame;
  const splitTime   = splitFrame / fps;          // seconds where the hold begins
  const holdDur     = seg2Frames / fps;

  const toPupp = (item: typeof videoItem, extra: Partial<PuppeteerItem> = {}): PuppeteerItem => ({
    id: item.id, fileId: item.fileId, isVideo: item.isVideo,
    srcW: item.srcW, srcH: item.srcH, content: item.content, zIndex: item.zIndex,
    keyframes: item.keyframes, ...extra,
  });

  // ── 1. Animated segment → Puppeteer frames [0, splitFrame) ──────────────────
  const frameDir = tmpPath(`frames_${uuidv4()}`);
  fs.mkdirSync(frameDir, { recursive: true });

  if (splitFrame > 0) {
    const times = Array.from({ length: splitFrame }, (_, i) => i / fps);
    const baseState: PuppeteerRenderState = {
      items: items.map((it) => toPupp(it)), background, canvas, canvasW, canvasH, time: times[0],
    };
    console.log(`[split-anim] capturing ${splitFrame} animated frames…`);
    await captureFrameSequence(baseState, times, {
      frameDir, ext: 'jpg', quality: 95, concurrency: 1,
      onProgress: (d, t) => console.log(`[split-anim] captured ${d}/${t} animated frames`),
      signal,
    });
  }
  signal?.throwIfAborted();

  // ── 2. Bake static plates at the held state (time = splitTime) ──────────────
  const staticItems = items.filter((i) => !i.isVideo);
  const belowItems  = staticItems.filter((i) => i.zIndex <= videoItem.zIndex);
  const aboveItems  = staticItems.filter((i) => i.zIndex  > videoItem.zIndex);

  console.log('[split-anim] baking static plates…');
  const bottomState: PuppeteerRenderState = {
    items: [...belowItems.map((it) => toPupp(it)), toPupp(videoItem, { hideMedia: true })],
    background, canvas, canvasW, canvasH, time: splitTime,
  };
  const platePath = tmpPath(await screenshotRenderState(bottomState, 'png', {}, signal));

  let topPlatePath: string | null = null;
  if (aboveItems.length > 0) {
    const topState: PuppeteerRenderState = {
      items: aboveItems.map((it) => toPupp(it)),
      background: { type: 'transparent' }, canvas, canvasW, canvasH, time: splitTime,
    };
    topPlatePath = tmpPath(await screenshotRenderState(topState, 'png', { omitBackground: true }, signal));
  }
  signal?.throwIfAborted();

  // ── 3. Held geometry of the video element ───────────────────────────────────
  const fc = finalContent(videoItem);
  const g  = computeItemGeometry(fc, videoItem.srcW, videoItem.srcH, canvasW, canvasH);
  const dw = Math.max(2, Math.round(g.dispW / 2) * 2);   // even dims for libx264
  const dh = Math.max(2, Math.round(g.dispH / 2) * 2);
  const radius = Math.max(0, Math.min(g.rFrac * Math.min(dw, dh) / 2, Math.min(dw, dh) / 2));
  const opacity  = typeof fc.opacity === 'number' ? Math.max(0, Math.min(1, fc.opacity)) : 1;
  const rotation = fc.rotation || 0;
  const rad = (rotation * Math.PI) / 180;

  // Video time covered by the hold, padded (freeze last frame) if the source runs
  // out before the hold ends — matches the preview's seek-clamp behaviour.
  const { duration: vidDur } = await probeMedia(videoItem.fileId).catch(() => ({ duration: 0 }));
  const vidRemaining = vidDur > 0 ? Math.max(0, vidDur - splitTime) : holdDur;
  const trimDur = Math.min(holdDur, vidRemaining);
  const padDur  = Math.max(0, holdDur - trimDur);

  // Rounded mask (skip when there's effectively no corner radius).
  await closeBrowser(); // free Chrome RAM before the encode
  const maskPath = radius > 0.5 ? tmpPath(await makeRoundedMask(dw, dh, radius)) : null;

  // ── 4. Single FFmpeg pass: seg1 frames + seg2 composite → concat ────────────
  const r = fps > 0 && Number.isFinite(fps) ? fps.toFixed(3) : '30';
  const outputFilename = `vid_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();

    // Inputs (order defines the [n:v] indices used below).
    let idx = 0;
    const seg1Idx = splitFrame > 0 ? idx++ : -1;
    if (splitFrame > 0) cmd.input(`${frameDir}/frame%06d.jpg`).inputOptions([`-framerate ${r}`]);

    const botIdx = idx++;
    cmd.input(platePath).inputOptions(['-loop 1', `-framerate ${r}`, `-t ${holdDur.toFixed(3)}`]);

    const vidIdx = idx++;
    cmd.input(tmpPath(videoItem.fileId));

    let topIdx = -1;
    if (topPlatePath) { topIdx = idx++; cmd.input(topPlatePath).inputOptions(['-loop 1', `-framerate ${r}`, `-t ${holdDur.toFixed(3)}`]); }

    let maskIdx = -1;
    if (maskPath) { maskIdx = idx++; cmd.input(maskPath).inputOptions(['-loop 1', `-framerate ${r}`, `-t ${holdDur.toFixed(3)}`]); }

    // ── seg2: composite the live video into the plate ──
    const chains: string[] = [];

    // Trim the source to the hold window, optionally clone-pad to fill it.
    let vchain = `[${vidIdx}:v]trim=start=${splitTime.toFixed(3)}:duration=${trimDur.toFixed(3)},setpts=PTS-STARTPTS`;
    if (padDur > 0.02) vchain += `,tpad=stop_mode=clone:stop_duration=${padDur.toFixed(3)}`;
    vchain += `,scale=${dw}:${dh},format=rgba[v2a]`;
    chains.push(vchain);

    let vlabel = 'v2a';
    if (maskIdx >= 0) {
      chains.push(`[${maskIdx}:v]format=gray[v2mask]`);
      chains.push(`[${vlabel}][v2mask]alphamerge[v2m]`);
      vlabel = 'v2m';
    }
    if (opacity < 0.999) {
      chains.push(`[${vlabel}]colorchannelmixer=aa=${opacity.toFixed(4)}[v2o]`);
      vlabel = 'v2o';
    }

    // Centre of the held box in canvas px.
    const cx = g.cx, cy = g.cy;
    let ox: string, oy: string;
    if (Math.abs(rotation) > 0.01) {
      const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
      const rw = Math.ceil(dw * c + dh * s), rh = Math.ceil(dw * s + dh * c);
      chains.push(`[${vlabel}]rotate=${rad.toFixed(6)}:ow=${rw}:oh=${rh}:c=none[v2r]`);
      vlabel = 'v2r';
      ox = (cx - rw / 2).toFixed(2); oy = (cy - rh / 2).toFixed(2);
    } else {
      ox = (cx - dw / 2).toFixed(2); oy = (cy - dh / 2).toFixed(2);
    }

    chains.push(`[${botIdx}:v][${vlabel}]overlay=x=${ox}:y=${oy}:format=auto[v2base]`);
    let seg2 = 'v2base';
    if (topIdx >= 0) { chains.push(`[v2base][${topIdx}:v]overlay=0:0:format=auto[v2top]`); seg2 = 'v2top'; }
    chains.push(`[${seg2}]scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${r},format=yuv420p,setsar=1[s2]`);

    // ── seg1: normalise the captured animated frames to match seg2 ──
    let mapLabel = 's2';
    if (seg1Idx >= 0) {
      chains.push(`[${seg1Idx}:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${r},format=yuv420p,setsar=1[s1]`);
      chains.push(`[s1][s2]concat=n=2:v=1:a=0[outv]`);
      mapLabel = 'outv';
    }

    const onAbort = () => { try { cmd.kill('SIGKILL'); } catch { /* done */ } };
    signal?.addEventListener('abort', onAbort, { once: true });

    console.log(`[split-anim] encoding (seg1=${splitFrame}f, hold=${holdDur.toFixed(2)}s)…`);
    cmd
      .complexFilter(chains)
      .outputOptions([
        `-map [${mapLabel}]`,
        '-c:v libx264', '-crf 18', '-preset fast', '-pix_fmt yuv420p',
        '-colorspace bt709', '-color_primaries bt709', '-color_trc bt709',
        '-fps_mode cfr', `-r ${r}`, '-max_muxing_queue_size 1024',
        '-threads 2', '-movflags +faststart',
      ])
      .output(outputPath)
      .on('start',  (c)    => console.log('[split-anim]', c))
      .on('stderr', (line) => console.log('[split-anim]', line))
      .on('end',    ()     => { signal?.removeEventListener('abort', onAbort); resolve(); })
      .on('error',  (err: Error) => {
        signal?.removeEventListener('abort', onAbort);
        console.error('[split-anim error]', err.message);
        reject(err);
      })
      .run();
  });

  fs.rmSync(frameDir, { recursive: true, force: true });
  return outputFilename;
}
