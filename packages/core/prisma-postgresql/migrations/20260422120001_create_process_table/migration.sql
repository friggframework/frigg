-- CreateTable
-- The Process model is declared in schema.prisma but was never created by
-- any prior migration. ProcessRepositoryPostgres (read/write) and
-- FriggProcessManager rely on this table for long-running job tracking —
-- e.g. fan-out sync progress, batch state machines. Without the table,
-- any `prisma.process.create` at runtime throws P2021.
CREATE TABLE "Process" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "parentProcessId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Process_userId_idx" ON "Process"("userId");

-- CreateIndex
CREATE INDEX "Process_integrationId_idx" ON "Process"("integrationId");

-- CreateIndex
CREATE INDEX "Process_type_idx" ON "Process"("type");

-- CreateIndex
CREATE INDEX "Process_state_idx" ON "Process"("state");

-- CreateIndex
CREATE INDEX "Process_name_idx" ON "Process"("name");

-- CreateIndex
CREATE INDEX "Process_parentProcessId_idx" ON "Process"("parentProcessId");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_parentProcessId_fkey" FOREIGN KEY ("parentProcessId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;
