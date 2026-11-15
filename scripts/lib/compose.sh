#!/usr/bin/env bash
# Shared: how to invoke the production stack.
#
# Sourced by deploy.sh, backup.sh and restore.sh so the architecture handling
# lives in one place. Sets COMPOSE to an array; the caller must already be in
# the repo root.
#
# The third-party images in compose.prod.yml are pinned by digest, and those
# digests are amd64-only manifests, so an ARM host cannot pull them. On
# aarch64 the arm64 pins in compose.arm64.yml are appended; on amd64 that file
# is never read, so the reference invocation is unchanged.

COMPOSE=(docker compose -f docker/compose.prod.yml)

case "$(uname -m)" in
  aarch64 | arm64)
    COMPOSE+=(-f docker/compose.arm64.yml)
    ;;
esac
