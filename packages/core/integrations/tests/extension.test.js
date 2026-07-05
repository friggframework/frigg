jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const {
    validateExtensionBinding,
    getExtensionRoutes,
    getExtensionWorkers,
} = require('../extension');
const { IntegrationBase } = require('../integration-base');

const buildExtension = (overrides = {}) => ({
    name: 'test-extension',
    routes: [{ path: '/hook', method: 'POST', event: 'TEST_EVENT' }],
    events: {
        TEST_EVENT: {
            type: 'LIFE_CYCLE_EVENT',
            handler: async function defaultHandler() {
                return { source: 'extension' };
            },
        },
    },
    ...overrides,
});

describe('validateExtensionBinding', () => {
    it('accepts a valid bundle', () => {
        expect(() =>
            validateExtensionBinding(buildExtension(), 'binding-a', 'int-x')
        ).not.toThrow();
    });

    it('rejects a missing extension object', () => {
        expect(() =>
            validateExtensionBinding(undefined, 'binding-a', 'int-x')
        ).toThrow(/must be an object/);
    });

    it('rejects a bundle without a name', () => {
        expect(() =>
            validateExtensionBinding(
                { ...buildExtension(), name: undefined },
                'binding-a',
                'int-x'
            )
        ).toThrow(/missing required "name"/);
    });

    it('rejects routes that reference an undeclared event', () => {
        const bad = buildExtension({
            routes: [{ path: '/x', method: 'POST', event: 'MISSING_EVENT' }],
        });
        expect(() =>
            validateExtensionBinding(bad, 'binding-a', 'int-x')
        ).toThrow(/references event "MISSING_EVENT"/);
    });

    it('rejects routes with unsupported HTTP methods', () => {
        const bad = buildExtension({
            routes: [{ path: '/x', method: 'CONNECT', event: 'TEST_EVENT' }],
        });
        expect(() =>
            validateExtensionBinding(bad, 'binding-a', 'int-x')
        ).toThrow(/unsupported method "CONNECT"/);
    });

    it('includes the integration name and binding name in error context', () => {
        try {
            validateExtensionBinding(
                { name: 'ext-a' },
                'webhooks',
                'hubspot'
            );
            throw new Error('should have thrown above');
        } catch (e) {
            // no routes/events on this bundle so validation passes — re-test
            // with a known-bad shape that triggers the contextualized message
        }
        expect(() =>
            validateExtensionBinding({}, 'webhooks', 'hubspot')
        ).toThrow(/Integration "hubspot" extension binding "webhooks"/);
    });
});

describe('getExtensionRoutes', () => {
    it('returns an empty array when Definition.extensions is empty', () => {
        class NoExt extends IntegrationBase {
            static Definition = {
                name: 'no-ext',
                version: '1.0.0',
                modules: {},
                extensions: {},
            };
        }
        expect(getExtensionRoutes(NoExt)).toEqual([]);
    });

    it('flattens routes across all bindings and includes binding metadata', () => {
        const ext = buildExtension({
            routes: [
                { path: '/hook', method: 'POST', event: 'TEST_EVENT' },
                { path: '/ping', method: 'GET', event: 'TEST_EVENT' },
            ],
        });

        class WithExt extends IntegrationBase {
            static Definition = {
                name: 'with-ext',
                version: '1.0.0',
                modules: {},
                extensions: {
                    primary: { extension: ext },
                    sandbox: { extension: ext },
                },
            };
        }

        const flat = getExtensionRoutes(WithExt);
        expect(flat).toHaveLength(4);
        expect(flat[0]).toMatchObject({
            bindingName: 'primary',
            extensionName: 'test-extension',
            path: '/hook',
            method: 'POST',
            event: 'TEST_EVENT',
        });
        expect(flat.filter((r) => r.bindingName === 'sandbox')).toHaveLength(2);
    });

    it('throws at boot when a binding is missing the extension field (fail fast, not at first request)', () => {
        class Loose extends IntegrationBase {
            static Definition = {
                name: 'loose',
                version: '1.0.0',
                modules: {},
                extensions: { dangling: {} },
            };
        }
        expect(() => getExtensionRoutes(Loose)).toThrow(
            /extension binding "dangling": extension must be an object/
        );
    });
});

