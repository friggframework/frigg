const path = require('path');
const fs = require('fs');
const { AWSDiscovery } = require('./aws-discovery');

const shouldRunDiscovery = (AppDefinition) => {
    console.log('⚙️  Checking FRIGG_SKIP_AWS_DISCOVERY:', process.env.FRIGG_SKIP_AWS_DISCOVERY);
    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
        console.log('⚙️  Skipping AWS discovery because FRIGG_SKIP_AWS_DISCOVERY is set.');
        return false;
    }

    return (
        AppDefinition.vpc?.enable === true ||
        AppDefinition.encryption?.fieldLevelEncryptionMethod === 'kms' ||
        AppDefinition.ssm?.enable === true
    );
};

const getAppEnvironmentVars = (AppDefinition) => {
    const envVars = {};
    const reservedVars = new Set([
        '_HANDLER',
        '_X_AMZN_TRACE_ID',
        'AWS_DEFAULT_REGION',
        'AWS_EXECUTION_ENV',
        'AWS_REGION',
        'AWS_LAMBDA_FUNCTION_NAME',
        'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
        'AWS_LAMBDA_FUNCTION_VERSION',
        'AWS_LAMBDA_INITIALIZATION_TYPE',
        'AWS_LAMBDA_LOG_GROUP_NAME',
        'AWS_LAMBDA_LOG_STREAM_NAME',
        'AWS_ACCESS_KEY',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
    ]);

    if (!AppDefinition.environment) {
        return envVars;
    }

    console.log('📋 Loading environment variables from appDefinition...');
    const envKeys = [];
    const skippedKeys = [];

    for (const [key, value] of Object.entries(AppDefinition.environment)) {
        if (value !== true) continue;
        if (reservedVars.has(key)) {
            skippedKeys.push(key);
            continue;
        }
        envVars[key] = `\${env:${key}, ''}`;
        envKeys.push(key);
    }

    if (envKeys.length > 0) {
        console.log(`   Found ${envKeys.length} environment variables: ${envKeys.join(', ')}`);
    }
    if (skippedKeys.length > 0) {
        console.log(
            `   ⚠️  Skipped ${skippedKeys.length} reserved AWS Lambda variables: ${skippedKeys.join(', ')}`
        );
    }

    return envVars;
};

const findNodeModulesPath = () => {
    try {
        let currentDir = process.cwd();
        let nodeModulesPath = null;

        for (let i = 0; i < 5; i++) {
            const potentialPath = path.join(currentDir, 'node_modules');
            if (fs.existsSync(potentialPath)) {
                nodeModulesPath = potentialPath;
                console.log(`Found node_modules at: ${nodeModulesPath} (method 1)`);
                break;
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }

        if (!nodeModulesPath) {
            try {
                const { execSync } = require('node:child_process');
                const npmRoot = execSync('npm root', { encoding: 'utf8' }).trim();
                if (fs.existsSync(npmRoot)) {
                    nodeModulesPath = npmRoot;
                    console.log(`Found node_modules at: ${nodeModulesPath} (method 2)`);
                }
            } catch (npmError) {
                console.error('Error executing npm root:', npmError);
            }
        }

        if (!nodeModulesPath) {
            currentDir = process.cwd();
            for (let i = 0; i < 5; i++) {
                const packageJsonPath = path.join(currentDir, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const potentialNodeModules = path.join(currentDir, 'node_modules');
                    if (fs.existsSync(potentialNodeModules)) {
                        nodeModulesPath = potentialNodeModules;
                        console.log(`Found node_modules at: ${nodeModulesPath} (method 3)`);
                        break;
                    }
                }
                const parentDir = path.dirname(currentDir);
                if (parentDir === currentDir) break;
                currentDir = parentDir;
            }
        }

        if (nodeModulesPath) {
            return nodeModulesPath;
        }

        console.warn('Could not find node_modules path, falling back to default');
        return path.resolve(process.cwd(), '../node_modules');
    } catch (error) {
        console.error('Error finding node_modules path:', error);
        return path.resolve(process.cwd(), '../node_modules');
    }
};

const modifyHandlerPaths = (functions) => {
    const isOffline = process.argv.includes('offline');
    console.log('isOffline', isOffline);

    if (!isOffline) {
        console.log('Not in offline mode, skipping handler path modification');
        return functions;
    }

    const nodeModulesPath = findNodeModulesPath();
    const modifiedFunctions = { ...functions };

    for (const functionName of Object.keys(modifiedFunctions)) {
        console.log('functionName', functionName);
        const functionDef = modifiedFunctions[functionName];
        if (functionDef?.handler?.includes('node_modules/')) {
            const relativePath = path.relative(process.cwd(), nodeModulesPath);
            functionDef.handler = functionDef.handler.replace('node_modules/', `${relativePath}/`);
            console.log(`Updated handler for ${functionName}: ${functionDef.handler}`);
        }
    }

    return modifiedFunctions;
};

const createVPCInfrastructure = (AppDefinition) => {
    const vpcResources = {
        FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
                CidrBlock: AppDefinition.vpc.cidrBlock || '10.0.0.0/16',
                EnableDnsHostnames: true,
                EnableDnsSupport: true,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
        },
        FriggInternetGateway: {
            Type: 'AWS::EC2::InternetGateway',
            Properties: {
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
        },
        FriggVPCGatewayAttachment: {
            Type: 'AWS::EC2::VPCGatewayAttachment',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                InternetGatewayId: { Ref: 'FriggInternetGateway' },
            },
        },
        FriggPublicSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.1.0/24',
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                MapPublicIpOnLaunch: true,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-subnet' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'Public' },
                ],
            },
        },
        FriggPrivateSubnet1: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.2.0/24',
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-subnet-1' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'Private' },
                ],
            },
        },
        FriggPrivateSubnet2: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.3.0/24',
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-subnet-2' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'Private' },
                ],
            },
        },
        FriggNATGatewayEIP: {
            Type: 'AWS::EC2::EIP',
            Properties: {
                Domain: 'vpc',
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
            DependsOn: 'FriggVPCGatewayAttachment',
        },
        FriggNATGateway: {
            Type: 'AWS::EC2::NatGateway',
            Properties: {
                AllocationId: { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                SubnetId: { Ref: 'FriggPublicSubnet' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-gateway' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
        },
        FriggPublicRouteTable: {
            Type: 'AWS::EC2::RouteTable',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-rt' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'Public' },
                ],
            },
        },
        FriggPublicRoute: {
            Type: 'AWS::EC2::Route',
            Properties: {
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                GatewayId: { Ref: 'FriggInternetGateway' },
            },
            DependsOn: 'FriggVPCGatewayAttachment',
        },
        FriggPublicSubnetRouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPublicSubnet' },
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
            },
        },
        FriggPrivateRouteTable: {
            Type: 'AWS::EC2::RouteTable',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-rt' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'Private' },
                ],
            },
        },
        FriggPrivateRoute: {
            Type: 'AWS::EC2::Route',
            Properties: {
                RouteTableId: { Ref: 'FriggPrivateRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                NatGatewayId: { Ref: 'FriggNATGateway' },
            },
        },
        FriggPrivateSubnet1RouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPrivateSubnet1' },
                RouteTableId: { Ref: 'FriggPrivateRouteTable' },
            },
        },
        FriggPrivateSubnet2RouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPrivateSubnet2' },
                RouteTableId: { Ref: 'FriggPrivateRouteTable' },
            },
        },
        FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: { Ref: 'FriggVPC' },
                SecurityGroupEgress: [
                    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' },
                    { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0', Description: 'HTTP outbound' },
                    { IpProtocol: 'tcp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS TCP' },
                    { IpProtocol: 'udp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS UDP' },
                    { IpProtocol: 'tcp', FromPort: 27017, ToPort: 27017, CidrIp: '0.0.0.0/0', Description: 'MongoDB outbound' },
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
        },
    };

    if (AppDefinition.vpc.enableVPCEndpoints !== false) {
        vpcResources.FriggS3VPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                VpcEndpointType: 'Gateway',
                RouteTableIds: [{ Ref: 'FriggPrivateRouteTable' }],
            },
        };

        vpcResources.FriggDynamoDBVPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                VpcEndpointType: 'Gateway',
                RouteTableIds: [{ Ref: 'FriggPrivateRouteTable' }],
            },
        };

        if (AppDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') {
            vpcResources.FriggKMSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: { Ref: 'FriggVPC' },
                    ServiceName: 'com.amazonaws.${self:provider.region}.kms',
                    VpcEndpointType: 'Interface',
                    SubnetIds: [{ Ref: 'FriggPrivateSubnet1' }, { Ref: 'FriggPrivateSubnet2' }],
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        vpcResources.FriggSecretsManagerVPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.secretsmanager',
                VpcEndpointType: 'Interface',
                SubnetIds: [{ Ref: 'FriggPrivateSubnet1' }, { Ref: 'FriggPrivateSubnet2' }],
                SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                PrivateDnsEnabled: true,
            },
        };

        vpcResources.FriggVPCEndpointSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg VPC Endpoints - allows HTTPS from Lambda functions',
                VpcId: { Ref: 'FriggVPC' },
                SecurityGroupIngress: [
                    {
                        IpProtocol: 'tcp',
                        FromPort: 443,
                        ToPort: 443,
                        SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                        Description: 'HTTPS from Lambda security group',
                    },
                    {
                        IpProtocol: 'tcp',
                        FromPort: 443,
                        ToPort: 443,
                        CidrIp: AppDefinition.vpc.cidrBlock || '10.0.0.0/16',
                        Description: 'HTTPS from VPC CIDR (fallback)',
                    },
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc-endpoint-sg' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                    { Key: 'Type', Value: 'VPCEndpoint' },
                    { Key: 'Purpose', Value: 'Allow Lambda functions to access VPC endpoints' },
                ],
            },
        };
    }

    return vpcResources;
};

