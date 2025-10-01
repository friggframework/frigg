const {IntegrationValidator} = require('../../../domain/services/IntegrationValidator');
const {Integration} = require('../../../domain/entities/Integration');
const {IntegrationName} = require('../../../domain/value-objects/IntegrationName');

// Mock repository
class MockIntegrationRepository {
    constructor() {
        this.integrations = new Map();
    }

    async exists(name) {
        const nameStr = typeof name === 'string' ? name : name.value;
        return this.integrations.has(nameStr);
    }

    addIntegration(name) {
        this.integrations.set(name, true);
    }
}

describe('IntegrationValidator', () => {
    let validator;
    let mockRepository;

    beforeEach(() => {
        mockRepository = new MockIntegrationRepository();
        validator = new IntegrationValidator(mockRepository);
    });

    describe('validateUniqueness', () => {
        test('passes when integration does not exist', async () => {
            const name = new IntegrationName('new-integration');
            const result = await validator.validateUniqueness(name);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when integration already exists', async () => {
            mockRepository.addIntegration('existing-integration');

            const name = new IntegrationName('existing-integration');
            const result = await validator.validateUniqueness(name);

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('already exists');
        });
    });

    describe('validateDomainRules', () => {
        test('passes for valid API integration', () => {
            const integration = Integration.create({
                name: 'test-api',
                displayName: 'Test API',
                description: 'Test',
                type: 'api',
                category: 'CRM',
                capabilities: {
                    auth: ['oauth2']
                }
            });

            const result = validator.validateDomainRules(integration);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when webhook integration has no webhooks capability', () => {
            const integration = Integration.create({
                name: 'test-webhook',
                displayName: 'Test Webhook',
                description: 'Test',
                type: 'webhook',
                category: 'CRM',
                capabilities: {
                    webhooks: false
                }
            });

            const result = validator.validateDomainRules(integration);

            expect(result.isValid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('Webhook integrations must have webhooks capability');
        });

        test('passes when webhook integration has webhooks capability', () => {
            const integration = Integration.create({
                name: 'test-webhook',
                displayName: 'Test Webhook',
                description: 'Test',
                type: 'webhook',
                category: 'CRM',
                capabilities: {
                    webhooks: true
                }
            });

            const result = validator.validateDomainRules(integration);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('validate', () => {
        test('passes for valid new integration', async () => {
            const integration = Integration.create({
                name: 'new-integration',
                displayName: 'New Integration',
                description: 'A new integration',
                type: 'api',
                category: 'CRM',
                capabilities: {}
            });

            const result = await validator.validate(integration);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when integration already exists', async () => {
            mockRepository.addIntegration('existing-integration');

            const integration = Integration.create({
                name: 'existing-integration',
                displayName: 'Existing Integration',
                description: 'Test',
                type: 'api',
                category: 'CRM',
                capabilities: {}
            });

            const result = await validator.validate(integration);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.includes('already exists'))).toBe(true);
        });

        test('accumulates multiple validation errors', async () => {
            mockRepository.addIntegration('existing-webhook');

            const integration = Integration.create({
                name: 'existing-webhook',
                displayName: 'Ex', // Too short
                description: '',
                type: 'webhook',
                category: 'CRM',
                capabilities: {
                    webhooks: false // Invalid for webhook type
                }
            });

            const result = await validator.validate(integration);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });
    });

    describe('validateUpdate', () => {
        test('passes for valid update', () => {
            const existing = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api',
                category: 'CRM'
            });

            const updated = Integration.create({
                name: 'my-integration',
                displayName: 'My Updated Integration',
                type: 'api',
                category: 'Marketing'
            });

            const result = validator.validateUpdate(existing, updated);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when trying to change integration name', () => {
            const existing = Integration.create({
                name: 'original-name',
                displayName: 'Original',
                type: 'api'
            });

            const updated = Integration.create({
                name: 'new-name',
                displayName: 'Updated',
                type: 'api'
            });

            const result = validator.validateUpdate(existing, updated);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Integration name cannot be changed after creation');
        });

        test('fails when trying to downgrade version', () => {
            const existing = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api',
                version: '2.0.0'
            });

            const updated = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api',
                version: '1.0.0'
            });

            const result = validator.validateUpdate(existing, updated);

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('Cannot downgrade'))).toBe(true);
        });
    });

    describe('validateApiModuleAddition', () => {
        test('passes for valid API module addition', () => {
            const integration = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api'
            });

            const result = validator.validateApiModuleAddition(integration, 'new-module', '1.0.0');

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when module already exists', () => {
            const integration = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api'
            });
            integration.addApiModule('existing-module', '1.0.0');

            const result = validator.validateApiModuleAddition(integration, 'existing-module', '2.0.0');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain("API module 'existing-module' is already added to this integration");
        });

        test('fails for invalid version format', () => {
            const integration = Integration.create({
                name: 'my-integration',
                displayName: 'My Integration',
                type: 'api'
            });

            const result = validator.validateApiModuleAddition(integration, 'my-module', 'invalid-version');

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid API module version format'))).toBe(true);
        });
    });
});
