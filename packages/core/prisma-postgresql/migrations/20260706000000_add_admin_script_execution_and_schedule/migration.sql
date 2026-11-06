-- The AdminScriptExecution and ScriptSchedule models are declared in
-- schema.prisma but were never created by any prior migration (they shipped
-- with the admin-script-runner feature, MongoDB-first). Without these tables a
-- Postgres deployment throws P2021 on the first admin-script execution
-- (createExecution) or schedule write (upsertSchedule).
--
-- Additive and non-destructive: two new tables + one new enum type. No existing
-- table or row is touched.

-- CreateEnum
CREATE TYPE "AdminScriptExecutionState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AdminScriptExecution" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" "AdminScriptExecutionState" NOT NULL DEFAULT 'PENDING',
    "context" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "parentExecutionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminScriptExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptSchedule" (
    "id" SERIAL NOT NULL,
    "scriptName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastTriggeredAt" TIMESTAMP(3),
    "nextTriggerAt" TIMESTAMP(3),
    "externalScheduleId" TEXT,
    "externalScheduleName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminScriptExecution_name_createdAt_idx" ON "AdminScriptExecution"("name", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminScriptExecution_state_idx" ON "AdminScriptExecution"("state");

-- CreateIndex
CREATE INDEX "AdminScriptExecution_type_idx" ON "AdminScriptExecution"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptSchedule_scriptName_key" ON "ScriptSchedule"("scriptName");

-- CreateIndex
CREATE INDEX "ScriptSchedule_enabled_idx" ON "ScriptSchedule"("enabled");

-- AddForeignKey
ALTER TABLE "AdminScriptExecution" ADD CONSTRAINT "AdminScriptExecution_parentExecutionId_fkey" FOREIGN KEY ("parentExecutionId") REFERENCES "AdminScriptExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
