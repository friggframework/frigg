/**
 * Aurora PostgreSQL Builder
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Aurora Serverless v2 cluster creation or discovery
 * - Database subnet groups
 * - Database security groups
 * - Secrets Manager integration for credentials
 * - Database connection environment variables
 *
 * Uses ownership-based architecture:
 * - STACK: Resources in our CloudFormation template (definitions + Refs)
 * - EXTERNAL: Resources outside our stack (reference by physical ID)
 * - AUTO: System decides based on discovery
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');
const AuroraResourceResolver = require('./aurora-resolver');
const { createEmptyDiscoveryResult } = require('../shared/types/discovery-result');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

class AuroraBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'AuroraBuilder';
    }

    shouldExecute(appDefinition) {
        // Skip Aurora in local mode (when FRIGG_SKIP_AWS_DISCOVERY is set)
        // Aurora is an AWS-specific service that should only be created in production
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        return appDefinition.database?.postgres?.enable === true;
    }

    getDependencies() {
        return ['VpcBuilder']; // Aurora requires VPC to be configured first
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.database?.postgres) {
            result.addError('PostgreSQL database configuration is missing');
            return result;
        }

        const dbConfig = appDefinition.database.postgres;

        // Validate management mode
        const validModes = ['discover', 'managed', 'use-existing'];
        const management = dbConfig.management || 'discover';
        if (!validModes.includes(management)) {
            result.addError(`Invalid database.postgres.management: "${management}"`);
        }

        // Validate use-existing requirements
        if (management === 'use-existing' && !dbConfig.endpoint) {
            result.addError('database.postgres.endpoint is required when management="use-existing"');
        }

        // Validate capacity settings
        if (dbConfig.minCapacity !== undefined && (dbConfig.minCapacity < 0.5 || dbConfig.minCapacity > 128)) {
            result.addError('database.postgres.minCapacity must be between 0.5 and 128');
        }
        if (dbConfig.maxCapacity !== undefined && (dbConfig.maxCapacity < 0.5 || dbConfig.maxCapacity > 128)) {
            result.addError('database.postgres.maxCapacity must be between 0.5 and 128');
        }

        // Warn about public accessibility in production
        if (dbConfig.publiclyAccessible === true) {
            result.addWarning('database.postgres.publiclyAccessible=true is not recommended for production');
        }

        return result;
    }

    /**
     * Build Aurora infrastructure using ownership-based architecture
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring Aurora PostgreSQL...`);

        // Backwards compatibility: Translate old schema to new ownership schema
        appDefinition = this.translateLegacyConfig(appDefinition, discoveredResources);

        // Initialize result
        const result = {
            resources: {},
            iamStatements: [],
            environment: {},
        };

        // Special case: use-existing with endpoint (bypass resolver)
        if (appDefinition.database?.postgres?._useExistingEndpoint) {
            console.log('  Using provided database endpoint (use-existing mode)');
            await this.useExistingAurora(appDefinition, discoveredResources, result);
            console.log(`\n[${this.name}] ✅ Aurora PostgreSQL configuration completed`);
            return result;
        }

        // Get structured discovery result
        const discovery = discoveredResources._structured || this.convertFlatDiscoveryToStructured(discoveredResources, appDefinition);

        // Use AuroraResourceResolver to make ownership decisions
        const resolver = new AuroraResourceResolver();
        const decisions = resolver.resolveAll(appDefinition, discovery);

        console.log('\n  📋 Resource Ownership Decisions:');
        console.log(`     Cluster: ${decisions.cluster.ownership} - ${decisions.cluster.reason}`);
        console.log(`     Instance: ${decisions.instance.ownership} - ${decisions.instance.reason}`);
        console.log(`     Subnet Group: ${decisions.subnetGroup.ownership} - ${decisions.subnetGroup.reason}`);
        console.log(`     Secret: ${decisions.secret.ownership} - ${decisions.secret.reason}`);

        // Build resources based on ownership decisions
        await this.buildFromDecisions(decisions, appDefinition, discoveredResources, result);

        console.log(`\n[${this.name}] ✅ Aurora PostgreSQL configuration completed`);
        return result;
    }

    /**
     * Convert flat discovery to structured discovery
     * Provides backwards compatibility for tests
     */
    convertFlatDiscoveryToStructured(flatDiscovery, appDefinition = {}) {
        const discovery = createEmptyDiscoveryResult();

        if (!flatDiscovery) {
            return discovery;
        }

        // Check if resources are from CloudFormation stack
        const isManagedIsolated = appDefinition.managementMode === 'managed' &&
                                   (appDefinition.vpcIsolation === 'isolated' || !appDefinition.vpcIsolation);
        const hasExistingStackResources = isManagedIsolated && flatDiscovery.auroraClusterId &&
                                         typeof flatDiscovery.auroraClusterId === 'string';

        if (flatDiscovery.fromCloudFormationStack || hasExistingStackResources) {
            discovery.fromCloudFormation = true;
            discovery.stackName = flatDiscovery.stackName || 'assumed-stack';

            // Add stack-managed resources
            let existingLogicalIds = flatDiscovery.existingLogicalIds || [];

            // Infer logical IDs from physical IDs if needed
            if (hasExistingStackResources && existingLogicalIds.length === 0) {
                if (flatDiscovery.auroraClusterId) existingLogicalIds.push('FriggAuroraCluster');
                if (flatDiscovery.auroraInstanceId) existingLogicalIds.push('FriggAuroraInstance');
                if (flatDiscovery.dbSubnetGroupName) existingLogicalIds.push('FriggDBSubnetGroup');
                if (flatDiscovery.dbSecretArn) existingLogicalIds.push('FriggDBSecret');
            }

            existingLogicalIds.forEach(logicalId => {
                let resourceType = '';
                let physicalId = '';

                if (logicalId === 'FriggAuroraCluster') {
                    resourceType = 'AWS::RDS::DBCluster';
                    physicalId = flatDiscovery.auroraClusterId;
                } else if (logicalId === 'FriggAuroraInstance') {
                    resourceType = 'AWS::RDS::DBInstance';
                    physicalId = flatDiscovery.auroraInstanceId;
                } else if (logicalId === 'FriggDBSubnetGroup') {
                    resourceType = 'AWS::RDS::DBSubnetGroup';
                    physicalId = flatDiscovery.dbSubnetGroupName;
                } else if (logicalId === 'FriggDBSecret') {
                    resourceType = 'AWS::SecretsManager::Secret';
                    physicalId = flatDiscovery.dbSecretArn;
                }

                if (physicalId && typeof physicalId === 'string') {
                    discovery.stackManaged.push({
                        logicalId,
                        physicalId,
                        resourceType
                    });
                }
            });
        } else {
            // Resources discovered from AWS API (external)
            // Handle both cluster ID and endpoint
            if (flatDiscovery.auroraClusterId && typeof flatDiscovery.auroraClusterId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.auroraClusterId,
                    resourceType: 'AWS::RDS::DBCluster',
                    source: 'aws-discovery'
                });
            } else if (flatDiscovery.auroraClusterEndpoint && typeof flatDiscovery.auroraClusterEndpoint === 'string') {
                // Endpoint provided (discover mode) - treat as external
                discovery.external.push({
                    physicalId: flatDiscovery.auroraClusterEndpoint,
                    resourceType: 'AWS::RDS::DBCluster',
                    source: 'aws-discovery',
                    properties: { Endpoint: flatDiscovery.auroraClusterEndpoint }
                });
            }

            if (flatDiscovery.auroraInstanceId && typeof flatDiscovery.auroraInstanceId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.auroraInstanceId,
                    resourceType: 'AWS::RDS::DBInstance',
                    source: 'aws-discovery'
                });
            }
        }

        return discovery;
    }

    /**
     * Translate legacy configuration to ownership-based configuration
     * Provides backwards compatibility
     */
    translateLegacyConfig(appDefinition, discoveredResources) {
        // If already using ownership schema, return as-is
        if (appDefinition.database?.postgres?.ownership) {
            return appDefinition;
        }

        const translated = JSON.parse(JSON.stringify(appDefinition));

        // Initialize ownership sections
        if (!translated.database) translated.database = {};
        if (!translated.database.postgres) translated.database.postgres = {};
        if (!translated.database.postgres.ownership) {
            translated.database.postgres.ownership = {};
        }
        if (!translated.database.postgres.external) {
            translated.database.postgres.external = {};
        }
        if (!translated.database.postgres.config) {
            translated.database.postgres.config = {};
        }

        // Handle top-level managementMode
        const globalMode = appDefinition.managementMode || 'discover';
        const vpcIsolation = appDefinition.vpcIsolation || 'shared';

        if (globalMode === 'managed') {
            if (appDefinition.database?.postgres?.management) {
                console.log(`  ⚠️  managementMode='managed' ignoring: database.postgres.management`);
            }

            if (vpcIsolation === 'isolated') {
                const hasStackAurora = discoveredResources?.auroraClusterId &&
                    typeof discoveredResources.auroraClusterId === 'string';

                if (hasStackAurora) {
                    translated.database.postgres.ownership.cluster = 'auto';
                    translated.database.postgres.ownership.instance = 'auto';
                    translated.database.postgres.ownership.subnetGroup = 'auto';
                    translated.database.postgres.ownership.secret = 'auto';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → stack has Aurora, reusing`);
                } else {
                    translated.database.postgres.ownership.cluster = 'stack';
                    translated.database.postgres.ownership.instance = 'stack';
                    translated.database.postgres.ownership.subnetGroup = 'stack';
                    translated.database.postgres.ownership.secret = 'stack';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → no stack Aurora, creating new`);
                }
            } else {
                translated.database.postgres.ownership.cluster = 'auto';
                translated.database.postgres.ownership.instance = 'auto';
                translated.database.postgres.ownership.subnetGroup = 'auto';
                translated.database.postgres.ownership.secret = 'auto';
                console.log(`  managementMode='managed' + vpcIsolation='shared' → discovering Aurora`);
            }
        } else if (globalMode === 'existing') {
            translated.database.postgres.ownership.cluster = 'external';
            translated.database.postgres.ownership.instance = 'external';
        }

        // Handle legacy database.postgres.management
        // BUT: if managementMode (top-level) is set, it takes precedence
        const dbManagement = appDefinition.database?.postgres?.management;
        if (dbManagement && globalMode !== 'managed' && globalMode !== 'existing') {
            if (dbManagement === 'managed') {
                translated.database.postgres.ownership.cluster = 'stack';
                translated.database.postgres.ownership.instance = 'stack';
                translated.database.postgres.ownership.subnetGroup = 'stack';
                translated.database.postgres.ownership.secret = 'stack';
            } else if (dbManagement === 'use-existing') {
                // For use-existing with endpoint, we bypass resolver entirely
                // Mark this with a special flag
                translated.database.postgres._useExistingEndpoint = true;
                if (appDefinition.database.postgres.endpoint) {
                    translated.database.postgres.external.endpoint = appDefinition.database.postgres.endpoint;
                }
            } else if (dbManagement === 'discover') {
                translated.database.postgres.ownership.cluster = 'auto';
                translated.database.postgres.ownership.instance = 'auto';
            }
        }

        // Preserve other database config
        if (appDefinition.database?.postgres?.minCapacity) {
            translated.database.postgres.config.minCapacity = appDefinition.database.postgres.minCapacity;
        }
        if (appDefinition.database?.postgres?.maxCapacity) {
            translated.database.postgres.config.maxCapacity = appDefinition.database.postgres.maxCapacity;
        }
        if (appDefinition.database?.postgres?.publiclyAccessible !== undefined) {
            translated.database.postgres.config.publiclyAccessible = appDefinition.database.postgres.publiclyAccessible;
        }

        return translated;
    }

    /**
     * Build all Aurora resources based on ownership decisions
     */
    async buildFromDecisions(decisions, appDefinition, discoveredResources, result) {
        // Determine build strategy from ownership decisions

        if (decisions.cluster.ownership === ResourceOwnership.EXTERNAL) {
            // External cluster discovered - reference it without creating infrastructure
            console.log('  → Discovering and referencing external Aurora cluster');
            await this.discoverAurora(appDefinition, discoveredResources, result);
        } else if (decisions.cluster.ownership === ResourceOwnership.STACK && decisions.cluster.physicalId) {
            // Cluster exists in stack - add definitions (CloudFormation idempotency)
            console.log('  → Adding Aurora definitions to template (existing in stack)');
            await this.createNewAurora(appDefinition, discoveredResources, result);
        } else if (decisions.cluster.ownership === ResourceOwnership.STACK && !decisions.cluster.physicalId) {
            // Create new cluster (stack, no existing)
            console.log('  → Creating new Aurora cluster in stack');
            await this.createNewAurora(appDefinition, discoveredResources, result);
        } else {
            // Fallback: discover mode
            console.log('  → Discovering Aurora resources');
            await this.discoverAurora(appDefinition, discoveredResources, result);
        }
    }

    /**
     * Create new Aurora cluster
     */
    async createNewAurora(appDefinition, discoveredResources, result) {
        console.log('  Creating new Aurora Serverless v2 cluster...');

        const dbConfig = appDefinition.database.postgres;
        const publiclyAccessible = dbConfig.publiclyAccessible === true;

        // Get subnet IDs for DB Subnet Group
        const subnetIds = publiclyAccessible
            ? [discoveredResources.publicSubnetId1, discoveredResources.publicSubnetId2]
            : [discoveredResources.privateSubnetId1, discoveredResources.privateSubnetId2];

        if (!subnetIds[0] || !subnetIds[1]) {
            throw new Error(
                `Aurora requires 2 ${publiclyAccessible ? 'public' : 'private'} subnets in different AZs. ` +
                'Ensure VPC is configured correctly.'
            );
        }

        // Database Subnet Group
        result.resources.FriggDBSubnetGroup = {
            Type: 'AWS::RDS::DBSubnetGroup',
            Properties: {
                DBSubnetGroupName: '${self:service}-${self:provider.stage}-db-subnet-group',
                DBSubnetGroupDescription: 'Subnet group for Frigg Aurora cluster',
                SubnetIds: subnetIds,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-db-subnet' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Database Credentials Secret
        result.resources.FriggDBSecret = {
            Type: 'AWS::SecretsManager::Secret',
            Properties: {
                Name: '${self:service}-${self:provider.stage}-db-credentials',
                Description: 'Aurora database credentials',
                GenerateSecretString: {
                    SecretStringTemplate: JSON.stringify({ username: dbConfig.username || 'postgres' }),
                    GenerateStringKey: 'password',
                    PasswordLength: 32,
                    // Exclude URL-special characters for Prisma connection string compatibility
                    // Prisma docs: https://www.prisma.io/docs/reference/database-reference/connection-urls#special-characters
                    // Exclude: " @ : / ? # [ ] % \ (all have special meaning in URLs or need escaping)
                    ExcludeCharacters: '"@:/?#[]%\\\\',
                },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-db-secret' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Aurora Cluster
        result.resources.FriggAuroraCluster = {
            Type: 'AWS::RDS::DBCluster',
            DeletionPolicy: 'Snapshot',
            Properties: {
                Engine: 'aurora-postgresql',
                EngineMode: 'provisioned',
                EngineVersion: dbConfig.engineVersion || '15.13', // Configurable, defaults to 15.13 (latest as of Oct 2025)
                Port: 5432, // Explicitly set PostgreSQL port (AWS may not auto-detect)
                DatabaseName: dbConfig.database || 'frigg',
                MasterUsername: {
                    'Fn::Sub': '{{resolve:secretsmanager:${FriggDBSecret}:SecretString:username}}',
                },
                MasterUserPassword: {
                    'Fn::Sub': '{{resolve:secretsmanager:${FriggDBSecret}:SecretString:password}}',
                },
                DBSubnetGroupName: { Ref: 'FriggDBSubnetGroup' },
                VpcSecurityGroupIds: discoveredResources.vpcSecurityGroupIds || [
                    { Ref: 'FriggLambdaSecurityGroup' },
                ],
                // Note: PubliclyAccessible is NOT supported on Aurora clusters
                // It should only be set on DB instances (see FriggAuroraInstance below)
                // MaxCapacity default bumped 1 → 4 ACU: at 0.5–1 ACU Aurora is
                // CPU-starved under 20-way concurrent writes from a Lambda
                // fan-out sync, which starves worker queries and compounds
                // the tail-latency problem. 4 ACU is still cheap (scales to
                // min when idle) and gives the DB enough headroom to
                // absorb bursty sync traffic. Apps can still override both
                // via app definition dbConfig.
                ServerlessV2ScalingConfiguration: {
                    MinCapacity: dbConfig.minCapacity || 0.5,
                    MaxCapacity: dbConfig.maxCapacity || 4,
                },
                EnableHttpEndpoint: false,
                BackupRetentionPeriod: 7,
                PreferredBackupWindow: '03:00-04:00',
                PreferredMaintenanceWindow: 'sun:04:00-sun:05:00',
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-aurora' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Aurora Instance
        result.resources.FriggAuroraInstance = {
            Type: 'AWS::RDS::DBInstance',
            Properties: {
                Engine: 'aurora-postgresql',
                DBInstanceClass: 'db.serverless',
                DBClusterIdentifier: { Ref: 'FriggAuroraCluster' },
                PubliclyAccessible: publiclyAccessible,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-aurora-instance' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Environment variables
        result.environment.DATABASE_URL = this.buildDatabaseUrl(
            { 'Fn::GetAtt': ['FriggAuroraCluster', 'Endpoint.Address'] },
            { 'Fn::GetAtt': ['FriggAuroraCluster', 'Endpoint.Port'] },
            dbConfig.database || 'frigg',
            { Ref: 'FriggDBSecret' }
        );

        // IAM permissions for Secrets Manager
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: { Ref: 'FriggDBSecret' },
        });

        // Add self-referencing security group ingress rule to allow Lambda to connect to Aurora
        // Since both Lambda and Aurora share the same security group, we need to allow the SG to accept traffic from itself
        result.resources.FriggAuroraIngressRule = {
            Type: 'AWS::EC2::SecurityGroupIngress',
            Properties: {
                GroupId: { Ref: 'FriggLambdaSecurityGroup' },
                IpProtocol: 'tcp',
                FromPort: 5432,
                ToPort: 5432,
                SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                Description: 'Allow Lambda functions to connect to Aurora PostgreSQL (self-referencing rule)',
            },
        };

        console.log('  ✅ Aurora Serverless v2 cluster resources created');
    }

    /**
     * Use existing Aurora cluster
     */
    async useExistingAurora(appDefinition, discoveredResources, result) {
        console.log('  Using existing Aurora cluster...');

        const dbConfig = appDefinition.database.postgres;

        if (!dbConfig.endpoint) {
            throw new Error('database.postgres.endpoint is required when management="use-existing"');
        }

        // Set environment variables for existing cluster
        result.environment.DATABASE_HOST = dbConfig.endpoint;
        result.environment.DATABASE_PORT = String(dbConfig.port || 5432);
        result.environment.DATABASE_NAME = dbConfig.database || 'frigg';
        result.environment.DATABASE_USER = dbConfig.username || 'postgres';

        console.log(`  ✅ Using existing cluster: ${dbConfig.endpoint}`);
    }

    /**
     * Discover existing Aurora cluster
     */
    async discoverAurora(appDefinition, discoveredResources, result) {
        console.log('  Discovering Aurora cluster...');

        if (!discoveredResources.auroraClusterEndpoint) {
            throw new Error(
                'No Aurora cluster found in discovery mode. Set management to "managed" or provide endpoint with "use-existing".'
            );
        }

        console.log(`  ✅ Using discovered Aurora cluster: ${discoveredResources.auroraClusterEndpoint}`);

        const dbConfig = appDefinition.database.postgres;

        // Use discovered cluster details
        result.environment.DATABASE_HOST = discoveredResources.auroraClusterEndpoint;
        result.environment.DATABASE_PORT = String(discoveredResources.auroraPort || 5432);

        // Check if we should auto-create credentials
        if (dbConfig.autoCreateCredentials && !discoveredResources.databaseSecretArn) {
            console.log('  Creating Secrets Manager secret and rotating Aurora password...');

            // Create Secrets Manager secret with auto-generated password
            result.resources.FriggDBSecret = {
                Type: 'AWS::SecretsManager::Secret',
                Properties: {
                    Name: '${self:service}-${self:provider.stage}-db-credentials',
                    Description: 'Aurora database credentials (auto-created for discovered cluster)',
                    GenerateSecretString: {
                        SecretStringTemplate: JSON.stringify({ username: dbConfig.username || 'postgres' }),
                        GenerateStringKey: 'password',
                        PasswordLength: 32,
                        // Exclude URL-special characters for Prisma connection string compatibility
                        // Prisma docs: https://www.prisma.io/docs/reference/database-reference/connection-urls#special-characters
                        // Exclude: " @ : / ? # [ ] % \ (all have special meaning in URLs or need escaping)
                        ExcludeCharacters: '"@:/?#[]%\\\\',
                    },
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-db-secret' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Purpose', Value: 'DiscoveredClusterCredentials' },
                    ],
                },
            };

            // Get the cluster identifier from the endpoint
            // Format: cluster-name.cluster-xyz.region.rds.amazonaws.com
            const clusterIdentifier = discoveredResources.auroraClusterEndpoint.split('.')[0];

            // Create custom resource to rotate the Aurora master password
            // This uses a Lambda-backed CloudFormation custom resource
            result.resources.FriggAuroraPasswordRotator = {
                Type: 'Custom::AuroraPasswordRotator',
                Properties: {
                    ServiceToken: { 'Fn::GetAtt': ['PasswordRotatorLambda', 'Arn'] },
                    ClusterIdentifier: clusterIdentifier,
                    SecretArn: { Ref: 'FriggDBSecret' },
                    Region: '${self:provider.region}',
                },
                DependsOn: ['FriggDBSecret', 'PasswordRotatorLambda'],
            };

            // Lambda function to rotate the password
            result.resources.PasswordRotatorLambda = {
                Type: 'AWS::Lambda::Function',
                Properties: {
                    FunctionName: '${self:service}-${self:provider.stage}-password-rotator',
                    Runtime: 'nodejs22.x',
                    Handler: 'index.handler',
                    Role: { 'Fn::GetAtt': ['PasswordRotatorRole', 'Arn'] },
                    Timeout: 60,
                    Code: {
                        ZipFile: `
const { RDSClient, ModifyDBClusterCommand } = require('@aws-sdk/client-rds');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const { RequestType, ResourceProperties } = event;
    const { ClusterIdentifier, SecretArn, Region } = ResourceProperties;
    
    const sendResponse = async (status, data = {}) => {
        const responseBody = JSON.stringify({
            Status: status,
            Reason: data.Reason || 'See CloudWatch logs',
            PhysicalResourceId: context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: data,
        });
        
        await fetch(event.ResponseURL, {
            method: 'PUT',
            body: responseBody,
            headers: { 'Content-Type': '' },
        });
    };
    
    try {
        if (RequestType === 'Delete') {
            await sendResponse('SUCCESS', { Message: 'Delete not required' });
            return;
        }
        
        // Get the new password from Secrets Manager
        const smClient = new SecretsManagerClient({ region: Region });
        const secretResponse = await smClient.send(
            new GetSecretValueCommand({ SecretId: SecretArn })
        );
        const secret = JSON.parse(secretResponse.SecretString);
        const newPassword = secret.password;
        
        // Rotate the Aurora cluster master password
        const rdsClient = new RDSClient({ region: Region });
        await rdsClient.send(
            new ModifyDBClusterCommand({
                DBClusterIdentifier: ClusterIdentifier,
                MasterUserPassword: newPassword,
                ApplyImmediately: true,
            })
        );
        
        console.log('Successfully rotated password for cluster: ' + ClusterIdentifier);
        await sendResponse('SUCCESS', { 
            Message: 'Password rotated successfully',
            ClusterIdentifier,
        });
    } catch (error) {
        console.error('Error rotating password:', error);
        await sendResponse('FAILED', { Reason: error.message });
    }
};
                        `,
                    },
                },
            };

            // IAM role for the password rotator Lambda
            result.resources.PasswordRotatorRole = {
                Type: 'AWS::IAM::Role',
                Properties: {
                    AssumeRolePolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: { Service: 'lambda.amazonaws.com' },
                                Action: 'sts:AssumeRole',
                            },
                        ],
                    },
                    ManagedPolicyArns: [
                        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                    ],
                    Policies: [
                        {
                            PolicyName: 'PasswordRotatorPolicy',
                            PolicyDocument: {
                                Version: '2012-10-17',
                                Statement: [
                                    {
                                        Effect: 'Allow',
                                        Action: [
                                            'rds:ModifyDBCluster',
                                            'rds:DescribeDBClusters',
                                        ],
                                        Resource: '*',
                                    },
                                    {
                                        Effect: 'Allow',
                                        Action: ['secretsmanager:GetSecretValue'],
                                        Resource: { Ref: 'FriggDBSecret' },
                                    },
                                ],
                            },
                        },
                    ],
                },
            };

            // Use the secret for DATABASE_URL
            result.environment.DATABASE_SECRET_ARN = { Ref: 'FriggDBSecret' };
            result.environment.DATABASE_URL = this.buildDatabaseUrl(
                discoveredResources.auroraClusterEndpoint,
                discoveredResources.auroraPort || 5432,
                dbConfig.database || 'frigg',
                { Ref: 'FriggDBSecret' }
            );

            // Grant Lambda functions permission to read the secret
            result.iamStatements.push({
                Effect: 'Allow',
                Action: ['secretsmanager:GetSecretValue'],
                Resource: { Ref: 'FriggDBSecret' },
            });

            console.log('  ✅ Credentials auto-creation configured');
        } else if (discoveredResources.databaseSecretArn) {
            // Use existing discovered secret
            result.environment.DATABASE_SECRET_ARN = discoveredResources.databaseSecretArn;
            result.environment.DATABASE_URL = this.buildDatabaseUrl(
                discoveredResources.auroraClusterEndpoint,
                discoveredResources.auroraPort || 5432,
                dbConfig.database || 'frigg',
                discoveredResources.databaseSecretArn
            );

            result.iamStatements.push({
                Effect: 'Allow',
                Action: ['secretsmanager:GetSecretValue'],
                Resource: discoveredResources.databaseSecretArn,
            });

            console.log('  ✅ Using discovered Secrets Manager credentials');
        } else {
            // No secret and no auto-create - set individual DB connection components
            // The application will construct DATABASE_URL at runtime from these components + DATABASE_USER + DATABASE_PASSWORD
            const dbName = dbConfig.database || 'frigg';

            result.environment.DATABASE_HOST = discoveredResources.auroraClusterEndpoint;
            result.environment.DATABASE_PORT = String(discoveredResources.auroraPort || 5432);
            result.environment.DATABASE_NAME = dbName;

            // Note: DATABASE_URL is NOT set here to avoid Serverless variable resolution errors
            // The application (Frigg Core) should construct it at runtime from:
            // DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD

            console.log('  ℹ️  No Secrets Manager secret found - set DATABASE_USER and DATABASE_PASSWORD in Lambda environment');
            console.log('  ℹ️  Application will construct DATABASE_URL at runtime from DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD');
            console.log('  ℹ️  Or enable autoCreateCredentials=true to automatically create and rotate credentials');
        }

        // Add security group ingress rule to allow Lambda to connect to Aurora
        if (discoveredResources.auroraSecurityGroupId) {
            result.resources.FriggAuroraIngressRule = {
                Type: 'AWS::EC2::SecurityGroupIngress',
                Properties: {
                    GroupId: discoveredResources.auroraSecurityGroupId,
                    IpProtocol: 'tcp',
                    FromPort: discoveredResources.auroraPort || 5432,
                    ToPort: discoveredResources.auroraPort || 5432,
                    SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                    Description: 'Allow Lambda functions to connect to Aurora PostgreSQL',
                },
            };
            console.log(`  ✅ Added security group ingress rule for Lambda → Aurora connectivity`);
        }

        console.log(`  ✅ Discovered cluster configuration complete`);
    }

    /**
     * Build DATABASE_URL connection string
     * @param {string|object} host - Database host (string or CloudFormation intrinsic function)
     * @param {string|number|object} port - Database port (string/number or CloudFormation intrinsic function)
     * @param {string} database - Database name
     * @param {string|object} secretRef - Secret ARN (string) or CloudFormation Ref object
     */
    buildDatabaseUrl(host, port, database, secretRef) {
        // Handle secretRef as either a string ARN or CloudFormation Ref object
        const resolveSecretRef = (secretRefValue) => {
            if (typeof secretRefValue === 'object' && secretRefValue.Ref) {
                // CloudFormation Ref - use nested Fn::Sub to resolve it
                return {
                    'Fn::Sub': [
                        '{{resolve:secretsmanager:${SecretArn}:SecretString:username}}',
                        { SecretArn: secretRefValue },
                    ],
                };
            }
            // String ARN - use directly
            return `{{resolve:secretsmanager:${secretRefValue}:SecretString:username}}`;
        };

        const resolveSecretPassword = (secretRefValue) => {
            if (typeof secretRefValue === 'object' && secretRefValue.Ref) {
                // CloudFormation Ref - use nested Fn::Sub to resolve it
                return {
                    'Fn::Sub': [
                        '{{resolve:secretsmanager:${SecretArn}:SecretString:password}}',
                        { SecretArn: secretRefValue },
                    ],
                };
            }
            // String ARN - use directly
            return `{{resolve:secretsmanager:${secretRefValue}:SecretString:password}}`;
        };

        // Pool + timeout query params:
        //  connection_limit=1       — one pg connection per Lambda container;
        //                             rely on Lambda concurrency for parallelism
        //                             rather than per-process pooling (AWS RDS/
        //                             Lambda best practice).
        //  pool_timeout=10          — throw P2024 instead of waiting forever for
        //                             a pool slot.
        //  connect_timeout=10       — bound TCP/TLS handshake to 10s.
        //  socket_timeout=60        — kill the client socket if the server
        //                             never responds (dead NAT/VPC route case).
        //  options=-c statement_timeout=30000 -c lock_timeout=10000
        //                           — Postgres-side hard caps on query and
        //                             lock-wait duration; queries aborting
        //                             with SQLSTATE 57014 / 55P03 surface as
        //                             errors instead of 15-minute Lambda
        //                             timeouts. URL-encoded per Postgres libpq
        //                             conventions (space→%20, `=`→%3D inside
        //                             the options value).
        const queryParams = [
            'connection_limit=1',
            'pool_timeout=10',
            'connect_timeout=10',
            'socket_timeout=60',
            'options=-c%20statement_timeout%3D30000%20-c%20lock_timeout%3D10000',
        ].join('&');

        return {
            'Fn::Sub': [
                `postgresql://\${Username}:\${Password}@\${Host}:\${Port}/\${Database}?${queryParams}`,
                {
                    Username: resolveSecretRef(secretRef),
                    Password: resolveSecretPassword(secretRef),
                    Host: host,
                    Port: port,
                    Database: database,
                },
            ],
        };
    }
}

module.exports = { AuroraBuilder };

