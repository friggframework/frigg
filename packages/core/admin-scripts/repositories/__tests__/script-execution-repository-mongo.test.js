const {
    ScriptExecutionRepositoryMongo,
} = require('../script-execution-repository-mongo');

describe('ScriptExecutionRepositoryMongo', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            scriptExecution: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
        };

        repository = new ScriptExecutionRepositoryMongo();
        repository.prisma = mockPrisma;
    });

    describe('createExecution()', () => {
        it('should create execution with all fields', async () => {
            const params = {
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param1: 'value1' },
                audit: {
                    apiKeyName: 'Test Key',
                    apiKeyLast4: '1234',
                    ipAddress: '192.168.1.1',
                },
            };

            const mockExecution = {
                id: '507f1f77bcf86cd799439011',
                scriptName: params.scriptName,
                scriptVersion: params.scriptVersion,
                trigger: params.trigger,
                mode: params.mode,
                input: params.input,
                auditApiKeyName: params.audit.apiKeyName,
                auditApiKeyLast4: params.audit.apiKeyLast4,
                auditIpAddress: params.audit.ipAddress,
                status: 'PENDING',
                logs: [],
                createdAt: new Date(),
            };

            mockPrisma.scriptExecution.create.mockResolvedValue(mockExecution);

            const result = await repository.createExecution(params);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.create).toHaveBeenCalledWith({
                data: {
                    scriptName: params.scriptName,
                    scriptVersion: params.scriptVersion,
                    trigger: params.trigger,
                    mode: params.mode,
                    input: params.input,
                    logs: [],
                    auditApiKeyName: params.audit.apiKeyName,
                    auditApiKeyLast4: params.audit.apiKeyLast4,
                    auditIpAddress: params.audit.ipAddress,
                },
            });
        });

        it('should create execution without optional fields', async () => {
            const params = {
                scriptName: 'test-script',
                trigger: 'SCHEDULED',
            };

            const mockExecution = {
                id: '507f1f77bcf86cd799439011',
                scriptName: params.scriptName,
                trigger: params.trigger,
                mode: 'async',
                status: 'PENDING',
                logs: [],
                createdAt: new Date(),
            };

            mockPrisma.scriptExecution.create.mockResolvedValue(mockExecution);

            const result = await repository.createExecution(params);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.create).toHaveBeenCalledWith({
                data: {
                    scriptName: params.scriptName,
                    trigger: params.trigger,
                    mode: 'async',
                    input: undefined,
                    logs: [],
                },
            });
        });
    });

    describe('findExecutionById()', () => {
        it('should find execution by ID', async () => {
            const id = '507f1f77bcf86cd799439011';
            const mockExecution = {
                id,
                scriptName: 'test-script',
                status: 'COMPLETED',
            };

            mockPrisma.scriptExecution.findUnique.mockResolvedValue(
                mockExecution
            );

            const result = await repository.findExecutionById(id);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.findUnique).toHaveBeenCalledWith({
                where: { id },
            });
        });

        it('should return null if execution not found', async () => {
            mockPrisma.scriptExecution.findUnique.mockResolvedValue(null);

            const result = await repository.findExecutionById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findExecutionsByScriptName()', () => {
        it('should find executions by script name with default options', async () => {
            const scriptName = 'test-script';
            const mockExecutions = [
                { id: '1', scriptName, status: 'COMPLETED' },
                { id: '2', scriptName, status: 'RUNNING' },
            ];

            mockPrisma.scriptExecution.findMany.mockResolvedValue(
                mockExecutions
            );

            const result = await repository.findExecutionsByScriptName(
                scriptName
            );

            expect(result).toEqual(mockExecutions);
            expect(mockPrisma.scriptExecution.findMany).toHaveBeenCalledWith({
                where: { scriptName },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should find executions with custom options', async () => {
            const scriptName = 'test-script';
            const options = {
                limit: 10,
                offset: 5,
                sortBy: 'status',
                sortOrder: 'asc',
            };
            const mockExecutions = [
                { id: '1', scriptName, status: 'COMPLETED' },
            ];

            mockPrisma.scriptExecution.findMany.mockResolvedValue(
                mockExecutions
            );

            const result = await repository.findExecutionsByScriptName(
                scriptName,
                options
            );

            expect(result).toEqual(mockExecutions);
            expect(mockPrisma.scriptExecution.findMany).toHaveBeenCalledWith({
                where: { scriptName },
                orderBy: { status: 'asc' },
                take: 10,
                skip: 5,
            });
        });
    });

    describe('findExecutionsByStatus()', () => {
        it('should find executions by status', async () => {
            const status = 'RUNNING';
            const mockExecutions = [
                { id: '1', scriptName: 'script1', status },
                { id: '2', scriptName: 'script2', status },
            ];

            mockPrisma.scriptExecution.findMany.mockResolvedValue(
                mockExecutions
            );

            const result = await repository.findExecutionsByStatus(status);

            expect(result).toEqual(mockExecutions);
            expect(mockPrisma.scriptExecution.findMany).toHaveBeenCalledWith({
                where: { status },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });
    });

    describe('updateExecutionStatus()', () => {
        it('should update execution status', async () => {
            const id = '507f1f77bcf86cd799439011';
            const status = 'COMPLETED';
            const mockExecution = { id, status };

            mockPrisma.scriptExecution.update.mockResolvedValue(mockExecution);

            const result = await repository.updateExecutionStatus(id, status);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: { status },
            });
        });
    });

    describe('updateExecutionOutput()', () => {
        it('should update execution output', async () => {
            const id = '507f1f77bcf86cd799439011';
            const output = { result: 'success', data: [1, 2, 3] };
            const mockExecution = { id, output };

            mockPrisma.scriptExecution.update.mockResolvedValue(mockExecution);

            const result = await repository.updateExecutionOutput(id, output);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: { output },
            });
        });
    });

    describe('updateExecutionError()', () => {
        it('should update execution error details', async () => {
            const id = '507f1f77bcf86cd799439011';
            const error = {
                name: 'ValidationError',
                message: 'Invalid input',
                stack: 'Error: Invalid input\n  at validate(...)',
            };
            const mockExecution = {
                id,
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            };

            mockPrisma.scriptExecution.update.mockResolvedValue(mockExecution);

            const result = await repository.updateExecutionError(id, error);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    errorName: error.name,
                    errorMessage: error.message,
                    errorStack: error.stack,
                },
            });
        });
    });

    describe('updateExecutionMetrics()', () => {
        it('should update all metrics', async () => {
            const id = '507f1f77bcf86cd799439011';
            const metrics = {
                startTime: new Date('2025-01-01T10:00:00Z'),
                endTime: new Date('2025-01-01T10:05:00Z'),
                durationMs: 300000,
            };
            const mockExecution = {
                id,
                metricsStartTime: metrics.startTime,
                metricsEndTime: metrics.endTime,
                metricsDurationMs: metrics.durationMs,
            };

            mockPrisma.scriptExecution.update.mockResolvedValue(mockExecution);

            const result = await repository.updateExecutionMetrics(id, metrics);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    metricsStartTime: metrics.startTime,
                    metricsEndTime: metrics.endTime,
                    metricsDurationMs: metrics.durationMs,
                },
            });
        });

        it('should update partial metrics', async () => {
            const id = '507f1f77bcf86cd799439011';
            const metrics = {
                startTime: new Date('2025-01-01T10:00:00Z'),
            };
            const mockExecution = {
                id,
                metricsStartTime: metrics.startTime,
            };

            mockPrisma.scriptExecution.update.mockResolvedValue(mockExecution);

            const result = await repository.updateExecutionMetrics(id, metrics);

            expect(result).toEqual(mockExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: {
                    metricsStartTime: metrics.startTime,
                },
            });
        });
    });

    describe('appendExecutionLog()', () => {
        it('should append log entry to existing logs', async () => {
            const id = '507f1f77bcf86cd799439011';
            const logEntry = {
                level: 'info',
                message: 'Processing started',
                data: { step: 1 },
                timestamp: new Date().toISOString(),
            };
            const existingExecution = {
                id,
                logs: [
                    {
                        level: 'debug',
                        message: 'Initialization',
                        timestamp: new Date().toISOString(),
                    },
                ],
            };
            const updatedExecution = {
                id,
                logs: [...existingExecution.logs, logEntry],
            };

            mockPrisma.scriptExecution.findUnique.mockResolvedValue(
                existingExecution
            );
            mockPrisma.scriptExecution.update.mockResolvedValue(
                updatedExecution
            );

            const result = await repository.appendExecutionLog(id, logEntry);

            expect(result).toEqual(updatedExecution);
            expect(mockPrisma.scriptExecution.update).toHaveBeenCalledWith({
                where: { id },
                data: { logs: [...existingExecution.logs, logEntry] },
            });
        });

        it('should append log entry to empty logs array', async () => {
            const id = '507f1f77bcf86cd799439011';
            const logEntry = {
                level: 'info',
                message: 'First log',
                timestamp: new Date().toISOString(),
            };
            const existingExecution = {
                id,
                logs: [],
            };
            const updatedExecution = {
                id,
                logs: [logEntry],
            };

            mockPrisma.scriptExecution.findUnique.mockResolvedValue(
                existingExecution
            );
            mockPrisma.scriptExecution.update.mockResolvedValue(
                updatedExecution
            );

            const result = await repository.appendExecutionLog(id, logEntry);

            expect(result).toEqual(updatedExecution);
        });

        it('should throw error if execution not found', async () => {
            const id = 'nonexistent';
            const logEntry = {
                level: 'info',
                message: 'Test',
                timestamp: new Date().toISOString(),
            };

            mockPrisma.scriptExecution.findUnique.mockResolvedValue(null);

            await expect(
                repository.appendExecutionLog(id, logEntry)
            ).rejects.toThrow(`Execution ${id} not found`);
        });
    });

    describe('deleteExecutionsOlderThan()', () => {
        it('should delete old executions and return count', async () => {
            const date = new Date('2024-01-01');
            const mockResult = { count: 42 };

            mockPrisma.scriptExecution.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteExecutionsOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 42,
            });
            expect(mockPrisma.scriptExecution.deleteMany).toHaveBeenCalledWith({
                where: {
                    createdAt: {
                        lt: date,
                    },
                },
            });
        });

        it('should return zero count if no executions deleted', async () => {
            const date = new Date('2024-01-01');
            const mockResult = { count: 0 };

            mockPrisma.scriptExecution.deleteMany.mockResolvedValue(mockResult);

            const result = await repository.deleteExecutionsOlderThan(date);

            expect(result).toEqual({
                acknowledged: true,
                deletedCount: 0,
            });
        });
    });
});
