import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore — ffprobe-static has no bundled types
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import { makeBackground } from './imageRenderer';
import type { RenderPayload } from '@mockup-forge/shared';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '4:3':  { w: 1440, h: 1080 },
  'ig-post':      { w: 1080, h: 1080 },
  'ig-portrait':  { w: 1080, h: 1350 },
  'ig-landscape': { w: 1080, h: 566  },
  'ig-story':     { w: 1080, h: 1920 },
  'x-post':       { w: 1200, h: 675  },
  'x-banner':     { w: 1500, h: 500  },
  'x-profile':    { w: 400,  h: 400  },
  'yt-thumbnail': { w: 1280, h: 720  },
  'yt-banner':    { w: 2560, h: 1440 },
  'fb-post':      { w: 1200, h: 630  },
  'fb-cover':     { w: 820,  h: 312  },
  'li-banner':    { w: 1584, h: 396  },
  'li-post':      { w: 1200, h: 627  },
  'profile-pic':  { w: 800,  h: 800  },
};

export async function renderVideo(payload: RenderPayload): Promise<string> {
  const { content, background } = payload;

  const baseSize = payload.canvas.ratio === 'custom'
    ? { w: payload.canvas.width || 1080, h: payload.canvas.height || 1080 }
    : CANVAS_SIZES[payload.canvas.ratio] ?? CANVAS_SIZES['1:1'];

  const cw = baseSize.w;
  const ch = baseSize.h;

  // 1. Get video native dimensions via ffprobe
  const videoMeta = await probeVideo(tmpPath(payload.fileId));
  const srcW = videoMeta.width;
  const srcH = videoMeta.height;

  // 2. Compute output video size (same logic as image renderer)
  const baseFit = Math.min(cw, ch) * 0.8;
  const fitScale = Math.min(baseFit / srcW, baseFit / srcH);
  const vidW = Math.max(2, roundToEven(srcW * fitScale * content.scale));
  const vidH = Math.max(2, roundToEven(srcH * fitScale * content.scale));

  // 3. Compute position
  const cx = Math.round((content.x / 100) * cw);
  const cy = Math.round((content.y / 100) * ch);
  const posX = cx - Math.round(vidW / 2);
  const posY = cy - Math.round(vidH / 2);

  // 4. Render background as PNG (sharp)
  const bgPath = tmpPath(`bg_${uuidv4()}.png`);
  await renderBackgroundToDisk(payload, cw, ch, bgPath);

  // 5. Build FFmpeg filter graph
  // Inputs: [0] background image, [1] user video
  // Steps:
  //   - Scale video to vidW×vidH
  //   - Apply rounded corners via vignette (or alphamerge with rounded mask)
  //   - Overlay video on background at posX,posY
  const brCfg = content.borderRadius;
  const r = (brCfg.linked ? brCfg.all : Math.max(brCfg.tl, brCfg.tr, brCfg.br, brCfg.bl)) > 0
    ? Math.round(brCfg.linked ? brCfg.all : Math.max(brCfg.tl, brCfg.tr, brCfg.br, brCfg.bl))
    : 0;

  const outputFilename = `render_${uuidv4()}.mp4`;
  const outputPath = tmpPath(outputFilename);

  // Build the filter complex
  // [1:v] scale → rounded mask → overlay on [0:v]
  const shadowFilter = content.shadow.opacity > 0
    ? buildShadowFilter(vidW, vidH, content.shadow.opacity, content.shadow.x, content.shadow.y, content.shadow.blur)
    : null;

  const filterParts: string[] = [];
  let videoStream = '[1:v]';

  // Scale
  filterParts.push(`${videoStream}scale=${vidW}:${vidH}[scaled]`);
  videoStream = '[scaled]';

  // Rounded corners via alphamerge
  console.log('[renderVideo] r=%d shadowOpacity=%d vidW=%d vidH=%d posX=%d posY=%d', r, content.shadow.opacity, vidW, vidH, posX, posY);
  if (r > 0) {
    const maskPath = await buildRoundedMaskPng(vidW, vidH, r);
    console.log('[renderVideo] → runFfmpegRounded, maskPath=', maskPath);
    await runFfmpegRounded({
      bgPath, videoPath: tmpPath(payload.fileId),
      maskPath, outputPath,
      cw, ch, vidW, vidH, posX, posY,
      content, shadowFilter,
    });
  } else {
    console.log('[renderVideo] → runFfmpegSimple');
    await runFfmpegSimple({
      bgPath, videoPath: tmpPath(payload.fileId),
      outputPath, cw, ch, vidW, vidH, posX, posY, content,
    });
  }

  return outputFilename;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function roundToEven(n: number): number {
  return Math.round(n / 2) * 2;
}

async function probeVideo(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === 'video');
      if (!stream || !stream.width || !stream.height) {
        return reject(new Error('No video stream found'));
      }
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

async function renderBackgroundToDisk(
  payload: RenderPayload, cw: number, ch: number, outPath: string
): Promise<void> {
  const buf = await makeBackground(payload, cw, ch);
  await sharp(buf).png().toFile(outPath);
}

async function buildRoundedMaskPng(w: number, h: number, r: number): Promise<string> {
  const maskPath = tmpPath(`mask_${uuidv4()}.png`);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>
     </svg>`
  );
  await sharp(svg).resize(w, h).png().toFile(maskPath);
  return maskPath;
}

function buildShadowFilter(
  vidW: number, vidH: number, opacity: number, offsetX: number, offsetY: number, blur: number
): { offsetX: number; offsetY: number; blur: number; alpha: number } {
  return {
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    blur: Math.round(blur / 2),
    alpha: opacity,
  };
}

async function runFfmpegSimple(opts: {
  bgPath: string; videoPath: string; outputPath: string;
  cw: number; ch: number; vidW: number; vidH: number;
  posX: number; posY: number; content: RenderPayload['content'];
}): Promise<void> {
  const { bgPath, videoPath, outputPath, cw, ch, vidW, vidH, posX, posY, content } = opts;

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(bgPath)
      .inputOptions(['-loop 1'])
      .input(videoPath);

    const shadow = content.shadow;
    let filterComplex: string;

    if (shadow.opacity > 0) {
      const ox   = Math.round(shadow.x);
      const oy   = Math.round(shadow.y);
      const blur = Math.round(shadow.blur / 2);
      filterComplex = [
        `[1:v]scale=${vidW}:${vidH},format=rgba[vid]`,
        `[vid]split[v1][v2]`,
        `[v1]colorchannelmixer=aa=${shadow.opacity},boxblur=${blur}:${blur}[shadow]`,
        `[0:v][shadow]overlay=${posX + ox}:${posY + oy}[bg]`,
        `[bg][v2]overlay=${posX}:${posY}[out]`,
      ].join(';');
    } else {
      filterComplex = [
        `[1:v]scale=${vidW}:${vidH},format=rgba[vid]`,
        `[0:v][vid]overlay=${posX}:${posY}[out]`,
      ].join(';');
    }

    cmd
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-map 1:a?',
        '-c:v libx264',
        '-crf 20',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-shortest',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[ffmpeg cmd]', cmd))
      .on('stderr', (line) => console.log('[ffmpeg]', line))
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

async function runFfmpegRounded(opts: {
  bgPath: string; videoPath: string; maskPath: string; outputPath: string;
  cw: number; ch: number; vidW: number; vidH: number;
  posX: number; posY: number; content: RenderPayload['content'];
  shadowFilter: ReturnType<typeof buildShadowFilter> | null;
}): Promise<void> {
  const { bgPath, videoPath, maskPath, outputPath, cw, ch, vidW, vidH, posX, posY, content, shadowFilter } = opts;

  return new Promise((resolve, reject) => {
    const shadow = content.shadow;
    let filterComplex: string;

    if (shadow.opacity > 0 && shadowFilter) {
      const { offsetX: ox, offsetY: oy, blur, alpha } = shadowFilter;
      filterComplex = [
        `[1:v]scale=${vidW}:${vidH},format=rgba[vid]`,
        `[2:v]scale=${vidW}:${vidH},format=rgba[mask]`,
        `[vid][mask]alphamerge[rounded]`,
        // split: [r1] → shadow chain, [r2] → final overlay
        `[rounded]split[r1][r2]`,
        `[r1]colorchannelmixer=aa=${alpha},boxblur=${blur}:${blur}[shadow]`,
        `[0:v][shadow]overlay=${posX + ox}:${posY + oy}[bg]`,
        `[bg][r2]overlay=${posX}:${posY}[out]`,
      ].join(';');
    } else {
      filterComplex = [
        `[1:v]scale=${vidW}:${vidH},format=rgba[vid]`,
        `[2:v]scale=${vidW}:${vidH},format=rgba[mask]`,
        `[vid][mask]alphamerge[rounded]`,
        `[0:v][rounded]overlay=${posX}:${posY}[out]`,
      ].join(';');
    }

    ffmpeg()
      .input(bgPath)
      .inputOptions(['-loop 1'])
      .input(videoPath)
      .input(maskPath)
      .complexFilter(filterComplex, 'out')
      .outputOptions([
        '-map 1:a?',
        '-c:v libx264',
        '-crf 20',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-shortest',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[ffmpeg-rounded cmd]', cmd))
      .on('stderr', (line) => console.log('[ffmpeg-rounded]', line))
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
