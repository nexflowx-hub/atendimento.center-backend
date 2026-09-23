#!/usr/bin/env bash
set -Eeuo pipefail

CHATWOOT_CONTAINER="${CHATWOOT_CONTAINER:-atendimento-chatwoot}"
API_CONTAINER="${API_CONTAINER:-atendimento-api}"
RUNTIME_DIR="${ATC_RUNTIME_DIR:-/srv/platform/atendimento-center/runtime}"
RUNTIME_ENV="${ATC_RUNTIME_ENV:-${RUNTIME_DIR}/.env}"
SECRETS_DIR="${ATC_SECRETS_DIR:-/root/atendimento-center-secrets}"
SECRETS_FILE="${SECRETS_DIR}/chatwoot-operations.json"

for container in "$CHATWOOT_CONTAINER" "$API_CONTAINER"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    echo "ERRO: container $container não encontrado." >&2
    exit 1
  fi
done

if ! docker exec "$API_CONTAINER" test -f /app/scripts/bootstrap-operations.mjs; then
  cat >&2 <<EOF
ERRO: o container $API_CONTAINER ainda não contém bootstrap-operations.mjs.
Atualize/reconstrua o backend antes de executar este provisionamento.
EOF
  exit 1
fi

install -d -m 700 "$SECRETS_DIR"

OPERATIONS_JSON="$(
python3 - <<'PY'
import json
import os

def env(name, default=""):
    return os.environ.get(name, default).strip()

operations = [
    {
        "name": "MyPets",
        "slug": "mypets",
        "websiteUrl": env("MYPETS_WEBSITE_URL", "https://mypets.lat"),
        "welcomeTitle": "MyPets",
        "welcomeTagline": "Olá! Como podemos ajudar?",
        "evolutionInstance": env("MYPETS_EVOLUTION_INSTANCE"),
    },
    {
        "name": "FaceLove",
        "slug": "facelove",
        "websiteUrl": env("FACELOVE_WEBSITE_URL"),
        "welcomeTitle": "FaceLove",
        "welcomeTagline": "Olá! Como podemos ajudar?",
        "evolutionInstance": env("FACELOVE_EVOLUTION_INSTANCE"),
    },
    {
        "name": "Novidades.Store",
        "slug": "novidades-store",
        "websiteUrl": env("NOVIDADES_WEBSITE_URL", "https://novidades.store"),
        "welcomeTitle": "Novidades.Store",
        "welcomeTagline": "Olá! Como podemos ajudar?",
        "evolutionInstance": env("NOVIDADES_EVOLUTION_INSTANCE"),
    },
    {
        "name": "AtlasHub",
        "slug": "atlashub",
        "websiteUrl": env("ATLASHUB_WEBSITE_URL", "https://atlashub.digital"),
        "welcomeTitle": "AtlasHub",
        "welcomeTagline": "Olá! Como podemos ajudar?",
        "evolutionInstance": env("ATLASHUB_EVOLUTION_INSTANCE"),
    },
]

print(json.dumps(operations, separators=(",", ":")))
PY
)"

CW_OUTPUT="$(
  docker exec -i     -e ATC_OPERATIONS_JSON="$OPERATIONS_JSON"     "$CHATWOOT_CONTAINER"     bundle exec rails runner - <<'RUBY'
require 'json'

operations = JSON.parse(ENV.fetch('ATC_OPERATIONS_JSON'))
admin_account_user = AccountUser.where(role: :administrator).includes(:user).order(:id).first
user = admin_account_user&.user || User.order(:id).first
abort('Nenhum utilizador Chatwoot encontrado.') unless user

