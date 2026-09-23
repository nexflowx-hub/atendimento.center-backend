#!/usr/bin/env bash
set -Eeuo pipefail

OPERATION="${1:-facelove}"
CHATWOOT_CONTAINER="${CHATWOOT_CONTAINER:-atendimento-chatwoot}"
EVOLUTION_CONTAINER="${EVOLUTION_CONTAINER:-atendimento-evolution}"
API_CONTAINER="${API_CONTAINER:-atendimento-api}"
SECRETS_FILE="${ATC_SECRETS_FILE:-/root/atendimento-center-secrets/chatwoot-operations.json}"
SECRETS_DIR="$(dirname "$SECRETS_FILE")"
NETWORK="${ATC_EDGE_NETWORK:-platform_edge}"

case "$OPERATION" in
  facelove)
    DISPLAY_NAME="FaceLove"
    INSTANCE_NAME="facelove-wa"
    INBOX_NAME="FaceLove • WhatsApp"
    ;;
  treinomilitar)
    DISPLAY_NAME="TreinoMilitar"
    INSTANCE_NAME="treinomilitar-wa"
    INBOX_NAME="TreinoMilitar • WhatsApp"
    ;;
  *)
    echo "Uso: $0 {facelove|treinomilitar}" >&2
    exit 1
    ;;
esac

for container in "$CHATWOOT_CONTAINER" "$EVOLUTION_CONTAINER" "$API_CONTAINER"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "ERRO: container $container não encontrado." >&2
    exit 1
  fi
done

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERRO: $SECRETS_FILE não encontrado. Execute provision-operations.sh primeiro." >&2
  exit 1
fi

install -d -m 700 "$SECRETS_DIR"

CHATWOOT_ACCOUNT_ID="$(
  python3 - "$SECRETS_FILE" "$DISPLAY_NAME" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
name = sys.argv[2]
for item in data.get("operations", []):
    if item.get("name") == name:
        print(item["chatwootAccountId"], end="")
        break
PY
)"

CHATWOOT_TOKEN="$(
  python3 - "$SECRETS_FILE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    print(json.load(f).get("apiAccessToken", ""), end="")
PY
)"

EVOLUTION_KEY="$(docker exec "$EVOLUTION_CONTAINER" printenv AUTHENTICATION_API_KEY 2>/dev/null || true)"

if [[ -z "$CHATWOOT_ACCOUNT_ID" ]]; then
  echo "ERRO: account Chatwoot de $DISPLAY_NAME não encontrado." >&2
  exit 1
fi
if [[ -z "$CHATWOOT_TOKEN" ]]; then
  echo "ERRO: token Chatwoot não encontrado no ficheiro protegido." >&2
  exit 1
fi
if [[ -z "$EVOLUTION_KEY" ]]; then
  echo "ERRO: AUTHENTICATION_API_KEY da Evolution não encontrada." >&2
  exit 1
fi

EXISTING="$(
  docker run --rm     --network "$NETWORK"     curlimages/curl:8.12.1     -sS     -H "apikey: $EVOLUTION_KEY"     http://atendimento-evolution:8080/instance/fetchInstances
)"

if printf '%s' "$EXISTING" | python3 -c '
import json,sys
name=sys.argv[1]
try:
    rows=json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if isinstance(rows,list) and any((x.get("name") or x.get("instance",{}).get("instanceName"))==name for x in rows) else 1)
' "$INSTANCE_NAME"; then
  echo "INSTANCE=$INSTANCE_NAME ALREADY_EXISTS"
else
  export INSTANCE_NAME INBOX_NAME CHATWOOT_ACCOUNT_ID CHATWOOT_TOKEN
  PAYLOAD="$(
    python3 - <<'PY'
