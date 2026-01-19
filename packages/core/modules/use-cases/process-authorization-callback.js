const { Module } = require('../module');
const { ModuleConstants } = require('../ModuleConstants');

class ProcessAuthorizationCallback {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/module-repository-factory').ModuleRepositoryInterface} params.moduleRepository - Repository for module data operations.
     * @param {import('../../credential/repositories/credential-repository-factory').CredentialRepositoryInterface} params.credentialRepository - Repository for credential data operations.
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions.
     */
    constructor({ moduleRepository, credentialRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.moduleDefinitions = moduleDefinitions;
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

        console.log('[Auth] ProcessAuthorizationCallback', {
            entityType,
            moduleName: moduleDefinition.moduleName,
            paramsKeys: params ? Object.keys(params) : [],
            userId,
        });

        // todo: check if we need to pass entity to Module, right now it's null
        let entity = null;

        const module = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        let tokenResponse;
        if (module.apiClass.requesterType === ModuleConstants.authType.oauth2) {
            console.log('[Auth] OAuth2 flow detected', {
                moduleName: moduleDefinition.moduleName,
            });
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
                module.api,
                params
            );
        } else {
            console.log('[Auth] Non-OAuth flow detected', {
                moduleName: moduleDefinition.moduleName,
            });
            tokenResponse =
                await moduleDefinition.requiredAuthMethods.setAuthParams(
                    module.api,
                    params
                );
            await this.onTokenUpdate(module, moduleDefinition, userId);
        }

        if (tokenResponse && typeof tokenResponse === 'object') {
            console.log('[Auth] Token response keys', {
                moduleName: moduleDefinition.moduleName,
                keys: Object.keys(tokenResponse),
            });
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

        return {
            credential_id: module.credential.id,
            entity_id: persistedEntity.id,
            type: module.getName(),
        };
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
