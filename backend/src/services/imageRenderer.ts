import sharp from 'sharp';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import type { MeshConfig, RenderPayload } from '@mockup-forge/shared';

const CANVAS_SIZES: Record<string, { w: number; h: number }> = {
  '1:1':  { w: 1080, h: 1080 },
  '16:9': { w: 1920, h: 1080 },
  '4:5':  { w: 1080, h: 1350 },
  '9:16': { w: 1080, h: 1920 },
  '4:3':  { w: 1440, h: 1080 },
  // Social presets
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

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

// ── Mesh pixel renderer ───────────────────────────────────────────────────────

function renderMeshPixels(mesh: MeshConfig, cw: number, ch: number): Buffer {
  const base = hexToRgb(mesh.base);
  const pixels = Buffer.alloc(cw * ch * 3);

  // Pre-parse blob colors
  const blobs = mesh.blobs.map((b) => ({ ...b, rgb: hexToRgb(b.color) }));

  // Pre-compute farthest-corner radii to match CSS radial-gradient(circle farthest-corner)
  const blobRadii = blobs.map((blob) => {
    const bxPx = (blob.x / 100) * cw;
    const byPx = (blob.y / 100) * ch;
    const farthest = Math.max(
      Math.sqrt(bxPx * bxPx + byPx * byPx),
      Math.sqrt(bxPx * bxPx + (ch - byPx) * (ch - byPx)),
      Math.sqrt((cw - bxPx) * (cw - bxPx) + byPx * byPx),
      Math.sqrt((cw - bxPx) * (cw - bxPx) + (ch - byPx) * (ch - byPx)),
    );
    return (blob.size / 100) * farthest; // radius in pixels
  });

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let r = base.r, g = base.g, b = base.b;

      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];
        const radius = blobRadii[i];
        const dx   = x - (blob.x / 100) * cw;
        const dy   = y - (blob.y / 100) * ch;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= radius) continue;
        // Linear falloff matching CSS gradient stop behaviour
        const t     = dist / radius;
        const alpha = (1 - t) * blob.opacity;
        r = r + (blob.rgb.r - r) * alpha;
        g = g + (blob.rgb.g - g) * alpha;
        b = b + (blob.rgb.b - b) * alpha;
      }

      const idx = (y * cw + x) * 3;
      pixels[idx]     = Math.min(255, Math.max(0, Math.round(r)));
      pixels[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      pixels[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
    }
  }

  return pixels;
}

// ── Background factory (exported for videoRenderer) ───────────────────────────

export async function makeBackground(
  payload: RenderPayload,
  cw: number,
  ch: number
): Promise<Buffer> {
  const { background } = payload;

  if (background.type === 'transparent') {
    return sharp({
      create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }

  if (background.type === 'solid') {
    const { r, g, b } = hexToRgb(background.color || '#1a1a2e');
    return sharp({
      create: { width: cw, height: ch, channels: 3, background: { r, g, b } },
    }).png().toBuffer();
  }

  if (background.type === 'gradient') {
    const grad = background.gradient ?? { from: '#1a1a2e', to: '#16213e', direction: 135 };
    const { r: r1, g: g1, b: b1 } = hexToRgb(grad.from);
    const { r: r2, g: g2, b: b2 } = hexToRgb(grad.to);
    const angle = (grad.direction * Math.PI) / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const pixels = Buffer.alloc(cw * ch * 3);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const t = Math.min(1, Math.max(0, 0.5 + (x / cw - 0.5) * cos + (y / ch - 0.5) * sin));
        const i = (y * cw + x) * 3;
        pixels[i]     = Math.round(r1 + (r2 - r1) * t);
        pixels[i + 1] = Math.round(g1 + (g2 - g1) * t);
        pixels[i + 2] = Math.round(b1 + (b2 - b1) * t);
      }
    }
    return sharp(pixels, { raw: { width: cw, height: ch, channels: 3 } }).png().toBuffer();
  }

  if (background.type === 'mesh') {
    const mesh = background.mesh ?? {
      base: '#0f0c29',
      blobs: [
        { id: '1', x: 20, y: 30, color: '#302b63', size: 80, opacity: 0.9 },
        { id: '2', x: 80, y: 70, color: '#6366f1', size: 70, opacity: 0.8 },
      ],
    };
    const pixels = renderMeshPixels(mesh, cw, ch);
    return sharp(pixels, { raw: { width: cw, height: ch, channels: 3 } }).png().toBuffer();
  }

  if (background.type === 'image' && background.imageFileId) {
    return sharp(tmpPath(background.imageFileId))
      .resize(cw, ch, { fit: 'cover' })
      .png()
      .toBuffer();
  }

  // Fallback
  return sharp({
    create: { width: cw, height: ch, channels: 3, background: { r: 20, g: 20, b: 40 } },
  }).png().toBuffer();
}

// ── Image render ──────────────────────────────────────────────────────────────

