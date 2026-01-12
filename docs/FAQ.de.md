# FAQ

## Ist Traefik Pflicht?
Traefik ist der **Standard**. Du kannst einen anderen Reverse Proxy nutzen, musst aber die Docker‑Labels und das Routing entsprechend anpassen. Ein auskommentierter Traefik‑Service ist in `docker-compose.yml` enthalten.

## Wo liegen meine Daten?
Standardmäßig liegen die Dateien unter `./volumes/files_data`. Die DB liegt unter `./volumes/db_data`, die Suchindizes unter `./volumes/meili_data`.

## Kann ich MinIO / S3 nutzen?
Ja. Setze `STORAGE_DRIVER=minio` und konfiguriere die `MINIO_*` Variablen in `.env`.

## Brauche ich den Worker‑Container?
Ja. Der Worker verarbeitet Hintergrundjobs (Indexierung, Thumbnails, Maintenance).

## Vault‑Passphrase vergessen – kann ich Daten retten?
Nein. Vault ist client‑seitig verschlüsselt. Ohne Passphrase sind die Daten nicht wiederherstellbar.

## Wie upgrade ich?
Siehe `docs/UPGRADE.de.md`.

## Kann ich alles zurücksetzen?
Ja, aber dadurch werden alle Daten gelöscht. Container stoppen und Volumes löschen:

```bash
docker compose down
rm -rf volumes
```

Danach neu starten.
