// Mock database config before imports
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock bcrypt for deterministic testing
const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock('bcryptjs', () => ({
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
}));

// Mock uuid for deterministic key generation
const mockUuid = jest.fn();
jest.mock('uuid', () => ({
    v4: mockUuid,
}));

// Mock repository factories
const mockApiKeyRepo = {
    createApiKey: jest.fn(),
    findActiveApiKeys: jest.fn(),
    findApiKeyById: jest.fn(),
    updateApiKeyLastUsed: jest.fn(),
    deactivateApiKey: jest.fn(),
};

const mockExecutionRepo = {
    createExecution: jest.fn(),
    findExecutionById: jest.fn(),
    findExecutionsByScriptName: jest.fn(),
    findExecutionsByStatus: jest.fn(),
    updateExecutionStatus: jest.fn(),
    updateExecutionOutput: jest.fn(),
    updateExecutionError: jest.fn(),
    updateExecutionMetrics: jest.fn(),
    appendExecutionLog: jest.fn(),
};

jest.mock(
    '../../../admin-scripts/repositories/admin-api-key-repository-factory',
    () => ({
        createAdminApiKeyRepository: () => mockApiKeyRepo,
    })
);

jest.mock(
    '../../../admin-scripts/repositories/script-execution-repository-factory',
    () => ({
        createScriptExecutionRepository: () => mockExecutionRepo,
    })
);

const { createAdminScriptCommands } = require('../admin-script-commands');

