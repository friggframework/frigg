const path = require('path');
const fs = require('fs');

const composeServerlessDefinition = (AppDefinition) => {
    const definition = {
        frameworkVersion: '>=3.17.0',
        service: AppDefinition.name || 'create-frigg-app',
        package: {
            individually: true,
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
            ],
        },
        plugins: [
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
            webpack: {
                webpackConfig: 'webpack.config.js',
                includeModules: {
                    forceExclude: ['aws-sdk'],
                },
                packager: 'npm',
                excludeFiles: ['src/**/*.test.js', 'test/'],
            },
        },
        functions: {
            defaultWebsocket: {
                handler:
                    '/../node_modules/@friggframework/devtools/infrastructure/routers/websocket.handler',
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
                handler:
                    '/../node_modules/@friggframework/devtools/infrastructure/routers/auth.handler',
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
                handler:
                    '/../node_modules/@friggframework/devtools/infrastructure/routers/user.handler',
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

    // Add integration-specific functions and resources
    for (const integration of AppDefinition.integrations) {
        const integrationName = integration.Definition.name;

        // Add function for the integration
        definition.functions[integrationName] = {
            handler: `/../node_modules/@friggframework/devtools/infrastructure/routers/integration-defined-routers.handlers.${integrationName}.handler`,
            // events: integration.Definition.routes.map((route) => ({
            //     http: {
            //         path: `/api/${integrationName}-integration${route.path}`,
            //         method: route.method || 'ANY',
            //         cors: true,
            //     },
            // })),
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
        const queueReference = `${
            integrationName.charAt(0).toUpperCase() + integrationName.slice(1)
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
            handler: `/../node_modules/@friggframework/devtools/infrastructure/workers/integration-defined-workers.handlers.${integrationName}.queueWorker`,
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

    return definition;
};

module.exports = { composeServerlessDefinition };
