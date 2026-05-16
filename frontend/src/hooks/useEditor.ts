import { useState } from 'react';
import type { Background, CanvasConfig, ContentOptions } from '@mockup-forge/shared';

export interface EditorState {
  fileId: string | null;
  previewUrl: string | null;
  isVideo: boolean;
  srcW: number;
  srcH: number;
  background: Background;
  canvas: CanvasConfig;
  content: ContentOptions;
}

const DEFAULT: EditorState = {
  fileId: null,
  previewUrl: null,
  isVideo: false,
  srcW: 1,
  srcH: 1,
  background: {
    type: 'gradient',
    gradient: { from: '#1a1a2e', to: '#16213e', direction: 135 },
  },
  canvas: { ratio: '1:1' },
  content: {
    scale: 1,
    x: 50,
    y: 50,
    rotation: 0,
    borderRadius: { linked: true, all: 0, tl: 0, tr: 0, br: 0, bl: 0 },
    shadow: { color: '#000000', opacity: 0, x: 0, y: 20, blur: 40, spread: 0 },
  },
};

export function useEditor() {
  const [state, setState] = useState<EditorState>(DEFAULT);

  const setFile = (
    fileId: string,
    previewUrl: string,
    isVideo: boolean,
    srcW: number,
    srcH: number
  ) => setState((s) => ({ ...s, fileId, previewUrl, isVideo, srcW, srcH }));

  const setBackground = (background: Background) =>
    setState((s) => ({ ...s, background }));

  const setCanvas = (canvas: CanvasConfig) =>
    setState((s) => ({ ...s, canvas }));

  const setContent = (patch: Partial<ContentOptions>) =>
    setState((s) => ({ ...s, content: { ...s.content, ...patch } }));

  return { state, setFile, setBackground, setCanvas, setContent };
}
