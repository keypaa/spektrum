#!/usr/bin/env bash
# Deploy the reference stack (spec §19). Idempotent: safe to re-run.
#
#   ./scripts/deploy.sh
#
# Reads .env from the repo root. Runs the one-shot `migrate` service (schema +
# buckets) before starting the app, then waits for the health endpoint.
# Owner creation is NOT done here: it needs a password and must be explicit.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker/compose.prod.yml)
ENV_FILE=".env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — copy .env.example to .env and fill it in" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
. "./$ENV_FILE"
set +a

if [[ -z "${PUBLIC_URL:-}" || -z "${ACME_EMAIL:-}" ]]; then
  echo "PUBLIC_URL and ACME_EMAIL must be set in $ENV_FILE" >&2
  exit 1
fi

echo "==> pulling images"
"${COMPOSE[@]}" --env-file "$ENV_FILE" pull

echo "==> migrating (schema + buckets)"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d migrate
"${COMPOSE[@]}" --env-file "$ENV_FILE" wait migrate

echo "==> starting the stack"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d web worker caddy

echo "==> waiting for ${PUBLIC_URL%/}/api/health"
for _ in $(seq 1 60); do
  if curl -fsS "${PUBLIC_URL%/}/api/health" >/dev/null 2>&1; then
    echo "healthy"
    break
  fi
  sleep 2
done

if ! curl -fsS "${PUBLIC_URL%/}/api/health" >/dev/null 2>&1; then
  echo "health check failed — docker compose -f docker/compose.prod.yml logs web" >&2
  exit 1
fi

cat <<'EOF'

Deployed.

Create the first owner explicitly. The password is read from the environment,
never written to disk or to this script:

  read -rsp 'owner password: ' OWNER_PASSWORD && export OWNER_PASSWORD
  docker compose -f docker/compose.prod.yml exec -T web \
    pnpm admin:create-owner --email you@example.com

EOF