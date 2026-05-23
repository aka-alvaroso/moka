import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { tmpPath } from './fileManager';
import { screenshotRenderState } from './puppeteerRenderer';
import type {
  MultiAnimationRenderPayload, PuppeteerRenderState, PuppeteerItem,
  AnimationKeyframe, AnimatedProps, ContentOptions,
} from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

// ── Canvas sizes (mirrors imageRenderer) ──────────────────────────────────────

const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
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

function getCanvasSize(canvas: MultiAnimationRenderPayload['canvas']): { w: number; h: number } {
  if (canvas.ratio === 'custom') return { w: canvas.width || 1080, h: canvas.height || 1080 };
  return CANVAS_SIZES[canvas.ratio] ?? CANVAS_SIZES['1:1'];
}

// ── Easing + interpolation ────────────────────────────────────────────────────

function applyEasing(t: number, easing: AnimationKeyframe['easing']): number {
  switch (easing) {
    case 'linear':      return t;
    case 'ease-in':     return t * t * t;
    case 'ease-out':    return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'spring': {
      const stiffness = 180, damping = 12;
      const omega = Math.sqrt(stiffness);
      const zeta = damping / (2 * Math.sqrt(stiffness));
      if (zeta < 1) {
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
      }
      return 1 - Math.exp(-omega * t) * (1 + omega * t);
    }
    default: return t;
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function interpolateProps(keyframes: AnimationKeyframe[], time: number): AnimatedProps {
  if (keyframes.length === 0) throw new Error('No keyframes');
  if (keyframes.length === 1) return keyframes[0].props;
  if (time <= keyframes[0].time) return keyframes[0].props;
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].props;

  let from = keyframes[0], to = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      from = keyframes[i]; to = keyframes[i + 1]; break;
    }
  }
  const span = to.time - from.time;
  const t = applyEasing((time - from.time) / span, from.easing);
  return {
    x: lerp(from.props.x, to.props.x, t),
    y: lerp(from.props.y, to.props.y, t),
    scale: lerp(from.props.scale, to.props.scale, t),
    rotation: lerp(from.props.rotation, to.props.rotation, t),
    opacity: lerp(from.props.opacity, to.props.opacity, t),
    borderRadius: lerp(from.props.borderRadius, to.props.borderRadius, t),
  };
}

function propsToContent(base: ContentOptions, p: AnimatedProps): ContentOptions {
  return {
    ...base,
    x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, opacity: p.opacity,
    borderRadius: { linked: true, all: p.borderRadius, tl: p.borderRadius, tr: p.borderRadius, br: p.borderRadius, bl: p.borderRadius },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderAnimation(payload: MultiAnimationRenderPayload): Promise<string> {
  const { duration, fps, items, background, canvas } = payload;
  const totalFrames = Math.max(2, Math.round(duration * fps));
  const { w: canvasW, h: canvasH } = getCanvasSize(canvas);

  const frameDir = tmpPath(`frames_${uuidv4()}`);
  fs.mkdirSync(frameDir, { recursive: true });

  for (let i = 0; i < totalFrames; i++) {
    const time = totalFrames > 1 ? (i / (totalFrames - 1)) * duration : 0;

    const renderItems: PuppeteerItem[] = items.map((item) => {
      let content = item.content;
      if (item.keyframes.length >= 2) {
        const props = interpolateProps(item.keyframes, time);
        content = propsToContent(item.content, props);
      }
      return { id: item.id, fileId: item.fileId, isVideo: item.isVideo, srcW: item.srcW, srcH: item.srcH, content, zIndex: item.zIndex };
    });

    const state: PuppeteerRenderState = { items: renderItems, background, canvas, canvasW, canvasH };
    const framePng = await screenshotRenderState(state, 'png');

    const src = tmpPath(framePng);
    const dest = path.join(frameDir, `frame${String(i).padStart(6, '0')}.png`);
    fs.renameSync(src, dest);
  }

  const writtenFrames = fs.readdirSync(frameDir).filter((f) => f.endsWith('.png'));
  console.log(`[anim] frameDir=${frameDir}  frames=${writtenFrames.length}`);
  if (writtenFrames.length === 0) throw new Error('No frames were rendered');

  const outputFilename = `anim_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(`${frameDir}/frame%06d.png`)
      .inputFPS(fps)
      .videoCodec('libx264')
      .videoFilter('scale=trunc(iw/2)*2:trunc(ih/2)*2')
      .outputOptions(['-pix_fmt yuv420p', '-crf 18', '-movflags +faststart', `-r ${fps}`])
      .output(outputPath)
      .on('stderr', (line: string) => console.log('[ffmpeg]', line))
      .on('end', () => resolve())
      .on('error', (err: Error) => { console.error('[ffmpeg error]', err.message); reject(err); })
      .run();
  });

  fs.rmSync(frameDir, { recursive: true, force: true });
  return outputFilename;
}