describe('useDatabase resolution', () => {
    it('accepts a boolean extension.useDatabase', () => {
        expect(() =>
            validateExtensionBinding(
                buildExtension({ useDatabase: true }),
                'b',
                'int'
            )
        ).not.toThrow();
        expect(() =>
            validateExtensionBinding(
                buildExtension({ useDatabase: false }),
                'b',
                'int'
            )
        ).not.toThrow();
    });

    it('rejects a non-boolean extension.useDatabase', () => {
        expect(() =>
            validateExtensionBinding(
                buildExtension({ useDatabase: 'yes' }),
                'b',
                'int'
            )
        ).toThrow(/useDatabase.*boolean/i);
    });

    it('rejects a non-boolean binding.useDatabase', () => {
        const ext = buildExtension();
        expect(() =>
            validateExtensionBinding(ext, 'b', 'int', {
                extension: ext,
                useDatabase: 'nope',
            })
        ).toThrow(/useDatabase.*boolean/i);
    });

    it('getExtensionRoutes defaults useDatabase to false when unset', () => {
        const ext = buildExtension();
        class C extends IntegrationBase {
            static Definition = {
                name: 'c',
                modules: {},
                extensions: { b: { extension: ext } },
            };
        }
        expect(getExtensionRoutes(C)[0].useDatabase).toBe(false);
    });

    it('getExtensionRoutes surfaces extension-level useDatabase', () => {
        const ext = buildExtension({ useDatabase: true });
        class C extends IntegrationBase {
            static Definition = {
                name: 'c',
                modules: {},
                extensions: { b: { extension: ext } },
            };
        }
        expect(getExtensionRoutes(C)[0].useDatabase).toBe(true);
    });

    it('getExtensionRoutes lets binding.useDatabase override the extension default (false wins over true)', () => {
        const ext = buildExtension({ useDatabase: true });
        class C extends IntegrationBase {
            static Definition = {
                name: 'c',
                modules: {},
                extensions: { b: { extension: ext, useDatabase: false } },
            };
        }
        expect(getExtensionRoutes(C)[0].useDatabase).toBe(false);
    });
});

describe('validateExtensionBinding — handler/binding shape validation', () => {
    it('rejects an event whose handler is set but not a function', () => {
        expect(() =>
            validateExtensionBinding(
                {
                    name: 'ext',
                    events: { TEST: { handler: 'not-a-function' } },
                },
                'b',
                'int'
            )
        ).toThrow(/"handler" must be a function/);
    });

    it('rejects binding.handlers values that are not strings', () => {
        expect(() =>
            validateExtensionBinding(
                buildExtension(),
                'b',
                'int',
                { handlers: { TEST_EVENT: () => null } }
            )
        ).toThrow(/must be a non-empty method name string/);
    });

    it('rejects binding.handlers keys that reference unknown events (typo guard)', () => {
        expect(() =>
            validateExtensionBinding(
                buildExtension(),
                'b',
                'int',
                { handlers: { TYPO_EVENT: 'someMethod' } }
            )
        ).toThrow(/references event "TYPO_EVENT".*not declared.*check for typos/);
    });

    it('rejects binding.handlers that is not a plain object', () => {
        expect(() =>
            validateExtensionBinding(buildExtension(), 'b', 'int', {
                handlers: ['ARRAY_NOT_OK'],
            })
        ).toThrow(/"handlers" must be an object/);
    });
});

