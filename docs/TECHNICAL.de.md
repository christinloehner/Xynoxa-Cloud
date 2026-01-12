# Xynoxa Cloud - Technical Documentation

Diese Datei dokumentiert ausschliesslich die Anwendung in `xynoxa-cloud`.
Ziel: Eine detailreiche technische Orientierung fuer Entwicklerinnen und Entwickler, die am Projekt mitarbeiten.

---

## 1) Kurzueberblick (Tech Stack)

- Runtime: Node.js 22 (Docker basiert auf `node:22-slim`)
- Framework: Next.js 16 (App Router, React Server Components)
- Sprache: TypeScript 5.9 (React 19, TSX)
- UI: TailwindCSS 3.4, shadcn/ui (Radix UI), Framer Motion
- API: tRPC 11 (typed RPC) + REST Route Handlers (Next.js)
- Datenbank: PostgreSQL 16 + pgvector (Embeddings)
- ORM: Drizzle ORM + drizzle-kit
- Suche: Meilisearch (Volltext) + pgvector (semantisch)
- Queue/Jobs: BullMQ + Redis
- Storage: Local FS oder MinIO (S3 kompatibel)
- Logging: Winston + Daily Rotate
- Tests: Vitest + Testing Library + Playwright

---

## 2) Repository Layout (xynoxa-cloud)

Wichtige Dateien und Ordner:

- `package.json` / `package-lock.json`: Abhaengigkeiten und Scripts (npm, lockfileVersion 3)
- `node_modules/`: installierte Abhaengigkeiten (lokale Dev-Umgebung)
- `Dockerfile`: Multi-Stage Build, Node 22, `npm ci --legacy-peer-deps`
- `docker-compose.yml`: App, Worker, Postgres, Meilisearch, Redis, Code-Server
- `next.config.mjs`: Next.js Konfiguration inkl. CSP Headern, serverExternalPackages
- `tailwind.config.js`, `postcss.config.js`: Styling Setup
- `drizzle.config.ts` + `drizzle/`: DB Schema und Migrationen
- `src/`: Quellcode (App Router, Server, Module System, Komponenten)
- `tests/`: Unit/Integration/E2E Tests
- `scripts/`: Debug/Seed/Maintenance Tools
- `public/`: Static Assets

Top-Level `src/` Struktur:

- `src/app/`: Next.js App Router (Pages, API Routes)
- `src/components/`: UI Komponenten (shadcn/ui + custom)
- `src/lib/`: Client/Server Hilfsfunktionen (z.B. module-loader)
- `src/modules/`: Module System (Bookmarks, Notes, Projects, Test)
- `src/server/`: Serverlogik (tRPC Router, Services, Jobs, DB)
- `src/types/`: Zentrale Types fuer Module etc.

---

## 3) Package Scripts (package.json)

Wichtigste Scripts:

- `dev`: Next.js Dev Server
- `build`: Next.js Production Build
- `start`: Next.js Server
- `start:worker`: BullMQ Worker (`src/server/jobs/worker.ts`)
- `discover-modules`: Module Discovery Script
- `lint`: ESLint (Flat Config)
- `typecheck`: TypeScript `tsc --noEmit`
- `db:generate`, `db:migrate`, `db:push`: Drizzle Migrations
- `db:seed`, `db:demo-seed`: Seeds
- `test`: Vitest
- `test:e2e`: Playwright

Hinweis: In der lokalen Dev-Umgebung hier ist Build/Start nicht moeglich (siehe AGENTS.md). Tests laufen erst nach Push im CI/CD.

---

## 4) Abhaengigkeiten (Details)

### Laufzeitabhaengigkeiten (dependencies)

