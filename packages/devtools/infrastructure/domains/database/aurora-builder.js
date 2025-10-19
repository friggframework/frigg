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
 * Supports three management modes:
 * 1. create-new: Creates new Aurora cluster
 * 2. use-existing: Uses explicitly provided cluster
 * 3. discover (default): Discovers existing cluster
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

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
        const validModes = ['discover', 'create-new', 'use-existing'];
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
     * Build Aurora infrastructure
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring Aurora PostgreSQL...`);

        const dbConfig = appDefinition.database.postgres;
        const management = dbConfig.management || 'discover';

        console.log(`  PostgreSQL Management Mode: ${management}`);

        const result = {
            resources: {},
            iamStatements: [],
            environment: {},
        };

        // Handle different management modes
        switch (management) {
            case 'create-new':
                await this.createNewAurora(appDefinition, discoveredResources, result);
                break;
            case 'use-existing':
                await this.useExistingAurora(appDefinition, discoveredResources, result);
                break;
            case 'discover':
            default:
                await this.discoverAurora(appDefinition, discoveredResources, result);
                break;
        }

        console.log(`[${this.name}] ✅ Aurora PostgreSQL configuration completed`);
        return result;
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
                    ExcludeCharacters: '"@/\\',
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
                EngineVersion: '15.5',
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
                PubliclyAccessible: publiclyAccessible,
                ServerlessV2ScalingConfiguration: {
                    MinCapacity: dbConfig.minCapacity || 0.5,
                    MaxCapacity: dbConfig.maxCapacity || 1,
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
                'No Aurora cluster found in discovery mode. Set management to "create-new" or provide endpoint with "use-existing".'
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
                        ExcludeCharacters: '"@/\\',
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
        
        console.log(\`Successfully rotated password for cluster: \${ClusterIdentifier}\`);
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
            // No secret and no auto-create - construct DATABASE_URL using environment variables at runtime
            const dbName = dbConfig.database || 'frigg';
            
            // Set individual environment variables for flexible credential management
            result.environment.DATABASE_HOST = discoveredResources.auroraClusterEndpoint;
            result.environment.DATABASE_PORT = String(discoveredResources.auroraPort || 5432);
            result.environment.DATABASE_NAME = dbName;
            
            // Build DATABASE_URL using CloudFormation intrinsic functions to reference
            // the environment variables at runtime (not build time)
            result.environment.DATABASE_URL = {
                'Fn::Sub': [
                    'postgresql://${DatabaseUser}:${DatabasePassword}@${DatabaseHost}:${DatabasePort}/${DatabaseName}',
                    {
                        DatabaseUser: '${env:DATABASE_USER, "postgres"}',
                        DatabasePassword: '${env:DATABASE_PASSWORD}',
                        DatabaseHost: discoveredResources.auroraClusterEndpoint,
                        DatabasePort: String(discoveredResources.auroraPort || 5432),
                        DatabaseName: dbName,
                    },
                ],
            };
            
            console.log('  ℹ️  No Secrets Manager secret found - DATABASE_URL will use DATABASE_USER and DATABASE_PASSWORD from environment');
            console.log('  ℹ️  Set DATABASE_USER and DATABASE_PASSWORD in Lambda environment or via serverless deploy --param');
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
     */
    buildDatabaseUrl(host, port, database, secretRef) {
        return {
            'Fn::Sub': [
                `postgresql://\${Username}:\${Password}@\${Host}:\${Port}/\${Database}`,
                {
                    Username: `{{resolve:secretsmanager:${secretRef}:SecretString:username}}`,
                    Password: `{{resolve:secretsmanager:${secretRef}:SecretString:password}}`,
                    Host: host,
                    Port: port,
                    Database: database,
                },
            ],
        };
    }
}

module.exports = { AuroraBuilder };

