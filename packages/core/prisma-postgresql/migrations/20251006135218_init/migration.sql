/*
  Warnings:

  - You are about to drop the column `auth_is_valid` on the `Credential` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Credential" DROP COLUMN "auth_is_valid",
ADD COLUMN     "authIsValid" BOOLEAN;
