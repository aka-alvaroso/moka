export type BackgroundType = 'solid' | 'gradient' | 'mesh' | 'image' | 'transparent';
export type CanvasRatio    = '1:1' | '16:9' | '4:5' | '9:16' | 'custom';
export type ExportFormat   = 'png' | 'jpg' | 'mp4';

// ── Mesh ─────────────────────────────────────────────────────────────────────

export interface MeshBlob {
  id: string;
  x: number;       // 0–100 (% of canvas)
  y: number;       // 0–100
  color: string;   // hex #rrggbb
  size: number;    // 20–150 (radius as % of canvas diagonal)
  opacity: number; // 0–1
}

export interface MeshConfig {
  base: string;       // solid base color hex
  blobs: MeshBlob[];
}

// ── Background ────────────────────────────────────────────────────────────────

export interface Background {
  type: BackgroundType;
  color?: string;
  gradient?: { from: string; to: string; direction: number };
  mesh?: MeshConfig;
  imageFileId?: string;
}

// ── Canvas / content ──────────────────────────────────────────────────────────

export interface CanvasConfig {
  ratio: CanvasRatio;
  width?: number;
  height?: number;
}

export interface ContentOptions {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  borderRadius: number;
  shadow: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

export interface RenderPayload {
  fileId: string;
  background: Background;
  canvas: CanvasConfig;
  content: ContentOptions;
  format: ExportFormat;
  resolution?: '1x' | '2x' | '3x';
}

export interface UploadResponse {
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
  isVideo: boolean;
}

export interface RenderResponse {
  fileId: string;
  downloadUrl: string;
}
