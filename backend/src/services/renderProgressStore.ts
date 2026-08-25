// In-memory progress store for long-running renders (video / animation MP4
// exports), keyed by a client-generated jobId. Same TTL-pruned Map pattern as
// renderStateStore — no persistence needed, entries just need to outlive one
// export's polling window.
//
// The render itself is NOT tied to the client's connection (enqueueRender runs
// regardless of whether the original POST's socket is still open), so a page
// reload mid-export doesn't kill the job — it just orphans the client from the
// POST response that would have carried the result. Storing the finished
// result (or error) here, keyed by the same jobId, lets a reloaded page recover
// it by polling GET /render/progress/:jobId instead of re-submitting.

interface ProgressEntry {
  percent: number;
  phase: 'preparing' | 'capturing' | 'encoding' | 'done' | 'error';
  result?: { fileId: string; downloadUrl: string };
  error?: string;
  expiry: number;
}

const store = new Map<string, ProgressEntry>();
// Longer than the export's own polling window: covers a user reloading and
// coming back a while later, while staying well under fileManager's 1h TTL on
// the rendered file itself.
const TTL_MS = 30 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiry < now) store.delete(k);
  }
}

export function setRenderProgress(jobId: string | undefined, percent: number, phase: 'preparing' | 'capturing' | 'encoding'): void {
  if (!jobId) return;
  store.set(jobId, { percent: Math.max(0, Math.min(100, Math.round(percent))), phase, expiry: Date.now() + TTL_MS });
  prune();
}

export function setRenderResult(jobId: string | undefined, fileId: string, downloadUrl: string): void {
  if (!jobId) return;
  store.set(jobId, { percent: 100, phase: 'done', result: { fileId, downloadUrl }, expiry: Date.now() + TTL_MS });
  prune();
}

export function setRenderError(jobId: string | undefined, error: string): void {
  if (!jobId) return;
  const prior = store.get(jobId);
  store.set(jobId, { percent: prior?.percent ?? 0, phase: 'error', error, expiry: Date.now() + TTL_MS });
  prune();
}

export function getRenderProgress(jobId: string): Omit<ProgressEntry, 'expiry'> | null {
  const entry = store.get(jobId);
  if (!entry || entry.expiry < Date.now()) return null;
  const { expiry: _expiry, ...rest } = entry;
  return rest;
}
