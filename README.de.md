# Xynoxa Cloud

Eine moderne, selbst gehostete Personal Cloud: Dateien, Notizen, Bookmarks, Kalender, Aufgaben, Vault und semantische Suche — in einer klaren UI.

- Moderne UX (Next.js + Tailwind + shadcn/ui)
- Volltext + semantische Suche (Meilisearch + pgvector)
- Zero‑Knowledge Vault (Client‑seitige Verschlüsselung)
- Multi‑User, Gruppen, Gruppenordner, Mandanten
- Desktop‑Sync‑Client

## Offizielle Links

Dein Xynoxa-Kompass: Startpunkt, Quellen und alle drei Apps an einem Ort, damit du immer direkt im richtigen Repo landest.

- Xynoxa Webseite: https://www.xynoxa.com
- Xynoxa Cloud Anwendung: https://github.com/christinloehner/Xynoxa-Cloud
- Xynoxa Desktop Client: https://github.com/christinloehner/Xynoxa-Desktop-Client
- Xynoxa Mobile Client: https://github.com/christinloehner/Xynoxa-Mobile-Client

## ACHTUNG ACHTUNG ACHTUNG ACHTUNG ACHTUNG ACHTUNG ACHTUNG

Achtung! Diese Anwendung ist noch in der Entwicklung und definitiv nicht empfohlen für den täglichen Gebrauch! Aktuell ist es nur empfohlen, die Anwendung zum testen zu installieren und nicht produktiv zu verwenden!

**Achtung! Rechne aktuell noch mit Datenverlusten, wenn Du diese Anwendung testet!**


## Schnellstart (empfohlen: Traefik Reverse Proxy)

One‑Command Setup (empfohlen für Einsteiger):

```bash
./scripts/setup.sh
```

Manuelles Setup:

1) Repo klonen

```bash
git clone https://github.com/christinloehner/Xynoxa-Cloud xynoxa-cloud
cd xynoxa-cloud
```

2) `.env` anlegen

```bash
cp .env.example .env
```

3) `.env` anpassen (Minimum)

- `APP_DOMAIN` (z.B. `cloud.example.com`)
- `APP_URL` (z.B. `https://cloud.example.com`)
- `SESSION_SECRET` (lange, zufällige Zeichenkette)
- `MEILI_MASTER_KEY` (starker Key)

4) Stack starten

```bash
docker compose up -d
```

5) App öffnen

- `https://<APP_DOMAIN>`
- Der erste registrierte User wird **Owner**

## Dokumentation

- Installations‑Guide: `docs/INSTALL.de.md`
- Konfiguration: `docs/CONFIGURATION.de.md`
- Troubleshooting: `docs/TROUBLESHOOTING.de.md`
- FAQ: `docs/FAQ.de.md`
- Upgrade‑Guide: `docs/UPGRADE.de.md`
- Sicherheits‑Hinweise: `docs/SECURITY.de.md`
- Technische Architektur: `docs/TECHNICAL.de.md`
- Modul‑System: `docs/MODULES.de.md`

## Lizenz

AGPL‑3.0 — siehe `LICENSE`.

---

Für einen öffentlichen Betrieb ist HTTPS Pflicht (Traefik ist der Standard‑Pfad).
Ein optionaler Traefik‑Service ist in `docker-compose.yml` auskommentiert enthalten.
