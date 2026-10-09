const { prisma } = require('../../database/prisma');
const {
    findOne,
    insertOne,
    updateOne,
    deleteMany,
} = require('../../database/documentdb-utils');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const { AuthorizationSession } = require('../domain/authorization-session');
const {
    AuthorizationSessionRepositoryInterface,
} = require('./authorization-session-repository-interface');

const COLLECTION = 'AuthorizationSession';

/**
 * AuthorizationSession persistence for DocumentDB through raw commands.
 * `stepData` is encrypted with DocumentDBEncryptionService, as the Prisma
 * extension does not run for raw commands.
 */
class AuthorizationSessionRepositoryDocumentDB extends AuthorizationSessionRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async create(session) {
        const now = new Date();
        const document = await this.encryptionService.encryptFields(COLLECTION, {
            sessionId: session.sessionId,
            userId: session.userId,
            entityType: session.entityType,
            credentialId: session.credentialId,
            currentStep: session.currentStep,
            maxSteps: session.maxSteps,
            stepData: session.stepData,
            expiresAt: session.expiresAt,
            completed: session.completed,
            createdAt: now,
            updatedAt: now,
        });
        await insertOne(this.prisma, COLLECTION, document);
        return this._toDomain(
            await this.encryptionService.decryptFields(COLLECTION, document)
        );
    }

    async findBySessionId(sessionId) {
        if (typeof sessionId !== 'string' || !sessionId) return null;
        const document = await findOne(this.prisma, COLLECTION, {
            sessionId,
            expiresAt: { $gt: new Date() },
        });
        if (!document) return null;
        return this._toDomain(
            await this.encryptionService.decryptFields(COLLECTION, document)
        );
    }

    async update(session) {
        const encrypted = await this.encryptionService.encryptFields(COLLECTION, {
            stepData: session.stepData,
        });
        await updateOne(
            this.prisma,
            COLLECTION,
            { sessionId: session.sessionId },
            {
                $set: {
                    currentStep: session.currentStep,
                    stepData: encrypted.stepData,
                    completed: session.completed,
                    updatedAt: new Date(),
                },
            }
        );
        return session;
    }

    async deleteBySessionId(sessionId) {
        const result = await deleteMany(this.prisma, COLLECTION, { sessionId });
        return result?.n ?? 0;
    }

    async deleteExpired(now = new Date()) {
        const result = await deleteMany(this.prisma, COLLECTION, {
            expiresAt: { $lte: now },
        });
        return result?.n ?? 0;
    }

    _toDomain(document) {
        return new AuthorizationSession({
            sessionId: document.sessionId,
            userId: document.userId,
            entityType: document.entityType,
            credentialId: document.credentialId ?? null,
            currentStep: document.currentStep,
            maxSteps: document.maxSteps,
            stepData: document.stepData || {},
            expiresAt: new Date(document.expiresAt),
            completed: Boolean(document.completed),
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
        });
    }
}

module.exports = { AuthorizationSessionRepositoryDocumentDB };
