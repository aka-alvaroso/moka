// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for scene geometry + CSS mapping.
//
// Both the live preview (EditorCanvas) and the export view (RenderView, captured
// by Puppeteer for PNG/JPG/MP4) import THIS module. Because the math and the
// CSS strings live in one place, the preview and every export are guaranteed to
// agree pixel-for-pixel — adding a new visual feature here updates all targets
// at once, instead of being copy-pasted into 2–3 renderers that drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import type {
  Background, ContentOptions, ShadowConfig, AnimatedProps,
} from '@mockup-forge/shared';
import { computeItemGeometry } from '@mockup-forge/shared';
import { meshToCss } from './mesh';

// ── Colour helper ─────────────────────────────────────────────────────────────

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Background ────────────────────────────────────────────────────────────────

// `transparent` differs intentionally by target: the preview shows a checkerboard
// so the user can see "no background", whereas an export must emit real alpha.
// The background <img> for type 'image' is rendered separately by each consumer.
export type TransparentMode = 'checkerboard' | 'alpha';

export function backgroundCss(
  bg: Background,
  transparent: TransparentMode,
): CSSProperties {
  switch (bg.type) {
    case 'solid':
      return { background: bg.color || '#1a1a2e' };
    case 'gradient': {
      const { from = '#1a1a2e', to = '#16213e', direction = 135 } = bg.gradient ?? {};
      return { background: `linear-gradient(${direction}deg,${from},${to})` };
    }
    case 'mesh':
      return { background: bg.mesh ? meshToCss(bg.mesh) : '#0f0c29' };
    case 'transparent':
      return transparent === 'checkerboard'
        ? { background: 'repeating-conic-gradient(#1c1c1f 0% 25%,#141416 0% 50%) 0 0/20px 20px' }
        : { background: 'transparent' };
    default:
      return { background: '#1a1a2e' };
  }
}

// ── Animated props → ContentOptions ───────────────────────────────────────────

// Folds interpolated animation props onto the base content. Mirrors the shape the
// timeline produces (border radius collapses to a single linked fraction).
export function applyAnimatedProps(
  content: ContentOptions,
  anim: AnimatedProps | null,
): ContentOptions {
  if (!anim) return content;
  return {
    ...content,
    x: anim.x, y: anim.y, scale: anim.scale,
    rotation: anim.rotation, opacity: anim.opacity,
    borderRadius: {
      ...content.borderRadius, linked: true,
      all: anim.borderRadius, tl: anim.borderRadius, tr: anim.borderRadius,
      br: anim.borderRadius, bl: anim.borderRadius,
    },
  };
}

// ── Item layout ───────────────────────────────────────────────────────────────

export interface ItemLayout {
  dispW: number;          // displayed width  in canvas px
  dispH: number;          // displayed height in canvas px
  cx: number;             // centre x in canvas px
  cy: number;             // centre y in canvas px
  half: number;           // min(dispW,dispH)/2 — radius reference
  rFrac: number;          // effective border-radius fraction (0–1)
  borderRadiusCss: string;
}

// The ONE definition of how a source asset maps onto the canvas. The numeric
// geometry comes from `computeItemGeometry` in @mockup-forge/shared (shared with
// the backend hybrid compositor); this only adds the CSS border-radius string.
// `content` must already have any animation applied (see applyAnimatedProps).
export function computeItemLayout(
  content: ContentOptions,
  srcW: number, srcH: number,
  cw: number, ch: number,
): ItemLayout {
  const { dispW, dispH, cx, cy, half, rFrac } = computeItemGeometry(content, srcW, srcH, cw, ch);

  const br = content.borderRadius;
  // br values are fractions 0–1; multiply by half to get CSS pixels so the
  // radius scales correctly at any export resolution.
  const borderRadiusCss = br.linked
    ? `${br.all * half}px`
    : `${br.tl * half}px ${br.tr * half}px ${br.br * half}px ${br.bl * half}px`;

  return { dispW, dispH, cx, cy, half, rFrac, borderRadiusCss };
}

// ── Shadow ────────────────────────────────────────────────────────────────────

export function shadowCss(sh: ShadowConfig): string {
  return sh.opacity > 0
    ? `${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${hexToRgba(sh.color, sh.opacity)}`
    : 'none';
}
