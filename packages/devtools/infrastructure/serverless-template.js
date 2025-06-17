const path = require('path');
const fs = require('fs');
const { AWSDiscovery } = require('./aws-discovery');

/**
 * Check if AWS discovery should run based on AppDefinition
 * @param {Object} AppDefinition - Application definition
 * @returns {boolean} True if discovery should run
 */
const shouldRunDiscovery = (AppDefinition) => {
    return AppDefinition.vpc?.enable === true ||
        AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true ||
        AppDefinition.ssm?.enable === true;
};

/**
 * Find the actual path to node_modules directory
 * Tries multiple methods to locate node_modules:
 * 1. Traversing up from current directory
 * 2. Using npm root command
 * 3. Looking for package.json and adjacent node_modules
 * @returns {string} Path to node_modules directory
 */
const findNodeModulesPath = () => {
    try {
        // Method 1: Try to find node_modules by traversing up from current directory
        let currentDir = process.cwd();
        let nodeModulesPath = null;

        // Traverse up to 5 levels to find node_modules
        for (let i = 0; i < 5; i++) {
            const potentialPath = path.join(currentDir, 'node_modules');
            if (fs.existsSync(potentialPath)) {
                nodeModulesPath = potentialPath;
                console.log(`Found node_modules at: ${nodeModulesPath} (method 1)`);
                break;
            }
            // Move up one directory
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // We've reached the root
                break;
            }
            currentDir = parentDir;
        }

        // Method 2: If method 1 fails, try using npm root command
        if (!nodeModulesPath) {
            try {
                // This requires child_process, so let's require it here
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

        // Method 3: If all else fails, check for a package.json and assume node_modules is adjacent
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
                // Move up one directory
                const parentDir = path.dirname(currentDir);
                if (parentDir === currentDir) {
                    // We've reached the root
                    break;
                }
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

/**
 * Modify handler paths to point to the correct node_modules location
 * Only modifies paths when running in offline mode
 * @param {Object} functions - Serverless functions configuration object
 * @returns {Object} Modified functions object with updated handler paths
 */
const modifyHandlerPaths = (functions) => {
    // Check if we're running in offline mode
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
            // Replace node_modules/ with the actual path to node_modules/
            const relativePath = path.relative(process.cwd(), nodeModulesPath);
            functionDef.handler = functionDef.handler.replace('node_modules/', `${relativePath}/`);
            console.log(`Updated handler for ${functionName}: ${functionDef.handler}`);
        }
    }

    return modifiedFunctions;
};

/**
 * Create VPC infrastructure resources for CloudFormation
 * Creates VPC, subnets, NAT gateway, route tables, and security groups
 * @param {Object} AppDefinition - Application definition object
 * @param {Object} AppDefinition.vpc - VPC configuration
 * @param {string} [AppDefinition.vpc.cidrBlock='10.0.0.0/16'] - CIDR block for VPC
 * @returns {Object} CloudFormation resources for VPC infrastructure
 */
const createVPCInfrastructure = (AppDefinition) => {
    const vpcResources = {
        // VPC
        FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
                CidrBlock: AppDefinition.vpc.cidrBlock || '10.0.0.0/16',
                EnableDnsHostnames: true,
                EnableDnsSupport: true,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc' }
                ]
            }
        },

        // Internet Gateway
        FriggInternetGateway: {
            Type: 'AWS::EC2::InternetGateway',
            Properties: {
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' }
                ]
            }
        },

        // Attach Internet Gateway to VPC
        FriggVPCGatewayAttachment: {
            Type: 'AWS::EC2::VPCGatewayAttachment',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                InternetGatewayId: { Ref: 'FriggInternetGateway' }
            }
        },

        // Public Subnet for NAT Gateway
        FriggPublicSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.1.0/24',
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                MapPublicIpOnLaunch: true,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-subnet' }
                ]
            }
        },

        // Private Subnet 1 for Lambda
        FriggPrivateSubnet1: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.2.0/24',
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-subnet-1' }
                ]
            }
        },

        // Private Subnet 2 for Lambda (different AZ for redundancy)
        FriggPrivateSubnet2: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                CidrBlock: '10.0.3.0/24',
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-subnet-2' }
                ]
            }
        },

        // Elastic IP for NAT Gateway
        FriggNATGatewayEIP: {
            Type: 'AWS::EC2::EIP',
            Properties: {
                Domain: 'vpc',
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' }
                ]
            },
            DependsOn: 'FriggVPCGatewayAttachment'
        },

        // NAT Gateway for private subnet internet access
        FriggNATGateway: {
            Type: 'AWS::EC2::NatGateway',
            Properties: {
                AllocationId: { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                SubnetId: { Ref: 'FriggPublicSubnet' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-gateway' }
                ]
            }
        },

        // Public Route Table
        FriggPublicRouteTable: {
            Type: 'AWS::EC2::RouteTable',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-rt' }
                ]
            }
        },

        // Public Route to Internet Gateway
        FriggPublicRoute: {
            Type: 'AWS::EC2::Route',
            Properties: {
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                GatewayId: { Ref: 'FriggInternetGateway' }
            },
            DependsOn: 'FriggVPCGatewayAttachment'
        },

        // Associate Public Subnet with Public Route Table
        FriggPublicSubnetRouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPublicSubnet' },
                RouteTableId: { Ref: 'FriggPublicRouteTable' }
            }
        },

        // Private Route Table
        FriggPrivateRouteTable: {
            Type: 'AWS::EC2::RouteTable',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-rt' }
                ]
            }
        },

        // Private Route to NAT Gateway
        FriggPrivateRoute: {
            Type: 'AWS::EC2::Route',
            Properties: {
                RouteTableId: { Ref: 'FriggPrivateRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                NatGatewayId: { Ref: 'FriggNATGateway' }
            }
        },

        // Associate Private Subnet 1 with Private Route Table
        FriggPrivateSubnet1RouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPrivateSubnet1' },
                RouteTableId: { Ref: 'FriggPrivateRouteTable' }
            }
        },

        // Associate Private Subnet 2 with Private Route Table
        FriggPrivateSubnet2RouteTableAssociation: {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPrivateSubnet2' },
                RouteTableId: { Ref: 'FriggPrivateRouteTable' }
            }
        },

        // Security Group for Lambda functions
        FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: { Ref: 'FriggVPC' },
                SecurityGroupEgress: [
                    {
                        IpProtocol: 'tcp',
                        FromPort: 443,
                        ToPort: 443,
                        CidrIp: '0.0.0.0/0',
                        Description: 'HTTPS outbound'
                    },
                    {
                        IpProtocol: 'tcp',
                        FromPort: 80,
                        ToPort: 80,
                        CidrIp: '0.0.0.0/0',
                        Description: 'HTTP outbound'
                    },
                    {
                        IpProtocol: 'tcp',
                        FromPort: 53,
                        ToPort: 53,
                        CidrIp: '0.0.0.0/0',
                        Description: 'DNS TCP'
                    },
                    {
                        IpProtocol: 'udp',
                        FromPort: 53,
                        ToPort: 53,
                        CidrIp: '0.0.0.0/0',
                        Description: 'DNS UDP'
                    }
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' }
                ]
            }
        }
    };

    // Add VPC Endpoints for cost optimization
    if (AppDefinition.vpc.enableVPCEndpoints !== false) {
        // S3 Gateway Endpoint (free)
        vpcResources.FriggS3VPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                VpcEndpointType: 'Gateway',
                RouteTableIds: [
                    { Ref: 'FriggPrivateRouteTable' }
                ]
            }
        };

        // DynamoDB Gateway Endpoint (free)
        vpcResources.FriggDynamoDBVPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                VpcEndpointType: 'Gateway',
                RouteTableIds: [
                    { Ref: 'FriggPrivateRouteTable' }
                ]
            }
        };

        // KMS Interface Endpoint (paid, but useful if using KMS)
        if (AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true) {
            vpcResources.FriggKMSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: { Ref: 'FriggVPC' },
                    ServiceName: 'com.amazonaws.${self:provider.region}.kms',
                    VpcEndpointType: 'Interface',
                    SubnetIds: [
                        { Ref: 'FriggPrivateSubnet1' },
                        { Ref: 'FriggPrivateSubnet2' }
                    ],
                    SecurityGroupIds: [
                        { Ref: 'FriggVPCEndpointSecurityGroup' }
                    ],
                    PrivateDnsEnabled: true
                }
            };
        }

        // Secrets Manager Interface Endpoint (paid, but useful for secrets)
        vpcResources.FriggSecretsManagerVPCEndpoint = {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                ServiceName: 'com.amazonaws.${self:provider.region}.secretsmanager',
                VpcEndpointType: 'Interface',
                SubnetIds: [
                    { Ref: 'FriggPrivateSubnet1' },
                    { Ref: 'FriggPrivateSubnet2' }
                ],
                SecurityGroupIds: [
                    { Ref: 'FriggVPCEndpointSecurityGroup' }
                ],
                PrivateDnsEnabled: true
            }
        };

        // Security Group for VPC Endpoints
        vpcResources.FriggVPCEndpointSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg VPC Endpoints',
                VpcId: { Ref: 'FriggVPC' },
                SecurityGroupIngress: [
                    {
                        IpProtocol: 'tcp',
                        FromPort: 443,
                        ToPort: 443,
                        SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                        Description: 'HTTPS from Lambda'
                    }
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc-endpoint-sg' }
                ]
            }
        };
    }

    return vpcResources;
};

