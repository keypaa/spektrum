#!/usr/bin/env bash
# Run any production-compose subcommand with the stack's environment loaded.
#
#   ./scripts/dc.sh ps
#   ./scripts/dc.sh logs -f worker
#   ./scripts/dc.sh exec -T postgres psql -U spektrum spektrum
#
# Why it exists: `docker compose` resolves ${VAR} interpolation from the
# *project* directory — the directory of the first -f file, i.e. docker/ — not
# the repo root. Run from the repo root, every command therefore dies with
# "required variable ACME_EMAIL is missing" even though .env is right there.
# Passing --env-file fixes that, and the ARM pins from lib/compose.sh have to
# come along too, so both live here instead of in the runbook's footnotes.
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

exec "${COMPOSE[@]}" --env-file "$ENV_FILE" "$@"
