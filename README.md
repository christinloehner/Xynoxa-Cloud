# Xynoxa Cloud

A modern, self‑hosted personal cloud: files, notes, bookmarks, calendar, tasks, vault, and semantic search — in one clean UI.

- Modern UX (Next.js + Tailwind + shadcn/ui)
- Full‑text + semantic search (Meilisearch + pgvector)
- Zero‑knowledge Vault (client‑side encryption)
- Multi‑user, groups, group folders, tenants
- Desktop sync client

## Quick Start (recommended: Traefik reverse proxy)

One‑command setup (recommended for beginners):

```bash
./scripts/setup.sh
```

Manual setup:

1) Clone the repo

```bash
git clone <YOUR_REPO_URL> xynoxa-cloud
cd xynoxa-cloud
```

2) Create your environment file

```bash
cp .env.example .env
```

3) Edit `.env` (minimum)

- `APP_DOMAIN` (e.g. `cloud.example.com`)
- `APP_URL` (e.g. `https://cloud.example.com`)
- `SESSION_SECRET` (generate a long random string)
- `MEILI_MASTER_KEY` (generate a strong key)

4) Start the stack

```bash
docker compose up -d
```

5) Open the app

- Visit `https://<APP_DOMAIN>`
- The first registered user becomes **Owner**

## Documentation

- Install guide: `docs/INSTALL.md`
- Configuration reference: `docs/CONFIGURATION.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- FAQ: `docs/FAQ.md`
- Upgrade guide: `docs/UPGRADE.md`
- Security notes: `docs/SECURITY.md`
- Technical architecture: `docs/TECHNICAL.md`
- Module system: `docs/MODULES.md`

## German docs

- `README.de.md` and all `docs/*.de.md` counterparts

## License

AGPL‑3.0 — see `LICENSE`.

---

If you plan to run this publicly, make sure HTTPS is enabled (Traefik is the default path).
An optional Traefik service example is included in `docker-compose.yml` (commented out).
