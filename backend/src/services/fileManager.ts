import fs from 'fs';
import path from 'path';

export const TMP_DIR = path.join(process.cwd(), 'tmp', 'mockup-forge');

export function ensureTmpDir(): void {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    console.log(`Tmp dir created: ${TMP_DIR}`);
  }
}

export function tmpPath(filename: string): string {
  // Strip all path components to prevent traversal (../../etc/passwd → passwd).
  // Resolved path is then validated to stay within TMP_DIR as a second guard.
  const safe = path.basename(filename);
  const resolved = path.resolve(TMP_DIR, safe);
  if (!resolved.startsWith(TMP_DIR + path.sep) && resolved !== TMP_DIR) {
    throw new Error(`Invalid fileId: path escapes tmp directory`);
  }
  // Use forward slashes — FFmpeg on Windows rejects backslash paths
  return resolved.replace(/\\/g, '/');
}

// Hard size budget for the tmp dir. A burst of large uploads can fill the disk
// long before the 30-min age sweep runs, so we also enforce a total-size cap
// after every upload: when over budget, evict the OLDEST files first until back
// under it. Only regular files are touched — in-progress `frames_*` render dirs
// are skipped so an export is never corrupted mid-flight.
const MAX_TMP_BYTES = Number(process.env.MAX_TMP_BYTES ?? 5 * 1024 * 1024 * 1024); // 5 GB

export function enforceDiskBudget(): void {
  if (!fs.existsSync(TMP_DIR)) return;

  let files: Array<{ fp: string; size: number; mtime: number }>;
  try {
    files = fs.readdirSync(TMP_DIR).flatMap((name) => {
      const fp = path.join(TMP_DIR, name);
      try {
        const stat = fs.statSync(fp);
        return stat.isFile() ? [{ fp, size: stat.size, mtime: stat.mtimeMs }] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return;
  }

  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= MAX_TMP_BYTES) return;

  files.sort((a, b) => a.mtime - b.mtime); // oldest first
  let evicted = 0;
  for (const f of files) {
    if (total <= MAX_TMP_BYTES) break;
    try {
      fs.unlinkSync(f.fp);
      total -= f.size;
      evicted++;
    } catch {
      // already gone
    }
  }
  if (evicted > 0) console.log(`[disk-budget] evicted ${evicted} oldest file(s) to stay under cap`);
}

export function cleanOldFiles(maxAgeMs = 60 * 60 * 1000): void {
  if (!fs.existsSync(TMP_DIR)) return;
  const now = Date.now();
  const files = fs.readdirSync(TMP_DIR);
  let removed = 0;
  for (const file of files) {
    const fp = path.join(TMP_DIR, file);
    try {
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fp);
        removed++;
      }
    } catch {
      // file already gone
    }
  }
  if (removed > 0) console.log(`[cleanup] Removed ${removed} old file(s)`);
}

// Cron every 30 minutes
setInterval(() => cleanOldFiles(), 30 * 60 * 1000);
