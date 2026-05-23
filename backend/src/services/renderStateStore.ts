import { v4 as uuidv4 } from 'uuid';
import type { PuppeteerRenderState } from '@mockup-forge/shared';

interface StoreEntry {
  state: PuppeteerRenderState;
  expiry: number;
}

const store = new Map<string, StoreEntry>();
const TTL_MS = 5 * 60 * 1000;

export function storeRenderState(state: PuppeteerRenderState): string {
  const token = uuidv4();
  store.set(token, { state, expiry: Date.now() + TTL_MS });
  // Prune expired entries
  for (const [k, v] of store) {
    if (v.expiry < Date.now()) store.delete(k);
  }
  return token;
}

export function getRenderState(token: string): PuppeteerRenderState | null {
  const entry = store.get(token);
  if (!entry || entry.expiry < Date.now()) return null;
  return entry.state;
}
