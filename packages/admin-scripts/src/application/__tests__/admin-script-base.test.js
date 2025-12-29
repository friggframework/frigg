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
                        label: 'Test Script',
                        description: 'For testing',
                        category: 'testing',
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
    });

    describe('Constructor', () => {
        it('should initialize with default values', () => {
            const script = new AdminScriptBase();

            expect(script.executionId).toBeNull();
            expect(script.logs).toEqual([]);
            expect(script._startTime).toBeNull();
            expect(script.integrationFactory).toBeNull();
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

        it('should accept both executionId and integrationFactory', () => {
            const mockFactory = { mock: true };
            const script = new AdminScriptBase({
                executionId: 'exec_456',
                integrationFactory: mockFactory,
            });

            expect(script.executionId).toBe('exec_456');
            expect(script.integrationFactory).toBe(mockFactory);
        });
    });

    describe('execute()', () => {
        it('should throw error when not implemented by subclass', async () => {
            const script = new AdminScriptBase();

            await expect(script.execute({}, {})).rejects.toThrow(
                'AdminScriptBase.execute() must be implemented by subclass'
            );
        });

        it('should allow child classes to implement execute()', async () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'test',
                };

                async execute(frigg, params) {
                    return { result: 'success', params };
                }
            }

            const script = new TestScript();
            const frigg = {};
            const params = { foo: 'bar' };

            const result = await script.execute(frigg, params);

            expect(result.result).toBe('success');
            expect(result.params).toEqual({ foo: 'bar' });
        });
    });

    describe('Logging methods', () => {
        it('log() should create log entry with timestamp', () => {
            const script = new AdminScriptBase();
            const beforeTime = new Date().toISOString();

            const entry = script.log('info', 'Test message', { key: 'value' });

            const afterTime = new Date().toISOString();

            expect(entry.level).toBe('info');
            expect(entry.message).toBe('Test message');
            expect(entry.data).toEqual({ key: 'value' });
            expect(entry.timestamp).toBeDefined();
            expect(entry.timestamp >= beforeTime).toBe(true);
            expect(entry.timestamp <= afterTime).toBe(true);
        });

        it('log() should add entry to logs array', () => {
            const script = new AdminScriptBase();

            script.log('info', 'First');
            script.log('error', 'Second');
            script.log('warn', 'Third');

            const logs = script.getLogs();

            expect(logs).toHaveLength(3);
            expect(logs[0].message).toBe('First');
            expect(logs[1].message).toBe('Second');
            expect(logs[2].message).toBe('Third');
        });

        it('log() should default data to empty object', () => {
            const script = new AdminScriptBase();

            const entry = script.log('info', 'No data');

            expect(entry.data).toEqual({});
        });

        it('getLogs() should return logs array', () => {
            const script = new AdminScriptBase();

            script.log('info', 'Message 1');
            script.log('error', 'Message 2');

            const logs = script.getLogs();

            expect(logs).toHaveLength(2);
            expect(logs[0].level).toBe('info');
            expect(logs[1].level).toBe('error');
        });

        it('clearLogs() should empty logs array', () => {
            const script = new AdminScriptBase();

            script.log('info', 'Message 1');
            script.log('info', 'Message 2');
            expect(script.getLogs()).toHaveLength(2);

            script.clearLogs();

            expect(script.getLogs()).toHaveLength(0);
        });
    });

    describe('Integration with child classes', () => {
        it('should support full lifecycle', async () => {
            class MyScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'My test script',
                    config: {
                        requireIntegrationInstance: true,
                    },
                };

                async execute(frigg, params) {
                    this.log('info', 'Starting execution');
                    this.log('debug', 'Processing', params);

                    if (this.integrationFactory) {
                        this.log('info', 'Integration factory available');
                    }

                    return { processed: true };
                }
            }

            const mockFactory = { getInstanceById: jest.fn() };
            const script = new MyScript({
                executionId: 'exec_789',
                integrationFactory: mockFactory,
            });

            const frigg = {};
            const result = await script.execute(frigg, { test: 'data' });

            expect(result).toEqual({ processed: true });

            const logs = script.getLogs();
            expect(logs).toHaveLength(3);
            expect(logs[0].message).toBe('Starting execution');
            expect(logs[1].message).toBe('Processing');
            expect(logs[2].message).toBe('Integration factory available');
        });
    });
});
