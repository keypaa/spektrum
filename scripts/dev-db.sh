#!/usr/bin/env bash
# Bootstrap the dev databases inside the compose Postgres container.
# Idempotent: creates spektrum_test / spektrum_unit if absent and enables
# citext in every spektrum database. Run after `pnpm dev:infra`.
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-spektrum-postgres}"
USER="${POSTGRES_USER:-spektrum}"

for db in spektrum spektrum_test spektrum_unit; do
  if docker exec "$CONTAINER" psql -U "$USER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    echo "database $db already exists"
  else
    docker exec "$CONTAINER" psql -U "$USER" -d postgres -c "CREATE DATABASE $db"
    echo "created database $db"
  fi
  docker exec "$CONTAINER" psql -U "$USER" -d "$db" -c \
    "CREATE EXTENSION IF NOT EXISTS citext" >/dev/null
  echo "citext enabled in $db"
done

echo "dev databases ready"
