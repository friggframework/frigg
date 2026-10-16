const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
    usedByOf,
    EntityRegistryError,
} = require('./entity-type-registry');
const { BaseError } = require('../errors/base-error');
const { createMemorySink } = require('../logs');

const def = (moduleName, extra = {}) => ({ moduleName, ...extra });
const integration = (name, modules) => ({
    Definition: {
        name,
        modules: Object.fromEntries(
            Object.entries(modules).map(([key, definition]) => [
                key,
                { definition },
            ])
        ),
    },
});

const APP = { kind: 'app' };
const bound = (name) => ({ kind: 'integration', name });

const hubspot = def('hubspot');
const google = def('google');
const twilio = def('twilio');

describe('getEntityTypeRegistry', () => {
    it('registry-only: a type no integration binds is offered, with no integration source', () => {
        const registry = getEntityTypeRegistry({
            entities: { google: { definition: google } },
            integrations: [],
        });
        expect([...registry.keys()]).toEqual(['google']);
        expect(registry.get('google').definition).toBe(google);
        expect(registry.get('google').sources).toEqual([{ kind: 'app' }]);
        expect(usedByOf(registry.get('google'))).toEqual([]);
    });

    it('inferred-only: modules bound by integrations are offered with empty settings', () => {
        const registry = getEntityTypeRegistry({
            integrations: [integration('sync', { crm: hubspot })],
        });
        expect(registry.get('hubspot').definition).toBe(hubspot);
        expect(registry.get('hubspot').sources).toEqual([
            { kind: 'integration', name: 'sync' },
        ]);
        expect(registry.get('hubspot').settings).toEqual({});
        expect(usedByOf(registry.get('hubspot'))).toEqual(['sync']);
    });

    it('both: the same definition in the registry and an integration is one entry with both sources', () => {
        const registry = getEntityTypeRegistry({
            entities: { hubspot: { definition: hubspot } },
            integrations: [integration('sync', { crm: hubspot })],
        });
        expect(registry.size).toBe(1);
        expect(registry.get('hubspot').sources).toEqual([APP, bound('sync')]);
    });

    it('two integrations sharing one definition object is not a conflict', () => {
        const registry = getEntityTypeRegistry({
            integrations: [
                integration('a', { crm: hubspot }),
                integration('b', { contacts: hubspot }),
            ],
        });
        expect(registry.size).toBe(1);
        expect(registry.get('hubspot').sources).toEqual([
            bound('a'),
            bound('b'),
        ]);
    });

    it('one integration binding a definition twice lists the integration once', () => {
        const registry = getEntityTypeRegistry({
            integrations: [integration('a', { one: hubspot, two: hubspot })],
        });
        expect(registry.get('hubspot').sources).toEqual([
            { kind: 'integration', name: 'a' },
        ]);
    });

    it('two definitions with the same package name and version are the same definition', () => {
        const first = def('hubspot', {
            packageName: '@x/hubspot',
            version: '1.2.0',
        });
        const copy = def('hubspot', {
            packageName: '@x/hubspot',
            version: '1.2.0',
        });
        const registry = getEntityTypeRegistry({
            entities: { hubspot: { definition: first } },
            integrations: [integration('a', { crm: copy })],
        });
        expect(registry.get('hubspot').definition).toBe(first);
        expect(registry.get('hubspot').sources).toEqual([APP, bound('a')]);
    });

    describe('conflicts', () => {
        it('throws naming both sources when the registry and an integration disagree', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { hubspot: { definition: hubspot } },
                    integrations: [
                        integration('sync', { crm: def('hubspot') }),
                    ],
                })
            ).toThrow(/'hubspot'.*app.*integration:sync/s);
        });

        it('throws naming both integrations when two integrations disagree', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: {},
                    integrations: [
                        integration('a', { crm: def('hubspot') }),
                        integration('b', { crm: def('hubspot') }),
                    ],
                })
            ).toThrow(/integration:a.*integration:b/s);
        });

        it('is an EntityRegistryError with a stable code', () => {
            try {
                getEntityTypeRegistry({
                    entities: {},
                    integrations: [
                        integration('a', { crm: def('hubspot') }),
                        integration('b', { crm: def('hubspot') }),
                    ],
                });
                throw new Error('expected a throw');
            } catch (error) {
                expect(error).toBeInstanceOf(EntityRegistryError);
                expect(error).toBeInstanceOf(BaseError);
                expect(error.name).toBe('EntityRegistryError');
                expect(error.code).toBe('ENTITY_REGISTRY_INVALID');
            }
        });

        it('same package name but a different version conflicts', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: {},
                    integrations: [
                        integration('a', {
                            crm: def('hubspot', {
                                packageName: '@x/hubspot',
                                version: '1.0.0',
                            }),
                        }),
                        integration('b', {
                            crm: def('hubspot', {
                                packageName: '@x/hubspot',
                                version: '2.0.0',
                            }),
                        }),
                    ],
                })
            ).toThrow(EntityRegistryError);
        });

        it('a version alone, with no package name, is not enough to be the same', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: {},
                    integrations: [
                        integration('a', {
                            crm: def('hubspot', { version: '1.0.0' }),
                        }),
                        integration('b', {
                            crm: def('hubspot', { version: '1.0.0' }),
                        }),
                    ],
                })
            ).toThrow(EntityRegistryError);
        });

        it('package@version matching does not make two different definitions one: the first is kept', () => {
            const first = def('hubspot', {
                packageName: '@x/hubspot',
                version: '1.0.0',
                marker: 'first',
            });
            const second = def('hubspot', {
                packageName: '@x/hubspot',
                version: '1.0.0',
                marker: 'second',
            });
            const registry = getEntityTypeRegistry({
                entities: { hubspot: { definition: first } },
                integrations: [integration('a', { crm: second })],
            });
            expect(registry.get('hubspot').definition).toBe(first);
            expect(registry.get('hubspot').definition.marker).toBe('first');
        });

        describe('without an entities key (ADR: behaves as today)', () => {
            it('two different definitions under one name do not throw: the first wins and a warning is logged', () => {
                const sink = createMemorySink();
                const first = def('lenient-crm', { marker: 'first' });
                const second = def('lenient-crm', { marker: 'second' });

                const registry = getEntityTypeRegistry({
                    integrations: [
                        integration('a', { crm: first }),
                        integration('b', { crm: second }),
                    ],
                });

                expect(registry.get('lenient-crm').definition).toBe(first);
                expect(registry.get('lenient-crm').sources).toEqual([
                    bound('a'),
                ]);
                expect(getEntityTypeDefinitions(registry)).toEqual([first]);
                const warnings = sink.records.filter(
                    (r) =>
                        r.eventName ===
                        'frigg.modules.entity_registry.duplicate_definition'
                );
                expect(warnings).toEqual([
                    expect.objectContaining({
                        level: 'WARN',
                        entityType: 'lenient-crm',
                        kept: 'integration:a',
                        ignored: 'integration:b',
                    }),
                ]);
            });

            it('the same clash is fatal as soon as entities is present, even empty', () => {
                expect(() =>
                    getEntityTypeRegistry({
                        entities: {},
                        integrations: [
                            integration('a', { crm: def('strict-crm') }),
                            integration('b', { crm: def('strict-crm') }),
                        ],
                    })
                ).toThrow(EntityRegistryError);
            });
        });

        it('still applies with $infer: false', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: {
                        $infer: false,
                        hubspot: { definition: hubspot },
                    },
                    integrations: [
                        integration('sync', { crm: def('hubspot') }),
                    ],
                })
            ).toThrow(/different definitions/);
        });
    });

    describe('key rule', () => {
        it('throws when the key is not the definition name, naming key and name', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { crm: { definition: hubspot } },
                })
            ).toThrow(/key 'crm'.*'hubspot'/s);
        });

        it('accepts a key equal to both moduleName and getName()', () => {
            const named = { moduleName: 'hubspot', getName: () => 'hubspot' };
            expect(
                getEntityTypeRegistry({
                    entities: { hubspot: { definition: named } },
                }).has('hubspot')
            ).toBe(true);
        });

        it('rejects a key equal to getName() but not to moduleName', () => {
            const named = { moduleName: 'hubspot', getName: () => 'hs' };
            expect(() =>
                getEntityTypeRegistry({
                    entities: { hs: { definition: named } },
                })
            ).toThrow(/key 'hs'/);
        });

        it('rejects a key equal to moduleName but not to getName()', () => {
            const named = { moduleName: 'hubspot', getName: () => 'hs' };
            expect(() =>
                getEntityTypeRegistry({
                    entities: { hubspot: { definition: named } },
                })
            ).toThrow(/key 'hubspot'/);
        });

        it('cannot register one object under two keys (no double entry)', () => {
            const named = { moduleName: 'hubspot', getName: () => 'hubspot' };
            expect(() =>
                getEntityTypeRegistry({
                    entities: {
                        hubspot: { definition: named },
                        hs: { definition: named },
                    },
                })
            ).toThrow(/key 'hs'/);
        });

        it.each(['HubSpot', 'HUBSPOT', 'hubspot ', ' hubspot'])(
            'is case and whitespace sensitive: rejects key %p',
            (key) => {
                expect(() =>
                    getEntityTypeRegistry({
                        entities: { [key]: { definition: hubspot } },
                    })
                ).toThrow(EntityRegistryError);
            }
        );

        it.each(['HubSpot', 'HUBSPOT'])(
            'is case sensitive for a definition that only has getName(): rejects %p',
            (key) => {
                const named = { getName: () => 'hubspot' };
                expect(() =>
                    getEntityTypeRegistry({
                        entities: { [key]: { definition: named } },
                    })
                ).toThrow(EntityRegistryError);
            }
        );

        it('rejects a definition with neither moduleName nor getName()', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { anything: { definition: {} } },
                })
            ).toThrow(EntityRegistryError);
        });

        it('uses getName() when there is no moduleName', () => {
            const named = { getName: () => 'hubspot' };
            expect(
                getEntityTypeRegistry({
                    entities: { hubspot: { definition: named } },
                }).has('hubspot')
            ).toBe(true);
            expect(() =>
                getEntityTypeRegistry({
                    entities: { crm: { definition: named } },
                })
            ).toThrow(EntityRegistryError);
        });

        it('rejects an entry with no definition, naming the key', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { hubspot: { scope: 'global' } },
                })
            ).toThrow(/entities\.hubspot/);
        });

        it('rejects an entities value that is not an object', () => {
            expect(() =>
                getEntityTypeRegistry({ entities: [hubspot] })
            ).toThrow(EntityRegistryError);
        });
    });

    describe('$infer', () => {
        it('false: throws listing every missing name and the integration that binds it', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: {
                        $infer: false,
                        hubspot: { definition: hubspot },
                    },
                    integrations: [
                        integration('a', { crm: hubspot, chat: def('slack') }),
                        integration('b', { mail: google }),
                    ],
                })
            ).toThrow(
                /Missing: google \(bound by integration:b\); slack \(bound by integration:a\)/
            );
        });

        it('false with everything registered passes and still records integration sources', () => {
            const registry = getEntityTypeRegistry({
                entities: {
                    $infer: false,
                    hubspot: { definition: hubspot },
                    google: { definition: google },
                },
                integrations: [integration('sync', { crm: hubspot })],
            });
            expect([...registry.keys()].sort()).toEqual(['google', 'hubspot']);
            expect(registry.get('hubspot').sources).toEqual([
                APP,
                bound('sync'),
            ]);
            expect(registry.get('google').sources).toEqual([{ kind: 'app' }]);
        });

        it('false does not offer a module an integration binds but nobody registered (it throws instead)', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { $infer: false },
                    integrations: [integration('a', { crm: hubspot })],
                })
            ).toThrow(/hubspot/);
        });

        it('true or absent infers', () => {
            for (const entities of [{ $infer: true }, {}, undefined]) {
                const registry = getEntityTypeRegistry({
                    entities,
                    integrations: [integration('a', { crm: hubspot })],
                });
                expect(registry.has('hubspot')).toBe(true);
            }
        });

        it('is not treated as an entity', () => {
            const registry = getEntityTypeRegistry({
                entities: { $infer: false },
            });
            expect(registry.size).toBe(0);
        });

        it('must be a boolean', () => {
            expect(() =>
                getEntityTypeRegistry({ entities: { $infer: 'no' } })
            ).toThrow(/\$infer must be a boolean/);
        });
    });

    describe('settings', () => {
        it('copies scope, proxy and display from the registry entry only', () => {
            const settings = {
                scope: {
                    default: 'individual',
                    allow: ['individual', 'global'],
                },
                proxy: { allow: 'module' },
                display: { label: 'HubSpot CRM' },
            };
            const registry = getEntityTypeRegistry({
                entities: {
                    hubspot: {
                        definition: hubspot,
                        ...settings,
                        ignored: true,
                    },
                },
                integrations: [integration('sync', { crm: hubspot })],
            });
            expect(registry.get('hubspot').settings).toEqual(settings);
        });

        it('omits settings the entry does not set', () => {
            const registry = getEntityTypeRegistry({
                entities: { twilio: { definition: twilio, scope: 'global' } },
            });
            expect(registry.get('twilio').settings).toEqual({
                scope: 'global',
            });
        });
    });

    describe('sources', () => {
        it('lists app first, then each binding integration in declaration order', () => {
            const registry = getEntityTypeRegistry({
                entities: { hubspot: { definition: hubspot } },
                integrations: [
                    integration('z-last', { crm: hubspot }),
                    integration('a-first', { crm: hubspot }),
                ],
            });
            expect(registry.get('hubspot').sources).toEqual([
                APP,
                bound('z-last'),
                bound('a-first'),
            ]);
        });

        it('returns frozen entries', () => {
            const entry = getEntityTypeRegistry({
                entities: { hubspot: { definition: hubspot } },
            }).get('hubspot');
            expect(Object.isFrozen(entry)).toBe(true);
            expect(Object.isFrozen(entry.sources)).toBe(true);
            expect(Object.isFrozen(entry.settings)).toBe(true);
        });
    });

    it('is pure: does not mutate the app definition', () => {
        const appDefinition = {
            entities: { hubspot: { definition: hubspot, scope: 'global' } },
            integrations: [integration('a', { crm: hubspot })],
        };
        const before = JSON.stringify(appDefinition);
        getEntityTypeRegistry(appDefinition);
        expect(JSON.stringify(appDefinition)).toBe(before);
    });

    it('tolerates an empty or missing app definition and integrations without modules', () => {
        expect(getEntityTypeRegistry().size).toBe(0);
        expect(getEntityTypeRegistry({}).size).toBe(0);
        expect(
            getEntityTypeRegistry({
                integrations: [{ Definition: { name: 'bare' } }],
            }).size
        ).toBe(0);
    });

    describe('a bound definition with no moduleName or getName()', () => {
        const anonymous = { encryption: { credentialFields: ['token'] } };

        it('is still offered, de-duplicated by identity, as before', () => {
            const definitions = getEntityTypeDefinitions(
                getEntityTypeRegistry({
                    integrations: [
                        integration('a', { one: anonymous }),
                        integration('b', { two: anonymous }),
                        integration('c', { three: { encryption: {} } }),
                    ],
                })
            );
            expect(definitions).toHaveLength(2);
            expect(definitions[0]).toBe(anonymous);
        });

        it('cannot be registered, so $infer: false rejects it', () => {
            expect(() =>
                getEntityTypeRegistry({
                    entities: { $infer: false },
                    integrations: [integration('a', { one: anonymous })],
                })
            ).toThrow(/\(unnamed definition\) \(bound by integration:a\)/);
        });
    });
});
