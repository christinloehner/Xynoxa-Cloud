# Technical Overview

This document summarizes the architecture and code layout of `xynoxa-cloud`.

## Stack

- Runtime: Node.js 22
- Framework: Next.js 16 (App Router, RSC)
- Language: TypeScript 5.9
- UI: TailwindCSS + shadcn/ui + Framer Motion
- API: tRPC v11 + REST route handlers
- DB: PostgreSQL 16 + pgvector
- Search: Meilisearch (full‑text) + pgvector (semantic)
- Jobs: BullMQ + Redis
- Storage: Local FS or MinIO (S3‑compatible)
- Tests: Vitest + Playwright

## Repository layout

- `src/app/` — Next.js routes (UI + REST endpoints)
- `src/components/` — UI components
- `src/lib/` — shared utilities, module loading
- `src/modules/` — modular features (bookmarks, notes, etc.)
- `src/server/` — tRPC routers, services, DB, jobs
- `drizzle/` — migrations
- `tests/` — unit/integration/e2e tests

## API

- tRPC endpoint: `/api/trpc`
- REST endpoints: `src/app/api/*` (uploads, downloads, shares, SSE, etc.)

## Auth

- Web: `iron-session` cookies
- API tokens: Bearer tokens (hashed in DB)
- 2FA: TOTP (`otplib`)

## Storage

- Local FS: `./volumes/files_data` (default)
- MinIO: S3‑compatible backend
- Thumbnails stored separately (local or MinIO)

## Search & Semantics

- Meilisearch indexes: files, notes, bookmarks, events, tasks, folders
- pgvector embeddings for semantic search
- Optional OCR via `tesseract.js`

## Jobs (Worker)

Queues:
- email, search, maintenance, calendar, thumbnail

Worker health endpoint: `http://localhost:3001/health` (inside container)

## Module system

See `docs/MODULES.md`.
