const config = require('../../database/config');
const {
    AuthorizationSessionRepositoryPrisma,
} = require('./authorization-session-repository-prisma');
const {
    AuthorizationSessionRepositoryDocumentDB,
} = require('./authorization-session-repository-documentdb');

/**
 * AuthorizationSession repository for the configured database. PostgreSQL
 * and MongoDB share the Prisma adapter; DocumentDB uses raw commands.
 */
function createAuthorizationSessionRepository() {
    switch (config.DB_TYPE) {
        case 'mongodb':
        case 'postgresql':
            return new AuthorizationSessionRepositoryPrisma();
        case 'documentdb':
            return new AuthorizationSessionRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${config.DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createAuthorizationSessionRepository,
    AuthorizationSessionRepositoryPrisma,
    AuthorizationSessionRepositoryDocumentDB,
};
