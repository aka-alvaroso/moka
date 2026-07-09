<div align="center">

# moka

**Browser-based mockup & social-media asset generator.**
Compose designs onto realistic mockups and social presets, animate them, and export as image or video — pixel-exact, no design software required.

[![Docker publish](https://github.com/aka-alvaroso/moka/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/aka-alvaroso/moka/actions/workflows/docker-publish.yml)
![version](https://img.shields.io/badge/version-1.2.5-e94f37)
![node](https://img.shields.io/badge/node-22-339933?logo=node.js&logoColor=white)

</div>

---

## Contents

- [What is moka](#what-is-moka)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Self-hosting with Docker](#self-hosting-with-docker)
- [Self-hosting without Docker](#self-hosting-without-docker)
- [Configuration reference](#configuration-reference)
- [Development](#development)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)

---

## What is moka

moka is a browser-based editor for turning a screenshot, image, or video into a polished mockup or social-media asset: drop it onto a device/billboard mockup with realistic perspective, frame it for Instagram/X/YouTube/Facebook/LinkedIn, animate it with keyframes, and export the result as a still image or an MP4 — all rendered through the same engine that draws the live preview, so what you see is exactly what you export.

It's designed to be self-hosted: run it on your own server or VPS and use it privately, or offer it to others, without depending on a third-party SaaS.

## Features

- **Canvas presets** for Instagram (post/story), X/Twitter (post/banner), YouTube (thumbnail/banner), Facebook (post/cover), LinkedIn (post/banner), plus fully custom dimensions.
- **Perspective mesh warp** to place content realistically inside device/billboard mockups.
- **Keyframe animation timeline** with easing presets and per-property control.
- **Native video layers** — compose video content directly into a scene, not just static images.
- **Export as image** (PNG/JPG, up to 3x resolution) **or video** (MP4, WYSIWYG frame-accurate export).
- **Pixel-exact rendering** — the export pipeline reuses the same browser-rendered scene as the live editor, so exports never drift from the preview.
- **Configurable resource limits** — tune render concurrency, duration, resolution, and CPU/thread usage to fit anything from a small single-vCPU VPS to a beefier host.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Rendering | Puppeteer (headless Chromium) for pixel-exact capture |
| Encoding | FFmpeg (via `fluent-ffmpeg` + `ffmpeg-static`) |
| Image processing | `sharp` |
| Monorepo | pnpm workspaces (`frontend`, `backend`, `shared`) |

---

## Self-hosting with Docker

The recommended path — a prebuilt image is published automatically, so your server never needs to compile anything or fight Puppeteer's native dependencies.

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

### Quickstart

1. Download [`docker-compose.yml`](docker-compose.yml) and [`.env.example`](.env.example) from this repo.
2. `cp .env.example .env` and fill in the values (see comments in the file).
3. `docker compose up -d`
4. moka is now running at `http://localhost:4003` (or whatever `PORT` you set).

> The GitHub Container Registry package is private by default after the first CI build. Whoever owns the repo needs to flip it to public once (**GitHub → profile → Packages → moka → Package settings → Change visibility**), otherwise `docker compose pull` requires authentication.

> **Security**: `docker-compose.yml` publishes the port straight to the host with no authentication in front of it. `RENDER_TOKEN` only gates direct API calls to the render endpoint — it does **not** protect the web UI, and the bundled UI doesn't even send it. Fine for localhost-only or trusted-LAN use; for anything reachable from the internet, put a reverse proxy in front (Caddy `basic_auth`, an IP allowlist, a VPN/Tailscale) instead of relying on `RENDER_TOKEN` alone.

### Updating

```bash
docker compose pull
docker compose up -d
```

Every push to `master` publishes a new image tagged `latest`. `.env` lives outside the container, so your configuration survives updates untouched.

### Rolling back

There's no git-tag/release process to track — every image is also tagged with the commit SHA it was built from, so pin that instead of `latest` in `docker-compose.yml`:

```yaml
image: ghcr.io/aka-alvaroso/moka:<commit-sha>
```

then `docker compose up -d`.

### Sizing for your host

Two independent layers of limits, both tunable in `.env` / `docker-compose.yml`:

- **Container-level** (`mem_limit`, `cpus` in `docker-compose.yml`) — hard ceiling enforced by Docker/the OS, protects the host from a runaway process.
- **App-level** (`MAX_*`, `FFMPEG_THREADS`, `MAX_RENDER_CONCURRENCY` in `.env`) — keeps individual renders within that budget. Defaults are tuned for a modest single-vCPU VPS; raise them if your host has more headroom.

`docker-compose.yml` also ships a healthcheck against the backend's `/health` endpoint, so `docker ps` and any orchestration in front of it can tell if the container is actually serving traffic, not just running.

---

## Self-hosting without Docker

Docker isn't required — moka is a plain Node.js app. This path needs a bit more manual setup, since you take on what the Docker image otherwise handles for you: installing a working Chromium and keeping the process alive across crashes/reboots.

### Requirements

- Node.js 22.13+ and [pnpm](https://pnpm.io/installation) (pinned to the version in `package.json`'s `packageManager` field via corepack).
- The shared runtime libraries Chrome needs (nss, atk, gtk, etc.) — easiest way to get the full, correct set is installing the `chromium` apt package for its dependencies (see below).

### Install

```bash
git clone https://github.com/aka-alvaroso/moka.git
cd moka
pnpm install
pnpm build
```

Install the `chromium` apt package **for its runtime libraries only** — apt resolves Chrome's full dependency closure automatically, which is the usual source of pain when wiring this up by hand. Do **not** point Puppeteer at this binary: Debian's `chromium` build crashes on launch in some container/restricted environments (missing `/sys/devices/system/cpu/*/cpufreq`, which its crash handler treats as fatal instead of ignoring). Leave `PUPPETEER_EXECUTABLE_PATH` unset so Puppeteer downloads and uses its own "Chrome for Testing" build instead — that one doesn't hit this:

```bash
sudo apt install -y chromium fonts-liberation   # Debian/Ubuntu; package name may be
                                                  # chromium-browser on older releases
```

In `backend/.env`:

```bash
NODE_ENV=production
PUPPETEER_NO_SANDBOX=true   # only if running as root; see backend/.env.example
```

Copy `backend/.env.example` to `backend/.env` and fill in the rest (resource limits, etc.) — see the same security note above about `RENDER_TOKEN` not protecting the UI.

### Run as a service

Running `node dist/index.js` directly works, but won't restart on crash or reboot. On Linux, `systemd` gives you that for free — and its cgroup-based `MemoryMax`/`CPUQuota` are the non-Docker equivalent of the `mem_limit`/`cpus` used in the Docker Compose setup.

`/etc/systemd/system/moka.service`:

```ini
[Unit]
Description=moka
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/moka/backend
ExecStart=/usr/bin/node dist/index.js
EnvironmentFile=/opt/moka/backend/.env
Restart=on-failure
RestartSec=5
User=moka

# Resource ceiling — cgroups-based, equivalent to Docker's mem_limit/cpus
MemoryMax=1G
CPUQuota=100%

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moka
```

### Updating

```bash
git pull
pnpm install
pnpm build
sudo systemctl restart moka
```

---

## Configuration reference

The full, commented list of environment variables lives in the `.env.example` files — that's the source of truth, kept in sync with the code:

- [`.env.example`](.env.example) — Docker deployment.
- [`backend/.env.example`](backend/.env.example) — native/systemd deployment and local dev.
- [`frontend/.env.example`](frontend/.env.example) — frontend build-time variables (only relevant if you build the frontend yourself, e.g. for a subpath deployment).

The essentials:

| Variable | Purpose |
|---|---|
| `PORT` | Port the backend listens on (default `4003`). |
| `ALLOWED_ORIGIN` | CORS origin — only matters if you expose moka beyond localhost. |
| `RENDER_TOKEN` | Bearer token required on direct API calls to the render endpoint. Does **not** protect the web UI (which never sends it) or any other endpoint — use a reverse proxy for actual access control. |
| `MAX_RENDER_CONCURRENCY` | How many renders run in parallel. |
| `FFMPEG_THREADS` | CPU threads FFmpeg's encoder may use per render. |

---

## Development

```bash
pnpm install
pnpm dev
```

This runs the backend (`tsx watch`) and frontend (Vite dev server) concurrently. See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example) for local configuration.

## Project structure

```
moka/
├── backend/     Express API + render pipeline (Puppeteer + FFmpeg)
├── frontend/    React editor (Vite)
├── shared/      Types and geometry logic shared by both
└── docker-compose.yml, Dockerfile, .env.example   Docker self-host setup
```

## Architecture notes

- The **same rendering engine** draws the live editor preview and the exported file: exports are produced by Puppeteer navigating to an internal render view and capturing it, so there's no separate "export renderer" that could drift from what you see on screen.
- **Still images** and simple **video compositing** use fast paths that avoid per-frame browser capture where possible (Puppeteer renders static plates once; FFmpeg composites native video frames into them).
- **Keyframe animations** capture only the animated span frame-by-frame through Puppeteer; the static "hold" after the last keyframe is encoded in a single cheap FFmpeg pass.
- A global render queue caps concurrent jobs and enforces a per-job timeout, so a slow or stuck render can't starve the rest of the host — see [Sizing for your host](#sizing-for-your-host).
