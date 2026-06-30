import { v4 as uuidv4 } from 'uuid';
import type { AnimationKeyframe, AnimatedProps, EasingType } from '@mockup-forge/shared';

export interface PresetOptions {
  effectDuration: number;
  delay: number;
  easing: EasingType;
}

export interface AnimationPreset {
  id: string;
  label: string;
  category: 'in' | 'out';
}

function kf(time: number, props: AnimatedProps, easing: EasingType): AnimationKeyframe {
  return { id: uuidv4(), time: Math.max(0, Math.round(time * 100) / 100), props, easing };
}

export function generateKeyframes(
  presetId: string,
  base: AnimatedProps,
  opts: PresetOptions,
): AnimationKeyframe[] {
  const { effectDuration: d, delay, easing } = opts;
  switch (presetId) {
    case 'fade-in':
      return [kf(delay, { ...base, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'slide-up':
      return [kf(delay, { ...base, y: base.y + 8, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'slide-down':
      return [kf(delay, { ...base, y: base.y - 8, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'slide-left':
      return [kf(delay, { ...base, x: base.x + 10, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'slide-right':
      return [kf(delay, { ...base, x: base.x - 10, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'scale-in':
      return [kf(delay, { ...base, scale: base.scale * 0.65, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'bounce-in':
      return [kf(delay, { ...base, scale: base.scale * 0.5, opacity: 0 }, 'spring'), kf(delay + d, base, 'linear')];
    case 'rotate-in':
      return [kf(delay, { ...base, rotation: base.rotation - 12, opacity: 0 }, easing), kf(delay + d, base, 'linear')];
    case 'fade-out':
      return [kf(delay, base, easing), kf(delay + d, { ...base, opacity: 0 }, 'linear')];
    case 'scale-out':
      return [kf(delay, base, easing), kf(delay + d, { ...base, scale: base.scale * 1.2, opacity: 0 }, 'linear')];
    default:
      return [];
  }
}

export const PRESETS: AnimationPreset[] = [
  { id: 'fade-in',     label: 'Fade In',     category: 'in'  },
  { id: 'slide-up',    label: 'Slide Up',    category: 'in'  },
  { id: 'slide-down',  label: 'Slide Down',  category: 'in'  },
  { id: 'slide-left',  label: 'Slide Left',  category: 'in'  },
  { id: 'slide-right', label: 'Slide Right', category: 'in'  },
  { id: 'scale-in',    label: 'Scale In',    category: 'in'  },
  { id: 'bounce-in',   label: 'Bounce In',   category: 'in'  },
  { id: 'rotate-in',   label: 'Rotate In',   category: 'in'  },
  { id: 'fade-out',    label: 'Fade Out',    category: 'out' },
  { id: 'scale-out',   label: 'Scale Out',   category: 'out' },
];

// Framer-motion config for animated preview squares in each preset card
export const PRESET_MOTION: Record<string, {
  initial: Record<string, number>;
  animate: Record<string, number>;
  transition?: Record<string, unknown>;
  repeatType?: 'reverse' | 'loop';
}> = {
  'fade-in':     { initial: { opacity: 0 },                animate: { opacity: 1 } },
  'slide-up':    { initial: { opacity: 0, y: 8 },          animate: { opacity: 1, y: 0 } },
  'slide-down':  { initial: { opacity: 0, y: -8 },         animate: { opacity: 1, y: 0 } },
  'slide-left':  { initial: { opacity: 0, x: 8 },          animate: { opacity: 1, x: 0 } },
  'slide-right': { initial: { opacity: 0, x: -8 },         animate: { opacity: 1, x: 0 } },
  'scale-in':    { initial: { opacity: 0, scale: 0.5 },    animate: { opacity: 1, scale: 1 } },
  'bounce-in':   { initial: { opacity: 0, scale: 0.4 },    animate: { opacity: 1, scale: 1 }, transition: { type: 'spring', stiffness: 260, damping: 10 }, repeatType: 'loop' },
  'rotate-in':   { initial: { opacity: 0, rotate: -15 },   animate: { opacity: 1, rotate: 0 } },
  'fade-out':    { initial: { opacity: 1 },                animate: { opacity: 0 } },
  'scale-out':   { initial: { opacity: 1, scale: 1 },      animate: { opacity: 0, scale: 1.3 } },
};
