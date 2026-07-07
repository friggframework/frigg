// Mock database config before imports
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock repository factory — commands delegate to the consolidated AdminScriptExecution API
const mockAdminScriptExecutionRepo = {
    createExecution: jest.fn(),
    findExecutionById: jest.fn(),
    findExecutionsByName: jest.fn(),
    findExecutionsByState: jest.fn(),
    updateExecutionState: jest.fn(),
    updateExecutionResults: jest.fn(),
    appendExecutionLog: jest.fn(),
};

jest.mock('../../../admin-scripts/repositories/admin-script-execution-repository-factory', () => ({
    createAdminScriptExecutionRepository: () => mockAdminScriptExecutionRepo,
}));

const { createAdminScriptCommands } = require('../admin-script-commands');

describe('createAdminScriptCommands', () => {
    let commands;

    beforeEach(() => {
        jest.clearAllMocks();
        commands = createAdminScriptCommands();
    });

    describe('createExecution', () => {
        it('maps to repo.createExecution with name/type/context', async () => {
            const mockProcess = {
                id: 'proc-1',
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                state: 'PENDING',
                context: {},
                results: {},
                createdAt: new Date(),
            };

            mockAdminScriptExecutionRepo.createExecution.mockResolvedValue(mockProcess);

            const result = await commands.createExecution({
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param: 'value' },
                audit: {
                    apiKeyLast4: '1234',
                    ipAddress: '127.0.0.1',
                },
            });

            expect(mockAdminScriptExecutionRepo.createExecution).toHaveBeenCalledWith({
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                context: {
                    scriptVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'async',
                    input: { param: 'value' },
                    audit: {
                        apiKeyLast4: '1234',
                        ipAddress: '127.0.0.1',
                    },
                },
            });
            expect(result).toEqual(mockProcess);
        });

        it('sets default mode to async if not provided', async () => {
            mockAdminScriptExecutionRepo.createExecution.mockResolvedValue({ id: 'proc-1' });

            await commands.createExecution({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(mockAdminScriptExecutionRepo.createExecution).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({ mode: 'async' }),
                })
            );
        });

        it('passes parentExecutionId as a top-level column value (not in context)', async () => {
            mockAdminScriptExecutionRepo.createExecution.mockResolvedValue({ id: 'proc-1' });

            await commands.createExecution({
                scriptName: 'test',
                trigger: 'QUEUE',
                parentExecutionId: 'parent-1',
            });

            const arg = mockAdminScriptExecutionRepo.createExecution.mock.calls[0][0];
            expect(arg.parentExecutionId).toBe('parent-1');
            // Must NOT be buried in context — the self-FK column is the source of truth.
            expect(arg.context.parentExecutionId).toBeUndefined();
        });

        it('maps repository errors to an error response', async () => {
            mockAdminScriptExecutionRepo.createExecution.mockRejectedValue(new Error('DB down'));

            const result = await commands.createExecution({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(result).toHaveProperty('error', 500);
            expect(result.reason).toBe('DB down');
        });
    });

    describe('findExecutionById', () => {
        it('returns admin process if found', async () => {
            const mockProcess = { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT' };
            mockAdminScriptExecutionRepo.findExecutionById.mockResolvedValue(mockProcess);

            const result = await commands.findExecutionById('proc-1');

            expect(mockAdminScriptExecutionRepo.findExecutionById).toHaveBeenCalledWith('proc-1');
            expect(result).toEqual(mockProcess);
        });

        it('returns error if not found', async () => {
            mockAdminScriptExecutionRepo.findExecutionById.mockResolvedValue(null);

            const result = await commands.findExecutionById('non-existent');

            expect(result).toHaveProperty('error', 404);
            expect(result).toHaveProperty('code', 'EXECUTION_NOT_FOUND');
            expect(result.reason).toContain('non-existent');
        });
    });

    describe('findExecutionsByName', () => {
        it('finds admin processes by script name', async () => {
            const mockProcesses = [
                { id: 'proc-1', name: 'test', state: 'COMPLETED' },
                { id: 'proc-2', name: 'test', state: 'FAILED' },
            ];
            mockAdminScriptExecutionRepo.findExecutionsByName.mockResolvedValue(mockProcesses);

            const result = await commands.findExecutionsByName('test');

            expect(mockAdminScriptExecutionRepo.findExecutionsByName).toHaveBeenCalledWith('test', {});
            expect(result).toEqual(mockProcesses);
        });

        it('passes options (including state filter) to repository', async () => {
            mockAdminScriptExecutionRepo.findExecutionsByName.mockResolvedValue([]);

            await commands.findExecutionsByName('test', {
                limit: 10,
                state: 'FAILED',
            });

            expect(mockAdminScriptExecutionRepo.findExecutionsByName).toHaveBeenCalledWith('test', {
                limit: 10,
                state: 'FAILED',
            });
        });

        it('returns empty array on error', async () => {
            mockAdminScriptExecutionRepo.findExecutionsByName.mockRejectedValue(new Error('DB error'));

            const result = await commands.findExecutionsByName('test');

            expect(result).toEqual([]);
        });
    });

    describe('updateExecutionState', () => {
        it('updates state correctly', async () => {
            const mockUpdated = { id: 'proc-1', state: 'RUNNING' };
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue(mockUpdated);

            const result = await commands.updateExecutionState('proc-1', 'RUNNING');

            expect(mockAdminScriptExecutionRepo.updateExecutionState).toHaveBeenCalledWith('proc-1', 'RUNNING');
            expect(result).toEqual(mockUpdated);
        });

        it('handles all state values', async () => {
            const states = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'];

            for (const state of states) {
                mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({ id: 'proc-1', state });
                const result = await commands.updateExecutionState('proc-1', state);
                expect(result.state).toBe(state);
            }
        });
    });

    describe('appendExecutionLog', () => {
        it('appends log entry via repo.appendExecutionLog', async () => {
            const logEntry = {
                level: 'info',
                message: 'Test log',
                data: { detail: 'test' },
                timestamp: new Date().toISOString(),
            };
            mockAdminScriptExecutionRepo.appendExecutionLog.mockResolvedValue({
                id: 'proc-1',
                results: { logs: [logEntry] },
            });

            const result = await commands.appendExecutionLog('proc-1', logEntry);

            expect(mockAdminScriptExecutionRepo.appendExecutionLog).toHaveBeenCalledWith('proc-1', logEntry);
            expect(result.results.logs).toContain(logEntry);
        });
    });

    describe('completeExecution', () => {
        it('updates state then merges output/metrics into results', async () => {
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({});
            mockAdminScriptExecutionRepo.updateExecutionResults.mockResolvedValue({});

            const result = await commands.completeExecution('proc-1', {
                state: 'COMPLETED',
                output: { result: 'success' },
                error: null,
                metrics: { durationMs: 1234 },
            });

            expect(mockAdminScriptExecutionRepo.updateExecutionState).toHaveBeenCalledWith('proc-1', 'COMPLETED');
            expect(mockAdminScriptExecutionRepo.updateExecutionResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({
                    output: { result: 'success' },
                    metrics: expect.objectContaining({ durationMs: 1234 }),
                })
            );
            expect(result).toEqual({ success: true });
        });

        it('persists logs when provided', async () => {
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({});
            mockAdminScriptExecutionRepo.updateExecutionResults.mockResolvedValue({});

            const logs = [{ level: 'info', message: 'hi' }];
            await commands.completeExecution('proc-1', { state: 'COMPLETED', logs });

            expect(mockAdminScriptExecutionRepo.updateExecutionResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ logs })
            );
        });

        it('updates state only when no results fields are provided', async () => {
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({});

            await commands.completeExecution('proc-1', { state: 'FAILED' });

            expect(mockAdminScriptExecutionRepo.updateExecutionState).toHaveBeenCalledWith('proc-1', 'FAILED');
            expect(mockAdminScriptExecutionRepo.updateExecutionResults).not.toHaveBeenCalled();
        });

        it('merges error details on failure', async () => {
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({});
            mockAdminScriptExecutionRepo.updateExecutionResults.mockResolvedValue({});

            const error = {
                name: 'ValidationError',
                message: 'Invalid input',
                stack: 'Error: ...\n  at ...',
            };
            await commands.completeExecution('proc-1', { state: 'FAILED', error });

            expect(mockAdminScriptExecutionRepo.updateExecutionResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ error })
            );
        });

        it('includes null output but skips undefined output', async () => {
            mockAdminScriptExecutionRepo.updateExecutionState.mockResolvedValue({});
            mockAdminScriptExecutionRepo.updateExecutionResults.mockResolvedValue({});

            await commands.completeExecution('proc-1', { state: 'COMPLETED', output: null });
            expect(mockAdminScriptExecutionRepo.updateExecutionResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ output: null })
            );

            jest.clearAllMocks();

            await commands.completeExecution('proc-2', { state: 'COMPLETED' });
            expect(mockAdminScriptExecutionRepo.updateExecutionResults).not.toHaveBeenCalled();
        });
    });
});
