# Konfigurations-Referenz (.env)

Diese Datei dokumentiert die wichtigsten Umgebungsvariablen der Xynoxa Cloud.

## Core

- `APP_DOMAIN` — Domain für Traefik Routing (z.B. `cloud.example.com`)
- `APP_URL` — Öffentliche URL (in Produktion HTTPS)
- `PORT` — App‑Port im Container (Default `3000`)
- `TZ` — Zeitzone (Default `Europe/Berlin`)

## Datenbank

- `DATABASE_URL` — Postgres Connection String (Default zeigt auf den `db`‑Service)

## Sessions/Auth

- `SESSION_SECRET` — Langes, zufälliges Secret für Cookies (Pflicht)
- `JWT_SECRET` — JWT Secret (falls genutzt)
- `ENCRYPTION_SALT` — Salt für Verschlüsselungs‑Helper

## Suche

- `MEILI_HOST` — Meilisearch URL (Default `http://meilisearch:7700`)
- `MEILI_MASTER_KEY` — Meilisearch Master Key (Pflicht)

## Redis (Queues)

- `REDIS_URL` — Redis URL (Default `redis://redis:6379`)

## Storage

- `STORAGE_DRIVER` — `local` oder `minio`
- `STORAGE_PATH` — Storage‑Pfad im Container (Default `/app/storage/files`)
- `THUMBNAIL_PATH` — Thumbnail‑Pfad (Default `/app/storage/thumbnails`)

### MinIO / S3

- `MINIO_ENDPOINT` — MinIO Host (Default `minio`)
- `MINIO_PORT` — MinIO Port (Default `9000`)
- `MINIO_USE_SSL` — `true|false`
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- `MINIO_BUCKET` — Bucket‑Name (Default `xynoxa-files`)

## E‑Mail (SMTP)

- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`

## Code Server (optional)

- `CODE_SERVER_PASSWORD` — Passwort für `code.<APP_DOMAIN>`

## OCR (optional)

- `ENABLE_OCR` — `true|false`
- `OCR_LANG` — z.B. `eng+deu`

## OIDC (optional)

- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`

## Semantische Suche (optional)

- `OPENAI_API_KEY`
- `OLLAMA_URL` (Default `http://ollama:11434`)
