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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_appUserId_key" ON "User"("username", "appUserId");
