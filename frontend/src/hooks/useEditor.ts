import { useState } from 'react';
import type { Background, CanvasConfig, ContentOptions } from '@mockup-forge/shared';

export interface EditorState {
  fileId: string | null;
  previewUrl: string | null;
  isVideo: boolean;
  // Natural dimensions of the uploaded file (for preview aspect ratio)
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
    type: 'mesh',
    mesh: {
      base: '#0f0c29',
      blobs: [
        { id: 'a', x: 20, y: 30, color: '#6366f1', size: 90, opacity: 0.85 },
        { id: 'b', x: 78, y: 65, color: '#ec4899', size: 75, opacity: 0.75 },
        { id: 'c', x: 55, y: 85, color: '#3b82f6', size: 65, opacity: 0.65 },
      ],
    },
  },
  canvas: { ratio: '1:1' },
  content: {
    scale: 1,
    x: 50,
    y: 50,
    rotation: 0,
    borderRadius: 0,
    shadow: 0,
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