const gatherDiscoveredResources = async (AppDefinition) => {
    if (!shouldRunDiscovery(AppDefinition)) {
        return {};
    }

    console.log('🔍 Running AWS resource discovery for serverless template...');
    try {
        const region = process.env.AWS_REGION || 'us-east-1';
        const discovery = new AWSDiscovery(region);
        const config = {
            vpc: AppDefinition.vpc || {},
            encryption: AppDefinition.encryption || {},
            ssm: AppDefinition.ssm || {},
        };

        const discoveredResources = await discovery.discoverResources(config);

        console.log('✅ AWS discovery completed successfully!');
        if (discoveredResources.defaultVpcId) {
            console.log(`   VPC: ${discoveredResources.defaultVpcId}`);
        }
        if (discoveredResources.privateSubnetId1 && discoveredResources.privateSubnetId2) {
            console.log(
                `   Subnets: ${discoveredResources.privateSubnetId1}, ${discoveredResources.privateSubnetId2}`
            );
        }
        if (discoveredResources.defaultSecurityGroupId) {
            console.log(`   Security Group: ${discoveredResources.defaultSecurityGroupId}`);
        }
        if (discoveredResources.defaultKmsKeyId) {
            console.log(`   KMS Key: ${discoveredResources.defaultKmsKeyId}`);
        }

        return discoveredResources;
    } catch (error) {
        console.error('❌ AWS discovery failed:', error.message);
        throw new Error(`AWS discovery failed: ${error.message}`);
    }
};

const buildEnvironment = (appEnvironmentVars, discoveredResources) => {
    const environment = {
        STAGE: '${opt:stage, "dev"}',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1,
        ...appEnvironmentVars,
    };

    const discoveryEnvMapping = {
        defaultVpcId: 'AWS_DISCOVERY_VPC_ID',
        defaultSecurityGroupId: 'AWS_DISCOVERY_SECURITY_GROUP_ID',
        privateSubnetId1: 'AWS_DISCOVERY_SUBNET_ID_1',
        privateSubnetId2: 'AWS_DISCOVERY_SUBNET_ID_2',
        publicSubnetId: 'AWS_DISCOVERY_PUBLIC_SUBNET_ID',
        defaultRouteTableId: 'AWS_DISCOVERY_ROUTE_TABLE_ID',
        defaultKmsKeyId: 'AWS_DISCOVERY_KMS_KEY_ID',
    };

    for (const [key, envKey] of Object.entries(discoveryEnvMapping)) {
        if (discoveredResources[key]) {
            environment[envKey] = discoveredResources[key];
        }
    }

    return environment;
};

