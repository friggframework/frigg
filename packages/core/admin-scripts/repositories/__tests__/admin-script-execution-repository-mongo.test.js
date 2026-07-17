const { AdminScriptExecutionRepositoryMongo } = require('../admin-script-execution-repository-mongo');

describe('AdminScriptExecutionRepositoryMongo', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            adminScriptExecution: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
        };

        repository = new AdminScriptExecutionRepositoryMongo();
        repository.prisma = mockPrisma;
    });

    describe('createExecution()', () => {
        it('should create process with all fields', async () => {
            const params = {
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                context: {
                    scriptVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'async',
                    input: { param1: 'value1' },
                    audit: {
                        apiKeyName: 'Test Key',
                        apiKeyLast4: '1234',
                        ipAddress: '192.168.1.1',
                    },
                },
            };

            const mockProcess = {
                id: '507f1f77bcf86cd799439011',
                name: params.name,
                type: params.type,
                state: 'PENDING',
                context: params.context,
                results: { logs: [] },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.adminScriptExecution.create.mockResolvedValue(mockProcess);

            const result = await repository.createExecution(params);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminScriptExecution.create).toHaveBeenCalledWith({
                data: {
                    name: params.name,
                    type: params.type,
                    context: params.context,
                    results: { logs: [] },
                },
            });
        });

        it('should create process without optional fields', async () => {
            const params = {
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                context: {
                    trigger: 'SCHEDULED',
                },
            };

            const mockProcess = {
                id: '507f1f77bcf86cd799439011',
                name: params.name,
                type: params.type,
                state: 'PENDING',
                context: params.context,
                results: { logs: [] },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockPrisma.adminScriptExecution.create.mockResolvedValue(mockProcess);

            const result = await repository.createExecution(params);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminScriptExecution.create).toHaveBeenCalledWith({
                data: {
                    name: params.name,
                    type: params.type,
                    context: params.context,
                    results: { logs: [] },
                },
            });
        });

        it('should write parentExecutionId to the column when provided', async () => {
            mockPrisma.adminScriptExecution.create.mockResolvedValue({ id: 'x' });

            await repository.createExecution({
                name: 'child',
                type: 'ADMIN_SCRIPT',
                context: { trigger: 'QUEUE' },
                parentExecutionId: '507f1f77bcf86cd799439011',
            });

            const data =
                mockPrisma.adminScriptExecution.create.mock.calls[0][0].data;
            expect(data.parentExecutionId).toBe('507f1f77bcf86cd799439011');
        });
    });

    describe('findExecutionById()', () => {
        it('should find process by ID', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockProcess = {
                id,
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                state: 'COMPLETED',
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(mockProcess);

            const result = await repository.findExecutionById(id);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminScriptExecution.findUnique).toHaveBeenCalledWith({
                where: { id },
            });
        });

        it('should return null if process not found', async () => {
            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(null);

            const result = await repository.findExecutionById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findExecutionsByName()', () => {
        it('should find processes by name with default options', async () => {
            const name = 'test-script';
            const mockProcesses = [
                { id: '1', name, type: 'ADMIN_SCRIPT', state: 'COMPLETED' },
                { id: '2', name, type: 'ADMIN_SCRIPT', state: 'RUNNING' },
            ];

            mockPrisma.adminScriptExecution.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findExecutionsByName(name);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should find processes with custom options', async () => {
            const name = 'test-script';
            const options = {
                limit: 10,
                offset: 5,
                sortBy: 'state',
                sortOrder: 'asc',
            };
            const mockProcesses = [{ id: '1', name, type: 'ADMIN_SCRIPT', state: 'COMPLETED' }];

            mockPrisma.adminScriptExecution.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findExecutionsByName(name, options);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name },
                orderBy: { state: 'asc' },
                take: 10,
                skip: 5,
            });
        });

        it('should filter by type when provided', async () => {
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', { type: 'REPORT' });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name: 'nightly', type: 'REPORT' },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should apply a createdAt window with both bounds', async () => {
            const from = new Date('2025-01-01');
            const to = new Date('2025-02-01');
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', {
                type: 'REPORT',
                from,
                to,
            });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: {
                    name: 'nightly',
                    type: 'REPORT',
                    createdAt: { gte: from, lte: to },
                },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should include only the createdAt bound provided', async () => {
            const from = new Date('2025-01-01');
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', { from });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name: 'nightly', createdAt: { gte: from } },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });
    });

    describe('findExecutionsByState()', () => {
        it('should find processes by state', async () => {
            const state = 'RUNNING';
            const mockProcesses = [
                { id: '1', name: 'script1', type: 'ADMIN_SCRIPT', state },
                { id: '2', name: 'script2', type: 'ADMIN_SCRIPT', state },
            ];

            mockPrisma.adminScriptExecution.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findExecutionsByState(state);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { state },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });
    });

    describe('updateExecutionState()', () => {
        it('should update process state', async () => {
            const id = '507f1f77bcf86cd799439011';
            const state = 'COMPLETED';
            const mockProcess = { id, state };

            mockPrisma.adminScriptExecution.update.mockResolvedValue(mockProcess);

            const result = await repository.updateExecutionState(id, state);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminScriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: { state },
            });
        });
    });

    describe('updateExecutionResults()', () => {
        it('should merge new results with existing results', async () => {
            const id = '507f1f77bcf86cd799439011';
            const existingProcess = {
                id,
                results: { logs: ['log1'] },
            };
            const newResults = { output: { result: 'success', data: [1, 2, 3] } };
            const mockProcess = {
                id,
                results: { logs: ['log1'], output: { result: 'success', data: [1, 2, 3] } },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(mockProcess);

            const result = await repository.updateExecutionResults(id, newResults);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminScriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    results: { logs: ['log1'], output: { result: 'success', data: [1, 2, 3] } },
                },
            });
        });

        it('should handle error information in results', async () => {
            const id = '507f1f77bcf86cd799439011';
            const existingProcess = {
                id,
                results: { logs: [] },
            };
            const errorResults = {
                error: {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: Invalid input\n  at validate(...)',
                },
            };
            const mockProcess = {
                id,
                results: { logs: [], error: errorResults.error },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(mockProcess);

            const result = await repository.updateExecutionResults(id, errorResults);

            expect(result).toEqual(mockProcess);
        });

        it('should handle metrics in results', async () => {
            const id = '507f1f77bcf86cd799439011';
            const existingProcess = {
                id,
                results: { logs: [] },
            };
            const metricsResults = {
                metrics: {
                    startTime: new Date('2025-01-01T10:00:00Z'),
                    endTime: new Date('2025-01-01T10:05:00Z'),
                    durationMs: 300000,
                },
            };
            const mockProcess = {
                id,
                results: { logs: [], metrics: metricsResults.metrics },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(mockProcess);

            const result = await repository.updateExecutionResults(id, metricsResults);

            expect(result).toEqual(mockProcess);
        });
    });

    describe('appendExecutionLog()', () => {
        it('should append log entry to existing logs in results', async () => {
            const id = '507f1f77bcf86cd799439011';
            const logEntry = {
                level: 'info',
                message: 'Processing started',
                data: { step: 1 },
                timestamp: new Date().toISOString(),
            };
            const existingProcess = {
                id,
                results: {
                    logs: [
                        { level: 'debug', message: 'Initialization', timestamp: new Date().toISOString() },
                    ],
                },
            };
            const updatedProcess = {
                id,
                results: {
                    logs: [...existingProcess.results.logs, logEntry],
                },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendExecutionLog(id, logEntry);

            expect(result).toEqual(updatedProcess);
            expect(mockPrisma.adminScriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: { results: { logs: [...existingProcess.results.logs, logEntry] } },
            });
        });

        it('should append log entry to empty logs array', async () => {
            const id = '507f1f77bcf86cd799439011';
            const logEntry = {
                level: 'info',
                message: 'First log',
                timestamp: new Date().toISOString(),
            };
            const existingProcess = {
                id,
                results: { logs: [] },
            };
            const updatedProcess = {
                id,
                results: { logs: [logEntry] },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendExecutionLog(id, logEntry);

            expect(result).toEqual(updatedProcess);
        });

        it('should initialize logs array if results.logs is missing', async () => {
            const id = '507f1f77bcf86cd799439011';
            const logEntry = {
                level: 'info',
                message: 'First log',
                timestamp: new Date().toISOString(),
            };
            const existingProcess = {
                id,
                results: {},
            };
            const updatedProcess = {
                id,
                results: { logs: [logEntry] },
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminScriptExecution.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendExecutionLog(id, logEntry);

            expect(result).toEqual(updatedProcess);
        });

        it('should throw error if process not found', async () => {
            const id = 'nonexistent';
            const logEntry = {
                level: 'info',
                message: 'Test',
                timestamp: new Date().toISOString(),
            };

            mockPrisma.adminScriptExecution.findUnique.mockResolvedValue(null);

            await expect(repository.appendExecutionLog(id, logEntry)).rejects.toThrow(
                `AdminScriptExecution ${id} not found`
            );
        });
    });

    describe('deleteExecutionsOlderThan()', () => {
        it('should delete old processes and return count', async () => {
            const date = new Date('2024-01-01');
            const mockResult = { count: 42 };

            mockPrisma.adminScriptExecution.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteExecutionsOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 42,
            });
            expect(mockPrisma.adminScriptExecution.deleteMany).toHaveBeenCalledWith({
                where: {
                    createdAt: {
                        lt: date,
                    },
                },
            });
        });

        it('should return zero count if no processes deleted', async () => {
            const date = new Date('2024-01-01');
            const mockResult = { count: 0 };

            mockPrisma.adminScriptExecution.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteExecutionsOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 0,
            });
        });

        it('should scope the delete by type when provided', async () => {
            const date = new Date('2024-01-01');
            mockPrisma.adminScriptExecution.deleteMany.mockResolvedValue({
                count: 3,
            });

            await repository.deleteExecutionsOlderThan(date, { type: 'REPORT' });

            expect(mockPrisma.adminScriptExecution.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: date }, type: 'REPORT' },
            });
        });
    });
});
