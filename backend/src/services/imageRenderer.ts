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

function shadowSvgBuffer(w: number, h: number, amount: number): Buffer {
  const blur  = Math.round(amount * 48);
  const alpha = (amount * 0.78).toFixed(3);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs><filter id="b"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
      <rect width="${w}" height="${h}" fill="rgba(0,0,0,${alpha})" filter="url(#b)"/>
    </svg>`
  );
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
  if (content.borderRadius > 0) {
    const r = Math.round(content.borderRadius * resScale);
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
         <rect width="${imgW}" height="${imgH}" rx="${r}" ry="${r}" fill="white"/>
       </svg>`
    );
    imgBuffer = await sharp(imgBuffer)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  // Rotation
  let finalW = imgW, finalH = imgH;
  if (content.rotation !== 0) {
    const angle = (content.rotation * Math.PI) / 180;
    finalW = Math.ceil(imgW * Math.abs(Math.cos(angle)) + imgH * Math.abs(Math.sin(angle)));
    finalH = Math.ceil(imgW * Math.abs(Math.sin(angle)) + imgH * Math.abs(Math.cos(angle)));
    imgBuffer = await sharp({
      create: { width: finalW, height: finalH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: imgBuffer, left: Math.round((finalW - imgW) / 2), top: Math.round((finalH - imgH) / 2) }])
      .png()
      .toBuffer();
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
  const left = cx - Math.round(finalW / 2);
  const top  = cy - Math.round(finalH / 2);

  const composites: sharp.OverlayOptions[] = [];
  if (content.shadow > 0) {
    const buf = shadowSvgBuffer(finalW, finalH, content.shadow);
    composites.push({
      input: buf,
      left: left + Math.round(content.shadow * 12 * resScale),
      top:  top  + Math.round(content.shadow * 20 * resScale),
    });
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
