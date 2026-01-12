# Upgrade Guide

1) Pull the latest changes

```bash
git pull
```

2) Rebuild and restart

```bash
docker compose down
docker compose build --pull --no-cache
docker compose up -d
```

3) Database migrations

Migrations are executed on startup by the app container. If you need to run them manually:

```bash
docker compose exec app npm run db:push
```
