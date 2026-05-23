import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Background, CanvasConfig, ContentOptions,
  AnimationKeyframe, AnimatedProps, MediaItem, EasingType,
} from '@mockup-forge/shared';

export interface EditorState {
  mediaItems: MediaItem[];
  selectedItemId: string | null;
  background: Background;
  canvas: CanvasConfig;
  animationEnabled: boolean;
  animationDuration: number;
  animationFps: 24 | 30 | 60;
}

const DEFAULT_CONTENT: ContentOptions = {
  scale: 1, x: 50, y: 50, rotation: 0, opacity: 1,
  borderRadius: { linked: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 },
  shadow: { color: '#000000', opacity: 0, x: 0, y: 20, blur: 40, spread: 0 },
};

const DEFAULT: EditorState = {
  mediaItems: [],
  selectedItemId: null,
  background: { type: 'solid', color: '#0f0f0f' },
  canvas: { ratio: '1:1' },
  animationEnabled: false,
  animationDuration: 3,
  animationFps: 30,
};

export function contentToAnimatedProps(c: ContentOptions): AnimatedProps {
  return {
    x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, opacity: c.opacity,
    borderRadius: c.borderRadius.linked
      ? c.borderRadius.all
      : Math.round((c.borderRadius.tl + c.borderRadius.tr + c.borderRadius.br + c.borderRadius.bl) / 4),
  };
}

function updateItem(items: MediaItem[], id: string, updater: (item: MediaItem) => MediaItem): MediaItem[] {
  return items.map((item) => item.id === id ? updater(item) : item);
}

export function useEditor() {
  const [state, setState] = useState<EditorState>(DEFAULT);

  // ── Media items ─────────────────────────────────────────────────────────────

  const addItem = (
    fileId: string, previewUrl: string, isVideo: boolean, srcW: number, srcH: number,
  ) => setState((s) => {
    const id = uuidv4();
    const newItem: MediaItem = {
      id, fileId, previewUrl, isVideo, srcW, srcH,
      content: { ...DEFAULT_CONTENT },
      keyframes: [],
      videoEndBehavior: 'loop',
      zIndex: s.mediaItems.length,
    };
    return { ...s, mediaItems: [...s.mediaItems, newItem], selectedItemId: id };
  });

  const removeItem = (id: string) => setState((s) => {
    const remaining = s.mediaItems.filter((i) => i.id !== id);
    const newSelected = s.selectedItemId === id
      ? (remaining[remaining.length - 1]?.id ?? null)
      : s.selectedItemId;
    return { ...s, mediaItems: remaining, selectedItemId: newSelected };
  });

  const selectItem = (id: string | null) =>
    setState((s) => ({ ...s, selectedItemId: id }));

  const reorderItem = (id: string, direction: 'up' | 'down') => setState((s) => {
    const items = [...s.mediaItems].sort((a, b) => a.zIndex - b.zIndex);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return s;
    const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= items.length) return s;
    const updated = items.map((item) => {
      if (item.id === items[idx].id) return { ...item, zIndex: items[swapIdx].zIndex };
      if (item.id === items[swapIdx].id) return { ...item, zIndex: items[idx].zIndex };
      return item;
    });
    return { ...s, mediaItems: updated };
  });

  // ── Item content ────────────────────────────────────────────────────────────

  const setItemContent = (id: string, patch: Partial<ContentOptions>) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, id, (item) => ({
        ...item, content: { ...item.content, ...patch },
      })),
    }));

  const setItemContentAndKeyframe = (id: string, patch: Partial<ContentOptions>, time: number) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, id, (item) => {
        const newContent = { ...item.content, ...patch };
        const props = contentToAnimatedProps(newContent);
        const existing = item.keyframes.find((k) => Math.abs(k.time - time) < 0.01);
        const keyframes = existing
          ? item.keyframes.map((k) => k.id === existing.id ? { ...k, props } : k)
          : [...item.keyframes, { id: uuidv4(), time, props, easing: 'ease-in-out' as const }];
        return { ...item, content: newContent, keyframes: keyframes.sort((a, b) => a.time - b.time) };
      }),
    }));

  const setItemVideoEndBehavior = (id: string, behavior: MediaItem['videoEndBehavior']) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, id, (item) => ({ ...item, videoEndBehavior: behavior })),
    }));

  // ── Keyframes ───────────────────────────────────────────────────────────────

  const addKeyframe = (itemId: string, time: number) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, itemId, (item) => {
        const props = contentToAnimatedProps(item.content);
        const existing = item.keyframes.find((k) => Math.abs(k.time - time) < 0.01);
        if (existing) {
          return { ...item, keyframes: item.keyframes.map((k) => k.id === existing.id ? { ...k, props } : k).sort((a, b) => a.time - b.time) };
        }
        const kf: AnimationKeyframe = { id: uuidv4(), time, props, easing: 'ease-in-out' };
        return { ...item, keyframes: [...item.keyframes, kf].sort((a, b) => a.time - b.time) };
      }),
    }));

  const removeKeyframe = (itemId: string, kfId: string) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, itemId, (item) => ({
        ...item, keyframes: item.keyframes.filter((k) => k.id !== kfId),
      })),
    }));

  const updateKeyframeEasing = (itemId: string, kfId: string, easing: EasingType) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, itemId, (item) => ({
        ...item, keyframes: item.keyframes.map((k) => k.id === kfId ? { ...k, easing } : k),
      })),
    }));

  const clearKeyframes = (itemId: string) =>
    setState((s) => ({
      ...s,
      mediaItems: updateItem(s.mediaItems, itemId, (item) => ({ ...item, keyframes: [] })),
    }));

  // ── Global settings ─────────────────────────────────────────────────────────

  const setBackground = (background: Background) =>
    setState((s) => ({ ...s, background }));

  const setCanvas = (canvas: CanvasConfig) =>
    setState((s) => ({ ...s, canvas }));

  const setAnimationConfig = (patch: Partial<Pick<EditorState, 'animationEnabled' | 'animationDuration' | 'animationFps'>>) =>
    setState((s) => ({ ...s, ...patch }));

  return {
    state,
    addItem, removeItem, selectItem, reorderItem,
    setItemContent, setItemContentAndKeyframe, setItemVideoEndBehavior,
    addKeyframe, removeKeyframe, updateKeyframeEasing, clearKeyframes,
    setBackground, setCanvas, setAnimationConfig,
  };
}
