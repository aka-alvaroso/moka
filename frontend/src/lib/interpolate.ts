import type { AnimatedProps, AnimationKeyframe, EasingType } from '@mockup-forge/shared';

// ── Easing functions ──────────────────────────────────────────────────────────

// Spring: cubic-bezier approximation (0.34, 1.56, 0.64, 1)
// Overshoots ~10% then settles to exactly 1.0 at t=1.
// Unlike physics spring, this always completes within the keyframe span.
function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sampleX  = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY  = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const d = sampleDX(u);
      if (Math.abs(d) < 1e-10) break;
      u -= (sampleX(u) - x) / d;
    }
    return sampleY(u);
  };
}

const springEasing = cubicBezier(0.34, 1.56, 0.64, 1);

export function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'linear':      return t;
    case 'ease-in':     return t * t * t;
    case 'ease-out':    return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'spring':      return springEasing(t);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Main interpolation ────────────────────────────────────────────────────────

export function interpolateProps(keyframes: AnimationKeyframe[], time: number): AnimatedProps | null {
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0].props;

  // Before first keyframe
  if (time <= keyframes[0].time) return keyframes[0].props;

  // After last keyframe
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].props;

  // Find surrounding keyframes
  let from = keyframes[0];
  let to   = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      from = keyframes[i];
      to   = keyframes[i + 1];
      break;
    }
  }

  const span = to.time - from.time;
  if (span <= 0) return to.props;

  const raw = (time - from.time) / span;
  const t   = applyEasing(raw, from.easing);

  return {
    x:            lerp(from.props.x,            to.props.x,            t),
    y:            lerp(from.props.y,            to.props.y,            t),
    scale:        lerp(from.props.scale,        to.props.scale,        t),
    rotation:     lerp(from.props.rotation,     to.props.rotation,     t),
    opacity:      lerp(from.props.opacity,      to.props.opacity,      t),
    borderRadius: lerp(from.props.borderRadius, to.props.borderRadius, t),
  };
}
