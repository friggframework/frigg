const { prisma } = require('../../database/prisma');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');
const {
    AuthorizationSessionRepositoryInterface,
} = require('./authorization-session-repository-interface');

/**
 * MongoDB Authorization Session Repository Adapter
 * Handles AuthorizationSession persistence operations for MongoDB via Prisma
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (Prisma's default for MongoDB)
 * - TTL index on expiresAt for automatic cleanup
 * - No ID conversion needed (IDs are already strings)
 *
 * Schema Requirements (Prisma):
 * ```prisma
 * model AuthorizationSession {
 *   id          String   @id @default(auto()) @map("_id") @db.ObjectId
 *   sessionId   String   @unique
 *   userId      String
 *   entityType  String
 *   currentStep Int      @default(1)
 *   maxSteps    Int
 *   stepData    Json     @default("{}")
 *   expiresAt   DateTime
 *   completed   Boolean  @default(false)
 *   createdAt   DateTime @default(now())
 *   updatedAt   DateTime @updatedAt
 *
 *   @@index([sessionId])
 *   @@index([userId, entityType])
 *   @@index([expiresAt])
 *   @@index([completed])
 * }
 * ```
 */
class AuthorizationSessionRepositoryMongo extends AuthorizationSessionRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Create a new authorization session
     *
     * @param {AuthorizationSession} session - Session entity to create
     * @returns {Promise<AuthorizationSession>} Created session entity
     */
    async create(session) {
        const doc = await this.prisma.authorizationSession.create({
            data: {
                sessionId: session.sessionId,
                userId: session.userId,
                entityType: session.entityType,
                currentStep: session.currentStep,
                maxSteps: session.maxSteps,
                stepData: session.stepData,
                expiresAt: session.expiresAt,
                completed: session.completed,
            },
        });

        return this._toEntity(doc);
    }

    /**
     * Find session by session ID
     * Excludes expired sessions
     *
     * @param {string} sessionId - Unique session identifier
     * @returns {Promise<AuthorizationSession|null>} Session entity or null
     */
    async findBySessionId(sessionId) {
        const doc = await this.prisma.authorizationSession.findFirst({
            where: {
                sessionId,
                expiresAt: { gt: new Date() },
            },
        });

        return doc ? this._toEntity(doc) : null;
    }

    /**
     * Find active session for user and entity type
     * Returns most recent active session
     *
     * @param {string} userId - User ID
     * @param {string} entityType - Entity type (module name)
     * @returns {Promise<AuthorizationSession|null>} Session entity or null
     */
    async findActiveSession(userId, entityType) {
        const doc = await this.prisma.authorizationSession.findFirst({
            where: {
                userId,
                entityType,
                completed: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });

        return doc ? this._toEntity(doc) : null;
    }

    /**
     * Update existing session
     *
     * @param {AuthorizationSession} session - Session entity with updated data
     * @returns {Promise<AuthorizationSession>} Updated session entity
     */
    async update(session) {
        const updated = await this.prisma.authorizationSession.update({
            where: { sessionId: session.sessionId },
            data: {
                currentStep: session.currentStep,
                stepData: session.stepData,
                completed: session.completed,
                updatedAt: new Date(),
            },
        });

        return this._toEntity(updated);
    }

    /**
     * Delete expired sessions (cleanup operation)
     * Note: MongoDB TTL index handles automatic deletion, but this provides
     * manual cleanup capability
     *
     * @returns {Promise<number>} Number of deleted sessions
     */
    async deleteExpired() {
        const result = await this.prisma.authorizationSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        return result.count;
    }

    /**
     * Convert Prisma document to domain entity
     *
     * @private
     * @param {Object} doc - Prisma document
     * @returns {AuthorizationSession} Domain entity
     */
    _toEntity(doc) {
        return new AuthorizationSession({
            sessionId: doc.sessionId,
            userId: doc.userId,
            entityType: doc.entityType,
            currentStep: doc.currentStep,
            maxSteps: doc.maxSteps,
            stepData: doc.stepData,
            expiresAt: doc.expiresAt,
            completed: doc.completed,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        });
    }
}

module.exports = { AuthorizationSessionRepositoryMongo };
