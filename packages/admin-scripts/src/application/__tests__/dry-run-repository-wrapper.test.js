const { createDryRunWrapper, wrapAdminFriggCommandsForDryRun, sanitizeArgs } = require('../dry-run-repository-wrapper');

describe('Dry-Run Repository Wrapper', () => {
    describe('createDryRunWrapper', () => {
        let mockRepository;
        let operationLog;

        beforeEach(() => {
            operationLog = [];
            mockRepository = {
                // Read operations
                findById: jest.fn(async (id) => ({ id, name: 'Test Entity' })),
                findAll: jest.fn(async () => [{ id: '1' }, { id: '2' }]),
                getStatus: jest.fn(() => 'active'),

                // Write operations
                create: jest.fn(async (data) => ({ id: 'new-id', ...data })),
                update: jest.fn(async (id, data) => ({ id, ...data })),
                delete: jest.fn(async (id) => ({ deletedCount: 1 })),
                updateStatus: jest.fn(async (id, status) => ({ id, status })),
            };
        });

        test('should pass through read operations unchanged', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            // Call read operations
            const byId = await wrapped.findById('123');
            const all = await wrapped.findAll();
            const status = wrapped.getStatus();

            // Verify original methods were called
            expect(mockRepository.findById).toHaveBeenCalledWith('123');
            expect(mockRepository.findAll).toHaveBeenCalled();
            expect(mockRepository.getStatus).toHaveBeenCalled();

            // Verify results match
            expect(byId).toEqual({ id: '123', name: 'Test Entity' });
            expect(all).toHaveLength(2);
            expect(status).toBe('active');

            // No operations should be logged
            expect(operationLog).toHaveLength(0);
        });

        test('should intercept and log write operations', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            // Call write operations
            await wrapped.create({ name: 'New Entity' });
            await wrapped.update('123', { name: 'Updated' });
            await wrapped.delete('456');

            // Original write methods should NOT be called
            expect(mockRepository.create).not.toHaveBeenCalled();
            expect(mockRepository.update).not.toHaveBeenCalled();
            expect(mockRepository.delete).not.toHaveBeenCalled();

            // All operations should be logged
            expect(operationLog).toHaveLength(3);

            expect(operationLog[0]).toMatchObject({
                operation: 'CREATE',
                model: 'TestModel',
                method: 'create',
            });

            expect(operationLog[1]).toMatchObject({
                operation: 'UPDATE',
                model: 'TestModel',
                method: 'update',
            });

            expect(operationLog[2]).toMatchObject({
                operation: 'DELETE',
                model: 'TestModel',
                method: 'delete',
            });
        });

        test('should return mock data for create operations', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            const result = await wrapped.create({ name: 'Test', value: 42 });

            expect(result).toMatchObject({
                name: 'Test',
                value: 42,
                _dryRun: true,
            });

            expect(result.id).toMatch(/^dry-run-/);
            expect(result.createdAt).toBeDefined();
        });

        test('should return mock data for update operations', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            const result = await wrapped.update('123', { status: 'inactive' });

            expect(result).toMatchObject({
                id: '123',
                status: 'inactive',
                _dryRun: true,
            });
        });

        test('should return mock data for delete operations', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            const result = await wrapped.delete('123');

            expect(result).toEqual({
                deletedCount: 1,
                _dryRun: true,
            });
        });

        test('should try to return existing data for updates when possible', async () => {
            const wrapped = createDryRunWrapper(mockRepository, operationLog, 'TestModel');

            const result = await wrapped.updateStatus('123', 'inactive');

            // Should attempt to read existing data
            expect(mockRepository.findById).toHaveBeenCalledWith('123');

            // If found, should return existing merged with updates
            expect(result.id).toBe('123');
        });
    });

    describe('sanitizeArgs', () => {
        test('should redact sensitive fields in objects', () => {
            const args = [
                {
                    id: '123',
                    password: 'secret123',
                    token: 'abc-def-ghi',
                    apiKey: 'sk_live_123',
                    name: 'Test User',
                },
            ];

            const sanitized = sanitizeArgs(args);

            expect(sanitized[0]).toEqual({
                id: '123',
                password: '[REDACTED]',
                token: '[REDACTED]',
                apiKey: '[REDACTED]',
                name: 'Test User',
            });
        });

        test('should handle nested objects', () => {
            const args = [
                {
                    user: {
                        name: 'Test',
                        credentials: {
                            password: 'secret',
                            apiToken: 'token123',
                        },
                    },
                },
            ];

            const sanitized = sanitizeArgs(args);

            expect(sanitized[0].user.name).toBe('Test');
            expect(sanitized[0].user.credentials.password).toBe('[REDACTED]');
            expect(sanitized[0].user.credentials.apiToken).toBe('[REDACTED]');
        });

        test('should handle arrays', () => {
            const args = [
                [
                    { id: '1', token: 'abc' },
                    { id: '2', secret: 'xyz' },
                ],
            ];

            const sanitized = sanitizeArgs(args);

            expect(sanitized[0][0].token).toBe('[REDACTED]');
            expect(sanitized[0][1].secret).toBe('[REDACTED]');
        });

        test('should preserve primitives', () => {
            const args = ['string', 123, true, null, undefined];
            const sanitized = sanitizeArgs(args);

            expect(sanitized).toEqual(['string', 123, true, null, undefined]);
        });
    });

    describe('wrapAdminFriggCommandsForDryRun', () => {
        let mockCommands;
        let operationLog;

        beforeEach(() => {
            operationLog = [];
            mockCommands = {
                // Read operations
                findIntegrationById: jest.fn(async (id) => ({ id, status: 'active' })),
                listIntegrations: jest.fn(async () => []),

                // Write operations
                updateIntegrationConfig: jest.fn(async (id, config) => ({ id, config })),
                updateIntegrationStatus: jest.fn(async (id, status) => ({ id, status })),
                updateCredential: jest.fn(async (id, updates) => ({ id, ...updates })),

                // Other methods
                log: jest.fn(),
            };
        });

        test('should pass through read operations', async () => {
            const wrapped = wrapAdminFriggCommandsForDryRun(mockCommands, operationLog);

            const integration = await wrapped.findIntegrationById('123');
            const list = await wrapped.listIntegrations();

            expect(mockCommands.findIntegrationById).toHaveBeenCalledWith('123');
            expect(mockCommands.listIntegrations).toHaveBeenCalled();

            expect(integration.id).toBe('123');
            expect(operationLog).toHaveLength(0);
        });

        test('should intercept write operations', async () => {
            const wrapped = wrapAdminFriggCommandsForDryRun(mockCommands, operationLog);

            await wrapped.updateIntegrationConfig('123', { setting: 'value' });
            await wrapped.updateIntegrationStatus('456', 'inactive');

            expect(mockCommands.updateIntegrationConfig).not.toHaveBeenCalled();
            expect(mockCommands.updateIntegrationStatus).not.toHaveBeenCalled();

            expect(operationLog).toHaveLength(2);
            expect(operationLog[0].operation).toBe('UPDATEINTEGRATIONCONFIG');
            expect(operationLog[1].operation).toBe('UPDATEINTEGRATIONSTATUS');
        });

        test('should return existing data for known update methods', async () => {
            const wrapped = wrapAdminFriggCommandsForDryRun(mockCommands, operationLog);

            const result = await wrapped.updateIntegrationConfig('123', { new: 'config' });

            // Should have tried to fetch existing
            expect(mockCommands.findIntegrationById).toHaveBeenCalledWith('123');

            // Should return existing data
            expect(result.id).toBe('123');
        });
    });
});
