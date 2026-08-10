#!/usr/bin/env bash
# Run a scenario script from the scenarios/ directory.
# Usage: bash scripts/run-scenario.sh scenarios/<name>.js
set -euo pipefail

cd "$(dirname "$0")/.."

SCENARIO="${1:-}"
if [ -z "$SCENARIO" ]; then
    echo "❌ Usage: bash scripts/run-scenario.sh scenarios/<name>.js" >&2
    exit 1
fi

if [ ! -f "$SCENARIO" ]; then
    echo "❌ Scenario not found: $SCENARIO" >&2
    exit 1
fi

# Pre-flight: DB must be reachable.
if [ ! -f .env ]; then
    cp .env.example .env
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "🚀 Running scenario: $SCENARIO"
node "$SCENARIO"
