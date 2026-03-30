const {CreateApiModuleUseCase} = require('../../../application/use-cases/CreateApiModuleUseCase');
const {ApiModule} = require('../../../domain/entities/ApiModule');
const {DomainException, ValidationException} = require('../../../domain/exceptions/DomainException');

// Mock dependencies
class MockApiModuleRepository {
    constructor() {
        this.modules = new Map();
        this.saveCalled = false;
    }

    async save(apiModule) {
        this.saveCalled = true;
        this.modules.set(apiModule.name, apiModule);
        return apiModule;
    }

    async findByName(name) {
        return this.modules.get(name) || null;
    }

    async exists(name) {
        return this.modules.has(name);
    }

    async list() {
        return Array.from(this.modules.values());
    }
}

class MockAppDefinitionRepository {
    constructor() {
        this.appDef = null;
        this.loadCalled = false;
        this.saveCalled = false;
    }

    async load() {
        this.loadCalled = true;
        return this.appDef;
    }

    async save(appDef) {
        this.saveCalled = true;
        this.appDef = appDef;
        return appDef;
    }

    async exists() {
        return this.appDef !== null;
    }
}

class MockUnitOfWork {
    constructor() {
        this.committed = false;
        this.rolledBack = false;
        this.operations = [];
    }

    addOperation(operation) {
        this.operations.push(operation);
    }

    async commit() {
        this.committed = true;
    }

    async rollback() {
        this.rolledBack = true;
    }
}

