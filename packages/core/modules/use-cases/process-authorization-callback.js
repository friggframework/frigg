const { Module } = require('../module');
const { ModuleConstants } = require('../ModuleConstants');
const { getLogger } = require('../../logs');

const log = getLogger('frigg.modules.authorization_callback');

// Statuses considered "broken" for an integration whose credentials have just
// been successfully re-authorized. Both ERROR (system-driven auth failure) and
// DISABLED (user paused the integration) are flipped back to ENABLED when the
// user completes a new authorization flow.
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
        log.debug('Authorization callback started', {
            eventName: `${log.name}.started`,
            userId,
            entityType,
            hasCode: Boolean(params && params.code),
        });

        const moduleDefinition = this.moduleDefinitions.find((def) => {
            return entityType === def.moduleName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        // Bootstrap the Module with the existing entity (if any) so the API
        // requester is preloaded with prior tokens. This enables a refresh
        // fallback when callers lack a fresh OAuth code, and lets us match a
        // re-auth back to the existing credential record by id.
        const existingEntities =
            await this.moduleRepository.findEntitiesByUserIdAndModuleName(
                userId,
                entityType
            );
        const existingEntity =
            existingEntities && existingEntities.length > 0
                ? existingEntities[0]
                : null;

        if (existingEntity) {
            log.debug('Existing entity found', {
                eventName: `${log.name}.existing_entity_found`,
                entityId: existingEntity.id,
                credentialId: existingEntity.credential?.id,
            });
        }

        const module = new Module({
            userId,
            entity: existingEntity,
            definition: moduleDefinition,
        });

        const authType = module.apiClass.requesterType;
        log.debug('Module created', {
            eventName: `${log.name}.module_created`,
            moduleName: module.getName(),
            authType,
        });

        let tokenResponse;
        if (authType === ModuleConstants.authType.oauth2) {
            log.debug('Exchanging authorization code for token', {
                eventName: `${log.name}.token_exchanging`,
            });
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
                module.api,
                params
            );
            log.debug('Token exchange completed', {
                eventName: `${log.name}.token_exchanged`,
                tokenKeys: Object.keys(tokenResponse || {}),
            });
            // Belt-and-suspenders: persist tokens explicitly here rather than
            // relying solely on the DLGT_TOKEN_UPDATE notification chain
            // inside setTokens. The notification path remains in place but
            // has been observed to no-op silently in some prod paths,
            // leaving newly-issued tokens unsaved while the user-visible
            // OAuth flow appears to succeed.
            await this.onTokenUpdate(module, moduleDefinition, userId);
        } else {
            log.debug('Setting auth params', {
                eventName: `${log.name}.auth_params_setting`,
            });
            tokenResponse =
                await moduleDefinition.requiredAuthMethods.setAuthParams(
                    module.api,
                    params
                );
            await this.onTokenUpdate(module, moduleDefinition, userId);
        }

        log.debug('Credential persisted', {
            eventName: `${log.name}.credential_persisted`,
            credentialId: module.credential?.id,
            authIsValid: module.credential?.authIsValid,
        });

        log.debug('Testing auth', { eventName: `${log.name}.auth_testing` });
        const authRes = await module.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }
        log.debug('Auth test passed', {
            eventName: `${log.name}.auth_test_passed`,
        });

        log.debug('Fetching entity details', {
            eventName: `${log.name}.entity_details_fetching`,
        });
        const entityDetails =
            await moduleDefinition.requiredAuthMethods.getEntityDetails(
                module.api,
                params,
                tokenResponse,
                userId
            );
        log.debug('Entity details received', {
            eventName: `${log.name}.entity_details_received`,
            externalId: entityDetails.identifiers?.externalId,
        });

        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        log.debug('Finding or creating entity', {
            eventName: `${log.name}.entity_resolving`,
        });
        const persistedEntity = await this.findOrCreateEntity(
            entityDetails,
            entityType,
            module.credential.id
        );
        log.debug('Authorization callback completed', {
            eventName: `${log.name}.completed`,
            entityId: persistedEntity.id,
            credentialId: module.credential.id,
        });

        // Best-effort: a hiccup here must not fail a successful re-auth whose
        // credential + entity are already persisted. Operators can recover
        // stuck integrations manually.
        try {
            const restoredCount = await this.restoreIntegrationsForEntity(
                persistedEntity.id
            );
            log.debug('Integrations restored', {
                eventName: `${log.name}.integrations_restored`,
                entityId: persistedEntity.id,
                restoredCount,
            });
        } catch (err) {
            log.error('Failed to restore integrations after re-auth', {
                eventName: `${log.name}.integrations_restore_failed`,
                entityId: persistedEntity.id,
                error: err,
            });
        }

        return {
            credential_id: module.credential.id,
            entity_id: persistedEntity.id,
            type: module.getName(),
        };
    }

    async restoreIntegrationsForEntity(entityId) {
        if (!this.integrationRepository) return 0;
        const integrations =
            await this.integrationRepository.findIntegrationsByEntityId(
                entityId
            );
        let restored = 0;
        for (const integration of integrations) {
            if (STATUSES_RESET_ON_REAUTH.includes(integration.status)) {
                log.info('Integration restored to ENABLED after re-auth', {
                    eventName: `${log.name}.integration_restored`,
                    integrationId: integration.id,
                    previousStatus: integration.status,
                    entityId,
                });
                await this.integrationRepository.updateIntegrationStatus(
                    integration.id,
                    'ENABLED'
                );
                restored++;
            }
        }
        return restored;
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
            // Repoint the entity's credentialId when re-auth produced a
            // different credential than the one currently linked. This
            // happens when the user re-authenticates against a different
            // workspace/account of the same provider — `upsertCredential`
            // matches/creates a credential keyed by externalId, but
            // findEntity matches the entity by its own externalId, leaving
            // the entity still linked to the prior workspace's credential
            // unless we explicitly update the link.
            const existingCredentialId = existingEntity.credential?.id;
            if (
                credentialId &&
                String(existingCredentialId) !== String(credentialId)
            ) {
                log.info('Entity credential repointed after re-auth', {
                    eventName: `${log.name}.entity_credential_repointed`,
                    entityId: existingEntity.id,
                    previousCredentialId: existingCredentialId,
                    credentialId,
                });
                const updated = await this.moduleRepository.updateEntity(
                    existingEntity.id,
                    { credential: credentialId }
                );
                if (updated) return updated;
            }
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
