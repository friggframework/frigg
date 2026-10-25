/**
 * osls framework version
 *
 * Utility Layer - Hexagonal Architecture
 *
 * The single `frameworkVersion` every composed definition emits (ADR-050).
 * It matches the osls range in devtools and frigg-cli, so an app whose own
 * package.json still resolves osls 3 fails at once with
 * FRAMEWORK_VERSION_MISMATCH instead of packaging a different artifact.
 * It subsumes the ADR-048 LoggingConfig floor (>=3.58.0).
 */
const OSLS_FRAMEWORK_VERSION = '^4.4.0';

module.exports = { OSLS_FRAMEWORK_VERSION };