describe('CreateApiModuleUseCase', () => {
    let useCase;
    let mockApiModuleRepository;
    let mockAppDefinitionRepository;
    let mockUnitOfWork;

    beforeEach(() => {
        mockApiModuleRepository = new MockApiModuleRepository();
        mockAppDefinitionRepository = new MockAppDefinitionRepository();
        mockUnitOfWork = new MockUnitOfWork();

        useCase = new CreateApiModuleUseCase(
            mockApiModuleRepository,
            mockUnitOfWork,
            mockAppDefinitionRepository
        );
    });

    describe('execute()', () => {
        test('successfully creates a new API module with required fields', async () => {
            const request = {
                name: 'salesforce',
                displayName: 'Salesforce',
                description: 'Salesforce CRM API',
                baseUrl: 'https://api.salesforce.com',
                authType: 'oauth2',
                apiVersion: 'v1'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.name).toBe('salesforce');
            expect(result.apiModule.displayName).toBe('Salesforce');
            expect(mockApiModuleRepository.saveCalled).toBe(true);
            expect(mockUnitOfWork.committed).toBe(true);
        });

        test('creates module with minimal required fields', async () => {
            const request = {
                name: 'stripe-api',
                authType: 'api-key'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.name).toBe('stripe-api');
            expect(result.apiModule.displayName).toBe('Stripe Api');
            expect(result.apiModule.apiConfig.authType).toBe('api-key');
        });

        test('creates module with entities', async () => {
            const request = {
                name: 'salesforce',
                authType: 'oauth2',
                entities: {
                    account: {
                        label: 'Salesforce Account',
                        required: true,
                        fields: ['id', 'name']
                    }
                }
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.entities).toHaveProperty('account');
            expect(result.apiModule.entities.account.label).toBe('Salesforce Account');
        });

        test('creates module with OAuth scopes', async () => {
            const request = {
                name: 'salesforce',
                authType: 'oauth2',
                scopes: ['read:accounts', 'write:accounts']
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.scopes).toEqual(['read:accounts', 'write:accounts']);
        });

        test('creates module with credentials', async () => {
            const request = {
                name: 'salesforce',
                authType: 'oauth2',
                credentials: [
                    {
                        name: 'clientId',
                        type: 'string',
                        required: true,
                        description: 'OAuth client ID'
                    }
                ]
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.credentials).toHaveLength(1);
            expect(result.apiModule.credentials[0].name).toBe('clientId');
        });

        test('registers API module in app definition if available', async () => {
            // Setup app definition
            const AppDefinition = require('../../../domain/entities/AppDefinition').AppDefinition;
            mockAppDefinitionRepository.appDef = AppDefinition.create({
                name: 'test-app',
                version: '1.0.0'
            });

            const request = {
                name: 'salesforce',
                authType: 'oauth2'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(mockAppDefinitionRepository.loadCalled).toBe(true);
            expect(mockAppDefinitionRepository.saveCalled).toBe(true);
            expect(mockAppDefinitionRepository.appDef.hasApiModule('salesforce')).toBe(true);
        });

        test('succeeds even if app definition does not exist', async () => {
            mockAppDefinitionRepository.appDef = null;

            const request = {
                name: 'salesforce',
                authType: 'oauth2'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(mockAppDefinitionRepository.loadCalled).toBe(true);
            expect(mockAppDefinitionRepository.saveCalled).toBe(false);
        });

        test('throws validation error when name is missing', async () => {
            const request = {
                authType: 'oauth2'
            };

            await expect(useCase.execute(request)).rejects.toThrow(DomainException);
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('throws validation error when name is invalid', async () => {
            const request = {
                name: 'Invalid Name!',
                authType: 'oauth2'
            };

            await expect(useCase.execute(request)).rejects.toThrow();
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('defaults authType to oauth2 when missing', async () => {
            const request = {
                name: 'salesforce'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(result.apiModule.apiConfig.authType).toBe('oauth2');
        });

        test('rollsback on repository error', async () => {
            mockApiModuleRepository.save = async () => {
                throw new Error('Database error');
            };

            const request = {
                name: 'salesforce',
                authType: 'oauth2'
            };

            await expect(useCase.execute(request)).rejects.toThrow('Database error');
            expect(mockUnitOfWork.rolledBack).toBe(true);
        });

        test('succeeds even if app definition registration fails', async () => {
            // Setup app definition that will fail
            const AppDefinition = require('../../../domain/entities/AppDefinition').AppDefinition;
            mockAppDefinitionRepository.appDef = AppDefinition.create({
                name: 'test-app',
                version: '1.0.0'
            });

            // Make save throw error
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            mockAppDefinitionRepository.save = async () => {
                throw new Error('Failed to update app definition');
            };

            const request = {
                name: 'salesforce',
                authType: 'oauth2'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Could not register API module'),
                expect.any(String)
            );
            expect(mockUnitOfWork.committed).toBe(true);
            expect(mockUnitOfWork.rolledBack).toBe(false);

            consoleSpy.mockRestore();
        });

        test('commits transaction only after all operations succeed', async () => {
            const AppDefinition = require('../../../domain/entities/AppDefinition').AppDefinition;
            mockAppDefinitionRepository.appDef = AppDefinition.create({
                name: 'test-app',
                version: '1.0.0'
            });

            const request = {
                name: 'salesforce',
                authType: 'oauth2'
            };

            const result = await useCase.execute(request);

            expect(result.success).toBe(true);
            expect(mockApiModuleRepository.saveCalled).toBe(true);
            expect(mockAppDefinitionRepository.saveCalled).toBe(true);
            expect(mockUnitOfWork.committed).toBe(true);
            expect(mockUnitOfWork.rolledBack).toBe(false);
        });

        test('returns full API module object', async () => {
            const request = {
                name: 'salesforce',
                displayName: 'Salesforce',
                description: 'Salesforce CRM API',
                authType: 'oauth2',
                baseUrl: 'https://api.salesforce.com',
                version: '2.0.0'
            };

            const result = await useCase.execute(request);

            expect(result.apiModule).toHaveProperty('name');
            expect(result.apiModule).toHaveProperty('version');
            expect(result.apiModule).toHaveProperty('displayName');
            expect(result.apiModule).toHaveProperty('description');
            expect(result.apiModule).toHaveProperty('apiConfig');
            expect(result.apiModule).toHaveProperty('entities');
            expect(result.apiModule).toHaveProperty('scopes');
            expect(result.apiModule).toHaveProperty('credentials');
            expect(result.apiModule).toHaveProperty('createdAt');
            expect(result.apiModule).toHaveProperty('updatedAt');
        });
    });
});
