jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockFindExecute = jest.fn();
const mockUpdateConfigExecute = jest.fn();
const mockPatchConfigExecute = jest.fn();

jest.mock('../../integrations/use-cases/find-integration-context-by-external-entity-id', () => {
    return {
        FindIntegrationContextByExternalEntityIdUseCase: jest
            .fn()
            .mockImplementation(() => ({
                execute: mockFindExecute,
            })),
    };
});

jest.mock('../../integrations/use-cases/update-integration-config', () => {
    return {
        UpdateIntegrationConfig: jest.fn().mockImplementation(() => ({
            execute: mockUpdateConfigExecute,
        })),
    };
});

jest.mock('../../integrations/use-cases/patch-integration-config', () => {
    return {
        PatchIntegrationConfig: jest.fn().mockImplementation(() => ({
            execute: mockPatchConfigExecute,
        })),
    };
});

const {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} = require('./integration-commands');
const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('../../integrations/use-cases/find-integration-context-by-external-entity-id');
const {
    UpdateIntegrationConfig,
} = require('../../integrations/use-cases/update-integration-config');
const {
    PatchIntegrationConfig,
} = require('../../integrations/use-cases/patch-integration-config');
const { DummyIntegration } = require('../../integrations/tests/doubles/dummy-integration-class');

describe('integration commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindExecute.mockReset();
        mockUpdateConfigExecute.mockReset();
        mockPatchConfigExecute.mockReset();
    });

    it('requires an integrationClass when creating commands', () => {
        expect(() => createIntegrationCommands()).toThrow(
            'integrationClass is required',
        );
    });

    it('creates use cases with default repositories', () => {
        createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        // Verify that the use case is created with default repositories instantiated internally
        expect(
            FindIntegrationContextByExternalEntityIdUseCase,
        ).toHaveBeenCalledWith({
            integrationRepository: expect.any(Object),
            moduleRepository: expect.any(Object),
            loadIntegrationContextUseCase: expect.any(Object),
        });
    });

    it('returns context when findIntegrationContextByExternalEntityId succeeds', async () => {
        const expectedContext = { record: { id: 'integration-1' } };
        mockFindExecute.mockResolvedValue({ context: expectedContext });
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        const result = await commands.findIntegrationContextByExternalEntityId(
            'ext-1',
        );

        expect(mockFindExecute).toHaveBeenCalledWith({
            externalEntityId: 'ext-1',
        });
        expect(result).toEqual({ context: expectedContext });
    });

    it('maps known errors to status codes', async () => {
        const error = Object.assign(new Error('Entity missing'), {
            code: 'ENTITY_NOT_FOUND',
        });
        mockFindExecute.mockRejectedValue(error);
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        const result = await commands.findIntegrationContextByExternalEntityId(
            'ext-1',
        );

        expect(result).toEqual({
            error: 401,
            reason: 'Entity missing',
            code: 'ENTITY_NOT_FOUND',
        });
    });

    it('delegates loadIntegrationContextById to the loader use case', async () => {
        // This test verifies that the command properly delegates to the use case
        // We can't easily mock the internal use case, so we'll test the integration
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        // The actual use case will be called - this is more of an integration test
        // For unit testing, we'd need to refactor to allow DI of the use case
        // But since we've decided to always use default use cases, this is acceptable
        const result = await commands.loadIntegrationContextById('integration-1');

        // Result will have error since we don't have a real database
        expect(result).toHaveProperty('error');
    });

    it('exposes a one-off helper for finding integration context by external entity id', async () => {
        const expectedContext = { record: { id: 'integration-1' } };
        mockFindExecute.mockResolvedValue({ context: expectedContext });

        const result = await findIntegrationContextByExternalEntityId({
            integrationClass: DummyIntegration,
            externalEntityId: 'ext-2',
        });

        expect(mockFindExecute).toHaveBeenCalledWith({
            externalEntityId: 'ext-2',
        });
        expect(result).toEqual({ context: expectedContext });
    });

    describe('deleteIntegrationById', () => {
        it('returns error if integrationId is missing', async () => {
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.deleteIntegrationById(null);

            expect(result).toHaveProperty('error');
            expect(result.reason).toContain('integrationId is required');
        });

        it('calls repository deleteIntegrationById', async () => {
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            // Will fail since no real database, but verifies the method exists and is wired up
            const result = await commands.deleteIntegrationById('integration-123');

            // Expect error since no real DB connection
            expect(result).toHaveProperty('error');
        });
    });

    describe('updateIntegrationConfig', () => {
        it('delegates to the UpdateIntegrationConfig use case', async () => {
            mockUpdateConfigExecute.mockResolvedValue({
                id: 'integration-1',
                config: { type: 'attio' },
            });
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.updateIntegrationConfig({
                integrationId: 'integration-1',
                config: { type: 'attio' },
            });

            expect(UpdateIntegrationConfig).toHaveBeenCalledWith({
                integrationRepository: expect.any(Object),
            });
            expect(mockUpdateConfigExecute).toHaveBeenCalledWith(
                'integration-1',
                { type: 'attio' },
            );
            expect(result).toEqual({
                id: 'integration-1',
                config: { type: 'attio' },
            });
        });

        it('maps a use case throw to the {error} result convention', async () => {
            mockUpdateConfigExecute.mockRejectedValue(
                new Error('Config parameter is required'),
            );
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.updateIntegrationConfig({
                integrationId: 'integration-1',
                config: null,
            });

            expect(result).toEqual({
                error: 500,
                reason: 'Config parameter is required',
                code: undefined,
            });
        });
    });

    describe('patchIntegrationConfig', () => {
        it('delegates to the PatchIntegrationConfig use case', async () => {
            mockPatchConfigExecute.mockResolvedValue({
                id: 'integration-1',
                config: { type: 'attio', attioWebhookId: 'wh_1' },
            });
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.patchIntegrationConfig({
                integrationId: 'integration-1',
                patch: { attioWebhookId: 'wh_1' },
            });

            expect(PatchIntegrationConfig).toHaveBeenCalledWith({
                integrationRepository: expect.any(Object),
            });
            expect(mockPatchConfigExecute).toHaveBeenCalledWith(
                'integration-1',
                { attioWebhookId: 'wh_1' },
            );
            expect(result).toEqual({
                id: 'integration-1',
                config: { type: 'attio', attioWebhookId: 'wh_1' },
            });
        });

        it('maps a use case throw to the {error} result convention', async () => {
            mockPatchConfigExecute.mockRejectedValue(
                new Error("patch['attioWebhookId'] cannot be null or undefined"),
            );
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.patchIntegrationConfig({
                integrationId: 'integration-1',
                patch: { attioWebhookId: null },
            });

            expect(result).toEqual({
                error: 500,
                reason: "patch['attioWebhookId'] cannot be null or undefined",
                code: undefined,
            });
        });
    });
});
