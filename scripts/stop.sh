#!/usr/bin/env bash
# Shut the reference stack down. The inverse of deploy.sh.
#
#   ./scripts/stop.sh              # stop + remove containers and network, keep data
#   ./scripts/stop.sh --purge      # also delete the volumes (Postgres, Redis, SeaweedFS, Caddy)
#   ./scripts/stop.sh --images     # also remove the three application images
#
# Data is kept by default: the volumes hold the database, the object store and
# the Caddy state, so a later deploy.sh starts exactly where this left off.
# --purge is destructive and cannot be undone — it is not implied by anything,
# and it prints what it is about to delete before doing it.
#
# Uses scripts/lib/compose.sh, so the ARM pins and --env-file handling match
# deploy.sh rather than being re-derived here.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib/compose.sh
source scripts/lib/compose.sh
ENV_FILE="${SPEKTRUM_ENV_FILE:-.env}"
# Absolute so a test can point at a temporary file.
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$PWD/$ENV_FILE"

PURGE=0
IMAGES=0
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=1 ;;
    --images) IMAGES=1 ;;
    -h | --help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE — copy .env.example to .env and fill it in" >&2
  exit 1
fi

if [[ "$PURGE" == 1 ]]; then
  echo "==> stopping and DELETING all stack data (databases, object store, TLS state)"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" down -v --remove-orphans
else
  echo "==> stopping the stack (containers and network; data volumes are kept)"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" down --remove-orphans
fi

if [[ "$IMAGES" == 1 ]]; then
  echo "==> removing the application images"
  for image in spektrum-web spektrum-worker spektrum-migrate; do
    docker rmi "${image}:${IMAGE_TAG:-local}" >/dev/null 2>&1 || true
  done
fi

echo
echo "Stopped."
if [[ "$PURGE" == 1 ]]; then
  echo "Data volumes were deleted; the next deploy starts from an empty database."
else
  echo "Data volumes were kept — ./scripts/deploy.sh resumes with the same projects."
fi
echo "Bring it back with: ./scripts/deploy.sh"
echo "The local test infrastructure (pnpm dev:infra) is a separate project:"
echo "  pnpm dev:infra:down"