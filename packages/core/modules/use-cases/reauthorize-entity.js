const Boom = require('@hapi/boom');
const crypto = require('crypto');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');

/**
 * Reauthorize Entity Use Case
 * Re-authenticate an existing entity without creating a new one
 *
 * Follows API v2 spec for entity re-authentication flow:
 * 1. POST /api/entities/:id/reauthorize - Initiate re-auth
 * 2. User completes OAuth/auth flow
 * 3. POST /api/entities/:id/reauthorize/complete - Complete re-auth
 *
 * Business Rules:
 * - Only entity owner can reauthorize
 * - Updates existing credential (doesn't create new)
 * - Entity remains the same (same ID)
 * - All integrations using entity continue to work
 *
 * @example
 * const useCase = new ReauthorizeEntity({
 *     moduleRepository,
 *     credentialRepository,
 *     authSessionRepository,
 *     moduleDefinitions
 * });
 *
 * // Step 1: Initiate
 * const session = await useCase.initiateReauthorization(entityId, userId);
 * // User completes OAuth...
 * // Step 2: Complete
 * const entity = await useCase.completeReauthorization(entityId, userId, sessionId, authData);
 */
class ReauthorizeEntity {
    /**
     * @param {Object} params
     * @param {import('../repositories/module-repository-factory').ModuleRepositoryInterface} params.moduleRepository
     * @param {import('../../credential/repositories/credential-repository-factory').CredentialRepositoryInterface} params.credentialRepository
     * @param {import('../repositories/authorization-session-repository-factory').AuthorizationSessionRepositoryInterface} params.authSessionRepository
     * @param {Array<Object>} params.moduleDefinitions
     */
    constructor({
        moduleRepository,
        credentialRepository,
        authSessionRepository,
        moduleDefinitions
    }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.authSessionRepository = authSessionRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Step 1: Initiate re-authorization flow
     *
     * Creates a special authorization session for updating existing entity
     *
     * @param {string} entityId - Entity ID to reauthorize
     * @param {string} userId - User ID (for ownership verification)
     * @returns {Promise<Object>} Session details with auth requirements
     */
    async initiateReauthorization(entityId, userId) {
        // Get entity and verify ownership
        const entity = await this.moduleRepository.findEntityById(entityId);

        if (!entity) {
            throw Boom.notFound('Entity not found');
        }

        if (entity.user.toString() !== userId) {
            throw Boom.forbidden('Entity does not belong to user');
        }

        // Find module definition
        const moduleDef = this.moduleDefinitions.find(
            d => d.moduleName === entity.moduleName
        );

        if (!moduleDef) {
            throw Boom.badRequest(`Module definition not found: ${entity.moduleName}`);
        }

        const ModuleDefinition = moduleDef.definition;

        // Create re-auth session (special type for re-authorization)
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        const session = new AuthorizationSession({
            sessionId,
            userId,
            entityType: entity.moduleName,
            currentStep: 1,
            maxSteps: (() => {
                if (ModuleDefinition.getAuthStepCount && typeof ModuleDefinition.getAuthStepCount === 'function') {
                    return ModuleDefinition.getAuthStepCount();
                } else if (moduleDefinition.apiClass && moduleDefinition.apiClass.getAuthStepCount && typeof moduleDefinition.apiClass.getAuthStepCount === 'function') {
                    return moduleDefinition.apiClass.getAuthStepCount();
                }
                return 1;
            })(),
            stepData: {
                entityId,  // Store entity ID to update
                credentialId: entity.credential.toString(),  // Store credential ID to update
                action: 'reauthorize'  // Mark as re-auth action
            },
            expiresAt
        });

        await this.authSessionRepository.create(session);

        // Get OAuth requirements for step 1
        const requirements = ModuleDefinition.getAuthRequirementsForStep
            ? await ModuleDefinition.getAuthRequirementsForStep(1)
            : await ModuleDefinition.getAuthorizationRequirements();

        return {
            sessionId,
            moduleType: entity.moduleName,
            entityId,
            action: 'reauthorize',
            step: 1,
            totalSteps: session.maxSteps,
            requirements
        };
    }

    /**
     * Step 2: Complete re-authorization
     *
     * Updates existing credential with new tokens, marks entity as valid
     *
     * @param {string} entityId - Entity ID being reauthorized
     * @param {string} userId - User ID (for ownership verification)
     * @param {string} sessionId - Session ID from initiate step
     * @param {Object} authData - Authorization data (OAuth code, etc.)
     * @returns {Promise<Object>} Updated entity details
     */
    async completeReauthorization(entityId, userId, sessionId, authData) {
        // Verify session
        const session = await this.authSessionRepository.findBySessionId(sessionId);

        if (!session) {
            throw Boom.badRequest('Invalid or expired session');
        }

        if (session.userId !== userId) {
            throw Boom.forbidden('Session does not belong to user');
        }

        if (session.stepData.entityId !== entityId) {
            throw Boom.badRequest('Session does not match entity');
        }

        if (session.stepData.action !== 'reauthorize') {
            throw Boom.badRequest('Session is not a re-authorization session');
        }

        if (session.isExpired()) {
            throw Boom.badRequest('Session has expired');
        }

        // Get entity and credential
        const entity = await this.moduleRepository.findEntityById(entityId);
        const credential = await this.credentialRepository.findCredentialById(
            session.stepData.credentialId
        );

        if (!entity || !credential) {
            throw Boom.notFound('Entity or credential not found');
        }

        // Find module definition
        const moduleDef = this.moduleDefinitions.find(
            d => d.moduleName === entity.moduleName
        );

        const ModuleDefinition = moduleDef.definition;

        // Exchange auth code for new tokens
        // This uses the module's standard auth flow
        const ApiClass = moduleDef.apiClass;
        const api = new ApiClass({ userId });

        // Get tokens using module's auth method
        let tokenResponse;
        if (moduleDef.requiredAuthMethods && moduleDef.requiredAuthMethods.getToken) {
            tokenResponse = await moduleDef.requiredAuthMethods.getToken(api, authData);
        } else {
            throw Boom.badImplementation('Module does not support token exchange');
        }

        // Update existing credential (don't create new)
        const credentialUpdates = {
            auth_is_valid: true,
            ...tokenResponse
        };

        await this.credentialRepository.updateCredential(
            credential.id,
            credentialUpdates
        );

        // Mark session as complete
        session.markComplete();
        await this.authSessionRepository.update(session);

        // Return updated entity
        return {
            id: entity.id,
            moduleName: entity.moduleName,
            name: entity.name,
            credentialId: credential.id,
            isValid: true,
            updatedAt: new Date()
        };
    }
}

module.exports = { ReauthorizeEntity };
