/**
 * End-to-end composer tests for per-function environment scoping
 * (lambda.scopedEnvironment, ADR-027).
 */

const { composeServerlessDefinition } = require('../infrastructure-composer');

jest.mock('../domains/shared/resource-discovery', () => {
    const originalModule = jest.requireActual(
        '../domains/shared/resource-discovery'
    );
    return {
        ...originalModule,
        gatherDiscoveredResources: jest.fn().mockResolvedValue({
            defaultVpcId: 'vpc-123456',
            defaultSecurityGroupId: 'sg-123456',
            privateSubnetId1: 'subnet-123456',
            privateSubnetId2: 'subnet-789012',
            defaultKmsKeyId:
                'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
            auroraClusterEndpoint:
                'test-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
            auroraPort: 5432,
        }),
    };
});

const buildApp = (overrides = {}) => ({
    name: 'scoped-test-app',
    provider: 'aws',
    usePrismaLambdaLayer: false,
    encryption: { fieldLevelEncryptionMethod: 'aes' },
    vpc: { enable: false },
    database: { postgres: { enable: true } },
    adminScripts: [{ Definition: { name: 'fixThings' } }],
    integrations: [
        { Definition: { name: 'hubspot', webhooks: true } },
        { Definition: { name: 'slack' } },
    ],
    ...overrides,
});

const SCOPED_VARS = [
    'HUBSPOT_QUEUE_URL',
    'SLACK_QUEUE_URL',
    'SCHEDULER_ROLE_ARN',
    'SCHEDULE_GROUP_NAME',
    'S3_BUCKET_NAME',
    'MIGRATION_STATUS_BUCKET',
    'DB_MIGRATION_QUEUE_URL',
    'ADMIN_SCRIPT_QUEUE_URL',
];

describe('lambda.scopedEnvironment composer e2e', () => {
    beforeEach(() => {
        process.argv = ['node', 'test'];
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    it('removes scoped vars from provider.environment and lands them on exact consumer sets', async () => {
        const definition = await composeServerlessDefinition(
            buildApp({ lambda: { scopedEnvironment: true } })
        );

        for (const key of SCOPED_VARS) {
            expect(definition.provider.environment[key]).toBeUndefined();
        }
        // DB_TYPE deliberately stays global
        expect(definition.provider.environment.DB_TYPE).toBe('postgresql');

        const env = (fnName) => definition.functions[fnName].environment || {};

        // auth + admin functions can reach every integration queue
        for (const fnName of [
            'auth',
            'adminScriptRouter',
            'adminScriptExecutor',
        ]) {
            expect(env(fnName).HUBSPOT_QUEUE_URL).toBeDefined();
            expect(env(fnName).SLACK_QUEUE_URL).toBeDefined();
        }

        // owning integration set, cross-integration isolation
        expect(env('hubspot').HUBSPOT_QUEUE_URL).toBeDefined();
        expect(env('hubspotWebhook').HUBSPOT_QUEUE_URL).toBeDefined();
        expect(env('hubspotQueueWorker').HUBSPOT_QUEUE_URL).toBeDefined();
        expect(env('hubspotQueueWorker').SLACK_QUEUE_URL).toBeUndefined();
        expect(env('slackQueueWorker').HUBSPOT_QUEUE_URL).toBeUndefined();

        // scheduler vars on integration functions and the executor, but the
        // router keeps its own admin-scheduler role reference untouched
        expect(env('hubspot').SCHEDULER_ROLE_ARN).toEqual({
            'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'],
        });
        expect(env('adminScriptExecutor').SCHEDULER_ROLE_ARN).toEqual({
            'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'],
        });

        // migration vars only on the migration functions
        expect(env('dbMigrationRouter').DB_MIGRATION_QUEUE_URL).toBeDefined();
        expect(env('dbMigrationWorker').S3_BUCKET_NAME).toBeDefined();

        // base functions that consume none of this carry none of it
        for (const fnName of ['user', 'health']) {
            for (const key of SCOPED_VARS) {
                expect(env(fnName)[key]).toBeUndefined();
            }
        }
    });

    it('keeps full broadcast when the flag is off, byte-identical to omitting the lambda key', async () => {
        const withoutKey = await composeServerlessDefinition(buildApp());
        const withFlagOff = await composeServerlessDefinition(
            buildApp({ lambda: { scopedEnvironment: false } })
        );

        expect(withFlagOff).toEqual(withoutKey);
        for (const key of SCOPED_VARS) {
            expect(withoutKey.provider.environment[key]).toBeDefined();
        }
    });
});
