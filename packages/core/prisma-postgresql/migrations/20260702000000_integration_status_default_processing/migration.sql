-- AlterTable
-- New integrations were born ENABLED, so a throw between the row insert
-- and the app's first status write left a permanently ENABLED row with no
-- webhooks. Rows now start PROCESSING; CreateIntegration flips to ERROR on
-- an ON_CREATE failure and the app's onCreate flips to ENABLED once setup
-- succeeds. Existing rows are untouched — this only changes the default
-- applied to future inserts.
ALTER TABLE "Integration" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';
