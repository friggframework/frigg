/**
 * PostgreSQL (Aurora) configuration through the full composer.
 *
 * AuroraBuilder has its own unit tests (domains/database/aurora-builder.test.js);
 * these check that `database.postgres` in an app definition comes out of
 * composeServerlessDefinition — the path `frigg deploy` takes — as the right
 * CloudFormation resources, provider environment and IAM statements.
 *
 * AWS discovery is stubbed (no credentials or network needed) and the Prisma
 * layer build is stubbed so the test never runs `npm install` into
 * packages/devtools/layers/prisma.
 */

jest.mock('../domains/shared/resource-discovery', () => ({
    ...jest.requireActual('../domains/shared/resource-discovery'),
    gatherDiscoveredResources: jest.fn(),
}));
jest.mock('../domains/shared/utilities/prisma-layer-manager', () => ({
    ensurePrismaLayerExists: jest.fn().mockResolvedValue(undefined),
}));

const {
    gatherDiscoveredResources,
} = require('../domains/shared/resource-discovery');
const { composeServerlessDefinition } = require('../infrastructure-composer');

// An account with a default VPC and two private + two public subnets.
const accountWithDefaultVpc = (overrides = {}) => ({
    defaultVpcId: 'vpc-12345',
    vpcCidr: '172.31.0.0/16',
    defaultSecurityGroupId: 'sg-12345',
    privateSubnetId1: 'subnet-private-1',
    privateSubnetId2: 'subnet-private-2',
    publicSubnetId1: 'subnet-public-1',
    publicSubnetId2: 'subnet-public-2',
    defaultRouteTableId: 'rtb-12345',
    ...overrides,
});

const postgresApp = (postgres, extra = {}) => ({
    name: 'test-app',
    integrations: [],
    vpc: { enable: true },
    database: { postgres: { enable: true, ...postgres } },
    ...extra,
});

// The orchestrator logs each validation error, then throws a summary error.
async function expectValidationError(appDefinition, messagePattern) {
    const logSpy = jest.spyOn(console, 'log');
    try {
        await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
            'Infrastructure validation failed'
        );
        const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
        expect(logged).toMatch(messagePattern);
    } finally {
        logSpy.mockRestore();
    }
}

