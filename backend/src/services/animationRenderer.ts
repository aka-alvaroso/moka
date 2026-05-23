import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { renderImage } from './imageRenderer';
import { tmpPath } from './fileManager';
import type { RenderPayload, AnimationKeyframe, AnimatedProps, ContentOptions } from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

// ── Easing ────────────────────────────────────────────────────────────────────

function applyEasing(t: number, easing: AnimationKeyframe['easing']): number {
  switch (easing) {
    case 'linear':      return t;
    case 'ease-in':     return t * t * t;
    case 'ease-out':    return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'spring': {
      const w0   = Math.sqrt(180);
      const zeta = 12 / (2 * Math.sqrt(180));
      const s    = t * 6;
      if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * w0 * s) * (Math.cos(wd * s) + (zeta * w0 / wd) * Math.sin(wd * s));
      }
      return 1 - Math.exp(-w0 * s) * (1 + w0 * s);
    }
    default: return t;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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
    x:            lerp(from.props.x,            to.props.x,            t),
    y:            lerp(from.props.y,            to.props.y,            t),
    scale:        lerp(from.props.scale,        to.props.scale,        t),
    rotation:     lerp(from.props.rotation,     to.props.rotation,     t),
    opacity:      lerp(from.props.opacity,      to.props.opacity,      t),
    borderRadius: lerp(from.props.borderRadius, to.props.borderRadius, t),
  };
}

function propsToContent(base: ContentOptions, p: AnimatedProps): ContentOptions {
  return {
    ...base,
    x: p.x,
    y: p.y,
    scale: p.scale,
    rotation: p.rotation,
    opacity: p.opacity,
    borderRadius: {
      linked: true,
      all: p.borderRadius,
      tl: p.borderRadius, tr: p.borderRadius,
      br: p.borderRadius, bl: p.borderRadius,
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface AnimationRenderPayload extends RenderPayload {
  duration: number;
  fps: 24 | 30 | 60;
  keyframes: AnimationKeyframe[];
}

export async function renderAnimation(payload: AnimationRenderPayload): Promise<string> {
  const { duration, fps, keyframes, content } = payload;
  const totalFrames = Math.round(duration * fps);
  const frameDir = tmpPath(`frames_${uuidv4()}`);
  const frameDirNative = frameDir.replace(/\//g, path.sep);
  fs.mkdirSync(frameDirNative, { recursive: true });

  // Render each frame
  for (let i = 0; i < totalFrames; i++) {
    const time = (i / (totalFrames - 1)) * duration;
    const props = interpolateProps(keyframes, time);
    const frameContent = propsToContent(content, props);
    const framePng = await renderImage({
      ...payload,
      format: 'png',
      content: frameContent,
    });

    // Rename into sequentially numbered frame
    const src  = tmpPath(framePng).replace(/\//g, path.sep);
    const dest = path.join(frameDirNative, `frame${String(i).padStart(6, '0')}.png`);
    fs.renameSync(src, dest);
  }

  // Verify frames exist
  const writtenFrames = fs.readdirSync(frameDirNative).filter(f => f.endsWith('.png'));
  console.log(`[anim] frameDir=${frameDir}  frames=${writtenFrames.length}`);
  if (writtenFrames.length === 0) throw new Error('No frames were rendered');

  // Combine frames into MP4
  const outputFilename = `anim_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);
  const inputPattern = `${frameDir}/frame%06d.png`;
  console.log(`[anim] ffmpeg input: ${inputPattern}  output: ${outputPath}`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(inputPattern)
      .inputFPS(fps)
      .videoCodec('libx264')
      .videoFilter('scale=trunc(iw/2)*2:trunc(ih/2)*2')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-crf 18',
        '-movflags +faststart',
        `-r ${fps}`,
      ])
      .output(outputPath)
      .on('stderr', (line: string) => console.log('[ffmpeg]', line))
      .on('end', () => resolve())
      .on('error', (err: Error) => { console.error('[ffmpeg error]', err.message); reject(err); })
      .run();
  });

  // Cleanup frames
  fs.rmSync(frameDirNative, { recursive: true, force: true });

  return outputFilename;
}
