// Keyframe animation MP4 export.
//
// Two paths, same browser-exact output:
//
//   SPLIT (fast):  one video + a meaningful static hold after the animation.
//                  Puppeteer renders only the short animated span; FFmpeg
//                  composites the playing video over baked plates for the hold.
//                  See animationSplitRenderer.
//
//   FRAMES (fallback): everything else (image-only, multi-video, all-animation).
//                  Every frame is captured in the browser — slower but universal.
//
// Interpolation happens IN THE BROWSER (RenderView uses the same `lib/interpolate`
// as the live preview), so the backend never owns a second copy of the easing.

import type { MultiAnimationRenderPayload, PuppeteerItem } from '@mockup-forge/shared';
import { renderFrames, getCanvasSize } from './frameRenderer';
import { canUseAnimationSplit, renderAnimationSplit } from './animationSplitRenderer';

export async function renderAnimation(
  payload: MultiAnimationRenderPayload,
  signal?: AbortSignal,
): Promise<string> {
  // ── Fast split path ──────────────────────────────────────────────────────────
  if (canUseAnimationSplit(payload)) {
    console.log('[animationRenderer] using split Puppeteer+FFmpeg path');
    return renderAnimationSplit(payload, signal);
  }

  // ── Universal frame-capture path ───────────────────────────────────────────────
  console.log('[animationRenderer] using Puppeteer frame-capture path');

  const { duration, fps, items, background, canvas } = payload;
  const { w: canvasW, h: canvasH } = getCanvasSize(canvas);

  const puppItems: PuppeteerItem[] = items.map((item) => ({
    id: item.id,
    fileId: item.fileId,
    isVideo: item.isVideo,
    srcW: item.srcW,
    srcH: item.srcH,
    content: item.content,
    zIndex: item.zIndex,
    keyframes: item.keyframes,
  }));

  return renderFrames({
    items: puppItems,
    background,
    canvas,
    canvasW, canvasH,
    durationSec: duration,
    fps,
    signal,
  });
}
