import type { AnimatedProps, AnimationKeyframe, EasingType } from '@mockup-forge/shared';

// ── Easing functions ──────────────────────────────────────────────────────────

// Spring: underdamped oscillation that settles at 1
// stiffness=180, damping=12 — feels snappy but bouncy
function springEasing(t: number): number {
  const stiffness = 180;
  const damping   = 12;
  const mass      = 1;
  const w0        = Math.sqrt(stiffness / mass);
  const zeta      = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

export function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'linear':      return t;
    case 'ease-in':     return t * t * t;
    case 'ease-out':    return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'spring':      return Math.min(1, springEasing(t * 6)); // scale t so 1s feels like full spring
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
