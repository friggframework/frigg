//todo: probably most of this file content can be removed

/**
 * Database Module Index
 * Exports Mongoose models and connection utilities
 *
 * Note: Frigg uses the Repository pattern for data access.
 * Models are not meant to be used directly - use repositories instead:
 * - SyncRepository (syncs/sync-repository.js)
 * - IntegrationRepository (integrations/integration-repository.js)
 * - CredentialRepository (credential/credential-repository.js)
 * etc.
 */

const { mongoose } = require('./mongoose');
const { IndividualUser } = require('./models/IndividualUser');
const { OrganizationUser } = require('./models/OrganizationUser');
const { UserModel } = require('./models/UserModel');
const { WebsocketConnection } = require('./models/WebsocketConnection');

// Prisma exports
const { prisma } = require('./prisma');
const { TokenRepository } = require('../token/repositories/token-repository');
const {
    WebsocketConnectionRepository,
} = require('../websocket/repositories/websocket-connection-repository');

module.exports = {
    mongoose,
    IndividualUser,
    OrganizationUser,
    UserModel,
    WebsocketConnection,
    // Prisma
    prisma,
    TokenRepository,
    WebsocketConnectionRepository,
};
