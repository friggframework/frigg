#!/usr/bin/env bash
# Generate the Prisma client for the configured DB_TYPE and sync the schema.
# Idempotent: safe to re-run after every core change that touches the schema.
#
#   DB_TYPE=postgresql  -> prisma generate + migrate deploy  (default)
#   DB_TYPE=mongodb     -> prisma generate + db push
#
# The Prisma client is built into the core package's generated/ dir
# (packages/core/generated/prisma-<db> when core is the local file: dep).
# Run this before any scenario, or core fails to load its database layer.
set -euo pipefail

cd "$(dirname "$0")/.."

# Create .env from the template on first run.
if [ ! -f .env ]; then
    cp .env.example .env
    echo "📄 Created .env from .env.example"
fi

# Load .env without clobbering already-exported env (container overrides win).
set -a
# shellcheck disable=SC1091
source .env
set +a

DB_TYPE="${DB_TYPE:-postgresql}"

# Resolve the core package location via Node (handles the file: symlink).
CORE="$(node -e "const p=require.resolve('@friggframework/core/package.json'); console.log(require('node:path').dirname(p))" 2>/dev/null || true)"

if [ -z "$CORE" ] || [ ! -d "$CORE" ]; then
    echo "❌ @friggframework/core not installed." >&2
    echo "   Pin the LOCAL core first, then npm install:" >&2
    echo "     npm install /path/to/frigg/packages/core" >&2
    echo "     npm install" >&2
    exit 1
fi

case "$DB_TYPE" in
    postgresql)
        echo "==> Generating Prisma client (postgresql)"
        npx prisma@6 generate --schema="$CORE/prisma-postgresql/schema.prisma"
        echo "==> Applying migrations"
        npx prisma@6 migrate deploy --schema="$CORE/prisma-postgresql/schema.prisma"
        ;;
    mongodb)
        echo "==> Generating Prisma client (mongodb)"
        npx prisma@6 generate --schema="$CORE/prisma-mongodb/schema.prisma"
        echo "==> Pushing schema"
        npx prisma@6 db push --schema="$CORE/prisma-mongodb/schema.prisma"
        ;;
    *)
        echo "❌ Unknown DB_TYPE: $DB_TYPE (expected postgresql or mongodb)" >&2
        exit 1
        ;;
esac

echo "✅ Database ready (DB_TYPE=$DB_TYPE). Run scenarios with npm run scenario:*"
