const { UsageRepositoryMongo } = require('./usage-repository-mongo');

/**
 * DocumentDB usage store. Inherits the Mongo (Prisma) implementation — the
 * UsageCounter operations are plain upsert/groupBy/findMany with no encrypted
 * fields, so no `$runCommandRaw` variant is needed.
 *
 * TODO(verify): confirm Prisma `upsert` with `{ value: { increment } }` and
 * `groupBy._sum` behave correctly against a real DocumentDB cluster before GA
 * (ADR-011 open question). If DocumentDB rejects the native upsert, add a
 * raw-command override here only.
 */
class UsageRepositoryDocumentDB extends UsageRepositoryMongo {}

module.exports = { UsageRepositoryDocumentDB };
