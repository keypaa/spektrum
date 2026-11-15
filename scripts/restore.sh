#!/usr/bin/env bash
# Restore a backup into the running stack. DESTRUCTIVE: it replaces the current
# database and objects.
#
#   ./scripts/restore.sh backups/2026-11-15
#
# The app is stopped first so nothing writes into a half-restored database, and
# it is started again even when a step fails (the trap): a failed restore must
# not leave the stack down with no explanation.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck source=scripts/lib/compose.sh
source scripts/lib/compose.sh
ENV_FILE=".env"
DIR="${1:-}"

restart() {
  echo "==> restarting web and worker"
  "${COMPOSE[@]}" --env-file "$ENV_FILE" up -d web worker >/dev/null 2>&1 || true
}

if [[ -z "$DIR" ]]; then
  echo "usage: restore.sh <backupDir>" >&2
  exit 1
fi
if [[ ! -f "$DIR/db.dump" ]]; then
  echo "no db.dump in $DIR" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
. "./$ENV_FILE"
set +a

read -rsp "restore $DIR into ${POSTGRES_DB} — this overwrites it. type 'yes': " confirm
echo
[[ "$confirm" == "yes" ]] || { echo "aborted"; exit 1; }

# Always bring the stack back, including on a failed restore.
trap restart EXIT

echo "==> stopping web and worker"
"${COMPOSE[@]}" --env-file "$ENV_FILE" stop web worker

echo "==> restoring postgres"
cat "$DIR/db.dump" | "${COMPOSE[@]}" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore --clean --if-exists -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "==> restoring objects"
if [[ -d "$DIR/objects" ]]; then
  pnpm exec tsx scripts/restore-objects.ts "$DIR/objects"
fi

echo "restore complete"