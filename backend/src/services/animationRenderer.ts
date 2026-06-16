// Keyframe animation MP4 export.
//
// Interpolation now happens IN THE BROWSER (RenderView uses the same
// `lib/interpolate` as the live preview), so the backend no longer owns a second
// copy of the easing curves. Here we just forward the keyframes + per-frame
// `time` and let frameRenderer capture/encode.

import type { MultiAnimationRenderPayload, PuppeteerItem } from '@mockup-forge/shared';
import { renderFrames, getCanvasSize } from './frameRenderer';

export async function renderAnimation(payload: MultiAnimationRenderPayload): Promise<string> {
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
  });
}
