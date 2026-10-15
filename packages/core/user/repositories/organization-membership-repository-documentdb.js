const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findOne,
    findMany,
    updateOne,
} = require('../../database/documentdb-utils');
const {
    OrganizationMembershipRepositoryInterface,
} = require('./organization-membership-repository-interface');
const {
    toMembership,
    implicitMembership,
    withLegacyMembership,
} = require('./organization-membership-model');

const COLLECTION = 'OrganizationMembership';
const DUPLICATE_KEY = 11000;

const parseDate = (value) => {
    if (!value) return undefined;
    const date = new Date(value.$date ?? value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * Organization membership persistence for DocumentDB through raw commands.
 * Nothing in a membership is encrypted.
 */
class OrganizationMembershipRepositoryDocumentDB extends OrganizationMembershipRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findMembership(individualUserId, organizationUserId) {
        const doc = await this._findDoc(individualUserId, organizationUserId);
        if (doc) return this._toMembership(doc);
        const individual = await this._findIndividual(individualUserId);
        return implicitMembership(individual, organizationUserId);
    }

    async addMembership(individualUserId, organizationUserId, options = {}) {
        // $setOnInsert: an existing membership is left exactly as it is.
        const result = await updateOne(
            this.prisma,
            COLLECTION,
            this._pair(individualUserId, organizationUserId),
            {
                $setOnInsert: {
                    role: options.role ?? null,
                    createdAt: new Date(),
                },
            },
            { upsert: true }
        );
        // The loser of a first-login race can hit the unique pair; the row
        // exists then, so only other write errors are failures.
        const writeError = result?.writeErrors?.[0];
        if (writeError && writeError.code !== DUPLICATE_KEY) {
            throw new Error(
                `Adding organization membership failed: ${writeError.errmsg} (code: ${writeError.code})`
            );
        }
        const doc = await this._findDoc(individualUserId, organizationUserId);
        if (!doc) {
            throw new Error('Organization membership was not stored');
        }
        return this._toMembership(doc);
    }

    async listMembershipsForIndividual(individualUserId) {
        const docs = await findMany(
            this.prisma,
            COLLECTION,
            { individualUserId: toObjectId(individualUserId) },
            { sort: { createdAt: 1 } }
        );
        const individual = await this._findIndividual(individualUserId);
        return withLegacyMembership(
            docs.map((doc) => this._toMembership(doc)),
            individual
        );
    }

    _pair(individualUserId, organizationUserId) {
        return {
            individualUserId: toObjectId(individualUserId),
            organizationUserId: toObjectId(organizationUserId),
        };
    }

    async _findDoc(individualUserId, organizationUserId) {
        return findOne(
            this.prisma,
            COLLECTION,
            this._pair(individualUserId, organizationUserId)
        );
    }

    async _findIndividual(individualUserId) {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(individualUserId),
            type: 'INDIVIDUAL',
        });
        if (!doc) return null;
        return {
            id: fromObjectId(doc._id),
            organizationId: doc.organizationId
                ? fromObjectId(doc.organizationId)
                : null,
            createdAt: parseDate(doc.createdAt),
        };
    }

    _toMembership(doc) {
        return toMembership({
            id: fromObjectId(doc._id),
            individualUserId: fromObjectId(doc.individualUserId),
            organizationUserId: fromObjectId(doc.organizationUserId),
            role: doc.role,
            createdAt: parseDate(doc.createdAt),
        });
    }
}

module.exports = { OrganizationMembershipRepositoryDocumentDB };
