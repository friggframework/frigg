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

// Lazy-load mongoose to avoid importing mongodb when using PostgreSQL only
let _mongoose = null;
let _IndividualUser = null;
let _OrganizationUser = null;
let _UserModel = null;
let _WebsocketConnection = null;

// Prisma exports (always available)
const { prisma } = require('./prisma');
const { TokenRepository } = require('../token/repositories/token-repository');
const {
    WebsocketConnectionRepository,
} = require('../websocket/repositories/websocket-connection-repository');

module.exports = {
    // Lazy-loaded mongoose exports (only load when accessed)
    get mongoose() {
        if (!_mongoose) {
            _mongoose = require('./mongoose').mongoose;
        }
        return _mongoose;
    },
    get IndividualUser() {
        if (!_IndividualUser) {
            _IndividualUser = require('./models/IndividualUser').IndividualUser;
        }
        return _IndividualUser;
    },
    get OrganizationUser() {
        if (!_OrganizationUser) {
            _OrganizationUser =
                require('./models/OrganizationUser').OrganizationUser;
        }
        return _OrganizationUser;
    },
    get UserModel() {
        if (!_UserModel) {
            _UserModel = require('./models/UserModel').UserModel;
        }
        return _UserModel;
    },
    get WebsocketConnection() {
        if (!_WebsocketConnection) {
            _WebsocketConnection =
                require('./models/WebsocketConnection').WebsocketConnection;
        }
        return _WebsocketConnection;
    },
    // Prisma (always available)
    prisma,
    TokenRepository,
    WebsocketConnectionRepository,
};
