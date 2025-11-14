/*
  Warnings:

  - You are about to drop the column `subType` on the `Credential` table. All the data in the column will be lost.
  - You are about to drop the column `subType` on the `Entity` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[username,appUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_appOrgId_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "Credential" DROP COLUMN "subType";

-- AlterTable
ALTER TABLE "Entity" DROP COLUMN "subType";

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_appUserId_key" ON "User"("username", "appUserId");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_parentProcessId_fkey" FOREIGN KEY ("parentProcessId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;
