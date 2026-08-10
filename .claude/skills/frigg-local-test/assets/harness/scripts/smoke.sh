#!/usr/bin/env bash
# Smoke test: verifies the harness is usable end-to-end.
#   1. databases healthy
#   2. core resolves to the LOCAL checkout (file: dep), not the registry
#   3. prisma client generated for DB_TYPE
#   4. the integration-lifecycle scenario passes
set -euo pipefail

cd "$(dirname "$0")/.."

echo "═══ Frigg Local Test harness — smoke test ═══"

echo ""
echo "1) Checking databases..."
if [ ! -f .env ]; then
    cp .env.example .env
fi
docker compose ps --format 'table {{.Service}}\t{{.Status}}' || {
    echo "❌ Compose unavailable. Start Docker and run: npm run db:up" >&2
    exit 1
}

POSTGRES_UP=$(docker compose ps --status running --services 2>/dev/null | grep -c '^postgres$' || true)
if [ "$POSTGRES_UP" != "1" ]; then
    echo "❌ postgres not running. Run: npm run db:up" >&2
    exit 1
fi
echo "   ✅ postgres running"

echo ""
echo "2) Checking core resolves to the LOCAL checkout..."
CORE_RESOLVED=$(node -e "console.log(require.resolve('@friggframework/core/package.json'))" 2>/dev/null || true)
if [ -z "$CORE_RESOLVED" ]; then
    echo "❌ @friggframework/core not installed." >&2
    echo "   Pin the LOCAL core, then npm install:" >&2
    echo "     npm install /path/to/frigg/packages/core" >&2
    exit 1
fi
case "$CORE_RESOLVED" in
    */packages/core/package.json)
        echo "   ✅ core resolved to LOCAL checkout: $CORE_RESOLVED"
        ;;
    *)
        echo "   ⚠️ core resolved to registry copy, not local: $CORE_RESOLVED"
        echo "     (re-pin: npm install /path/to/frigg/packages/core)"
        ;;
esac

echo ""
echo "3) Prisma setup (idempotent)..."
bash scripts/setup-db.sh

echo ""
echo "4) Running scenario: integration-lifecycle"
npm run scenario:integration-lifecycle

echo ""
echo "═══ Smoke test complete ═══"
