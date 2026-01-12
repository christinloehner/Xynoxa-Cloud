# Upgrade‑Guide

1) Neueste Version holen

```bash
git pull
```

2) Rebuild & Restart

```bash
docker compose down
docker compose build --pull --no-cache
docker compose up -d
```

3) Datenbank‑Migrationen

Migrationen laufen beim App‑Start automatisch. Manuell:

```bash
docker compose exec app npm run db:push
```
