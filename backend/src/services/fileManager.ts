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
  // Use forward slashes — FFmpeg on Windows rejects backslash paths
  return path.join(TMP_DIR, filename).replace(/\\/g, '/');
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
