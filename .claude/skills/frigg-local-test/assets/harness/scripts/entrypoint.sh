#!/usr/bin/env bash
# Agent sandbox entrypoint: one-time bootstrap, then exec the requested command.
#
# Bootstrap steps (idempotent):
#   1. Pin @friggframework/core to the LOCAL checkout mounted at /workspace
#      (file: dependency -> symlink into node_modules -> live next code).
#   2. `npm install` if node_modules is missing (named volume is fresh).
#   3. Generate the Prisma client + sync schema for DB_TYPE (postgresql default).
#
# First boot is slow (npm install + prisma generate); later boots are fast
# thanks to the named volume.
set -euo pipefail

echo "🐳 Frigg agent sandbox bootstrapping..."

cd /harness

if ! grep -q '"@friggframework/core"' package.json 2>/dev/null; then
    echo "==> Pinning local core (file:/workspace/packages/core)"
    npm pkg set "dependencies.@friggframework/core=file:/workspace/packages/core"
fi

if [ ! -d node_modules ]; then
    echo "==> npm install (one-time, may take a few minutes)"
    npm install --no-audit --no-fund
else
    echo "==> node_modules present, skipping npm install"
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "==> Created .env from .env.example (container env vars take precedence)"
fi

echo "==> Prisma setup (DB_TYPE=${DB_TYPE:-postgresql})"
bash scripts/setup-db.sh

echo "✅ Sandbox ready."
echo "   Harness: /harness"
echo "   Run scenarios:  npm run scenario:integration-lifecycle"
echo "   Full app path:  see the frigg-local-test skill"

exec "$@"
