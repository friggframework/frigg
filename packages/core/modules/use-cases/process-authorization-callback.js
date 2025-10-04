const { Module } = require('../module');
const { ModuleConstants } = require('../ModuleConstants');
const { OAuthParamsAdapterFactory } = require('../adapters/oauth-params-adapter');

class ProcessAuthorizationCallback {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/module-repository-factory').ModuleRepositoryInterface} params.moduleRepository - Repository for module data operations.
     * @param {import('../../credential/repositories/credential-repository-factory').CredentialRepositoryInterface} params.credentialRepository - Repository for credential data operations.
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions.
     * @param {import('../adapters/oauth-params-adapter').OAuthParamsAdapterInterface} params.oauthParamsAdapter - Optional adapter for transforming OAuth params (defaults to v1).
     */
    constructor({ moduleRepository, credentialRepository, moduleDefinitions, oauthParamsAdapter = null }) {
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.moduleDefinitions = moduleDefinitions;
        // ✅ Dependency Injection: Use provided adapter or create default
        this.oauthParamsAdapter = oauthParamsAdapter || OAuthParamsAdapterFactory.create('v1');
    }

    async execute(userId, entityType, params) {
        console.log('[ProcessAuthorizationCallback] Received params:', {
            userId,
            entityType,
            paramsType: typeof params,
            paramsKeys: params ? Object.keys(params) : 'NULL',
            paramsValues: params
        });

        const moduleDefWrapper = this.moduleDefinitions.find((def) => {
            return entityType === def.moduleName;
        });

        if (!moduleDefWrapper) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        // Unwrap the actual definition from {moduleName, definition} structure
        const moduleDefinition = moduleDefWrapper.definition || moduleDefWrapper;

        // Fix redirect_uri if REDIRECT_URI env var is not set
        // This prevents "undefined/modulename" in the redirect URI
        if (moduleDefinition.env && moduleDefinition.env.redirect_uri) {
            const redirectUri = moduleDefinition.env.redirect_uri;
            // Check if redirect_uri contains "undefined" (happens when env var is not set)
            if (redirectUri.includes('undefined')) {
                const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
                // Extract the module-specific suffix (e.g., "/hubspot" from "undefined/hubspot")
                const suffix = redirectUri.replace('undefined', '');
                moduleDefinition.env.redirect_uri = `${baseUrl}/api/oauth/callback`;
                console.log(`[DEBUG] Fixed redirect_uri from "${redirectUri}" to "${moduleDefinition.env.redirect_uri}"`);
            }
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
            // ✅ HEXAGONAL ARCHITECTURE: Use adapter to transform params
            // Adapter handles module-specific param structure expectations
            const adaptedParams = this.oauthParamsAdapter.transform(params);

            console.log('[ProcessAuthorizationCallback] About to call getToken with adapted params:', {
                originalParams: params,
                adaptedParams,
                adapterType: this.oauthParamsAdapter.constructor.name
            });

            tokenResponse = await moduleDefinition.requiredAuthMethods.getToken(
                module.api,
                adaptedParams
            );

            console.log('[ProcessAuthorizationCallback] getToken returned:', {
                tokenResponseKeys: tokenResponse ? Object.keys(tokenResponse) : 'NULL'
            });
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
            credential: credentialId,
        });
    }
}

module.exports = { ProcessAuthorizationCallback };
