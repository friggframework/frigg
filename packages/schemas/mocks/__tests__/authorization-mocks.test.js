/**
 * @file Authorization Mocks Tests
 * @description Validates that all mock data generators produce schema-compliant data
 */

const {
    validateAuthorizationRequirements,
    validateAuthorizationResponse,
    validateAuthorizationSession,
} = require('../../index');

const {
    createOAuth2Requirements,
    createFormRequirements,
    createOTPMultiStepFlow,
    createAuthorizationSuccess,
    createAuthorizationNextStep,
    createAuthorizationSession,
    createNagarisOTPFlowMock,
    createOAuth2FlowMock,
} = require('../authorization-mocks');

describe('Authorization Mocks Schema Validation', () => {
    describe('createOAuth2Requirements', () => {
        it('should create valid OAuth2 requirements', () => {
            const requirements = createOAuth2Requirements('hubspot');
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(result.errors).toBeNull();
            expect(requirements.type).toBe('oauth2');
            expect(requirements.data.url).toContain('hubspot');
        });

        it('should support custom scopes', () => {
            const requirements = createOAuth2Requirements('salesforce', {
                scopes: ['full', 'refresh_token'],
            });
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(requirements.data.scopes).toEqual(['full', 'refresh_token']);
        });

        it('should support multi-step OAuth', () => {
            const sessionId = 'session-123';
            const requirements = createOAuth2Requirements('hubspot', {
                isMultiStep: true,
                step: 2,
                totalSteps: 3,
                sessionId,
            });
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(requirements.isMultiStep).toBe(true);
            expect(requirements.step).toBe(2);
            expect(requirements.sessionId).toBe(sessionId);
        });
    });

    describe('createFormRequirements', () => {
        it('should create valid form requirements with email/password', () => {
            const requirements = createFormRequirements('custom-api', {
                fields: ['email', 'password'],
            });
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(requirements.type).toBe('form');
            expect(requirements.data.jsonSchema.properties).toHaveProperty('email');
            expect(requirements.data.jsonSchema.properties).toHaveProperty('password');
            expect(requirements.data.jsonSchema.required).toContain('email');
            expect(requirements.data.jsonSchema.required).toContain('password');
        });

        it('should create valid OTP field', () => {
            const requirements = createFormRequirements('nagaris', {
                fields: ['otp'],
            });
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(requirements.data.jsonSchema.properties.otp).toBeDefined();
            expect(requirements.data.jsonSchema.properties.otp.pattern).toBe('^[0-9]{6}$');
            expect(requirements.data.uiSchema.otp['ui:help']).toContain('6-digit');
        });

        it('should support API key fields', () => {
            const requirements = createFormRequirements('api-service', {
                fields: ['api_key'],
            });
            const result = validateAuthorizationRequirements(requirements);

            expect(result.valid).toBe(true);
            expect(requirements.data.jsonSchema.properties).toHaveProperty('api_key');
        });
    });

    describe('createOTPMultiStepFlow', () => {
        it('should create valid multi-step flow', () => {
            const flow = createOTPMultiStepFlow('nagaris');

            // Validate step 1
            const step1Result = validateAuthorizationRequirements(flow.step1);
            expect(step1Result.valid).toBe(true);
            expect(flow.step1.step).toBe(1);
            expect(flow.step1.totalSteps).toBe(2);
            expect(flow.step1.isMultiStep).toBe(true);

            // Validate step 2
            const step2 = flow.step2('session-abc');
            const step2Result = validateAuthorizationRequirements(step2);
            expect(step2Result.valid).toBe(true);
            expect(step2.step).toBe(2);
            expect(step2.sessionId).toBe('session-abc');
        });
    });

    describe('createAuthorizationSuccess', () => {
        it('should create valid success response', () => {
            const success = createAuthorizationSuccess('hubspot');
            const result = validateAuthorizationResponse(success);

            expect(result.valid).toBe(true);
            expect(success.entity_id).toBeDefined();
            expect(success.credential_id).toBeDefined();
            expect(success.type).toBe('hubspot');
            expect(success.display).toContain('hubspot');
        });

        it('should support custom IDs', () => {
            const success = createAuthorizationSuccess('salesforce', {
                entityId: 'entity-123',
                credentialId: 'cred-456',
                display: 'My Salesforce Org',
            });
            const result = validateAuthorizationResponse(success);

            expect(result.valid).toBe(true);
            expect(success.entity_id).toBe('entity-123');
            expect(success.credential_id).toBe('cred-456');
            expect(success.display).toBe('My Salesforce Org');
        });
    });

    describe('createAuthorizationNextStep', () => {
        it('should create valid next step response', () => {
            const step2Reqs = createFormRequirements('nagaris', {
                fields: ['otp'],
                step: 2,
                totalSteps: 2,
            });

            const nextStep = createAuthorizationNextStep(2, step2Reqs);
            const result = validateAuthorizationResponse(nextStep);

            expect(result.valid).toBe(true);
            expect(nextStep.nextStep).toBe(2);
            expect(nextStep.sessionId).toBeDefined();
            expect(nextStep.requirements).toEqual(step2Reqs);
            expect(nextStep.message).toContain('step');
        });

        it('should support custom session ID and message', () => {
            const step2Reqs = createFormRequirements('nagaris', { fields: ['otp'] });
            const nextStep = createAuthorizationNextStep(2, step2Reqs, {
                sessionId: 'custom-session',
                message: 'OTP sent to your email',
            });
            const result = validateAuthorizationResponse(nextStep);

            expect(result.valid).toBe(true);
            expect(nextStep.sessionId).toBe('custom-session');
            expect(nextStep.message).toBe('OTP sent to your email');
        });
    });

    describe('createAuthorizationSession', () => {
        it('should create valid authorization session', () => {
            const session = createAuthorizationSession('user-123', 'nagaris');
            const result = validateAuthorizationSession(session);

            expect(result.valid).toBe(true);
            expect(session.userId).toBe('user-123');
            expect(session.entityType).toBe('nagaris');
            expect(session.sessionId).toBeDefined();
            expect(session.currentStep).toBe(1);
            expect(session.maxSteps).toBe(2);
            expect(session.completed).toBe(false);
        });

        it('should support custom step data and completion', () => {
            const session = createAuthorizationSession('user-456', 'hubspot', {
                currentStep: 2,
                maxSteps: 3,
                stepData: { email: 'test@example.com', domain: 'mycompany' },
                completed: true,
            });
            const result = validateAuthorizationSession(session);

            expect(result.valid).toBe(true);
            expect(session.currentStep).toBe(2);
            expect(session.maxSteps).toBe(3);
            expect(session.stepData.email).toBe('test@example.com');
            expect(session.completed).toBe(true);
        });

        it('should have valid expiration timestamp', () => {
            const session = createAuthorizationSession('user-789', 'salesforce', {
                expiresInMinutes: 30,
            });

            const now = new Date();
            const expiresAt = new Date(session.expiresAt);
            const diffMinutes = (expiresAt - now) / (60 * 1000);

            expect(diffMinutes).toBeGreaterThanOrEqual(29);
            expect(diffMinutes).toBeLessThanOrEqual(31);
        });
    });

    describe('createNagarisOTPFlowMock', () => {
        it('should create complete valid Nagaris OTP flow', () => {
            const flow = createNagarisOTPFlowMock('user-123');

            // Step 1: Get requirements
            const step1Reqs = flow.getStep1Requirements();
            const step1ReqsResult = validateAuthorizationRequirements(step1Reqs);
            expect(step1ReqsResult.valid).toBe(true);
            expect(step1Reqs.step).toBe(1);

            // Step 1: Submit
            const step1Response = flow.submitStep1({ email: flow.email });
            const step1ResponseResult = validateAuthorizationResponse(step1Response);
            expect(step1ResponseResult.valid).toBe(true);
            expect(step1Response.nextStep).toBe(2);
            expect(step1Response.sessionId).toBe(flow.sessionId);

            // Step 2: Submit
            const step2Response = flow.submitStep2({ otp: '123456' });
            const step2ResponseResult = validateAuthorizationResponse(step2Response);
            expect(step2ResponseResult.valid).toBe(true);
            expect(step2Response.entity_id).toBeDefined();
            expect(step2Response.type).toBe('nagaris');

            // Session
            const sessionResult = validateAuthorizationSession(flow.session);
            expect(sessionResult.valid).toBe(true);
            expect(flow.session.userId).toBe('user-123');
            expect(flow.session.entityType).toBe('nagaris');
        });
    });

    describe('createOAuth2FlowMock', () => {
        it('should create complete valid OAuth2 flow', () => {
            const flow = createOAuth2FlowMock('hubspot', 'user-456');

            // Get requirements
            const requirements = flow.getRequirements();
            const reqsResult = validateAuthorizationRequirements(requirements);
            expect(reqsResult.valid).toBe(true);
            expect(requirements.type).toBe('oauth2');
            expect(requirements.isMultiStep).toBe(false);

            // Handle callback
            const callbackResponse = flow.handleCallback('auth-code-123', 'state-xyz');
            const callbackResult = validateAuthorizationResponse(callbackResponse);
            expect(callbackResult.valid).toBe(true);
            expect(callbackResponse.entity_id).toBeDefined();
            expect(callbackResponse.type).toBe('hubspot');

            // No session for single-step OAuth
            expect(flow.session).toBeNull();
        });
    });
});

describe('Cross-Package Compatibility', () => {
    it('should work with @friggframework/core integration tests', () => {
        // This mock can be used in core integration tests
        const flow = createNagarisOTPFlowMock('test-user');
        const session = flow.session;

        // Core would validate session before storing
        const result = validateAuthorizationSession(session);
        expect(result.valid).toBe(true);
    });

    it('should work with @friggframework/ui component tests', () => {
        // This mock can be used in UI component tests
        const requirements = createFormRequirements('nagaris', {
            fields: ['email'],
        });

        // UI would render form based on jsonSchema
        expect(requirements.data.jsonSchema.properties.email).toBeDefined();
        expect(requirements.data.uiSchema.email).toBeDefined();
    });

    it('should work with management-ui tests', () => {
        // Management UI would display auth flows
        const oauthReqs = createOAuth2Requirements('hubspot');
        const formReqs = createFormRequirements('api-service', {
            fields: ['api_key'],
        });

        expect(oauthReqs.type).toBe('oauth2');
        expect(formReqs.type).toBe('form');
    });
});
