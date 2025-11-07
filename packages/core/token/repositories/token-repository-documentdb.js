const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { BaseRepositoryDocumentDB } = require('../../database/repositories/base-repository-documentdb');
const { TokenRepositoryInterface } = require('./token-repository-interface');

const BCRYPT_ROUNDS = 10;

class TokenRepositoryDocumentDB extends TokenRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryDocumentDB('Token', 'Token');
    }

    get collection() {
        return this._base.collection;
    }

    async createTokenWithExpire(userId, rawToken, minutes) {
        const hashedToken = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

        const doc = {
            userId,
            token: hashedToken,
            expiresAt,
            createdAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        const token = await this.collection.findOne({ _id: result.insertedId });
        
        return Buffer.from(JSON.stringify({ 
            tokenId: token._id.toString(), 
            rawToken 
        })).toString('base64');
    }

    async validateAndGetToken(tokenObj) {
        const token = await this.collection.findOne({ _id: new ObjectId(tokenObj.tokenId) });
        
        if (!token) {
            return null;
        }

        if (new Date() > new Date(token.expiresAt)) {
            await this.deleteToken(tokenObj.tokenId);
            return null;
        }

        const isValid = await bcrypt.compare(tokenObj.rawToken, token.token);
        return isValid ? token : null;
    }

    async findTokenById(tokenId) {
        return await this.collection.findOne({ _id: new ObjectId(tokenId) });
    }

    async findTokensByUserId(userId) {
        return await this.collection.find({ userId });
    }

    async deleteToken(tokenId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(tokenId) });
        return result.deletedCount > 0;
    }

    async deleteExpiredTokens() {
        const result = await this.collection.deleteMany({ 
            expiresAt: { $lt: new Date() } 
        });
        return result.deletedCount;
    }

    async deleteTokensByUserId(userId) {
        const result = await this.collection.deleteMany({ userId });
        return result.deletedCount;
    }
}

module.exports = { TokenRepositoryDocumentDB };

