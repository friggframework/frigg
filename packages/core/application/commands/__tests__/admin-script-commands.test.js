// Mock database config before imports
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock repository factory — commands delegate to the consolidated AdminProcess API
const mockAdminProcessRepo = {
    createProcess: jest.fn(),
    findProcessById: jest.fn(),
    findProcessesByName: jest.fn(),
    findProcessesByState: jest.fn(),
    updateProcessState: jest.fn(),
    updateProcessResults: jest.fn(),
    appendProcessLog: jest.fn(),
};

jest.mock('../../../admin-scripts/repositories/admin-process-repository-factory', () => ({
    createAdminProcessRepository: () => mockAdminProcessRepo,
}));

const { createAdminScriptCommands } = require('../admin-script-commands');

describe('createAdminScriptCommands', () => {
    let commands;

    beforeEach(() => {
        jest.clearAllMocks();
        commands = createAdminScriptCommands();
    });

    describe('createAdminProcess', () => {
        it('maps to repo.createProcess with name/type/context', async () => {
            const mockProcess = {
                id: 'proc-1',
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                state: 'PENDING',
                context: {},
                results: {},
                createdAt: new Date(),
            };

            mockAdminProcessRepo.createProcess.mockResolvedValue(mockProcess);

            const result = await commands.createAdminProcess({
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

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith({
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
            mockAdminProcessRepo.createProcess.mockResolvedValue({ id: 'proc-1' });

            await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({ mode: 'async' }),
                })
            );
        });

        it('records parentExecutionId in context when provided', async () => {
            mockAdminProcessRepo.createProcess.mockResolvedValue({ id: 'proc-1' });

            await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'QUEUE',
                parentExecutionId: 'parent-1',
            });

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({ parentExecutionId: 'parent-1' }),
                })
            );
        });

        it('maps repository errors to an error response', async () => {
            mockAdminProcessRepo.createProcess.mockRejectedValue(new Error('DB down'));

            const result = await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(result).toHaveProperty('error', 500);
            expect(result.reason).toBe('DB down');
        });
    });

    describe('findAdminProcessById', () => {
        it('returns admin process if found', async () => {
            const mockProcess = { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT' };
            mockAdminProcessRepo.findProcessById.mockResolvedValue(mockProcess);

            const result = await commands.findAdminProcessById('proc-1');

            expect(mockAdminProcessRepo.findProcessById).toHaveBeenCalledWith('proc-1');
            expect(result).toEqual(mockProcess);
        });

        it('returns error if not found', async () => {
            mockAdminProcessRepo.findProcessById.mockResolvedValue(null);

            const result = await commands.findAdminProcessById('non-existent');

            expect(result).toHaveProperty('error', 404);
            expect(result).toHaveProperty('code', 'EXECUTION_NOT_FOUND');
            expect(result.reason).toContain('non-existent');
        });
    });

    describe('findAdminProcessesByName', () => {
        it('finds admin processes by script name', async () => {
            const mockProcesses = [
                { id: 'proc-1', name: 'test', state: 'COMPLETED' },
                { id: 'proc-2', name: 'test', state: 'FAILED' },
            ];
            mockAdminProcessRepo.findProcessesByName.mockResolvedValue(mockProcesses);

            const result = await commands.findAdminProcessesByName('test');

            expect(mockAdminProcessRepo.findProcessesByName).toHaveBeenCalledWith('test', {});
            expect(result).toEqual(mockProcesses);
        });

        it('passes options (including state filter) to repository', async () => {
            mockAdminProcessRepo.findProcessesByName.mockResolvedValue([]);

            await commands.findAdminProcessesByName('test', {
                limit: 10,
                state: 'FAILED',
            });

            expect(mockAdminProcessRepo.findProcessesByName).toHaveBeenCalledWith('test', {
                limit: 10,
                state: 'FAILED',
            });
        });

        it('returns empty array on error', async () => {
            mockAdminProcessRepo.findProcessesByName.mockRejectedValue(new Error('DB error'));

            const result = await commands.findAdminProcessesByName('test');

            expect(result).toEqual([]);
        });
    });

    describe('updateAdminProcessState', () => {
        it('updates state correctly', async () => {
            const mockUpdated = { id: 'proc-1', state: 'RUNNING' };
            mockAdminProcessRepo.updateProcessState.mockResolvedValue(mockUpdated);

            const result = await commands.updateAdminProcessState('proc-1', 'RUNNING');

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalledWith('proc-1', 'RUNNING');
            expect(result).toEqual(mockUpdated);
        });

        it('handles all state values', async () => {
            const states = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'];

            for (const state of states) {
                mockAdminProcessRepo.updateProcessState.mockResolvedValue({ id: 'proc-1', state });
                const result = await commands.updateAdminProcessState('proc-1', state);
                expect(result.state).toBe(state);
            }
        });
    });

    describe('appendAdminProcessLog', () => {
        it('appends log entry via repo.appendProcessLog', async () => {
            const logEntry = {
                level: 'info',
                message: 'Test log',
                data: { detail: 'test' },
                timestamp: new Date().toISOString(),
            };
            mockAdminProcessRepo.appendProcessLog.mockResolvedValue({
                id: 'proc-1',
                results: { logs: [logEntry] },
            });

            const result = await commands.appendAdminProcessLog('proc-1', logEntry);

            expect(mockAdminProcessRepo.appendProcessLog).toHaveBeenCalledWith('proc-1', logEntry);
            expect(result.results.logs).toContain(logEntry);
        });
    });

    describe('completeAdminProcess', () => {
        it('updates state then merges output/metrics into results', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            const result = await commands.completeAdminProcess('proc-1', {
                state: 'COMPLETED',
                output: { result: 'success' },
                error: null,
                metrics: { durationMs: 1234 },
            });

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalledWith('proc-1', 'COMPLETED');
            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({
                    output: { result: 'success' },
                    metrics: expect.objectContaining({ durationMs: 1234 }),
                })
            );
            expect(result).toEqual({ success: true });
        });

        it('persists logs when provided', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            const logs = [{ level: 'info', message: 'hi' }];
            await commands.completeAdminProcess('proc-1', { state: 'COMPLETED', logs });

            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ logs })
            );
        });

        it('updates state only when no results fields are provided', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', { state: 'FAILED' });

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalledWith('proc-1', 'FAILED');
            expect(mockAdminProcessRepo.updateProcessResults).not.toHaveBeenCalled();
        });

        it('merges error details on failure', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            const error = {
                name: 'ValidationError',
                message: 'Invalid input',
                stack: 'Error: ...\n  at ...',
            };
            await commands.completeAdminProcess('proc-1', { state: 'FAILED', error });

            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ error })
            );
        });

        it('includes null output but skips undefined output', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', { state: 'COMPLETED', output: null });
            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ output: null })
            );

            jest.clearAllMocks();

            await commands.completeAdminProcess('proc-2', { state: 'COMPLETED' });
            expect(mockAdminProcessRepo.updateProcessResults).not.toHaveBeenCalled();
        });
    });
});
