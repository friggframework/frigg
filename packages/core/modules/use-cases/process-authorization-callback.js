const { Module } = require('../module');
const { ModuleConstants } = require('../ModuleConstants');

// Statuses considered "broken" for an integration whose credentials have just
// been successfully re-authorized. Both ERROR (system-driven auth failure) and
// DISABLED (user paused the integration) are flipped back to ENABLED when the
// user completes a new authorization flow. See the Gap C fix in the RCA for the
// reasoning.
const STATUSES_RESET_ON_REAUTH = ['ERROR', 'DISABLED'];

class ProcessAuthorizationCallback {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/module-repository-factory').ModuleRepositoryInterface} params.moduleRepository - Repository for module data operations.
     * @param {import('../../credential/repositories/credential-repository-factory').CredentialRepositoryInterface} params.credentialRepository - Repository for credential data operations.
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions.
     * @param {import('../../integrations/repositories/integration-repository-interface').IntegrationRepositoryInterface} [params.integrationRepository] - Repository for integration data operations. When provided, integrations in a broken state linked to the re-authorized entity are restored to ENABLED.
     */
    constructor({
        moduleRepository,
        credentialRepository,
        moduleDefinitions,
        integrationRepository,
    }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.moduleDefinitions = moduleDefinitions;
        this.integrationRepository = integrationRepository;
    }

    async execute(userId, entityType, params) {
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            return entityType === def.moduleName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        // todo: check if we need to pass entity to Module, right now it's null
        let entity = null;

        const module = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        let tokenResponse;
        if (module.apiClass.requesterType === ModuleConstants.authType.oauth2) {
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
                module.api,
                params
            );
        } else {
            tokenResponse =
                await moduleDefinition.requiredAuthMethods.setAuthParams(
                    module.api,
                    params
                );
            await this.onTokenUpdate(module, moduleDefinition, userId);
        }

        const authRes = await module.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }

        const entityDetails =
            await moduleDefinition.requiredAuthMethods.getEntityDetails(
                module.api,
                params,
                tokenResponse,
                userId
            );

        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        const persistedEntity = await this.findOrCreateEntity(
            entityDetails,
            entityType,
            module.credential.id
        );

        // Best-effort: a hiccup here must not fail a successful re-auth whose
        // credential + entity are already persisted. Operators can recover
        // stuck integrations manually.
        try {
            await this.restoreIntegrationsForEntity(persistedEntity.id);
        } catch (err) {
            console.error(
                `[Frigg] Failed to restore integrations for entity ${persistedEntity.id} after successful re-auth — manual intervention may be needed`,
                err
            );
        }

        return {
            credential_id: module.credential.id,
            entity_id: persistedEntity.id,
            type: module.getName(),
        };
    }

    async restoreIntegrationsForEntity(entityId) {
        if (!this.integrationRepository) return;
        const integrations =
            await this.integrationRepository.findIntegrationsByEntityId(
                entityId
            );
        for (const integration of integrations) {
            if (STATUSES_RESET_ON_REAUTH.includes(integration.status)) {
                console.log(
                    `[Frigg] Restoring integration ${integration.id} from ${integration.status} to ENABLED after successful re-auth (entityId=${entityId})`
                );
                await this.integrationRepository.updateIntegrationStatus(
                    integration.id,
                    'ENABLED'
                );
            }
        }
    }

    async onTokenUpdate(module, moduleDefinition, userId) {
        const credentialDetails =
            await moduleDefinition.requiredAuthMethods.getCredentialDetails(
                module.api,
                userId
            );

        Object.assign(
            credentialDetails.details,
            module.apiParamsFromCredential(module.api)
        );
        credentialDetails.details.authIsValid = true;

        const persisted = await this.credentialRepository.upsertCredential(credentialDetails);
        module.credential = persisted;
    }

    async findOrCreateEntity(entityDetails, moduleName, credentialId) {
        const { identifiers, details } = entityDetails;

        // Support both 'user' and 'userId' field names from module definitions
        // Some modules use 'user' (legacy), others use 'userId' (newer pattern)
        const userId = identifiers.user || identifiers.userId;

        if (!userId) {
            throw new Error(
                `Module definition for ${moduleName} must return 'user' or 'userId' in identifiers from getEntityDetails(). ` +
                    `Without userId, entity lookup would match across all users (security issue).`
            );
        }

        const existingEntity = await this.moduleRepository.findEntity({
            externalId: identifiers.externalId,
            user: userId,
            moduleName: moduleName,
        });

        if (existingEntity) {
            return existingEntity;
        }

        return await this.moduleRepository.createEntity({
            ...identifiers,
            ...details,
            moduleName: moduleName,
            credential: credentialId,
        });
    }
}

module.exports = { ProcessAuthorizationCallback };
