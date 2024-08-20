const path = require('path');
const fs = require('fs');


module.exports = {
    frameworkVersion: '>=3.17.0',
    service: 'create-frigg-app',
    package: {
        individually: true,
    },
    useDotenv: true,
    provider: {
        name: 'aws',
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
    // plugins: ['serverless-webpack', 'serverless-offline'],
    plugins: ['serverless-offline'],
    custom: {
        'serverless-offline': {
            httpPort: 3001,
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
        auth: {
            handler: '/../node_modules/@friggframework/devtools/infrastructure/routers/auth.handler',
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
            handler: '/../node_modules/@friggframework/devtools/infrastructure/routers/user.handler',
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
                    QueueName: 'internal-error-queue-${self:provider.stage}',
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
                                    'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
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
