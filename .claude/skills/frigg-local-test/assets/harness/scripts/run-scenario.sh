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

# Pre-flight: load .env without clobbering already-set env (container mode).
if [ ! -f .env ]; then
    cp .env.example .env
fi
# shellcheck disable=SC1091
source scripts/load-env.sh

echo "🚀 Running scenario: $SCENARIO"
node "$SCENARIO"
