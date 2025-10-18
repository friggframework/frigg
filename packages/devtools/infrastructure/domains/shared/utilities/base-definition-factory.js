/**
 * Base Serverless Definition Factory
 * 
 * Utility Layer - Hexagonal Architecture
 * 
 * Creates the base serverless.yml configuration with core functions,
 * resources, plugins, and provider settings.
 */

const { buildEnvironment } = require('../environment-builder');

/**
 * Create base serverless definition with core functions and resources
 * 
 * This creates the foundation serverless configuration that all
 * Frigg applications need, including:
 * - Core Lambda functions (auth, user, health, dbMigrate)
 * - Error handling infrastructure (SQS, SNS, CloudWatch)
 * - Prisma Lambda Layer
 * - Base plugins and esbuild configuration
 * 
 * @param {Object} AppDefinition - Application definition
 * @param {Object} appEnvironmentVars - Environment variables from app definition
 * @param {Object} discoveredResources - AWS resources discovered during build
 * @returns {Object} Base serverless definition
 */
function createBaseDefinition(
    AppDefinition,
    appEnvironmentVars,
    discoveredResources
) {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Package config for handlers that skip esbuild (need node_modules dependencies)
    // Since Express and other deps are now in backend/node_modules, exclude only what's not needed
    const skipEsbuildPackageConfig = {
        exclude: [
            // Exclude Prisma (provided via Lambda Layer)
            'node_modules/@prisma/**',
            'node_modules/.prisma/**',
            'node_modules/prisma/**',
            'node_modules/@friggframework/core/generated/**',
            
            // Exclude AWS SDK (provided by Lambda runtime)
            'node_modules/aws-sdk/**',
            'node_modules/@aws-sdk/**',
            
            // Exclude dev/test dependencies
            'node_modules/@friggframework/test/**',
            'node_modules/@friggframework/eslint-config/**',
            'node_modules/@friggframework/prettier-config/**',
            'node_modules/jest/**',
            'node_modules/prettier/**',
            'node_modules/eslint/**',
            
            // Exclude backend source and layers
            'src/**',
            'test/**',
            'layers/**',
            'coverage/**',
            '**/*.test.js',
            '**/*.spec.js',
            '**/.claude-flow/**',
            '**/.swarm/**',
        ],
    };

    // Function-level package config to exclude Prisma and AWS SDK
    const functionPackageConfig = {
        exclude: [
            // Exclude AWS SDK (already in Lambda runtime or externalized by esbuild)
            'node_modules/aws-sdk/**',
            'node_modules/@aws-sdk/**',

            // Exclude Prisma (provided via Lambda Layer)
            'node_modules/@prisma/**',
            'node_modules/.prisma/**',
            'node_modules/prisma/**',
            'node_modules/@friggframework/core/generated/**',

            // Exclude nested node_modules from symlinked frigg packages (for npm link development)
            'node_modules/@friggframework/core/node_modules/**',
            'node_modules/@friggframework/devtools/node_modules/**',

            // Exclude development/test files from backend project
            'coverage/**',
            'test/**',
            'src/**',
            'layers/**',
            '**/*.test.js',
            '**/*.spec.js',
            '.git/**',
            '.github/**',
            
            // Exclude AI assistant and development artifacts
            '**/.claude-flow/**',
            '**/.swarm/**',
            '**/CLAUDE.md',
            '**/README.md',
            '**/*.md',
            
            // Exclude config and meta files from core
            'node_modules/@friggframework/core/.eslintrc.json',
            'node_modules/@friggframework/core/.gitignore',
            'node_modules/@friggframework/core/jest.config.js',
            'node_modules/@friggframework/core/CHANGELOG.md',
        ],
    };

    return {
        frameworkVersion: '>=3.17.0',
        service: AppDefinition.name || 'create-frigg-app',
        package: {
            individually: true,
        },
        useDotenv: true,
        provider: {
            name: AppDefinition.provider || 'aws',
            ...(process.env.AWS_PROFILE && { profile: process.env.AWS_PROFILE }),
            runtime: 'nodejs22.x',  // Node.js 22.x (latest Lambda runtime with AWS SDK v3)
            timeout: 29,  // Set to 29s to give buffer before API Gateway's 30s timeout
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
                    Action: [
                        'sqs:SendMessage',
                        'sqs:SendMessageBatch',
                        'sqs:GetQueueUrl',
                        'sqs:GetQueueAttributes',
                    ],
                    Resource: [
                        { 'Fn::GetAtt': ['InternalErrorQueue', 'Arn'] },
                        {
                            'Fn::Join': [
                                ':',
                                [
                                    'arn:aws:sqs:${self:provider.region}:*:${self:service}--${self:provider.stage}-*Queue',
                                ],
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
            'serverless-esbuild',
            'serverless-dotenv-plugin',
            'serverless-offline-sqs',
            'serverless-offline',
            '@friggframework/serverless-plugin',
        ],
        custom: {
            esbuild: {
                bundle: true,
                minify: true,
                sourcemap: true,
                target: 'node22',
                platform: 'node',
                format: 'cjs',
                external: [
                    '@aws-sdk/*',
                    'aws-sdk',
                    '@prisma/client',
                    'prisma',
                    '.prisma/*',
                ],
                packager: 'npm',
                keepNames: true,
                keepOutputDirectory: false,  // Clean up .esbuild directory after packaging
                exclude: [
                    'aws-sdk',
                    '@aws-sdk/*',
                    '@prisma/client',
                    'prisma',
                ],
            },
            'serverless-offline': {
                httpPort: 3001,
                lambdaPort: 4001,
                websocketPort: 3002,
                location: '.',  // Set base directory for handler resolution to current directory
                skipCacheInvalidation: false,
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
        },
        functions: {
            auth: {
                handler: 'node_modules/@friggframework/core/handlers/routers/auth.handler',
                layers: [{ Ref: 'PrismaLambdaLayer' }],
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [
                    { httpApi: { path: '/api/integrations', method: 'ANY' } },
                    {
                        httpApi: {
                            path: '/api/integrations/{proxy+}',
                            method: 'ANY',
                        },
                    },
                    { httpApi: { path: '/api/authorize', method: 'ANY' } },
                ],
            },
            user: {
                handler: 'node_modules/@friggframework/core/handlers/routers/user.handler',
                layers: [{ Ref: 'PrismaLambdaLayer' }],
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [{ httpApi: { path: '/user/{proxy+}', method: 'ANY' } }],
            },
            health: {
                handler: 'node_modules/@friggframework/core/handlers/routers/health.handler',
                layers: [{ Ref: 'PrismaLambdaLayer' }],
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [
                    { httpApi: { path: '/health', method: 'GET' } },
                    { httpApi: { path: '/health/{proxy+}', method: 'GET' } },
                ],
            },
            dbMigrate: {
                handler: 'node_modules/@friggframework/core/handlers/database-migration-handler.handler',
                // DO NOT use Prisma layer - this function includes Prisma CLI separately
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                timeout: 300,  // 5 minutes for long-running migrations
                memorySize: 1024,  // Extra memory for Prisma CLI and migration operations
                reservedConcurrency: 1,  // Prevent concurrent migrations (CRITICAL for data safety)
                description: 'Runs database migrations via Prisma CLI (invoke manually from CI/CD or triggers). Prisma CLI bundled separately.',
                package: {
                    individually: true,
                    patterns: [
                        // Include handler
                        'node_modules/@friggframework/core/handlers/database-migration-handler.js',

                        // Include ONLY PostgreSQL Prisma client (exclude MongoDB)
                        'node_modules/@friggframework/core/generated/prisma-postgresql/**',
                        '!node_modules/@friggframework/core/generated/prisma-mongodb/**',  // Exclude MongoDB client entirely

                        // Include Prisma runtime
                        'node_modules/@prisma/client/**',
                        'node_modules/.prisma/**',
                        'node_modules/prisma/**',  // Prisma CLI

                        // Exclude unnecessary engines and files
                        '!node_modules/prisma/node_modules/**',
                        '!**/query-engine-darwin*',  // Exclude macOS binaries (keep rhel for Lambda)
                        '!**/runtime/*.wasm',  // WASM engines
                        '!**/*.md',
                        '!**/*.map',
                        '!**/LICENSE*',
                        '!**/*.d.ts',
                        '!**/*.d.mts',
                    ],
                },
                maximumEventAge: 60,
                maximumRetryAttempts: 0,
                tags: {
                    Purpose: 'DatabaseMigration',
                    ManagedBy: 'Frigg',
                },
                environment: {
                    CI: '1',
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                    PRISMA_MIGRATE_SKIP_SEED: '1',
                },
            },
        },
        layers: {
            prisma: {
                path: 'layers/prisma',
                name: '${self:service}-prisma-${sls:stage}',
                description: 'Prisma runtime client only (NO CLI) with rhel-openssl-3.0.x binaries (~10-15MB). CLI packaged separately in dbMigrate function.',
                compatibleRuntimes: ['nodejs20.x', 'nodejs22.x'],
                retain: false,
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
                                    Principal: { Service: 'sns.amazonaws.com' },
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
                            { Name: 'ApiId', Value: { Ref: 'HttpApi' } },
                            { Name: 'Stage', Value: '${self:provider.stage}' },
                        ],
                    },
                },
            },
        },
    };
}

module.exports = {
    createBaseDefinition,
};