import json, os
print(json.dumps({
    "instanceName": os.environ["INSTANCE_NAME"],
    "qrcode": True,
    "integration": "WHATSAPP-BAILEYS",
    "groupsIgnore": True,
    "alwaysOnline": False,
    "readMessages": False,
    "readStatus": False,
    "syncFullHistory": False,
    "chatwootAccountId": str(os.environ["CHATWOOT_ACCOUNT_ID"]),
    "chatwootToken": os.environ["CHATWOOT_TOKEN"],
    "chatwootUrl": "http://atendimento-chatwoot:3000",
    "chatwootSignMsg": True,
    "chatwootReopenConversation": True,
    "chatwootConversationPending": False,
    "chatwootImportContacts": True,
    "chatwootImportMessages": False,
    "chatwootDaysLimitImportMessages": 7,
    "chatwootMergeBrazilContacts": True,
    "chatwootNameInbox": os.environ["INBOX_NAME"],
    "chatwootAutoCreate": True
}, separators=(",", ":")))
PY
  )"

  RESPONSE_FILE="$SECRETS_DIR/${INSTANCE_NAME}-create.json"
  printf '%s' "$PAYLOAD" | docker run --rm -i     --network "$NETWORK"     curlimages/curl:8.12.1     -sS     -H "Content-Type: application/json"     -H "apikey: $EVOLUTION_KEY"     --data-binary @-     http://atendimento-evolution:8080/instance/create     > "$RESPONSE_FILE"
  chmod 600 "$RESPONSE_FILE"
  unset PAYLOAD

  python3 - "$RESPONSE_FILE" "$SECRETS_DIR/${INSTANCE_NAME}-qr.png" <<'PY'
import base64, json, pathlib, sys
src, out = sys.argv[1], sys.argv[2]
data = json.loads(pathlib.Path(src).read_text())
inst = data.get("instance") or {}
print("INSTANCE_NAME=" + str(inst.get("instanceName") or "UNKNOWN"))
print("INSTANCE_STATUS=" + str(inst.get("status") or "UNKNOWN"))
cw = data.get("chatwoot") or {}
print("CHATWOOT_LINK=" + ("READY" if cw.get("enabled") else "PENDING"))
qr = data.get("qrcode") or {}
raw = qr.get("base64")
if raw:
    if "," in raw:
        raw = raw.split(",", 1)[1]
    pathlib.Path(out).write_bytes(base64.b64decode(raw))
    pathlib.Path(out).chmod(0o600)
    print("QR_PNG=" + out)
else:
    print("QR_PNG=PENDING")
PY
fi

BACKEND_OPERATION="$(
  python3 - <<PY
import json
print(json.dumps([{
  "name": "$DISPLAY_NAME",
  "slug": "$OPERATION",
  "chatwootAccountId": int("$CHATWOOT_ACCOUNT_ID"),
  "evolutionInstance": "$INSTANCE_NAME"
}], separators=(",", ":")))
PY
)"

docker exec   -e BOOTSTRAP_OPERATIONS_JSON="$BACKEND_OPERATION"   "$API_CONTAINER"   node scripts/bootstrap-operations.mjs >/dev/null

unset CHATWOOT_TOKEN EVOLUTION_KEY BACKEND_OPERATION EXISTING

echo "TENANT_EVOLUTION_INSTANCE=$INSTANCE_NAME"
echo
echo "Estado seguro da instância:"
docker run --rm   --network "$NETWORK"   curlimages/curl:8.12.1   -sS   -H "apikey: $(docker exec "$EVOLUTION_CONTAINER" printenv AUTHENTICATION_API_KEY)"   http://atendimento-evolution:8080/instance/fetchInstances | jq --arg n "$INSTANCE_NAME" '
    if type == "array" then
      map(select((.name // .instance.instanceName) == $n)
        | {
            name: (.name // .instance.instanceName),
            connectionStatus,
            ownerJid,
            integration,
            chatwoot: (
              if .Chatwoot then
                {
                  enabled: .Chatwoot.enabled,
                  accountId: .Chatwoot.accountId,
                  inboxId: .Chatwoot.inboxId
                }
              else null end
            )
          })
    else . end
  '

echo
echo "Provisionamento concluído."
echo "Se connectionStatus ainda não estiver open, faça o pareamento do WhatsApp pelo QR da instância $INSTANCE_NAME."
