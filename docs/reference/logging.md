---
description: Logger exports, levels, environment variables, and the app definition logging block.
---

# Logging reference

The quick lookup page. For how and why, read [Logging](../guides/LOGGING.md) and [Logging in an Integration](../guides/LOGGING-IN-INTEGRATIONS.md).

Source: `packages/core/logs/` (`index.js`, `levels.js`), `packages/schemas/schemas/app-definition.schema.json` (`logging`).

## Exports from `@friggframework/core`

| Export | Use |
|---|---|
| `getLogger(name)` | Get a logger. Names: `frigg.<area>`, `integration.<name>`, `module.<name>`. |
| `createMemorySink` | Capture records in tests. |
| `resetLoggerForTests` | Reset logger state between tests. |
| `serializeError` | Turn an `Error` into the sanitized `error` object. |
| `redactValue`, `toSanitizedSurrogate` | Redaction helpers. |
| `debug`, `initDebugLog`, `flushDebugLog` | Legacy shims. See the migration section of [Logging](../guides/LOGGING.md). |

## Levels

| Level | Value |
|---|---|
| `TRACE` | 10 |
| `DEBUG` | 20 |
| `INFO` | 30 (default) |
| `WARN` | 40 |
| `ERROR` | 50 |
| `FATAL` | 60 |

## How the level is chosen

1. `FRIGG_LOG_LEVEL` is set: use it (case-insensitive). An unknown value falls back to `INFO` and logs `frigg.logger.invalid_level`.
2. Otherwise `DEBUG` when `DEBUG_VERBOSE=1`, `STAGE=local`, or `IS_OFFLINE` is `true` or `1`.
3. Otherwise `INFO`.
4. If `AWS_LAMBDA_LOG_LEVEL` is set and differs, the less verbose of the two wins and Frigg logs `frigg.logger.level_conflict`.

## Environment variables

| Variable | Effect |
|---|---|
| `FRIGG_LOG_LEVEL` | Log level. Set by devtools from `logging.level` when it is not `info`. |
| `DEBUG_VERBOSE` | `1` turns on `DEBUG` when `FRIGG_LOG_LEVEL` is unset. |
| `STAGE`, `IS_OFFLINE` | Local runs default to `DEBUG`. `STAGE` also fills the `stage` field. |
| `AWS_LAMBDA_LOG_LEVEL` | Caps verbosity, see step 4 above. |
| `FRIGG_STACK` | Fills the `appName` field. |

## App definition `logging` block

```javascript
logging: { level: 'info', retentionInDays: 30 } // what frigg init writes
```

| Key | Values | Effect |
|---|---|---|
| `level` | `trace` … `fatal` (all lower or all upper case) | Not `info`: sets `FRIGG_LOG_LEVEL` on every function. An unknown level fails the build. |
| `retentionInDays` | CloudWatch values (1, 3, 5, 7, 14, 30, …, 3653) | Sets `provider.logRetentionInDays`. Other values fail the build. |
| `format` | `json` only | Informational. Records are always JSON lines. |

No `logging` block means no change to the generated config.

## Record fields

Every record has `timestamp`, `level`, `message`, and `logger`. Context fields (`requestId`, `integrationId`, `messageId`, OTel `trace_id` and `span_id`, and more) are added when known. The full table is in [Logging: field reference](../guides/LOGGING.md#field-reference).
