const {
    AdminScriptContext,
    createAdminScriptContext,
} = require('../admin-frigg-commands');

// Mock all repository factories
jest.mock(
    '@friggframework/core/integrations/repositories/integration-repository-factory'
);
jest.mock('@friggframework/core/user/repositories/user-repository-factory');
jest.mock(
    '@friggframework/core/modules/repositories/module-repository-factory'
);
jest.mock(
    '@friggframework/core/credential/repositories/credential-repository-factory'
);
jest.mock('@friggframework/core/queues');

describe('AdminScriptContext', () => {
    let mockIntegrationRepo;
    let mockUserRepo;
    let mockModuleRepo;
    let mockCredentialRepo;
    let mockQueuerUtil;

    beforeEach(() => {
        jest.clearAllMocks();

        mockIntegrationRepo = {
            findIntegrations: jest.fn(),
            findIntegrationById: jest.fn(),
            findIntegrationsByUserId: jest.fn(),
            updateIntegrationConfig: jest.fn(),
            updateIntegrationStatus: jest.fn(),
        };

        mockUserRepo = {
            findIndividualUserById: jest.fn(),
            findIndividualUserByAppUserId: jest.fn(),
            findIndividualUserByUsername: jest.fn(),
        };

        mockModuleRepo = {
            findEntity: jest.fn(),
            findEntityById: jest.fn(),
            findEntitiesByUserId: jest.fn(),
        };

        mockCredentialRepo = {
            findCredential: jest.fn(),
            updateCredential: jest.fn(),
        };

        mockQueuerUtil = {
            send: jest.fn().mockResolvedValue(undefined),
            batchSend: jest.fn().mockResolvedValue(undefined),
        };

        const {
            createIntegrationRepository,
        } = require('@friggframework/core/integrations/repositories/integration-repository-factory');
        const {
            createUserRepository,
        } = require('@friggframework/core/user/repositories/user-repository-factory');
        const {
            createModuleRepository,
        } = require('@friggframework/core/modules/repositories/module-repository-factory');
        const {
            createCredentialRepository,
        } = require('@friggframework/core/credential/repositories/credential-repository-factory');
        const { QueuerUtil } = require('@friggframework/core/queues');

        createIntegrationRepository.mockReturnValue(mockIntegrationRepo);
        createUserRepository.mockReturnValue(mockUserRepo);
        createModuleRepository.mockReturnValue(mockModuleRepo);
        createCredentialRepository.mockReturnValue(mockCredentialRepo);

        QueuerUtil.send = mockQueuerUtil.send;
        QueuerUtil.batchSend = mockQueuerUtil.batchSend;
    });

    describe('Constructor', () => {
        it('creates with executionId', () => {
            const ctx = new AdminScriptContext({ executionId: 'exec_123' });

            expect(ctx.executionId).toBe('exec_123');
            expect(ctx.logs).toEqual([]);
            expect(ctx.integrationFactory).toBeNull();
        });

        it('creates with integrationFactory', () => {
            const mockFactory = { getInstanceFromIntegrationId: jest.fn() };
            const ctx = new AdminScriptContext({
                integrationFactory: mockFactory,
            });

            expect(ctx.integrationFactory).toBe(mockFactory);
        });

        it('creates without params (defaults)', () => {
            const ctx = new AdminScriptContext();

            expect(ctx.executionId).toBeNull();
            expect(ctx.logs).toEqual([]);
            expect(ctx.integrationFactory).toBeNull();
        });
    });

    describe('Lazy Repository Loading', () => {
        it('creates integrationRepository on first access', () => {
            const ctx = new AdminScriptContext();
            const {
                createIntegrationRepository,
            } = require('@friggframework/core/integrations/repositories/integration-repository-factory');

            expect(createIntegrationRepository).not.toHaveBeenCalled();

            const repo = ctx.integrationRepository;

            expect(createIntegrationRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockIntegrationRepo);
        });

        it('returns same instance on subsequent access', () => {
            const ctx = new AdminScriptContext();

            const repo1 = ctx.integrationRepository;
            const repo2 = ctx.integrationRepository;

            expect(repo1).toBe(repo2);
            expect(repo1).toBe(mockIntegrationRepo);
        });

        it('creates userRepository on first access', () => {
            const ctx = new AdminScriptContext();
            const {
                createUserRepository,
            } = require('@friggframework/core/user/repositories/user-repository-factory');

            expect(createUserRepository).not.toHaveBeenCalled();

            const repo = ctx.userRepository;

            expect(createUserRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockUserRepo);
        });

        it('creates moduleRepository on first access', () => {
            const ctx = new AdminScriptContext();
            const {
                createModuleRepository,
            } = require('@friggframework/core/modules/repositories/module-repository-factory');

            expect(createModuleRepository).not.toHaveBeenCalled();

            const repo = ctx.moduleRepository;

            expect(createModuleRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockModuleRepo);
        });

        it('creates credentialRepository on first access', () => {
            const ctx = new AdminScriptContext();
            const {
                createCredentialRepository,
            } = require('@friggframework/core/credential/repositories/credential-repository-factory');

            expect(createCredentialRepository).not.toHaveBeenCalled();

            const repo = ctx.credentialRepository;

            expect(createCredentialRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockCredentialRepo);
        });
    });

    describe('instantiate()', () => {
        it('throws if no integrationFactory', async () => {
            const ctx = new AdminScriptContext();

            await expect(ctx.instantiate('int_123')).rejects.toThrow(
                'instantiate() requires integrationFactory. ' +
                    'Set Definition.config.requireIntegrationInstance = true'
            );
        });

        it('calls integrationFactory.getInstanceFromIntegrationId', async () => {
            const mockInstance = { primary: { api: {} } };
            const mockFactory = {
                getInstanceFromIntegrationId: jest
                    .fn()
                    .mockResolvedValue(mockInstance),
            };
            const ctx = new AdminScriptContext({
                integrationFactory: mockFactory,
            });

            const result = await ctx.instantiate('int_123');

            expect(result).toEqual(mockInstance);
            expect(
                mockFactory.getInstanceFromIntegrationId
            ).toHaveBeenCalledWith({
                integrationId: 'int_123',
                _isAdminContext: true,
            });
        });

        it('passes _isAdminContext: true', async () => {
            const mockInstance = { primary: { api: {} } };
            const mockFactory = {
                getInstanceFromIntegrationId: jest
                    .fn()
                    .mockResolvedValue(mockInstance),
            };
            const ctx = new AdminScriptContext({
                integrationFactory: mockFactory,
            });

            await ctx.instantiate('int_123');

            const callArgs =
                mockFactory.getInstanceFromIntegrationId.mock.calls[0][0];
            expect(callArgs._isAdminContext).toBe(true);
        });
    });

    describe('queueScript()', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('throws if ADMIN_SCRIPT_QUEUE_URL not set', async () => {
            delete process.env.ADMIN_SCRIPT_QUEUE_URL;
            const ctx = new AdminScriptContext();

            await expect(ctx.queueScript('test-script', {})).rejects.toThrow(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
        });

        it('calls QueuerUtil.send with correct params', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.us-east-1.amazonaws.com/123456789012/admin-scripts';
            const ctx = new AdminScriptContext({ executionId: 'exec_123' });
            const params = { integrationId: 'int_456' };

            await ctx.queueScript('test-script', params);

            expect(mockQueuerUtil.send).toHaveBeenCalledWith(
                {
                    scriptName: 'test-script',
                    trigger: 'QUEUE',
                    params: { integrationId: 'int_456' },
                    parentExecutionId: 'exec_123',
                },
                'https://sqs.us-east-1.amazonaws.com/123456789012/admin-scripts'
            );
        });

        it('includes parentExecutionId from constructor', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext({ executionId: 'exec_parent' });

            await ctx.queueScript('my-script', {});

            const callArgs = mockQueuerUtil.send.mock.calls[0][0];
            expect(callArgs.parentExecutionId).toBe('exec_parent');
        });

        it('logs queuing operation', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext();
            const params = { batchId: 'batch_1' };

            await ctx.queueScript('test-script', params);

            const logs = ctx.getLogs();
            expect(logs).toHaveLength(1);
            expect(logs[0].level).toBe('info');
            expect(logs[0].message).toBe('Queued continuation for test-script');
            expect(logs[0].data).toEqual({ params });
        });
    });

    describe('queueScriptBatch()', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('throws if ADMIN_SCRIPT_QUEUE_URL not set', async () => {
            delete process.env.ADMIN_SCRIPT_QUEUE_URL;
            const ctx = new AdminScriptContext();

            await expect(ctx.queueScriptBatch([])).rejects.toThrow(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
        });

        it('calls QueuerUtil.batchSend', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext({ executionId: 'exec_123' });
            const entries = [
                { scriptName: 'script-1', params: { id: '1' } },
                { scriptName: 'script-2', params: { id: '2' } },
            ];

            await ctx.queueScriptBatch(entries);

            expect(mockQueuerUtil.batchSend).toHaveBeenCalledWith(
                [
                    {
                        scriptName: 'script-1',
                        trigger: 'QUEUE',
                        params: { id: '1' },
                        parentExecutionId: 'exec_123',
                    },
                    {
                        scriptName: 'script-2',
                        trigger: 'QUEUE',
                        params: { id: '2' },
                        parentExecutionId: 'exec_123',
                    },
                ],
                'https://sqs.example.com/queue'
            );
        });

        it('maps entries correctly', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext();
            const entries = [
                { scriptName: 'test-script', params: { value: 'abc' } },
            ];

            await ctx.queueScriptBatch(entries);

            const callArgs = mockQueuerUtil.batchSend.mock.calls[0][0];
            expect(callArgs).toHaveLength(1);
            expect(callArgs[0].scriptName).toBe('test-script');
            expect(callArgs[0].params).toEqual({ value: 'abc' });
            expect(callArgs[0].trigger).toBe('QUEUE');
        });

        it('handles entries without params', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext();
            const entries = [{ scriptName: 'no-params-script' }];

            await ctx.queueScriptBatch(entries);

            const callArgs = mockQueuerUtil.batchSend.mock.calls[0][0];
            expect(callArgs[0].params).toEqual({});
        });

        it('logs batch queuing operation', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL =
                'https://sqs.example.com/queue';
            const ctx = new AdminScriptContext();
            const entries = [
                { scriptName: 'script-1', params: {} },
                { scriptName: 'script-2', params: {} },
                { scriptName: 'script-3', params: {} },
            ];

            await ctx.queueScriptBatch(entries);

            const logs = ctx.getLogs();
            expect(logs).toHaveLength(1);
            expect(logs[0].level).toBe('info');
            expect(logs[0].message).toBe('Queued 3 script continuations');
        });
    });

    describe('Logging', () => {
        it('log() adds entry to logs array', () => {
            const ctx = new AdminScriptContext();

            const entry = ctx.log('info', 'Test message', { key: 'value' });

            expect(entry.level).toBe('info');
            expect(entry.message).toBe('Test message');
            expect(entry.data).toEqual({ key: 'value' });
            expect(entry.timestamp).toBeDefined();
            expect(ctx.logs).toHaveLength(1);
            expect(ctx.logs[0]).toBe(entry);
        });

        it('log() is in-memory only (no DB persistence)', () => {
            const ctx = new AdminScriptContext({ executionId: 'exec_123' });

            ctx.log('warn', 'Warning message', { detail: 'xyz' });

            // Verify entry was added to in-memory logs
            expect(ctx.logs).toHaveLength(1);
            expect(ctx.logs[0].level).toBe('warn');
            expect(ctx.logs[0].message).toBe('Warning message');
        });

        it('getLogs() returns all logs', () => {
            const ctx = new AdminScriptContext();

            ctx.log('info', 'First');
            ctx.log('warn', 'Second');
            ctx.log('error', 'Third');

            const logs = ctx.getLogs();

            expect(logs).toHaveLength(3);
            expect(logs[0].message).toBe('First');
            expect(logs[1].message).toBe('Second');
            expect(logs[2].message).toBe('Third');
        });

        it('clearLogs() clears logs array', () => {
            const ctx = new AdminScriptContext();

            ctx.log('info', 'First');
            ctx.log('info', 'Second');
            expect(ctx.logs).toHaveLength(2);

            ctx.clearLogs();

            expect(ctx.logs).toHaveLength(0);
        });

        it('getExecutionId() returns executionId', () => {
            const ctx = new AdminScriptContext({ executionId: 'exec_789' });

            expect(ctx.getExecutionId()).toBe('exec_789');
        });

        it('getExecutionId() returns null if not set', () => {
            const ctx = new AdminScriptContext();

            expect(ctx.getExecutionId()).toBeNull();
        });
    });

    describe('createAdminScriptContext factory', () => {
        it('creates AdminScriptContext instance', () => {
            const ctx = createAdminScriptContext({ executionId: 'exec_123' });

            expect(ctx).toBeInstanceOf(AdminScriptContext);
            expect(ctx.executionId).toBe('exec_123');
        });

        it('creates with default params', () => {
            const ctx = createAdminScriptContext();

            expect(ctx).toBeInstanceOf(AdminScriptContext);
            expect(ctx.executionId).toBeNull();
        });
    });
});
