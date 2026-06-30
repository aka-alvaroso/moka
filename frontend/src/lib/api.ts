import type {
  UploadResponse, RenderResponse, MultiRenderPayload, MultiAnimationRenderPayload,
} from '@mockup-forge/shared';

const BASE = import.meta.env.VITE_API_URL ?? `${import.meta.env.BASE_URL}api`;

export function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/upload`);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response')); }
      } else {
        reject(new Error(xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

export async function renderExport(payload: MultiRenderPayload): Promise<RenderResponse> {
  const res = await fetch(`${BASE}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function renderAnimationExport(payload: MultiAnimationRenderPayload): Promise<RenderResponse> {
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

export async function fetchMediaInfo(fileId: string): Promise<{ width: number; height: number; duration: number }> {
  const res = await fetch(`${BASE}/mediainfo/${fileId}`);
  if (!res.ok) return { width: 0, height: 0, duration: 0 };
  return res.json();
}
