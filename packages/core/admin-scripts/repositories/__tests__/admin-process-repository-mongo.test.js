const { AdminProcessRepositoryMongo } = require('../admin-process-repository-mongo');

describe('AdminProcessRepositoryMongo', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            adminProcess: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
        };

        repository = new AdminProcessRepositoryMongo();
        repository.prisma = mockPrisma;
    });

    describe('createProcess()', () => {
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

            mockPrisma.adminProcess.create.mockResolvedValue(mockProcess);

            const result = await repository.createProcess(params);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminProcess.create).toHaveBeenCalledWith({
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

            mockPrisma.adminProcess.create.mockResolvedValue(mockProcess);

            const result = await repository.createProcess(params);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminProcess.create).toHaveBeenCalledWith({
                data: {
                    name: params.name,
                    type: params.type,
                    context: params.context,
                    results: { logs: [] },
                },
            });
        });
    });

    describe('findProcessById()', () => {
        it('should find process by ID', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockProcess = {
                id,
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                state: 'COMPLETED',
            };

            mockPrisma.adminProcess.findUnique.mockResolvedValue(mockProcess);

            const result = await repository.findProcessById(id);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminProcess.findUnique).toHaveBeenCalledWith({
                where: { id },
            });
        });

        it('should return null if process not found', async () => {
            mockPrisma.adminProcess.findUnique.mockResolvedValue(null);

            const result = await repository.findProcessById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findProcessesByName()', () => {
        it('should find processes by name with default options', async () => {
            const name = 'test-script';
            const mockProcesses = [
                { id: '1', name, type: 'ADMIN_SCRIPT', state: 'COMPLETED' },
                { id: '2', name, type: 'ADMIN_SCRIPT', state: 'RUNNING' },
            ];

            mockPrisma.adminProcess.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findProcessesByName(name);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminProcess.findMany).toHaveBeenCalledWith({
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

            mockPrisma.adminProcess.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findProcessesByName(name, options);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminProcess.findMany).toHaveBeenCalledWith({
                where: { name },
                orderBy: { state: 'asc' },
                take: 10,
                skip: 5,
            });
        });
    });

    describe('findProcessesByState()', () => {
        it('should find processes by state', async () => {
            const state = 'RUNNING';
            const mockProcesses = [
                { id: '1', name: 'script1', type: 'ADMIN_SCRIPT', state },
                { id: '2', name: 'script2', type: 'ADMIN_SCRIPT', state },
            ];

            mockPrisma.adminProcess.findMany.mockResolvedValue(mockProcesses);

            const result = await repository.findProcessesByState(state);

            expect(result).toEqual(mockProcesses);
            expect(mockPrisma.adminProcess.findMany).toHaveBeenCalledWith({
                where: { state },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });
    });

    describe('updateProcessState()', () => {
        it('should update process state', async () => {
            const id = '507f1f77bcf86cd799439011';
            const state = 'COMPLETED';
            const mockProcess = { id, state };

            mockPrisma.adminProcess.update.mockResolvedValue(mockProcess);

            const result = await repository.updateProcessState(id, state);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminProcess.update).toHaveBeenCalledWith({
                where: { id },
                data: { state },
            });
        });
    });

    describe('updateProcessResults()', () => {
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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(mockProcess);

            const result = await repository.updateProcessResults(id, newResults);

            expect(result).toEqual(mockProcess);
            expect(mockPrisma.adminProcess.update).toHaveBeenCalledWith({
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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(mockProcess);

            const result = await repository.updateProcessResults(id, errorResults);

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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(mockProcess);

            const result = await repository.updateProcessResults(id, metricsResults);

            expect(result).toEqual(mockProcess);
        });
    });

    describe('appendProcessLog()', () => {
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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendProcessLog(id, logEntry);

            expect(result).toEqual(updatedProcess);
            expect(mockPrisma.adminProcess.update).toHaveBeenCalledWith({
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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendProcessLog(id, logEntry);

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

            mockPrisma.adminProcess.findUnique.mockResolvedValue(existingProcess);
            mockPrisma.adminProcess.update.mockResolvedValue(updatedProcess);

            const result = await repository.appendProcessLog(id, logEntry);

            expect(result).toEqual(updatedProcess);
        });

        it('should throw error if process not found', async () => {
            const id = 'nonexistent';
            const logEntry = {
                level: 'info',
                message: 'Test',
                timestamp: new Date().toISOString(),
            };

            mockPrisma.adminProcess.findUnique.mockResolvedValue(null);

            await expect(repository.appendProcessLog(id, logEntry)).rejects.toThrow(
                `AdminProcess ${id} not found`
            );
        });
    });

    describe('deleteProcessesOlderThan()', () => {
        it('should delete old processes and return count', async () => {
            const date = new Date('2024-01-01');
            const mockResult = { count: 42 };

            mockPrisma.adminProcess.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteProcessesOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 42,
            });
            expect(mockPrisma.adminProcess.deleteMany).toHaveBeenCalledWith({
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

            mockPrisma.adminProcess.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteProcessesOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 0,
            });
        });
    });
});
