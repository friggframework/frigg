-- CreateEnum
CREATE TYPE "AdminProcessState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'QUEUE', 'WEBHOOK');

-- CreateTable
CREATE TABLE "AdminProcess" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" "AdminProcessState" NOT NULL DEFAULT 'PENDING',
    "context" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "parentProcessId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminProcess_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "AdminProcess_name_createdAt_idx" ON "AdminProcess"("name", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminProcess_state_idx" ON "AdminProcess"("state");

-- CreateIndex
CREATE INDEX "AdminProcess_type_idx" ON "AdminProcess"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptSchedule_scriptName_key" ON "ScriptSchedule"("scriptName");

-- CreateIndex
CREATE INDEX "ScriptSchedule_enabled_idx" ON "ScriptSchedule"("enabled");

-- AddForeignKey
ALTER TABLE "AdminProcess" ADD CONSTRAINT "AdminProcess_parentProcessId_fkey" FOREIGN KEY ("parentProcessId") REFERENCES "AdminProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
