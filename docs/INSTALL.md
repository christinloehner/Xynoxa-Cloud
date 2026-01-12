# Installation (Docker + Traefik)

This guide is written for beginners. If you can run Docker Compose, you can run Xynoxa.

## Requirements

- Docker + Docker Compose
- 4 GB RAM minimum (8 GB+ recommended)
- 10 GB free disk (more if you store many files)
- A domain and HTTPS (Traefik is the default path)

## 1) Clone the repo

```bash
git clone <YOUR_REPO_URL> xynoxa-cloud
cd xynoxa-cloud
```

## Quick setup script (optional)

If you want a guided setup (creates `.env`, generates secrets, starts containers):

```bash
./scripts/setup.sh
```

## 2) Create your `.env`

```bash
cp .env.example .env
```

Open `.env` and set at least:

- `APP_DOMAIN=cloud.example.com`
- `APP_URL=https://cloud.example.com`
- `SESSION_SECRET=<long random string>`
- `MEILI_MASTER_KEY=<strong key>`

## 3) Traefik (default)

Xynoxa expects Traefik to run in a **separate container** on an **external** Docker network named `proxy`.
Make sure that network exists and Traefik is attached to it.

If your Traefik network has a different name, update `docker-compose.yml` accordingly.

If you prefer to run Traefik **inside** this stack, there is a commented example service
in `docker-compose.yml` that you can enable.

## 4) Start the stack

```bash
docker compose up -d
```

## 5) Open the app

- Visit `https://<APP_DOMAIN>`
- The first user becomes **Owner**

## Optional: Local storage vs MinIO

- Default: local filesystem (recommended to start)
  - Uses `./volumes/files_data`
- MinIO (S3‑compatible)
  - Set `STORAGE_DRIVER=minio` and configure `MINIO_*` variables

## Health checks

- App: `https://<APP_DOMAIN>/`
- tRPC ping: `/api/trpc/health.ping`
- Worker: `http://localhost:3001/health` (inside the container)

## Troubleshooting

See `docs/TROUBLESHOOTING.md`.
