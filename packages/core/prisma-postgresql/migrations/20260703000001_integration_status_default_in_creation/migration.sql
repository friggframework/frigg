-- New integrations are born IN_CREATION and transition to ENABLED / NEEDS_CONFIG
-- once onCreate completes. Metadata-only change; existing rows are untouched.
--
-- Deploy-order note: if this app runs migrations via a post-deploy step (e.g.
-- an explicit POST /db-migrate call) rather than pre-deploy, code that writes
-- IN_CREATION/IN_DELETION will error on the enum value until both migrations
-- in this pair have applied. Transient and retryable, not data-destructive.
ALTER TABLE "Integration" ALTER COLUMN "status" SET DEFAULT 'IN_CREATION';
