const { prisma } = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    deleteOne,
    deleteMany,
} = require('../../database/documentdb-utils');
const { TokenRepositoryInterface } = require('./token-repository-interface');
const { ClientSafeError } = require('../../errors');

const BCRYPT_ROUNDS = 10;

class TokenRepositoryDocumentDB extends TokenRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async createTokenWithExpire(userId, rawToken, minutes) {
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
        const expires = new Date(Date.now() + minutes * 60000);
        const now = new Date();
        const document = {
            token: tokenHash,
            expires,
            userId: toObjectId(userId),
            created: now,
        };
        const insertedId = await insertOne(this.prisma, 'Token', document);
        const created = await findOne(this.prisma, 'Token', {
            _id: insertedId,
        });
        return this._mapToken(created);
    }

    async validateAndGetToken(tokenObj) {
        const objectId = toObjectId(tokenObj.id);
        if (!objectId) {
            throw new ClientSafeError(
                'Invalid Token: Token does not exist',
                401
            );
        }
        const record = await findOne(this.prisma, 'Token', { _id: objectId });
        if (!record) {
            throw new ClientSafeError(
                'Invalid Token: Token does not exist',
                401
            );
        }
        const isValid = await bcrypt.compare(tokenObj.token, record.token);
        if (!isValid) {
            throw new ClientSafeError(
                'Invalid Token: Token does not match',
                401
            );
        }
        if (record.expires && new Date(record.expires) < new Date()) {
            throw new ClientSafeError('Invalid Token: Token is expired', 401);
        }
        return this._mapToken(record);
    }

    async findTokenById(tokenId) {
        const objectId = toObjectId(tokenId);
        if (!objectId) return null;
        const record = await findOne(this.prisma, 'Token', { _id: objectId });
        return record ? this._mapToken(record) : null;
    }

    async findTokensByUserId(userId) {
        const objectId = toObjectId(userId);
        const filter = objectId ? { userId: objectId } : {};
        const records = await findMany(this.prisma, 'Token', filter);
        return records.map((record) => this._mapToken(record));
    }

    async deleteToken(tokenId) {
        const objectId = toObjectId(tokenId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Token', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteExpiredTokens() {
        const result = await deleteMany(this.prisma, 'Token', {
            expires: { $lt: new Date() },
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteTokensByUserId(userId) {
        const objectId = toObjectId(userId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteMany(this.prisma, 'Token', {
            userId: objectId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    createJSONToken(token, rawToken) {
        return JSON.stringify({
            id: token.id,
            token: rawToken,
        });
    }

    createBase64BufferToken(token, rawToken) {
        const jsonVal = this.createJSONToken(token, rawToken);
        return Buffer.from(jsonVal).toString('base64');
    }

    getJSONTokenFromBase64BufferToken(buffer) {
        const tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    }

    _mapToken(record) {
        if (!record) return null;
        return {
            id: fromObjectId(record._id),
            token: record.token,
            expires: record.expires ? new Date(record.expires) : null,
            userId: fromObjectId(record.userId),
            created: record.created ? new Date(record.created) : null,
        };
    }
}

module.exports = { TokenRepositoryDocumentDB };
