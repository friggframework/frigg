#!/usr/bin/env bash
# Warm-boot local databases for Cloud Agents / developers.
# Starts (or reuses) Postgres 16 + a MongoDB 8 single-node replica set.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

docker_cmd() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    echo "error: docker is not available or the daemon is not running" >&2
    echo "hint: start dockerd (Cloud Agents: see .cursor/install.sh) then re-run" >&2
    return 1
  fi
}

ensure_dockerd() {
  if docker_cmd info >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v dockerd >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
    echo "error: docker is not installed" >&2
    return 1
  fi
  # Nested Cloud Agent VMs often lack systemd; start dockerd directly.
  if ! pgrep -x dockerd >/dev/null 2>&1; then
    echo "Starting dockerd..."
    sudo dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 1 30); do
      if docker_cmd info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi
  docker_cmd info >/dev/null 2>&1
}

pg_running() {
  docker_cmd inspect -f '{{.State.Running}}' frigg-pg 2>/dev/null | grep -qx true
}

ensure_postgres() {
  if pg_running; then
    if docker_cmd exec frigg-pg pg_isready -U postgres -d frigg >/dev/null 2>&1; then
      echo "Postgres already ready in container 'frigg-pg'"
      return 0
    fi
  fi
  if docker_cmd inspect frigg-pg >/dev/null 2>&1; then
    docker_cmd rm -f frigg-pg >/dev/null
  fi
  docker_cmd run -d \
    --name frigg-pg \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_DB=frigg \
    -p 5432:5432 \
    postgres:16 \
    >/dev/null
  for _ in $(seq 1 60); do
    if docker_cmd exec frigg-pg pg_isready -U postgres -d frigg >/dev/null 2>&1; then
      echo "Postgres is ready on localhost:5432"
      return 0
    fi
    sleep 1
  done
  echo "error: Postgres did not become ready within 60s" >&2
  docker_cmd logs frigg-pg 2>&1 | tail -40 >&2 || true
  return 1
}

ensure_dockerd
# Same container name/port as the Frigg CI db job so agents and CI share one path.
bash "${ROOT}/scripts/start-mongo-replica-set.sh" mongo 27017
ensure_postgres

cat <<'EOF'
Databases ready:
  FRIGG_TEST_MONGODB_URL=mongodb://localhost:27017/frigg?replicaSet=rs0
  FRIGG_TEST_POSTGRES_URL=postgresql://postgres@localhost:5432/frigg?schema=public
EOF
