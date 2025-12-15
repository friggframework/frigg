const { AdminFriggCommands, createAdminFriggCommands } = require('../admin-frigg-commands');

// Mock all repository factories
jest.mock('@friggframework/core/integrations/repositories/integration-repository-factory');
jest.mock('@friggframework/core/user/repositories/user-repository-factory');
jest.mock('@friggframework/core/modules/repositories/module-repository-factory');
jest.mock('@friggframework/core/credential/repositories/credential-repository-factory');
jest.mock('@friggframework/core/admin-scripts/repositories/admin-process-repository-factory');
jest.mock('@friggframework/core/queues');

describe('AdminFriggCommands', () => {
    let mockIntegrationRepo;
    let mockUserRepo;
    let mockModuleRepo;
    let mockCredentialRepo;
    let mockAdminProcessRepo;
    let mockQueuerUtil;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock repositories
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

        mockAdminProcessRepo = {
            appendProcessLog: jest.fn().mockResolvedValue(undefined),
        };

        mockQueuerUtil = {
            send: jest.fn().mockResolvedValue(undefined),
            batchSend: jest.fn().mockResolvedValue(undefined),
        };

        // Mock factory functions
        const { createIntegrationRepository } = require('@friggframework/core/integrations/repositories/integration-repository-factory');
        const { createUserRepository } = require('@friggframework/core/user/repositories/user-repository-factory');
        const { createModuleRepository } = require('@friggframework/core/modules/repositories/module-repository-factory');
        const { createCredentialRepository } = require('@friggframework/core/credential/repositories/credential-repository-factory');
        const { createAdminProcessRepository } = require('@friggframework/core/admin-scripts/repositories/admin-process-repository-factory');
        const { QueuerUtil } = require('@friggframework/core/queues');

        createIntegrationRepository.mockReturnValue(mockIntegrationRepo);
        createUserRepository.mockReturnValue(mockUserRepo);
        createModuleRepository.mockReturnValue(mockModuleRepo);
        createCredentialRepository.mockReturnValue(mockCredentialRepo);
        createAdminProcessRepository.mockReturnValue(mockAdminProcessRepo);

        // Mock QueuerUtil methods
        QueuerUtil.send = mockQueuerUtil.send;
        QueuerUtil.batchSend = mockQueuerUtil.batchSend;
    });

    describe('Constructor', () => {
        it('creates with executionId', () => {
            const commands = new AdminFriggCommands({ executionId: 'exec_123' });

            expect(commands.executionId).toBe('exec_123');
            expect(commands.logs).toEqual([]);
            expect(commands.integrationFactory).toBeNull();
        });

        it('creates with integrationFactory', () => {
            const mockFactory = { getInstanceFromIntegrationId: jest.fn() };
            const commands = new AdminFriggCommands({ integrationFactory: mockFactory });

            expect(commands.integrationFactory).toBe(mockFactory);
        });

        it('creates without params (defaults)', () => {
            const commands = new AdminFriggCommands();

            expect(commands.executionId).toBeNull();
            expect(commands.logs).toEqual([]);
            expect(commands.integrationFactory).toBeNull();
        });
    });

    describe('Lazy Repository Loading', () => {
        it('creates integrationRepository on first access', () => {
            const commands = new AdminFriggCommands();
            const { createIntegrationRepository } = require('@friggframework/core/integrations/repositories/integration-repository-factory');

            expect(createIntegrationRepository).not.toHaveBeenCalled();

            const repo = commands.integrationRepository;

            expect(createIntegrationRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockIntegrationRepo);
        });

        it('returns same instance on subsequent access', () => {
            const commands = new AdminFriggCommands();

            const repo1 = commands.integrationRepository;
            const repo2 = commands.integrationRepository;

            expect(repo1).toBe(repo2);
            expect(repo1).toBe(mockIntegrationRepo);
        });

        it('creates userRepository on first access', () => {
            const commands = new AdminFriggCommands();
            const { createUserRepository } = require('@friggframework/core/user/repositories/user-repository-factory');

            expect(createUserRepository).not.toHaveBeenCalled();

            const repo = commands.userRepository;

            expect(createUserRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockUserRepo);
        });

        it('creates moduleRepository on first access', () => {
            const commands = new AdminFriggCommands();
            const { createModuleRepository } = require('@friggframework/core/modules/repositories/module-repository-factory');

            expect(createModuleRepository).not.toHaveBeenCalled();

            const repo = commands.moduleRepository;

            expect(createModuleRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockModuleRepo);
        });

        it('creates credentialRepository on first access', () => {
            const commands = new AdminFriggCommands();
            const { createCredentialRepository } = require('@friggframework/core/credential/repositories/credential-repository-factory');

            expect(createCredentialRepository).not.toHaveBeenCalled();

            const repo = commands.credentialRepository;

            expect(createCredentialRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockCredentialRepo);
        });

        it('creates adminProcessRepository on first access', () => {
            const commands = new AdminFriggCommands();
            const { createAdminProcessRepository } = require('@friggframework/core/admin-scripts/repositories/admin-process-repository-factory');

            expect(createAdminProcessRepository).not.toHaveBeenCalled();

            const repo = commands.adminProcessRepository;

            expect(createAdminProcessRepository).toHaveBeenCalledTimes(1);
            expect(repo).toBe(mockAdminProcessRepo);
        });
    });

    describe('Integration Queries', () => {
        it('listIntegrations with userId filter calls findIntegrationsByUserId', async () => {
            const commands = new AdminFriggCommands();
            const mockIntegrations = [{ id: '1' }, { id: '2' }];
            mockIntegrationRepo.findIntegrationsByUserId.mockResolvedValue(mockIntegrations);

            const result = await commands.listIntegrations({ userId: 'user_123' });

            expect(result).toEqual(mockIntegrations);
            expect(mockIntegrationRepo.findIntegrationsByUserId).toHaveBeenCalledWith('user_123');
        });

        it('listIntegrations without userId calls findIntegrations', async () => {
            const commands = new AdminFriggCommands();
            const mockIntegrations = [{ id: '1' }];
            mockIntegrationRepo.findIntegrations.mockResolvedValue(mockIntegrations);

            const result = await commands.listIntegrations({ status: 'active' });

            expect(result).toEqual(mockIntegrations);
            expect(mockIntegrationRepo.findIntegrations).toHaveBeenCalledWith({ status: 'active' });
        });

        it('findIntegrationById calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockIntegration = { id: 'int_123', name: 'Test' };
            mockIntegrationRepo.findIntegrationById.mockResolvedValue(mockIntegration);

            const result = await commands.findIntegrationById('int_123');

            expect(result).toEqual(mockIntegration);
            expect(mockIntegrationRepo.findIntegrationById).toHaveBeenCalledWith('int_123');
        });

        it('findIntegrationsByUserId calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockIntegrations = [{ id: '1' }, { id: '2' }];
            mockIntegrationRepo.findIntegrationsByUserId.mockResolvedValue(mockIntegrations);

            const result = await commands.findIntegrationsByUserId('user_123');

            expect(result).toEqual(mockIntegrations);
            expect(mockIntegrationRepo.findIntegrationsByUserId).toHaveBeenCalledWith('user_123');
        });

        it('updateIntegrationConfig calls repository', async () => {
            const commands = new AdminFriggCommands();
            const newConfig = { setting: 'value' };
            const updatedIntegration = { id: 'int_123', config: newConfig };
            mockIntegrationRepo.updateIntegrationConfig.mockResolvedValue(updatedIntegration);

            const result = await commands.updateIntegrationConfig('int_123', newConfig);

            expect(result).toEqual(updatedIntegration);
            expect(mockIntegrationRepo.updateIntegrationConfig).toHaveBeenCalledWith('int_123', newConfig);
        });

        it('updateIntegrationStatus calls repository', async () => {
            const commands = new AdminFriggCommands();
            const updatedIntegration = { id: 'int_123', status: 'active' };
            mockIntegrationRepo.updateIntegrationStatus.mockResolvedValue(updatedIntegration);

            const result = await commands.updateIntegrationStatus('int_123', 'active');

            expect(result).toEqual(updatedIntegration);
            expect(mockIntegrationRepo.updateIntegrationStatus).toHaveBeenCalledWith('int_123', 'active');
        });
    });

    describe('User Queries', () => {
        it('findUserById calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockUser = { id: 'user_123', email: 'test@example.com' };
            mockUserRepo.findIndividualUserById.mockResolvedValue(mockUser);

            const result = await commands.findUserById('user_123');

            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findIndividualUserById).toHaveBeenCalledWith('user_123');
        });

        it('findUserByAppUserId calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockUser = { id: 'user_123', appUserId: 'app_456' };
            mockUserRepo.findIndividualUserByAppUserId.mockResolvedValue(mockUser);

            const result = await commands.findUserByAppUserId('app_456');

            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findIndividualUserByAppUserId).toHaveBeenCalledWith('app_456');
        });

        it('findUserByUsername calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockUser = { id: 'user_123', username: 'testuser' };
            mockUserRepo.findIndividualUserByUsername.mockResolvedValue(mockUser);

            const result = await commands.findUserByUsername('testuser');

            expect(result).toEqual(mockUser);
            expect(mockUserRepo.findIndividualUserByUsername).toHaveBeenCalledWith('testuser');
        });
    });

    describe('Entity Queries', () => {
        it('listEntities with userId filter calls findEntitiesByUserId', async () => {
            const commands = new AdminFriggCommands();
            const mockEntities = [{ id: 'ent_1' }, { id: 'ent_2' }];
            mockModuleRepo.findEntitiesByUserId.mockResolvedValue(mockEntities);

            const result = await commands.listEntities({ userId: 'user_123' });

            expect(result).toEqual(mockEntities);
            expect(mockModuleRepo.findEntitiesByUserId).toHaveBeenCalledWith('user_123');
        });

        it('listEntities without userId calls findEntity', async () => {
            const commands = new AdminFriggCommands();
            const mockEntities = [{ id: 'ent_1' }];
            mockModuleRepo.findEntity.mockResolvedValue(mockEntities);

            const result = await commands.listEntities({ type: 'account' });

            expect(result).toEqual(mockEntities);
            expect(mockModuleRepo.findEntity).toHaveBeenCalledWith({ type: 'account' });
        });

        it('findEntityById calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockEntity = { id: 'ent_123', name: 'Test Entity' };
            mockModuleRepo.findEntityById.mockResolvedValue(mockEntity);

            const result = await commands.findEntityById('ent_123');

            expect(result).toEqual(mockEntity);
            expect(mockModuleRepo.findEntityById).toHaveBeenCalledWith('ent_123');
        });
    });

    describe('Credential Queries', () => {
        it('findCredential calls repository', async () => {
            const commands = new AdminFriggCommands();
            const mockCredential = { id: 'cred_123', userId: 'user_123' };
            mockCredentialRepo.findCredential.mockResolvedValue(mockCredential);

            const result = await commands.findCredential({ userId: 'user_123' });

            expect(result).toEqual(mockCredential);
            expect(mockCredentialRepo.findCredential).toHaveBeenCalledWith({ userId: 'user_123' });
        });

        it('updateCredential calls repository', async () => {
            const commands = new AdminFriggCommands();
            const updates = { data: { newToken: 'xyz' } };
            const updatedCredential = { id: 'cred_123', ...updates };
            mockCredentialRepo.updateCredential.mockResolvedValue(updatedCredential);

            const result = await commands.updateCredential('cred_123', updates);

            expect(result).toEqual(updatedCredential);
            expect(mockCredentialRepo.updateCredential).toHaveBeenCalledWith('cred_123', updates);
        });
    });

    describe('instantiate()', () => {
        it('throws if no integrationFactory', async () => {
            const commands = new AdminFriggCommands();

            await expect(commands.instantiate('int_123')).rejects.toThrow(
                'instantiate() requires integrationFactory. ' +
                'Set Definition.config.requiresIntegrationFactory = true'
            );
        });

        it('calls integrationFactory.getInstanceFromIntegrationId', async () => {
            const mockInstance = { primary: { api: {} } };
            const mockFactory = {
                getInstanceFromIntegrationId: jest.fn().mockResolvedValue(mockInstance),
            };
            const commands = new AdminFriggCommands({ integrationFactory: mockFactory });

            const result = await commands.instantiate('int_123');

            expect(result).toEqual(mockInstance);
            expect(mockFactory.getInstanceFromIntegrationId).toHaveBeenCalledWith({
                integrationId: 'int_123',
                _isAdminContext: true,
            });
        });

        it('passes _isAdminContext: true', async () => {
            const mockInstance = { primary: { api: {} } };
            const mockFactory = {
                getInstanceFromIntegrationId: jest.fn().mockResolvedValue(mockInstance),
            };
            const commands = new AdminFriggCommands({ integrationFactory: mockFactory });

            await commands.instantiate('int_123');

            const callArgs = mockFactory.getInstanceFromIntegrationId.mock.calls[0][0];
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
            const commands = new AdminFriggCommands();

            await expect(commands.queueScript('test-script', {})).rejects.toThrow(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
        });

        it('calls QueuerUtil.send with correct params', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/admin-scripts';
            const commands = new AdminFriggCommands({ executionId: 'exec_123' });
            const params = { integrationId: 'int_456' };

            await commands.queueScript('test-script', params);

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
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands({ executionId: 'exec_parent' });

            await commands.queueScript('my-script', {});

            const callArgs = mockQueuerUtil.send.mock.calls[0][0];
            expect(callArgs.parentExecutionId).toBe('exec_parent');
        });

        it('logs queuing operation', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands();
            const params = { batchId: 'batch_1' };

            await commands.queueScript('test-script', params);

            const logs = commands.getLogs();
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
            const commands = new AdminFriggCommands();

            await expect(commands.queueScriptBatch([])).rejects.toThrow(
                'ADMIN_SCRIPT_QUEUE_URL environment variable not set'
            );
        });

        it('calls QueuerUtil.batchSend', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands({ executionId: 'exec_123' });
            const entries = [
                { scriptName: 'script-1', params: { id: '1' } },
                { scriptName: 'script-2', params: { id: '2' } },
            ];

            await commands.queueScriptBatch(entries);

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
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands();
            const entries = [
                { scriptName: 'test-script', params: { value: 'abc' } },
            ];

            await commands.queueScriptBatch(entries);

            const callArgs = mockQueuerUtil.batchSend.mock.calls[0][0];
            expect(callArgs).toHaveLength(1);
            expect(callArgs[0].scriptName).toBe('test-script');
            expect(callArgs[0].params).toEqual({ value: 'abc' });
            expect(callArgs[0].trigger).toBe('QUEUE');
        });

        it('handles entries without params', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands();
            const entries = [
                { scriptName: 'no-params-script' },
            ];

            await commands.queueScriptBatch(entries);

            const callArgs = mockQueuerUtil.batchSend.mock.calls[0][0];
            expect(callArgs[0].params).toEqual({});
        });

        it('logs batch queuing operation', async () => {
            process.env.ADMIN_SCRIPT_QUEUE_URL = 'https://sqs.example.com/queue';
            const commands = new AdminFriggCommands();
            const entries = [
                { scriptName: 'script-1', params: {} },
                { scriptName: 'script-2', params: {} },
                { scriptName: 'script-3', params: {} },
            ];

            await commands.queueScriptBatch(entries);

            const logs = commands.getLogs();
            expect(logs).toHaveLength(1);
            expect(logs[0].level).toBe('info');
            expect(logs[0].message).toBe('Queued 3 script continuations');
        });
    });

    describe('Logging', () => {
        it('log() adds entry to logs array', () => {
            const commands = new AdminFriggCommands();

            const entry = commands.log('info', 'Test message', { key: 'value' });

            expect(entry.level).toBe('info');
            expect(entry.message).toBe('Test message');
            expect(entry.data).toEqual({ key: 'value' });
            expect(entry.timestamp).toBeDefined();
            expect(commands.logs).toHaveLength(1);
            expect(commands.logs[0]).toBe(entry);
        });

        it('log() persists if executionId set', async () => {
            const commands = new AdminFriggCommands({ executionId: 'exec_123' });
            // Force repository creation
            commands.adminProcessRepository;

            commands.log('warn', 'Warning message', { detail: 'xyz' });

            // Give async operation a chance to execute
            await new Promise(resolve => setImmediate(resolve));

            expect(mockAdminProcessRepo.appendProcessLog).toHaveBeenCalled();
            const callArgs = mockAdminProcessRepo.appendProcessLog.mock.calls[0];
            expect(callArgs[0]).toBe('exec_123');
            expect(callArgs[1].level).toBe('warn');
            expect(callArgs[1].message).toBe('Warning message');
        });

        it('log() does not persist if no executionId', async () => {
            const commands = new AdminFriggCommands();

            commands.log('info', 'Test');

            await new Promise(resolve => setImmediate(resolve));

            expect(mockAdminProcessRepo.appendProcessLog).not.toHaveBeenCalled();
        });

        it('log() handles persistence failure gracefully', async () => {
            const commands = new AdminFriggCommands({ executionId: 'exec_123' });
            // Force repository creation
            commands.adminProcessRepository;
            mockAdminProcessRepo.appendProcessLog.mockRejectedValue(new Error('DB Error'));

            // Should not throw
            expect(() => commands.log('error', 'Test error')).not.toThrow();
        });

        it('getLogs() returns all logs', () => {
            const commands = new AdminFriggCommands();

            commands.log('info', 'First');
            commands.log('warn', 'Second');
            commands.log('error', 'Third');

            const logs = commands.getLogs();

            expect(logs).toHaveLength(3);
            expect(logs[0].message).toBe('First');
            expect(logs[1].message).toBe('Second');
            expect(logs[2].message).toBe('Third');
        });

        it('clearLogs() clears logs array', () => {
            const commands = new AdminFriggCommands();

            commands.log('info', 'First');
            commands.log('info', 'Second');
            expect(commands.logs).toHaveLength(2);

            commands.clearLogs();

            expect(commands.logs).toHaveLength(0);
        });

        it('getExecutionId() returns executionId', () => {
            const commands = new AdminFriggCommands({ executionId: 'exec_789' });

            expect(commands.getExecutionId()).toBe('exec_789');
        });

        it('getExecutionId() returns null if not set', () => {
            const commands = new AdminFriggCommands();

            expect(commands.getExecutionId()).toBeNull();
        });
    });

    describe('createAdminFriggCommands factory', () => {
        it('creates AdminFriggCommands instance', () => {
            const commands = createAdminFriggCommands({ executionId: 'exec_123' });

            expect(commands).toBeInstanceOf(AdminFriggCommands);
            expect(commands.executionId).toBe('exec_123');
        });

        it('creates with default params', () => {
            const commands = createAdminFriggCommands();

            expect(commands).toBeInstanceOf(AdminFriggCommands);
            expect(commands.executionId).toBeNull();
        });
    });
});
