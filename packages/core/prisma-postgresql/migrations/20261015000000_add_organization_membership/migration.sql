-- CreateTable
-- Organization memberships (ADR-056 §3.6). One row per person per organization.
-- "User"."organizationId" stays as the legacy single-org pointer; it is NOT
-- backfilled into this table: the application reads it as an implicit
-- membership when no row exists (see docs/guides/organization-memberships.md).
CREATE TABLE "OrganizationMembership" (
    "id" SERIAL NOT NULL,
    "individualUserId" INTEGER NOT NULL,
    "organizationUserId" INTEGER NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationUserId_idx" ON "OrganizationMembership"("organizationUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_individualUserId_organizationUserId_key" ON "OrganizationMembership"("individualUserId", "organizationUserId");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_individualUserId_fkey" FOREIGN KEY ("individualUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationUserId_fkey" FOREIGN KEY ("organizationUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
