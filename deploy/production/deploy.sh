#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Ficheiro .env ausente. Execute ./setup-secrets.sh primeiro." >&2
  exit 1
fi

chmod 600 .env
chmod +x postgres-init/01-create-databases.sh

echo "Validando Docker Compose..."
docker compose config >/dev/null

echo "Atualizando imagens base..."
docker compose pull caddy postgres redis chatwoot chatwoot_worker evolution

echo "Construindo Atendimento.Center backend e frontend..."
docker compose build --pull backend frontend

echo "Iniciando PostgreSQL e Redis..."
docker compose up -d postgres redis

echo "Preparando a base Chatwoot..."
docker compose run --rm chatwoot bundle exec rails db:chatwoot_prepare

echo "Preparando o esquema próprio no Supabase..."
docker compose run --rm backend npx prisma db push

echo "Iniciando toda a plataforma..."
docker compose up -d

echo "Aguardando health checks básicos..."
for attempt in $(seq 1 30); do
  if docker compose exec -T backend node -e "fetch('http://127.0.0.1:8080/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 2
done

docker compose ps

echo
cat <<'EOF'
Plataforma iniciada.

Verificações públicas após o DNS/TLS estar ativo:
  https://atendimento.center
  https://app.atendimento.center/app
  https://api.atendimento.center/api/v1/health
  https://chat.atendimento.center
  https://evo.atendimento.center

Logs:
  docker compose logs -f backend
  docker compose logs -f frontend
  docker compose logs -f chatwoot chatwoot_worker
  docker compose logs -f evolution
  docker compose logs -f caddy
EOF
