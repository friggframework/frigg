const { prisma } = require('../../database/prisma');
const { AuthorizationSession } = require('../domain/authorization-session');
const {
    AuthorizationSessionRepositoryInterface,
} = require('./authorization-session-repository-interface');

/**
 * AuthorizationSession persistence through the Prisma client, for PostgreSQL
 * and MongoDB (both schemas declare the same model; the session id, not the
 * row id, is the key, so no id conversion is needed). `stepData` is
 * encrypted by the Prisma encryption extension (encryption-schema-registry).
 */
class AuthorizationSessionRepositoryPrisma extends AuthorizationSessionRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient;
    }

    async create(session) {
        const record = await this.prisma.authorizationSession.create({
            data: {
                sessionId: session.sessionId,
                userId: session.userId,
                entityType: session.entityType,
                credentialId: session.credentialId,
                currentStep: session.currentStep,
                maxSteps: session.maxSteps,
                stepData: session.stepData,
                expiresAt: session.expiresAt,
                completed: session.completed,
            },
        });
        return toDomain(record);
    }

    async findBySessionId(sessionId) {
        if (typeof sessionId !== 'string' || !sessionId) return null;
        const record = await this.prisma.authorizationSession.findFirst({
            where: { sessionId, expiresAt: { gt: new Date() } },
        });
        return record ? toDomain(record) : null;
    }

    async update(session) {
        const record = await this.prisma.authorizationSession.update({
            where: { sessionId: session.sessionId },
            data: {
                currentStep: session.currentStep,
                stepData: session.stepData,
                completed: session.completed,
            },
        });
        return toDomain(record);
    }

    async deleteBySessionId(sessionId) {
        const result = await this.prisma.authorizationSession.deleteMany({
            where: { sessionId },
        });
        return result.count;
    }

    async deleteExpired(now = new Date()) {
        const result = await this.prisma.authorizationSession.deleteMany({
            where: { expiresAt: { lte: now } },
        });
        return result.count;
    }
}

function toDomain(record) {
    return new AuthorizationSession({
        sessionId: record.sessionId,
        userId: record.userId,
        entityType: record.entityType,
        credentialId: record.credentialId ?? null,
        currentStep: record.currentStep,
        maxSteps: record.maxSteps,
        stepData: record.stepData || {},
        expiresAt: record.expiresAt,
        completed: record.completed,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    });
}

module.exports = { AuthorizationSessionRepositoryPrisma, toDomain };
