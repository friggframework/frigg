// Mock database config before imports
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock repository factories - uses interface method names
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

const mockScheduleRepo = {
    findScheduleByScriptName: jest.fn(),
    upsertSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
    updateScheduleExternalInfo: jest.fn(),
    updateScheduleLastTriggered: jest.fn(),
    updateScheduleNextTrigger: jest.fn(),
    listSchedules: jest.fn(),
};

jest.mock('../../../admin-scripts/repositories/script-schedule-repository-factory', () => ({
    createScriptScheduleRepository: () => mockScheduleRepo,
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

            mockAdminProcessRepo.createProcess.mockResolvedValue(mockProcess);

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

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith({
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
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

            mockAdminProcessRepo.createProcess.mockResolvedValue(mockProcess);

            await commands.createAdminProcess({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'test',
                    type: 'ADMIN_SCRIPT',
                    context: expect.objectContaining({
                        mode: 'async',
                    }),
                })
            );
        });

        it('stores audit info correctly', async () => {
            mockAdminProcessRepo.createProcess.mockResolvedValue({
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

            expect(mockAdminProcessRepo.createProcess).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({
                        audit: {
                            apiKeyName: 'Test Key',
                            apiKeyLast4: 'abcd',
                            ipAddress: '192.168.1.1',
                        },
                    }),
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
                { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT', state: 'COMPLETED', context: {}, results: {} },
                { id: 'proc-2', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
            ];

            mockAdminProcessRepo.findProcessesByName.mockResolvedValue(
                mockProcesses
            );

            const result = await commands.findAdminProcessesByName('test');

            expect(mockAdminProcessRepo.findProcessesByName).toHaveBeenCalledWith(
                'test',
                {}
            );
            expect(result).toEqual(mockProcesses);
        });

        it('passes options to repository', async () => {
            mockAdminProcessRepo.findProcessesByName.mockResolvedValue([]);

            await commands.findAdminProcessesByName('test', {
                limit: 10,
                offset: 5,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            });

            expect(mockAdminProcessRepo.findProcessesByName).toHaveBeenCalledWith(
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
            mockAdminProcessRepo.findProcessesByName.mockRejectedValue(
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

            mockAdminProcessRepo.updateProcessState.mockResolvedValue(mockUpdated);

            const result = await commands.updateAdminProcessState(
                'proc-1',
                'RUNNING'
            );

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalledWith(
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
                mockAdminProcessRepo.updateProcessState.mockResolvedValue({
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

            mockAdminProcessRepo.appendProcessLog.mockResolvedValue(mockUpdated);

            const result = await commands.appendAdminProcessLog('proc-1', logEntry);

            expect(mockAdminProcessRepo.appendProcessLog).toHaveBeenCalledWith(
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

                mockAdminProcessRepo.appendProcessLog.mockResolvedValue({
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

                expect(mockAdminProcessRepo.appendProcessLog).toHaveBeenCalledWith(
                    'proc-1',
                    expect.objectContaining({ level })
                );
            }
        });
    });

    describe('completeAdminProcess', () => {
        it('updates state, output, and metrics via updateProcessResults', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            const metrics = {
                startTime: new Date(),
                endTime: new Date(),
                durationMs: 1234,
            };

            const result = await commands.completeAdminProcess('proc-1', {
                state: 'COMPLETED',
                output: { result: 'success' },
                error: null,
                metrics,
            });

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalledWith(
                'proc-1',
                'COMPLETED'
            );
            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                expect.objectContaining({
                    output: { result: 'success' },
                    metrics: expect.objectContaining({ durationMs: 1234 }),
                })
            );
            expect(result).toEqual({ success: true });
        });

        it('handles partial updates - state only', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', {
                state: 'FAILED',
                // No output, error, or metrics
            });

            expect(mockAdminProcessRepo.updateProcessState).toHaveBeenCalled();
            expect(mockAdminProcessRepo.updateProcessResults).not.toHaveBeenCalled();
        });

        it('updates error details on failure via updateProcessResults', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            await commands.completeAdminProcess('proc-1', {
                state: 'FAILED',
                error: {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: ...\n  at ...',
                },
            });

            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                {
                    error: {
                        name: 'ValidationError',
                        message: 'Invalid input',
                        stack: 'Error: ...\n  at ...',
                    },
                }
            );
        });

        it('allows output to be null or undefined', async () => {
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});
            mockAdminProcessRepo.updateProcessResults.mockResolvedValue({});

            // Test with null - output: null should be included in results
            await commands.completeAdminProcess('proc-1', {
                state: 'COMPLETED',
                output: null,
            });

            expect(mockAdminProcessRepo.updateProcessResults).toHaveBeenCalledWith(
                'proc-1',
                { output: null }
            );

            jest.clearAllMocks();

            // Test with undefined (should not include output in results)
            mockAdminProcessRepo.updateProcessState.mockResolvedValue({});

            await commands.completeAdminProcess('proc-2', {
                state: 'COMPLETED',
                // output is undefined
            });

            // No results to update, so updateProcessResults should not be called
            expect(mockAdminProcessRepo.updateProcessResults).not.toHaveBeenCalled();
        });
    });

    describe('findRecentAdminProcesses', () => {
        it('finds admin processes by state', async () => {
            const mockProcesses = [
                { id: 'proc-1', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
                { id: 'proc-2', name: 'test', type: 'ADMIN_SCRIPT', state: 'FAILED', context: {}, results: {} },
            ];

            mockAdminProcessRepo.findProcessesByState.mockResolvedValue(mockProcesses);

            const result = await commands.findRecentAdminProcesses({ state: 'FAILED' });

            expect(mockAdminProcessRepo.findProcessesByState).toHaveBeenCalledWith(
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
            mockAdminProcessRepo.findProcessesByState.mockResolvedValue([]);

            await commands.findRecentAdminProcesses({ state: 'COMPLETED' });

            expect(mockAdminProcessRepo.findProcessesByState).toHaveBeenCalledWith(
                'COMPLETED',
                expect.objectContaining({ limit: 20 })
            );
        });

        it('allows custom limit', async () => {
            mockAdminProcessRepo.findProcessesByState.mockResolvedValue([]);

            await commands.findRecentAdminProcesses({
                state: 'RUNNING',
                limit: 50,
            });

            expect(mockAdminProcessRepo.findProcessesByState).toHaveBeenCalledWith(
                'RUNNING',
                expect.objectContaining({ limit: 50 })
            );
        });

        it('returns empty array if no state filter', async () => {
            const result = await commands.findRecentAdminProcesses({});

            expect(result).toEqual([]);
            expect(mockAdminProcessRepo.findProcessesByState).not.toHaveBeenCalled();
        });

        it('returns empty array on error', async () => {
            mockAdminProcessRepo.findProcessesByState.mockRejectedValue(
                new Error('DB error')
            );

            const result = await commands.findRecentAdminProcesses({ state: 'FAILED' });

            expect(result).toEqual([]);
        });
    });
});
