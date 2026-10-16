-- Entity and Integration carry the organization they were created in (ADR-056 §3.6).
-- Nullable, no default and no backfill: a row written before this migration keeps
-- NULL, and the domain (modules/entity-scope.js) reads NULL as "predates scoping"
-- (docs/guides/entity-scopes.md). No scope column: the owner's user type says it.
-- Deliberately no foreign key: a deleted organization must leave its rows
-- invisible, and ON DELETE SET NULL would turn them into unscoped ones.
--
-- Release note: the two CREATE INDEX statements below are plain (not
-- CONCURRENTLY, which Prisma migrations cannot run inside a transaction). Each
-- takes a SHARE lock on its table while it builds, so writes to "Entity" and
-- "Integration" wait for it. Both tables are small in a typical Frigg
-- deployment; on a very large one, create the indexes by hand first with
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS under the same names, then deploy.

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "organizationId" INTEGER;

-- CreateIndex
CREATE INDEX "Entity_userId_organizationId_idx" ON "Entity"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Integration_userId_organizationId_idx" ON "Integration"("userId", "organizationId");
