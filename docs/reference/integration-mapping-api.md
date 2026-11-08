---
description: IntegrationBase mapping methods and the queryMappings query shape.
---

# Integration mapping API

Every mapping row has an integration id, a `sourceId` string, and a `mapping` JSON value. This page lists the methods and their limits. For a walkthrough, see [Store and query integration mappings](../guides/integration-mappings.md).

Source: `packages/core/integrations/integration-base.js`, `packages/core/integrations/repositories/integration-mapping-repository-interface.js`, `packages/core/integrations/repositories/integration-mapping-query.js`.

## IntegrationBase methods

| Method | What it does | Errors |
|---|---|---|
| `getMapping(sourceId)` | Returns the mapping for `sourceId`, or `null`. | None. |
| `upsertMapping(sourceId, mapping)` | Creates or replaces the mapping. Not atomic with `getMapping`. | `sourceId must be set` |
| `createMapping(sourceId, mapping)` | Insert-only. You can use it as an atomic claim or lock row. Added in #674. | `sourceId must be set`; `MappingAlreadyExistsError` if a mapping for `sourceId` exists |
| `deleteMapping(sourceId)` | Deletes the mapping. A missing mapping is not an error (`deletedCount` 0). Added in #674. | `sourceId must be set` |

### MappingAlreadyExistsError

Exported from `@friggframework/core`. It extends `BaseError`.

| Property | Value |
|---|---|
| `message` | `Mapping already exists for integration <integrationId> and sourceId <sourceId>` |
| `integrationId` | The integration id |
| `sourceId` | The `sourceId` that was taken |

## queryMappings

```javascript
integrationMappingRepository.queryMappings(integrationId, query)
// → Promise<{ mappings: Object[], total: number }>
```

Implemented by the PostgreSQL, MongoDB, and DocumentDB repositories (#651). The base interface throws `queryMappings is not supported by this database adapter yet`. `IntegrationBase` has no wrapper. Call it as `this.integrationMappingRepository.queryMappings(this.id, query)`.

### Query fields

| Field | Type | Default | Rules |
|---|---|---|---|
| `where` | `Condition[]` | `[]` | ANDed together. An entry may be `{ anyOf: Condition[] }` (one level, ORed). At most 20 conditions, `anyOf` members included. |
| `orderBy` | `{ path, direction }` | id ascending | `path` must be a `mapping.…` path. `direction` is `'asc'` or `'desc'`. Nulls last; ties broken by id in the same direction. |
| `skip` | integer | `0` | ≥ 0 |
| `take` | integer | required | 1–500 |
| `omit` | `string[]` | `[]` | Top-level mapping keys to leave out of returned rows. Do not write these projected rows back. |

### Conditions

Paths are `sourceId` or `mapping.` followed by identifier-only segments (letters, digits, `_`; not starting with a digit), for example `mapping.outbound.status`.

| `op` | Allowed `path` | `value` | Matches |
|---|---|---|---|
| `exists` | `mapping.…` | none | Path is present. JSON `null` counts as absent. |
| `notExists` | `mapping.…` | none | Exact negation of `exists`. |
| `in` | `mapping.…` | `string[]`, 1–500 values | JSON string equal to one of the values. |
| `notStartsWith` | `sourceId` | `string` | `sourceId` without that prefix. A `NULL` `sourceId` matches. |

### Ordering across databases

Values order string < number < boolean < array < object.

| | PostgreSQL | MongoDB | DocumentDB |
|---|---|---|---|
| String comparison | Database collation | Code point | Code point |
| Arrays and objects ordered among themselves | Yes | No | No |

On DocumentDB, `total` comes from a separate count command, so it is not from the page's snapshot.

### Encryption

`queryMappings` refuses to run while field-level encryption encrypts `mapping`, or a path inside it, on write. Opt out with `appDefinition.encryption.disable = { IntegrationMapping: ['mapping'] }` plus any nested `mapping.…` path your schema encrypts.

* Rows whose whole `mapping` is still ciphertext from before the opt-out never match.
* A nested path still encrypted from before its opt-out comes back plain, but conditions and `orderBy` on it see the ciphertext until the row is written again.

### Validation errors

Each message starts with `queryMappings:`. Examples: `take must be an integer between 1 and 500`, `skip must be a non-negative integer`, `where must have at most 20 conditions, anyOf members included`.
