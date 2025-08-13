const path = require('path');
const fs = require('fs');

// Function to find the actual path to node_modules
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

// Function to modify handler paths to point to the correct node_modules
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
            functionDef.handler = functionDef.handler.replace('node_modules/', '../node_modules/');
            console.log(`Updated handler for ${functionName}: ${functionDef.handler}`);
        }
    }

    return modifiedFunctions;
};

// Helper function to create VPC infrastructure resources
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
                         FromPort: 27017,
                         ToPort: 27017,
                         CidrIp: '0.0.0.0/0',
                         Description: 'MongoDB Atlas TLS outbound'
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

const composeServerlessDefinition = (AppDefinition) => {
    // Define CORS configuration to be used across all endpoints
    const corsConfig = {
        origin: '*',
        headers: '*',
        methods: ['ANY'],
        allowCredentials: false,
    };
    
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
            region: 'us-east-1',
            stage: '${opt:stage}',
            environment: {
                STAGE: '${opt:stage}',
                AWS_NODEJS_CONNECTION_REUSE_ENABLED: 1,
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
                region: 'us-east-1',
                accessKeyId: 'root',
                secretAccessKey: 'root',
                skipCacheInvalidation: false,
            },
            jetpack: {
                base: '..',
            },
        },
        functions: {
            defaultWebsocket: {
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
            },
            auth: {
                handler: 'node_modules/@friggframework/core/handlers/routers/auth.handler',
                events: [
                    {
                        http: {
                            path: '/api/integrations',
                            method: 'ANY',
                            cors: corsConfig,
                        },
                    },
                    {
                        http: {
                            path: '/api/integrations/{proxy+}',
                            method: 'ANY',
                            cors: corsConfig,
                        },
                    },
                    {
                        http: {
                            path: '/api/authorize',
                            method: 'ANY',
                            cors: corsConfig,
                        },
                    },
                ],
            },
            user: {
                handler: 'node_modules/@friggframework/core/handlers/routers/user.handler',
                events: [
                    {
                        http: {
                            path: '/user/{proxy+}',
                            method: 'ANY',
                            cors: corsConfig,
                        },
                    },
                ],
            },
            health: {
                handler: 'node_modules/@friggframework/core/handlers/routers/health.handler',
                events: [
                    {
                        http: {
                            path: '/health',
                            method: 'GET',
                            cors: corsConfig,
                        },
                    },
                    {
                        http: {
                            path: '/health/{proxy+}',
                            method: 'GET',
                            cors: corsConfig,
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
                            'internal-error-queue-${self:provider.stage}',
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
                                Name: 'ApiName',
                                Value: {
                                    'Fn::Join': [
                                        '-',
                                        [
                                            '${self:provider.stage}',
                                            '${self:service}',
                                        ],
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
        },
    };

    // Configure BASE_URL based on custom domain or API Gateway
    if (process.env.CUSTOM_DOMAIN) {
        
        // Configure custom domain
        definition.custom.customDomain = {
            domainName: process.env.CUSTOM_DOMAIN,
            basePath: process.env.CUSTOM_BASE_PATH || '',
            stage: '${self:provider.stage}',
            createRoute53Record: process.env.CREATE_ROUTE53_RECORD !== 'false', // Default true
            certificateName: process.env.CERTIFICATE_NAME || process.env.CUSTOM_DOMAIN,
            endpointType: process.env.ENDPOINT_TYPE || 'edge', // edge, regional, or private
            securityPolicy: process.env.SECURITY_POLICY || 'tls_1_2',
            apiType: 'rest',
            autoDomain: process.env.AUTO_DOMAIN === 'true', // Auto create domain if it doesn't exist
        };
        
        // Set BASE_URL to custom domain
        definition.provider.environment.BASE_URL = `https://${process.env.CUSTOM_DOMAIN}`;
    } else {
        // Default BASE_URL using API Gateway generated URL
        definition.provider.environment.BASE_URL = {
            'Fn::Join': [
                '',
                [
                    'https://',
                    { Ref: 'ApiGatewayRestApi' },
                    '.execute-api.',
                    { Ref: 'AWS::Region' },
                    '.amazonaws.com/',
                    '${self:provider.stage}',
                ],
            ],
        };
    }
    
    // REDIRECT_PATH is required for OAuth integrations
    if (!process.env.REDIRECT_PATH) {
        throw new Error(
            'REDIRECT_PATH environment variable is required. ' +
            'Please set REDIRECT_PATH in your .env file (e.g., REDIRECT_PATH=/oauth/callback)'
        );
    }
    
    // Set REDIRECT_URI based on domain configuration
    if (process.env.CUSTOM_DOMAIN) {
        definition.provider.environment.REDIRECT_URI = `https://${process.env.CUSTOM_DOMAIN}${process.env.REDIRECT_PATH}`;
    } else {
        definition.provider.environment.REDIRECT_URI = {
            'Fn::Join': [
                '',
                [
                    'https://',
                    { Ref: 'ApiGatewayRestApi' },
                    '.execute-api.',
                    { Ref: 'AWS::Region' },
                    '.amazonaws.com/',
                    '${self:provider.stage}',
                    process.env.REDIRECT_PATH,
                ],
            ],
        };
    }
    
    // Add REDIRECT_URI to CloudFormation outputs
    definition.resources.Outputs = {
        RedirectURI: {
            Description: 'OAuth Redirect URI to register with providers',
            Value: definition.provider.environment.REDIRECT_URI,
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
        definition.custom.kmsGrants = { kmsKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] } };
    }

    // VPC Configuration based on App Definition
    if (AppDefinition.vpc?.enable === true) {
        // Create VPC config from App Definition or use auto-created resources
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

        // Add VPC infrastructure resources to CloudFormation
        const vpcResources = createVPCInfrastructure(AppDefinition);
        Object.assign(definition.resources.Resources, vpcResources);
    }

    // Add integration-specific functions and resources
    for (const integration of AppDefinition.integrations) {
        const integrationName = integration.Definition.name;

        // Add function for the integration
        definition.functions[integrationName] = {
            handler: `node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.${integrationName}.handler`,
            events: [
                {
                    http: {
                        path: `/api/${integrationName}-integration/{proxy+}`,
                        method: 'ANY',
                        cors: corsConfig,
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

    // Modify handler paths to point to the correct node_modules location
    definition.functions = modifyHandlerPaths(definition.functions);

    return definition;
};

module.exports = { composeServerlessDefinition };