import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// VITE_BASE controls the public base path for production builds.
// Set to '/moka/' when deploying under a subpath (e.g. alvarosod.dev/moka).
// Leave unset (defaults to '/') for root deployments.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE ?? '/';

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        // Resolve the workspace package from its TS source (not the CommonJS
        // dist) so value exports bundle cleanly and shared edits hot-reload.
        '@mockup-forge/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // The backend points Puppeteer at localhost:5173 (RENDERER_URL). If 5173 is
      // taken, fail loudly instead of silently drifting to 5174 — otherwise every
      // export would hit a stale/wrong server and time out on #render-ready.
      strictPort: true,
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  };
});
