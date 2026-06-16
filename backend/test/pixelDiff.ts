import sharp from 'sharp';

// Mean absolute per-channel error (0–255) between two images. Uses sharp, which
// the project already depends on — no pixelmatch/jest needed. Returns Infinity
// when dimensions differ (a hard regression).
export async function meanAbsError(aPath: string, bPath: string): Promise<number> {
  const [a, b] = await Promise.all([
    sharp(aPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(bPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / a.data.length;
}
