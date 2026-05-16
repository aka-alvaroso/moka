export type BackgroundType = 'solid' | 'gradient' | 'mesh' | 'image' | 'transparent';
export type CanvasRatio =
  | '1:1' | '16:9' | '4:5' | '9:16' | '4:3' | 'custom'
  | 'ig-post' | 'ig-portrait' | 'ig-landscape' | 'ig-story'
  | 'x-post' | 'x-banner' | 'x-profile'
  | 'yt-thumbnail' | 'yt-banner'
  | 'fb-post' | 'fb-cover'
  | 'li-banner' | 'li-post'
  | 'profile-pic';
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
  base: string;
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

// ── Shadow ────────────────────────────────────────────────────────────────────

export interface ShadowConfig {
  color: string;    // hex
  opacity: number;  // 0–1
  x: number;        // px offset
  y: number;        // px offset
  blur: number;     // px
  spread: number;   // px
}

// ── Border radius ─────────────────────────────────────────────────────────────

export interface BorderRadiusConfig {
  linked: boolean;
  all: number;
  tl: number;
  tr: number;
  br: number;
  bl: number;
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
  borderRadius: BorderRadiusConfig;
  shadow: ShadowConfig;
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
