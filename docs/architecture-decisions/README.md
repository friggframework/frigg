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