#!/usr/bin/env bash
# Nightly backup: Postgres dump + object copy, with 7-day retention.
#
#   ./scripts/backup.sh
#
# Writes backups/<YYYY-MM-DD>/{db.dump,objects/} and deletes backup directories
# older than 7 days. Rehearse a restore before relying on it (scripts/restore.sh).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker/compose.prod.yml)
ENV_FILE=".env"
DEST_ROOT="backups"
DEST="$DEST_ROOT/$(date +%F)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
. "./$ENV_FILE"
set +a

mkdir -p "$DEST"

echo "==> dumping postgres"
"${COMPOSE[@]}" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "$DEST/db.dump"

echo "==> copying objects"
pnpm exec tsx scripts/backup-objects.ts "$DEST/objects"

echo "==> pruning backups older than 7 days"
find "$DEST_ROOT" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "backup complete: $DEST"
du -sh "$DEST"