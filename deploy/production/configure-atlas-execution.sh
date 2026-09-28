#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: $SCRIPT_DIR/.env não existe. Execute o bootstrap inicial primeiro." >&2
  exit 1
fi

read -r -p "XPAYMENTS base URL [https://api.xpayments.digital/api/v1]: " XPAYMENTS_BASE_URL
XPAYMENTS_BASE_URL=${XPAYMENTS_BASE_URL:-https://api.xpayments.digital/api/v1}

read -r -s -p "XPAYMENTS API key (Enter mantém o valor atual): " XPAYMENTS_API_KEY
echo
read -r -s -p "XPAYMENTS webhook secret (Enter mantém o valor atual): " XPAYMENTS_WEBHOOK_SECRET
echo
read -r -s -p "SMM provider primary API key (Enter mantém o valor atual): " SMM_PROVIDER_PRIMARY_API_KEY
echo
read -r -s -p "Apify token (Enter mantém o valor atual): " APIFY_TOKEN
echo

export ENV_FILE XPAYMENTS_BASE_URL XPAYMENTS_API_KEY XPAYMENTS_WEBHOOK_SECRET SMM_PROVIDER_PRIMARY_API_KEY APIFY_TOKEN
python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
lines = path.read_text(encoding="utf-8").splitlines()

values = {
    "XPAYMENTS_BASE_URL": os.environ["XPAYMENTS_BASE_URL"],
    "XPAYMENTS_API_KEY": os.environ.get("XPAYMENTS_API_KEY", ""),
    "XPAYMENTS_WEBHOOK_SECRET": os.environ.get("XPAYMENTS_WEBHOOK_SECRET", ""),
    "SMM_PROVIDER_PRIMARY_API_KEY": os.environ.get("SMM_PROVIDER_PRIMARY_API_KEY", ""),
    "APIFY_TOKEN": os.environ.get("APIFY_TOKEN", ""),
    "ATLAS_WORKER_INTERVAL_MS": "5000",
    "ATLAS_SIGNALS_WORKER_INTERVAL_MS": "5000",
}

def current(key):
    prefix = key + "="
    for line in lines:
        if line.startswith(prefix):
            return line[len(prefix):]
    return ""

for key, value in list(values.items()):
    if key in {
        "XPAYMENTS_API_KEY",
        "XPAYMENTS_WEBHOOK_SECRET",
        "SMM_PROVIDER_PRIMARY_API_KEY",
        "APIFY_TOKEN",
    } and not value:
        values[key] = current(key)

for key, value in values.items():
    prefix = key + "="
    replaced = False
    for i, line in enumerate(lines):
        if line.startswith(prefix):
            lines[i] = prefix + value
            replaced = True
            break
    if not replaced:
        lines.append(prefix + value)

path.write_text("\n".join(lines) + "\n", encoding="utf-8")
path.chmod(0o600)
PY

unset XPAYMENTS_API_KEY XPAYMENTS_WEBHOOK_SECRET SMM_PROVIDER_PRIMARY_API_KEY APIFY_TOKEN

echo "Atlas execution secrets/config atualizados sem alterar os restantes segredos."
echo "Recrie backend/atlas_worker/atlas_signals_worker para carregar os novos valores:"
echo "  docker compose up -d --build --force-recreate backend atlas_worker atlas_signals_worker"
