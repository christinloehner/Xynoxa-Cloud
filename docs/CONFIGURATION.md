# Configuration Reference (.env)

This file documents all important environment variables for Xynoxa Cloud.

## Core

- `APP_DOMAIN` — Domain used by Traefik routing (e.g. `cloud.example.com`)
- `APP_URL` — Public URL (must be HTTPS in production)
- `PORT` — App port inside container (default `3000`)
- `TZ` — Timezone (default `Europe/Berlin`)

## Database

- `DATABASE_URL` — Postgres connection string (default points to the `db` service)

## Sessions/Auth

- `SESSION_SECRET` — Long random secret for cookies (required)
- `JWT_SECRET` — JWT secret (if used)
- `ENCRYPTION_SALT` — Salt for encryption helpers

## Search

- `MEILI_HOST` — Meilisearch URL (default `http://meilisearch:7700`)
- `MEILI_MASTER_KEY` — Meilisearch master key (required)

## Redis (Queues)

- `REDIS_URL` — Redis URL (default `redis://redis:6379`)

## Storage

- `STORAGE_DRIVER` — `local` or `minio`
- `STORAGE_PATH` — Storage path inside the container (default `/app/storage/files`)
- `THUMBNAIL_PATH` — Thumbnail path (default `/app/storage/thumbnails`)

### MinIO / S3

- `MINIO_ENDPOINT` — MinIO host (default `minio`)
- `MINIO_PORT` — MinIO port (default `9000`)
- `MINIO_USE_SSL` — `true|false`
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- `MINIO_BUCKET` — Bucket name (default `xynoxa-files`)

## Email (SMTP)

- `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`

## Code Server (optional)

- `CODE_SERVER_PASSWORD` — Password for `code.<APP_DOMAIN>`

## OCR (optional)

- `ENABLE_OCR` — `true|false`
- `OCR_LANG` — e.g. `eng+deu`

## OIDC (optional)

- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`

## Semantic search (optional)

- `OPENAI_API_KEY`
- `OLLAMA_URL` (default `http://ollama:11434`)
