const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { BaseRepositoryMongoDBNative } = require('../../database/repositories/base-repository-documentdb');
const { UserRepositoryInterface } = require('./user-repository-interface');
const { createTokenRepository } = require('../../token/repositories/token-repository-factory');

const BCRYPT_ROUNDS = 10;

class UserRepositoryMongoDBNative extends UserRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryMongoDBNative('User', 'User');
        this.tokenRepository = createTokenRepository();
    }

    get collection() {
        return this._base.collection;
    }

    async getSessionToken(token) {
        return await this.tokenRepository.getSessionToken(token);
    }

    async findUserById(userId) {
        return await this.collection.findOne({ _id: new ObjectId(userId) });
    }

    async findIndividualUserById(userId) {
        return await this.collection.findOne({ 
            _id: new ObjectId(userId),
            type: 'individual',
        });
    }

    async findOrganizationUserById(userId) {
        return await this.collection.findOne({
            _id: new ObjectId(userId),
            type: 'organization',
        });
    }

    async findIndividualUserByUsername(username) {
        return await this.collection.findOne({
            username,
            type: 'individual',
        });
    }

    async findIndividualUserByEmail(email) {
        return await this.collection.findOne({
            email,
            type: 'individual',
        });
    }

    async findIndividualUserByAppUserId(appUserId) {
        return await this.collection.findOne({
            appUserId,
            type: 'individual',
        });
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        return await this.collection.findOne({
            appOrgId,
            type: 'organization',
        });
    }

    async createIndividualUser(params) {
        const { username, email, password, appUserId } = params;

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const doc = {
            type: 'individual',
            username,
            email,
            hashword: hashedPassword,
            appUserId: appUserId || null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async createOrganizationUser(params) {
        const { name, appOrgId } = params;

        const doc = {
            type: 'organization',
            name,
            appOrgId: appOrgId || null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(doc);
        return await this.collection.findOne({ _id: result.insertedId });
    }

    async updateIndividualUser(userId, updates) {
        if (updates.password) {
            updates.hashword = await bcrypt.hash(updates.password, BCRYPT_ROUNDS);
            delete updates.password;
        }

        await this.collection.updateOne(
            { _id: new ObjectId(userId), type: 'individual' },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findIndividualUserById(userId);
    }

    async updateOrganizationUser(userId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(userId), type: 'organization' },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findOrganizationUserById(userId);
    }

    async deleteUser(userId) {
        const result = await this.collection.deleteOne({ _id: new ObjectId(userId) });
        return result.deletedCount > 0;
    }

    async createToken(userId, rawToken, minutes = 120) {
        return await this.tokenRepository.createTokenWithExpire(userId, rawToken, minutes);
    }
}

module.exports = { UserRepositoryMongoDBNative };

