/**
 * Get Authorization Requirements Use Case
 * Business logic for retrieving authorization requirements for a specific step
 *
 * Responsibilities:
 * - Find module definition for entity type
 * - Determine step count (single vs multi-step)
 * - Retrieve step-specific requirements (jsonSchema, uiSchema, etc.)
 * - Return structured requirements for frontend rendering
 *
 * Supports both single-step and multi-step modules:
 * - Single-step: Uses getAuthorizationRequirements() (legacy)
 * - Multi-step: Uses getAuthRequirementsForStep(step) (new)
 *
 * @example
 * ```javascript
 * const useCase = new GetAuthorizationRequirementsUseCase({
 *     moduleDefinitions: [{ moduleName: 'nagaris', definition: NagarisDefinition }]
 * });
 *
 * // Get requirements for step 1
 * const reqs = await useCase.execute('nagaris', 1);
 * // Returns: { type: 'email', data: { jsonSchema, uiSchema }, step: 1, totalSteps: 2, isMultiStep: true }
 *
 * // Get requirements for step 2
 * const reqs = await useCase.execute('nagaris', 2);
 * // Returns: { type: 'otp', data: { jsonSchema, uiSchema }, step: 2, totalSteps: 2, isMultiStep: true }
 * ```
 */
class GetAuthorizationRequirementsUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions with structure: { moduleName, definition }
     * @param {import('./create-oauth2-session').CreateOAuth2SessionUseCase} [params.createOAuth2Session] - OAuth2 session creator
     */
    constructor({ moduleDefinitions, createOAuth2Session = null }) {
        if (!moduleDefinitions || !Array.isArray(moduleDefinitions)) {
            throw new Error('moduleDefinitions array is required');
        }
        this.moduleDefinitions = moduleDefinitions;
        this.createOAuth2Session = createOAuth2Session;
    }

    /**
     * Get authorization requirements for a specific step
     *
     * @param {string} entityType - Entity type (module name)
     * @param {number} [step=1] - Step number (1-indexed)
     * @param {Object} [redirectContext] - Context for OAuth2 redirects
     * @param {string} [redirectContext.source] - Source UI ('management-ui' | 'frigg-ui-library')
     * @param {string} [redirectContext.returnUrl] - URL to return to after auth
     * @param {string} [redirectContext.userId] - User ID for session creation
     * @returns {Promise<Object>} Requirements object with schema and metadata
     * @throws {Error} If module not found or step invalid
     */
    async execute(entityType, step = 1, redirectContext = null) {
        // Validate inputs
        if (!entityType) {
            throw new Error('entityType is required');
        }
        if (!step || step < 1) {
            throw new Error('step must be >= 1');
        }

        // Find module definition
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.moduleName === entityType
        );

        if (!moduleDefinition) {
            throw new Error(`Module definition not found: ${entityType}`);
        }


        const ModuleDefinition = moduleDefinition.definition;

        if (!ModuleDefinition) {
            throw new Error(`Module definition.definition is undefined for ${entityType}`);
        }

        // Determine step count (multi-step vs single-step)
        // Default to single-step (1) if getAuthStepCount method doesn't exist
        let stepCount = 1;
        if (ModuleDefinition && ModuleDefinition.getAuthStepCount && typeof ModuleDefinition.getAuthStepCount === 'function') {
            try {
                stepCount = ModuleDefinition.getAuthStepCount();
            } catch (error) {
                stepCount = 1; // Fallback to single-step
            }
        }

        // Validate requested step doesn't exceed max steps
        if (step > stepCount) {
            throw new Error(
                `Step ${step} exceeds maximum steps (${stepCount}) for ${entityType}`
            );
        }

        // Get requirements for this specific step
        let requirements;

        if (ModuleDefinition.getAuthRequirementsForStep) {
            // Multi-step module - use step-specific method
            requirements = await ModuleDefinition.getAuthRequirementsForStep(
                step
            );
        } else if (step === 1) {
            // Single-step module - try Definition first, then API class
            if (ModuleDefinition.getAuthorizationRequirements) {
                // Definition has custom implementation
                requirements = await ModuleDefinition.getAuthorizationRequirements();
            } else if (moduleDefinition.apiClass) {
                // Fall back to API class (for OAuth2 flows)
                // Create a minimal API instance with required parameters
                try {
                    // Construct default redirect URI from BASE_URL or BACKEND_URL
                    // Defaults to http://localhost:3001/api/oauth/callback
                    const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
                    const defaultRedirectUri = `${baseUrl}/api/oauth/callback`;

                    // Try to get OAuth2 parameters from environment
                    const clientId = process.env[`${entityType.toUpperCase()}_CLIENT_ID`] || 'your-client-id';
                    const clientSecret = process.env[`${entityType.toUpperCase()}_CLIENT_SECRET`] || 'your-client-secret';
                    const redirectUri = process.env.REDIRECT_URI || defaultRedirectUri;
                    const scope = process.env[`${entityType.toUpperCase()}_SCOPE`] || 'read';
                    const state = require('crypto').randomBytes(16).toString('hex');

                    const apiInstance = new moduleDefinition.apiClass({
                        userId: 'temp',
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri,
                        scope: scope,
                        state: state,
                        authorizationUri: `https://app.${entityType}.com/oauth/authorize`,
                        tokenUri: `https://api.${entityType}.com/oauth/token`
                    });

                    if (typeof apiInstance.getAuthorizationRequirements === 'function') {
                        requirements = await apiInstance.getAuthorizationRequirements();
                    } else {
                        throw new Error(
                            `Module ${entityType} API class does not have getAuthorizationRequirements method`
                        );
                    }
                } catch (error) {
                    throw new Error(
                        `Failed to create API instance for ${entityType}: ${error.message}`
                    );
                }
            } else {
                // Fallback: Create default OAuth2 authorization requirements

                // Create OAuth2 session if redirect context is provided
                let state, redirectUri;
                if (redirectContext && this.createOAuth2Session && redirectContext.userId) {
                    try {
                        const oauthSession = await this.createOAuth2Session.execute(
                            redirectContext.userId,
                            entityType,
                            redirectContext
                        );
                        state = oauthSession.state;
                        redirectUri = oauthSession.redirectUri;
                    } catch (error) {
                        // Fallback to simple state generation
                        const crypto = require('crypto');
                        state = crypto.randomBytes(16).toString('hex');
                        const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
                        redirectUri = process.env.REDIRECT_URI || `${baseUrl}/api/oauth/callback`;
                    }
                } else {
                    // Fallback to simple state generation
                    const crypto = require('crypto');
                    state = crypto.randomBytes(16).toString('hex');
                    const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3001';
                    redirectUri = process.env.REDIRECT_URI || `${baseUrl}/api/oauth/callback`;
                }

                // Try to get OAuth2 parameters from environment or module definition
                const clientId = process.env[`${entityType.toUpperCase()}_CLIENT_ID`] || 'your-client-id';
                const scope = process.env[`${entityType.toUpperCase()}_SCOPE`] || 'read';

                const authUrl = `https://app.${entityType}.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${state}`;

                requirements = {
                    type: 'oauth2',
                    url: authUrl,
                    data: {
                        jsonSchema: {
                            title: `${entityType} OAuth`,
                            type: 'object',
                            required: ['code'],
                            properties: {
                                code: {
                                    type: 'string',
                                    title: 'Authorization Code',
                                },
                            },
                        },
                    },
                };
            }
        } else {
            throw new Error(
                `Module ${entityType} does not support step ${step}`
            );
        }

        // Return enriched requirements with metadata
        return {
            ...requirements,
            step,
            totalSteps: stepCount,
            isMultiStep: stepCount > 1,
        };
    }
}

module.exports = { GetAuthorizationRequirementsUseCase };