// Renders the shadow directly into a canvas-sized buffer placed at (0,0).
// This avoids all offset-clamping and buffer-size issues.
async function makeShadowLayer(
  cw: number, ch: number,
  imgLeft: number, imgTop: number, imgW: number, imgH: number,
  color: { r: number; g: number; b: number },
  opacity: number, blur: number, spread: number,
  offsetX: number, offsetY: number,
): Promise<Buffer> {
  const sw = Math.max(1, imgW + spread * 2);
  const sh = Math.max(1, imgH + spread * 2);
  const rl = imgLeft + offsetX - spread;   // rect left on canvas
  const rt = imgTop  + offsetY - spread;   // rect top  on canvas

  // 1. Paint white rect into a canvas-sized greyscale buffer
  const grey = Buffer.alloc(cw * ch, 0);
  const x0 = Math.max(0, rl),  x1 = Math.min(cw, rl + sw);
  const y0 = Math.max(0, rt),  y1 = Math.min(ch, rt + sh);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      grey[y * cw + x] = 255;

  // 2. Blur the greyscale mask (no RGBA, no transparency artefacts)
  const sigma = Math.max(0.3, blur / 2);
  let mask = await sharp(grey, { raw: { width: cw, height: ch, channels: 1 } }).png().toBuffer();
  if (blur > 0) {
    mask = await sharp(mask).blur(sigma).png().toBuffer();
  }

  // 3. Map mask → RGBA using shadow colour + opacity
  // Force greyscale so data is always 1 byte per pixel
  const { data } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    rgba[i * 4]     = color.r;
    rgba[i * 4 + 1] = color.g;
    rgba[i * 4 + 2] = color.b;
    rgba[i * 4 + 3] = Math.round((data[i] / 255) * opacity * 255);
  }
  return sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
}

export async function renderImage(payload: RenderPayload): Promise<string> {
  const { content, format } = payload;
  const resScale = payload.resolution === '3x' ? 3 : payload.resolution === '2x' ? 2 : 1;

  const baseSize = payload.canvas.ratio === 'custom'
    ? { w: payload.canvas.width || 1080, h: payload.canvas.height || 1080 }
    : CANVAS_SIZES[payload.canvas.ratio] ?? CANVAS_SIZES['1:1'];

  const cw = baseSize.w * resScale;
  const ch = baseSize.h * resScale;

  const bgBuffer = await makeBackground(payload, cw, ch);

  const meta = await sharp(tmpPath(payload.fileId)).metadata();
  const srcW = meta.width!, srcH = meta.height!;

  const baseFit = Math.min(cw, ch) * 0.8;
  const fitScale = Math.min(baseFit / srcW, baseFit / srcH);
  const imgW = Math.max(1, Math.round(srcW * fitScale * content.scale));
  const imgH = Math.max(1, Math.round(srcH * fitScale * content.scale));

  let imgBuffer = await sharp(tmpPath(payload.fileId))
    .resize(imgW, imgH, { fit: 'fill' })
    .png()
    .toBuffer();

  // Border radius
  const brCfg = content.borderRadius;
  const hasRadius = brCfg.linked ? brCfg.all > 0 : (brCfg.tl + brCfg.tr + brCfg.br + brCfg.bl) > 0;
  if (hasRadius) {
    const s = resScale;
    const tl = Math.round((brCfg.linked ? brCfg.all : brCfg.tl) * s);
    const tr = Math.round((brCfg.linked ? brCfg.all : brCfg.tr) * s);
    const br = Math.round((brCfg.linked ? brCfg.all : brCfg.br) * s);
    const bl = Math.round((brCfg.linked ? brCfg.all : brCfg.bl) * s);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
         <path d="M${tl},0 H${imgW - tr} Q${imgW},0 ${imgW},${tr} V${imgH - br} Q${imgW},${imgH} ${imgW - br},${imgH} H${bl} Q0,${imgH} 0,${imgH - bl} V${tl} Q0,0 ${tl},0 Z" fill="white"/>
       </svg>`
    );
    imgBuffer = await sharp(imgBuffer)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  // Rotation — sharp.rotate() expands the canvas automatically
  let finalW = imgW, finalH = imgH;
  if (content.rotation !== 0) {
    imgBuffer = await sharp(imgBuffer)
      .rotate(content.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const rm = await sharp(imgBuffer).metadata();
    finalW = rm.width!;
    finalH = rm.height!;
  }

  const cx   = Math.round((content.x / 100) * cw);
  const cy   = Math.round((content.y / 100) * ch);
  let left = cx - Math.round(finalW / 2);
  let top  = cy - Math.round(finalH / 2);

  // Clip image to canvas bounds — sharp rejects composites larger than the base
  if (finalW > cw || finalH > ch || left < 0 || top < 0) {
    const srcLeft = Math.max(0, -left);
    const srcTop  = Math.max(0, -top);
    const clipW   = Math.min(finalW - srcLeft, cw - Math.max(0, left));
    const clipH   = Math.min(finalH - srcTop,  ch - Math.max(0, top));
    if (clipW > 0 && clipH > 0) {
      imgBuffer = await sharp(imgBuffer)
        .extract({ left: srcLeft, top: srcTop, width: clipW, height: clipH })
        .png()
        .toBuffer();
      left    = Math.max(0, left);
      top     = Math.max(0, top);
      finalW  = clipW;
      finalH  = clipH;
    }
  }

  const composites: sharp.OverlayOptions[] = [];
  const sh = content.shadow;
  if (sh.opacity > 0) {
    const shadowColor = hexToRgb(sh.color);
    const shadowLayer = await makeShadowLayer(
      cw, ch, left, top, finalW, finalH,
      shadowColor, sh.opacity,
      sh.blur * resScale,
      Math.round(sh.spread * resScale),
      Math.round(sh.x * resScale),
      Math.round(sh.y * resScale),
    );
    composites.push({ input: shadowLayer, left: 0, top: 0 });
  }
  composites.push({ input: imgBuffer, left, top });

  const outputFilename = `render_${uuidv4()}.${format === 'jpg' ? 'jpg' : 'png'}`;
  const pipeline = sharp(bgBuffer).composite(composites);
  if (format === 'jpg') {
    await pipeline.jpeg({ quality: 92 }).toFile(tmpPath(outputFilename));
  } else {
    await pipeline.png().toFile(tmpPath(outputFilename));
  }

  return outputFilename;
}
