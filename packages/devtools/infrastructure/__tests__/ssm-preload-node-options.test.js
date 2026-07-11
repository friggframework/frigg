/**
 * The SSM INIT preload (NODE_OPTIONS=--import) must be scoped to skipEsbuild
 * functions only. esbuild-bundled functions (e.g. defaultWebsocket) do not
 * package the preload .mjs, and a missing --import target fatally aborts Node
 * startup — so a global NODE_OPTIONS would brick them (ADR-027 review finding).
 */

const { composeServerlessDefinition } = require('../infrastructure-composer');

jest.mock('../domains/shared/resource-discovery', () => {
    const original = jest.requireActual('../domains/shared/resource-discovery');
    return {
        ...original,
        gatherDiscoveredResources: jest.fn().mockResolvedValue({
            defaultVpcId: 'vpc-123456',
            defaultSecurityGroupId: 'sg-123456',
            privateSubnetId1: 'subnet-1',
            privateSubnetId2: 'subnet-2',
            defaultKmsKeyId:
                'arn:aws:kms:us-east-1:123456789012:key/abc-123',
            auroraClusterEndpoint: 'c.cluster-x.us-east-1.rds.amazonaws.com',
            auroraPort: 5432,
        }),
    };
});

const buildApp = (overrides = {}) => ({
    name: 'preload-test',
    provider: 'aws',
    usePrismaLambdaLayer: false,
    encryption: { fieldLevelEncryptionMethod: 'aes' },
    vpc: { enable: false },
    database: { postgres: { enable: true } },
    websockets: { enable: true },
    integrations: [{ Definition: { name: 'hubspot' } }],
    ...overrides,
});

const IMPORT_FRAGMENT = '--import file:///var/task/node_modules/@friggframework/core/core/ssm-preload.mjs';

describe('SSM preload NODE_OPTIONS scoping', () => {
    beforeEach(() => {
        process.argv = ['node', 'test'];
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    it('sets NODE_OPTIONS --import on skipEsbuild functions and NOT on esbuild-bundled ones when offload is active', async () => {
        const definition = await composeServerlessDefinition(
            buildApp({
                ssm: { enable: true },
                environment: { HUBSPOT_SECRET: 'ssm' },
            })
        );
        const fns = definition.functions;

        // skipEsbuild handlers (auth/user/health + integration) package the
        // preload → they get the flag.
        expect(fns.auth.skipEsbuild).toBe(true);
        expect(fns.auth.environment.NODE_OPTIONS).toBe(IMPORT_FRAGMENT);
        expect(fns.hubspot.environment.NODE_OPTIONS).toBe(IMPORT_FRAGMENT);

        // defaultWebsocket is esbuild-bundled (no skipEsbuild) → MUST NOT get it.
        expect(fns.defaultWebsocket.skipEsbuild).toBeFalsy();
        expect(fns.defaultWebsocket.environment?.NODE_OPTIONS).toBeUndefined();

        // Never global.
        expect(definition.provider.environment.NODE_OPTIONS).toBeUndefined();
    });

    it('sets no NODE_OPTIONS anywhere when offload is inactive', async () => {
        const definition = await composeServerlessDefinition(
            buildApp({ ssm: { enable: true } }) // enabled, but no 'ssm' keys
        );
        for (const fn of Object.values(definition.functions)) {
            expect(fn.environment?.NODE_OPTIONS).toBeUndefined();
        }
        expect(definition.provider.environment.NODE_OPTIONS).toBeUndefined();
    });
});
