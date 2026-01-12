# Xynoxa – Technische Dokumentation & Installationsanleitung

Diese Anleitung führt dich Schritt für Schritt durch Aufbau, Konfiguration und Betrieb von Xynoxa in einer eigenen Docker-Umgebung. Ziel: Ohne Vorwissen eine lauffähige Instanz aufsetzen.

---

## Architekturüberblick
- **app** (Next.js 16, tRPC, Node 22) – Frontend + API
- **worker** (Node 22) – Hintergrund-Jobs/Uploads/Suche (optional je nach Setup)
- **db** (PostgreSQL 16 + pgvector) – Primäre Datenbank
- **meilisearch** – Volltext-Suche
- **minio** – S3-kompatibler Storage (alternativ lokales FS)
- **code** – VS Code Server (browserbasierter Editor für Text/Code-Dateien)
- **redis** (falls konfiguriert) – Queue/Cache (optional)
- **traefik** – Reverse Proxy/HTTPS (optional, empfohlen in Produktion)

Alle Komponenten werden via `docker-compose.yml` gestartet und über ein gemeinsames Netz verbunden.

---

## Voraussetzungen
- Linux/Windows/macOS mit Docker + Docker Compose
- 4 GB RAM (Minimum für Tests), 8 GB+ empfohlen
- 10 GB freier Speicher (abhängig von Dateien/Indizes)
- Offen: HTTP/HTTPS-Ports (80/443) bei Nutzung von Traefik/öffentlich

---

## Schnellstart (Standard, lokales FS)
```bash
git clone <dein-repo-oder-pfad> xynoxa
cd xynoxa
cp .env.example .env          # Umgebung anpassen (siehe unten)
docker compose up -d          # startet alle Container
```
Öffne anschließend `http://localhost:3000`. Der erste registrierte User wird **owner**.

## Optional: Setup-Script (empfohlen für Einsteiger)

Das Script legt `.env` an, generiert Secrets und startet die Container:

```bash
./scripts/setup.sh
```

---

