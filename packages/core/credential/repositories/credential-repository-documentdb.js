const { ObjectId } = require('mongodb');
const { BaseRepositoryDocumentDB } = require('../../database/repositories/base-repository-documentdb');
const { CredentialRepositoryInterface } = require('./credential-repository-interface');

class CredentialRepositoryDocumentDB extends CredentialRepositoryInterface {
    constructor() {
        super();
        this._base = new BaseRepositoryDocumentDB('Credential', 'Credential');
    }

    get collection() {
        return this._base.collection;
    }

    async findCredentialById(id) {
        return await this.collection.findOne({ _id: new ObjectId(id) });
    }

    async findCredential(filter) {
        return await this.collection.findOne(filter);
    }

    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        
        if (!identifiers) {
            throw new Error('identifiers required to upsert credential');
        }

        if (!identifiers.user && !identifiers.userId) {
            throw new Error('user or userId required in identifiers');
        }
        
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. ' +
                'When multiple credentials exist for the same user, both userId and externalId ' +
                'are needed to uniquely identify which credential to update.'
            );
        }

        const where = this._convertIdentifiersToWhere(identifiers);
        const { user, userId, externalId, authIsValid, ...oauthData } = details;

        const existing = await this.collection.findOne(where);

        if (existing) {
            const mergedData = { ...(existing.data || {}), ...oauthData };

            await this.collection.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        userId: userId || user || existing.userId,
                        externalId: externalId !== undefined ? externalId : existing.externalId,
                        authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                        data: mergedData,
                        updatedAt: new Date(),
                    },
                }
            );

            const updated = await this.collection.findOne({ _id: existing._id });
            return this._formatCredentialResponse(updated);
        }

        const insertDoc = {
            userId: userId || user || null,
            externalId,
            authIsValid: authIsValid || null,
            data: oauthData,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await this.collection.insertOne(insertDoc);
        const created = await this.collection.findOne({ _id: result.insertedId });
        return this._formatCredentialResponse(created);
    }

    async updateCredential(credentialId, updates) {
        await this.collection.updateOne(
            { _id: new ObjectId(credentialId) },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        return await this.findCredentialById(credentialId);
    }

    async updateAuthenticationStatus(credentialId, authIsValid) {
        return await this.collection.updateOne(
            { _id: new ObjectId(credentialId) },
            { $set: { authIsValid, updatedAt: new Date() } }
        );
    }

    async deleteCredentialById(credentialId) {
        return await this.collection.deleteOne({ _id: new ObjectId(credentialId) });
    }

    _convertIdentifiersToWhere(identifiers) {
        const where = {};

        if (identifiers.userId) {
            where.userId = identifiers.userId;
        } else if (identifiers.user) {
            where.userId = identifiers.user;
        }

        if (identifiers.externalId) {
            where.externalId = identifiers.externalId;
        }

        return where;
    }

    _formatCredentialResponse(credential) {
        if (!credential) {
            return null;
        }

        return {
            id: credential._id.toString(),
            userId: credential.userId,
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            ...(credential.data || {}),
        };
    }
}

module.exports = { CredentialRepositoryDocumentDB };