describe('getExtensionWorkers', () => {
    it('returns the flattened worker list', () => {
        class WithWorkers extends IntegrationBase {
            static Definition = {
                name: 'with-workers',
                version: '1.0.0',
                modules: {},
                extensions: {
                    a: {
                        extension: {
                            ...buildExtension(),
                            workers: [{ event: 'BG_TASK' }],
                        },
                    },
                },
            };
        }
        const flat = getExtensionWorkers(WithWorkers);
        expect(flat).toHaveLength(1);
        expect(flat[0]).toMatchObject({
            bindingName: 'a',
            extensionName: 'test-extension',
            event: 'BG_TASK',
        });
    });
});

describe('IntegrationBase._mergeExtensions (via initialize)', () => {
    const makeIntegrationClass = (extensions, extra = {}) => {
        return class TestIntegration extends IntegrationBase {
            static Definition = {
                name: 'test-int',
                version: '1.0.0',
                modules: {},
                extensions,
                ...extra,
            };

            async onCustomEvent({ data } = {}) {
                this.callCount = (this.callCount || 0) + 1;
                this.lastData = data;
                return { ok: true };
            }
        };
    };

    it('is a no-op when extensions is empty', async () => {
        const Klass = makeIntegrationClass({});
        const instance = new Klass();
        await instance.initialize();
        expect(instance.events).toEqual({});
    });

    it('binds a string handler reference to a method on the instance', async () => {
        const Klass = makeIntegrationClass({
            ext: {
                extension: buildExtension({
                    events: {
                        TEST_EVENT: { type: 'LIFE_CYCLE_EVENT' },
                    },
                    routes: [],
                }),
                handlers: { TEST_EVENT: 'onCustomEvent' },
            },
        });
        const instance = new Klass();
        await instance.initialize();
        expect(instance.events.TEST_EVENT).toBeDefined();
        expect(typeof instance.events.TEST_EVENT.handler).toBe('function');

        await instance.events.TEST_EVENT.handler({ data: { foo: 'bar' } });
        expect(instance.callCount).toBe(1);
        expect(instance.lastData).toEqual({ foo: 'bar' });
    });

    it('falls back to the extension-provided default handler when no binding override is given', async () => {
        const Klass = makeIntegrationClass({
            ext: { extension: buildExtension() },
        });
        const instance = new Klass();
        await instance.initialize();
        const result = await instance.events.TEST_EVENT.handler();
        expect(result).toEqual({ source: 'extension' });
    });

    it('throws when the binding references a method that does not exist on the instance', async () => {
        const Klass = makeIntegrationClass({
            ext: {
                extension: buildExtension(),
                handlers: { TEST_EVENT: 'nonExistentMethod' },
            },
        });
        const instance = new Klass();
        await expect(instance.initialize()).rejects.toThrow(
            /handler method "nonExistentMethod" not found on instance/
        );
    });

    it('throws when neither the binding nor the extension provides a handler', async () => {
        const Klass = makeIntegrationClass({
            ext: {
                extension: buildExtension({
                    events: { TEST_EVENT: { type: 'LIFE_CYCLE_EVENT' } },
                    routes: [],
                }),
            },
        });
        const instance = new Klass();
        await expect(instance.initialize()).rejects.toThrow(
            /no default handler/
        );
    });

    it('throws when the extension bundle has a route referencing an undeclared event', async () => {
        const badExt = {
            name: 'bad-ext',
            routes: [{ path: '/x', method: 'POST', event: 'MISSING' }],
            events: { OTHER: { handler: async () => null } },
        };
        const Klass = makeIntegrationClass({
            ext: { extension: badExt },
        });
        const instance = new Klass();
        await expect(instance.initialize()).rejects.toThrow(
            /references event "MISSING"/
        );
    });

    it('preserves explicit subclass-defined events when an extension declares the same event', async () => {
        // The constructor of a subclass may set this.events.TEST_EVENT directly;
        // we should not overwrite it with the extension's binding.
        const Klass = class extends makeIntegrationClass({
            ext: {
                extension: buildExtension(),
                handlers: { TEST_EVENT: 'onCustomEvent' },
            },
        }) {
            constructor(params) {
                super(params);
                this.events.TEST_EVENT = {
                    type: 'USER_ACTION',
                    handler: () => ({ source: 'subclass' }),
                };
            }
        };
        const instance = new Klass();
        await instance.initialize();
        const result = await instance.events.TEST_EVENT.handler();
        expect(result).toEqual({ source: 'subclass' });
    });

    it('throws when two bindings declare the same event name (no silent first/last-writer)', async () => {
        const ext = {
            name: 'multi-ext',
            routes: [],
            events: {
                EVENT_A: { handler: async () => ({ tag: 'default' }) },
            },
        };
        const Klass = class extends IntegrationBase {
            static Definition = {
                name: 'multi',
                version: '1.0.0',
                modules: {},
                extensions: {
                    primary: {
                        extension: ext,
                        handlers: { EVENT_A: 'primaryHandler' },
                    },
                    secondary: {
                        extension: ext,
                        handlers: { EVENT_A: 'secondaryHandler' },
                    },
                },
            };
            async primaryHandler() {
                return { tag: 'primary' };
            }
            async secondaryHandler() {
                return { tag: 'secondary' };
            }
        };
        const instance = new Klass();
        await expect(instance.initialize()).rejects.toThrow(
            /extension event conflict.*EVENT_A.*"primary".*"secondary"/
        );
    });

    it('throws when two bindings share an extension whose events overlap (binding-the-same-extension-twice limitation)', async () => {
        // Two bindings of the same extension both iterate the same events map,
        // so the second binding's iteration always conflicts with the first.
        // Documented in EXTENSIONS.md as a known limitation: bind the same
        // extension twice only if you've ensured at most one event is declared.
        const ext = {
            name: 'shared-ext',
            routes: [],
            events: {
                EVENT_A: { handler: async () => null },
                EVENT_B: { handler: async () => null },
            },
        };
        const Klass = class extends IntegrationBase {
            static Definition = {
                name: 'shared',
                version: '1.0.0',
                modules: {},
                extensions: {
                    a: { extension: ext, handlers: { EVENT_A: 'handleA' } },
                    b: { extension: ext, handlers: { EVENT_B: 'handleB' } },
                },
            };
            async handleA() {
                return { tag: 'a' };
            }
            async handleB() {
                return { tag: 'b' };
            }
        };
        const instance = new Klass();
        await expect(instance.initialize()).rejects.toThrow(
            /extension event conflict/
        );
    });

    it('warns (does not throw) when a subclass shadows a binding-declared handler', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const ParentKlass = makeIntegrationClass({
                ext: {
                    extension: buildExtension(),
                    handlers: { TEST_EVENT: 'onCustomEvent' },
                },
            });
            class SubKlass extends ParentKlass {
                constructor(params) {
                    super(params);
                    this.events.TEST_EVENT = {
                        type: 'USER_ACTION',
                        handler: () => ({ source: 'subclass' }),
                    };
                }
            }
            const instance = new SubKlass();
            await instance.initialize();
            const result = await instance.events.TEST_EVENT.handler();
            expect(result).toEqual({ source: 'subclass' });
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/handler "onCustomEvent".*ignored/)
            );
        } finally {
            warn.mockRestore();
        }
    });

    it('binds the handler to the integration instance (this-context preserved)', async () => {
        const Klass = makeIntegrationClass({
            ext: {
                extension: buildExtension({
                    events: { TEST_EVENT: { type: 'LIFE_CYCLE_EVENT' } },
                    routes: [],
                }),
                handlers: { TEST_EVENT: 'onCustomEvent' },
            },
        });
        const instance = new Klass();
        await instance.initialize();
        // detach the function reference, then call without explicit this
        const fn = instance.events.TEST_EVENT.handler;
        await fn({ data: { ping: 1 } });
        expect(instance.callCount).toBe(1);
    });
});
