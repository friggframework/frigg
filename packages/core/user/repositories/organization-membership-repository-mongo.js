/* eslint-disable camelcase -- Prisma names a compound unique key `<a>_<b>` */
const { prisma } = require('../../database/prisma');
const {
    OrganizationMembershipRepositoryInterface,
} = require('./organization-membership-repository-interface');
const {
    toMembership,
    implicitMembership,
    withLegacyMembership,
} = require('./organization-membership-model');

const UNIQUE_VIOLATION = 'P2002';

/**
 * Organization membership persistence through the Prisma client for MongoDB.
 * IDs are strings (ObjectId), so the id hook passes through; the PostgreSQL
 * adapter extends this class and overrides it.
 */
class OrganizationMembershipRepositoryMongo extends OrganizationMembershipRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient;
    }

    /** @protected */
    _toDbId(id) {
        return id;
    }

    async findMembership(individualUserId, organizationUserId) {
        const row = await this._findRow(individualUserId, organizationUserId);
        if (row) return toMembership(row);
        const individual = await this._findIndividual(individualUserId);
        return implicitMembership(individual, organizationUserId);
    }

    async addMembership(individualUserId, organizationUserId, options = {}) {
        const key = {
            individualUserId: this._toDbId(individualUserId),
            organizationUserId: this._toDbId(organizationUserId),
        };
        try {
            const row = await this.prisma.organizationMembership.upsert({
                where: { individualUserId_organizationUserId: key },
                create: { ...key, role: options.role ?? null },
                update: {},
            });
            return toMembership(row);
        } catch (error) {
            // Two first logins can both miss the row and both try to create it.
            // The loser's insert hits the unique pair; the row is there now.
            if (error?.code !== UNIQUE_VIOLATION) throw error;
            const row = await this._findRow(individualUserId, organizationUserId);
            if (!row) throw error;
            return toMembership(row);
        }
    }

    async listMembershipsForIndividual(individualUserId) {
        const rows = await this.prisma.organizationMembership.findMany({
            where: { individualUserId: this._toDbId(individualUserId) },
            orderBy: { createdAt: 'asc' },
        });
        const individual = await this._findIndividual(individualUserId);
        return withLegacyMembership(rows.map(toMembership), individual);
    }

    async _findRow(individualUserId, organizationUserId) {
        return this.prisma.organizationMembership.findUnique({
            where: {
                individualUserId_organizationUserId: {
                    individualUserId: this._toDbId(individualUserId),
                    organizationUserId: this._toDbId(organizationUserId),
                },
            },
        });
    }

    async _findIndividual(individualUserId) {
        return this.prisma.user.findFirst({
            where: { id: this._toDbId(individualUserId), type: 'INDIVIDUAL' },
        });
    }
}

module.exports = { OrganizationMembershipRepositoryMongo };
