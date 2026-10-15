const {
    OrganizationMembershipRepositoryMongo,
} = require('./organization-membership-repository-mongo');

/**
 * Organization membership persistence for PostgreSQL. Same Prisma queries as
 * the MongoDB adapter; the database keys are Int, the application's are
 * strings, so ids are converted in and the model stringifies them out.
 */
class OrganizationMembershipRepositoryPostgres extends OrganizationMembershipRepositoryMongo {
    /** @protected */
    _toDbId(id) {
        const parsed = parseInt(id, 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }
}

module.exports = { OrganizationMembershipRepositoryPostgres };
