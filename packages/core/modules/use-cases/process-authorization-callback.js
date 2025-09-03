const { Module } = require('../module');
const { ModuleConstants } = require('../ModuleConstants');

class ProcessAuthorizationCallback {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../module-repository').ModuleRepository} params.moduleRepository - Repository for module data operations.
     * @param {import('../../credential/credential-repository').CredentialRepository} params.credentialRepository - Repository for credential data operations.
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

        // todo: check if we need to pass entity to Module, right now it's null
        let entity = null;

        const module = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        let tokenResponse;
        if (module.apiClass.requesterType === ModuleConstants.authType.oauth2) {
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(module.api, params);
        } else {
            tokenResponse = await moduleDefinition.requiredAuthMethods.setAuthParams(module.api, params);
            await this.onTokenUpdate(module, moduleDefinition, userId);
        }

        const authRes = await module.testAuth();
        if (!authRes) {
            throw new Error('Authorization failed');
        }

        const entityDetails = await moduleDefinition.requiredAuthMethods.getEntityDetails(
            module.api,
            params,
            tokenResponse,
            userId
        );

        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        const persistedEntity = await this.findOrCreateEntity(entityDetails, entityType, module.credential.id);

        return {
            credential_id: module.credential.id,
            entity_id: persistedEntity.id,
            type: module.getName(),
        };
    }

    async onTokenUpdate(module, moduleDefinition, userId) {
        const credentialDetails = await moduleDefinition.requiredAuthMethods.getCredentialDetails(
            module.api,
            userId
        );

        Object.assign(
            credentialDetails.details,
            module.apiParamsFromCredential(module.api)
        );
        credentialDetails.details.auth_is_valid = true;

        await this.credentialRepository.upsertCredential(credentialDetails);
    }

    async findOrCreateEntity(entityDetails, moduleName, credentialId) {
        const { identifiers, details } = entityDetails;

        const existingEntity = await this.moduleRepository.findEntity({
            externalId: identifiers.externalId,
            user: identifiers.user,
            moduleName: moduleName,
        });

        if (existingEntity) {
            return existingEntity;
        }

        return await this.moduleRepository.createEntity({
            ...identifiers,
            ...details,
            moduleName: moduleName,
            credential: credentialId
        });
    }
}

module.exports = { ProcessAuthorizationCallback };