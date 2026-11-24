-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ENABLED', 'NEEDS_CONFIG', 'PROCESSING', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "AssociationType" AS ENUM ('ONE_TO_MANY', 'ONE_TO_ONE', 'MANY_TO_ONE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "type" "UserType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "hashword" TEXT,
    "appUserId" TEXT,
    "organizationId" INTEGER,
    "appOrgId" TEXT,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "subType" TEXT,
    "auth_is_valid" BOOLEAN,
    "externalId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" SERIAL NOT NULL,
    "credentialId" INTEGER,
    "subType" TEXT,
    "userId" INTEGER,
    "name" TEXT,
    "moduleName" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ENABLED',
    "config" JSONB,
    "version" TEXT,
    "entityReferenceMap" JSONB DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "info" JSONB NOT NULL DEFAULT '[]',
    "logs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationMapping" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "sourceId" TEXT,
    "mapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sync" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER,
    "hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataIdentifier" (
    "id" SERIAL NOT NULL,
    "syncId" INTEGER,
    "entityId" INTEGER NOT NULL,
    "idData" JSONB NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "DataIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Association" (
    "id" SERIAL NOT NULL,
    "integrationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssociationType" NOT NULL,
    "primaryObject" TEXT NOT NULL,

    CONSTRAINT "Association_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssociationObject" (
    "id" SERIAL NOT NULL,
    "associationId" INTEGER NOT NULL,
    "entityId" INTEGER NOT NULL,
    "objectType" TEXT NOT NULL,
    "objId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AssociationObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" SERIAL NOT NULL,
    "state" JSONB,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsocketConnection" (
    "id" SERIAL NOT NULL,
    "connectionId" TEXT,

    CONSTRAINT "WebsocketConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EntityToIntegration" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_EntityToIntegration_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EntityToSync" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_EntityToSync_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "User_type_idx" ON "User"("type");

-- CreateIndex
CREATE INDEX "User_appUserId_idx" ON "User"("appUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_appOrgId_key" ON "User"("appOrgId");

-- CreateIndex
CREATE INDEX "Token_userId_idx" ON "Token"("userId");

-- CreateIndex
CREATE INDEX "Token_expires_idx" ON "Token"("expires");

-- CreateIndex
CREATE INDEX "Credential_userId_idx" ON "Credential"("userId");

-- CreateIndex
CREATE INDEX "Credential_externalId_idx" ON "Credential"("externalId");

-- CreateIndex
CREATE INDEX "Entity_userId_idx" ON "Entity"("userId");

-- CreateIndex
CREATE INDEX "Entity_externalId_idx" ON "Entity"("externalId");

-- CreateIndex
CREATE INDEX "Entity_moduleName_idx" ON "Entity"("moduleName");

-- CreateIndex
CREATE INDEX "Entity_credentialId_idx" ON "Entity"("credentialId");

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE INDEX "Integration_status_idx" ON "Integration"("status");

-- CreateIndex
CREATE INDEX "IntegrationMapping_integrationId_idx" ON "IntegrationMapping"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationMapping_sourceId_idx" ON "IntegrationMapping"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationMapping_integrationId_sourceId_key" ON "IntegrationMapping"("integrationId", "sourceId");

-- CreateIndex
CREATE INDEX "Sync_integrationId_idx" ON "Sync"("integrationId");

-- CreateIndex
CREATE INDEX "Sync_hash_idx" ON "Sync"("hash");

-- CreateIndex
CREATE INDEX "Sync_name_idx" ON "Sync"("name");

-- CreateIndex
CREATE INDEX "DataIdentifier_syncId_idx" ON "DataIdentifier"("syncId");

-- CreateIndex
CREATE INDEX "DataIdentifier_entityId_idx" ON "DataIdentifier"("entityId");

-- CreateIndex
CREATE INDEX "DataIdentifier_hash_idx" ON "DataIdentifier"("hash");

-- CreateIndex
CREATE INDEX "Association_integrationId_idx" ON "Association"("integrationId");

-- CreateIndex
CREATE INDEX "Association_name_idx" ON "Association"("name");

-- CreateIndex
CREATE INDEX "AssociationObject_associationId_idx" ON "AssociationObject"("associationId");

-- CreateIndex
CREATE INDEX "AssociationObject_entityId_idx" ON "AssociationObject"("entityId");

-- CreateIndex
CREATE INDEX "WebsocketConnection_connectionId_idx" ON "WebsocketConnection"("connectionId");

-- CreateIndex
CREATE INDEX "_EntityToIntegration_B_index" ON "_EntityToIntegration"("B");

-- CreateIndex
CREATE INDEX "_EntityToSync_B_index" ON "_EntityToSync"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationMapping" ADD CONSTRAINT "IntegrationMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sync" ADD CONSTRAINT "Sync_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataIdentifier" ADD CONSTRAINT "DataIdentifier_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "Sync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataIdentifier" ADD CONSTRAINT "DataIdentifier_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Association" ADD CONSTRAINT "Association_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociationObject" ADD CONSTRAINT "AssociationObject_associationId_fkey" FOREIGN KEY ("associationId") REFERENCES "Association"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssociationObject" ADD CONSTRAINT "AssociationObject_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EntityToIntegration" ADD CONSTRAINT "_EntityToIntegration_A_fkey" FOREIGN KEY ("A") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EntityToIntegration" ADD CONSTRAINT "_EntityToIntegration_B_fkey" FOREIGN KEY ("B") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EntityToSync" ADD CONSTRAINT "_EntityToSync_A_fkey" FOREIGN KEY ("A") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EntityToSync" ADD CONSTRAINT "_EntityToSync_B_fkey" FOREIGN KEY ("B") REFERENCES "Sync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
