#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não está instalado. Execute bootstrap-vps.sh primeiro." >&2
  exit 1
fi

read -r -p "E-mail ACME/Let's Encrypt [ops@atlasglobal.digital]: " ACME_EMAIL
ACME_EMAIL=${ACME_EMAIL:-ops@atlasglobal.digital}

read -r -s -p "Password do Postgres/Supabase: " SUPABASE_DB_PASSWORD
echo
if [[ -z "$SUPABASE_DB_PASSWORD" ]]; then
  echo "A password do Supabase é obrigatória." >&2
  exit 1
fi

read -r -s -p "Password para proteger evo.atendimento.center: " EVOLUTION_BASIC_PASSWORD
echo
if [[ -z "$EVOLUTION_BASIC_PASSWORD" ]]; then
  echo "A password de proteção da Evolution é obrigatória." >&2
  exit 1
fi

read -r -s -p "OpenRouter API key (Enter para configurar depois): " OPENROUTER_API_KEY
echo

SUPABASE_DB_PASSWORD_ENCODED=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=""))' <<<"$SUPABASE_DB_PASSWORD")
LOCAL_POSTGRES_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
CHATWOOT_SECRET_KEY_BASE=$(openssl rand -hex 64)
EVOLUTION_API_KEY=$(openssl rand -hex 32)
EVOLUTION_BASIC_AUTH_HASH=$(docker run --rm caddy:2.10.0-alpine caddy hash-password --plaintext "$EVOLUTION_BASIC_PASSWORD")

umask 077
cat >.env <<EOF
ACME_EMAIL=$ACME_EMAIL
EVOLUTION_BASIC_AUTH_HASH='$EVOLUTION_BASIC_AUTH_HASH'
CHATWOOT_VERSION=v4.16.0-ce
LOCAL_POSTGRES_USER=atendimento
LOCAL_POSTGRES_PASSWORD=$LOCAL_POSTGRES_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
CHATWOOT_SECRET_KEY_BASE=$CHATWOOT_SECRET_KEY_BASE
EVOLUTION_API_KEY=$EVOLUTION_API_KEY
SUPABASE_DATABASE_URL=postgresql://postgres.euigjmkdreiztamqmhsw:$SUPABASE_DB_PASSWORD_ENCODED@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require
CHATWOOT_API_TOKEN=
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
OPENROUTER_MODEL=openai/gpt-4.1-mini
MAILER_SENDER_EMAIL=Atendimento.Center <no-reply@atendimento.center>
SMTP_ADDRESS=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_AUTHENTICATION=login
SMTP_ENABLE_STARTTLS_AUTO=true
EOF
chmod 600 .env
unset SUPABASE_DB_PASSWORD EVOLUTION_BASIC_PASSWORD

echo
printf '%s\n' "Segredos criados em: $SCRIPT_DIR/.env" \
  "Evolution API key: guardada no .env" \
  "O ficheiro .env não deve ser enviado ao GitHub."