/**
 * Compose a complete serverless framework configuration from app definition
 * @param {Object} AppDefinition - Application definition object
 * @param {string} [AppDefinition.name] - Application name
 * @param {string} [AppDefinition.provider='aws'] - Cloud provider
 * @param {Array} AppDefinition.integrations - Array of integration definitions
 * @param {Object} [AppDefinition.vpc] - VPC configuration
 * @param {Object} [AppDefinition.encryption] - KMS encryption configuration
 * @param {Object} [AppDefinition.ssm] - SSM parameter store configuration
 * @param {Object} [AppDefinition.websockets] - WebSocket configuration
 * @param {boolean} [AppDefinition.websockets.enable=false] - Enable WebSocket support for live update streaming
 * @returns {Object} Complete serverless framework configuration
 */
const composeServerlessDefinition = async (AppDefinition) => {
    // Store discovered resources
    let discoveredResources = {};

    // Run AWS discovery if needed
    if (shouldRunDiscovery(AppDefinition)) {
        console.log('🔍 Running AWS resource discovery for serverless template...');
        try {
            const region = process.env.AWS_REGION || 'us-east-1';
            const discovery = new AWSDiscovery(region);

            const config = {
                vpc: AppDefinition.vpc || {},
                encryption: AppDefinition.encryption || {},
                ssm: AppDefinition.ssm || {}
            };

            discoveredResources = await discovery.discoverResources(config);

            console.log('✅ AWS discovery completed successfully!');
            if (discoveredResources.defaultVpcId) {
                console.log(`   VPC: ${discoveredResources.defaultVpcId}`);
            }
            if (discoveredResources.privateSubnetId1 && discoveredResources.privateSubnetId2) {
                console.log(`   Subnets: ${discoveredResources.privateSubnetId1}, ${discoveredResources.privateSubnetId2}`);
            }
            if (discoveredResources.defaultSecurityGroupId) {
                console.log(`   Security Group: ${discoveredResources.defaultSecurityGroupId}`);
            }
            if (discoveredResources.defaultKmsKeyId) {
                console.log(`   KMS Key: ${discoveredResources.defaultKmsKeyId}`);
            }
        } catch (error) {
            console.error('❌ AWS discovery failed:', error.message);
            throw new Error(`AWS discovery failed: ${error.message}`);
        }
    }

    const definition = {
        frameworkVersion: '>=3.17.0',
        service: AppDefinition.name || 'create-frigg-app',
        package: {
            individually: true,
            exclude: ["!**/node_modules/aws-sdk/**", "!**/node_modules/@aws-sdk/**", "!package.json"],
        },
        useDotenv: true,
        provider: {
            name: AppDefinition.provider || 'aws',
            runtime: 'nodejs20.x',
            timeout: 30,
            region: process.env.AWS_REGION || 'us-east-1',
            stage: '${opt:stage}',
            environment: {
                STAGE: '${opt:stage, "dev"}',
                AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1,
                // Add discovered resources to environment if available
                ...(discoveredResources.defaultVpcId && { AWS_DISCOVERY_VPC_ID: discoveredResources.defaultVpcId }),
                ...(discoveredResources.defaultSecurityGroupId && { AWS_DISCOVERY_SECURITY_GROUP_ID: discoveredResources.defaultSecurityGroupId }),
                ...(discoveredResources.privateSubnetId1 && { AWS_DISCOVERY_SUBNET_ID_1: discoveredResources.privateSubnetId1 }),
                ...(discoveredResources.privateSubnetId2 && { AWS_DISCOVERY_SUBNET_ID_2: discoveredResources.privateSubnetId2 }),
                ...(discoveredResources.publicSubnetId && { AWS_DISCOVERY_PUBLIC_SUBNET_ID: discoveredResources.publicSubnetId }),
                ...(discoveredResources.defaultRouteTableId && { AWS_DISCOVERY_ROUTE_TABLE_ID: discoveredResources.defaultRouteTableId }),
                ...(discoveredResources.defaultKmsKeyId && { AWS_DISCOVERY_KMS_KEY_ID: discoveredResources.defaultKmsKeyId }),
            },
            iamRoleStatements: [
                {
                    Effect: 'Allow',
                    Action: ['sns:Publish'],
                    Resource: {
                        Ref: 'InternalErrorBridgeTopic',
                    },
                },
                {
                    Effect: 'Allow',
                    Action: [
                        'sqs:SendMessage',
                        'sqs:SendMessageBatch',
                        'sqs:GetQueueUrl',
                        'sqs:GetQueueAttributes'
                    ],
                    Resource: [
                        {
                            'Fn::GetAtt': ['InternalErrorQueue', 'Arn']
                        },
                        {
                            'Fn::Join': [
                                ':',
                                [
                                    'arn:aws:sqs:${self:provider.region}:*:${self:service}--${self:provider.stage}-*Queue'
                                ]
                            ]
                        }
                    ],
                }
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
            }
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
                region: process.env.AWS_REGION || 'us-east-1',
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
                    {
                        httpApi: {
                            path: '/api/integrations',
                            method: 'ANY',
                        },
                    },
                    {
                        httpApi: {
                            path: '/api/integrations/{proxy+}',
                            method: 'ANY',
                        },
                    },
                    {
                        httpApi: {
                            path: '/api/authorize',
                            method: 'ANY',
                        },
                    },
                ],
            },
            user: {
                handler: 'node_modules/@friggframework/core/handlers/routers/user.handler',
                events: [
                    {
                        httpApi: {
                            path: '/user/{proxy+}',
                            method: 'ANY',
                        },
                    },
                ],
            },
            health: {
                handler: 'node_modules/@friggframework/core/handlers/routers/health.handler',
                events: [
                    {
                        httpApi: {
                            path: '/health',
                            method: 'GET',
                        },
                    },
                    {
                        httpApi: {
                            path: '/health/{proxy+}',
                            method: 'GET',
                        },
                    },
                ],
            },
        },
        resources: {
            Resources: {
                InternalErrorQueue: {
                    Type: 'AWS::SQS::Queue',
                    Properties: {
                        QueueName:
                            '${self:service}-internal-error-queue-${self:provider.stage}',
                        MessageRetentionPeriod: 300,
                    },
                },
                InternalErrorBridgeTopic: {
                    Type: 'AWS::SNS::Topic',
                    Properties: {
                        Subscription: [
                            {
                                Protocol: 'sqs',
                                Endpoint: {
                                    'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                                },
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
                                    Principal: {
                                        Service: 'sns.amazonaws.com',
                                    },
                                    Resource: {
                                        'Fn::GetAtt': [
                                            'InternalErrorQueue',
                                            'Arn',
                                        ],
                                    },
                                    Action: [
                                        'SQS:SendMessage',
                                        'SQS:SendMessageBatch',
                                    ],
                                    Condition: {
                                        ArnEquals: {
                                            'aws:SourceArn': {
                                                Ref: 'InternalErrorBridgeTopic',
                                            },
                                        },
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
                            {
                                Name: 'ApiId',
                                Value: { Ref: 'HttpApi' },
                            },
                            {
                                Name: 'Stage',
                                Value: '${self:provider.stage}',
                            },
                        ],
                    },
                },
            },
        },
    };


    // KMS Configuration based on App Definition
    if (AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true) {
        // Provision a dedicated KMS key and wire it automatically
        definition.resources.Resources.FriggKMSKey = {
            Type: 'AWS::KMS::Key',
            Properties: {
                EnableKeyRotation: true,
                KeyPolicy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'AllowRootAccountAdmin',
                            Effect: 'Allow',
                            Principal: { AWS: { 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root' } },
                            Action: 'kms:*',
                            Resource: '*'
                        }
                    ]
                }
            }
        };

        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
            Resource: [{ 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] }]
        });

        definition.provider.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };

        definition.plugins.push('serverless-kms-grants');

        // Configure KMS grants with discovered default key
        definition.custom.kmsGrants = {
            kmsKeyId: discoveredResources.defaultKmsKeyId || '${env:AWS_DISCOVERY_KMS_KEY_ID}'
        };
    }

    // VPC Configuration based on App Definition
    if (AppDefinition.vpc?.enable === true) {
        // Add VPC-related IAM permissions
        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: [
                'ec2:CreateNetworkInterface',
                'ec2:DescribeNetworkInterfaces',
                'ec2:DeleteNetworkInterface',
                'ec2:AttachNetworkInterface',
                'ec2:DetachNetworkInterface'
            ],
            Resource: '*'
        });

        // Default approach: Use AWS Discovery to find existing VPC resources
        if (AppDefinition.vpc.createNew === true) {
            // Option 1: Create new VPC infrastructure (explicit opt-in)
            const vpcConfig = {};

            if (AppDefinition.vpc.securityGroupIds) {
                // User provided custom security groups
                vpcConfig.securityGroupIds = AppDefinition.vpc.securityGroupIds;
            } else {
                // Use auto-created security group
                vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];
            }

            if (AppDefinition.vpc.subnetIds) {
                // User provided custom subnets
                vpcConfig.subnetIds = AppDefinition.vpc.subnetIds;
            } else {
                // Use auto-created private subnets
                vpcConfig.subnetIds = [
                    { Ref: 'FriggPrivateSubnet1' },
                    { Ref: 'FriggPrivateSubnet2' }
                ];
            }

            // Set VPC config for Lambda functions
            definition.provider.vpc = vpcConfig;

            // Add VPC infrastructure resources to CloudFormation
            const vpcResources = createVPCInfrastructure(AppDefinition);
            Object.assign(definition.resources.Resources, vpcResources);
        } else {
            // Option 2: Use AWS Discovery (default behavior)
            // VPC configuration using discovered or explicitly provided resources
            const vpcConfig = {
                securityGroupIds: AppDefinition.vpc.securityGroupIds ||
                    (discoveredResources.defaultSecurityGroupId ? [discoveredResources.defaultSecurityGroupId] : []),
                subnetIds: AppDefinition.vpc.subnetIds ||
                    (discoveredResources.privateSubnetId1 && discoveredResources.privateSubnetId2 ?
                        [discoveredResources.privateSubnetId1, discoveredResources.privateSubnetId2] :
                        [])
            };

            // Set VPC config for Lambda functions only if we have valid subnet IDs
            if (vpcConfig.subnetIds.length >= 2 && vpcConfig.securityGroupIds.length > 0) {
                definition.provider.vpc = vpcConfig;

                // Check if we have an existing NAT Gateway to use
                if (!discoveredResources.existingNatGatewayId) {
                    // No existing NAT Gateway, create new resources

                    // Only create EIP if we don't have an existing one available
                    if (!discoveredResources.existingElasticIpAllocationId) {
                        definition.resources.Resources.FriggNATGatewayEIP = {
                            Type: 'AWS::EC2::EIP',
                            Properties: {
                                Domain: 'vpc',
                                Tags: [
                                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' }
                                ]
                            }
                        };
                    }

                    definition.resources.Resources.FriggNATGateway = {
                        Type: 'AWS::EC2::NatGateway',
                        Properties: {
                            AllocationId: discoveredResources.existingElasticIpAllocationId ||
                                { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                            SubnetId: discoveredResources.publicSubnetId || discoveredResources.privateSubnetId1, // Use first discovered subnet if no public subnet found
                            Tags: [
                                { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-gateway' }
                            ]
                        }
                    };
                }

                // Create route table for Lambda subnets to use NAT Gateway
                definition.resources.Resources.FriggLambdaRouteTable = {
                    Type: 'AWS::EC2::RouteTable',
                    Properties: {
                        VpcId: discoveredResources.defaultVpcId || { Ref: 'FriggVPC' },
                        Tags: [
                            { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' }
                        ]
                    }
                };

                definition.resources.Resources.FriggNATRoute = {
                    Type: 'AWS::EC2::Route',
                    Properties: {
                        RouteTableId: { Ref: 'FriggLambdaRouteTable' },
                        DestinationCidrBlock: '0.0.0.0/0',
                        NatGatewayId: discoveredResources.existingNatGatewayId || { Ref: 'FriggNATGateway' }
                    }
                };

                // Associate Lambda subnets with NAT Gateway route table
                definition.resources.Resources.FriggSubnet1RouteAssociation = {
                    Type: 'AWS::EC2::SubnetRouteTableAssociation',
                    Properties: {
                        SubnetId: vpcConfig.subnetIds[0],
                        RouteTableId: { Ref: 'FriggLambdaRouteTable' }
                    }
                };

                definition.resources.Resources.FriggSubnet2RouteAssociation = {
                    Type: 'AWS::EC2::SubnetRouteTableAssociation',
                    Properties: {
                        SubnetId: vpcConfig.subnetIds[1],
                        RouteTableId: { Ref: 'FriggLambdaRouteTable' }
                    }
                };

                // Add VPC endpoints for AWS service optimization (optional but recommended)
                if (AppDefinition.vpc.enableVPCEndpoints !== false) {
                    definition.resources.Resources.VPCEndpointS3 = {
                        Type: 'AWS::EC2::VPCEndpoint',
                        Properties: {
                            VpcId: discoveredResources.defaultVpcId,
                            ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                            VpcEndpointType: 'Gateway',
                            RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }]
                        }
                    };

                    definition.resources.Resources.VPCEndpointDynamoDB = {
                        Type: 'AWS::EC2::VPCEndpoint',
                        Properties: {
                            VpcId: discoveredResources.defaultVpcId,
                            ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                            VpcEndpointType: 'Gateway',
                            RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }]
                        }
                    };
                }
            }
        }
    }

    // SSM Parameter Store Configuration based on App Definition  
    if (AppDefinition.ssm?.enable === true) {
        // Add AWS Parameters and Secrets Lambda Extension layer
        definition.provider.layers = [
            'arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
        ];

        // Add SSM IAM permissions
        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath'
            ],
            Resource: [
                'arn:aws:ssm:${self:provider.region}:*:parameter/${self:service}/${self:provider.stage}/*'
            ]
        });

        // Add environment variable for SSM parameter prefix
        definition.provider.environment.SSM_PARAMETER_PREFIX = '/${self:service}/${self:provider.stage}';
    }

    // Add integration-specific functions and resources
    if (AppDefinition.integrations && Array.isArray(AppDefinition.integrations)) {
        for (const integration of AppDefinition.integrations) {
            if (!integration || !integration.Definition || !integration.Definition.name) {
                throw new Error('Invalid integration: missing Definition or name');
            }
            const integrationName = integration.Definition.name;

            // Add function for the integration
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

            // Add SQS Queue for the integration
            const queueReference = `${integrationName.charAt(0).toUpperCase() + integrationName.slice(1)
                }Queue`;
            const queueName = `\${self:service}--\${self:provider.stage}-${queueReference}`;
            definition.resources.Resources[queueReference] = {
                Type: 'AWS::SQS::Queue',
                Properties: {
                    QueueName: `\${self:custom.${queueReference}}`,
                    MessageRetentionPeriod: 60,
                    VisibilityTimeout: 1800,  // 30 minutes
                    RedrivePolicy: {
                        maxReceiveCount: 1,
                        deadLetterTargetArn: {
                            'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                        },
                    },
                },
            };

            // Add Queue Worker for the integration
            const queueWorkerName = `${integrationName}QueueWorker`;
            definition.functions[queueWorkerName] = {
                handler: `node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
                reservedConcurrency: 5,
                events: [
                    {
                        sqs: {
                            arn: {
                                'Fn::GetAtt': [queueReference, 'Arn'],
                            },
                            batchSize: 1,
                        },
                    },
                ],
                timeout: 600,
            };

            // Add Queue URL for the integration to the ENVironment variables
            definition.provider.environment = {
                ...definition.provider.environment,
                [`${integrationName.toUpperCase()}_QUEUE_URL`]: {
                    Ref: queueReference,
                },
            };

            definition.custom[queueReference] = queueName;
        }
    }

    // Discovery has already run successfully at this point if needed
    // The discoveredResources object contains all the necessary AWS resources

    // Add websocket function if enabled
    if (AppDefinition.websockets?.enable === true) {
        definition.functions.defaultWebsocket = {
            handler: 'node_modules/@friggframework/core/handlers/routers/websocket.handler',
            events: [
                {
                    websocket: {
                        route: '$connect',
                    },
                },
                {
                    websocket: {
                        route: '$default',
                    },
                },
                {
                    websocket: {
                        route: '$disconnect',
                    },
                },
            ],
        };
    }

    // Discovery has already run successfully at this point if needed
    // The discoveredResources object contains all the necessary AWS resources

    // Add websocket function if enabled
    if (AppDefinition.websockets?.enable === true) {
        definition.functions.defaultWebsocket = {
            handler: 'node_modules/@friggframework/core/handlers/routers/websocket.handler',
            events: [
                {
                    websocket: {
                        route: '$connect',
                    },
                },
                {
                    websocket: {
                        route: '$default',
                    },
                },
                {
                    websocket: {
                        route: '$disconnect',
                    },
                },
            ],
        };
    }

    // Modify handler paths to point to the correct node_modules location
    definition.functions = modifyHandlerPaths(definition.functions);

    return definition;
};

module.exports = { composeServerlessDefinition };