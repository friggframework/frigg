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

const composeServerlessDefinition = (AppDefinition) => {
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
                            cors: true,
                        },
                    },
                    {
                        http: {
                            path: '/api/integrations/{proxy+}',
                            method: 'ANY',
                            cors: true,
                        },
                    },
                    {
                        http: {
                            path: '/api/authorize',
                            method: 'ANY',
                            cors: true,
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
                            cors: true,
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

    // KMS Configuration based on App Definition
    if (AppDefinition.encryption?.useDefaultKMSForFieldLevelEncryption === true) {
        // Add KMS IAM permissions
        definition.provider.iamRoleStatements.push({
            Effect: 'Allow',
            Action: [
                'kms:GenerateDataKey',
                'kms:Decrypt'
            ],
            Resource: ['${self:custom.kmsGrants.kmsKeyId}']
        });

        // Add KMS_KEY_ARN environment variable for Frigg Encrypt module
        definition.provider.environment.KMS_KEY_ARN = '${self:custom.kmsGrants.kmsKeyId}';

        // Add serverless-kms-grants plugin
        definition.plugins.push('serverless-kms-grants');

        // Configure KMS grants with default key
        definition.custom.kmsGrants = {
            kmsKeyId: '*'
        };
    }

    // VPC Configuration based on App Definition
    if (AppDefinition.vpc?.enable === true) {
        // Create VPC config from App Definition
        const vpcConfig = {};
        if (AppDefinition.vpc.securityGroupIds) {
            vpcConfig.securityGroupIds = AppDefinition.vpc.securityGroupIds;
        }
        if (AppDefinition.vpc.subnetIds) {
            vpcConfig.subnetIds = AppDefinition.vpc.subnetIds;
        }

        // Set VPC config directly (can be overridden by serverless.yml)
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
                        cors: true,
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
