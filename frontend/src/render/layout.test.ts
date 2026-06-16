import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ContentOptions, AnimatedProps, Background } from '@mockup-forge/shared';
import {
  computeItemLayout, applyAnimatedProps, shadowCss, backgroundCss, hexToRgba,
} from './layout';

// These tests lock down the ONE geometry/CSS definition shared by the live
// preview (EditorCanvas) and every export target (RenderView → Puppeteer →
// PNG/JPG/MP4). If the formula changes, the golden values below fail and the
// visual baselines must be regenerated deliberately — preview and export can no
// longer silently diverge.

const baseContent: ContentOptions = {
  scale: 1, x: 50, y: 50, rotation: 0, opacity: 1,
  borderRadius: { linked: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 },
  shadow: { color: '#000000', opacity: 0, x: 0, y: 20, blur: 40, spread: 0 },
};

test('computeItemLayout: centred square fits to 80% of the short side', () => {
  const l = computeItemLayout(baseContent, 100, 100, 1000, 1000);
  assert.equal(l.dispW, 800);
  assert.equal(l.dispH, 800);
  assert.equal(l.cx, 500);
  assert.equal(l.cy, 500);
  assert.equal(l.half, 400);
  assert.equal(l.borderRadiusCss, '0px');
});

test('computeItemLayout: preserves aspect ratio (uniform fit scale)', () => {
  const l = computeItemLayout(baseContent, 200, 100, 1000, 1000);
  // fitScale = min(800/200, 800/100) = 4  → 800×400
  assert.equal(l.dispW, 800);
  assert.equal(l.dispH, 400);
});

test('computeItemLayout: scale and position map linearly', () => {
  const c: ContentOptions = { ...baseContent, scale: 0.5, x: 25, y: 75 };
  const l = computeItemLayout(c, 100, 100, 1000, 1000);
  assert.equal(l.dispW, 400);
  assert.equal(l.dispH, 400);
  assert.equal(l.cx, 250);
  assert.equal(l.cy, 750);
});

test('computeItemLayout: linked border radius is a fraction of half', () => {
  const c: ContentOptions = { ...baseContent, borderRadius: { linked: true, all: 0.5, tl: 0.5, tr: 0.5, br: 0.5, bl: 0.5 } };
  const l = computeItemLayout(c, 100, 100, 1000, 1000);
  assert.equal(l.rFrac, 0.5);
  assert.equal(l.borderRadiusCss, '200px'); // 0.5 * half(400)
});

test('computeItemLayout: resolution-independent (2x canvas ⇒ 2x geometry)', () => {
  const a = computeItemLayout(baseContent, 100, 100, 1000, 1000);
  const b = computeItemLayout(baseContent, 100, 100, 2000, 2000);
  assert.equal(b.dispW, a.dispW * 2);
  assert.equal(b.cx, a.cx * 2);
  assert.equal(b.borderRadiusCss, '0px');
});

test('applyAnimatedProps: folds animated transform onto content', () => {
  const anim: AnimatedProps = { x: 10, y: 90, scale: 2, rotation: 45, opacity: 0.3, borderRadius: 0.25 };
  const live = applyAnimatedProps(baseContent, anim);
  assert.equal(live.x, 10);
  assert.equal(live.rotation, 45);
  assert.equal(live.opacity, 0.3);
  assert.equal(live.borderRadius.linked, true);
  assert.equal(live.borderRadius.all, 0.25);
});

test('applyAnimatedProps: null is a no-op (returns base content)', () => {
  assert.equal(applyAnimatedProps(baseContent, null), baseContent);
});

test('shadowCss: hidden when opacity is 0, otherwise full CSS box-shadow', () => {
  assert.equal(shadowCss(baseContent.shadow), 'none');
  const s = shadowCss({ color: '#ff0000', opacity: 0.5, x: 4, y: 8, blur: 12, spread: 2 });
  assert.equal(s, '4px 8px 12px 2px rgba(255,0,0,0.5)');
});

test('hexToRgba parses 6-digit hex', () => {
  assert.equal(hexToRgba('#3366ff', 0.8), 'rgba(51,102,255,0.8)');
});

test('backgroundCss: transparent differs by target', () => {
  const bg: Background = { type: 'transparent' };
  assert.match(String(backgroundCss(bg, 'checkerboard').background), /repeating-conic-gradient/);
  assert.equal(backgroundCss(bg, 'alpha').background, 'transparent');
});

test('backgroundCss: gradient matches CSS linear-gradient', () => {
  const bg: Background = { type: 'gradient', gradient: { from: '#111', to: '#222', direction: 90 } };
  assert.equal(backgroundCss(bg, 'alpha').background, 'linear-gradient(90deg,#111,#222)');
});
