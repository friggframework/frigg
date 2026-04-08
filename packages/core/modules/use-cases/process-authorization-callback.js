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
        console.log(`[Frigg][OAuth] Starting callback for entityType=${entityType}, userId=${userId}`);

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

        const authType = module.apiClass.requesterType;
        console.log(`[Frigg][OAuth] Module created: name=${module.getName()}, authType=${authType}`);

        let tokenResponse;
        if (authType === ModuleConstants.authType.oauth2) {
            console.log(`[Frigg][OAuth] Exchanging authorization code for token...`);
            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
                module.api,
                params
            );
            console.log(`[Frigg][OAuth] Token exchange successful, keys: ${Object.keys(tokenResponse || {}).join(', ')}`);
        } else {
            console.log(`[Frigg][OAuth] Setting auth params (non-OAuth2)...`);
            tokenResponse =
                await moduleDefinition.requiredAuthMethods.setAuthParams(
                    module.api,
                    params
                );
            await this.onTokenUpdate(module, moduleDefinition, userId);
            console.log(`[Frigg][OAuth] Auth params set and credential persisted`);
        }

        console.log(`[Frigg][OAuth] Testing auth...`);
        const authRes = await module.testAuth();
        if (!authRes) {
            console.error(`[Frigg][OAuth] testAuth() returned false — authorization failed`);
            throw new Error('Authorization failed');
        }
        console.log(`[Frigg][OAuth] Auth test passed`);

        console.log(`[Frigg][OAuth] Fetching entity details...`);
        const entityDetails =
            await moduleDefinition.requiredAuthMethods.getEntityDetails(
                module.api,
                params,
                tokenResponse,
                userId
            );
        console.log(`[Frigg][OAuth] Entity details received: identifiers=${JSON.stringify(entityDetails.identifiers)}`);

        Object.assign(
            entityDetails.details,
            module.apiParamsFromEntity(module.api)
        );

        console.log(`[Frigg][OAuth] Finding or creating entity...`);
        const persistedEntity = await this.findOrCreateEntity(
            entityDetails,
            entityType,
            module.credential.id
        );
        console.log(`[Frigg][OAuth] Done — entity_id=${persistedEntity.id}, credential_id=${module.credential.id}`);

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
