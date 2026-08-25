// FFmpeg's 'progress' event reports position as a "HH:MM:SS.ms" timemark
// rather than a ready-made percent (fluent-ffmpeg can only derive percent when
// it can probe a single input's duration, which doesn't hold for our
// multi-input filter graphs). We already know the output duration ourselves,
// so convert the timemark and divide by it.
export function timemarkToSeconds(timemark: string): number {
  const parts = timemark.split(':').map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const n = Number(timemark);
  return Number.isFinite(n) ? n : 0;
}
