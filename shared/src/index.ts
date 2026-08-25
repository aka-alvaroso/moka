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
export type VideoEndBehavior = 'loop' | 'freeze' | 'hide';

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
  opacity: number;
  borderRadius: BorderRadiusConfig;
  shadow: ShadowConfig;
}

// ── Animation ─────────────────────────────────────────────────────────────────

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';

export interface AnimatedProps {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  borderRadius: number;
}

export interface AnimationKeyframe {
  id: string;
  time: number;        // seconds from start
  props: AnimatedProps;
  easing: EasingType;  // easing FROM this keyframe TO the next
}

export interface AnimationConfig {
  enabled: boolean;
  duration: number;    // seconds
  fps: 24 | 30 | 60;
  keyframes: AnimationKeyframe[];
}

// ── Media item ────────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  fileId: string;
  previewUrl: string;        // local blob URL or /api/download/fileId
  isVideo: boolean;
  srcW: number;
  srcH: number;
  content: ContentOptions;
  keyframes: AnimationKeyframe[];
  videoEndBehavior: VideoEndBehavior;
  zIndex: number;
  name?: string;
}

// ── Puppeteer render state (stored on backend, fetched by RenderView) ─────────

export interface PuppeteerItem {
  id: string;
  fileId: string;
  isVideo: boolean;
  srcW: number;
  srcH: number;
  content: ContentOptions;
  zIndex: number;
  // When present (≥2 keyframes) the render view interpolates `content` at the
  // state's `time`, using the SAME easing/interpolation as the live preview.
  keyframes?: AnimationKeyframe[];
  // Plate mode: render the styled box (shadow, radius, rotation) but NOT the
  // media fill. Used by the hybrid video renderer to capture the static scene
  // once and let FFmpeg composite the moving video into the transparent hole.
  hideMedia?: boolean;
}

export interface PuppeteerRenderState {
  items: PuppeteerItem[];
  background: Background;
  canvas: CanvasConfig;
  canvasW: number;
  canvasH: number;
  // Timeline position (seconds) for this frame. Drives keyframe interpolation
  // and per-video seeking so a captured frame matches the preview at that time.
  time?: number;
}

// ── API payloads ──────────────────────────────────────────────────────────────

export interface RenderItem {
  id: string;
  fileId: string;
  isVideo: boolean;
  srcW: number;
  srcH: number;
  content: ContentOptions;
  zIndex: number;
}

export interface MultiRenderPayload {
  items: RenderItem[];
  background: Background;
  canvas: CanvasConfig;
  format: ExportFormat;
  resolution?: '1x' | '2x' | '3x';
  // Client-generated id used to poll GET /api/render/progress/:jobId while this
  // render is in flight. Optional — omit it and no progress is tracked.
  jobId?: string;
}

export interface MultiAnimationRenderPayload {
  items: Array<RenderItem & { keyframes: AnimationKeyframe[] }>;
  background: Background;
  canvas: CanvasConfig;
  duration: number;
  fps: 24 | 30 | 60;
  jobId?: string;
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

// ── Scene geometry (single source of truth) ───────────────────────────────────
//
// Pure numeric mapping of a source asset onto the canvas. Lives here so the
// frontend layout module (CSS) AND the backend hybrid video compositor (FFmpeg
// overlay coordinates) compute the EXACT same box — no drift between preview and
// export. `content` must already have any animation folded in.

export interface ItemGeometry {
  dispW: number;  // displayed width  in canvas px
  dispH: number;  // displayed height in canvas px
  cx: number;     // centre x in canvas px
  cy: number;     // centre y in canvas px
  half: number;   // min(dispW,dispH)/2 — radius reference
  rFrac: number;  // effective border-radius fraction (0–1)
}

export function computeItemGeometry(
  content: ContentOptions,
  srcW: number, srcH: number,
  cw: number, ch: number,
): ItemGeometry {
  const shortSide = Math.min(cw, ch) * 0.8;
  const fitScale = srcW > 0 && srcH > 0
    ? Math.min(shortSide / srcW, shortSide / srcH)
    : 1;
  const dispW = Math.max(4, srcW * fitScale * content.scale);
  const dispH = Math.max(4, srcH * fitScale * content.scale);
  const cx = (content.x / 100) * cw;
  const cy = (content.y / 100) * ch;

  const br = content.borderRadius;
  const half = Math.min(dispW, dispH) / 2;
  const rFrac = br.linked ? br.all : Math.max(br.tl, br.tr, br.br, br.bl);

  return { dispW, dispH, cx, cy, half, rFrac };
}

// ── Legacy (kept for videoRenderer compatibility) ─────────────────────────────

export interface RenderPayload {
  fileId: string;
  background: Background;
  canvas: CanvasConfig;
  content: ContentOptions;
  format: ExportFormat;
  resolution?: '1x' | '2x' | '3x';
}
