# Sicherheits‑Hinweise

## Essentials

- HTTPS nutzen (Traefik empfohlen)
- `SESSION_SECRET` stark setzen
- `MEILI_MASTER_KEY` stark setzen
- 2FA für Admins aktivieren
- Regelmäßige Backups von DB und Storage

## Vault

Vault‑Inhalte sind **client‑seitig verschlüsselt**. Der Server sieht keinen Klartext. Verlust der Passphrase = Verlust der Daten.

## Responsible Disclosure

Wenn du ein Sicherheitsproblem findest, bitte zuerst vertraulich melden.
