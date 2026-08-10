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

# Sanity check: /workspace must be the frigg checkout (FRIGG_REPO_DIR).
if [ ! -f /workspace/package.json ]; then
    echo "❌ /workspace/package.json not found." >&2
    echo "   Set FRIGG_REPO_DIR in .env to the absolute path of the frigg" >&2
    echo "   checkout (compose mounts it read-only at /workspace)." >&2
    exit 1
fi

cd /harness

# Pin core to the LOCAL checkout — check the declared file: path, not just
# presence, so a stale host-path pin (from a host quick-start in this dir)
# gets corrected to the sandbox path.
CORE_FILE="$(node -p "require('./package.json').dependencies['@friggframework/core'] || ''" 2>/dev/null || true)"
if [ "$CORE_FILE" != "file:/workspace/packages/core" ]; then
    echo "==> Pinning local core (file:/workspace/packages/core)"
    npm pkg set "dependencies.@friggframework/core=file:/workspace/packages/core"
fi

# Install only when needed: the named volume masks /harness/node_modules with
# an (initially empty) dir, so check for the actual package, not the dir.
if [ ! -d node_modules ] || [ ! -e node_modules/@friggframework/core ]; then
    echo "==> npm install (one-time, may take a few minutes)"
    # A lockfile from another environment pins the old core path (e.g. the
    # host checkout) and breaks the file: re-pin — the harness intentionally
    # has no committed lockfile, so resolve fresh.
    rm -f package-lock.json
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
