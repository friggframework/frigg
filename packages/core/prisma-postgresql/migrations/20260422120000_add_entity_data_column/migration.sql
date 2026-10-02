-- AlterTable
-- Backfill the Entity.data JSONB field declared in schema.prisma but never
-- migrated. ModuleRepositoryPostgres.createEntity / findEntity use this
-- column to persist & rehydrate identifiers/details fields that fall
-- outside the six named columns (id, userId, credentialId, name,
-- moduleName, externalId). Without the column, any integration whose
-- getEntityDetails returns an extra field (e.g. `firm_subdomain`) causes
-- prisma.entity.create to throw P2022 at runtime.
ALTER TABLE "Entity"
    ADD COLUMN IF NOT EXISTS "data" JSONB NOT NULL DEFAULT '{}';
