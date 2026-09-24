/**
 * @file Authorization Mock Data Generators
 * @description Canonical mock data for authorization flows
 *
 * These mocks are schema-compliant and can be used across:
 * - @friggframework/core tests
 * - @friggframework/ui tests
 * - @friggframework/devtools/management-ui tests
 * - Integration tests
 *
 * Usage:
 * ```js
 * const { createOAuth2Requirements, createFormRequirements } = require('@friggframework/schemas/mocks/authorization-mocks');
 *
 * const mockData = createOAuth2Requirements('hubspot');
 * ```
 */

const crypto = require('crypto');

/**
 * Generate a unique session ID
 */
function generateSessionId() {
    return crypto.randomUUID();
}

/**
 * Create OAuth2 authorization requirements
 * @param {string} moduleType - Module type (e.g., 'hubspot', 'salesforce')
 * @param {object} options - Additional options
 * @returns {object} OAuth2 requirements object
 */
function createOAuth2Requirements(moduleType, options = {}) {
    const {
        scopes = ['read', 'write'],
        isMultiStep = false,
        step = 1,
        totalSteps = 1,
        sessionId = null
    } = options;

    const requirements = {
        type: 'oauth2',
        step,
        totalSteps,
        isMultiStep,
        data: {
            url: `https://auth.${moduleType}.com/oauth/authorize?client_id=abc123&redirect_uri=http://localhost:3000/callback&state=xyz`,
            scopes
        }
    };

    if (sessionId) {
        requirements.sessionId = sessionId;
    }

    return requirements;
}

/**
 * Create form-based authorization requirements
 * @param {string} moduleType - Module type
 * @param {object} options - Additional options
 * @returns {object} Form requirements object
 */
function createFormRequirements(moduleType, options = {}) {
    const {
        fields = ['email', 'password'],
        isMultiStep = false,
        step = 1,
        totalSteps = 1,
        sessionId = null
    } = options;

    const properties = {};
    const required = [];

    // Build JSON schema properties
    fields.forEach(field => {
        if (field === 'email') {
            properties.email = {
                type: 'string',
                format: 'email',
                title: 'Email Address'
            };
            required.push('email');
        } else if (field === 'password') {
            properties.password = {
                type: 'string',
                title: 'Password',
                minLength: 6
            };
            required.push('password');
        } else if (field === 'api_key') {
            properties.api_key = {
                type: 'string',
                title: 'API Key'
            };
            required.push('api_key');
        } else if (field === 'otp') {
            properties.otp = {
                type: 'string',
                title: 'One-Time Password',
                pattern: '^[0-9]{6}$'
            };
            required.push('otp');
        } else {
            properties[field] = {
                type: 'string',
                title: field.charAt(0).toUpperCase() + field.slice(1)
            };
        }
    });

    const requirements = {
        type: 'form',
        step,
        totalSteps,
        isMultiStep,
        data: {
            jsonSchema: {
                title: `Connect ${moduleType}`,
                description: `Enter your ${moduleType} credentials`,
                type: 'object',
                required,
                properties
            },
            uiSchema: {
                email: {
                    'ui:placeholder': 'your.email@company.com'
                },
                password: {
                    'ui:widget': 'password'
                },
                otp: {
                    'ui:placeholder': '123456',
                    'ui:help': 'Enter the 6-digit code sent to your email'
                }
            }
        }
    };

    if (sessionId) {
        requirements.sessionId = sessionId;
    }

    return requirements;
}

/**
 * Create multi-step OTP authorization flow (like Nagaris)
 * @param {string} moduleType - Module type
 * @returns {object} Multi-step requirements
 */
function createOTPMultiStepFlow(moduleType = 'nagaris') {
    return {
        step1: createFormRequirements(moduleType, {
            fields: ['email'],
            isMultiStep: true,
            step: 1,
            totalSteps: 2
        }),
        step2: (sessionId) => createFormRequirements(moduleType, {
            fields: ['otp'],
            isMultiStep: true,
            step: 2,
            totalSteps: 2,
            sessionId
        })
    };
}

