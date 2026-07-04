// Global concurrency cap for expensive render jobs (Puppeteer + FFmpeg).
// Without this, N simultaneous requests open N browser capture streams and
// N FFmpeg processes in parallel, exhausting CPU/RAM on small hosts.
//
// Env vars (all optional):
//   MAX_RENDER_CONCURRENCY  – parallel jobs allowed (default 2)
//   MAX_RENDER_QUEUE        – requests that may wait before returning 503 (default 4)
//   RENDER_TIMEOUT_MS       – per-job hard timeout in ms (default 900000 = 15 min)
//     Heavy animation exports (long keyframe spans → hundreds of Puppeteer
//     screenshots) can legitimately take 5–8 min, so the wall-clock cap is
//     generous. Lower it via env on shared/production hosts if needed.
//
// The AbortSignal passed to each job is aborted on timeout (or on any error),
// so callers can wire up FFmpeg.kill() and Puppeteer page.close() to it.

const MAX_CONCURRENT = Number(process.env.MAX_RENDER_CONCURRENCY ?? 2);
const MAX_QUEUED     = Number(process.env.MAX_RENDER_QUEUE        ?? 4);
const JOB_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS       ?? 15 * 60 * 1000);

let active = 0;
const waiters: Array<() => void> = [];

export function renderQueueStats() {
  return { active, queued: waiters.length, maxConcurrent: MAX_CONCURRENT };
}

export class QueueFullError extends Error {
  readonly code = 'QUEUE_FULL' as const;
  constructor() { super('Render queue full — try again later'); }
}

export class RenderTimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;
  constructor() { super('Render job timed out'); }
}

export class PayloadValidationError extends Error {
  readonly code = 'PAYLOAD_INVALID' as const;
  constructor(message: string) { super(message); }
}

/** Job receives an AbortSignal that fires on timeout or early error. */
export async function enqueueRender<T>(
  job: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (active >= MAX_CONCURRENT && waiters.length >= MAX_QUEUED) {
    throw new QueueFullError();
  }

  if (active < MAX_CONCURRENT) {
    return runJob(job);
  }

  return new Promise<T>((resolve, reject) => {
    waiters.push(() => runJob(job).then(resolve).catch(reject));
  });
}

async function runJob<T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> {
  active++;
  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new RenderTimeoutError();
      controller.abort(err);
      reject(err);
    }, JOB_TIMEOUT_MS);
  });

  const jobPromise = job(controller.signal);
  // Suppress the unhandled-rejection that surfaces when the timeout races ahead
  // and the job eventually rejects due to the aborted signal.
  jobPromise.catch(() => {});

  try {
    return await Promise.race([jobPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
    // Abort the signal on any exit path so job resources (FFmpeg, pages) can
    // clean up even if the job errored before the timeout.
    controller.abort();
    active--;
    drain();
  }
}

function drain() {
  if (waiters.length > 0 && active < MAX_CONCURRENT) {
    waiters.shift()!();
  }
}
