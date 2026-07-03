-- New integrations are born IN_CREATION and transition to ENABLED / NEEDS_CONFIG
-- once onCreate completes. Metadata-only change; existing rows are untouched.
ALTER TABLE "Integration" ALTER COLUMN "status" SET DEFAULT 'IN_CREATION';
