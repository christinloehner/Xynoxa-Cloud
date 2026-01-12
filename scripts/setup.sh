#!/usr/bin/env bash
# Copyright (C) 2025 Christin Löhner

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required." >&2
    exit 1
  fi
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    return 0
  fi
  echo "Error: Need openssl, python3, or node to generate secrets." >&2
  exit 1
}

set_env() {
  local key="$1"
  local val="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
from pathlib import Path
env_path = Path("$ENV_FILE")
key = "$key"
val = "$val"
lines = env_path.read_text(encoding="utf-8").splitlines()
found = False
out = []
for line in lines:
    if line.startswith(f"{key}="):
        out.append(f"{key}={val}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={val}")
env_path.write_text("\\n".join(out) + "\\n", encoding="utf-8")
PY
  else
    if grep -q "^${key}=" "$ENV_FILE"; then
      perl -0pi -e "s|^${key}=.*$|${key}=${val}|m" "$ENV_FILE"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
  fi
}

require_cmd docker

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: 'docker compose' is required (Docker Compose v2)." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "Error: .env.example not found." >&2
    exit 1
  fi
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

# Interactive domain prompt (only if terminal is attached)
if [ -t 0 ]; then
  read -r -p "APP_DOMAIN (e.g. cloud.example.com) [leave empty to keep current]: " domain
  if [ -n "$domain" ]; then
    set_env "APP_DOMAIN" "$domain"
    set_env "APP_URL" "https://${domain}"
  fi
fi

# Ensure secrets are set
current_session_secret=$(grep -E "^SESSION_SECRET=" "$ENV_FILE" | cut -d= -f2- || true)
if [ -z "$current_session_secret" ] || echo "$current_session_secret" | grep -qiE "dev-secret|change-me"; then
  set_env "SESSION_SECRET" "$(gen_secret)"
fi

current_meili_key=$(grep -E "^MEILI_MASTER_KEY=" "$ENV_FILE" | cut -d= -f2- || true)
if [ -z "$current_meili_key" ] || echo "$current_meili_key" | grep -qi "change-me"; then
  set_env "MEILI_MASTER_KEY" "$(gen_secret)"
fi

# Ensure proxy network exists (Traefik default)
if ! docker network inspect proxy >/dev/null 2>&1; then
  if [ -t 0 ]; then
    read -r -p "Docker network 'proxy' not found. Create it now? [y/N]: " create_proxy
    if [ "$create_proxy" = "y" ] || [ "$create_proxy" = "Y" ]; then
      docker network create proxy
    fi
  else
    echo "Warning: Docker network 'proxy' not found. Create it or adjust docker-compose.yml." >&2
  fi
fi

echo "Starting containers..."
docker compose up -d

echo "Done. Open https://<APP_DOMAIN> to finish setup."
