-- CreateTable
-- ADR-011 durable usage counters. Deliberately isolated from the
-- user/integration-scoped tables (no userId, no FK to Integration) so usage
-- history survives integration deletion and can never surface in a user-scoped
-- query. "window" is quoted throughout — it is a reserved SQL keyword.
CREATE TABLE "UsageCounter" (
    "id" SERIAL NOT NULL,
    "integrationId" TEXT NOT NULL,
    "integrationType" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_integrationId_integrationType_metric_window_key" ON "UsageCounter"("integrationId", "integrationType", "metric", "window");

-- CreateIndex
CREATE INDEX "UsageCounter_metric_window_idx" ON "UsageCounter"("metric", "window");

-- CreateIndex
CREATE INDEX "UsageCounter_metric_integrationType_window_idx" ON "UsageCounter"("metric", "integrationType", "window");
