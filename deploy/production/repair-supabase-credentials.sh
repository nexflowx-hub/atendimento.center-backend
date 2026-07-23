#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Ficheiro .env ausente. Execute ./setup-secrets.sh primeiro." >&2
  exit 1
fi

read -r -s -p "Introduza a Database Password REAL do projeto Supabase: " DB_PASSWORD
echo

if [[ -z "$DB_PASSWORD" ]]; then
  echo "A Database Password não pode estar vazia." >&2
  exit 1
fi

DB_PASSWORD="$DB_PASSWORD" python3 <<'PY'
import os
import pathlib
import urllib.parse

path = pathlib.Path('.env')
lines = path.read_text(encoding='utf-8').splitlines()
prefix = 'SUPABASE_DATABASE_URL='

for index, line in enumerate(lines):
    if not line.startswith(prefix):
        continue

    current = line[len(prefix):].strip().strip('"').strip("'")
    parsed = urllib.parse.urlsplit(current)
    username = urllib.parse.unquote(parsed.username or '')
    password = urllib.parse.quote(os.environ['DB_PASSWORD'], safe='')
    host = parsed.hostname or ''
    port = f':{parsed.port}' if parsed.port else ''
    user = urllib.parse.quote(username, safe='.')
    netloc = f'{user}:{password}@{host}{port}'
    updated = urllib.parse.urlunsplit((parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))
    lines[index] = prefix + updated
    break
else:
    raise SystemExit('SUPABASE_DATABASE_URL não encontrada no .env')

path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
PY

chmod 600 .env

mapfile -t CONNECTION_PARTS < <(python3 <<'PY'
import pathlib
import urllib.parse

for line in pathlib.Path('.env').read_text(encoding='utf-8').splitlines():
    if line.startswith('SUPABASE_DATABASE_URL='):
        parsed = urllib.parse.urlsplit(line.split('=', 1)[1].strip().strip('"').strip("'"))
        print(parsed.hostname or '')
        print(parsed.port or 5432)
        print(urllib.parse.unquote(parsed.username or ''))
        print((parsed.path or '/postgres').lstrip('/'))
        break
else:
    raise SystemExit('SUPABASE_DATABASE_URL não encontrada')
PY
)

DB_HOST=${CONNECTION_PARTS[0]}
DB_PORT=${CONNECTION_PARTS[1]}
DB_USER=${CONNECTION_PARTS[2]}
DB_NAME=${CONNECTION_PARTS[3]}

echo "Testando autenticação no Supabase..."
docker run --rm \
  -e PGPASSWORD="$DB_PASSWORD" \
  postgres:16-alpine \
  psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require connect_timeout=15" \
  -v ON_ERROR_STOP=1 \
  -c 'select current_database(), current_user, now();'

unset DB_PASSWORD

echo "Aplicando o esquema Prisma..."
docker compose run --rm backend npx prisma db push

echo "Iniciando/atualizando a plataforma..."
docker compose up -d

docker compose ps

echo "Credenciais do Supabase corrigidas e validadas."
