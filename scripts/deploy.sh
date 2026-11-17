#!/usr/bin/env bash
# Deploy the reference stack (spec §19). Idempotent: safe to re-run.
#
#   ./scripts/deploy.sh
#
# Reads .env from the repo root. Builds the images, runs the one-shot `migrate`
# service (schema + buckets) before starting the app, then waits for the health
# endpoint. Owner creation is NOT done here: it needs a password and must be
# explicit.
#
# Set IMAGE_REGISTRY to pull pre-built images from a registry instead of
# building locally (`docker compose pull` cannot pull a service that only has a
# local `build:` and no registry-qualified image name).
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib/compose.sh
source scripts/lib/compose.sh
ENV_FILE="${SPEKTRUM_ENV_FILE:-.env}"
# Absolute so a test can point at a temporary file.
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$PWD/$ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — copy .env.example to .env and fill it in" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

if [[ -z "${PUBLIC_URL:-}" || -z "${ACME_EMAIL:-}" ]]; then
  echo "PUBLIC_URL and ACME_EMAIL must be set in $ENV_FILE" >&2
  exit 1
fi

# Preflight: both failures below otherwise surface much later and look like an
# application bug — a compile that cannot start, or a worker that restart-loops.
TEXLIVE_TAG="${TEXLIVE_IMAGE:-spektrum-texlive:local}"
if ! docker image inspect "$TEXLIVE_TAG" >/dev/null 2>&1; then
  echo "warning: TeX Live image '$TEXLIVE_TAG' is not on this host — compiles will fail." >&2
  echo "         build it: TEXLIVE_IMAGE=$TEXLIVE_TAG ./scripts/build-texlive.sh" >&2
fi

# The worker reaches the Docker socket through its group; compose passes
# DOCKER_GID for that. A mismatch is silent at deploy time and fatal later.
# DOCKER_SOCKET is overridable so the check can be tested against a scratch path.
DOCKER_SOCKET="${DOCKER_SOCKET:-/var/run/docker.sock}"
if [[ -e "$DOCKER_SOCKET" ]]; then
  SOCKET_GID="$(stat -c '%g' "$DOCKER_SOCKET" 2>/dev/null || true)"
  if [[ -n "$SOCKET_GID" && "$SOCKET_GID" != "${DOCKER_GID:-999}" ]]; then
    echo "warning: DOCKER_GID=${DOCKER_GID:-999} but $DOCKER_SOCKET is owned by group $SOCKET_GID —" >&2
    echo "         the worker cannot use the socket. Set DOCKER_GID=$SOCKET_GID in $ENV_FILE." >&2
  fi
fi

if [[ -n "${IMAGE_REGISTRY:-}" ]]; then
  echo "==> pulling pre-built images from ${IMAGE_REGISTRY}"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" pull
else
  echo "==> building images"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" build
fi

echo "==> migrating (schema + buckets)"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d migrate
"${COMPOSE[@]}" --env-file "$ENV_FILE" wait migrate

echo "==> starting the stack"
"${COMPOSE[@]}" --env-file "$ENV_FILE" up -d web worker caddy

ATTEMPTS="${HEALTH_ATTEMPTS:-60}"
INTERVAL="${HEALTH_INTERVAL:-2}"
echo "==> waiting for ${PUBLIC_URL%/}/api/health"
for ((i = 1; i <= ATTEMPTS; i += 1)); do
  if curl -fsS "${PUBLIC_URL%/}/api/health" >/dev/null 2>&1; then
    echo "healthy"
    break
  fi
  if ((i == ATTEMPTS)); then
    echo "health check failed — ./scripts/dc.sh logs web" >&2
    exit 1
  fi
  sleep "$INTERVAL"
done

cat <<EOF

Deployed.

Create the first owner explicitly. The password is read from the environment,
never written to disk or to this script:

  read -rsp 'owner password: ' OWNER_PASSWORD && export OWNER_PASSWORD
  ./scripts/dc.sh run --rm -e OWNER_PASSWORD migrate \\
    pnpm --filter @spektrum/web admin:create-owner \\
    --email you@example.com --name "Your Name"

It runs in the migrate image on purpose: the web image is a standalone build
with no pnpm.

EOF
