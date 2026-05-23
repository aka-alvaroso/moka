import puppeteer, { type Browser } from 'puppeteer';
import { writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { tmpPath } from './fileManager';
import { storeRenderState } from './renderStateStore';
import type { PuppeteerRenderState } from '@mockup-forge/shared';

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return _browser;
}

const RENDERER_URL = process.env.RENDERER_URL ?? 'http://localhost:5173';

export async function screenshotRenderState(
  state: PuppeteerRenderState,
  format: 'png' | 'jpg',
): Promise<string> {
  const token = storeRenderState(state);
  const url = `${RENDERER_URL}/render?token=${token}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: state.canvasW + 200, height: state.canvasH + 200 });
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('#render-ready', { timeout: 30_000 });

    const element = await page.$('[data-export-canvas]');
    if (!element) throw new Error('Canvas element not found in render view');

    const screenshot = await element.screenshot(
      format === 'jpg' ? { type: 'jpeg', quality: 92 } : { type: 'png' },
    );

    const ext = format === 'jpg' ? 'jpg' : 'png';
    const outputFilename = `render_${uuidv4()}.${ext}`;
    writeFileSync(tmpPath(outputFilename), screenshot);
    return outputFilename;
  } finally {
    await page.close();
  }
}

