#!/usr/bin/env bash
# Idempotent Cloud Agent install: Node deps + Docker tooling for local DBs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required (engines.node >=22; see .node-version)" >&2
  exit 1
fi

# Docker is needed by start-databases.sh (Mongo replica set + Postgres).
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing docker.io..."
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 >/dev/null
fi

# Prefer passwordless docker for the agent user when possible.
if command -v docker >/dev/null 2>&1 && getent group docker >/dev/null 2>&1; then
  if ! id -nG "$(id -un)" | tr ' ' '\n' | grep -qx docker; then
    sudo usermod -aG docker "$(id -un)" || true
  fi
fi

# Skip lifecycle scripts during install (Sonar: package-manager scripts must
# not run implicitly). Then rebuild only packages whose install/postinstall
# fetches platform binaries or prepares Prisma engines — see hasInstallScript
# in package-lock.json. aws-sdk / es5-ext / serverless postinstalls are
# warnings or no-ops and are intentionally omitted.
npm ci --ignore-scripts
npm rebuild \
  @parcel/watcher \
  @prisma/client \
  @prisma/engines \
  esbuild \
  nx \
  prisma \
  unrs-resolver

# Generate Prisma clients so DB suites and core imports resolve without a
# separate manual step after warm boot.
npm run prisma:generate --workspace @friggframework/core

# UI package ships built assets in some flows; keep the artifact fresh.
npm run build --workspace @friggframework/ui
