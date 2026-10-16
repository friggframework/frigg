-- One-time scheduled jobs for the poll-and-dispatch scheduler
-- (NetlifySchedulerAdapter, friggframework/frigg#545): a cron function reads
-- PENDING rows that are due and dispatches them to a queue.
--
-- IF NOT EXISTS on purpose: #545 shipped this model in the Prisma schema with
-- no migration, so an app that ran its canary may already have the table from
-- `prisma db push`. On such a database this migration is a no-op; on a fresh
-- one it is the SQL `prisma migrate diff` generates.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledJob" (
    "id" SERIAL NOT NULL,
    "scheduleName" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "queueResourceId" TEXT NOT NULL,
    "payload" JSONB,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledJob_scheduleName_key" ON "ScheduledJob"("scheduleName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduledJob_state_scheduledAt_idx" ON "ScheduledJob"("state", "scheduledAt");
