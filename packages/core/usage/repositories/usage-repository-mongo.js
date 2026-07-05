const { UsageRepositoryPostgres } = require('./usage-repository-postgres');

/**
 * Mongo usage store. `UsageCounter` has no encrypted fields and only simple
 * upsert/aggregate operations, and Prisma abstracts the query layer, so the
 * Postgres implementation runs unchanged on the Mongo client (integrationId is
 * stored as a plain string in both). Kept as a distinct class to preserve the
 * repository-triad convention and give a seam if the paths ever diverge.
 */
class UsageRepositoryMongo extends UsageRepositoryPostgres {}

module.exports = { UsageRepositoryMongo };
