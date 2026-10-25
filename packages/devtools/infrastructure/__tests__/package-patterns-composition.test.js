/**
 * Composer-level guard for ADR-050 (osls 4).
 *
 * osls 4 rejects package.include / package.exclude at every level and only
 * accepts `useDotenv: true` (or no key). Walk every function of a fully
 * featured composed definition and assert Frigg emits neither.
 */

const { composeServerlessDefinition } = require('../infrastructure-composer');

jest.mock('../domains/shared/resource-discovery', () => {
    const originalModule = jest.requireActual('../domains/shared/resource-discovery');
    return {
        ...originalModule,
        gatherDiscoveredResources: jest.fn().mockResolvedValue({
            defaultVpcId: 'vpc-123456',
            defaultSecurityGroupId: 'sg-123456',
            privateSubnetId1: 'subnet-123456',
            privateSubnetId2: 'subnet-789012',
            defaultKmsKeyId:
                'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
            auroraClusterEndpoint: 'test-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
            auroraPort: 5432,
        }),
    };
});

const featuredApp = () => ({
    name: 'featured-app',
    provider: 'aws',
    vpc: { enable: true },
    encryption: { useDefaultKMSForFieldLevelEncryption: true },
    database: {
        postgres: { enable: true },
        documentDB: { tlsCAFile: './global-bundle.pem' },
    },
    adminScripts: [{ Definition: { name: 'fixThings' } }],
    reports: [{ Definition: { name: 'usageReport' } }],
    integrations: [
        {
            Definition: {
                name: 'hubspot',
                webhooks: true,
                extensions: {
                    hubspotWebhooks: {
                        extension: {
                            name: 'hubspot-webhooks',
                            routes: [
                                {
                                    path: '/webhooks',
                                    method: 'POST',
                                    event: 'HUBSPOT_WEBHOOK_RECEIVED',
                                },
                            ],
                            events: {
                                HUBSPOT_WEBHOOK_RECEIVED: {
                                    type: 'LIFE_CYCLE_EVENT',
                                    handler: () => {},
                                },
                            },
                        },
                        handlers: {},
                    },
                },
            },
        },
        { Definition: { name: 'slack' } },
    ],
});

describe('composed definition is valid for osls 4 packaging (ADR-050)', () => {
    const originalArgv = process.argv;

    beforeEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        process.argv = originalArgv;
    });

    it('no function, the service or a layer carries package.include or package.exclude', async () => {
        process.argv = ['node', 'osls', 'package', '--stage', 'prod'];
        const definition = await composeServerlessDefinition(featuredApp());

        expect(definition.package).not.toHaveProperty('include');
        expect(definition.package).not.toHaveProperty('exclude');
        for (const layer of Object.values(definition.layers || {})) {
            expect(layer.package?.include).toBeUndefined();
            expect(layer.package?.exclude).toBeUndefined();
        }

        const functionNames = Object.keys(definition.functions);
        expect(functionNames).toEqual(
            expect.arrayContaining([
                'auth',
                'user',
                'health',
                'hubspot',
                'hubspotWebhook',
                'hubspot__hubspotWebhooks',
                'hubspotQueueWorker',
                'slack',
                'slackQueueWorker',
                'dlqProcessor',
                'dbMigrationWorker',
                'dbMigrationRouter',
                'adminScriptExecutor',
                'adminScriptRouter',
            ])
        );

        for (const [name, fn] of Object.entries(definition.functions)) {
            if (!fn.package) continue;
            expect({ name, include: fn.package.include }).toEqual({ name, include: undefined });
            expect({ name, exclude: fn.package.exclude }).toEqual({ name, exclude: undefined });
            expect(Array.isArray(fn.package.patterns)).toBe(true);

            // Excludes first, then includes: once a positive pattern appears,
            // no negated pattern may follow it.
            const firstInclude = fn.package.patterns.findIndex((p) => !p.startsWith('!'));
            if (firstInclude !== -1) {
                expect(
                    fn.package.patterns.slice(firstInclude).every((p) => !p.startsWith('!'))
                ).toBe(true);
            }
        }

        // The skipEsbuild core and admin functions re-add the DocumentDB CA file.
        for (const name of ['auth', 'user', 'health', 'adminScriptExecutor', 'adminScriptRouter']) {
            const { patterns } = definition.functions[name].package;
            expect(patterns[patterns.length - 1]).toBe('global-bundle.pem');
        }
    });

    it.each([['package'], ['deploy']])('never emits useDotenv for `osls %s`', async (command) => {
        process.argv = ['node', 'osls', command, '--stage', 'prod'];
        const definition = await composeServerlessDefinition(featuredApp());

        expect(definition).not.toHaveProperty('useDotenv');
    });

    it('emits useDotenv: true for `osls offline`', async () => {
        process.argv = ['node', 'osls', 'offline', '--stage', 'dev'];
        process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
        try {
            const definition = await composeServerlessDefinition(featuredApp());
            expect(definition.useDotenv).toBe(true);
        } finally {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        }
    });
});