describe('PostgreSQL Aurora configuration (composer)', () => {
    const originalSkip = process.env.FRIGG_SKIP_AWS_DISCOVERY;

    beforeEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        gatherDiscoveredResources.mockResolvedValue(accountWithDefaultVpc());
    });

    afterEach(() => {
        jest.clearAllMocks();
        if (originalSkip === undefined) {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        } else {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkip;
        }
    });

    describe('when postgres is not configured', () => {
        it('adds no Aurora resources or database env vars', async () => {
            const definition = await composeServerlessDefinition({
                name: 'test-app',
                integrations: [],
            });

            const resources = definition.resources.Resources;
            expect(resources.FriggAuroraCluster).toBeUndefined();
            expect(resources.FriggDBSecret).toBeUndefined();
            expect(definition.provider.environment.DATABASE_URL).toBeUndefined();
        });
    });

    describe("management: 'external' (bring your own DATABASE_URL)", () => {
        it('creates no Aurora resources and needs no VPC', async () => {
            const definition = await composeServerlessDefinition({
                name: 'test-app',
                integrations: [],
                database: { postgres: { enable: true, management: 'external' } },
            });

            const resourceTypes = Object.values(definition.resources.Resources).map(
                (r) => r.Type
            );
            expect(resourceTypes).not.toContain('AWS::RDS::DBCluster');
            expect(resourceTypes).not.toContain('AWS::RDS::DBInstance');
            expect(resourceTypes).not.toContain('AWS::EC2::VPC');
            expect(definition.provider.vpc).toBeUndefined();
        });
    });

    describe("management: 'managed' (create Aurora in the stack)", () => {
        let definition;
        let resources;

        beforeEach(async () => {
            definition = await composeServerlessDefinition(
                postgresApp({ management: 'managed' })
            );
            resources = definition.resources.Resources;
        });

        it('creates an Aurora Serverless v2 PostgreSQL cluster and instance', () => {
            const cluster = resources.FriggAuroraCluster;
            expect(cluster.Type).toBe('AWS::RDS::DBCluster');
            expect(cluster.Properties.Engine).toBe('aurora-postgresql');
            expect(cluster.Properties.Port).toBe(5432);
            expect(cluster.Properties.ServerlessV2ScalingConfiguration).toEqual({
                MinCapacity: 0.5,
                MaxCapacity: 4,
            });

            const instance = resources.FriggAuroraInstance;
            expect(instance.Type).toBe('AWS::RDS::DBInstance');
            expect(instance.Properties.DBInstanceClass).toBe('db.serverless');
            expect(instance.Properties.DBClusterIdentifier).toEqual({
                Ref: 'FriggAuroraCluster',
            });
            expect(instance.Properties.PubliclyAccessible).toBe(false);
        });

        it('snapshots the cluster on stack deletion', () => {
            expect(resources.FriggAuroraCluster.DeletionPolicy).toBe('Snapshot');
        });

        it('uses sensible defaults for optional settings', () => {
            const props = resources.FriggAuroraCluster.Properties;
            expect(props.DatabaseName).toBe('frigg');
            expect(props.EngineVersion).toBe('15.13');
            expect(props.BackupRetentionPeriod).toBe(7);
            expect(props.PreferredBackupWindow).toBe('03:00-04:00');

            const template = JSON.parse(
                resources.FriggDBSecret.Properties.GenerateSecretString
                    .SecretStringTemplate
            );
            expect(template.username).toBe('postgres');
        });

        it('places the DB subnet group in the private subnets', () => {
            expect(resources.FriggDBSubnetGroup.Type).toBe('AWS::RDS::DBSubnetGroup');
            expect(resources.FriggDBSubnetGroup.Properties.SubnetIds).toEqual([
                'subnet-private-1',
                'subnet-private-2',
            ]);
        });

        it('generates credentials in Secrets Manager with a URL-safe password', () => {
            const secret = resources.FriggDBSecret;
            expect(secret.Type).toBe('AWS::SecretsManager::Secret');

            const generate = secret.Properties.GenerateSecretString;
            expect(generate.GenerateStringKey).toBe('password');
            expect(generate.PasswordLength).toBe(32);
            // Characters with special meaning in a connection URL are excluded.
            for (const ch of ['"', '@', ':', '/', '?', '#', '%']) {
                expect(generate.ExcludeCharacters).toContain(ch);
            }

            expect(secret.Properties.Tags).toEqual(
                expect.arrayContaining([{ Key: 'ManagedBy', Value: 'Frigg' }])
            );
        });

        it('sets DATABASE_URL from the cluster endpoint and the secret', () => {
            const databaseUrl = definition.provider.environment.DATABASE_URL;
            expect(databaseUrl).toBeDefined();

            const serialized = JSON.stringify(databaseUrl);
            expect(serialized).toContain('postgresql://');
            expect(serialized).toContain('FriggAuroraCluster');
            expect(serialized).toContain('FriggDBSecret');
        });

        it('grants Lambda read access to the database secret', () => {
            const statement = definition.provider.iamRoleStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('secretsmanager:GetSecretValue') &&
                    JSON.stringify(s.Resource).includes('FriggDBSecret')
            );
            expect(statement).toBeDefined();
            expect(statement.Effect).toBe('Allow');
        });

        it('lets the Lambda security group reach PostgreSQL on 5432', () => {
            const rule = resources.FriggAuroraIngressRule;
            expect(rule.Type).toBe('AWS::EC2::SecurityGroupIngress');
            expect(rule.Properties).toEqual(
                expect.objectContaining({
                    IpProtocol: 'tcp',
                    FromPort: 5432,
                    ToPort: 5432,
                    GroupId: { Ref: 'FriggLambdaSecurityGroup' },
                    SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                })
            );
        });
    });

    it('applies custom Aurora settings', async () => {
        const definition = await composeServerlessDefinition(
            postgresApp({
                management: 'managed',
                engineVersion: '16.4',
                database: 'my_db',
                username: 'custom_admin',
                minCapacity: 1,
                maxCapacity: 8,
            })
        );

        const resources = definition.resources.Resources;
        const props = resources.FriggAuroraCluster.Properties;
        expect(props.EngineVersion).toBe('16.4');
        expect(props.DatabaseName).toBe('my_db');
        expect(props.ServerlessV2ScalingConfiguration).toEqual({
            MinCapacity: 1,
            MaxCapacity: 8,
        });
        expect(
            JSON.parse(
                resources.FriggDBSecret.Properties.GenerateSecretString
                    .SecretStringTemplate
            )
        ).toEqual({ username: 'custom_admin' });
    });

    describe("management: 'use-existing'", () => {
        it('points the app at the provided endpoint without creating a cluster', async () => {
            const definition = await composeServerlessDefinition(
                postgresApp({
                    management: 'use-existing',
                    endpoint: 'existing.cluster.us-east-1.rds.amazonaws.com',
                })
            );

            expect(definition.resources.Resources.FriggAuroraCluster).toBeUndefined();
            expect(definition.provider.environment.DATABASE_HOST).toBe(
                'existing.cluster.us-east-1.rds.amazonaws.com'
            );
            expect(definition.provider.environment.DATABASE_PORT).toBe('5432');
        });

        it('rejects a definition without an endpoint', async () => {
            await expectValidationError(
                postgresApp({ management: 'use-existing' }),
                /database\.postgres\.endpoint is required/
            );
        });
    });

    describe("management: 'discover' (the default)", () => {
        it('uses a discovered Aurora cluster instead of creating one', async () => {
            gatherDiscoveredResources.mockResolvedValue(
                accountWithDefaultVpc({
                    auroraClusterEndpoint:
                        'discovered.cluster-abc.us-east-1.rds.amazonaws.com',
                    auroraPort: 5432,
                })
            );

            const definition = await composeServerlessDefinition(
                postgresApp({ management: 'discover' })
            );

            expect(definition.resources.Resources.FriggAuroraCluster).toBeUndefined();
            expect(definition.provider.environment.DATABASE_HOST).toBe(
                'discovered.cluster-abc.us-east-1.rds.amazonaws.com'
            );
        });

        it('creates a cluster in the stack when none is discovered', async () => {
            const definition = await composeServerlessDefinition(
                postgresApp({ management: 'discover' })
            );

            expect(definition.resources.Resources.FriggAuroraCluster.Type).toBe(
                'AWS::RDS::DBCluster'
            );
        });
    });

    it('rejects an unknown management mode', async () => {
        // 'create-new' was the pre-2.0 spelling of 'managed'.
        await expectValidationError(
            postgresApp({ management: 'create-new' }),
            /Invalid database\.postgres\.management: "create-new"/
        );
    });

    it('skips Aurora entirely under `frigg start` (FRIGG_SKIP_AWS_DISCOVERY)', async () => {
        process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

        const definition = await composeServerlessDefinition(
            postgresApp({ management: 'managed' })
        );

        expect(definition.resources.Resources.FriggAuroraCluster).toBeUndefined();
    });
});
