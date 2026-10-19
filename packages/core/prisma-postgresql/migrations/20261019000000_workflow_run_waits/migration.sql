-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "resumeAt" TIMESTAMP(3),
ADD COLUMN     "runKey" TEXT,
ADD COLUMN     "waitingFor" JSONB;

-- CreateIndex
CREATE INDEX "WorkflowRun_integrationId_runKey_idx" ON "WorkflowRun"("integrationId", "runKey");
