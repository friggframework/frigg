# ADR-064: Test Layers Follow the Hexagon — Repository Contract Tests per Port

**Status**: Proposed  
**Date**: 2026-10-24  
**Deciders**: Sean Matthews, Daniel Klotz

## Context

Frigg's core is hexagonal: handlers call use cases, use cases call repository ports, and each port has
one adapter per database (MongoDB, DocumentDB, PostgreSQL), chosen by a factory. On `next` there are
14 repository ports with factories:

- credential
- integration
- integration-mapping
- process
- module (entities)
- user
- token
- sync
- usage
- websocket-connection
- health-check
- artifact
- admin-script-execution
- script-schedule

The test suite doesn't follow that shape, and that hurt us.

### One global database in unit setup

Until the CI fix in #710, core's jest `globalSetup` started a `MongoMemoryServer` before every run and
exported `MONGO_URI`. Almost no suite used it, because repository tests mock Prisma. Even so, the whole
core suite (~200 files) depended on it.

`mongodb-memory-server` 8 defaulted to MongoDB 5.0.19, whose Linux builds need OpenSSL 1.1.
GitHub's `ubuntu-latest` moved to Ubuntu 24.04, which doesn't ship `libcrypto.so.1.1`. The server
failed to start, and from then on no core test ran in CI. Real bugs collected behind that wall:

- API-module credential fields were never registered for encryption;
- a batching bug in the SQS queuer;
- dozens of stale assertions.

### Adapter tests that mock Prisma can't catch cross-database differences

Most adapter tests replace the Prisma client with jest mocks and assert the calls made. That checks
the adapter's own code paths, but not what the database does with them. The differences that matter
show up only on a real engine:

- string collation and sort order;
- how arrays and JSON order;
- `$runCommandRaw` on DocumentDB, which bypasses Prisma extensions;
- the replica-set requirement for MongoDB writes;
- whether the encryption extension runs on a given query shape (relations fetched through `include`
  weren't decrypted; that was found with a real-database test).

### Seeds already exist

- `integration-mapping-repository-query-parity` and `integration-repository-entities-parity` run every
  adapter (MongoDB, DocumentDB on MongoDB, PostgreSQL) through one set of cases on real databases,
  gated by environment URLs. They are the pattern this ADR generalises. #710 runs them in CI.
- The three encryption fix-verification suites prove the encryption extension against real MongoDB
  and PostgreSQL.
- The tenant-isolation suite (Postgres, `FRIGG_TEST_POSTGRES_URL`) is the first real-database suite
  written as a requirement rather than a regression check. It lands with the multi-tenant work.

## Decision

Test each layer of the hexagon at its own boundary.

1. **Use cases are tested with in-memory fake repositories.**
   - Each port gets one in-memory fake that implements the interface (core already has some, e.g.
     `TestModuleRepository`, `TestIntegrationRepository`).
   - Use-case tests use the fakes and never a database or a mocked Prisma client.

2. **Handlers and routers are tested with mocked use cases.**
   - They assert HTTP mapping only: status codes, payload shape, error translation.

3. **Each repository port has one shared contract suite, run against every adapter.**
   - A contract suite is a function of an adapter factory. It describes the port's behaviour once
     (CRUD semantics, filters, ordering, pagination, tenancy scoping, error codes) and runs per adapter
     with `describe.each`.
   - It runs against **MongoDB** and **PostgreSQL** on real databases.
   - **DocumentDB** is covered by running the DocumentDB adapter against MongoDB in CI. Before each
     release, the contract suites also run manually against a real DocumentDB cluster, following a
     documented procedure.
   - Contract suites are `*.db.test.js` files. The default `npm test` excludes them, and
     `npm run test:db` runs them.
   - In CI they run in a separate `db` job, alongside the unit matrix. That job provides MongoDB as a
     single-node replica set (Prisma needs one for MongoDB writes) and a PostgreSQL service with the
     Prisma migrations applied.

4. **The encryption extension is part of the contract runs.**
   - Contract runs for ports with encrypted fields (credential, integration-mapping, user, token)
     enable field-level encryption with a test AES key.
   - They assert that values round-trip in plain form through the port and are stored as ciphertext
     in the database.

5. **No global database in unit test setup.**
   - Unit-test `globalSetup` sets the environment only.
   - A suite that needs a database is a `*.db.test.js` suite and gets the database from the `db` job,
     or from a local container when run by hand.
   - `TestMongo` in `@friggframework/test` stays an opt-in helper for apps.

## Consequences

### Positive

- A unit run needs no binary, container or network, so it can't be blocked by the OS image again.
- Cross-database behaviour is asserted where it lives. A difference between adapters fails one
  contract case and names the adapter.
- DocumentDB, which has no container, gets continuous coverage through the MongoDB run. A real cluster
  is still checked before each release.
- Encryption is verified end to end on every adapter, not inferred from mocks.
- Use-case tests get faster and simpler, because in-memory fakes replace Prisma mocks.

### Negative

- About 14 contract suites to write, and the `db` CI job adds a minute or two of runner time per PR.
- In-memory fakes can drift from the real adapters. A fake must pass the same contract suite as the
  adapters, which keeps it honest.
- Local `npm run test:db` needs Docker (or equivalent) for MongoDB and PostgreSQL.

### Neutral

- Adapter unit tests that mock Prisma stay where they cover adapter-only logic (for example query
  building). They are no longer evidence of database behaviour.

### Migration order

Start where encryption and tenancy live, then the rest:

1. credential
2. integration
3. module (entities)
4. user
5. token
6. integration-mapping
7. process
8. sync
9. usage
10. websocket-connection
11. artifact
12. admin-script-execution
13. script-schedule
14. health-check

The existing parity suites become the contract suites for integration (entities) and integration-mapping.

## Alternatives Considered

- **Keep a global in-memory MongoDB in unit setup.** Rejected. It covers one engine of three, couples
  every unit run to a binary and the OS image, and was the cause of the outage.
- **Testcontainers per suite.** Gives each suite its own database, but adds per-suite startup cost
  and a Docker dependency inside jest. Using CI service containers and one shared job is simpler.
  This can be revisited if suites start to interfere with each other.
- **Mock Prisma everywhere and trust the adapters.** This is the status quo. It can't catch collation,
  ordering, replica-set or extension-coverage differences, which are the bugs we have actually had.
- **Per-adapter suites written separately.** Three copies of the same cases drift. One suite with
  `describe.each` over adapters can't drift.

## Related

- [ADR-014: One Numbered ADR Register](./014-consolidate-adr-register.md)
- [ADR-009: E2E Test Package](./009-e2e-test-package.md)
- #710 — Frigg CI green on `next`: removes the global MongoDB, adds `*.db.test.js` / `npm run test:db`
  and the `db` CI job.
