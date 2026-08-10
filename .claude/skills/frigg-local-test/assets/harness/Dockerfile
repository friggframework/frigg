# Frigg agent sandbox image.
#
# A general-purpose container for testing agents to run Frigg (next branch):
#   - node 22 (matches the monorepo engines)
#   - system deps needed by Prisma / native modules
#   - chromium for in-container browser testing (headless; --no-sandbox)
#
# Mounts (see docker-compose.yml, agent profile):
#   /harness   = this harness dir (mounted read-write)
#   /workspace = the frigg checkout, read-only — used to pin the LOCAL core
#                (file: dependency), so the harness runs live next code.
#
# NOTE on the agent runtime: this image is intentionally agent-agnostic. It
# ships node + tooling; the agent runtime (pi, Claude Code, ...) is either
# installed into this image via a derived Dockerfile, or the agent shells into
# this container with `docker compose exec agent bash`.
#
# ARG WITH_BROWSER: set to false to skip the chromium download (smaller image)
# when the agent runtime does not need an in-container browser.
ARG WITH_BROWSER=true

FROM node:22-slim

# Base system deps: prisma (openssl, build tools for native modules), git,
# curl for health pokes, procps for process inspection.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        openssl \
        build-essential \
        python3 \
        procps \
        bash \
    && rm -rf /var/lib/apt/lists/*

# Chromium for headless browser testing inside the sandbox.
# Default must be set IN this stage: a pre-FROM ARG is not visible to build
# steps, so a bare `ARG WITH_BROWSER` here would silently default to empty
# and skip the chromium install.
ARG WITH_BROWSER=true
RUN if [ "$WITH_BROWSER" = "true" ]; then \
        npx --yes playwright@1.49.1 install --with-deps chromium \
        && rm -rf /root/.cache/ms-playwright/*/*.map 2>/dev/null || true; \
    fi

WORKDIR /harness

# entrypoint: pin local core, npm install on first run, prisma setup, exec.
COPY scripts/entrypoint.sh /usr/local/bin/frigg-entrypoint
RUN chmod +x /usr/local/bin/frigg-entrypoint

ENTRYPOINT ["/usr/local/bin/frigg-entrypoint"]
CMD ["bash"]
