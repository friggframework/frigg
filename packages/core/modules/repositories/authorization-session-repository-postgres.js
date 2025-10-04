const { prisma } = require('../../database/prisma');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');
const {
    AuthorizationSessionRepositoryInterface,
} = require('./authorization-session-repository-interface');

/**
 * PostgreSQL Authorization Session Repository Adapter
 * Handles AuthorizationSession persistence operations for PostgreSQL via Prisma
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs (auto-incrementing)
 * - Indexes on sessionId, userId+entityType, expiresAt, completed
 * - JSON/JSONB support for stepData
 * - No automatic TTL (manual cleanup via deleteExpired)
 *
 * Schema Requirements (Prisma):
 * ```prisma
 * model AuthorizationSession {
 *   id          Int      @id @default(autoincrement())
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
class AuthorizationSessionRepositoryPostgres extends AuthorizationSessionRepositoryInterface {
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
        const created = await this.prisma.authorizationSession.create({
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

        return this._toEntity(created);
    }

    /**
     * Find session by session ID
     * Excludes expired sessions
     *
     * @param {string} sessionId - Unique session identifier
     * @returns {Promise<AuthorizationSession|null>} Session entity or null
     */
    async findBySessionId(sessionId) {
        const record = await this.prisma.authorizationSession.findFirst({
            where: {
                sessionId,
                expiresAt: { gt: new Date() },
            },
        });

        return record ? this._toEntity(record) : null;
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
        const record = await this.prisma.authorizationSession.findFirst({
            where: {
                userId,
                entityType,
                completed: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });

        return record ? this._toEntity(record) : null;
    }

    /**
     * Find session by OAuth state parameter
     * Used for OAuth2 callback processing
     *
     * @param {string} oauthState - OAuth state parameter from callback
     * @returns {Promise<AuthorizationSession|null>} Session entity or null
     */
    async findByOAuthState(oauthState) {
        const record = await this.prisma.authorizationSession.findFirst({
            where: {
                oauthState,
                expiresAt: { gt: new Date() },
            },
        });

        return record ? this._toEntity(record) : null;
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
     * PostgreSQL doesn't have TTL indexes, so this must be called periodically
     * Recommend running as cron job or scheduled task
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
     * Convert Prisma record to domain entity
     *
     * @private
     * @param {Object} record - Prisma record
     * @returns {AuthorizationSession} Domain entity
     */
    _toEntity(record) {
        return new AuthorizationSession({
            sessionId: record.sessionId,
            userId: record.userId,
            entityType: record.entityType,
            currentStep: record.currentStep,
            maxSteps: record.maxSteps,
            stepData: record.stepData,
            expiresAt: record.expiresAt,
            completed: record.completed,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        });
    }
}

module.exports = { AuthorizationSessionRepositoryPostgres };
