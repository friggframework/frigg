const {
    OrganizationMembershipRepositoryPrisma,
} = require('./organization-membership-repository-prisma');

/** Organization membership persistence for MongoDB: ids are ObjectId strings, used as they are. */
class OrganizationMembershipRepositoryMongo extends OrganizationMembershipRepositoryPrisma {
    /** @protected */
    _toDbId(id) {
        return id;
    }
}

module.exports = { OrganizationMembershipRepositoryMongo };