const createBaseDefinition = (AppDefinition, appEnvironmentVars, discoveredResources) => {
    const region = process.env.AWS_REGION || 'us-east-1';

    return {
        frameworkVersion: '>=3.17.0',
        service: AppDefinition.name || 'create-frigg-app',
        package: {
            individually: true,
            exclude: ['!**/node_modules/aws-sdk/**', '!**/node_modules/@aws-sdk/**', '!package.json'],
        },
        useDotenv: true,
        provider: {
            name: AppDefinition.provider || 'aws',
            runtime: 'nodejs20.x',
            timeout: 30,
            region,
            stage: '${opt:stage}',
            environment: buildEnvironment(appEnvironmentVars, discoveredResources),
            iamRoleStatements: [
                {
                    Effect: 'Allow',
                    Action: ['sns:Publish'],
                    Resource: { Ref: 'InternalErrorBridgeTopic' },
                },
                {
                    Effect: 'Allow',
                    Action: ['sqs:SendMessage', 'sqs:SendMessageBatch', 'sqs:GetQueueUrl', 'sqs:GetQueueAttributes'],
                    Resource: [
                        { 'Fn::GetAtt': ['InternalErrorQueue', 'Arn'] },
                        {
                            'Fn::Join': [
                                ':',
                                ['arn:aws:sqs:${self:provider.region}:*:${self:service}--${self:provider.stage}-*Queue'],
                            ],
                        },
                    ],
                },
            ],
            httpApi: {
                payload: '2.0',
                cors: {
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                    allowedMethods: ['*'],
                    allowCredentials: false,
                },
                name: '${opt:stage, "dev"}-${self:service}',
                disableDefaultEndpoint: false,
            },
        },
        plugins: [
            'serverless-jetpack',
            'serverless-dotenv-plugin',
            'serverless-offline-sqs',
            'serverless-offline',
            '@friggframework/serverless-plugin',
        ],
        custom: {
            'serverless-offline': {
                httpPort: 3001,
                lambdaPort: 4001,
                websocketPort: 3002,
            },
            'serverless-offline-sqs': {
                autoCreate: false,
                apiVersion: '2012-11-05',
                endpoint: 'http://localhost:4566',
                region,
                accessKeyId: 'root',
                secretAccessKey: 'root',
                skipCacheInvalidation: false,
            },
            jetpack: {
                base: '..',
            },
        },
        functions: {
            auth: {
                handler: 'node_modules/@friggframework/core/handlers/routers/auth.handler',
                events: [
                    { httpApi: { path: '/api/integrations', method: 'ANY' } },
                    { httpApi: { path: '/api/integrations/{proxy+}', method: 'ANY' } },
                    { httpApi: { path: '/api/authorize', method: 'ANY' } },
                ],
            },
            user: {
                handler: 'node_modules/@friggframework/core/handlers/routers/user.handler',
                events: [{ httpApi: { path: '/user/{proxy+}', method: 'ANY' } }],
            },
            health: {
                handler: 'node_modules/@friggframework/core/handlers/routers/health.handler',
                events: [
                    { httpApi: { path: '/health', method: 'GET' } },
                    { httpApi: { path: '/health/{proxy+}', method: 'GET' } },
                ],
            },
        },
        resources: {
            Resources: {
                InternalErrorQueue: {
                    Type: 'AWS::SQS::Queue',
                    Properties: {
                        QueueName: '${self:service}-internal-error-queue-${self:provider.stage}',
                        MessageRetentionPeriod: 300,
                    },
                },
                InternalErrorBridgeTopic: {
                    Type: 'AWS::SNS::Topic',
                    Properties: {
                        Subscription: [
                            {
                                Protocol: 'sqs',
                                Endpoint: { 'Fn::GetAtt': ['InternalErrorQueue', 'Arn'] },
                            },
                        ],
                    },
                },
                InternalErrorBridgePolicy: {
                    Type: 'AWS::SQS::QueuePolicy',
                    Properties: {
                        Queues: [{ Ref: 'InternalErrorQueue' }],
                        PolicyDocument: {
                            Version: '2012-10-17',
                            Statement: [
                                {
                                    Sid: 'Allow Dead Letter SNS to publish to SQS',
                                    Effect: 'Allow',
                                    Principal: { Service: 'sns.amazonaws.com' },
                                    Resource: { 'Fn::GetAtt': ['InternalErrorQueue', 'Arn'] },
                                    Action: ['SQS:SendMessage', 'SQS:SendMessageBatch'],
                                    Condition: {
                                        ArnEquals: { 'aws:SourceArn': { Ref: 'InternalErrorBridgeTopic' } },
                                    },
                                },
                            ],
                        },
                    },
                },
                ApiGatewayAlarm5xx: {
                    Type: 'AWS::CloudWatch::Alarm',
                    Properties: {
                        AlarmDescription: 'API Gateway 5xx Errors',
                        Namespace: 'AWS/ApiGateway',
                        MetricName: '5XXError',
                        Statistic: 'Sum',
                        Threshold: 0,
                        ComparisonOperator: 'GreaterThanThreshold',
                        EvaluationPeriods: 1,
                        Period: 60,
                        AlarmActions: [{ Ref: 'InternalErrorBridgeTopic' }],
                        Dimensions: [
                            { Name: 'ApiId', Value: { Ref: 'HttpApi' } },
                            { Name: 'Stage', Value: '${self:provider.stage}' },
                        ],
                    },
                },
            },
        },
    };
};

