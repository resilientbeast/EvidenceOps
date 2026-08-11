#!/usr/bin/env bash
set -euo pipefail

project_dir="${1:-/opt/evidenceops}"
cd "${project_dir}"

if [[ ! -f .env ]]; then
  echo "Missing ${project_dir}/.env. Copy infra/lightsail/evidenceops.env.example and add the server-side secrets." >&2
  exit 1
fi

chmod 600 .env
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml build --pull
docker compose -f compose.production.yml up -d --remove-orphans
docker compose -f compose.production.yml ps

for attempt in {1..24}; do
  if curl -fsS http://127.0.0.1:3100/api/health; then
    printf '\nEvidenceOps container is healthy.\n'
    exit 0
  fi
  sleep 5
done

docker compose -f compose.production.yml logs --tail=100 app
echo "EvidenceOps did not become healthy within 120 seconds." >&2
exit 1
