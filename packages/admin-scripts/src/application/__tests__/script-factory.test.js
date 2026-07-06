const { ScriptFactory } = require('../script-factory');
const { AdminScriptBase } = require('../admin-script-base');

describe('ScriptFactory', () => {
    let factory;

    beforeEach(() => {
        factory = new ScriptFactory();
    });

    describe('register()', () => {
        it('should register a script class', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test-script',
                    version: '1.0.0',
                    description: 'A test script',
                };
            }

            factory.register(TestScript);

            expect(factory.has('test-script')).toBe(true);
            expect(factory.size).toBe(1);
        });

        it('should throw error if script class has no Definition', () => {
            class InvalidScript {}

            expect(() => factory.register(InvalidScript)).toThrow(
                'Script class must have a static Definition property'
            );
        });

        it('should throw error if Definition has no name', () => {
            class InvalidScript extends AdminScriptBase {
                static Definition = {
                    version: '1.0.0',
                    description: 'No name',
                };
            }

            expect(() => factory.register(InvalidScript)).toThrow(
                'Script Definition must have a name'
            );
        });

        it('should throw error if script name is already registered', () => {
            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'duplicate',
                    version: '1.0.0',
                    description: 'First',
                };
            }

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'duplicate',
                    version: '2.0.0',
                    description: 'Second',
                };
            }

            factory.register(Script1);

            expect(() => factory.register(Script2)).toThrow(
                'Script "duplicate" is already registered'
            );
        });
    });

    describe('registerAll()', () => {
        it('should register multiple scripts', () => {
            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'script-1',
                    version: '1.0.0',
                    description: 'First',
                };
            }

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'script-2',
                    version: '1.0.0',
                    description: 'Second',
                };
            }

            class Script3 extends AdminScriptBase {
                static Definition = {
                    name: 'script-3',
                    version: '1.0.0',
                    description: 'Third',
                };
            }

            factory.registerAll([Script1, Script2, Script3]);

            expect(factory.size).toBe(3);
            expect(factory.has('script-1')).toBe(true);
            expect(factory.has('script-2')).toBe(true);
            expect(factory.has('script-3')).toBe(true);
        });

        it('should handle empty array', () => {
            factory.registerAll([]);

            expect(factory.size).toBe(0);
        });
    });

    describe('get()', () => {
        it('should return registered script class', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'Test',
                };
            }

            factory.register(TestScript);

            const retrieved = factory.get('test');

            expect(retrieved).toBe(TestScript);
        });

        it('should throw error if script not found', () => {
            expect(() => factory.get('non-existent')).toThrow(
                'Script "non-existent" not found'
            );
        });
    });

    describe('has()', () => {
        it('should return true for registered script', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'Test',
                };
            }

            factory.register(TestScript);

            expect(factory.has('test')).toBe(true);
        });

        it('should return false for non-registered script', () => {
            expect(factory.has('non-existent')).toBe(false);
        });
    });

    describe('getNames()', () => {
        it('should return array of all registered script names', () => {
            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'script-1',
                    version: '1.0.0',
                    description: 'One',
                };
            }

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'script-2',
                    version: '1.0.0',
                    description: 'Two',
                };
            }

            factory.registerAll([Script1, Script2]);

            const names = factory.getNames();

            expect(names).toHaveLength(2);
            expect(names).toContain('script-1');
            expect(names).toContain('script-2');
        });

        it('should return empty array when no scripts registered', () => {
            const names = factory.getNames();

            expect(names).toEqual([]);
        });
    });

    describe('getAll()', () => {
        it('should return all scripts with their definitions', () => {
            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'script-1',
                    version: '1.0.0',
                    description: 'First script',
                };
            }

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'script-2',
                    version: '2.0.0',
                    description: 'Second script',
                };
            }

            factory.registerAll([Script1, Script2]);

            const all = factory.getAll();

            expect(all).toHaveLength(2);

            const script1Entry = all.find((s) => s.name === 'script-1');
            const script2Entry = all.find((s) => s.name === 'script-2');

            expect(script1Entry.definition).toEqual(Script1.Definition);
            expect(script2Entry.definition).toEqual(Script2.Definition);
        });

        it('should return empty array when no scripts registered', () => {
            const all = factory.getAll();

            expect(all).toEqual([]);
        });
    });

    describe('createInstance()', () => {
        it('should create an instance of registered script', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'Test',
                };
            }

            factory.register(TestScript);

            const instance = factory.createInstance('test');

            expect(instance).toBeInstanceOf(TestScript);
            expect(instance).toBeInstanceOf(AdminScriptBase);
        });

        it('should pass params to constructor', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'Test',
                };
            }

            factory.register(TestScript);

            const mockFactory = { mock: true };
            const instance = factory.createInstance('test', {
                executionId: 'exec_123',
                integrationFactory: mockFactory,
            });

            expect(instance.executionId).toBe('exec_123');
            expect(instance.integrationFactory).toBe(mockFactory);
        });

        it('should throw error if script not found', () => {
            expect(() => factory.createInstance('non-existent')).toThrow(
                'Script "non-existent" not found'
            );
        });
    });

    describe('clear()', () => {
        it('should remove all registered scripts', () => {
            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'script-1',
                    version: '1.0.0',
                    description: 'One',
                };
            }

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'script-2',
                    version: '1.0.0',
                    description: 'Two',
                };
            }

            factory.registerAll([Script1, Script2]);
            expect(factory.size).toBe(2);

            factory.clear();

            expect(factory.size).toBe(0);
            expect(factory.has('script-1')).toBe(false);
            expect(factory.has('script-2')).toBe(false);
        });
    });

    describe('size property', () => {
        it('should return count of registered scripts', () => {
            expect(factory.size).toBe(0);

            class Script1 extends AdminScriptBase {
                static Definition = {
                    name: 'script-1',
                    version: '1.0.0',
                    description: 'One',
                };
            }

            factory.register(Script1);
            expect(factory.size).toBe(1);

            class Script2 extends AdminScriptBase {
                static Definition = {
                    name: 'script-2',
                    version: '1.0.0',
                    description: 'Two',
                };
            }

            factory.register(Script2);
            expect(factory.size).toBe(2);

            factory.clear();
            expect(factory.size).toBe(0);
        });
    });

    describe('constructor', () => {
        it('registers scripts passed to the constructor', () => {
            class ScriptOne extends AdminScriptBase {
                static Definition = {
                    name: 'script-one',
                    version: '1.0.0',
                    description: 'One',
                };
            }
            class ScriptTwo extends AdminScriptBase {
                static Definition = {
                    name: 'script-two',
                    version: '1.0.0',
                    description: 'Two',
                };
            }

            const factory = new ScriptFactory([ScriptOne, ScriptTwo]);

            expect(factory.size).toBe(2);
            expect(factory.has('script-one')).toBe(true);
            expect(factory.has('script-two')).toBe(true);
        });
    });

    describe('Instance independence', () => {
        it('new ScriptFactory() creates independent instances', () => {
            const factory1 = new ScriptFactory();
            const factory2 = new ScriptFactory();

            expect(factory1).not.toBe(factory2);
            expect(factory1).toBeInstanceOf(ScriptFactory);
            expect(factory2).toBeInstanceOf(ScriptFactory);
        });

        it('registering into one factory does not affect another', () => {
            class TestScript extends AdminScriptBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    description: 'Test',
                };
            }

            const factoryA = new ScriptFactory();
            const factoryB = new ScriptFactory();
            factoryA.register(TestScript);

            expect(factoryA.has('test')).toBe(true);
            expect(factoryB.has('test')).toBe(false);
        });
    });

    describe('Exported AdminScriptBase', () => {
        it('should export AdminScriptBase class', () => {
            expect(AdminScriptBase).toBeDefined();
            expect(typeof AdminScriptBase).toBe('function');
        });

        it('should be usable to create scripts', () => {
            class MyScript extends AdminScriptBase {
                static Definition = {
                    name: 'my-script',
                    version: '1.0.0',
                    description: 'My script',
                };

                async execute(frigg, params) {
                    return { success: true };
                }
            }

            const script = new MyScript();
            expect(script).toBeInstanceOf(AdminScriptBase);
        });
    });
});