const applyKmsConfiguration = (definition, AppDefinition, discoveredResources) => {
    if (AppDefinition.encryption?.fieldLevelEncryptionMethod !== 'kms') {
        return;
    }

    // Skip KMS configuration for local development when AWS discovery is disabled
    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
        console.log('⚙️  Skipping KMS configuration for local development (FRIGG_SKIP_AWS_DISCOVERY is set)');
        return;
    }

    if (discoveredResources.defaultKmsKeyId) {
        console.log(`Using existing KMS key: ${discoveredResources.defaultKmsKeyId}`);
        definition.resources.Resources.FriggKMSKeyAlias = {
            Type: 'AWS::KMS::Alias',
            DeletionPolicy: 'Retain',
            Properties: {
                AliasName: 'alias/${self:service}-${self:provider.stage}-frigg-kms',
                TargetKeyId: discoveredResources.defaultKmsKeyId,
            },
        };

        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
            Resource: [discoveredResources.defaultKmsKeyId],
        });
    } else {
        if (AppDefinition.encryption?.createResourceIfNoneFound !== true) {
            throw new Error(
                'KMS field-level encryption is enabled but no KMS key was found. ' +
                    'Either provide an existing KMS key or set encryption.createResourceIfNoneFound to true to create a new key.'
            );
        }

        console.log('No existing KMS key found, creating a new one...');
        definition.resources.Resources.FriggKMSKey = {
            Type: 'AWS::KMS::Key',
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain',
            Properties: {
                EnableKeyRotation: true,
                Description: 'Frigg KMS key for field-level encryption',
                KeyPolicy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'AllowRootAccountAdmin',
                            Effect: 'Allow',
                            Principal: {
                                AWS: { 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' },
                            },
                            Action: 'kms:*',
                            Resource: '*',
                        },
                        {
                            Sid: 'AllowLambdaService',
                            Effect: 'Allow',
                            Principal: { Service: 'lambda.amazonaws.com' },
                            Action: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:DescribeKey'],
                            Resource: '*',
                            Condition: {
                                StringEquals: {
                                    'kms:ViaService': `lambda.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
                                },
                            },
                        },
                    ],
                },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-frigg-kms-key' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Purpose', Value: 'Field-level encryption for Frigg application' },
                ],
            },
        };

        definition.resources.Resources.FriggKMSKeyAlias = {
            Type: 'AWS::KMS::Alias',
            DeletionPolicy: 'Retain',
            Properties: {
                AliasName: 'alias/${self:service}-${self:provider.stage}-frigg-kms',
                TargetKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] },
            },
        };

        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
            Resource: [{ 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] }],
        });

        definition.provider.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
        definition.custom.kmsGrants = {
            kmsKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] },
        };
    }

    definition.plugins.push('serverless-kms-grants');
    if (!definition.custom.kmsGrants) {
        definition.custom.kmsGrants = {
            kmsKeyId: discoveredResources.defaultKmsKeyId || '${env:AWS_DISCOVERY_KMS_KEY_ID}',
        };
    }

    if (!definition.provider.environment.KMS_KEY_ARN) {
        definition.provider.environment.KMS_KEY_ARN =
            discoveredResources.defaultKmsKeyId || '${env:AWS_DISCOVERY_KMS_KEY_ID}';
    }
};

const healVpcConfiguration = (discoveredResources, AppDefinition) => {
    const healingReport = {
        healed: [],
        warnings: [],
        errors: [],
        recommendations: [],
        criticalActions: [],
    };

    if (!AppDefinition.vpc?.selfHeal) {
        return healingReport;
    }

    console.log('🔧 Self-healing mode enabled - checking for VPC misconfigurations...');

    if (discoveredResources.natGatewayInPrivateSubnet) {
        healingReport.warnings.push(
            `NAT Gateway ${discoveredResources.natGatewayInPrivateSubnet} is in a private subnet`
        );
        healingReport.recommendations.push(
            'NAT Gateway should be recreated in a public subnet for proper internet connectivity'
        );
        discoveredResources.needsNewNatGateway = true;
        healingReport.healed.push('Marked NAT Gateway for recreation in public subnet');
    }

    if (discoveredResources.elasticIpAlreadyAssociated) {
        healingReport.warnings.push(
            `Elastic IP ${discoveredResources.existingElasticIp} is already associated`
        );

        if (discoveredResources.existingNatGatewayId) {
            healingReport.healed.push('Will reuse existing NAT Gateway instead of creating a new one');
            discoveredResources.reuseExistingNatGateway = true;
        } else {
            healingReport.healed.push('Will allocate a new Elastic IP for NAT Gateway');
            discoveredResources.allocateNewElasticIp = true;
        }
    }

    if (
        discoveredResources.privateSubnetsWithWrongRoutes &&
        discoveredResources.privateSubnetsWithWrongRoutes.length > 0
    ) {
        healingReport.warnings.push(
            `Found ${discoveredResources.privateSubnetsWithWrongRoutes.length} subnets that are PUBLIC but will be used for Lambda`
        );
        healingReport.healed.push(
            'Route tables will be corrected during deployment - converting public subnets to private'
        );
        healingReport.criticalActions.push(
            'SUBNET ISOLATION: Will create separate route tables to ensure Lambda subnets are private'
        );
    }

    if (discoveredResources.subnetConversionRequired) {
        healingReport.warnings.push(
            'Subnet configuration mismatch detected - Lambda functions require private subnets'
        );
        healingReport.healed.push('Will create proper route table configuration for subnet isolation');
    }

    if (discoveredResources.orphanedElasticIps?.length > 0) {
        healingReport.warnings.push(
            `Found ${discoveredResources.orphanedElasticIps.length} orphaned Elastic IPs`
        );
        healingReport.recommendations.push('Consider releasing orphaned Elastic IPs to avoid charges');
    }

    if (healingReport.criticalActions.length > 0) {
        console.log('🚨 CRITICAL ACTIONS:');
        healingReport.criticalActions.forEach((action) => console.log(`   - ${action}`));
    }

    if (healingReport.healed.length > 0) {
        console.log('✅ Self-healing actions:');
        healingReport.healed.forEach((action) => console.log(`   - ${action}`));
    }

    if (healingReport.warnings.length > 0) {
        console.log('⚠️  Issues detected:');
        healingReport.warnings.forEach((warning) => console.log(`   - ${warning}`));
    }

    if (healingReport.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        healingReport.recommendations.forEach((rec) => console.log(`   - ${rec}`));
    }

    return healingReport;
};

const configureVpc = (definition, AppDefinition, discoveredResources) => {
    if (AppDefinition.vpc?.enable !== true) {
        return;
    }

    // Skip VPC configuration for local development when AWS discovery is disabled
    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
        console.log('⚙️  Skipping VPC configuration for local development (FRIGG_SKIP_AWS_DISCOVERY is set)');
        return;
    }

    definition.provider.iamRoleStatements.push({
        Effect: 'Allow',
        Action: [
            'ec2:CreateNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DeleteNetworkInterface',
            'ec2:AttachNetworkInterface',
            'ec2:DetachNetworkInterface',
        ],
        Resource: '*',
    });

    if (Object.keys(discoveredResources).length > 0) {
        const healingReport = healVpcConfiguration(discoveredResources, AppDefinition);
        if (healingReport.errors.length > 0 && !AppDefinition.vpc?.selfHeal) {
            throw new Error(`VPC configuration errors detected: ${healingReport.errors.join(', ')}`);
        }
    }

    const vpcManagement = AppDefinition.vpc.management || 'discover';
    let vpcId = null;
    const vpcConfig = {
        securityGroupIds: [],
        subnetIds: [],
    };

    console.log(`VPC Management Mode: ${vpcManagement}`);

    if (vpcManagement === 'create-new') {
        const vpcResources = createVPCInfrastructure(AppDefinition);
        Object.assign(definition.resources.Resources, vpcResources);
        vpcId = { Ref: 'FriggVPC' };
        vpcConfig.securityGroupIds = AppDefinition.vpc.securityGroupIds || [{ Ref: 'FriggLambdaSecurityGroup' }];
    } else if (vpcManagement === 'use-existing') {
        if (!AppDefinition.vpc.vpcId) {
            throw new Error('VPC management is set to "use-existing" but no vpcId was provided');
        }
        vpcId = AppDefinition.vpc.vpcId;
        vpcConfig.securityGroupIds =
            AppDefinition.vpc.securityGroupIds ||
            (discoveredResources.defaultSecurityGroupId ? [discoveredResources.defaultSecurityGroupId] : []);
    } else {
        if (!discoveredResources.defaultVpcId) {
            throw new Error(
                'VPC discovery failed: No VPC found. Either set vpc.management to "create-new" or provide vpc.vpcId with "use-existing".'
            );
        }
        vpcId = discoveredResources.defaultVpcId;
        vpcConfig.securityGroupIds =
            AppDefinition.vpc.securityGroupIds ||
            (discoveredResources.defaultSecurityGroupId ? [discoveredResources.defaultSecurityGroupId] : []);
    }

    const defaultSubnetManagement = vpcManagement === 'create-new' ? 'create' : 'discover';
    let subnetManagement = AppDefinition.vpc.subnets?.management || defaultSubnetManagement;
    console.log(`Subnet Management Mode: ${subnetManagement}`);

    const effectiveVpcId = vpcId || discoveredResources.defaultVpcId;
    if (!effectiveVpcId) {
        throw new Error('Cannot manage subnets without a VPC ID');
    }

    if (subnetManagement === 'create') {
        console.log('Creating new subnets...');
        const subnetVpcId = vpcManagement === 'create-new' ? { Ref: 'FriggVPC' } : effectiveVpcId;
        let subnet1Cidr;
        let subnet2Cidr;
        let publicSubnetCidr;

        if (vpcManagement === 'create-new') {
            const generatedCidrs = { 'Fn::Cidr': ['10.0.0.0/16', 3, 8] };
            subnet1Cidr = { 'Fn::Select': [0, generatedCidrs] };
            subnet2Cidr = { 'Fn::Select': [1, generatedCidrs] };
            publicSubnetCidr = { 'Fn::Select': [2, generatedCidrs] };
        } else {
            subnet1Cidr = '172.31.240.0/24';
            subnet2Cidr = '172.31.241.0/24';
            publicSubnetCidr = '172.31.250.0/24';
        }

        definition.resources.Resources.FriggPrivateSubnet1 = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: subnet1Cidr,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-1' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        definition.resources.Resources.FriggPrivateSubnet2 = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: subnet2Cidr,
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-2' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        definition.resources.Resources.FriggPublicSubnet = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: publicSubnetCidr,
                MapPublicIpOnLaunch: true,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public' },
                    { Key: 'Type', Value: 'Public' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        vpcConfig.subnetIds = [{ Ref: 'FriggPrivateSubnet1' }, { Ref: 'FriggPrivateSubnet2' }];

        if (!AppDefinition.vpc.natGateway || AppDefinition.vpc.natGateway.management === 'discover') {
            if (vpcManagement === 'create-new' || !discoveredResources.internetGatewayId) {
                if (!definition.resources.Resources.FriggInternetGateway) {
                    definition.resources.Resources.FriggInternetGateway = {
                        Type: 'AWS::EC2::InternetGateway',
                        Properties: {
                            Tags: [
                                { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' },
                                { Key: 'ManagedBy', Value: 'Frigg' },
                            ],
                        },
                    };

                    definition.resources.Resources.FriggIGWAttachment = {
                        Type: 'AWS::EC2::VPCGatewayAttachment',
                        Properties: {
                            VpcId: subnetVpcId,
                            InternetGatewayId: { Ref: 'FriggInternetGateway' },
                        },
                    };
                }
            }

            definition.resources.Resources.FriggPublicRouteTable = {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: subnetVpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };

            definition.resources.Resources.FriggPublicRoute = {
                Type: 'AWS::EC2::Route',
                DependsOn: vpcManagement === 'create-new' ? 'FriggIGWAttachment' : undefined,
                Properties: {
                    RouteTableId: { Ref: 'FriggPublicRouteTable' },
                    DestinationCidrBlock: '0.0.0.0/0',
                    GatewayId: discoveredResources.internetGatewayId || { Ref: 'FriggInternetGateway' },
                },
            };

            definition.resources.Resources.FriggPublicSubnetRouteTableAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: { Ref: 'FriggPublicSubnet' },
                    RouteTableId: { Ref: 'FriggPublicRouteTable' },
                },
            };

            definition.resources.Resources.FriggLambdaRouteTable = {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: subnetVpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };

            definition.resources.Resources.FriggPrivateSubnet1RouteTableAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: { Ref: 'FriggPrivateSubnet1' },
                    RouteTableId: { Ref: 'FriggLambdaRouteTable' },
                },
            };

            definition.resources.Resources.FriggPrivateSubnet2RouteTableAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: { Ref: 'FriggPrivateSubnet2' },
                    RouteTableId: { Ref: 'FriggLambdaRouteTable' },
                },
            };
        }
    } else if (subnetManagement === 'use-existing') {
        if (!AppDefinition.vpc.subnets?.ids || AppDefinition.vpc.subnets.ids.length < 2) {
            throw new Error(
                'Subnet management is "use-existing" but less than 2 subnet IDs provided. Provide at least 2 subnet IDs in vpc.subnets.ids.'
            );
        }
        vpcConfig.subnetIds = AppDefinition.vpc.subnets.ids;
    } else {
        vpcConfig.subnetIds =
            AppDefinition.vpc.subnets?.ids?.length > 0
                ? AppDefinition.vpc.subnets.ids
                : discoveredResources.privateSubnetId1 && discoveredResources.privateSubnetId2
                ? [discoveredResources.privateSubnetId1, discoveredResources.privateSubnetId2]
                : [];

        if (vpcConfig.subnetIds.length < 2) {
            if (AppDefinition.vpc.selfHeal) {
                console.log('No subnets found but self-heal enabled - creating minimal subnet setup');
                subnetManagement = 'create';
                discoveredResources.createSubnets = true;
            } else {
                throw new Error(
                    'No subnets discovered and subnets.management is "discover". Either enable vpc.selfHeal, set subnets.management to "create", or provide subnet IDs.'
                );
            }
        }
    }

    if (subnetManagement === 'create' && discoveredResources.createSubnets) {
        definition.resources.Resources.FriggLambdaRouteTable =
            definition.resources.Resources.FriggLambdaRouteTable || {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: effectiveVpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Environment', Value: '${self:provider.stage}' },
                        { Key: 'Service', Value: '${self:service}' },
                    ],
                },
            };
    }

    if (
        vpcConfig.subnetIds.length >= 2 &&
        vpcConfig.securityGroupIds.length > 0
    ) {
        definition.provider.vpc = vpcConfig;

        const natGatewayManagement = AppDefinition.vpc.natGateway?.management || 'discover';
        let needsNewNatGateway =
            natGatewayManagement === 'createAndManage' ||
            discoveredResources.needsNewNatGateway === true;

        console.log('needsNewNatGateway', needsNewNatGateway);

        let reuseExistingNatGateway = false;
        let useExistingEip = false;

        if (needsNewNatGateway) {
            console.log('Create mode: Creating dedicated EIP, public subnet, and NAT Gateway...');

            if (
                discoveredResources.existingNatGatewayId &&
                discoveredResources.existingElasticIpAllocationId
            ) {
                console.log('Found existing Frigg-managed NAT Gateway and EIP');
                if (!discoveredResources.natGatewayInPrivateSubnet) {
                    console.log('✅ Existing NAT Gateway is in PUBLIC subnet, will reuse it');
                    reuseExistingNatGateway = true;
                } else {
                    console.log('❌ NAT Gateway is in PRIVATE subnet - MUST create new one in PUBLIC subnet');
                    if (AppDefinition.vpc.selfHeal) {
                        console.log('Self-heal enabled: Creating new NAT Gateway in PUBLIC subnet');
                        reuseExistingNatGateway = false;
                        useExistingEip = false;
                        discoveredResources.needsCleanup = true;
                    } else {
                        throw new Error(
                            'CRITICAL: NAT Gateway is in PRIVATE subnet (will not work!). Enable vpc.selfHeal to auto-fix or set natGateway.management to "createAndManage".'
                        );
                    }
                }
            } else if (
                discoveredResources.existingElasticIpAllocationId &&
                !discoveredResources.existingNatGatewayId
            ) {
                console.log('Found orphaned EIP, will reuse it for new NAT Gateway in PUBLIC subnet');
                useExistingEip = true;
            }

            if (reuseExistingNatGateway) {
                console.log('Reusing existing NAT Gateway - skipping resource creation');
            } else {
                if (!useExistingEip) {
                    definition.resources.Resources.FriggNATGatewayEIP = {
                        Type: 'AWS::EC2::EIP',
                        DeletionPolicy: 'Retain',
                        UpdateReplacePolicy: 'Retain',
                        Properties: {
                            Domain: 'vpc',
                            Tags: [
                                { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' },
                                { Key: 'ManagedBy', Value: 'Frigg' },
                                { Key: 'Service', Value: '${self:service}' },
                                { Key: 'Stage', Value: '${self:provider.stage}' },
                            ],
                        },
                    };
                }

                if (!discoveredResources.publicSubnetId) {
                    if (discoveredResources.internetGatewayId) {
                        console.log('Reusing existing Internet Gateway for NAT Gateway');
                    } else {
                        definition.resources.Resources.FriggInternetGateway =
                            definition.resources.Resources.FriggInternetGateway || {
                                Type: 'AWS::EC2::InternetGateway',
                                Properties: {
                                    Tags: [
                                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' },
                                        { Key: 'ManagedBy', Value: 'Frigg' },
                                    ],
                                },
                            };

                        definition.resources.Resources.FriggIGWAttachment =
                            definition.resources.Resources.FriggIGWAttachment || {
                                Type: 'AWS::EC2::VPCGatewayAttachment',
                                Properties: {
                                    VpcId: discoveredResources.defaultVpcId,
                                    InternetGatewayId: { Ref: 'FriggInternetGateway' },
                                },
                            };
                    }

                    definition.resources.Resources.FriggPublicSubnet = {
                        Type: 'AWS::EC2::Subnet',
                        Properties: {
                            VpcId: discoveredResources.defaultVpcId,
                            CidrBlock:
                                AppDefinition.vpc.natGateway?.publicSubnetCidr || '172.31.250.0/24',
                            AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                            MapPublicIpOnLaunch: true,
                            Tags: [
                                { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-subnet' },
                                { Key: 'Type', Value: 'Public' },
                            ],
                        },
                    };

                    definition.resources.Resources.FriggPublicRouteTable = {
                        Type: 'AWS::EC2::RouteTable',
                        Properties: {
                            VpcId: discoveredResources.defaultVpcId,
                            Tags: [
                                { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-rt' },
                            ],
                        },
                    };

                    definition.resources.Resources.FriggPublicRoute = {
                        Type: 'AWS::EC2::Route',
                        DependsOn: discoveredResources.internetGatewayId ? [] : 'FriggIGWAttachment',
                        Properties: {
                            RouteTableId: { Ref: 'FriggPublicRouteTable' },
                            DestinationCidrBlock: '0.0.0.0/0',
                            GatewayId: discoveredResources.internetGatewayId || { Ref: 'FriggInternetGateway' },
                        },
                    };

                    definition.resources.Resources.FriggPublicSubnetRouteTableAssociation = {
                        Type: 'AWS::EC2::SubnetRouteTableAssociation',
                        Properties: {
                            SubnetId: { Ref: 'FriggPublicSubnet' },
                            RouteTableId: { Ref: 'FriggPublicRouteTable' },
                        },
                    };
                }

                definition.resources.Resources.FriggNATGateway = {
                    Type: 'AWS::EC2::NatGateway',
                    DeletionPolicy: 'Retain',
                    UpdateReplacePolicy: 'Retain',
                    Properties: {
                        AllocationId: useExistingEip
                            ? discoveredResources.existingElasticIpAllocationId
                            : { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                        SubnetId:
                            discoveredResources.publicSubnetId || { Ref: 'FriggPublicSubnet' },
                        Tags: [
                            { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-gateway' },
                            { Key: 'ManagedBy', Value: 'Frigg' },
                            { Key: 'Service', Value: '${self:service}' },
                            { Key: 'Stage', Value: '${self:provider.stage}' },
                        ],
                    },
                };
            }
        } else if (
            natGatewayManagement === 'discover' ||
            natGatewayManagement === 'useExisting'
        ) {
            if (natGatewayManagement === 'useExisting' && AppDefinition.vpc.natGateway?.id) {
                console.log(`Using explicitly provided NAT Gateway: ${AppDefinition.vpc.natGateway.id}`);
                discoveredResources.existingNatGatewayId = AppDefinition.vpc.natGateway.id;
            }

            if (discoveredResources.existingNatGatewayId) {
                console.log(
                    'discoveredResources.existingNatGatewayId',
                    discoveredResources.existingNatGatewayId
                );

                if (discoveredResources.natGatewayInPrivateSubnet) {
                    console.log('❌ CRITICAL: NAT Gateway is in PRIVATE subnet - Internet connectivity will NOT work!');

                    if (AppDefinition.vpc.selfHeal === true) {
                        console.log('Self-heal enabled: Will create new NAT Gateway in PUBLIC subnet');
                        needsNewNatGateway = true;
                        discoveredResources.existingNatGatewayId = null;
                        if (!discoveredResources.publicSubnetId) {
                            console.log('No public subnet found - will create one for NAT Gateway');
                            discoveredResources.createPublicSubnet = true;
                        }
                    } else {
                        throw new Error(
                            'CRITICAL: NAT Gateway is in PRIVATE subnet and will NOT provide internet connectivity! Options: 1) Enable vpc.selfHeal to auto-create proper NAT, 2) Set natGateway.management to "createAndManage", or 3) Manually fix the NAT Gateway placement.'
                        );
                    }
                } else {
                    console.log(`Using discovered NAT Gateway for routing: ${discoveredResources.existingNatGatewayId}`);
                }
            } else if (!needsNewNatGateway && AppDefinition.vpc.natGateway?.id) {
                console.log(`Using explicitly provided NAT Gateway: ${AppDefinition.vpc.natGateway.id}`);
                discoveredResources.existingNatGatewayId = AppDefinition.vpc.natGateway.id;
            }
        }

        definition.resources.Resources.FriggLambdaRouteTable =
            definition.resources.Resources.FriggLambdaRouteTable || {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: discoveredResources.defaultVpcId || vpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Environment', Value: '${self:provider.stage}' },
                        { Key: 'Service', Value: '${self:service}' },
                    ],
                },
            };

        const routeTableId = { Ref: 'FriggLambdaRouteTable' };
        let natGatewayIdForRoute;

        if (reuseExistingNatGateway) {
            natGatewayIdForRoute = discoveredResources.existingNatGatewayId;
            console.log(`Using discovered NAT Gateway for routing: ${natGatewayIdForRoute}`);
        } else if (needsNewNatGateway && !reuseExistingNatGateway) {
            natGatewayIdForRoute = { Ref: 'FriggNATGateway' };
            console.log('Using newly created NAT Gateway for routing');
        } else if (discoveredResources.existingNatGatewayId) {
            natGatewayIdForRoute = discoveredResources.existingNatGatewayId;
            console.log(`Using discovered NAT Gateway for routing: ${natGatewayIdForRoute}`);
        } else if (AppDefinition.vpc.natGateway?.id) {
            natGatewayIdForRoute = AppDefinition.vpc.natGateway.id;
            console.log(`Using explicitly provided NAT Gateway for routing: ${natGatewayIdForRoute}`);
        } else if (AppDefinition.vpc.selfHeal === true) {
            natGatewayIdForRoute = null;
            console.log('No NAT Gateway available - skipping NAT route creation');
        } else {
            throw new Error('No existing NAT Gateway found in discovery mode');
        }

        if (natGatewayIdForRoute) {
            console.log(`Configuring NAT route: 0.0.0.0/0 → ${natGatewayIdForRoute}`);
            definition.resources.Resources.FriggNATRoute = {
                Type: 'AWS::EC2::Route',
                DependsOn: 'FriggLambdaRouteTable',
                Properties: {
                    RouteTableId: routeTableId,
                    DestinationCidrBlock: '0.0.0.0/0',
                    NatGatewayId: natGatewayIdForRoute,
                },
            };
        } else {
            console.warn('⚠️  No NAT Gateway configured - Lambda functions will not have internet access');
        }

        if (typeof vpcConfig.subnetIds[0] === 'string') {
            definition.resources.Resources.FriggSubnet1RouteAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: vpcConfig.subnetIds[0],
                    RouteTableId: routeTableId,
                },
                DependsOn: 'FriggLambdaRouteTable',
            };
        }

        if (typeof vpcConfig.subnetIds[1] === 'string') {
            definition.resources.Resources.FriggSubnet2RouteAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: vpcConfig.subnetIds[1],
                    RouteTableId: routeTableId,
                },
                DependsOn: 'FriggLambdaRouteTable',
            };
        }

        if (typeof vpcConfig.subnetIds[0] === 'object' && vpcConfig.subnetIds[0].Ref) {
            definition.resources.Resources.FriggNewSubnet1RouteAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: vpcConfig.subnetIds[0],
                    RouteTableId: routeTableId,
                },
                DependsOn: ['FriggLambdaRouteTable', vpcConfig.subnetIds[0].Ref],
            };
        }

        if (typeof vpcConfig.subnetIds[1] === 'object' && vpcConfig.subnetIds[1].Ref) {
            definition.resources.Resources.FriggNewSubnet2RouteAssociation = {
                Type: 'AWS::EC2::SubnetRouteTableAssociation',
                Properties: {
                    SubnetId: vpcConfig.subnetIds[1],
                    RouteTableId: routeTableId,
                },
                DependsOn: ['FriggLambdaRouteTable', vpcConfig.subnetIds[1].Ref],
            };
        }

        if (AppDefinition.vpc.enableVPCEndpoints !== false) {
            definition.resources.Resources.VPCEndpointS3 = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: discoveredResources.defaultVpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [routeTableId],
                },
            };

            definition.resources.Resources.VPCEndpointDynamoDB = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: discoveredResources.defaultVpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [routeTableId],
                },
            };
        }

        if (AppDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') {
            if (!discoveredResources.vpcCidr) {
                console.warn(
                    '⚠️  Warning: VPC CIDR not discovered. VPC endpoint security group may not work correctly.'
                );
            }

            if (!definition.resources.Resources.VPCEndpointSecurityGroup) {
                const vpcEndpointIngressRules = [];

                if (vpcConfig.securityGroupIds && vpcConfig.securityGroupIds.length > 0) {
                    for (const sg of vpcConfig.securityGroupIds) {
                        if (typeof sg === 'string') {
                            vpcEndpointIngressRules.push({
                                IpProtocol: 'tcp',
                                FromPort: 443,
                                ToPort: 443,
                                SourceSecurityGroupId: sg,
                                Description: 'HTTPS from Lambda security group',
                            });
                        } else if (sg.Ref) {
                            vpcEndpointIngressRules.push({
                                IpProtocol: 'tcp',
                                FromPort: 443,
                                ToPort: 443,
                                SourceSecurityGroupId: { Ref: sg.Ref },
                                Description: 'HTTPS from Lambda security group',
                            });
                        }
                    }
                }

                if (vpcEndpointIngressRules.length === 0) {
                    if (discoveredResources.vpcCidr) {
                        vpcEndpointIngressRules.push({
                            IpProtocol: 'tcp',
                            FromPort: 443,
                            ToPort: 443,
                            CidrIp: discoveredResources.vpcCidr,
                            Description: 'HTTPS from VPC CIDR (fallback)',
                        });
                    } else {
                        console.warn(
                            '⚠️  WARNING: No Lambda security group or VPC CIDR found. Using default private IP ranges.'
                        );
                        vpcEndpointIngressRules.push({
                            IpProtocol: 'tcp',
                            FromPort: 443,
                            ToPort: 443,
                            CidrIp: '172.31.0.0/16',
                            Description: 'HTTPS from default VPC range',
                        });
                    }
                }

                definition.resources.Resources.VPCEndpointSecurityGroup = {
                    Type: 'AWS::EC2::SecurityGroup',
                    Properties: {
                        GroupDescription: 'Security group for VPC endpoints - allows HTTPS from Lambda functions',
                        VpcId: discoveredResources.defaultVpcId,
                        SecurityGroupIngress: vpcEndpointIngressRules,
                        Tags: [
                            { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc-endpoints-sg' },
                            { Key: 'ManagedBy', Value: 'Frigg' },
                            { Key: 'Purpose', Value: 'Allow Lambda functions to access VPC endpoints' },
                        ],
                    },
                };
            }

            definition.resources.Resources.VPCEndpointKMS = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: discoveredResources.defaultVpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.kms',
                    VpcEndpointType: 'Interface',
                    SubnetIds: vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'VPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };

            if (AppDefinition.secretsManager?.enable === true) {
                definition.resources.Resources.VPCEndpointSecretsManager = {
                    Type: 'AWS::EC2::VPCEndpoint',
                    Properties: {
                        VpcId: discoveredResources.defaultVpcId,
                        ServiceName: 'com.amazonaws.${self:provider.region}.secretsmanager',
                        VpcEndpointType: 'Interface',
                        SubnetIds: vpcConfig.subnetIds,
                        SecurityGroupIds: [{ Ref: 'VPCEndpointSecurityGroup' }],
                        PrivateDnsEnabled: true,
                    },
                };
            }
        }
    }
};

const configureSsm = (definition, AppDefinition) => {
    if (AppDefinition.ssm?.enable !== true) {
        return;
    }

    definition.provider.layers = [
        'arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11',
    ];

    definition.provider.iamRoleStatements.push({
        Effect: 'Allow',
        Action: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        Resource: ['arn:aws:ssm:${self:provider.region}:*:parameter/${self:service}/${self:provider.stage}/*'],
    });

    definition.provider.environment.SSM_PARAMETER_PREFIX = '/${self:service}/${self:provider.stage}';
};

const attachIntegrations = (definition, AppDefinition) => {
    if (!Array.isArray(AppDefinition.integrations) || AppDefinition.integrations.length === 0) {
        return;
    }

    console.log(`Processing ${AppDefinition.integrations.length} integrations...`);

    for (const integration of AppDefinition.integrations) {
        if (!integration?.Definition?.name) {
            throw new Error('Invalid integration: missing Definition or name');
        }

        const integrationName = integration.Definition.name;
        const queueReference = `${integrationName.charAt(0).toUpperCase() + integrationName.slice(1)}Queue`;
        const queueName = `\${self:service}--\${self:provider.stage}-${queueReference}`;

        definition.functions[integrationName] = {
            handler: `node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.${integrationName}.handler`,
            events: [
                {
                    httpApi: {
                        path: `/api/${integrationName}-integration/{proxy+}`,
                        method: 'ANY',
                    },
                },
            ],
        };

        definition.resources.Resources[queueReference] = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: `\${self:custom.${queueReference}}`,
                MessageRetentionPeriod: 60,
                VisibilityTimeout: 1800,
                RedrivePolicy: {
                    maxReceiveCount: 1,
                    deadLetterTargetArn: { 'Fn::GetAtt': ['InternalErrorQueue', 'Arn'] },
                },
            },
        };

        const queueWorkerName = `${integrationName}QueueWorker`;
        definition.functions[queueWorkerName] = {
            handler: `node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
            reservedConcurrency: 5,
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': [queueReference, 'Arn'] },
                        batchSize: 1,
                    },
                },
            ],
            timeout: 600,
        };

        definition.provider.environment = {
            ...definition.provider.environment,
            [`${integrationName.toUpperCase()}_QUEUE_URL`]: { Ref: queueReference },
        };

        definition.custom[queueReference] = queueName;
    }
};

const configureWebsockets = (definition, AppDefinition) => {
    if (AppDefinition.websockets?.enable !== true) {
        return;
    }

    definition.functions.defaultWebsocket = {
        handler: 'node_modules/@friggframework/core/handlers/routers/websocket.handler',
        events: [
            { websocket: { route: '$connect' } },
            { websocket: { route: '$default' } },
            { websocket: { route: '$disconnect' } },
        ],
    };
};

const composeServerlessDefinition = async (AppDefinition) => {
    console.log('composeServerlessDefinition', AppDefinition);

    const discoveredResources = await gatherDiscoveredResources(AppDefinition);
    const appEnvironmentVars = getAppEnvironmentVars(AppDefinition);
    const definition = createBaseDefinition(AppDefinition, appEnvironmentVars, discoveredResources);

    applyKmsConfiguration(definition, AppDefinition, discoveredResources);
    configureVpc(definition, AppDefinition, discoveredResources);
    configureSsm(definition, AppDefinition);
    attachIntegrations(definition, AppDefinition);
    configureWebsockets(definition, AppDefinition);

    definition.functions = modifyHandlerPaths(definition.functions);

    return definition;
};

module.exports = { composeServerlessDefinition };
