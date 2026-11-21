#!/usr/bin/env bash
# Start the OpsRadar API (:8000) and UI (:3000) together.
#   ./run.sh          real backend
#   ./run.sh --mock   UI only, replaying frontend/mocks
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/scripts/dev.mjs" "$@"