results = operations.map do |operation|
  account = Account.find_or_create_by!(name: operation.fetch('name'))

  membership = AccountUser.find_or_initialize_by(account: account, user: user)
  membership.role = :administrator
  membership.save!

  website_url = operation['websiteUrl'].to_s.strip
  inbox = account.inboxes.find_by(channel_type: 'Channel::WebWidget')

  if website_url.present?
    if inbox
      channel = inbox.channel
      channel.update!(
        website_url: website_url,
        welcome_title: operation['welcomeTitle'].presence || operation['name'],
        welcome_tagline: operation['welcomeTagline'].presence,
      )
      inbox.update!(
        name: "#{operation['name']} • Site",
        greeting_enabled: true,
        greeting_message: operation['welcomeTagline'].presence || 'Olá! Como podemos ajudar?',
        enable_auto_assignment: true,
        timezone: 'America/Sao_Paulo',
      )
    else
      channel = account.web_widgets.create!(
        website_url: website_url,
        widget_color: '#111827',
        welcome_title: operation['welcomeTitle'].presence || operation['name'],
        welcome_tagline: operation['welcomeTagline'].presence,
      )
      inbox = account.inboxes.create!(
        name: "#{operation['name']} • Site",
        channel: channel,
        greeting_enabled: true,
        greeting_message: operation['welcomeTagline'].presence || 'Olá! Como podemos ajudar?',
        enable_auto_assignment: true,
        timezone: 'America/Sao_Paulo',
      )
    end

    InboxMember.find_or_create_by!(inbox: inbox, user: user)
  end

  {
    name: operation['name'],
    slug: operation['slug'],
    evolutionInstance: operation['evolutionInstance'].presence,
    chatwootAccountId: account.id,
    websiteInboxId: inbox&.id,
    websiteToken: inbox&.channel&.respond_to?(:website_token) ? inbox.channel.website_token : nil,
    websiteUrl: website_url.presence,
  }
end

payload = {
  adminUserId: user.id,
  adminEmail: user.email,
  apiAccessToken: user.access_token.token,
  operations: results,
}

puts "ATC_BOOTSTRAP_JSON=#{JSON.generate(payload)}"
RUBY
)"

MARKER="$(printf '%s\n' "$CW_OUTPUT" | grep '^ATC_BOOTSTRAP_JSON=' | tail -1 || true)"
unset CW_OUTPUT

if [[ -z "$MARKER" ]]; then
  echo "ERRO: Chatwoot não devolveu o marcador de bootstrap esperado." >&2
  exit 1
fi

PAYLOAD="${MARKER#ATC_BOOTSTRAP_JSON=}"
unset MARKER

export PAYLOAD SECRETS_FILE
python3 - <<'PY'
import json
import os

target = os.environ["SECRETS_FILE"]
payload = json.loads(os.environ["PAYLOAD"])
with open(target, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
os.chmod(target, 0o600)
PY
unset PAYLOAD

BACKEND_OPERATIONS="$(
  python3 - "$SECRETS_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    payload = json.load(f)

print(json.dumps([
    {
        "name": item["name"],
        "slug": item["slug"],
        "chatwootAccountId": item["chatwootAccountId"],
        "evolutionInstance": item.get("evolutionInstance"),
    }
    for item in payload["operations"]
], separators=(",", ":")))
PY
)"

docker exec   -e BOOTSTRAP_OPERATIONS_JSON="$BACKEND_OPERATIONS"   "$API_CONTAINER"   node scripts/bootstrap-operations.mjs

unset BACKEND_OPERATIONS

if [[ -f "$RUNTIME_ENV" ]]; then
  CHATWOOT_API_TOKEN="$(
    python3 - "$SECRETS_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as f:
    print(json.load(f)["apiAccessToken"], end="")
PY
  )"

  export CHATWOOT_API_TOKEN RUNTIME_ENV
  python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["RUNTIME_ENV"])
token = os.environ["CHATWOOT_API_TOKEN"]
lines = path.read_text().splitlines()
prefix = "CHATWOOT_API_TOKEN="
updated = False
for i, line in enumerate(lines):
    if line.startswith(prefix):
        lines[i] = prefix + token
        updated = True
        break
if not updated:
    lines.append(prefix + token)
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
PY

  unset CHATWOOT_API_TOKEN
  echo "CHATWOOT_API_TOKEN=UPDATED_IN_RUNTIME_ENV"
else
  echo "AVISO: $RUNTIME_ENV não existe; CHATWOOT_API_TOKEN não foi atualizado automaticamente."
fi

python3 - "$SECRETS_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    payload = json.load(f)

print("")
print("======================================================")
print(" ATENDIMENTO.CENTER — OPERAÇÕES PROVISIONADAS")
print("======================================================")
for item in payload["operations"]:
    print(
        f'{item["name"]}: '
        f'ACCOUNT_ID={item["chatwootAccountId"]} '
        f'INBOX_ID={item.get("websiteInboxId") or "PENDING"} '
        f'WEBSITE_TOKEN={"SET" if item.get("websiteToken") else "PENDING"} '
        f'URL={item.get("websiteUrl") or "PENDING"}'
    )
print("")
print("Segredos guardados em ficheiro protegido:", sys.argv[1])
PY

echo
echo "Provisionamento idempotente concluído."
echo "Se o CHATWOOT_API_TOKEN foi atualizado, recrie o container atendimento-api para carregar o novo valor."
