const {
    OrganizationMembershipRepositoryPrisma,
} = require('./organization-membership-repository-prisma');

/**
 * Organization membership persistence for PostgreSQL. The database keys are
 * Int, the application's are strings, so ids are converted in and the record
 * mapper stringifies them out.
 */
class OrganizationMembershipRepositoryPostgres extends OrganizationMembershipRepositoryPrisma {
    /**
     * Strict: digits only. `parseInt` would turn '12abc' into 12 and query
     * the wrong person.
     * @protected
     */
    _toDbId(id) {
        const text = typeof id === 'number' ? String(id) : id;
        if (typeof text !== 'string' || !/^\d+$/.test(text)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        const parsed = Number(text);
        if (!Number.isSafeInteger(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }
}

module.exports = { OrganizationMembershipRepositoryPostgres };
