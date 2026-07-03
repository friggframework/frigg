-- Add IN_CREATION and IN_DELETION to the IntegrationStatus enum.
-- Kept separate from the default change (next migration) because Postgres does
-- not allow a newly added enum value to be referenced in the same transaction
-- that adds it.
ALTER TYPE "IntegrationStatus" ADD VALUE IF NOT EXISTS 'IN_CREATION';
ALTER TYPE "IntegrationStatus" ADD VALUE IF NOT EXISTS 'IN_DELETION';