/**
 * Create authorization success response
 * @param {string} moduleType - Module type
 * @param {object} options - Additional options
 * @returns {object} Authorization success response
 */
function createAuthorizationSuccess(moduleType, options = {}) {
    const {
        entityId = crypto.randomUUID(),
        credentialId = crypto.randomUUID(),
        display = `My ${moduleType} Account`
    } = options;

    return {
        entity_id: entityId,
        credential_id: credentialId,
        type: moduleType,
        display
    };
}

/**
 * Create authorization next step response
 * @param {number} nextStep - Next step number
 * @param {object} requirements - Requirements for next step
 * @param {object} options - Additional options
 * @returns {object} Next step response
 */
function createAuthorizationNextStep(nextStep, requirements, options = {}) {
    const {
        sessionId = generateSessionId(),
        message = `Step ${nextStep - 1} completed. Proceed to step ${nextStep}.`
    } = options;

    return {
        nextStep,
        sessionId,
        requirements,
        message
    };
}

/**
 * Create authorization session object
 * @param {string} userId - User ID
 * @param {string} entityType - Entity/module type
 * @param {object} options - Additional options
 * @returns {object} Authorization session
 */
function createAuthorizationSession(userId, entityType, options = {}) {
    const {
        currentStep = 1,
        maxSteps = 2,
        stepData = {},
        expiresInMinutes = 15,
        completed = false
    } = options;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60000);

    return {
        sessionId: generateSessionId(),
        userId,
        entityType,
        currentStep,
        maxSteps,
        stepData,
        expiresAt: expiresAt.toISOString(),
        completed,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };
}

/**
 * Create a complete Nagaris OTP flow mock
 * @param {string} userId - User ID
 * @returns {object} Complete flow mock with step functions
 */
function createNagarisOTPFlowMock(userId = 'user123') {
    const sessionId = generateSessionId();
    const email = 'test@example.com';

    return {
        // Step 1: Get requirements (email)
        getStep1Requirements: () => createFormRequirements('nagaris', {
            fields: ['email'],
            isMultiStep: true,
            step: 1,
            totalSteps: 2
        }),

        // Step 1: Submit email, get next step
        submitStep1: (emailData) => {
            const step2Reqs = createFormRequirements('nagaris', {
                fields: ['otp'],
                isMultiStep: true,
                step: 2,
                totalSteps: 2,
                sessionId
            });

            return createAuthorizationNextStep(2, step2Reqs, {
                sessionId,
                message: 'OTP sent to your email. Please check your inbox.'
            });
        },

        // Step 2: Submit OTP, get success
        submitStep2: (otpData) => {
            return createAuthorizationSuccess('nagaris', {
                display: `Nagaris Account (${email})`
            });
        },

        // Session object
        session: createAuthorizationSession(userId, 'nagaris', {
            currentStep: 1,
            maxSteps: 2,
            stepData: { email }
        }),

        // Utility
        sessionId,
        email
    };
}

/**
 * Create a complete OAuth2 flow mock
 * @param {string} moduleType - Module type (e.g., 'hubspot')
 * @param {string} userId - User ID
 * @returns {object} Complete OAuth flow mock
 */
function createOAuth2FlowMock(moduleType, userId = 'user123') {
    return {
        // Get initial requirements
        getRequirements: () => createOAuth2Requirements(moduleType),

        // OAuth callback with code
        handleCallback: (code, state) => {
            return createAuthorizationSuccess(moduleType, {
                display: `My ${moduleType} Account`
            });
        },

        // Session (single-step OAuth doesn't need session)
        session: null
    };
}

module.exports = {
    // Generators
    generateSessionId,
    createOAuth2Requirements,
    createFormRequirements,
    createOTPMultiStepFlow,
    createAuthorizationSuccess,
    createAuthorizationNextStep,
    createAuthorizationSession,

    // Complete flow mocks
    createNagarisOTPFlowMock,
    createOAuth2FlowMock,
};
