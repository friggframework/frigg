-- Data-defined integrations (ADR-063): published definition versions and workflow runs.
--
-- Additive and non-destructive: one enum type and two tables. No existing table or row is touched; WorkflowRun
-- references Integration with ON DELETE CASCADE, so deleting an installation removes its run history.

-- CreateEnum
CREATE TYPE "DefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'RETIRED');

-- CreateTable
CREATE TABLE "IntegrationDefinitionVersion" (
    "id" SERIAL NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "status" "DefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "checksum" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "changeLevel" TEXT,
    "previousVersion" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "definitionId" TEXT NOT NULL,
    "definitionVersion" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "eventId" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "error" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "trace" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationDefinitionVersion_definitionId_version_key" ON "IntegrationDefinitionVersion"("definitionId", "version");

-- CreateIndex
CREATE INDEX "IntegrationDefinitionVersion_definitionId_status_idx" ON "IntegrationDefinitionVersion"("definitionId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_integrationId_startedAt_idx" ON "WorkflowRun"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_integrationId_workflowId_startedAt_idx" ON "WorkflowRun"("integrationId", "workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_integrationId_status_idx" ON "WorkflowRun"("integrationId", "status");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
