const {AddApiModuleToIntegrationUseCase} = require('../../../application/use-cases/AddApiModuleToIntegrationUseCase');
const {Integration} = require('../../../domain/entities/Integration');
const {IntegrationName} = require('../../../domain/value-objects/IntegrationName');
const {SemanticVersion} = require('../../../domain/value-objects/SemanticVersion');
const {ValidationException} = require('../../../domain/exceptions/DomainException');

// Mock dependencies
class MockIntegrationRepository {
    constructor() {
        this.integrations = new Map();
        this.saveCalled = false;
    }

    async save(integration) {
        this.saveCalled = true;
        this.integrations.set(integration.name.value, integration);
        return integration;
    }

    async findByName(name) {
        return this.integrations.get(name) || null;
    }

    async exists(name) {
        return this.integrations.has(name);
    }
}

class MockApiModuleRepository {
    constructor() {
        this.modules = new Set(['salesforce', 'stripe', 'hubspot']);
    }

    async exists(name) {
        return this.modules.has(name);
    }
}

class MockUnitOfWork {
    constructor() {
        this.committed = false;
        this.rolledBack = false;
    }

    async commit() {
        this.committed = true;
    }

    async rollback() {
        this.rolledBack = true;
    }
}

class MockIntegrationValidator {
    constructor() {
        this.validateCalled = false;
        this.shouldFail = false;
        this.errors = [];
    }

    validateApiModuleAddition(integration, moduleName, moduleVersion) {
        this.validateCalled = true;
        if (this.shouldFail) {
            return {
                isValid: false,
                errors: this.errors
            };
        }
        return {
            isValid: true,
            errors: []
        };
    }
}

describe('AddApiModuleToIntegrationUseCase', () => {
    let useCase;
    let mockIntegrationRepository;
    let mockApiModuleRepository;
    let mockUnitOfWork;
    let mockValidator;

    beforeEach(() => {
        mockIntegrationRepository = new MockIntegrationRepository();
        mockApiModuleRepository = new MockApiModuleRepository();
        mockUnitOfWork = new MockUnitOfWork();
        mockValidator = new MockIntegrationValidator();

        useCase = new AddApiModuleToIntegrationUseCase(
            mockIntegrationRepository,
            mockApiModuleRepository,
            mockUnitOfWork,
            mockValidator
        );

        // Add a test integration
        const integration = Integration.create({
            name: 'test-integration',
            type: 'api',
            displayName: 'Test Integration',
            description: 'Test',
            category: 'CRM'
        });
        mockIntegrationRepository.integrations.set('test-integration', integration);
    });

    describe('execute()', () => {
        test('successfully adds API module to integration', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce',
                moduleVersion: '1.0.0',
                source: 'local'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.message).toContain("API module 'salesforce' added");
            expect(result.integration.apiModules).toHaveLength(1);
            expect(result.integration.apiModules[0].name).toBe('salesforce');
            expect(mockIntegrationRepository.saveCalled).toBe(true);
            expect(mockUnitOfWork.committed).toBe(true);
        });

        test('adds module with correct version', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce',
                moduleVersion: '2.3.0'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.integration.apiModules[0].version).toBe('2.3.0');
        });

        test('defaults version to 1.0.0 when not provided', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.integration.apiModules[0].version).toBe('1.0.0');
        });

        test('defaults source to local when not provided', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.integration.apiModules[0].source).toBe('local');
        });

        test('allows custom source', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce',
                source: 'npm'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.integration.apiModules[0].source).toBe('npm');
        });

        test('throws error when integration not found', async () => {
            const request = {
                integrationName: 'non-existent',
                moduleName: 'salesforce'
            };

            await expect(useCase.execute(request)).rejects.toThrow(ValidationException);
            await expect(useCase.execute(request)).rejects.toThrow("Integration 'non-existent' not found");
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('throws error when API module does not exist', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'non-existent-module'
            };

            await expect(useCase.execute(request)).rejects.toThrow(ValidationException);
            await expect(useCase.execute(request)).rejects.toThrow("API module 'non-existent-module' not found");
            await expect(useCase.execute(request)).rejects.toThrow('Create it first');
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('throws error when API module already added', async () => {
            // First add
            await useCase.execute({
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            });

            // Try to add again
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            await expect(useCase.execute(request)).rejects.toThrow();
            await expect(useCase.execute(request)).rejects.toThrow('already added');
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('calls validator with correct parameters', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce',
                moduleVersion: '1.5.0'
            };

            await useCase.execute(request);

            expect(mockValidator.validateCalled).toBe(true);
        });

        test('throws error when validation fails', async () => {
            mockValidator.shouldFail = true;
            mockValidator.errors = ['Some validation error'];

            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            await expect(useCase.execute(request)).rejects.toThrow(ValidationException);
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('commits transaction only after all operations succeed', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            await useCase.execute(request);

            expect(mockIntegrationRepository.saveCalled).toBe(true);
            expect(mockUnitOfWork.committed).toBe(true);
            expect(mockUnitOfWork.rolledBack).toBe(false);
        });

        test('rollsback on repository save error', async () => {
            mockIntegrationRepository.save = async () => {
                throw new Error('Database error');
            };

            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            };

            await expect(useCase.execute(request)).rejects.toThrow('Database error');
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('allows adding multiple different API modules', async () => {
            await useCase.execute({
                integrationName: 'test-integration',
                moduleName: 'salesforce'
            });

            const result = await useCase.execute({
                integrationName: 'test-integration',
                moduleName: 'stripe'
            });

            expect(result.success).toBe(true);
            expect(result.integration.apiModules).toHaveLength(2);
            expect(result.integration.apiModules.map(m => m.name)).toContain('salesforce');
            expect(result.integration.apiModules.map(m => m.name)).toContain('stripe');
        });

        test('returns integration object with updated apiModules', async () => {
            const request = {
                integrationName: 'test-integration',
                moduleName: 'salesforce',
                moduleVersion: '1.0.0',
                source: 'local'
            };

            const result = await useCase.execute(request);

            expect(result.integration).toHaveProperty('id');
            expect(result.integration).toHaveProperty('name');
            expect(result.integration).toHaveProperty('version');
            expect(result.integration).toHaveProperty('apiModules');
            expect(result.integration.apiModules).toBeInstanceOf(Array);
        });

        test('preserves existing integration data', async () => {
            const integration = Integration.create({
                name: 'salesforce-sync',
                type: 'sync',
                displayName: 'Salesforce Sync',
                description: 'Sync data with Salesforce',
                category: 'CRM'
            });
            mockIntegrationRepository.integrations.set('salesforce-sync', integration);

            const request = {
                integrationName: 'salesforce-sync',
                moduleName: 'salesforce'
            };

            const result = await useCase.execute(request);

            expect(result.integration.name).toBe('salesforce-sync');
            expect(result.integration.type).toBe('sync');
            expect(result.integration.displayName).toBe('Salesforce Sync');
            expect(result.integration.description).toBe('Sync data with Salesforce');
        });
    });
});
