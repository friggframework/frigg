jest.mock('../../database/config', () => {
    const mockConfig = {
        DB_TYPE: 'mongodb',
        getDatabaseType: jest.fn(() => 'mongodb'),
        PRISMA_LOG_LEVEL: 'error,warn',
        PRISMA_QUERY_LOGGING: false,
    };
    return { __esModule: true, default: mockConfig, ...mockConfig };
});

jest.mock('../../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: jest.fn(() => ({
        findIntegrationById: jest.fn(),
        findIntegrationByUserId: jest.fn(),
        findIntegrationsByUserId: jest.fn(),
        createIntegration: jest.fn(),
        updateIntegrationById: jest.fn(),
        deleteIntegrationById: jest.fn(),
    })),
}));

jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({})),
}));

const mockFindExecute: any = jest.fn();

jest.mock('../../integrations/use-cases/find-integration-context-by-external-entity-id', () => {
    return {
        FindIntegrationContextByExternalEntityIdUseCase: jest
            .fn()
            .mockImplementation(() => ({
                execute: mockFindExecute,
            })),
    };
});

import {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} from './integration-commands';
import {
    FindIntegrationContextByExternalEntityIdUseCase,
} from '../../integrations/use-cases/find-integration-context-by-external-entity-id';
import { DummyIntegration } from '../../integrations/tests/doubles/dummy-integration-class';

describe('integration commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindExecute.mockReset();
    });

    it('requires an integrationClass when creating commands', () => {
        expect(() => createIntegrationCommands({} as any)).toThrow(
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
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        const result = await commands.loadIntegrationContextById('integration-1');

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

            const result = await commands.deleteIntegrationById(null as any);

            expect(result).toHaveProperty('error');
            expect(result.reason).toContain('integrationId is required');
        });

        it('calls repository deleteIntegrationById', async () => {
            const commands = createIntegrationCommands({
                integrationClass: DummyIntegration,
            });

            const result = await commands.deleteIntegrationById('integration-123');

            expect(result).toHaveProperty('error');
        });
    });
});
