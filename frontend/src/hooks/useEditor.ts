import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Background, CanvasConfig, ContentOptions,
  AnimationConfig, AnimationKeyframe, AnimatedProps,
} from '@mockup-forge/shared';

export interface EditorState {
  fileId: string | null;
  previewUrl: string | null;
  isVideo: boolean;
  srcW: number;
  srcH: number;
  background: Background;
  canvas: CanvasConfig;
  content: ContentOptions;
  animation: AnimationConfig;
}

const DEFAULT_ANIMATION: AnimationConfig = {
  enabled: false,
  duration: 3,
  fps: 30,
  keyframes: [],
};

const DEFAULT: EditorState = {
  fileId: null,
  previewUrl: null,
  isVideo: false,
  srcW: 1,
  srcH: 1,
  background: {
    type: 'solid',
    color: '#0f0f0f',
  },
  canvas: { ratio: '1:1' },
  content: {
    scale: 1,
    x: 50,
    y: 50,
    rotation: 0,
    opacity: 1,
    borderRadius: { linked: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 },
    shadow: { color: '#000000', opacity: 0, x: 0, y: 20, blur: 40, spread: 0 },
  },
  animation: DEFAULT_ANIMATION,
};

export function contentToAnimatedProps(c: ContentOptions): AnimatedProps {
  return {
    x: c.x,
    y: c.y,
    scale: c.scale,
    rotation: c.rotation,
    opacity: c.opacity,
    borderRadius: c.borderRadius.linked ? c.borderRadius.all : Math.round((c.borderRadius.tl + c.borderRadius.tr + c.borderRadius.br + c.borderRadius.bl) / 4),
  };
}

export function useEditor() {
  const [state, setState] = useState<EditorState>(DEFAULT);

  const setFile = (fileId: string, previewUrl: string, isVideo: boolean, srcW: number, srcH: number) =>
    setState((s) => ({ ...s, fileId, previewUrl, isVideo, srcW, srcH }));

  const setBackground = (background: Background) =>
    setState((s) => ({ ...s, background }));

  const setCanvas = (canvas: CanvasConfig) =>
    setState((s) => ({ ...s, canvas }));

  const setContent = (patch: Partial<ContentOptions>) =>
    setState((s) => ({ ...s, content: { ...s.content, ...patch } }));

  // Sets content and immediately snapshots a keyframe at the given time — single atomic update
  const setContentAndKeyframe = (patch: Partial<ContentOptions>, time: number) =>
    setState((s) => {
      const newContent = { ...s.content, ...patch };
      const props = contentToAnimatedProps(newContent);
      const existing = s.animation.keyframes.find((k) => Math.abs(k.time - time) < 0.01);
      const keyframes = existing
        ? s.animation.keyframes.map((k) => k.id === existing.id ? { ...k, props } : k)
        : [...s.animation.keyframes, { id: uuidv4(), time, props, easing: 'ease-in-out' as const }];
      return { ...s, content: newContent, animation: { ...s.animation, keyframes: keyframes.sort((a, b) => a.time - b.time) } };
    });

  const setAnimation = (patch: Partial<AnimationConfig>) =>
    setState((s) => ({ ...s, animation: { ...s.animation, ...patch } }));

  const addKeyframe = (time: number) =>
    setState((s) => {
      const props = contentToAnimatedProps(s.content);
      const existing = s.animation.keyframes.find((k) => Math.abs(k.time - time) < 0.01);
      if (existing) {
        // Update existing keyframe at this time
        return {
          ...s,
          animation: {
            ...s.animation,
            keyframes: s.animation.keyframes
              .map((k) => k.id === existing.id ? { ...k, props } : k)
              .sort((a, b) => a.time - b.time),
          },
        };
      }
      const kf: AnimationKeyframe = { id: uuidv4(), time, props, easing: 'ease-in-out' };
      return {
        ...s,
        animation: {
          ...s.animation,
          keyframes: [...s.animation.keyframes, kf].sort((a, b) => a.time - b.time),
        },
      };
    });

  const removeKeyframe = (id: string) =>
    setState((s) => ({
      ...s,
      animation: {
        ...s.animation,
        keyframes: s.animation.keyframes.filter((k) => k.id !== id),
      },
    }));

  const updateKeyframeEasing = (id: string, easing: AnimationKeyframe['easing']) =>
    setState((s) => ({
      ...s,
      animation: {
        ...s.animation,
        keyframes: s.animation.keyframes.map((k) => k.id === id ? { ...k, easing } : k),
      },
    }));

  return {
    state, setFile, setBackground, setCanvas, setContent, setContentAndKeyframe,
    setAnimation, addKeyframe, removeKeyframe, updateKeyframeEasing,
  };
}
