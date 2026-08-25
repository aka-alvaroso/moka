// Tracks the one export job that might still be running server-side across a
// page reload — the render itself isn't tied to the tab that started it, only
// the in-memory UI state showing its progress is. Stashing the jobId here lets
// ExportDrawer reconnect to it (via GET /render/progress/:jobId) after reload.

const KEY = 'moka:activeExportJob';

export interface StoredExportJob {
  jobId: string;
  /** Filename to give the downloaded file once the job completes. */
  filename: string;
}

export function saveActiveExportJob(job: StoredExportJob): void {
  try { localStorage.setItem(KEY, JSON.stringify(job)); } catch { /* storage unavailable — export just won't survive reload */ }
}

export function loadActiveExportJob(): StoredExportJob | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredExportJob) : null;
  } catch { return null; }
}

export function clearActiveExportJob(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
