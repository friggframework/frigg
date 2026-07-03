-- Add IN_CREATION and IN_DELETION to the IntegrationStatus enum.
-- Kept separate from the default change (next migration) because Postgres does
-- not allow a newly added enum value to be referenced in the same transaction
-- that adds it. Requires Postgres >= 12 (ADD VALUE ... IF NOT EXISTS).
--
-- Rollback note: once any row is written with status IN_CREATION or
-- IN_DELETION, rolling the app back to a version whose Prisma client predates
-- this migration will fail to read that row (unknown enum value). Backfill
-- any such rows to a known status (e.g. ENABLED/ERROR) before rolling back.
ALTER TYPE "IntegrationStatus" ADD VALUE IF NOT EXISTS 'IN_CREATION';
ALTER TYPE "IntegrationStatus" ADD VALUE IF NOT EXISTS 'IN_DELETION';
