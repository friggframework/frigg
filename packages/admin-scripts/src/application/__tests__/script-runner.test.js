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
            createAdminProcess: jest.fn(),
            updateAdminProcessState: jest.fn(),
            completeAdminProcess: jest.fn(),
        };

        mockFrigg = {
            log: jest.fn(),
            getExecutionId: jest.fn(),
        };

        createAdminScriptCommands.mockReturnValue(mockCommands);
        createAdminFriggCommands.mockReturnValue(mockFrigg);

        mockCommands.createAdminProcess.mockResolvedValue({
            id: 'exec-123',
        });
        mockCommands.updateAdminProcessState.mockResolvedValue({});
        mockCommands.completeAdminProcess.mockResolvedValue({ success: true });
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

            expect(mockCommands.createAdminProcess).toHaveBeenCalledWith({
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { foo: 'bar' },
                audit: { apiKeyName: 'test-key' },
            });

            expect(mockCommands.updateAdminProcessState).toHaveBeenCalledWith(
                'exec-123',
                'RUNNING'
            );

            expect(mockCommands.completeAdminProcess).toHaveBeenCalledWith(
                'exec-123',
                expect.objectContaining({
                    state: 'COMPLETED',
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

            expect(mockCommands.completeAdminProcess).toHaveBeenCalledWith(
                'exec-123',
                expect.objectContaining({
                    state: 'FAILED',
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
            expect(mockCommands.createAdminProcess).not.toHaveBeenCalled();
            expect(mockCommands.updateAdminProcessState).toHaveBeenCalledWith(
                'existing-exec-456',
                'RUNNING'
            );
        });
    });

    describe('dry-run mode', () => {
        it('should return preview without executing script', async () => {
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('test-script', { foo: 'bar' }, {
                trigger: 'MANUAL',
                dryRun: true,
            });

            expect(result.dryRun).toBe(true);
            expect(result.status).toBe('DRY_RUN_VALID');
            expect(result.scriptName).toBe('test-script');
            expect(result.preview.script.name).toBe('test-script');
            expect(result.preview.script.version).toBe('1.0.0');
            expect(result.preview.input).toEqual({ foo: 'bar' });
            expect(result.message).toContain('validation passed');

            // Should NOT create execution record or call commands
            expect(mockCommands.createAdminProcess).not.toHaveBeenCalled();
            expect(mockCommands.updateAdminProcessState).not.toHaveBeenCalled();
            expect(mockCommands.completeAdminProcess).not.toHaveBeenCalled();
        });

        it('should validate required parameters in dry-run', async () => {
            class SchemaScript extends AdminScriptBase {
                static Definition = {
                    name: 'schema-script',
                    version: '1.0.0',
                    description: 'Script with schema',
                    inputSchema: {
                        type: 'object',
                        required: ['requiredParam'],
                        properties: {
                            requiredParam: { type: 'string' },
                            optionalParam: { type: 'number' },
                        },
                    },
                };

                async execute() {
                    return {};
                }
            }

            scriptFactory.register(SchemaScript);
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            // Missing required parameter
            const result = await runner.execute('schema-script', {}, {
                dryRun: true,
            });

            expect(result.status).toBe('DRY_RUN_INVALID');
            expect(result.preview.validation.valid).toBe(false);
            expect(result.preview.validation.errors).toContain('Missing required parameter: requiredParam');
        });

        it('should validate parameter types in dry-run', async () => {
            class TypedScript extends AdminScriptBase {
                static Definition = {
                    name: 'typed-script',
                    version: '1.0.0',
                    description: 'Script with typed params',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            count: { type: 'integer' },
                            name: { type: 'string' },
                            enabled: { type: 'boolean' },
                        },
                    },
                };

                async execute() {
                    return {};
                }
            }

            scriptFactory.register(TypedScript);
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('typed-script', {
                count: 'not-a-number',
                name: 123,
                enabled: 'true',
            }, {
                dryRun: true,
            });

            expect(result.status).toBe('DRY_RUN_INVALID');
            expect(result.preview.validation.errors).toHaveLength(3);
        });

        it('should pass validation with correct parameters', async () => {
            class ValidScript extends AdminScriptBase {
                static Definition = {
                    name: 'valid-script',
                    version: '1.0.0',
                    description: 'Script for validation',
                    inputSchema: {
                        type: 'object',
                        required: ['name'],
                        properties: {
                            name: { type: 'string' },
                            count: { type: 'integer' },
                        },
                    },
                };

                async execute() {
                    return {};
                }
            }

            scriptFactory.register(ValidScript);
            const runner = new ScriptRunner({ scriptFactory, commands: mockCommands });

            const result = await runner.execute('valid-script', {
                name: 'test',
                count: 42,
            }, {
                dryRun: true,
            });

            expect(result.status).toBe('DRY_RUN_VALID');
            expect(result.preview.validation.valid).toBe(true);
            expect(result.preview.validation.errors).toHaveLength(0);
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
