# moka — single-container image: Express backend + built frontend + Puppeteer
# (Chrome for Testing, Puppeteer's own download) + FFmpeg (static binary via npm).

FROM node:22-slim

# We install the `chromium` apt package purely to pull in its full closure of
# runtime shared libraries (nss, atk, gtk, etc.) via apt's dependency resolver
# — the usual source of pain when wiring up Chrome manually on a slim image.
# We do NOT launch that binary: Debian's chromium build crashes on launch
# (SIGTRAP in crashpad) in some container/VM environments — e.g. Docker
# Desktop's WSL2 backend, where /sys/devices/system/cpu/cpu0/cpufreq is absent
# and its crash-reporter treats that as fatal. Puppeteer's own "Chrome for
# Testing" download (fetched below) does not hit this and is the far more
# common, better-tested Puppeteer/Docker combination — so we keep the apt
# package installed only for its libraries and let Puppeteer download and use
# its own browser (unzip is required by Puppeteer's browser installer).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_NO_SANDBOX=true \
    NODE_ENV=production \
    CI=true \
    PORT=4003

RUN corepack enable

WORKDIR /app

# Install deps first so this layer is cached unless a manifest/lockfile changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

WORKDIR /app/backend
EXPOSE 4003
CMD ["node", "dist/index.js"]
