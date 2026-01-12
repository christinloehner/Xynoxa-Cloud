# Security Notes

## Essentials

- Use **HTTPS** (Traefik recommended)
- Set a strong `SESSION_SECRET`
- Use a strong `MEILI_MASTER_KEY`
- Enable 2FA for admin accounts
- Back up database and storage regularly

## Vault

Vault content is **client‑side encrypted**. The server never sees plaintext. Losing the Vault passphrase means the data cannot be recovered.

## Responsible Disclosure

If you find a security issue, please open a private report or contact the maintainer before public disclosure.
