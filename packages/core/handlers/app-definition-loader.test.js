const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('@friggframework/core/utils', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));

const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const { loadAppDefinition, setAppDefinition } = require('./app-definition-loader');
const { EntityRegistryError } = require('../modules/entity-type-registry');
const { OwnershipConfigError } = require('../modules/entity-scope');
const {
    ManagementApiConfigError,
} = require('../management-api/management-api-config');
const { isDeniedKey } = require('../logs/redact');
const { createMemorySink } = require('../logs');

function writeBackend(definition) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-app-def-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(
        path.join(dir, 'index.js'),
        `module.exports = { Definition: ${JSON.stringify(definition)} };`
    );
    findNearestBackendPackageJson.mockReturnValue(path.join(dir, 'package.json'));
    return dir;
}

describe('loadAppDefinition', () => {
    const dirs = [];

    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    describe('adopter JWT startup validation (ADR-056 §2)', () => {
        it('throws at load when adopterJwt is enabled without jwksUri or secret', () => {
            dirs.push(
                writeBackend({
                    integrations: [],
                    user: { authModes: { adopterJwt: true }, jwtConfig: { issuer: 'x' } },
                })
            );

            expect(() => loadAppDefinition()).toThrow(/neither jwksUri nor secret/);
        });

        it('throws at load when adopterJwt is enabled with no jwtConfig at all', () => {
            dirs.push(
                writeBackend({ integrations: [], user: { authModes: { adopterJwt: true } } })
            );

            expect(() => loadAppDefinition()).toThrow(/neither jwksUri nor secret/);
        });

        it('loads when adopterJwt is enabled with a jwksUri', () => {
            const user = {
                authModes: { adopterJwt: true },
                jwtConfig: {
                    jwksUri: 'https://login.example.com/jwks.json',
                    audience: 'frigg-api',
                },
            };
            dirs.push(writeBackend({ integrations: [], user }));

            expect(loadAppDefinition().userConfig).toEqual(user);
        });

        it('loads an app that never enabled adopterJwt, even with a stray empty jwtConfig', () => {
            dirs.push(writeBackend({ integrations: [], user: { jwtConfig: {} } }));

            expect(() => loadAppDefinition()).not.toThrow();
        });
    });

    it('returns managementApi from the app definition (ADR-053)', () => {
        const managementApi = { v1: false, proxy: { enable: true } };
        dirs.push(writeBackend({ integrations: [], managementApi }));

        expect(loadAppDefinition().managementApi).toEqual(managementApi);
    });

    it('defaults managementApi to an empty object', () => {
        dirs.push(writeBackend({ integrations: [] }));

        expect(loadAppDefinition().managementApi).toEqual({});
    });

    describe('managementApi.proxy.scopes (ADR-056 §3.5)', () => {
        it.each([
            ['an unknown scope', ['individual', 'team'], /unknown scope "team"/],
            ['global, which is never a tenant’s', ['global'], /'global' is not allowed/],
            ['a single string instead of a list', 'organization', /non-empty list/],
            ['an empty list', [], /non-empty list/],
            ['a scope listed twice', ['individual', 'individual'], /more than once/],
        ])('fails at load for %s, even with the proxy off', (_label, scopes, message) => {
            dirs.push(writeBackend({ integrations: [], managementApi: { proxy: { scopes } } }));
            expect(() => loadAppDefinition()).toThrow(ManagementApiConfigError);
            expect(() => loadAppDefinition()).toThrow(message);
        });

        it('loads with organization opted in, and returns the definition’s own block', () => {
            const managementApi = { proxy: { enable: true, scopes: ['individual', 'organization'] } };
            dirs.push(writeBackend({ integrations: [], managementApi }));
            expect(loadAppDefinition().managementApi).toEqual(managementApi);
        });
    });

    it('returns logging from the app definition', () => {
        const logging = { level: 'DEBUG', logGroup: { retentionInDays: 30 } };
        dirs.push(writeBackend({ integrations: [], logging }));

        expect(loadAppDefinition().logging).toEqual(logging);
    });

    it('defaults logging to null', () => {
        dirs.push(writeBackend({ integrations: [] }));

        expect(loadAppDefinition().logging).toBeNull();
    });

    it('registers module credential fields and custom schema leaves as denied log keys', () => {
        expect(isDeniedKey('acmePinCode')).toBe(false);
        expect(isDeniedKey('ledgerPin')).toBe(false);
        dirs.push(
            writeBackend({
                integrations: [
                    {
                        Definition: {
                            modules: {
                                acme: {
                                    definition: {
                                        encryption: { credentialFields: ['acme_pin_code'] },
                                    },
                                },
                            },
                        },
                    },
                ],
                encryption: { schema: { Ledger: { fields: ['data.ledger_pin'] } } },
            })
        );

        loadAppDefinition();

        expect(isDeniedKey('acmePinCode')).toBe(true);
        expect(isDeniedKey('ledgerPin')).toBe(true);
    });

    it('still loads when an integration has an unexpected shape', () => {
        dirs.push(writeBackend({ integrations: [{}], encryption: { schema: 'x' } }));

        expect(loadAppDefinition().integrations).toEqual([{}]);
    });

    it('keeps record-contract keys and warns once per ignored key', () => {
        const sink = createMemorySink();
        const definition = {
            integrations: [
                {
                    Definition: {
                        modules: {
                            acme: {
                                definition: {
                                    encryption: {
                                        credentialFields: ['user_id', 'domain', 'account_id'],
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        };
        dirs.push(writeBackend(definition));
        loadAppDefinition();
        dirs.push(writeBackend(definition));
        loadAppDefinition();

        expect(isDeniedKey('userId')).toBe(false);
        expect(isDeniedKey('accountId')).toBe(true);
        const warnings = sink.records.filter(
            (r) => r.eventName === 'frigg.logger.denied_key_ignored'
        );
        expect(warnings).toEqual([
            expect.objectContaining({ level: 'WARN', key: 'user_id' }),
        ]);
    });
    describe('entity registry (ADR-059)', () => {
        const xero = { moduleName: 'xero' };
        const hubspot = { moduleName: 'hubspot' };
        const sync = { Definition: { name: 'sync', modules: { crm: { definition: hubspot } } } };

        it('returns entities, the registry and the offered definitions, registry-only types included', () => {
            dirs.push(
                writeBackend({
                    integrations: [sync],
                    entities: { xero: { definition: xero, scope: 'global' } },
                })
            );

            const loaded = loadAppDefinition();

            expect(loaded.entities).toEqual({ xero: { definition: xero, scope: 'global' } });
            expect([...loaded.entityTypeRegistry.keys()].sort()).toEqual(['hubspot', 'xero']);
            expect(loaded.moduleDefinitions.map((d) => d.moduleName).sort()).toEqual([
                'hubspot',
                'xero',
            ]);
        });

        it('defaults entities to null and offers only integration-bound modules', () => {
            dirs.push(writeBackend({ integrations: [sync] }));

            const loaded = loadAppDefinition();

            expect(loaded.entities).toBeNull();
            expect(loaded.moduleDefinitions).toEqual([hubspot]);
        });

        it('registers a registry-only module’s credential fields as denied log keys', () => {
            const registryOnly = {
                moduleName: 'ledger',
                encryption: { credentialFields: ['quokkaLedgerRef'] },
            };
            expect(isDeniedKey('quokkaLedgerRef')).toBe(false);
            dirs.push(
                writeBackend({
                    integrations: [],
                    entities: { ledger: { definition: registryOnly } },
                })
            );

            loadAppDefinition();

            expect(isDeniedKey('quokkaLedgerRef')).toBe(true);
        });

        it.each([
            ['a key that is not the definition name', { entities: { crm: { definition: hubspot } } }, /key 'crm'/],
            [
                '$infer: false with an unregistered bound module',
                { entities: { $infer: false, xero: { definition: xero } } },
                /Missing: hubspot/,
            ],
            [
                'a registered definition that conflicts with an integration binding',
                { entities: { hubspot: { definition: { moduleName: 'hubspot', other: true } } } },
                /different definitions/,
            ],
        ])('fails at load, not on first request, for %s', (_label, extra, message) => {
            dirs.push(writeBackend({ integrations: [sync], ...extra }));

            expect(() => loadAppDefinition()).toThrow(EntityRegistryError);
            expect(() => loadAppDefinition()).toThrow(message);
        });
    });

    describe('ownership and entity scopes (ADR-056 §3.1)', () => {
        const hubspot = { moduleName: 'hubspot' };
        const sync = (extra = {}) => ({
            Definition: { name: 'sync', modules: { crm: { definition: hubspot } }, ...extra },
        });

        it('returns the resolved app-level ownership, defaulting to organization-wide individuals', () => {
            dirs.push(writeBackend({ integrations: [] }));
            expect(loadAppDefinition().ownership).toEqual({
                scope: null,
                individualAcross: 'organization',
                orgAdminRoles: ['ADMIN'],
                gateBearerTokens: false,
            });

            dirs.push(
                writeBackend({
                    integrations: [],
                    ownership: { scope: { default: 'organization', allow: ['organization', 'individual'] }, individualAcross: 'all' },
                })
            );
            expect(loadAppDefinition().ownership).toEqual({
                scope: { default: 'organization', allow: ['organization', 'individual'] },
                individualAcross: 'all',
                orgAdminRoles: ['ADMIN'],
                gateBearerTokens: false,
            });
        });

        it.each([
            ['an unknown individualAcross', { ownership: { individualAcross: 'everywhere' } }, /individualAcross/],
            ['a scope that is not one', { ownership: { scope: 'team' } }, /appDefinition.ownership.scope/],
            [
                'a registry scope that is not one',
                { integrations: [], entities: { hubspot: { definition: hubspot, scope: 'team' } } },
                /entity type 'hubspot' scope/,
            ],
            [
                'an organization-owned integration that binds an individual entity',
                { user: { primary: 'individual' }, integrations: [sync({ ownership: { owner: 'organization' } })] },
                /cannot bind an 'individual' entity/,
            ],
        ])('fails at load, not on the first request, for %s', (_label, extra, message) => {
            dirs.push(writeBackend({ integrations: [sync()], ...extra }));
            expect(() => loadAppDefinition()).toThrow(OwnershipConfigError);
            expect(() => loadAppDefinition()).toThrow(message);
        });
    });
});

describe('setAppDefinition (provider-netlify preamble)', () => {
    beforeEach(() => {
        findNearestBackendPackageJson.mockReset();
    });

    afterEach(() => {
        setAppDefinition(null);
        findNearestBackendPackageJson.mockReset();
    });

    it('returns the preset definition without discovering the backend', () => {
        const definition = {
            name: 'preset-app',
            provider: 'netlify',
            integrations: [],
            user: { primary: 'individual' },
        };
        setAppDefinition(definition);

        const result = loadAppDefinition();

        expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
        expect(result.appDefinition).toBe(definition);
        expect(result.integrations).toEqual([]);
        expect(result.userConfig).toEqual({ primary: 'individual' });
    });

    it('validates and derives a preset definition exactly like a discovered one', () => {
        setAppDefinition({
            integrations: [],
            user: { authModes: { adopterJwt: true }, jwtConfig: { issuer: 'x' } },
        });
        expect(() => loadAppDefinition()).toThrow(/neither jwksUri nor secret/);

        setAppDefinition({
            integrations: [],
            managementApi: { proxy: { enable: true, scopes: ['nonsense'] } },
        });
        expect(() => loadAppDefinition()).toThrow(ManagementApiConfigError);

        setAppDefinition({ integrations: [], managementApi: { v1: false } });
        const result = loadAppDefinition();
        expect(result.managementApi).toEqual({ v1: false });
        expect(result.entityTypeRegistry).toBeInstanceOf(Map);
        expect(result.ownership).toEqual(
            expect.objectContaining({ individualAcross: expect.any(String) })
        );
    });

    it('falls back to discovery once cleared with null', () => {
        setAppDefinition({ integrations: [] });
        setAppDefinition(null);
        findNearestBackendPackageJson.mockReturnValue(null);

        expect(() => loadAppDefinition()).toThrow('Could not find backend package.json');
    });

    it('returns the raw Definition as appDefinition on the discovery path too', () => {
        const dir = writeBackend({ name: 'discovered', integrations: [] });
        try {
            expect(loadAppDefinition().appDefinition).toEqual({
                name: 'discovered',
                integrations: [],
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('rejects a value that is not a definition object', () => {
        expect(() => setAppDefinition([])).toThrow(TypeError);
        expect(() => setAppDefinition('backend/index.js')).toThrow(TypeError);
    });
});

describe('integration schedule config (Definition.schedule)', () => {
    afterEach(() => setAppDefinition(null));

    const load = (schedule) => {
        setAppDefinition({ integrations: [{ Definition: { name: 'crm', modules: {}, schedule } }] });
        return loadAppDefinition();
    };

    it('loads without a schedule, and with each valid scope', () => {
        expect(() => load(undefined)).not.toThrow();
        expect(() => load({ scope: 'class' })).not.toThrow();
        expect(() => load({ scope: 'installation', isDue: () => true })).not.toThrow();
    });

    it('stops the app at load on a mistyped scope', () => {
        expect(() => load({ scope: 'installations' })).toThrow(
            expect.objectContaining({ name: 'ScheduleConfigError', code: 'SCHEDULE_CONFIG_INVALID' })
        );
    });
});
