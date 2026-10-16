const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findOne,
    findManyDrained,
    updateOne,
} = require('../../database/documentdb-utils');
const { DUPLICATE_KEY_CODE } = require('../../database/unique-violation');
const {
    OrganizationMembershipRepositoryInterface,
} = require('./organization-membership-repository-interface');
const { toMembership } = require('./organization-membership-record');
const { DEFAULT_ORG_ROLE } = require('../membership');

const COLLECTION = 'OrganizationMembership';

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
        return doc ? this._toMembership(doc) : null;
    }

    async addMembership(individualUserId, organizationUserId, options = {}) {
        // $setOnInsert: an existing membership is left exactly as it is.
        const result = await updateOne(
            this.prisma,
            COLLECTION,
            this._pair(individualUserId, organizationUserId),
            {
                $setOnInsert: {
                    orgRole: options.orgRole ?? DEFAULT_ORG_ROLE,
                    createdAt: new Date(),
                },
            },
            { upsert: true }
        );
        // The loser of a first-login race can hit the unique pair; the row
        // exists then, so only other write errors are failures.
        const writeError = result?.writeErrors?.[0];
        if (writeError && writeError.code !== DUPLICATE_KEY_CODE) {
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

    async listMembershipsForOrganization(organizationUserId) {
        // Drained: findMany returns only the first cursor batch (~101 documents),
        // which would silently drop members of a large organization.
        const docs = await findManyDrained(
            this.prisma,
            COLLECTION,
            { organizationUserId: toObjectId(organizationUserId) },
            { sort: { createdAt: 1 } }
        );
        return docs.map((doc) => this._toMembership(doc));
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

    _toMembership(doc) {
        return toMembership({
            id: fromObjectId(doc._id),
            individualUserId: fromObjectId(doc.individualUserId),
            organizationUserId: fromObjectId(doc.organizationUserId),
            orgRole: doc.orgRole ?? DEFAULT_ORG_ROLE,
            createdAt: parseDate(doc.createdAt),
        });
    }
}

module.exports = { OrganizationMembershipRepositoryDocumentDB };
