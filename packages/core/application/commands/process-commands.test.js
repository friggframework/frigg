jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

jest.mock(
    '../../integrations/repositories/process-repository-factory',
    () => ({
        createProcessRepository: jest.fn(() => ({})),
    }),
);

const mockCreateExecute = jest.fn();
const mockGetExecute = jest.fn();
const mockUpdateStateExecute = jest.fn();
const mockUpdateMetricsExecute = jest.fn();

jest.mock('../../integrations/use-cases/create-process', () => ({
    CreateProcess: jest
        .fn()
        .mockImplementation(() => ({ execute: mockCreateExecute })),
}));
jest.mock('../../integrations/use-cases/get-process', () => ({
    GetProcess: jest
        .fn()
        .mockImplementation(() => ({ execute: mockGetExecute })),
}));
jest.mock('../../integrations/use-cases/update-process-state', () => ({
    UpdateProcessState: jest
        .fn()
        .mockImplementation(() => ({ execute: mockUpdateStateExecute })),
}));
jest.mock('../../integrations/use-cases/update-process-metrics', () => ({
    UpdateProcessMetrics: jest
        .fn()
        .mockImplementation(() => ({ execute: mockUpdateMetricsExecute })),
}));

const { CreateProcess } = require('../../integrations/use-cases/create-process');
const { GetProcess } = require('../../integrations/use-cases/get-process');
const {
    UpdateProcessState,
} = require('../../integrations/use-cases/update-process-state');
const {
    UpdateProcessMetrics,
} = require('../../integrations/use-cases/update-process-metrics');
const { createProcessCommands } = require('./process-commands');

describe('process commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCreateExecute.mockReset();
        mockGetExecute.mockReset();
        mockUpdateStateExecute.mockReset();
        mockUpdateMetricsExecute.mockReset();
    });

    describe('factory wiring', () => {
        it('instantiates the four use cases with the default repository', () => {
            createProcessCommands();

            expect(CreateProcess).toHaveBeenCalledWith({
                processRepository: expect.any(Object),
            });
            expect(GetProcess).toHaveBeenCalledWith({
                processRepository: expect.any(Object),
            });
            expect(UpdateProcessState).toHaveBeenCalledWith({
                processRepository: expect.any(Object),
            });
            expect(UpdateProcessMetrics).toHaveBeenCalledWith({
                processRepository: expect.any(Object),
                websocketService: undefined,
            });
        });

        it('forwards an optional websocketService to UpdateProcessMetrics', () => {
            const websocketService = { broadcast: jest.fn() };

            createProcessCommands({ websocketService });

            expect(UpdateProcessMetrics).toHaveBeenCalledWith({
                processRepository: expect.any(Object),
                websocketService,
            });
        });

        it('exposes exactly the four command methods', () => {
            const commands = createProcessCommands();

            expect(Object.keys(commands).sort()).toEqual([
                'createProcess',
                'getProcess',
                'updateProcessMetrics',
                'updateProcessState',
            ]);
        });
    });

    describe('createProcess', () => {
        it('delegates to CreateProcess and returns the created process', async () => {
            const processData = {
                userId: 'user-1',
                integrationId: 'integration-1',
                name: 'zoho-crm-contact-sync',
                type: 'CRM_SYNC',
            };
            const created = { id: 'process-1', ...processData };
            mockCreateExecute.mockResolvedValue(created);

            const commands = createProcessCommands();
            const result = await commands.createProcess(processData);

            expect(mockCreateExecute).toHaveBeenCalledWith(processData);
            expect(result).toEqual(created);
        });

        it('maps thrown errors to a response object', async () => {
            mockCreateExecute.mockRejectedValue(
                new Error('Missing required fields for process creation: userId'),
            );

            const commands = createProcessCommands();
            const result = await commands.createProcess({});

            expect(result).toEqual({
                error: 500,
                reason: 'Missing required fields for process creation: userId',
                code: undefined,
            });
        });
    });

    describe('getProcess', () => {
        it('delegates to GetProcess and returns the process', async () => {
            const process = { id: 'process-1' };
            mockGetExecute.mockResolvedValue(process);

            const commands = createProcessCommands();
            const result = await commands.getProcess('process-1');

            expect(mockGetExecute).toHaveBeenCalledWith('process-1');
            expect(result).toEqual(process);
        });

        it('passes through null when the process is not found', async () => {
            mockGetExecute.mockResolvedValue(null);

            const commands = createProcessCommands();
            const result = await commands.getProcess('missing');

            expect(result).toBeNull();
        });
    });

    describe('updateProcessState', () => {
        it('delegates with processId, newState and contextUpdates', async () => {
            const updated = { id: 'process-1', state: 'FETCHING_TOTAL' };
            mockUpdateStateExecute.mockResolvedValue(updated);

            const commands = createProcessCommands();
            const result = await commands.updateProcessState(
                'process-1',
                'FETCHING_TOTAL',
                { currentPage: 1 },
            );

            expect(mockUpdateStateExecute).toHaveBeenCalledWith(
                'process-1',
                'FETCHING_TOTAL',
                { currentPage: 1 },
            );
            expect(result).toEqual(updated);
        });

        it('defaults contextUpdates to an empty object', async () => {
            mockUpdateStateExecute.mockResolvedValue({});

            const commands = createProcessCommands();
            await commands.updateProcessState('process-1', 'COMPLETED');

            expect(mockUpdateStateExecute).toHaveBeenCalledWith(
                'process-1',
                'COMPLETED',
                {},
            );
        });

        it('maps coded errors to the right status', async () => {
            mockUpdateStateExecute.mockRejectedValue(
                Object.assign(new Error('Process not found: missing'), {
                    code: 'PROCESS_NOT_FOUND',
                }),
            );

            const commands = createProcessCommands();
            const result = await commands.updateProcessState('missing', 'X');

            expect(result).toEqual({
                error: 404,
                reason: 'Process not found: missing',
                code: 'PROCESS_NOT_FOUND',
            });
        });
    });

    describe('updateProcessMetrics', () => {
        it('delegates with processId and the metrics update', async () => {
            const updated = { id: 'process-1' };
            mockUpdateMetricsExecute.mockResolvedValue(updated);
            const metricsUpdate = { processed: 100, success: 92, errors: 5 };

            const commands = createProcessCommands();
            const result = await commands.updateProcessMetrics(
                'process-1',
                metricsUpdate,
            );

            expect(mockUpdateMetricsExecute).toHaveBeenCalledWith(
                'process-1',
                metricsUpdate,
            );
            expect(result).toEqual(updated);
        });

        it('maps thrown errors to a response object', async () => {
            mockUpdateMetricsExecute.mockRejectedValue(
                new Error('Failed to update process metrics: boom'),
            );

            const commands = createProcessCommands();
            const result = await commands.updateProcessMetrics('process-1', {});

            expect(result).toEqual({
                error: 500,
                reason: 'Failed to update process metrics: boom',
                code: undefined,
            });
        });
    });
});
