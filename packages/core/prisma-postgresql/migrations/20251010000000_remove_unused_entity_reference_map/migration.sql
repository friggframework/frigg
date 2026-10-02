-- AlterTable
-- Remove unused entityReferenceMap field from Integration table
ALTER TABLE "Integration" DROP COLUMN "entityReferenceMap";
