const { ScriptRunner, createScriptRunner } = require('../script-runner');
const { ScriptFactory } = require('../script-factory');
const { AdminScriptBase } = require('../admin-script-base');

// Mock dependencies
jest.mock('../admin-frigg-commands');
jest.mock('@friggframework/core/application/commands/admin-script-commands');

const { createAdminFriggCommands } = require('../admin-frigg-commands');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

describe('ScriptRunner', () => {
    let scriptFactory;
    let mockCommands;
    let mockFrigg;
    let testScript;

    class TestScript extends AdminScriptBase {
        static Definition = {
            name: 'test-script',
            version: '1.0.0',
            description: 'Test script',
            config: {
                timeout: 300000,
                maxRetries: 0,
                requiresIntegrationFactory: false,
            },
        };

        async execute(frigg, params) {
            return { success: true, params };
        }
    }

    beforeEach(() => {
        scriptFactory = new ScriptFactory([TestScript]);

        mockCommands = {
            createScriptExecution: jest.fn(),
            updateScriptExecutionStatus: jest.fn(),
            completeScriptExecution: jest.fn(),
        };

        mockFrigg = {
            log: jest.fn(),
            getExecutionId: jest.fn(),
        };

        createAdminScriptCommands.mockReturnValue(mockCommands);
        createAdminFriggCommands.mockReturnValue(mockFrigg);

        mockCommands.createScriptExecution.mockResolvedValue({
            id: 'exec-123',
        });
        mockCommands.updateScriptExecutionStatus.mockResolvedValue({});
        mockCommands.completeScriptExecution.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute()', () => {
        it('should execute script successfully', async () => {
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('test-script', { foo: 'bar' }, {
                trigger: 'MANUAL',
                mode: 'async',
                audit: { apiKeyName: 'test-key' },
            });

            expect(result.status).toBe('COMPLETED');
            expect(result.scriptName).toBe('test-script');
            expect(result.output).toEqual({ success: true, params: { foo: 'bar' } });
            expect(result.executionId).toBe('exec-123');
            expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);

            expect(mockCommands.createScriptExecution).toHaveBeenCalledWith({
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { foo: 'bar' },
                audit: { apiKeyName: 'test-key' },
            });

            expect(mockCommands.updateScriptExecutionStatus).toHaveBeenCalledWith(
                'exec-123',
                'RUNNING'
            );

            expect(mockCommands.completeScriptExecution).toHaveBeenCalledWith(
                'exec-123',
                expect.objectContaining({
                    status: 'COMPLETED',
                    output: { success: true, params: { foo: 'bar' } },
                    metrics: expect.objectContaining({
                        durationMs: expect.any(Number),
                    }),
                })
            );
        });

        it('should handle script execution failure', async () => {
            class FailingScript extends AdminScriptBase {
                static Definition = {
                    name: 'failing-script',
                    version: '1.0.0',
                    description: 'Failing script',
                    config: { timeout: 300000, maxRetries: 0 },
                };

                async execute() {
                    throw new Error('Script failed');
                }
            }

            scriptFactory.register(FailingScript);
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('failing-script', {}, {
                trigger: 'MANUAL',
                mode: 'sync',
            });

            expect(result.status).toBe('FAILED');
            expect(result.scriptName).toBe('failing-script');
            expect(result.error.message).toBe('Script failed');

            expect(mockCommands.completeScriptExecution).toHaveBeenCalledWith(
                'exec-123',
                expect.objectContaining({
                    status: 'FAILED',
                    error: expect.objectContaining({
                        message: 'Script failed',
                    }),
                })
            );
        });

        it('should throw error if integrationFactory required but not provided', async () => {
            class IntegrationScript extends AdminScriptBase {
                static Definition = {
                    name: 'integration-script',
                    version: '1.0.0',
                    description: 'Integration script',
                    config: {
                        requiresIntegrationFactory: true,
                    },
                };

                async execute() {
                    return {};
                }
            }

            scriptFactory.register(IntegrationScript);
            const runner = new ScriptRunner({
                scriptFactory,
                commands: mockCommands,
                integrationFactory: null,
            });

            await expect(
                runner.execute('integration-script', {}, { trigger: 'MANUAL' })
            ).rejects.toThrow(
                'Script "integration-script" requires integrationFactory but none was provided'
            );
        });

        it('should reuse existing execution ID when provided', async () => {
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('test-script', { foo: 'bar' }, {
                trigger: 'QUEUE',
                executionId: 'existing-exec-456',
            });

            expect(result.executionId).toBe('existing-exec-456');
            expect(mockCommands.createScriptExecution).not.toHaveBeenCalled();
            expect(mockCommands.updateScriptExecutionStatus).toHaveBeenCalledWith(
                'existing-exec-456',
                'RUNNING'
            );
        });
    });

    describe('createScriptRunner()', () => {
        it('should create runner with default factory', () => {
            const runner = createScriptRunner();
            expect(runner).toBeInstanceOf(ScriptRunner);
        });

        it('should create runner with custom params', () => {
            const customFactory = new ScriptFactory();
            const runner = createScriptRunner({ scriptFactory: customFactory });
            expect(runner).toBeInstanceOf(ScriptRunner);
            expect(runner.scriptFactory).toBe(customFactory);
        });
    });
});
