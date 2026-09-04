/**
 * Database Module Index
 * Exports Prisma client, connection utilities, and repositories
 *
 * Note: Frigg uses the Repository pattern for data access.
 * Use repositories for data operations:
 * - SyncRepository (syncs/sync-repository.js)
 * - IntegrationRepository (integrations/integration-repository.js)
 * - CredentialRepository (credential/credential-repository.js)
 * etc.
 */

const { prisma, connectPrisma, disconnectPrisma } = require('./prisma');
const { TokenRepository } = require('../token/repositories/token-repository');
const {
    WebsocketConnectionRepository,
} = require('../websocket/repositories/websocket-connection-repository');

module.exports = {
    prisma,
    connectPrisma,
    disconnectPrisma,
    TokenRepository,
    WebsocketConnectionRepository,
};
