# Frigg Local Test harness

Docker-based harness to **run and test Frigg from the local `next` branch**
against real databases — no mocks, no published canary. It is bundled with the
`frigg-local-test` skill at `.claude/skills/frigg-local-test/assets/harness/`.
**Copy it to a scratch dir and run it there — never from inside `.claude/`.**

```bash
WORK=/tmp/frigg-test            # any dir outside .claude/
rm -rf "$WORK" && mkdir -p "$WORK"
cp -R <skill-dir>/assets/harness/. "$WORK/"
cd "$WORK"

# 1. Databases up (Postgres :5433, Mongo rs0 :27018 — non-clashing ports)
npm run db:up

# 2. Pin the LOCAL core (next branch), not the registry:
npm install /path/to/frigg/packages/core
npm install

# 3. Prisma client + schema (default PostgreSQL)
cp .env.example .env
npm run setup:db

# 4. Run the scenario suite
npm run scenario:integration-lifecycle     # => Results: 4 passed, 0 failed
```

See the `frigg-local-test` skill for the full runbook: choosing the database,
raw Prisma commands, writing scenarios, the agent-sandbox profile, and the
full-app path (`frigg build`/`frigg start` via osls offline).
