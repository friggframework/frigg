const { prisma } = require('../../database/prisma');
const { isUniqueViolation } = require('../../database/unique-violation');
const {
    OrganizationMembershipRepositoryInterface,
} = require('./organization-membership-repository-interface');
const { toMembership } = require('./organization-membership-record');

/**
 * Organization membership persistence through the Prisma client. Both schemas
 * declare the same model; they differ only in the id type, which the subclass
 * supplies through `_toDbId` (MongoDB: ObjectId strings, PostgreSQL: Int).
 *
 * @abstract
 */
class OrganizationMembershipRepositoryPrisma extends OrganizationMembershipRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient;
    }

    /**
     * @protected
     * @abstract
     */
    _toDbId(id) {
        throw new Error('Method _toDbId must be implemented by subclass');
    }

    async findMembership(individualUserId, organizationUserId) {
        const row = await this._findRow(individualUserId, organizationUserId);
        return row ? toMembership(row) : null;
    }

    async addMembership(individualUserId, organizationUserId, options = {}) {
        const pair = this._pair(individualUserId, organizationUserId);
        try {
            const row = await this.prisma.organizationMembership.upsert({
                where: { individualUserId_organizationUserId: pair },
                // `undefined` lets the column default (MEMBER) apply.
                create: { ...pair, orgRole: options.orgRole ?? undefined },
                update: {},
            });
            return toMembership(row);
        } catch (error) {
            // Two first logins can both miss the row and both try to create it.
            // The loser's insert hits the unique pair; the row is there now.
            if (!isUniqueViolation(error)) throw error;
            const row = await this._findRow(individualUserId, organizationUserId);
            if (!row) throw error;
            return toMembership(row);
        }
    }

    async listMembershipsForOrganization(organizationUserId) {
        const rows = await this.prisma.organizationMembership.findMany({
            where: { organizationUserId: this._toDbId(organizationUserId) },
            orderBy: { createdAt: 'asc' },
        });
        return rows.map(toMembership);
    }

    _pair(individualUserId, organizationUserId) {
        return {
            individualUserId: this._toDbId(individualUserId),
            organizationUserId: this._toDbId(organizationUserId),
        };
    }

    async _findRow(individualUserId, organizationUserId) {
        return this.prisma.organizationMembership.findUnique({
            where: {
                individualUserId_organizationUserId: this._pair(
                    individualUserId,
                    organizationUserId
                ),
            },
        });
    }
}

module.exports = { OrganizationMembershipRepositoryPrisma };
