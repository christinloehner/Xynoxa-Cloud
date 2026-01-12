# Troubleshooting

## App doesn’t load / 502 from Traefik
- Check container health: `docker compose ps`
- Check logs: `docker compose logs -f app`
- Verify `APP_DOMAIN` and Traefik router labels

## Login works, but sessions drop
- Ensure `APP_URL` is **HTTPS** in production
- Set a strong `SESSION_SECRET`

## Search returns empty results
- Verify `MEILI_HOST` and `MEILI_MASTER_KEY`
- Check `meilisearch` container health

## Uploads fail for large files
- Traefik buffering limits must allow large bodies (already set in `docker-compose.yml`)
- Verify your reverse proxy limits if you use a custom proxy

## Vault files cannot be downloaded
- The Vault must be **unlocked** in the UI
- Vault content is client‑side encrypted and cannot be previewed server‑side

## Worker not running / no background jobs
- Worker is required for thumbnails, indexing, and maintenance
- Check: `docker compose logs -f worker`

## I changed modules but routes are missing
- Module routes are generated on build; run a new build/deploy
- See `docs/MODULES.md`
