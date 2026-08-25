#!/usr/bin/env bash
# Run a command with the local development environment loaded.
#   scripts/dev.sh node server.js
#   scripts/dev.sh npm run db:migrate
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -a; . "$HERE/dev.env"; set +a
cd "$HERE/../backend"
exec "$@"
