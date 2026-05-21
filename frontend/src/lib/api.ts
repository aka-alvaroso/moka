import type { UploadResponse, RenderResponse, RenderPayload, AnimationKeyframe } from '@mockup-forge/shared';

export interface AnimationRenderPayload extends RenderPayload {
  duration: number;
  fps: 24 | 30 | 60;
  keyframes: AnimationKeyframe[];
}

const BASE = '/api';

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function renderExport(payload: RenderPayload): Promise<RenderResponse> {
  const res = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function renderAnimationExport(payload: AnimationRenderPayload): Promise<RenderResponse> {
  const res = await fetch(`${BASE}/render/animation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function downloadUrl(fileId: string): string {
  return `${BASE}/download/${fileId}`;
}

export async function fetchMediaInfo(fileId: string): Promise<{ width: number; height: number }> {
  const res = await fetch(`${BASE}/mediainfo/${fileId}`);
  if (!res.ok) return { width: 0, height: 0 };
  return res.json();
}
