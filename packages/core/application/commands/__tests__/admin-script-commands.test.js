// Mock database config before imports
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock repository factories
const mockAdminProcessRepo = {
    createAdminProcess: jest.fn(),
    findAdminProcessById: jest.fn(),
    findAdminProcessesByName: jest.fn(),
    findAdminProcessesByState: jest.fn(),
    updateAdminProcessState: jest.fn(),
    updateAdminProcessOutput: jest.fn(),
    updateAdminProcessError: jest.fn(),
    updateAdminProcessMetrics: jest.fn(),
    appendAdminProcessLog: jest.fn(),
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
        it('creates admin process with all fields', async () => {
            const mockProcess = {
                id: 'proc-1',
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                state: 'PENDING',
                context: {
                    scriptVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'async',
                    input: { param: 'value' },
                    audit: {
                        apiKeyName: 'Admin Key',
                        apiKeyLast4: '1234',
                        ipAddress: '127.0.0.1',
                    },
                },
                results: {},
                createdAt: new Date(),
            };

            mockAdminProcessRepo.createAdminProcess.mockResolvedValue(mockProcess);

            const result = await commands.createAdminProcess({
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param: 'value' },
                audit: {
                    apiKeyName: 'Admin Key',
                    apiKeyLast4: '1234',
                    ipAddress: '127.0.0.1',
                },
            });

            expect(mockAdminProcessRepo.createAdminProcess).toHaveBeenCalledWith({
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param: 'value' },
                audit: {
                    apiKeyName: 'Admin Key',
                    apiKeyLast4: '1234',
                    ipAddress: '127.0.0.1',
                },
            });
            expect(result).toEqual(mockProcess);
        });

        it('sets default mode to async if not provided', async () => {
            const mockProcess = {
                id: 'proc-1',
                name: 'test',
                type: 'ADMIN_SCRIPT',
                state: 'PENDING',
                context: {
                    trigger: 'MANUAL',
                    mode: 'async',
                },
                results: {},
            };

            mockAdminProcessRepo.createAdminProcess.mockResolvedValue(mockProcess);

            await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(mockAdminProcessRepo.createAdminProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'async',
                })
            );
        });

        it('stores audit info correctly', async () => {
            mockAdminProcessRepo.createAdminProcess.mockResolvedValue({
                id: 'proc-1',
                name: 'test',
                type: 'ADMIN_SCRIPT',
                context: {
                    audit: {
                        apiKeyName: 'Test Key',
                        apiKeyLast4: 'abcd',
                        ipAddress: '192.168.1.1',
                    },
                },
                results: {},
            });

            await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'MANUAL',
                audit: {
                    apiKeyName: 'Test Key',
                    apiKeyLast4: 'abcd',
                    ipAddress: '192.168.1.1',
                },
            });

            expect(mockAdminProcessRepo.createAdminProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    audit: {
                        apiKeyName: 'Test Key',
                        apiKeyLast4: 'abcd',
                        ipAddress: '192.168.1.1',
                    },
                })
            );
        });
    });

    describe('findAdminProcessById', () => {
        it('returns admin process if found', async () => {
            const mockProcess = {
                id: 'proc-1',
                name: 'test',
                type: 'ADMIN_SCRIPT',
                state: 'COMPLETED',
                context: {},
                results: {},
            };

            mockAdminProcessRepo.findAdminProcessById.mockResolvedValue(mockProcess);

            const result = await commands.findAdminProcessById('proc-1');

            expect(mockAdminProcessRepo.findAdminProcessById).toHaveBeenCalledWith('proc-1');
            expect(result).toEqual(mockProcess);
        });

        it('returns error if not found', async () => {
            mockAdminProcessRepo.findAdminProcessById.mockResolvedValue(null);

            const result = await commands.findAdminProcessById('non-existent');

            expect(result).toHaveProperty('error', 404);
            expect(result).toHaveProperty('code', 'EXECUTION_NOT_FOUND');
            expect(result.reason).toContain('non-existent');
        });
    });

    describe('findAdminProcessesByName', () => {
        it('finds admin processes by script name', async () => {
            const mockProcesses = [
                { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT', state: 'COMPLETED', context: {}, results: {} },
                { id: 'proc-2', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
            ];

            mockAdminProcessRepo.findAdminProcessesByName.mockResolvedValue(
                mockProcesses
            );

            const result = await commands.findAdminProcessesByName('test');

            expect(mockAdminProcessRepo.findAdminProcessesByName).toHaveBeenCalledWith(
                'test',
                {}
            );
            expect(result).toEqual(mockProcesses);
        });

        it('passes options to repository', async () => {
            mockAdminProcessRepo.findAdminProcessesByName.mockResolvedValue([]);

            await commands.findAdminProcessesByName('test', {
                limit: 10,
                offset: 5,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            });

            expect(mockAdminProcessRepo.findAdminProcessesByName).toHaveBeenCalledWith(
                'test',
                {
                    limit: 10,
                    offset: 5,
                    sortBy: 'createdAt',
                    sortOrder: 'desc',
                }
            );
        });

        it('returns empty array on error', async () => {
            mockAdminProcessRepo.findAdminProcessesByName.mockRejectedValue(
                new Error('DB error')
            );

            const result = await commands.findAdminProcessesByName('test');

            expect(result).toEqual([]);
        });
    });

    describe('updateAdminProcessState', () => {
        it('updates state correctly', async () => {
            const mockUpdated = {
                id: 'proc-1',
                name: 'test',
                type: 'ADMIN_SCRIPT',
                state: 'RUNNING',
                context: {},
                results: {},
            };

            mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue(mockUpdated);

            const result = await commands.updateAdminProcessState(
                'proc-1',
                'RUNNING'
            );

            expect(mockAdminProcessRepo.updateAdminProcessState).toHaveBeenCalledWith(
                'proc-1',
                'RUNNING'
            );
            expect(result).toEqual(mockUpdated);
        });

        it('handles all state values', async () => {
            const states = [
                'PENDING',
                'RUNNING',
                'COMPLETED',
                'FAILED',
            ];

            for (const state of states) {
                mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue({
                    id: 'proc-1',
                    name: 'test',
                    type: 'ADMIN_SCRIPT',
                    state,
                    context: {},
                    results: {},
                });

                const result = await commands.updateAdminProcessState(
                    'proc-1',
                    state
                );

                expect(result.state).toBe(state);
            }
        });
    });

    describe('appendAdminProcessLog', () => {
        it('appends log entry to results.logs array', async () => {
            const logEntry = {
                level: 'info',
                message: 'Test log',
                data: { detail: 'test' },
                timestamp: new Date().toISOString(),
            };

            const mockUpdated = {
                id: 'proc-1',
                name: 'test',
                type: 'ADMIN_SCRIPT',
                state: 'RUNNING',
                context: {},
                results: {
                    logs: [logEntry],
                },
            };

            mockAdminProcessRepo.appendAdminProcessLog.mockResolvedValue(mockUpdated);

            const result = await commands.appendAdminProcessLog('proc-1', logEntry);

            expect(mockAdminProcessRepo.appendAdminProcessLog).toHaveBeenCalledWith(
                'proc-1',
                logEntry
            );
            expect(result.results.logs).toContain(logEntry);
        });

        it('handles different log levels', async () => {
            const levels = ['debug', 'info', 'warn', 'error'];

            for (const level of levels) {
                const logEntry = {
                    level,
                    message: `${level} message`,
                    timestamp: new Date().toISOString(),
                };

                mockAdminProcessRepo.appendAdminProcessLog.mockResolvedValue({
                    id: 'proc-1',
                    name: 'test',
                    type: 'ADMIN_SCRIPT',
                    state: 'RUNNING',
                    context: {},
                    results: {
                        logs: [logEntry],
                    },
                });

                await commands.appendAdminProcessLog('proc-1', logEntry);

                expect(mockAdminProcessRepo.appendAdminProcessLog).toHaveBeenCalledWith(
                    'proc-1',
                    expect.objectContaining({ level })
                );
            }
        });
    });

    describe('completeAdminProcess', () => {
        it('updates state, output, error, and metrics', async () => {
            mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateAdminProcessOutput.mockResolvedValue({});
            mockAdminProcessRepo.updateAdminProcessError.mockResolvedValue({});
            mockAdminProcessRepo.updateAdminProcessMetrics.mockResolvedValue({});

            const result = await commands.completeAdminProcess('proc-1', {
                state: 'COMPLETED',
                output: { result: 'success' },
                error: null,
                metrics: {
                    startTime: new Date(),
                    endTime: new Date(),
                    durationMs: 1234,
                },
            });

            expect(mockAdminProcessRepo.updateAdminProcessState).toHaveBeenCalledWith(
                'proc-1',
                'COMPLETED'
            );
            expect(mockAdminProcessRepo.updateAdminProcessOutput).toHaveBeenCalledWith(
                'proc-1',
                { result: 'success' }
            );
            expect(mockAdminProcessRepo.updateAdminProcessMetrics).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({ durationMs: 1234 })
            );
            expect(result).toEqual({ success: true });
        });

        it('handles partial updates', async () => {
            mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', {
                state: 'FAILED',
                // No output, error, or metrics
            });

            expect(mockAdminProcessRepo.updateAdminProcessState).toHaveBeenCalled();
            expect(mockAdminProcessRepo.updateAdminProcessOutput).not.toHaveBeenCalled();
            expect(mockAdminProcessRepo.updateAdminProcessError).not.toHaveBeenCalled();
            expect(mockAdminProcessRepo.updateAdminProcessMetrics).not.toHaveBeenCalled();
        });

        it('updates error details on failure', async () => {
            mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateAdminProcessError.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', {
                state: 'FAILED',
                error: {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: ...\n  at ...',
                },
            });

            expect(mockAdminProcessRepo.updateAdminProcessError).toHaveBeenCalledWith(
                'proc-1',
                {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: ...\n  at ...',
                }
            );
        });

        it('allows output to be null or undefined', async () => {
            mockAdminProcessRepo.updateAdminProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateAdminProcessOutput.mockResolvedValue({});

            // Test with null
            await commands.completeAdminProcess('proc-1', {
                state: 'COMPLETED',
                output: null,
            });

            expect(mockAdminProcessRepo.updateAdminProcessOutput).toHaveBeenCalledWith(
                'proc-1',
                null
            );

            jest.clearAllMocks();

            // Test with undefined (should not call update)
            await commands.completeAdminProcess('proc-2', {
                state: 'COMPLETED',
                // output is undefined
            });

            expect(mockAdminProcessRepo.updateAdminProcessOutput).not.toHaveBeenCalled();
        });
    });

    describe('findRecentAdminProcesses', () => {
        it('finds admin processes by state', async () => {
            const mockProcesses = [
                { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
                { id: 'proc-2', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
            ];

            mockAdminProcessRepo.findAdminProcessesByState.mockResolvedValue(mockProcesses);

            const result = await commands.findRecentAdminProcesses({ state: 'FAILED' });

            expect(mockAdminProcessRepo.findAdminProcessesByState).toHaveBeenCalledWith(
                'FAILED',
                {
                    limit: 20,
                    sortBy: 'createdAt',
                    sortOrder: 'desc',
                }
            );
            expect(result).toEqual(mockProcesses);
        });

        it('uses default limit of 20', async () => {
            mockAdminProcessRepo.findAdminProcessesByState.mockResolvedValue([]);

            await commands.findRecentAdminProcesses({ state: 'COMPLETED' });

            expect(mockAdminProcessRepo.findAdminProcessesByState).toHaveBeenCalledWith(
                'COMPLETED',
                expect.objectContaining({ limit: 20 })
            );
        });

        it('allows custom limit', async () => {
            mockAdminProcessRepo.findAdminProcessesByState.mockResolvedValue([]);

            await commands.findRecentAdminProcesses({
                state: 'RUNNING',
                limit: 50,
            });

            expect(mockAdminProcessRepo.findAdminProcessesByState).toHaveBeenCalledWith(
                'RUNNING',
                expect.objectContaining({ limit: 50 })
            );
        });

        it('returns empty array if no state filter', async () => {
            const result = await commands.findRecentAdminProcesses({});

            expect(result).toEqual([]);
            expect(mockAdminProcessRepo.findAdminProcessesByState).not.toHaveBeenCalled();
        });

        it('returns empty array on error', async () => {
            mockAdminProcessRepo.findAdminProcessesByState.mockRejectedValue(
                new Error('DB error')
            );

            const result = await commands.findRecentAdminProcesses({ state: 'FAILED' });

            expect(result).toEqual([]);
        });
    });
});
