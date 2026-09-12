# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Frigg framework.

## What is an ADR?

An ADR documents a significant architectural decision made in the project, including the context, the decision itself, and its consequences. ADRs help future developers understand why certain choices were made.

## ADR Status

- **Accepted**: The decision is currently in effect
- **Superseded**: The decision has been replaced by another ADR
- **Deprecated**: The decision is no longer relevant
- **Proposed**: Under discussion (use RFCs for new proposals)

## Current ADRs

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](./001-use-vite-for-management-ui.md) | Use Vite + React for Management UI | Accepted | 2025-01-25 |
| [002](./002-no-database-for-local-dev.md) | No Database for Local Development Tools | Accepted | 2025-01-25 |
| [003](./003-runtime-state-only.md) | Runtime State Only for Management GUI | Accepted | 2025-01-25 |
| [004](./004-migration-tool-design.md) | Project Structure Migration Tool | Proposed | 2025-01-25 |
| [005](./005-admin-script-runner.md) | Admin Script Runner Service | Accepted | 2025-12-10 |
| [006](./006-integration-router-v2.md) | Integration Router v2 Restructuring | Accepted | 2025-12-14 |
| [007](./007-management-ui-architecture.md) | Management UI Architecture | Accepted | 2025-12-14 |
| [008](./008-frigg-cli-start-command.md) | Frigg CLI Start Command Architecture | Accepted | 2025-12-14 |
| [009](./009-e2e-test-package.md) | E2E Test Package Architecture | Accepted | 2025-12-15 |
| [010](./010-reporting-as-admin-operation.md) | Reporting as an Admin Operation | Accepted | 2026-07-03 |
| [011](./011-integration-telemetry-and-usage-tracking.md) | Integration Telemetry, Eventing & Feature-Usage Tracking | Accepted | 2026-07-03 |
| [012](./012-database-schema-migrations.md) | Database Schema Migrations | Proposed | 2026-07-04 |
| [013](./013-integration-version-migrations.md) | Integration Version Migrations | Proposed | 2026-07-04 |
| [014](./014-consolidate-adr-register.md) | One Numbered ADR Register | Accepted | 2026-07-04 |
| [015](./015-extensions-taxonomy.md) | Extensions Taxonomy | Proposed | 2026-06-09 |
| [016](./016-plugins.md) | Plugins | Proposed | 2026-06-09 |
| [017](./017-core-extensions.md) | Core Extensions | Proposed | 2026-06-09 |
| [018](./018-integration-extensions.md) | Integration Extensions | Implemented ([PR #590](https://github.com/friggframework/frigg/pull/590) and [PR #596](https://github.com/friggframework/frigg/pull/596)). Authoritative quick-start: [`packages/core/integrations/EXTENSIONS.md`](../../packages/core/integrations/EXTENSIONS.md). | 2026-06-09 (decision ratified retroactively) |
| [019](./019-api-module-extensions.md) | API Module Extensions | Proposed | 2026-06-09 |
| [020](./020-capabilities.md) | Capabilities | Proposed | 2026-06-09 |
| [021](./021-ontology.md) | Ontology | Proposed | 2026-06-09 |
| [022](./022-artifacts.md) | Artifacts | Proposed | 2026-06-09 |
| [023](./023-integration-templates.md) | Integration Templates | Proposed | 2026-06-09 |
| [024](./024-global-entities.md) | Global Entities | Proposed | 2024-12-18 |
| [025](./025-agent-harness.md) | Agent Harness | Proposed | 2026-06-09 |
| [026](./026-evals.md) | Evals | Proposed | 2026-06-09 |
| [027](./027-ssm-parameter-offload-and-env-scoping.md) | SSM Parameter Offload and Per-Function Environment Scoping | Accepted | 2026-07-10 |
| [028](./028-multi-provider-support.md) | Multi-Provider Support | Accepted | 2026-03-02 |
| [029](./029-decouple-aws-from-core.md) | Decouple AWS SDK Dependencies from @friggframework/core | Accepted | 2026-03-03 |
| [030](./030-integration-versioning.md) | Integration Versioning | Proposed | 2026-09-27 |
| [031](./031-concurrent-oauth-credential-refresh.md) | Concurrent OAuth Credential Refresh Across Lambda Invocations | Proposed | 2026-08-11 |
| [032](./032-integration-deletion-cleanup.md) | Integration Deletion Data Cleanup | Proposed | 2026-08-20 |
| [033](./033-aurora-serverless-v2-scale-to-zero-and-nat-free-connectivity.md) | Aurora Serverless v2 scale-to-zero + NAT-free Lambda connectivity | Proposed | 2026-08-20 |
| [034](./034-api-key-login-auth-mode.md) | API-Key Login Auth Mode | Proposed | 2026-08-20 |
| [035](./035-app-init.md) | App Init | Proposed | 2026-09-27 |
| [036](./036-skills.md) | Skills | Proposed | 2026-09-27 |
| [037](./037-agent-pipeline.md) | Agent Pipeline | Proposed | 2026-09-27 |
| [038](./038-configuration-and-secrets-model.md) | Configuration & Secrets — Model & Tiers | Proposed | 2026-07-10 |
| [039](./039-secrets-config-provider-plugin.md) | Secrets & Config Provider Plugin | Proposed | 2026-07-10 |
| [040](./040-variable-secret-management.md) | Variable & Secret Management — Admin API, CLI, GUI | Proposed | 2026-07-10 |
| [041](./041-configuration-secrets-docs-and-maturation.md) | Configuration & Secrets — Docs & Adopter Maturation | Proposed | 2026-07-10 |

## Conventions

Per [ADR-014](./014-consolidate-adr-register.md), all architecture decisions live **here** — one
numbered register, one structure:

- **Location:** `docs/architecture-decisions/` (the only home for ADRs).
- **Filename:** `NNN-kebab-title.md` (e.g. `010-reporting-as-admin-operation.md`).
- **Heading:** `# ADR-NNN: Human Readable Title` — number *and* name.
- **Metadata block:** `**Status**` / `**Date**` / `**Deciders**` (bold form, directly under the heading).
- **Sections:** Context / Decision / Consequences (Positive / Negative / Neutral) / Alternatives Considered / Related.
- **Index:** the **Current ADRs** table above is the single source of truth — add a row for every new ADR.
- **Number:** take the next unused integer; numbers are stable IDs and never reused.

## ADR Template

```markdown
# ADR-[NUMBER]: [TITLE]

**Status**: Accepted  
**Date**: [DATE]  
**Deciders**: [List of people involved]  

## Context

[What is the issue that we're seeing that is motivating this decision?]

## Decision

[What is the change that we're proposing and/or doing?]

## Consequences

### Positive
- [Positive outcomes]

### Negative
- [Drawbacks or trade-offs]

### Neutral
- [Things that will change but aren't necessarily good or bad]

## Alternatives Considered

[What other options were evaluated?]
```