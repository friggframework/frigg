/**
 * Test Helpers for Multi-Step Authorization Testing
 * Provides utilities for creating test data, mocking modules, and helper functions
 */

const crypto = require('crypto');
const { AuthorizationSession } = require('../../domain/entities/AuthorizationSession');

/**
 * Mock Nagaris Module Definition (Multi-Step: OTP Flow)
 * Simulates a 2-step authentication flow: email → OTP
 */
class MockNagarisDefinition {
    static getName() {
        return 'nagaris';
    }

    static getAuthStepCount() {
        return 2;
    }

    static async getAuthRequirementsForStep(step = 1) {
        if (step === 1) {
            return {
                type: 'email',
                data: {
                    jsonSchema: {
                        title: 'Nagaris Authentication - Step 1',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address',
                            },
                        },
                    },
                    uiSchema: {
                        email: {
                            'ui:placeholder': 'your.email@company.com',
                            'ui:help': 'Enter your Nagaris account email',
                        },
                    },
                },
            };
        }

        if (step === 2) {
            return {
                type: 'otp',
                data: {
                    jsonSchema: {
                        title: 'Verify OTP Code',
                        type: 'object',
                        required: ['email', 'otp'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email',
                                readOnly: true,
                            },
                            otp: {
                                type: 'string',
                                title: 'Verification Code',
                                minLength: 6,
                                maxLength: 6,
                            },
                        },
                    },
                    uiSchema: {
                        email: {
                            'ui:readonly': true,
                        },
                        otp: {
                            'ui:placeholder': '000000',
                            'ui:help':
                                'Enter the 6-digit code sent to your email',
                        },
                    },
                },
            };
        }

        throw new Error(`Step ${step} not defined for Nagaris`);
    }

    static async processAuthorizationStep(api, step, stepData, sessionData = {}) {
        if (step === 1) {
            // Step 1: Request OTP
            const { email } = stepData;

            // Simulate API call to request OTP
            await api.requestEmailLogin(email);

            return {
                nextStep: 2,
                stepData: { email }, // Store for next step
                message: 'OTP sent to your email',
            };
        }

        if (step === 2) {
            // Step 2: Verify OTP and complete auth
            const { email, otp } = stepData;

            // Simulate API call to verify OTP
            const authResponse = await api.verifyOtp(email, otp);

            return {
                completed: true,
                authData: authResponse,
            };
        }

        throw new Error(`Step ${step} not implemented for Nagaris`);
    }
}

/**
 * Mock HubSpot Module Definition (Single-Step: OAuth)
 * Simulates standard OAuth2 flow
 */
class MockHubSpotDefinition {
    static getName() {
        return 'hubspot';
    }

    static getAuthStepCount() {
        return 1;
    }