describe('createAdminScriptCommands', () => {
    let commands;

    beforeEach(() => {
        jest.clearAllMocks();
        commands = createAdminScriptCommands();
    });

    describe('createAdminApiKey', () => {
        it('creates API key with all fields', async () => {
            const rawKey = 'test-uuid-1234-5678-abcd';
            const keyHash = 'hashed-key';
            mockUuid.mockReturnValue(rawKey);
            mockBcryptHash.mockResolvedValue(keyHash);

            const mockRecord = {
                id: 'key-123',
                name: 'Test Key',
                keyHash,
                keyLast4: 'abcd',
                scopes: ['scripts:execute'],
                expiresAt: new Date('2025-12-31'),
            };
            mockApiKeyRepo.createApiKey.mockResolvedValue(mockRecord);

            const result = await commands.createAdminApiKey({
                name: 'Test Key',
                scopes: ['scripts:execute'],
                expiresAt: new Date('2025-12-31'),
                createdBy: 'admin@example.com',
            });

            expect(mockUuid).toHaveBeenCalled();
            expect(mockBcryptHash).toHaveBeenCalledWith(rawKey, 10);
            expect(mockApiKeyRepo.createApiKey).toHaveBeenCalledWith({
                name: 'Test Key',
                keyHash,
                keyLast4: 'abcd',
                scopes: ['scripts:execute'],
                expiresAt: new Date('2025-12-31'),
                createdBy: 'admin@example.com',
            });

            expect(result).toEqual({
                id: 'key-123',
                rawKey, // Only returned once!
                name: 'Test Key',
                keyLast4: 'abcd',
                scopes: ['scripts:execute'],
                expiresAt: new Date('2025-12-31'),
            });
        });

        it('returns rawKey only on creation', async () => {
            const rawKey = 'unique-key-12345';
            mockUuid.mockReturnValue(rawKey);
            mockBcryptHash.mockResolvedValue('hashed');

            mockApiKeyRepo.createApiKey.mockResolvedValue({
                id: 'key-1',
                name: 'Key',
                keyHash: 'hashed',
                keyLast4: '2345',
                scopes: [],
            });

            const result = await commands.createAdminApiKey({
                name: 'Key',
                scopes: [],
            });

            expect(result.rawKey).toBe(rawKey);
            expect(result.id).toBe('key-1');
        });

        it('generates unique keys on multiple calls', async () => {
            mockUuid
                .mockReturnValueOnce('key-1-uuid')
                .mockReturnValueOnce('key-2-uuid');
            mockBcryptHash
                .mockResolvedValueOnce('hash-1')
                .mockResolvedValueOnce('hash-2');

            mockApiKeyRepo.createApiKey
                .mockResolvedValueOnce({
                    id: '1',
                    name: 'First',
                    keyHash: 'hash-1',
                    keyLast4: 'uuid',
                    scopes: [],
                })
                .mockResolvedValueOnce({
                    id: '2',
                    name: 'Second',
                    keyHash: 'hash-2',
                    keyLast4: 'uuid',
                    scopes: [],
                });

            const result1 = await commands.createAdminApiKey({
                name: 'First',
                scopes: [],
            });
            const result2 = await commands.createAdminApiKey({
                name: 'Second',
                scopes: [],
            });

            expect(result1.rawKey).toBe('key-1-uuid');
            expect(result2.rawKey).toBe('key-2-uuid');
            expect(result1.id).toBe('1');
            expect(result2.id).toBe('2');
        });

        it('hashes key with bcrypt cost factor 10', async () => {
            mockUuid.mockReturnValue('test-key');
            mockBcryptHash.mockResolvedValue('hashed');
            mockApiKeyRepo.createApiKey.mockResolvedValue({
                id: '1',
                name: 'Test',
                keyHash: 'hashed',
                keyLast4: '-key',
                scopes: [],
            });

            await commands.createAdminApiKey({ name: 'Test', scopes: [] });

            expect(mockBcryptHash).toHaveBeenCalledWith('test-key', 10);
        });

        it('maps error to response on failure', async () => {
            mockUuid.mockReturnValue('key');
            mockBcryptHash.mockRejectedValue(new Error('Hashing failed'));

            const result = await commands.createAdminApiKey({
                name: 'Test',
                scopes: [],
            });

            expect(result).toHaveProperty('error', 500);
            expect(result).toHaveProperty('reason', 'Hashing failed');
        });
    });

    describe('validateAdminApiKey', () => {
        it('returns valid for correct key', async () => {
            const rawKey = 'test-key-123';
            const mockKey = {
                id: 'key-1',
                name: 'Valid Key',
                keyHash: 'hashed-test-key',
                keyLast4: '-123',
                scopes: ['scripts:execute'],
                expiresAt: null,
                isActive: true,
            };

            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue([mockKey]);
            mockBcryptCompare.mockResolvedValue(true);
            mockApiKeyRepo.updateApiKeyLastUsed.mockResolvedValue(mockKey);

            const result = await commands.validateAdminApiKey(rawKey);

            expect(mockApiKeyRepo.findActiveApiKeys).toHaveBeenCalled();
            expect(mockBcryptCompare).toHaveBeenCalledWith(
                rawKey,
                mockKey.keyHash
            );
            expect(mockApiKeyRepo.updateApiKeyLastUsed).toHaveBeenCalledWith(
                'key-1'
            );
            expect(result).toEqual({ valid: true, apiKey: mockKey });
        });

        it('returns error for invalid key', async () => {
            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue([
                { id: '1', keyHash: 'hash1' },
                { id: '2', keyHash: 'hash2' },
            ]);
            mockBcryptCompare.mockResolvedValue(false);

            const result = await commands.validateAdminApiKey('invalid-key');

            expect(result).toHaveProperty('error', 401);
            expect(result).toHaveProperty('code', 'INVALID_API_KEY');
            expect(result).toHaveProperty('reason', 'Invalid API key');
            expect(mockApiKeyRepo.updateApiKeyLastUsed).not.toHaveBeenCalled();
        });

        it('returns error for expired key', async () => {
            const expiredKey = {
                id: 'key-1',
                keyHash: 'hash',
                expiresAt: new Date('2020-01-01'), // Past date
            };

            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue([expiredKey]);
            mockBcryptCompare.mockResolvedValue(true);

            const result = await commands.validateAdminApiKey('expired-key');

            expect(result).toHaveProperty('error', 401);
            expect(result).toHaveProperty('code', 'EXPIRED_API_KEY');
            expect(result).toHaveProperty('reason', 'API key has expired');
            expect(mockApiKeyRepo.updateApiKeyLastUsed).not.toHaveBeenCalled();
        });

        it('updates lastUsedAt on success', async () => {
            const validKey = {
                id: 'key-1',
                keyHash: 'hash',
                expiresAt: null,
            };

            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue([validKey]);
            mockBcryptCompare.mockResolvedValue(true);
            mockApiKeyRepo.updateApiKeyLastUsed.mockResolvedValue({
                ...validKey,
                lastUsedAt: new Date(),
            });

            await commands.validateAdminApiKey('valid-key');

            expect(mockApiKeyRepo.updateApiKeyLastUsed).toHaveBeenCalledWith(
                'key-1'
            );
        });

        it('checks multiple keys until match found', async () => {
            const keys = [
                { id: '1', keyHash: 'hash1' },
                { id: '2', keyHash: 'hash2' },
                { id: '3', keyHash: 'hash3' },
            ];

            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue(keys);
            mockBcryptCompare
                .mockResolvedValueOnce(false) // First key doesn't match
                .mockResolvedValueOnce(true); // Second key matches
            mockApiKeyRepo.updateApiKeyLastUsed.mockResolvedValue(keys[1]);

            const result = await commands.validateAdminApiKey('test-key');

            expect(mockBcryptCompare).toHaveBeenCalledTimes(2);
            expect(result.valid).toBe(true);
            expect(result.apiKey).toEqual(keys[1]);
        });
    });

    describe('listAdminApiKeys', () => {
        it('returns active keys without keyHash', async () => {
            const mockKeys = [
                {
                    id: 'key-1',
                    name: 'First Key',
                    keyHash: 'secret-hash-1',
                    keyLast4: '1234',
                    scopes: ['scripts:execute'],
                },
                {
                    id: 'key-2',
                    name: 'Second Key',
                    keyHash: 'secret-hash-2',
                    keyLast4: '5678',
                    scopes: ['scripts:read'],
                },
            ];

            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue(mockKeys);

            const result = await commands.listAdminApiKeys();

            expect(result).toHaveLength(2);
            expect(result[0]).not.toHaveProperty('keyHash');
            expect(result[1]).not.toHaveProperty('keyHash');
            expect(result[0]).toEqual({
                id: 'key-1',
                name: 'First Key',
                keyLast4: '1234',
                scopes: ['scripts:execute'],
            });
        });

        it('returns empty array if no active keys', async () => {
            mockApiKeyRepo.findActiveApiKeys.mockResolvedValue([]);

            const result = await commands.listAdminApiKeys();

            expect(result).toEqual([]);
        });

        it('maps error on repository failure', async () => {
            mockApiKeyRepo.findActiveApiKeys.mockRejectedValue(
                new Error('Database error')
            );

            const result = await commands.listAdminApiKeys();

            expect(result).toHaveProperty('error', 500);
            expect(result).toHaveProperty('reason', 'Database error');
        });
    });

    describe('deactivateAdminApiKey', () => {
        it('deactivates existing key', async () => {
            const mockDeactivated = {
                id: 'key-1',
                isActive: false,
            };

            mockApiKeyRepo.deactivateApiKey.mockResolvedValue(mockDeactivated);

            const result = await commands.deactivateAdminApiKey('key-1');

            expect(mockApiKeyRepo.deactivateApiKey).toHaveBeenCalledWith(
                'key-1'
            );
            expect(result).toEqual(mockDeactivated);
        });

        it('handles non-existent key gracefully', async () => {
            mockApiKeyRepo.deactivateApiKey.mockRejectedValue(
                new Error('Key not found')
            );

            const result = await commands.deactivateAdminApiKey('non-existent');

            expect(result).toHaveProperty('error', 500);
            expect(result).toHaveProperty('reason', 'Key not found');
        });
    });

    describe('createScriptExecution', () => {
        it('creates execution with all fields', async () => {
            const mockExecution = {
                id: 'exec-1',
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                status: 'PENDING',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param: 'value' },
                audit: {
                    apiKeyName: 'Admin Key',
                    apiKeyLast4: '1234',
                    ipAddress: '127.0.0.1',
                },
                createdAt: new Date(),
            };

            mockExecutionRepo.createExecution.mockResolvedValue(mockExecution);

            const result = await commands.createScriptExecution({
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

            expect(mockExecutionRepo.createExecution).toHaveBeenCalledWith({
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
            expect(result).toEqual(mockExecution);
        });

        it('sets default mode to async if not provided', async () => {
            const mockExecution = {
                id: 'exec-1',
                scriptName: 'test',
                status: 'PENDING',
                trigger: 'MANUAL',
                mode: 'async',
            };

            mockExecutionRepo.createExecution.mockResolvedValue(mockExecution);

            await commands.createScriptExecution({
                scriptName: 'test',
                trigger: 'MANUAL',
            });

            expect(mockExecutionRepo.createExecution).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'async',
                })
            );
        });

        it('stores audit info correctly', async () => {
            mockExecutionRepo.createExecution.mockResolvedValue({
                id: 'exec-1',
                audit: {
                    apiKeyName: 'Test Key',
                    apiKeyLast4: 'abcd',
                    ipAddress: '192.168.1.1',
                },
            });

            await commands.createScriptExecution({
                scriptName: 'test',
                trigger: 'MANUAL',
                audit: {
                    apiKeyName: 'Test Key',
                    apiKeyLast4: 'abcd',
                    ipAddress: '192.168.1.1',
                },
            });

            expect(mockExecutionRepo.createExecution).toHaveBeenCalledWith(
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

    describe('findScriptExecutionById', () => {
        it('returns execution if found', async () => {
            const mockExecution = {
                id: 'exec-1',
                scriptName: 'test',
                status: 'COMPLETED',
            };

            mockExecutionRepo.findExecutionById.mockResolvedValue(
                mockExecution
            );

            const result = await commands.findScriptExecutionById('exec-1');

            expect(mockExecutionRepo.findExecutionById).toHaveBeenCalledWith(
                'exec-1'
            );
            expect(result).toEqual(mockExecution);
        });

        it('returns error if not found', async () => {
            mockExecutionRepo.findExecutionById.mockResolvedValue(null);

            const result = await commands.findScriptExecutionById(
                'non-existent'
            );

            expect(result).toHaveProperty('error', 404);
            expect(result).toHaveProperty('code', 'EXECUTION_NOT_FOUND');
            expect(result.reason).toContain('non-existent');
        });
    });

    describe('findScriptExecutionsByName', () => {
        it('finds executions by script name', async () => {
            const mockExecutions = [
                { id: 'exec-1', scriptName: 'test', status: 'COMPLETED' },
                { id: 'exec-2', scriptName: 'test', status: 'FAILED' },
            ];

            mockExecutionRepo.findExecutionsByScriptName.mockResolvedValue(
                mockExecutions
            );

            const result = await commands.findScriptExecutionsByName('test');

            expect(
                mockExecutionRepo.findExecutionsByScriptName
            ).toHaveBeenCalledWith('test', {});
            expect(result).toEqual(mockExecutions);
        });

        it('passes options to repository', async () => {
            mockExecutionRepo.findExecutionsByScriptName.mockResolvedValue([]);

            await commands.findScriptExecutionsByName('test', {
                limit: 10,
                offset: 5,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            });

            expect(
                mockExecutionRepo.findExecutionsByScriptName
            ).toHaveBeenCalledWith('test', {
                limit: 10,
                offset: 5,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            });
        });

        it('returns empty array on error', async () => {
            mockExecutionRepo.findExecutionsByScriptName.mockRejectedValue(
                new Error('DB error')
            );

            const result = await commands.findScriptExecutionsByName('test');

            expect(result).toEqual([]);
        });
    });

    describe('updateScriptExecutionStatus', () => {
        it('updates status correctly', async () => {
            const mockUpdated = {
                id: 'exec-1',
                status: 'RUNNING',
            };

            mockExecutionRepo.updateExecutionStatus.mockResolvedValue(
                mockUpdated
            );

            const result = await commands.updateScriptExecutionStatus(
                'exec-1',
                'RUNNING'
            );

            expect(
                mockExecutionRepo.updateExecutionStatus
            ).toHaveBeenCalledWith('exec-1', 'RUNNING');
            expect(result).toEqual(mockUpdated);
        });

        it('handles all status values', async () => {
            const statuses = [
                'PENDING',
                'RUNNING',
                'COMPLETED',
                'FAILED',
                'TIMEOUT',
                'CANCELLED',
            ];

            for (const status of statuses) {
                mockExecutionRepo.updateExecutionStatus.mockResolvedValue({
                    id: 'exec-1',
                    status,
                });

                const result = await commands.updateScriptExecutionStatus(
                    'exec-1',
                    status
                );

                expect(result.status).toBe(status);
            }
        });
    });

    describe('appendScriptExecutionLog', () => {
        it('appends log entry to logs array', async () => {
            const logEntry = {
                level: 'info',
                message: 'Test log',
                data: { detail: 'test' },
                timestamp: new Date().toISOString(),
            };

            const mockUpdated = {
                id: 'exec-1',
                logs: [logEntry],
            };

            mockExecutionRepo.appendExecutionLog.mockResolvedValue(mockUpdated);

            const result = await commands.appendScriptExecutionLog(
                'exec-1',
                logEntry
            );

            expect(mockExecutionRepo.appendExecutionLog).toHaveBeenCalledWith(
                'exec-1',
                logEntry
            );
            expect(result.logs).toContain(logEntry);
        });

        it('handles different log levels', async () => {
            const levels = ['debug', 'info', 'warn', 'error'];

            for (const level of levels) {
                const logEntry = {
                    level,
                    message: `${level} message`,
                    timestamp: new Date().toISOString(),
                };

                mockExecutionRepo.appendExecutionLog.mockResolvedValue({
                    id: 'exec-1',
                    logs: [logEntry],
                });

                await commands.appendScriptExecutionLog('exec-1', logEntry);

                expect(
                    mockExecutionRepo.appendExecutionLog
                ).toHaveBeenCalledWith(
                    'exec-1',
                    expect.objectContaining({ level })
                );
            }
        });
    });

    describe('completeScriptExecution', () => {
        it('updates status, output, error, and metrics', async () => {
            mockExecutionRepo.updateExecutionStatus.mockResolvedValue({});
            mockExecutionRepo.updateExecutionOutput.mockResolvedValue({});
            mockExecutionRepo.updateExecutionError.mockResolvedValue({});
            mockExecutionRepo.updateExecutionMetrics.mockResolvedValue({});

            const result = await commands.completeScriptExecution('exec-1', {
                status: 'COMPLETED',
                output: { result: 'success' },
                error: null,
                metrics: {
                    startTime: new Date(),
                    endTime: new Date(),
                    durationMs: 1234,
                },
            });

            expect(
                mockExecutionRepo.updateExecutionStatus
            ).toHaveBeenCalledWith('exec-1', 'COMPLETED');
            expect(
                mockExecutionRepo.updateExecutionOutput
            ).toHaveBeenCalledWith('exec-1', { result: 'success' });
            expect(
                mockExecutionRepo.updateExecutionMetrics
            ).toHaveBeenCalledWith(
                'exec-1',
                expect.objectContaining({ durationMs: 1234 })
            );
            expect(result).toEqual({ success: true });
        });

        it('handles partial updates', async () => {
            mockExecutionRepo.updateExecutionStatus.mockResolvedValue({});

            await commands.completeScriptExecution('exec-1', {
                status: 'FAILED',
                // No output, error, or metrics
            });

            expect(mockExecutionRepo.updateExecutionStatus).toHaveBeenCalled();
            expect(
                mockExecutionRepo.updateExecutionOutput
            ).not.toHaveBeenCalled();
            expect(
                mockExecutionRepo.updateExecutionError
            ).not.toHaveBeenCalled();
            expect(
                mockExecutionRepo.updateExecutionMetrics
            ).not.toHaveBeenCalled();
        });

        it('updates error details on failure', async () => {
            mockExecutionRepo.updateExecutionStatus.mockResolvedValue({});
            mockExecutionRepo.updateExecutionError.mockResolvedValue({});

            await commands.completeScriptExecution('exec-1', {
                status: 'FAILED',
                error: {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: ...\n  at ...',
                },
            });

            expect(mockExecutionRepo.updateExecutionError).toHaveBeenCalledWith(
                'exec-1',
                {
                    name: 'ValidationError',
                    message: 'Invalid input',
                    stack: 'Error: ...\n  at ...',
                }
            );
        });

        it('allows output to be null or undefined', async () => {
            mockExecutionRepo.updateExecutionStatus.mockResolvedValue({});
            mockExecutionRepo.updateExecutionOutput.mockResolvedValue({});

            // Test with null
            await commands.completeScriptExecution('exec-1', {
                status: 'COMPLETED',
                output: null,
            });

            expect(
                mockExecutionRepo.updateExecutionOutput
            ).toHaveBeenCalledWith('exec-1', null);

            jest.clearAllMocks();

            // Test with undefined (should not call update)
            await commands.completeScriptExecution('exec-2', {
                status: 'COMPLETED',
                // output is undefined
            });

            expect(
                mockExecutionRepo.updateExecutionOutput
            ).not.toHaveBeenCalled();
        });
    });

    describe('findRecentExecutions', () => {
        it('finds executions by status', async () => {
            const mockExecutions = [
                { id: 'exec-1', status: 'FAILED' },
                { id: 'exec-2', status: 'FAILED' },
            ];

            mockExecutionRepo.findExecutionsByStatus.mockResolvedValue(
                mockExecutions
            );

            const result = await commands.findRecentExecutions({
                status: 'FAILED',
            });

            expect(
                mockExecutionRepo.findExecutionsByStatus
            ).toHaveBeenCalledWith('FAILED', {
                limit: 20,
                sortBy: 'createdAt',
                sortOrder: 'desc',
            });
            expect(result).toEqual(mockExecutions);
        });

        it('uses default limit of 20', async () => {
            mockExecutionRepo.findExecutionsByStatus.mockResolvedValue([]);

            await commands.findRecentExecutions({ status: 'COMPLETED' });

            expect(
                mockExecutionRepo.findExecutionsByStatus
            ).toHaveBeenCalledWith(
                'COMPLETED',
                expect.objectContaining({ limit: 20 })
            );
        });

        it('allows custom limit', async () => {
            mockExecutionRepo.findExecutionsByStatus.mockResolvedValue([]);

            await commands.findRecentExecutions({
                status: 'RUNNING',
                limit: 50,
            });

            expect(
                mockExecutionRepo.findExecutionsByStatus
            ).toHaveBeenCalledWith(
                'RUNNING',
                expect.objectContaining({ limit: 50 })
            );
        });

        it('returns empty array if no status filter', async () => {
            const result = await commands.findRecentExecutions({});

            expect(result).toEqual([]);
            expect(
                mockExecutionRepo.findExecutionsByStatus
            ).not.toHaveBeenCalled();
        });

        it('returns empty array on error', async () => {
            mockExecutionRepo.findExecutionsByStatus.mockRejectedValue(
                new Error('DB error')
            );

            const result = await commands.findRecentExecutions({
                status: 'FAILED',
            });

            expect(result).toEqual([]);
        });
    });
});
