#!/usr/bin/env bash
set -Eeuo pipefail

CHATWOOT_CONTAINER="${CHATWOOT_CONTAINER:-atendimento-chatwoot}"
EVOLUTION_CONTAINER="${EVOLUTION_CONTAINER:-atendimento-evolution}"

echo "======================================================"
echo " ATENDIMENTO.CENTER — OMNICHANNEL READINESS"
echo "======================================================"

check_env() {
  local container="$1"
  local var="$2"
  local value
  value="$(docker exec "$container" sh -lc "printenv $var 2>/dev/null || true")"
  if [[ -n "$value" ]]; then
    echo "$var=SET"
  else
    echo "$var=EMPTY"
  fi
}

echo
echo "=== CHATWOOT / META ==="
for var in   FB_APP_ID   FB_APP_SECRET   FB_VERIFY_TOKEN   INSTAGRAM_APP_ID   INSTAGRAM_APP_SECRET   INSTAGRAM_VERIFY_TOKEN   IG_VERIFY_TOKEN
do
  check_env "$CHATWOOT_CONTAINER" "$var"
done

echo
echo "=== CHATWOOT ACCOUNTS / INBOXES ==="
docker exec "$CHATWOOT_CONTAINER"   bundle exec rails runner '
Account.order(:id).each do |account|
  puts "ACCOUNT|#{account.id}|#{account.name}"
  account.inboxes.order(:id).each do |inbox|
    puts "INBOX|#{account.id}|#{inbox.id}|#{inbox.name}|#{inbox.channel_type}"
  end
end
'

echo
echo "=== EVOLUTION INSTANCES ==="
EVO_KEY="$(docker exec "$EVOLUTION_CONTAINER" printenv AUTHENTICATION_API_KEY 2>/dev/null || true)"

if [[ -z "$EVO_KEY" ]]; then
  echo "EVOLUTION_API_KEY=EMPTY"
  exit 0
fi

docker run --rm   --network platform_edge   curlimages/curl:8.12.1   -sS   -H "apikey: ${EVO_KEY}"   http://atendimento-evolution:8080/instance/fetchInstances   | jq '
      if type == "array" then
        map({
          name,
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
      else
        .
      end
    '

unset EVO_KEY

echo
echo "======================================================"
echo " END"
echo "======================================================"
