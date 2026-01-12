# Troubleshooting

## App lädt nicht / 502 von Traefik
- Container‑Health prüfen: `docker compose ps`
- Logs prüfen: `docker compose logs -f app`
- `APP_DOMAIN` und Traefik‑Labels prüfen

## Login klappt, Session fliegt raus
- `APP_URL` in Produktion **HTTPS** setzen
- `SESSION_SECRET` stark und lang setzen

## Suche liefert keine Ergebnisse
- `MEILI_HOST` und `MEILI_MASTER_KEY` prüfen
- Meilisearch‑Container Health prüfen

## Uploads schlagen bei großen Dateien fehl
- Traefik Buffer Limits müssen große Bodies erlauben (bereits im Compose gesetzt)
- Falls anderer Proxy: Limits prüfen

## Vault‑Dateien nicht downloadbar
- Vault muss im UI **entsperrt** sein
- Vault‑Inhalte sind client‑seitig verschlüsselt (keine Server‑Previews)

## Worker läuft nicht / keine Hintergrundjobs
- Worker ist Pflicht (Thumbnails, Index, Maintenance)
- Logs prüfen: `docker compose logs -f worker`

## Module‑Routen fehlen
- Module‑Routen werden beim Build generiert
- Neu bauen/deployen, siehe `docs/MODULES.de.md`
