#!/usr/bin/env bash
# Start a single-node MongoDB replica set for local/CI use (Prisma needs --replSet).
#
# Usage:
#   ./scripts/start-mongo-replica-set.sh [container_name] [host_port]
#
# Defaults: container "mongo", host port 27017.
#
# Why GLIBC_TUNABLES: MongoDB 8.0.21–8.0.34 refuse to start when uname -r looks
# like 6.19.x–7.0.13 (SERVER-121912). GitHub's ubuntu-24.04 runners report
# 7.0.0-*-azure even though the kernel is patched (upstream 7.0.14+), so the
# official mongo:8 image exits immediately. Setting glibc.pthread.rseq=1 lets
# glibc own rseq and bypasses the false-positive startup abort. Harmless on
# unaffected kernels; remove once mongo ships a release that trusts Ubuntu's
# version_signature (SERVER-131779 / 8.0.35+).
set -euo pipefail

NAME="${1:-mongo}"
PORT="${2:-27017}"
IMAGE="${FRIGG_MONGO_IMAGE:-mongo:8.0}"
REPLSET="${FRIGG_MONGO_REPLSET:-rs0}"
# Member host is what mongod uses to reach itself AND what drivers discover.
# Inside the container mongod always listens on 27017, so keep that port here.
# Map the same host port (default 27017) so clients on the Docker host match.
HOST_IN_RS="${FRIGG_MONGO_RS_HOST:-localhost:27017}"
if [ "${PORT}" != "27017" ] && [ -z "${FRIGG_MONGO_RS_HOST:-}" ]; then
  echo "warning: host port ${PORT} != 27017; drivers may rediscover localhost:27017. Set FRIGG_MONGO_RS_HOST if needed." >&2
fi

docker_cmd() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker "$@"
  elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    echo "error: docker is not available or the daemon is not running" >&2
    return 1
  fi
}

fail_with_logs() {
  local msg="$1"
  echo "::error::${msg}" >&2
  echo "---- docker ps -a (${NAME}) ----" >&2
  docker_cmd ps -a --filter "name=^/${NAME}$" >&2 || true
  echo "---- docker logs (${NAME}) ----" >&2
  docker_cmd logs "${NAME}" 2>&1 | tail -80 >&2 || true
  exit 1
}

container_running() {
  docker_cmd inspect -f '{{.State.Running}}' "${NAME}" 2>/dev/null | grep -qx true
}

# Idempotent: reuse a healthy existing container.
if container_running; then
  if [ "$(docker_cmd exec "${NAME}" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null || true)" = "true" ]; then
    echo "MongoDB replica set already primary in container '${NAME}'"
    exit 0
  fi
fi

if docker_cmd inspect "${NAME}" >/dev/null 2>&1; then
  docker_cmd rm -f "${NAME}" >/dev/null
fi

docker_cmd run -d \
  --name "${NAME}" \
  -e GLIBC_TUNABLES=glibc.pthread.rseq=1 \
  -p "${PORT}:27017" \
  "${IMAGE}" \
  --replSet "${REPLSET}" \
  --bind_ip_all \
  >/dev/null

ready=false
for _ in $(seq 1 60); do
  if ! container_running; then
    fail_with_logs "MongoDB container '${NAME}' exited before accepting connections"
  fi
  if docker_cmd exec "${NAME}" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "${ready}" != true ]; then
  fail_with_logs "MongoDB container '${NAME}' did not accept connections within 60s"
fi

# Initiate (or no-op if already configured). Prefer localhost in the member
# host so clients on the Docker host can use mongodb://localhost:PORT/?replicaSet=...
docker_cmd exec "${NAME}" mongosh --quiet --eval "
  try {
    const s = rs.status();
    if (s.ok) {
      print('replica set already initialised');
      quit(0);
    }
  } catch (e) { /* not initiated yet */ }
  try {
    const res = rs.initiate({
      _id: '${REPLSET}',
      members: [{ _id: 0, host: '${HOST_IN_RS}' }],
    });
    if (!res.ok) {
      printjson(res);
      quit(1);
    }
    print('replica set initiated');
  } catch (e) {
    print('rs.initiate failed: ' + e);
    quit(1);
  }
"

primary=false
for _ in $(seq 1 60); do
  if ! container_running; then
    fail_with_logs "MongoDB container '${NAME}' exited during primary election"
  fi
  if [ "$(docker_cmd exec "${NAME}" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null || true)" = "true" ]; then
    primary=true
    break
  fi
  sleep 1
done
if [ "${primary}" != true ]; then
  fail_with_logs "MongoDB replica set did not elect a primary within 60s"
fi

echo "MongoDB replica set '${REPLSET}' is primary on localhost:${PORT}"
