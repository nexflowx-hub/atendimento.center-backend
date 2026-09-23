#!/usr/bin/env bash
set -Eeuo pipefail

RUNTIME_DIR="${ATC_RUNTIME_DIR:-/srv/platform/atendimento-center/runtime}"
ENV_FILE="${ATC_RUNTIME_ENV:-${RUNTIME_DIR}/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: ficheiro .env não encontrado em $ENV_FILE" >&2
  exit 1
fi

echo "Configuração Meta para Chatwoot self-hosted"
echo "Os secrets não serão mostrados no terminal."

read -r -p "Facebook App ID (Messenger; Enter para manter atual): " FB_APP_ID_INPUT
read -r -s -p "Facebook App Secret (Enter para manter atual): " FB_APP_SECRET_INPUT
echo
read -r -p "Instagram App ID (Business Login; Enter para manter atual): " INSTAGRAM_APP_ID_INPUT
read -r -s -p "Instagram App Secret (Enter para manter atual): " INSTAGRAM_APP_SECRET_INPUT
echo

export ENV_FILE FB_APP_ID_INPUT FB_APP_SECRET_INPUT INSTAGRAM_APP_ID_INPUT INSTAGRAM_APP_SECRET_INPUT

python3 - <<'PY'
import os
import secrets
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
lines = path.read_text().splitlines()

def current(key: str) -> str:
    prefix = key + "="
    for line in lines:
        if line.startswith(prefix):
            return line[len(prefix):].strip().strip("'").strip('"')
    return ""

def set_value(key: str, value: str) -> None:
    prefix = key + "="
    for i, line in enumerate(lines):
        if line.startswith(prefix):
            lines[i] = prefix + value
            return
    lines.append(prefix + value)

updates = {
    "FB_APP_ID": os.environ.get("FB_APP_ID_INPUT", "").strip() or current("FB_APP_ID"),
    "FB_APP_SECRET": os.environ.get("FB_APP_SECRET_INPUT", "").strip() or current("FB_APP_SECRET"),
    "INSTAGRAM_APP_ID": os.environ.get("INSTAGRAM_APP_ID_INPUT", "").strip() or current("INSTAGRAM_APP_ID"),
    "INSTAGRAM_APP_SECRET": os.environ.get("INSTAGRAM_APP_SECRET_INPUT", "").strip() or current("INSTAGRAM_APP_SECRET"),
}

for key, value in updates.items():
    if value:
        set_value(key, value)

for key in ("FB_VERIFY_TOKEN", "INSTAGRAM_VERIFY_TOKEN", "IG_VERIFY_TOKEN"):
    if not current(key):
        set_value(key, secrets.token_urlsafe(32))

path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
PY

unset FB_APP_ID_INPUT FB_APP_SECRET_INPUT INSTAGRAM_APP_ID_INPUT INSTAGRAM_APP_SECRET_INPUT

echo
echo "META_ENV=UPDATED"
echo "FB_APP_ID=$(grep -q '^FB_APP_ID=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "FB_APP_SECRET=$(grep -q '^FB_APP_SECRET=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "FB_VERIFY_TOKEN=$(grep -q '^FB_VERIFY_TOKEN=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "INSTAGRAM_APP_ID=$(grep -q '^INSTAGRAM_APP_ID=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "INSTAGRAM_APP_SECRET=$(grep -q '^INSTAGRAM_APP_SECRET=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "INSTAGRAM_VERIFY_TOKEN=$(grep -q '^INSTAGRAM_VERIFY_TOKEN=.' "$ENV_FILE" && echo SET || echo EMPTY)"
echo "IG_VERIFY_TOKEN=$(grep -q '^IG_VERIFY_TOKEN=.' "$ENV_FILE" && echo SET || echo EMPTY)"

echo
echo "Recrie chatwoot + chatwoot_worker para carregar as novas variáveis."
