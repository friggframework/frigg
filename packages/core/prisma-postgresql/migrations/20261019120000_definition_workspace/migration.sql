-- AlterTable
ALTER TABLE "IntegrationDefinitionVersion" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "IntegrationDefinitionVersion_workspaceId_status_idx" ON "IntegrationDefinitionVersion"("workspaceId", "status");
