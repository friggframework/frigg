/**
 * Unit tests for PostgreSQL (Aurora) configuration
 */

const { composeServerlessDefinition } = require('../serverless-template');
const { AWSDiscovery } = require('../aws-discovery');
const { mockClient } = require('aws-sdk-client-mock');
const { RDSClient, DescribeDBClustersCommand, DescribeDBSubnetGroupsCommand } = require('@aws-sdk/client-rds');
const { SecretsManagerClient, ListSecretsCommand, DescribeSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeRouteTablesCommand } = require('@aws-sdk/client-ec2');
const { KMSClient, ListAliasesCommand } = require('@aws-sdk/client-kms');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

// Create mocks for AWS SDK clients
const rdsMock = mockClient(RDSClient);
const secretsManagerMock = mockClient(SecretsManagerClient);
const ec2Mock = mockClient(EC2Client);
const kmsMock = mockClient(KMSClient);
const stsMock = mockClient(STSClient);

describe('PostgreSQL Aurora Configuration', () => {
    beforeEach(() => {
        // Reset all mocks
        rdsMock.reset();
        secretsManagerMock.reset();
        ec2Mock.reset();
        kmsMock.reset();
        stsMock.reset();

        // Setup default AWS mocks for discovery
        ec2Mock.on(DescribeVpcsCommand).resolves({
            Vpcs: [{ VpcId: 'vpc-12345', IsDefault: true }]
        });

        ec2Mock.on(DescribeSubnetsCommand).resolves({
            Subnets: [
                { SubnetId: 'subnet-1', AvailabilityZone: 'us-east-1a', MapPublicIpOnLaunch: false },
                { SubnetId: 'subnet-2', AvailabilityZone: 'us-east-1b', MapPublicIpOnLaunch: false }
            ]
        });

        ec2Mock.on(DescribeSecurityGroupsCommand).resolves({
            SecurityGroups: [{ GroupId: 'sg-12345', GroupName: 'default' }]
        });

        stsMock.on(GetCallerIdentityCommand).resolves({
            Account: '123456789012'
        });

        ec2Mock.on(DescribeRouteTablesCommand).resolves({
            RouteTables: [{ RouteTableId: 'rtb-12345', VpcId: 'vpc-12345' }]
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('configurePostgres()', () => {
        test('should skip configuration when postgres not enabled', async () => {
            // Skip discovery since postgres not enabled
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
            };

            const definition = await composeServerlessDefinition(appDefinition);

            expect(definition.resources.Resources.FriggAuroraCluster).toBeUndefined();
            expect(definition.provider.environment.DATABASE_URL).toBeUndefined();
            expect(definition.provider.environment.DB_TYPE).toBeUndefined();
        });

        test('should create Aurora infrastructure in create-new mode', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        databaseName: 'test_db',
                        masterUsername: 'test_admin',
                        scaling: {
                            minCapacity: 0.5,
                            maxCapacity: 1.0,
                        },
                    },
                },
            };

            const discoveredResources = {
                defaultVpcId: 'vpc-12345',
                defaultSecurityGroupId: 'sg-12345',
                privateSubnetId1: 'subnet-1',
                privateSubnetId2: 'subnet-2',
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should create Aurora cluster resources
            expect(definition.resources.Resources.FriggAuroraCluster).toBeDefined();
            expect(definition.resources.Resources.FriggAuroraCluster.Type).toBe('AWS::RDS::DBCluster');
            expect(definition.resources.Resources.FriggAuroraCluster.Properties.Engine).toBe('aurora-postgresql');
            expect(definition.resources.Resources.FriggAuroraCluster.Properties.DatabaseName).toBe('test_db');

            // Should create Aurora instance
            expect(definition.resources.Resources.FriggAuroraInstance).toBeDefined();
            expect(definition.resources.Resources.FriggAuroraInstance.Properties.DBInstanceClass).toBe('db.serverless');

            // Should create DB subnet group
            expect(definition.resources.Resources.FriggDBSubnetGroup).toBeDefined();

            // Should create security group
            expect(definition.resources.Resources.FriggAuroraSecurityGroup).toBeDefined();
            expect(definition.resources.Resources.FriggAuroraSecurityGroup.Properties.SecurityGroupIngress[0].FromPort).toBe(5432);

            // Should create Secrets Manager secret
            expect(definition.resources.Resources.FriggDatabaseSecret).toBeDefined();

            // Should create secret attachment
            expect(definition.resources.Resources.FriggSecretAttachment).toBeDefined();

            // Should set environment variables
            expect(definition.provider.environment.DATABASE_URL).toBeDefined();
            expect(definition.provider.environment.DB_TYPE).toBe('postgresql');

            // Should add IAM permissions for Secrets Manager
            const secretsManagerPolicy = definition.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('secretsmanager:GetSecretValue')
            );
            expect(secretsManagerPolicy).toBeDefined();
        });

        test('should configure Aurora with custom settings', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        engineVersion: '14.6',
                        scaling: {
                            minCapacity: 1.0,
                            maxCapacity: 4.0,
                        },
                        backupRetentionDays: 14,
                        deletionProtection: false,
                        enablePerformanceInsights: true,
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const cluster = definition.resources.Resources.FriggAuroraCluster;
            expect(cluster.Properties.EngineVersion).toBe('14.6');
            expect(cluster.Properties.ServerlessV2ScalingConfiguration.MinCapacity).toBe(1.0);
            expect(cluster.Properties.ServerlessV2ScalingConfiguration.MaxCapacity).toBe(4.0);
            expect(cluster.Properties.BackupRetentionPeriod).toBe(14);
            expect(cluster.Properties.DeletionProtection).toBe(false);

            const instance = definition.resources.Resources.FriggAuroraInstance;
            expect(instance.Properties.EnablePerformanceInsights).toBe(true);
        });

        test('should set deletion protection by default', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const cluster = definition.resources.Resources.FriggAuroraCluster;
            expect(cluster.Properties.DeletionProtection).toBe(true);
            expect(cluster.DeletionPolicy).toBe('Snapshot');
            expect(cluster.UpdateReplacePolicy).toBe('Snapshot');
        });

        test('should enable CloudWatch Logs exports', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const cluster = definition.resources.Resources.FriggAuroraCluster;
            expect(cluster.Properties.EnableCloudwatchLogsExports).toContain('postgresql');
        });

        test('should throw error when use-existing without cluster identifier', async () => {
            // Skip discovery and mock RDS to return empty clusters
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                        // Missing clusterIdentifier
                    },
                },
            };

            // Should throw error during configuration
            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow();
        });
    });

    describe('buildEnvironment() with Aurora mappings', () => {
        test('should add Aurora environment variables', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should have standard env vars
            expect(definition.provider.environment.STAGE).toBe('${opt:stage, "dev"}');
            expect(definition.provider.environment.AWS_NODEJS_CONNECTION_REUSE_ENABLED).toBe(1);

            // Should have DATABASE_URL and DB_TYPE
            expect(definition.provider.environment.DATABASE_URL).toBeDefined();
            expect(definition.provider.environment.DB_TYPE).toBe('postgresql');
        });

        test('should not add Aurora env vars when postgres disabled', async () => {
            // Skip discovery since postgres not enabled
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
            };

            const definition = await composeServerlessDefinition(appDefinition);

            expect(definition.provider.environment.DATABASE_URL).toBeUndefined();
            expect(definition.provider.environment.DB_TYPE).toBeUndefined();
        });
    });

    describe('Database URL construction', () => {
        test('should construct DATABASE_URL with Fn::Sub for create-new mode', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        databaseName: 'my_db',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const databaseUrl = definition.provider.environment.DATABASE_URL;
            expect(databaseUrl['Fn::Sub']).toBeDefined();
            expect(databaseUrl['Fn::Sub'][0]).toContain('postgresql://');
            expect(databaseUrl['Fn::Sub'][0]).toContain('${Username}');
            expect(databaseUrl['Fn::Sub'][0]).toContain('${Password}');
            expect(databaseUrl['Fn::Sub'][0]).toContain('${Endpoint}');
            expect(databaseUrl['Fn::Sub'][0]).toContain('${Port}');
            expect(databaseUrl['Fn::Sub'][0]).toContain('${DatabaseName}');

            const substitutions = databaseUrl['Fn::Sub'][1];
            expect(substitutions.Username).toBeDefined();
            expect(substitutions.Password).toBeDefined();
            expect(substitutions.Endpoint).toBeDefined();
            expect(substitutions.Port).toBeDefined();
            expect(substitutions.DatabaseName).toBe('my_db');
        });
    });

    describe('Secrets Manager integration', () => {
        test('should create secret with correct template', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        masterUsername: 'custom_admin',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const secret = definition.resources.Resources.FriggDatabaseSecret;
            expect(secret.Properties.GenerateSecretString.SecretStringTemplate).toBe(
                JSON.stringify({ username: 'custom_admin' })
            );
            expect(secret.Properties.GenerateSecretString.GenerateStringKey).toBe('password');
            expect(secret.Properties.GenerateSecretString.PasswordLength).toBe(32);
        });

        test('should exclude special characters from password', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const secret = definition.resources.Resources.FriggDatabaseSecret;
            expect(secret.Properties.GenerateSecretString.ExcludeCharacters).toBe('"@/\\');
        });

        test('should add Frigg tags to secret', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const secret = definition.resources.Resources.FriggDatabaseSecret;
            const tags = secret.Properties.Tags;

            expect(tags.find(t => t.Key === 'ManagedBy' && t.Value === 'Frigg')).toBeDefined();
            expect(tags.find(t => t.Key === 'Service' && t.Value === '${self:service}')).toBeDefined();
            expect(tags.find(t => t.Key === 'Stage' && t.Value === '${self:provider.stage}')).toBeDefined();
        });
    });

    describe('Security Group configuration', () => {
        test('should allow Lambda SG to access Aurora on port 5432', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const sg = definition.resources.Resources.FriggAuroraSecurityGroup;
            const ingressRule = sg.Properties.SecurityGroupIngress[0];

            expect(ingressRule.IpProtocol).toBe('tcp');
            expect(ingressRule.FromPort).toBe(5432);
            expect(ingressRule.ToPort).toBe(5432);
            expect(ingressRule.Description).toContain('PostgreSQL');
        });

        test('should add Frigg tags to security group', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const sg = definition.resources.Resources.FriggAuroraSecurityGroup;
            const tags = sg.Properties.Tags;

            expect(tags.find(t => t.Key === 'ManagedBy' && t.Value === 'Frigg')).toBeDefined();
        });
    });

    describe('IAM Permissions', () => {
        test('should add Secrets Manager permissions', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const secretsManagerPolicy = definition.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('secretsmanager:GetSecretValue')
            );

            expect(secretsManagerPolicy).toBeDefined();
            expect(secretsManagerPolicy.Effect).toBe('Allow');
            expect(secretsManagerPolicy.Action).toContain('secretsmanager:GetSecretValue');
            expect(secretsManagerPolicy.Action).toContain('secretsmanager:DescribeSecret');
        });
    });

    describe('Default values', () => {
        test('should use sensible defaults for optional parameters', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                        // All optional parameters omitted
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const cluster = definition.resources.Resources.FriggAuroraCluster;
            expect(cluster.Properties.EngineVersion).toBe('15.3');
            expect(cluster.Properties.DatabaseName).toBe('frigg_db');
            expect(cluster.Properties.ServerlessV2ScalingConfiguration.MinCapacity).toBe(0.5);
            expect(cluster.Properties.ServerlessV2ScalingConfiguration.MaxCapacity).toBe(1.0);
            expect(cluster.Properties.BackupRetentionPeriod).toBe(7);
            expect(cluster.Properties.PreferredBackupWindow).toBe('03:00-04:00');
            expect(cluster.Properties.DeletionProtection).toBe(true);

            const secret = definition.resources.Resources.FriggDatabaseSecret;
            const secretTemplate = JSON.parse(secret.Properties.GenerateSecretString.SecretStringTemplate);
            expect(secretTemplate.username).toBe('frigg_admin');

            const instance = definition.resources.Resources.FriggAuroraInstance;
            expect(instance.Properties.EnablePerformanceInsights).toBe(false);
        });
    });

    describe('Validation Tests', () => {
        test('should throw error when postgres enabled but VPC disabled', async () => {
            // Skip discovery
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                // VPC not enabled
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                /Aurora PostgreSQL requires VPC deployment/
            );
        });

        test('should throw error when less than 2 private subnets found', async () => {
            // Mock discovery to return only 1 subnet
            ec2Mock.on(DescribeSubnetsCommand).resolves({
                Subnets: [
                    { SubnetId: 'subnet-1', AvailabilityZone: 'us-east-1a', MapPublicIpOnLaunch: false }
                ]
            });

            rdsMock.on(DescribeDBClustersCommand).resolves({ DBClusters: [] });
            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({ DBSubnetGroups: [] });
            secretsManagerMock.on(ListSecretsCommand).resolves({ SecretList: [] });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true }, // Use default 'discover' mode to trigger subnet validation
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                /Aurora PostgreSQL requires at least 2 private subnets/
            );
        });

        test('should throw error when use-existing without clusterIdentifier', async () => {
            // Skip discovery
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'use-existing',
                        // Missing clusterIdentifier
                    },
                },
            };

            await expect(composeServerlessDefinition(appDefinition)).rejects.toThrow(
                /clusterIdentifier/
            );
        });
    });

    describe('Discover Mode Tests', () => {
        test('should use discovered cluster when found', async () => {
            // Mock discovered cluster
            rdsMock.on(DescribeDBClustersCommand).resolves({
                DBClusters: [{
                    DBClusterIdentifier: 'discovered-cluster',
                    Engine: 'aurora-postgresql',
                    Status: 'available',
                    Endpoint: 'discovered.cluster.us-east-1.rds.amazonaws.com',
                    Port: 5432,
                    DatabaseName: 'discovered_db',
                    DBSubnetGroup: 'discovered-subnet-group',
                    VpcSecurityGroups: [{ VpcSecurityGroupId: 'sg-discovered' }],
                    TagList: [
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Service', Value: 'test-app' },
                        { Key: 'Stage', Value: 'dev' }
                    ]
                }]
            });

            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({
                DBSubnetGroups: [{
                    DBSubnetGroupName: 'discovered-subnet-group',
                    VpcId: 'vpc-12345',
                    Subnets: [
                        { SubnetIdentifier: 'subnet-1' },
                        { SubnetIdentifier: 'subnet-2' }
                    ]
                }]
            });

            secretsManagerMock.on(ListSecretsCommand).resolves({
                SecretList: [{
                    ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:frigg-db-secret',
                    Name: 'frigg-db-secret',
                    Tags: [
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Service', Value: 'test-app' },
                        { Key: 'Stage', Value: 'dev' }
                    ]
                }]
            });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should use discovered cluster, not create new one
            expect(definition.resources.Resources.FriggAuroraCluster).toBeUndefined();
            expect(definition.provider.environment.DATABASE_URL).toBeDefined();
            expect(definition.provider.environment.DATABASE_URL['Fn::Sub']).toBeDefined();
        });

        test('should create new cluster when none found', async () => {
            // Mock no clusters found
            rdsMock.on(DescribeDBClustersCommand).resolves({ DBClusters: [] });
            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({ DBSubnetGroups: [] });
            secretsManagerMock.on(ListSecretsCommand).resolves({ SecretList: [] });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should create new cluster
            expect(definition.resources.Resources.FriggAuroraCluster).toBeDefined();
            expect(definition.resources.Resources.FriggAuroraCluster.Type).toBe('AWS::RDS::DBCluster');
        });

        test('should use discovered secret ARN when available', async () => {
            // Mock discovered resources
            rdsMock.on(DescribeDBClustersCommand).resolves({
                DBClusters: [{
                    DBClusterIdentifier: 'discovered-cluster',
                    Engine: 'aurora-postgresql',
                    Status: 'available',
                    Endpoint: 'discovered.cluster.us-east-1.rds.amazonaws.com',
                    Port: 5432,
                    DatabaseName: 'discovered_db',
                    DBSubnetGroup: 'discovered-subnet-group',
                    VpcSecurityGroups: [{ VpcSecurityGroupId: 'sg-discovered' }],
                    TagList: [
                        { Key: 'ManagedBy', Value: 'Frigg' }
                    ]
                }]
            });

            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({
                DBSubnetGroups: [{
                    DBSubnetGroupName: 'discovered-subnet-group',
                    VpcId: 'vpc-12345',
                    Subnets: [
                        { SubnetIdentifier: 'subnet-1' },
                        { SubnetIdentifier: 'subnet-2' }
                    ]
                }]
            });

            secretsManagerMock.on(ListSecretsCommand).resolves({
                SecretList: [{
                    ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:discovered-secret',
                    Name: 'discovered-secret',
                    Tags: [
                        { Key: 'ManagedBy', Value: 'Frigg' }
                    ]
                }]
            });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should reference discovered secret in IAM policy
            const secretsManagerPolicy = definition.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('secretsmanager:GetSecretValue')
            );
            expect(secretsManagerPolicy).toBeDefined();
            expect(secretsManagerPolicy.Resource).toContain('discovered-secret');
        });
    });

    describe('Integration Tests', () => {
        test('should use discovered cluster endpoint in DATABASE_URL', async () => {
            // Mock discovered cluster
            rdsMock.on(DescribeDBClustersCommand).resolves({
                DBClusters: [{
                    DBClusterIdentifier: 'integration-cluster',
                    Engine: 'aurora-postgresql',
                    Status: 'available',
                    Endpoint: 'integration.cluster.us-east-1.rds.amazonaws.com',
                    Port: 5432,
                    DatabaseName: 'integration_db',
                    DBSubnetGroup: 'integration-subnet-group',
                    VpcSecurityGroups: [{ VpcSecurityGroupId: 'sg-integration' }],
                    TagList: [{ Key: 'ManagedBy', Value: 'Frigg' }]
                }]
            });

            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({
                DBSubnetGroups: [{
                    DBSubnetGroupName: 'integration-subnet-group',
                    VpcId: 'vpc-12345',
                    Subnets: [
                        { SubnetIdentifier: 'subnet-1' },
                        { SubnetIdentifier: 'subnet-2' }
                    ]
                }]
            });

            secretsManagerMock.on(ListSecretsCommand).resolves({
                SecretList: [{
                    ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:integration-secret',
                    Name: 'integration-secret',
                    Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }]
                }]
            });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // DATABASE_URL should reference discovered endpoint
            const databaseUrl = definition.provider.environment.DATABASE_URL;
            expect(databaseUrl['Fn::Sub']).toBeDefined();
            expect(databaseUrl['Fn::Sub'][0]).toContain('integration.cluster.us-east-1.rds.amazonaws.com');
        });

        test('should create Secrets Manager VPC endpoint when Aurora enabled', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // Should create Secrets Manager VPC endpoint
            // Note: For 'create-new' VPC mode, the resource is named FriggSecretsManagerVPCEndpoint
            expect(definition.resources.Resources.FriggSecretsManagerVPCEndpoint).toBeDefined();
            expect(definition.resources.Resources.FriggSecretsManagerVPCEndpoint.Type).toBe('AWS::EC2::VPCEndpoint');
            expect(definition.resources.Resources.FriggSecretsManagerVPCEndpoint.Properties.ServiceName).toContain('secretsmanager');
        });

        test('should use correct security group source in create-new VPC mode', async () => {
            // Skip discovery for create-new mode test
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true, management: 'create-new' },
                database: {
                    postgres: {
                        enable: true,
                        management: 'create-new',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            const sg = definition.resources.Resources.FriggAuroraSecurityGroup;
            const ingressRule = sg.Properties.SecurityGroupIngress[0];

            // Should reference FriggLambdaSecurityGroup (created by VPC)
            expect(ingressRule.SourceSecurityGroupId).toEqual({ Ref: 'FriggLambdaSecurityGroup' });
        });

        test('should use discovered secret ARN in IAM permissions', async () => {
            // Mock discovered resources
            rdsMock.on(DescribeDBClustersCommand).resolves({
                DBClusters: [{
                    DBClusterIdentifier: 'iam-test-cluster',
                    Engine: 'aurora-postgresql',
                    Status: 'available',
                    Endpoint: 'iam.cluster.us-east-1.rds.amazonaws.com',
                    Port: 5432,
                    DatabaseName: 'iam_db',
                    DBSubnetGroup: 'iam-subnet-group',
                    VpcSecurityGroups: [{ VpcSecurityGroupId: 'sg-iam' }],
                    TagList: [{ Key: 'ManagedBy', Value: 'Frigg' }]
                }]
            });

            rdsMock.on(DescribeDBSubnetGroupsCommand).resolves({
                DBSubnetGroups: [{
                    DBSubnetGroupName: 'iam-subnet-group',
                    VpcId: 'vpc-12345',
                    Subnets: [
                        { SubnetIdentifier: 'subnet-1' },
                        { SubnetIdentifier: 'subnet-2' }
                    ]
                }]
            });

            secretsManagerMock.on(ListSecretsCommand).resolves({
                SecretList: [{
                    ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:specific-iam-secret-abc123',
                    Name: 'specific-iam-secret',
                    Tags: [{ Key: 'ManagedBy', Value: 'Frigg' }]
                }]
            });

            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                database: {
                    postgres: {
                        enable: true,
                        management: 'discover',
                    },
                },
            };

            const definition = await composeServerlessDefinition(appDefinition);

            // IAM policy should reference the specific discovered secret ARN
            const secretsManagerPolicy = definition.provider.iamRoleStatements.find(
                stmt => stmt.Action.includes('secretsmanager:GetSecretValue')
            );
            expect(secretsManagerPolicy).toBeDefined();
            expect(secretsManagerPolicy.Resource).toContain('specific-iam-secret-abc123');
        });
    });
});
