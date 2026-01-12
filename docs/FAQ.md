# FAQ

## Is Traefik required?
Traefik is the **default** setup. You can use another reverse proxy, but you must adapt the Docker labels and routing accordingly. A commented Traefik service example is included in `docker-compose.yml`.

## Where is my data stored?
By default, files are stored on the local filesystem under `./volumes/files_data`. Database data is under `./volumes/db_data`, and search indexes under `./volumes/meili_data`.

## Can I use MinIO / S3?
Yes. Set `STORAGE_DRIVER=minio` and configure the `MINIO_*` variables in `.env`.

## Do I need the worker container?
Yes. The worker handles background jobs such as indexing, thumbnails, and maintenance tasks.

## I forgot my Vault passphrase. Can I recover the data?
No. Vault is client‑side encrypted. Without the passphrase, data cannot be recovered.

## How do I upgrade?
See `docs/UPGRADE.md`.

## Can I reset everything?
Yes, but it deletes all data. Stop containers and remove volumes:

```bash
docker compose down
rm -rf volumes
```

Then start again.
