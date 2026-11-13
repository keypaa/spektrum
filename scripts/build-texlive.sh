#!/usr/bin/env bash
# Build the compile image once and assert the sandbox settings are actually
# read by kpathsea (spec §10.6). Safe to re-run: Docker reuses cached layers.
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t spektrum-texlive:dev docker/texlive

openin_any=$(docker run --rm spektrum-texlive:dev kpsewhich -var-value openin_any)
shell_escape=$(docker run --rm spektrum-texlive:dev kpsewhich -var-value shell_escape)
if [ "$openin_any" != "p" ] || [ "$shell_escape" != "f" ]; then
  echo "sandbox assertion failed: openin_any=$openin_any shell_escape=$shell_escape" >&2
  exit 1
fi

docker image inspect spektrum-texlive:dev --format 'spektrum-texlive:dev {{index .RepoDigests 0}}'