    static async getAuthorizationRequirements() {
        return {
            type: 'oauth2',
            url: 'https://app.hubspot.com/oauth/authorize?client_id=test&redirect_uri=http://localhost/callback',
            data: {
                jsonSchema: {
                    title: 'HubSpot OAuth',
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

    static async getAuthRequirementsForStep(step = 1) {
        if (step === 1) {
            return this.getAuthorizationRequirements();
        }
        throw new Error(`Step ${step} not defined for HubSpot`);
    }

    static async processAuthorizationStep(api, step, stepData, sessionData = {}) {
        if (step === 1) {
            const { code } = stepData;
            const authResponse = await api.exchangeCode(code);

            return {
                completed: true,
                authData: authResponse,
            };
        }

        throw new Error(`Step ${step} not implemented for HubSpot`);
    }
}

/**
 * Mock Slack Module Definition (Multi-Step: OAuth + Workspace Selection)
 * Simulates OAuth followed by workspace/channel selection
 */
class MockSlackDefinition {
    static getName() {
        return 'slack';
    }

    static getAuthStepCount() {
        return 2;
    }

    static async getAuthRequirementsForStep(step = 1) {
        if (step === 1) {
            return {
                type: 'oauth2',
                url: 'https://slack.com/oauth/v2/authorize',
                data: {
                    jsonSchema: {
                        title: 'Slack OAuth',
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

        if (step === 2) {
            return {
                type: 'selection',
                data: {
                    jsonSchema: {
                        title: 'Select Workspace',
                        type: 'object',
                        required: ['workspaceId'],
                        properties: {
                            workspaceId: {
                                type: 'string',
                                title: 'Workspace',
                                enum: ['T123', 'T456'],
                                enumNames: ['Workspace A', 'Workspace B'],
                            },
                        },
                    },
                },
            };
        }

        throw new Error(`Step ${step} not defined for Slack`);
    }

    static async processAuthorizationStep(api, step, stepData, sessionData = {}) {
        if (step === 1) {
            const { code } = stepData;
            const tokens = await api.exchangeCode(code);

            return {
                nextStep: 2,
                stepData: { tokens },
                message: 'OAuth complete, select workspace',
            };
        }

        if (step === 2) {
            const { workspaceId } = stepData;
            const { tokens } = sessionData;

            return {
                completed: true,
                authData: {
                    ...tokens,
                    workspaceId,
                },
            };
        }

        throw new Error(`Step ${step} not implemented for Slack`);
    }
}

/**
 * Mock API Classes
 */
class MockNagarisApi {
    constructor({ userId }) {
        this.userId = userId;
    }

    async requestEmailLogin(email) {
        // Simulate OTP request
        return { success: true, message: 'OTP sent' };
    }

    async verifyOtp(email, otp) {
        // Simulate OTP verification
        if (otp === '000000') {
            throw new Error('Invalid OTP');
        }

        return {
            access_token: 'mock_access_token_123',
            refresh_token: 'mock_refresh_token_456',
            expires_in: 3600,
            user: {
                id: 'nagaris_user_123',
                email,
            },
        };
    }
}

class MockHubSpotApi {
    constructor({ userId }) {
        this.userId = userId;
    }

    async exchangeCode(code) {
        if (!code) {
            throw new Error('Authorization code required');
        }

        return {
            access_token: 'hubspot_access_token',
            refresh_token: 'hubspot_refresh_token',
            expires_in: 21600,
        };
    }
}

class MockSlackApi {
    constructor({ userId }) {
        this.userId = userId;
    }

    async exchangeCode(code) {
        if (!code) {
            throw new Error('Authorization code required');
        }

        return {
            access_token: 'slack_access_token',
            team_id: 'T123',
        };
    }
}

/**
 * Test Authorization Session Repository
 * In-memory implementation for testing
 */
class TestAuthorizationSessionRepository {
    constructor() {
        this.sessions = new Map();
    }

    async create(session) {
        this.sessions.set(session.sessionId, { ...session });
        return session;
    }

    async findBySessionId(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        // Filter out expired
        if (session.expiresAt < new Date()) {
            return null;
        }

        return session;
    }

    async findActiveSession(userId, entityType) {
        for (const session of this.sessions.values()) {
            if (
                session.userId === userId &&
                session.entityType === entityType &&
                !session.completed &&
                session.expiresAt > new Date()
            ) {
                return session;
            }
        }
        return null;
    }

    async update(session) {
        this.sessions.set(session.sessionId, { ...session });
        return session;
    }

    async deleteExpired() {
        const now = new Date();
        let count = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                this.sessions.delete(sessionId);
                count++;
            }
        }

        return count;
    }

    // Test helpers
    clear() {
        this.sessions.clear();
    }

    getAllSessions() {
        return Array.from(this.sessions.values());
    }
}

/**
 * Test Module Repository
 */
class TestModuleRepository {
    constructor() {
        this.entities = new Map();
    }

    addEntity(entity) {
        this.entities.set(entity.id, entity);
    }

    async findEntityById(id) {
        return this.entities.get(id);
    }

    async findEntitiesByIds(ids) {
        return ids.map((id) => this.entities.get(id)).filter(Boolean);
    }

    async findEntity(filter) {
        if (!filter || typeof filter !== 'object') {
            return null;
        }

        if (filter.id && this.entities.has(filter.id)) {
            return this.entities.get(filter.id);
        }

        for (const entity of this.entities.values()) {
            if (filter.externalId && entity.externalId === filter.externalId) {
                return entity;
            }
            if (filter.user && entity.user === filter.user) {
                return entity;
            }
        }

        return null;
    }

    clear() {
        this.entities.clear();
    }
}

/**
 * Test Credential Repository
 */
class TestCredentialRepository {
    constructor() {
        this.credentials = new Map();
    }

    addCredential(credential) {
        this.credentials.set(credential.id, credential);
    }

    async findCredentialById(id) {
        return this.credentials.get(id);
    }

    async updateCredential(id, updates) {
        const credential = this.credentials.get(id);
        if (!credential) {
            throw new Error('Credential not found');
        }

        const updated = { ...credential, ...updates };
        this.credentials.set(id, updated);
        return updated;
    }

    clear() {
        this.credentials.clear();
    }
}

/**
 * Helper Functions
 */

/**
 * Create a test authorization session
 */
function createTestSession({
    sessionId = crypto.randomUUID(),
    userId = 'test-user-123',
    entityType = 'nagaris',
    currentStep = 1,
    maxSteps = 2,
    stepData = {},
    expirationMinutes = 15,
    completed = false,
} = {}) {
    return new AuthorizationSession({
        sessionId,
        userId,
        entityType,
        currentStep,
        maxSteps,
        stepData,
        expiresAt: new Date(Date.now() + expirationMinutes * 60 * 1000),
        completed,
    });
}

/**
 * Create expired session for testing
 */
function createExpiredSession(overrides = {}) {
    return createTestSession({
        ...overrides,
        expirationMinutes: -1, // Already expired
    });
}

/**
 * Create a test entity
 */
function createTestEntity({
    id = crypto.randomUUID(),
    moduleName = 'nagaris',
    user = 'test-user-123',
    credential = crypto.randomUUID(),
    name = 'Test Entity',
    externalId = `ext_${Date.now()}`,
} = {}) {
    return {
        id,
        moduleName,
        user,
        credential,
        name,
        externalId,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Create a test credential
 */
function createTestCredential({
    id = crypto.randomUUID(),
    user = 'test-user-123',
    auth_is_valid = true,
    access_token = 'test_access_token',
    refresh_token = 'test_refresh_token',
} = {}) {
    return {
        id,
        user,
        auth_is_valid,
        access_token,
        refresh_token,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Invalidate a credential (simulate auth failure)
 */
function invalidateCredential(credential) {
    return {
        ...credential,
        auth_is_valid: false,
        access_token: null,
        refresh_token: null,
    };
}

/**
 * Get module definitions for testing
 */
function getTestModuleDefinitions() {
    return [
        {
            moduleName: 'nagaris',
            definition: MockNagarisDefinition,
            apiClass: MockNagarisApi,
            requiredAuthMethods: {
                getToken: async (api, authData) => {
                    return await api.verifyOtp(
                        authData.email,
                        authData.otp
                    );
                },
            },
        },
        {
            moduleName: 'hubspot',
            definition: MockHubSpotDefinition,
            apiClass: MockHubSpotApi,
            requiredAuthMethods: {
                getToken: async (api, authData) => {
                    return await api.exchangeCode(authData.code);
                },
            },
        },
        {
            moduleName: 'slack',
            definition: MockSlackDefinition,
            apiClass: MockSlackApi,
            requiredAuthMethods: {
                getToken: async (api, authData) => {
                    return await api.exchangeCode(authData.code);
                },
            },
        },
    ];
}

module.exports = {
    // Mock Definitions
    MockNagarisDefinition,
    MockHubSpotDefinition,
    MockSlackDefinition,

    // Mock APIs
    MockNagarisApi,
    MockHubSpotApi,
    MockSlackApi,

    // Test Repositories
    TestAuthorizationSessionRepository,
    TestModuleRepository,
    TestCredentialRepository,

    // Helper Functions
    createTestSession,
    createExpiredSession,
    createTestEntity,
    createTestCredential,
    invalidateCredential,
    getTestModuleDefinitions,
};
