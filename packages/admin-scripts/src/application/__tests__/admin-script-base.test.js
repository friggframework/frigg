const { AdminScriptBase } = require('../admin-script-base');

describe('AdminScriptBase', () => {
    describe('Static Definition pattern', () => {
        it('should have a default Definition', () => {
            expect(AdminScriptBase.Definition).toBeDefined();
            expect(AdminScriptBase.Definition.name).toBe('Script Name');
            expect(AdminScriptBase.Definition.version).toBe('0.0.0');
            expect(AdminScriptBase.Definition.description).toBe(
                'What this script does'
            );
            expect(AdminScriptBase.Definition.source).toBe('USER_DEFINED');
        });

        it('should allow child classes to override Definition', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test-script',
                    version: '1.0.0',
                    description: 'A test script',
                    source: 'BUILTIN',
                    inputSchema: { type: 'object' },
                    outputSchema: { type: 'object' },
                    schedule: {
                        enabled: true,
                        cronExpression: 'cron(0 12 * * ? *)',
                    },
                    config: {
                        timeout: 600000,
                        maxRetries: 3,
                        requireIntegrationInstance: true,
                    },
                    display: {
                        category: 'testing',
                        icon: 'test-icon',
                    },
                };
            }

            expect(TestScript.Definition.name).toBe('test-script');
            expect(TestScript.Definition.version).toBe('1.0.0');
            expect(TestScript.Definition.description).toBe('A test script');
            expect(TestScript.Definition.source).toBe('BUILTIN');
            expect(TestScript.Definition.schedule.enabled).toBe(true);
            expect(TestScript.Definition.config.timeout).toBe(600000);
        });

        it('should have clean display object without redundant fields', () => {
            // Default display should only have UI-specific fields
            expect(AdminScriptBase.Definition.display).toBeDefined();
            expect(AdminScriptBase.Definition.display.category).toBe('maintenance');
            // Should NOT have redundant label/description
            expect(AdminScriptBase.Definition.display.label).toBeUndefined();
            expect(AdminScriptBase.Definition.display.description).toBeUndefined();
        });
    });

    describe('Static methods', () => {
        it('getName() should return the script name', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'test',
                };
            }

            expect(TestScript.getName()).toBe('my-script');
        });

        it('getCurrentVersion() should return the version', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '2.3.1',
                    description: 'test',
                };
            }

            expect(TestScript.getCurrentVersion()).toBe('2.3.1');
        });

        it('getDefinition() should return the full Definition', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'test',
                    source: 'USER_DEFINED',
                };
            }

            const definition = TestScript.getDefinition();
            expect(definition).toEqual({
                name: 'my-script',
                version: '1.0.0',
                description: 'test',
                source: 'USER_DEFINED',
            });
        });

        it('getDisplayLabel() should return display.label or fall back to name', () => {
            class ScriptWithLabel extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'test',
                    display: { label: 'My Custom Label' },
                };
            }

            class ScriptWithoutLabel extends AdminScriptBase {
                static Definition = {
                    name: 'another-script',
                    version: '1.0.0',
                    description: 'test',
                };
            }

            expect(ScriptWithLabel.getDisplayLabel()).toBe('My Custom Label');
            expect(ScriptWithoutLabel.getDisplayLabel()).toBe('another-script');
        });

        it('getDisplayDescription() should return display.description or fall back to description', () => {
            class ScriptWithDisplayDesc extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'Technical description',
                    display: { description: 'User-friendly description' },
                };
            }

            class ScriptWithoutDisplayDesc extends AdminScriptBase {
                static Definition = {
                    name: 'another-script',
                    version: '1.0.0',
                    description: 'Technical description',
                };
            }

            expect(ScriptWithDisplayDesc.getDisplayDescription()).toBe('User-friendly description');
            expect(ScriptWithoutDisplayDesc.getDisplayDescription()).toBe('Technical description');
        });
    });

    describe('Constructor', () => {
        it('should initialize with default values', () => {
            const script = new AdminScriptBase();

            expect(script.context).toBeNull();
            expect(script.executionId).toBeNull();
            expect(script.integrationFactory).toBeNull();
        });

        it('should accept context parameter', () => {
            const mockContext = { log: jest.fn() };
            const script = new AdminScriptBase({ context: mockContext });

            expect(script.context).toBe(mockContext);
        });

        it('should accept executionId parameter', () => {
            const script = new AdminScriptBase({ executionId: 'exec_123' });

            expect(script.executionId).toBe('exec_123');
        });

        it('should accept integrationFactory parameter', () => {
            const mockFactory = { mock: true };
            const script = new AdminScriptBase({
                integrationFactory: mockFactory,
            });

            expect(script.integrationFactory).toBe(mockFactory);
        });

        it('should accept all parameters together', () => {
            const mockContext = { log: jest.fn() };
            const mockFactory = { mock: true };
            const script = new AdminScriptBase({
                context: mockContext,
                executionId: 'exec_456',
                integrationFactory: mockFactory,
            });

            expect(script.context).toBe(mockContext);
            expect(script.executionId).toBe('exec_456');
            expect(script.integrationFactory).toBe(mockFactory);
        });
    });

    describe('execute()', () => {
        it('should throw error when not implemented by subclass', async () => {
            const script = new AdminScriptBase();

            await expect(script.execute({})).rejects.toThrow(
                'AdminScriptBase.execute() must be implemented by subclass'
            );
        });

        it('should allow child classes to implement execute() with params only', async () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'test',
                };

                async execute(params) {
                    return { result: 'success', params };
                }
            }

            const script = new TestScript();
            const params = { foo: 'bar' };

            const result = await script.execute(params);

            expect(result.result).toBe('success');
            expect(result.params).toEqual({ foo: 'bar' });
        });

        it('should access context via this.context', async () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'test',
                };

                async execute(params) {
                    this.context.log('info', 'Starting');
                    return { success: true };
                }
            }

            const mockContext = { log: jest.fn() };
            const script = new TestScript({ context: mockContext });

            await script.execute({});

            expect(mockContext.log).toHaveBeenCalledWith('info', 'Starting');
        });
    });

    describe('Integration with child classes', () => {
        it('should support full lifecycle with context injection', async () => {
            class MyScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'My test script',
                    config: {
                        requireIntegrationInstance: true,
                    },
                };

                async execute(params) {
                    this.context.log('info', 'Starting execution');
                    this.context.log('debug', 'Processing', params);

                    if (this.integrationFactory) {
                        this.context.log('info', 'Integration factory available');
                    }

                    return { processed: true };
                }
            }

            const mockContext = { log: jest.fn() };
            const mockFactory = { getInstanceById: jest.fn() };
            const script = new MyScript({
                context: mockContext,
                executionId: 'exec_789',
                integrationFactory: mockFactory,
            });

            const result = await script.execute({ test: 'data' });

            expect(result).toEqual({ processed: true });

            expect(mockContext.log).toHaveBeenCalledTimes(3);
            expect(mockContext.log).toHaveBeenCalledWith('info', 'Starting execution');
            expect(mockContext.log).toHaveBeenCalledWith('debug', 'Processing', { test: 'data' });
            expect(mockContext.log).toHaveBeenCalledWith('info', 'Integration factory available');
        });
    });
});
