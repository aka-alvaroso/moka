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

export function renderExport(payload: MultiRenderPayload, onProgress?: (pct: number) => void): Promise<RenderResponse> {
  return postRenderWithProgress(`${BASE}/render`, payload, onProgress);
}

export function renderAnimationExport(payload: MultiAnimationRenderPayload, onProgress?: (pct: number) => void): Promise<RenderResponse> {
  return postRenderWithProgress(`${BASE}/render/animation`, payload, onProgress);
}

// Puppeteer/FFmpeg exports run server-side with no request body to track (unlike
// upload's byte-progress XHR event), so instead we tag the request with a jobId
// the backend reports progress under, and poll GET /render/progress/:jobId
// alongside the main POST while it's in flight.
async function postRenderWithProgress<T extends { jobId?: string }>(
  url: string, payload: T, onProgress?: (pct: number) => void,
): Promise<RenderResponse> {
  // Callers that want the job to survive a reload generate the jobId themselves
  // (so they can stash it before the request goes out); otherwise generate one
  // here purely to drive the progress bar for this request's lifetime.
  const jobId = payload.jobId ?? (onProgress ? crypto.randomUUID() : undefined);
  const body = jobId ? { ...payload, jobId } : payload;

  let polling = !!jobId;
  const poll = async () => {
    while (polling) {
      await new Promise((r) => setTimeout(r, 500));
      if (!polling) break;
      try {
        const res = await fetch(`${BASE}/render/progress/${jobId}`);
        if (res.ok) {
          const { percent } = await res.json() as { percent: number };
          onProgress?.(percent);
        }
      } catch { /* transient — next tick retries */ }
    }
  };
  if (jobId) poll();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } finally {
    polling = false;
  }
}

interface ProgressPollResult {
  percent: number;
  phase: 'queued' | 'preparing' | 'capturing' | 'encoding' | 'done' | 'error';
  result?: RenderResponse;
  error?: string;
}

// Reconnects to a render job that's still running (or already finished) on the
// backend after this page lost track of it — e.g. a reload mid-export. Doesn't
// re-submit anything; the original POST already kicked the job off, so this
// just polls until it lands on a terminal phase.
export async function resumeRenderJob(jobId: string, onProgress?: (pct: number) => void): Promise<RenderResponse> {
  // If the job was never picked up (or its progress entry already expired),
  // "queued" never advances — bail out after a while instead of polling forever.
  const MAX_STALE_POLLS = 20; // ~16s at 800ms/poll
  let stalePolls = 0;

  for (;;) {
    const res = await fetch(`${BASE}/render/progress/${jobId}`);
    if (res.ok) {
      const data = await res.json() as ProgressPollResult;
      onProgress?.(data.percent);
      if (data.phase === 'done' && data.result) return data.result;
      if (data.phase === 'error') throw new Error(data.error ?? 'Export failed');
      stalePolls = data.phase === 'queued' ? stalePolls + 1 : 0;
      if (stalePolls >= MAX_STALE_POLLS) throw new Error('Export status unknown — it may have finished before this page reconnected.');
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

export function downloadUrl(fileId: string): string {
  return `${BASE}/download/${fileId}`;
}

export async function fetchMediaInfo(fileId: string): Promise<{ width: number; height: number; duration: number }> {
  const res = await fetch(`${BASE}/mediainfo/${fileId}`);
  if (!res.ok) return { width: 0, height: 0, duration: 0 };
  return res.json();
}
