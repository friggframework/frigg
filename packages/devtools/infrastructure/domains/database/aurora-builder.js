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
        
        // Use discovered cluster details
        result.environment.DATABASE_HOST = discoveredResources.auroraClusterEndpoint;
        result.environment.DATABASE_PORT = String(discoveredResources.auroraPort || 5432);

        if (discoveredResources.databaseSecretArn) {
            result.environment.DATABASE_SECRET_ARN = discoveredResources.databaseSecretArn;
            result.iamStatements.push({
                Effect: 'Allow',
                Action: ['secretsmanager:GetSecretValue'],
                Resource: discoveredResources.databaseSecretArn,
            });
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

