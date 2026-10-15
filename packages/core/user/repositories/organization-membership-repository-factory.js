const databaseConfig = require('../../database/config');
const {
    OrganizationMembershipRepositoryMongo,
} = require('./organization-membership-repository-mongo');
const {
    OrganizationMembershipRepositoryPostgres,
} = require('./organization-membership-repository-postgres');
const {
    OrganizationMembershipRepositoryDocumentDB,
} = require('./organization-membership-repository-documentdb');

/**
 * Membership repository for the configured database. Every method returns
 * String ids whatever the database stores.
 *
 * @returns {import('./organization-membership-repository-interface').OrganizationMembershipRepositoryInterface}
 */
function createOrganizationMembershipRepository() {
    switch (databaseConfig.DB_TYPE) {
        case 'mongodb':
            return new OrganizationMembershipRepositoryMongo();
        case 'postgresql':
            return new OrganizationMembershipRepositoryPostgres();
        case 'documentdb':
            return new OrganizationMembershipRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported DB_TYPE: ${databaseConfig.DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createOrganizationMembershipRepository,
    OrganizationMembershipRepositoryMongo,
    OrganizationMembershipRepositoryPostgres,
    OrganizationMembershipRepositoryDocumentDB,
};
