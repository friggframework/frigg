-- CreateTable
-- Multi-step authorization state for Management API v2 (/api/v2/authorize).
-- Short-lived rows; "stepData" is encrypted at rest by the application.
CREATE TABLE "AuthorizationSession" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "credentialId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "maxSteps" INTEGER NOT NULL,
    "stepData" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationSession_sessionId_key" ON "AuthorizationSession"("sessionId");

-- CreateIndex
CREATE INDEX "AuthorizationSession_userId_entityType_idx" ON "AuthorizationSession"("userId", "entityType");

-- CreateIndex
CREATE INDEX "AuthorizationSession_expiresAt_idx" ON "AuthorizationSession"("expiresAt");
