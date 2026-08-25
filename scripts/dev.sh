#!/usr/bin/env bash
# Run a command with the local development environment loaded.
#   scripts/dev.sh node server.js
#   scripts/dev.sh npm run db:migrate
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a
. "$HERE/dev.env"
# Local secrets, if present. Sourced AFTER dev.env so it overrides, and kept
# in a separate gitignored file so credentials never reach a tracked one.
# See dev.secrets.env.example.
[ -f "$HERE/dev.secrets.env" ] && . "$HERE/dev.secrets.env"
set +a
cd "$HERE/../backend"
exec "$@"