## Wichtige Umgebungsvariablen (.env)
- `APP_URL` – Externe URL (z.B. https://cloud.meine-domain.de)
- `PORT` – Port des app-Containers (Standard 3000)
- `DATABASE_URL` – Postgres-Connection (kommt aus Compose-Defaults)
- `SESSION_SECRET` – Langes, zufälliges Secret (z.B. `openssl rand -hex 32`)
- `MEILI_HOST` / `MEILI_MASTER_KEY` – Meilisearch Endpoint + Key
- `STORAGE_DRIVER` – `local` oder `minio`
- Bei `minio`: `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `CODE_SERVER_PASSWORD` – Passwort für den VS Code Server (Subdomain `code.${APP_DOMAIN}`)
- Optional: SMTP für Mails (wenn eingerichtet), Traefik-Domains/Resolver

**Tipp:** Für Produktion immer HTTPS hinter Traefik nutzen und `APP_URL` auf die HTTPS-Domain setzen.

**Alternative:** In der `docker-compose.yml` gibt es einen **auskommentierten** Traefik‑Service,
den du bei Bedarf aktivieren kannst, wenn Traefik nicht separat läuft.

---

## Docker-Compose Struktur (Kurz erklärt)
- `app`: baut aus `Dockerfile` (Next.js build, served per Node)
- `worker`: gleicher Code, aber für asynchrone Tasks (Uploads/Indizes)
- `db`: Postgres mit pgvector-Erweiterung
- `meilisearch`: Volltext
- `minio` optional (nur bei STORAGE_DRIVER=minio): S3-kompatibler Storage; Daten in `volumes/minio`
- `code`: VS Code Server, bedient über `code.${APP_DOMAIN}`, nutzt `volumes/files_data`
- `traefik`: (falls in Compose aktiviert) TLS, Routing

Volumes/Verzeichnisse:
- `volumes/files_data` – File-Storage (bei STORAGE_DRIVER=local)
- `volumes/db_data` – Postgres-Daten
- `volumes/meili_data` – Meilisearch-Index
- `volumes/minio` – MinIO-Buckets (falls genutzt)

---

## Build & Run
### Development lokal (optional)
```bash
npm install
npm run dev             # Next.js Dev-Server
npm run lint            # Lint
npm run test            # Unit Tests (Vitest)
```

### Production mit Docker Compose
```bash
docker compose down
docker compose build --pull --no-cache
docker compose up -d
```

### Datenbank-Migrationen
Die Drizzle-Migrationen sind im Buildprozess integriert. Falls du sie manuell anstoßen willst:
```bash
docker compose exec app npm run db:push
```

---

## Erstkonfiguration im UI
1. Browser öffnen: `APP_URL`
2. Erst-User registrieren → wird **owner**
3. Vault-Passphrase setzen (unter „Vault“ oder im Files-Dialog)
4. Optional: 2FA aktivieren, API-Tokens erzeugen

---

## Vault-Workflow (wichtig)
- **Entsperren**: Passphrase eingeben → Schlüssel bleibt nur im Browser.
- **Upload**: Im Upload-Dialog „Vault“ aktivieren oder in den „Vault“-Ordner hochladen (wird erzwungen). Datei wird **client-seitig** verschlüsselt (AES-GCM), Server speichert nur Cipher + IV.
- **Anzeigen/Herunterladen**: Previews sind blockiert. Bei entsperrtem Vault wird der Download im Browser entschlüsselt und als Klartext gespeichert.
- **Sicherheit**: Passphrase-Verlust = kein Zugriff auf Vault-Daten (kein Server-Recovery).

---

## File-Handling
- Chunked Uploads (`/api/upload/chunk`) für große Dateien.
- Versionierung, Kopieren/Verschieben, Soft-Delete/Papierkorb.
- Shares mit Token, optional Passwort/Ablaufdatum.
- Download/Preview: Vault geblockt serverseitig, aber clientseitig entschlüsselbar (siehe oben).

---

## Suche
- Meilisearch indexiert Dateien/Notizen/Bookmarks/Events/Tasks/Folders.
- Semantische Suche via pgvector (Embeddings in Postgres).
- Reindex per `search.reindex` (tRPC, Admin).

---

## Kalender & Aufgaben
- Events mit Start/Ende, RRULE, ICS-Import/Export.
- Tasks mit Status todo/done, optional Due-Date, Assignee.

---

## Bookmarks
- `bookmarks.fetchMetadata` holt Titel/Beschreibung/Favicon.
- CRUD + Tags, Volltextindex.

---

## Notes
- tiptap JSON, Markdown, Tags.
- Vault-Notizen möglich (Ciphertext + IV).
- Export als Markdown, Summary-Funktion vorhanden.

---

## Admin & Multi-Tenancy
- Rollen: owner, admin, member, viewer.
- Gruppen & Gruppenordner mit Zugriffsliste.
- Mandanten (tenants) für getrennte Bereiche.
- Impersonation: Admin kann in User-Sessions springen.
- System-Status: `system.status`, `system.stats`.

---

## Backup & Restore (Quick)
```bash
# DB
docker compose exec db pg_dump -U xynoxa xynoxa | gzip > backup.sql.gz
# Files (lokal)
tar -czf files-backup.tar.gz -C volumes files_data
# Meilisearch
tar -czf meili-backup.tar.gz -C volumes meili_data
# MinIO (falls genutzt): mc mirror oder tar des Volumes
```
Restore entsprechend rückwärts (Container stoppen, Daten einspielen, starten).

---

## Betrieb & Troubleshooting
- Logs ansehen:
  - `docker compose logs -f app`
  - `docker compose logs -f worker`
  - `docker compose logs -f db`
  - `docker compose logs -f meilisearch`
- Benachrichtigungen:
  - Neuer SSE-Stream unter `/api/notifications/stream` (authentifizierte Sessions), liefert neue Notifications + Unread-Count in Echtzeit.
  - tRPC-Router `notifications`: `list`, `unreadCount`, `markRead`, `delete`, `create` (für interne Aufrufe/Tests).
  - Serverseitig Benachrichtigungen erstellen via `createNotification({ userId, title, body?, href?, level?, meta? })` aus `src/server/services/notifications.ts`.
- Healthchecks:
  - `/api/trpc/health.ping`
  - `system.status` (tRPC)
- Typische Stolpersteine:
  - Vault entsperren, bevor verschlüsselte Uploads/Downloads funktionieren.
  - `APP_URL` muss HTTPS sein, wenn hinter Traefik; Session-Cookies sonst evtl. nicht gesetzt.
  - Meili-Key falsch → Suche liefert leer; `.env` prüfen.

---

## Deployment-Hinweise
- **HTTPS**: Traefik mit Let’s Encrypt konfigurieren (Labels in `docker-compose.yml` anpassen).
- **Storage**: Für Produktion MinIO oder externes S3-Backend erwägen.
- **Scaling**: `app` und `worker` können repliziert werden; DB/Meili brauchen eigene Skalierungsstrategien.
- **Security**: Starke `SESSION_SECRET`, 2FA für Admins, regelmäßige Backups, restriktive Firewall.

---

## Upgrade
```bash
git pull
docker compose down
docker compose build --pull --no-cache
docker compose up -d
```
Falls das DB-Schema geändert wurde: `docker compose exec app npm run db:push`.

---

## Module (Wichtiger Hinweis)

Wenn du **neue Module** in `src/modules/` hinzufuegst (oder entfernst), muessen die
App-Routen neu generiert werden. Das passiert automatisch waehrend des Builds.

**Wichtig:** Damit neue Module im Adminbereich aktivierbar und ueber die Sidebar erreichbar sind,
ist ein Build/Deploy erforderlich, damit die Wrapper-Pages fuer die Modul-Routen erzeugt werden.

Kurzform:
```
npm run build
```

---

## Support / Weiterentwicklung
- Code und Router in `src/server/routers/*`
- Frontend Pages unter `src/app`
- Komponenten unter `src/components`
- Jobs/Services unter `src/server/services`

Starte bei Änderungen immer mit Lint/Tests/Build:
```bash
npm run lint
npm run test
npm run build
```

---

Mit dieser Anleitung solltest du Xynoxa ohne Vorkenntnisse installieren, betreiben und absichern können. Viel Spaß beim eigenen Personal Data Lake! 