- @monaco-editor/react ^4.7.0 (Editor)
- @radix-ui/* (UI primitives)
- @react-email/components ^0.5.7, @react-email/render ^1.4.0 (Emails)
- @tanstack/react-query ^5.90.12 (Client Cache)
- @tiptap/* ^3.12.1 (Rich Text Editor)
- @trpc/* ^11.7.2 (typed RPC)
- @xenova/transformers ^2.17.2 (lokale Embeddings)
- adm-zip ^0.5.16 (ODT Parsing)
- argon2 ^0.44.0 (Passwort Hashing)
- bullmq ^5.65.1 (Queues)
- check-disk-space ^3.4.0 (System Stats)
- class-variance-authority ^0.7.1, clsx ^2.1.1 (Styling)
- cmdk ^1.1.1 (Command Palette)
- date-fns ^4.1.0 (Dates)
- diff ^8.0.2 (File Deltas)
- dotenv ^17.2.3 (Env)
- drizzle-orm ^0.45.0 (ORM)
- file-saver ^2.0.5 (Downloads)
- file-type ^19.6.0 (MIME detection)
- framer-motion ^12.23.25 (Animation)
- ioredis ^5.8.2 (Redis)
- iron-session ^8.0.4 (Sessions)
- jose ^6.1.3 (JWT/JOSE)
- jotai ^2.15.2 (State)
- jsdom ^27.2.0 (Server parsing)
- lucide-react ^0.555.0 (Icons)
- mammoth ^1.6.0 (DOCX extraction)
- meilisearch ^0.54.0 (Fulltext)
- minio ^8.0.6 (S3 Storage)
- monaco-editor ^0.52.2, monaco-editor-webpack-plugin ^7.1.1
- next ^16.0.7
- nodemailer ^7.0.11 (Mail)
- otplib ^12.0.1 (2FA TOTP)
- pdf-parse ^1.1.1 (PDF extraction)
- pg ^8.16.3 (Postgres)
- pgvector ^0.2.1 (Vector SQL)
- prism-react-renderer ^2.3.1 (Code Highlight)
- react ^19.2.1, react-dom ^19.2.1
- server-only ^0.0.1 (Next.js hint)
- sharp ^0.33.5 (Thumbnails)
- sonner ^2.0.7 (Toasts)
- superjson ^2.2.6 (tRPC transformer)
- tailwind-merge ^3.4.0
- tesseract.js ^5.1.0 (OCR optional)
- use-debounce ^10.0.6
- uuid ^11.0.3
- winston ^3.19.0, winston-daily-rotate-file ^5.0.0 (Logging)
- zod ^4.1.13 (Validation)
- zustand ^5.0.9 (State)

### Dev Abhaengigkeiten (devDependencies)

- @playwright/test ^1.57.0
- @testing-library/* ^16.x
- @types/* (Node, React, etc.)
- @vitest/ui ^4.0.15
- autoprefixer ^10.4.22
- drizzle-kit ^0.31.7
- eslint ^9.39.1, eslint-config-next ^16.0.7
- postcss ^8.5.6
- prettier ^3.7.4
- tailwindcss ^3.4.14
- tsx ^4.21.0 (TS runtime fuer scripts)
- typescript ^5.9.3
- vite-tsconfig-paths ^5.1.4
- vitest ^4.0.15

### node_modules

`node_modules/` ist vorhanden und wird via `npm` installiert. Docker nutzt `npm ci --legacy-peer-deps` und produziert reproduzierbare Installs basierend auf `package-lock.json` (lockfileVersion 3).

---

## 5) Next.js Konfiguration

Datei: `next.config.mjs`

- `reactStrictMode: true`, `typedRoutes: true`
- `env`: `NEXT_PUBLIC_APP_VERSION` aus `package.json`, `NEXT_PUBLIC_APP_DOMAIN` aus `APP_DOMAIN`
- `serverExternalPackages`: Native/Server Packages, die nicht ins Client-Bundle sollen (z.B. `pg`, `argon2`, `sharp`, `tesseract.js`, `@xenova/transformers`)
- CSP Headers fuer alle Nicht-API Routen (X-Frame-Options, Referrer-Policy, Permissions-Policy)

---

## 6) Frontend Architektur

### App Router

`src/app/` nutzt Next.js App Router mit RSC.

Wichtige Bereiche:

- `src/app/(dashboard)/`: Authentifizierte App Seiten
  - `files`, `notes`, `bookmarks`, `calendar`, `search`, `vault`, `settings`, `admin`
  - Modul-Routen werden automatisch als Wrapper-Pages generiert (siehe `scripts/generate-module-pages.ts`)
  - Fallback/Catch-All: `src/app/(dashboard)/[...modulePath]`
- `src/app/auth/`: Login, Register, Reset, etc.
- `src/app/onboarding/`: Initial Setup
- `src/app/share/`: Public Shares
- `src/app/api/`: REST Endpoints

### Styling & UI

- TailwindCSS + CSS Variablen in `src/app/globals.css`
- shadcn/ui Konfiguration in `components.json`
- Farbpalette mit `xynoxa-*` Custom Colors
- Animations: Framer Motion
- Icons: Lucide
- Command Palette: cmdk

### State & Data

- React Query fuer Server State (`@tanstack/react-query`)
- Jotai/Zustand fuer Client State
- tRPC React Query Adapter

---

## 7) API Architektur

### tRPC

- Endpoint: `/api/trpc`
- Router Definition: `src/server/routers/_app.ts`
- Context: `src/server/context.ts`
- Transformer: `superjson`

Kernrouter:

- `auth`, `users`, `groups`, `tenants`
- `files`, `folders`, `tags`
- `notes`, `bookmarks` (Modul), `calendar`, `tasks`
- `vault`, `shares`, `sync`
- `system`, `admin`, `maintenance`, `notifications`
- `modules`, `moduleApi`

### REST Route Handlers

`src/app/api/*` enthaelt REST Endpoints, z.B.

- `/api/upload` (Multipart Upload)
- `/api/upload/chunk` + `/api/upload/progress` (Chunk Upload)
- `/api/files/download`, `/api/files/preview`, `/api/files/presign` usw.
- `/api/share/[token]` (Public Share Download)
- `/api/notes/export/[id]` (Markdown Export)
- `/api/mobile/login` (Mobile Token Login)
- `/api/notifications/stream` (SSE)
- `/api/vscode/*` (Code Server Integration)

---

## 8) Auth & Security

### Session Auth (Web)

- `iron-session` Cookies
- Session Cookie: `xynoxa.session`
- Session Optionen: `src/lib/session-options.ts`

### API Tokens (Desktop/Mobile)

- Bearer Tokens (`xyn-...` / `syn-...`)
- Hash in DB (SHA-256), nur einmalig sichtbar
- Token Auth via `src/server/auth/api-helper.ts`

### 2FA

- TOTP via `otplib`
- 2FA Router: `src/server/routers/2fa.ts`

### Rate Limiting

- In-Memory Buckets (process-local)
- Middleware: `src/server/middleware/rate-limit.ts`
- Eingebunden in Auth- und 2FA Router

### CSP und Sicherheitsheader

- CSP, X-Frame-Options, X-Content-Type-Options in `next.config.mjs`

---

## 9) Datenbank & ORM

### Drizzle

- Schema: `src/server/db/schema.ts`
- Migrations: `drizzle/`
- Config: `drizzle.config.ts`

### Zentrale Tabellen (Auszug, gruppiert)

**Auth & User**
- `users`, `sessions`, `user_profiles`, `password_resets`, `verification_tokens`, `api_tokens`

**Organisation**
- `tenants`, `tenant_members`, `groups`, `group_members`, `group_folders`, `group_folder_access`

**Files & Storage**
- `files`, `file_versions`, `file_version_chunks`, `file_deltas`, `chunks`, `upload_sessions`, `extracted_texts`

**Notes & Content**
- `notes`, `tags`, `entity_tags`

**Calendar & Tasks**
- `calendar_events`, `tasks`, `calendar_provider_accounts`, `calendar_google_calendars`

**Search & Semantics**
- `embeddings` (pgvector dimension 384)

**Sharing & Notifications**
- `shares`, `share_recipients`, `notifications`

**Sync**
- `sync_journal`

**Module System**
- `modules` (aktiv/installed/error Status)
- `mod_*` Tabellen (Moduleigene Tabellen, z.B. `mod_bookmarks`, `mod_projects` ...)

---

## 10) Storage, Versioning, Thumbnails

### Storage

Service: `src/server/services/storage.ts`

- `STORAGE_DRIVER=local|minio`
- Lokales FS: `storage/files` (Default, siehe `STORAGE_PATH`)
- MinIO: Bucket `xynoxa-files`
- Thumbnails: `storage/thumbnails` oder MinIO Prefix `thumbnails/`

### File Versioning

Service: `src/server/services/file-versioning.ts`

- Snapshot + Delta Strategie
- Snapshot alle 10 Versionen oder fuer Binary
- Deltas ueber `diff` Patch
- Chunking ueber `chunk-store.ts`

### Thumbnails

Service: `src/server/services/thumbnails.ts`

- Sharp fuer WebP Thumbnails
- Hintergrundjob via BullMQ

---

## 11) Suche & Embeddings

### Meilisearch

Service: `src/server/services/search.ts`

- Indexe: `files`, `notes`, `bookmarks`, `events`, `tasks`, `folders`
- Filterable Fields: ownerId, folderId, groupFolderId, tags, createdAt, etc.
- Multi-Search ueber alle Indexe

### Embeddings (Semantische Suche)

Service: `src/server/services/embeddings.ts`

- `@xenova/transformers` mit `Xenova/all-MiniLM-L6-v2`
- Dimension 384 (pgvector)
- Dynamische Module werden ueber `module-router-registry` integriert
- Modul-Routen werden automatisch durch `generate-module-pages` erzeugt

### Content Extraction

Service: `src/server/services/extract.ts`

- PDF: `pdf-parse`
- DOCX/Word: `mammoth`
- ODT: `adm-zip`
- OCR: optional `tesseract.js` (ENV `ENABLE_OCR=true`)
- MIME Detection: `file-type`

---

## 12) Jobs & Worker

BullMQ Worker: `src/server/jobs/worker.ts`

Queues:

- `email-queue` (Passwort Reset, Verify Email)
- `search-queue` (Reindex)
- `maintenance-queue` (Orphan Repair, Full Reset, Chunk GC)
- `calendar-queue` (Google Calendar Sync)
- `thumbnail-queue` (Thumbnail Generation)

Redis Verbindung in `src/server/jobs/queue.ts` (lazy connect, `REDIS_URL`).
Worker liefert Health Check unter `http://localhost:3001/health`.

---

## 13) Module System

Dokumentation: `MODULE_SYSTEM.md`

Kernkomponenten:

- `src/lib/module-loader.ts`: Laedt aktive Module
- `src/lib/module-registry.server.ts`: Auto-generierte Server Imports (Client Manifest)
- `src/lib/module-registry.client.ts`: Auto-generierte Client Imports (Navigation)
- `src/server/module-router-registry.ts`: Dynamische tRPC Router + Entity Types
- `src/server/services/module-service.ts`: DB Registrierung/Aktivierung

Module liegen in `src/modules/Xynoxa*` (z.B. Bookmarks, Notes, Projects, TestModul).
Module koennen Router, DB Schema und UI Komponenten registrieren.

---

## 14) Notifications

- SSE Endpoint: `src/app/api/notifications/stream/route.ts`
- Event Bus: `src/server/services/notification-bus.ts`
- CRUD: `src/server/routers/notifications.ts`

---

## 15) Logging & Observability

Service: `src/server/services/logger.ts`

- Winston Logger, Daily Rotate Files
- `logs/` als Default Log Directory
- Global Error Handler via `src/instrumentation.ts`

---

## 16) Tests

- Unit/Integration: `vitest`
- UI/E2E: `playwright`
- Tests liegen in `tests/server/*` und `tests/e2e/*`

---

## 17) Konfiguration (ENV Variablen)

Wichtige ENV Werte (Auszug):

- `APP_DOMAIN`, `APP_URL`
- `PORT`
- `DATABASE_URL`
- `SESSION_SECRET`
- `MEILI_HOST`, `MEILI_MASTER_KEY`
- `REDIS_URL`
- `STORAGE_DRIVER`, `STORAGE_PATH`, `THUMBNAIL_PATH`
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- `CODE_SERVER_PASSWORD`
- `ENABLE_OCR`, `OCR_LANG`
- `LOG_LEVEL`, `LOG_CONSOLE`

---

## 18) Deployment (Docker)

`docker-compose.yml` Services:

- `app`: Next.js Produktion (Port 3000)
- `worker`: BullMQ Worker
- `db`: Postgres 16 + pgvector
- `meilisearch`: Volltext Suche
- `redis`: Queue Backend
- `code`: code-server fuer Datei-Editing (optional)
- `qdrant`: optional, aktuell deaktiviert (replicas: 0)

Dockerfile:

- Multi-Stage Build
- `npm ci --legacy-peer-deps`
- `npm run build`
- Runtime startet mit `npm run db:migrate && npm start`

---

## 19) Wichtige Codepfade (Orientierung)

- `src/server/routers/*`: tRPC Endpoints
- `src/app/api/*`: REST Endpoints
- `src/server/services/*`: Business Logik
- `src/server/db/schema.ts`: DB Schema
- `src/lib/module-loader.ts`: Module System
- `src/app/(dashboard)/*`: Dashboard UI

---

## 20) Hinweise fuer Mitarbeit

- Strict TypeScript: `strict: true` in `tsconfig.json`
- `server-only` nutzen, wenn Module/Services nicht ins Client Bundle duerfen
- Module sollten `mod_` Tabellen nutzen
- Suche/Embeddings: Reindex via Jobs
- Auth/Rate Limit: zentral im `auth` Router
- Keine lokalen Builds/Starts in dieser Umgebung; Deploy via Git Push

---

## 21) Scan auf Stubs/Mocks

Eine schnelle Projektsuche nach typischen Stub/Mock Markern (TODO/FIXME/NotImplemented) ergab keine Treffer in `src/` (einziger Treffer war das iCal Keyword `VTODO`). Es gibt aktuell keine offensichtlichen Stub-Implementierungen in der Codebase.
