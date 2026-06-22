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
 * - Prisma Lambda Layer (optional)
 * - Base plugins and esbuild configuration
 * 
 * @param {Object} AppDefinition - Application definition
 * @param {Object} appEnvironmentVars - Environment variables from app definition
 * @param {Object} discoveredResources - AWS resources discovered during build
 * @param {boolean} usePrismaLayer - Whether to use the Prisma Lambda Layer (default true)
 * @returns {Object} Base serverless definition
 */
function createBaseDefinition(
    AppDefinition,
    appEnvironmentVars,
    discoveredResources,
    usePrismaLayer = true
) {
    const region = process.env.AWS_REGION || 'us-east-1';

    // Package config for handlers that skip esbuild (need node_modules dependencies)
    // Include backend src/ and index.js since handlers load the app definition
    const skipEsbuildPackageConfig = {
        // Explicitly include project files that handlers need
        include: [
            // Include DocumentDB TLS certificate if configured
            ...(AppDefinition.database?.documentDB?.tlsCAFile 
                ? [AppDefinition.database.documentDB.tlsCAFile.replace(/^\.\//, '')] 
                : []),
        ],
        exclude: [
            // Exclude Prisma (provided via Lambda Layer)
            ...(usePrismaLayer ? [
                'node_modules/@prisma/**',
                'node_modules/.prisma/**',
                'node_modules/prisma/**',
                'node_modules/@friggframework/core/generated/**',
            ] : []),

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

            // Exclude ALL nested node_modules (catch any package with nested dependencies)
            'node_modules/**/node_modules/**',

            // Exclude build tools (not needed at runtime)
            'node_modules/esbuild/**',
            'node_modules/@esbuild/**',
            'node_modules/typescript/**',
            'node_modules/webpack/**',
            'node_modules/osls/**',
            'node_modules/serverless-esbuild/**',
            'node_modules/serverless-jetpack/**',
            'node_modules/serverless-offline/**',
            'node_modules/serverless-offline-sqs/**',
            'node_modules/serverless-dotenv-plugin/**',
            'node_modules/serverless-kms-grants/**',
            // Note: DO NOT exclude serverless-http - it's a runtime dependency!

            // Exclude local dev files and environment files (NEVER deploy .env files!)
            '.env',
            '.env.*',
            '.env.local',
            '.env.*.local',
            '**/.env',
            '**/.env.*',
            'deploy.log',
            '.env.backup',
            'docker-compose.yml',
            'jest.config.js',
            'jest.unit.config.js',
            '.eslintrc.json',
            '.prettierrc',
            '.prettierignore',
            '.markdownlintignore',
            'package-lock.json',

            // Exclude test files and layers (keep src/ - needed for app definition and integrations)
            'test/**',
            'layers/**',
            'coverage/**',
            // Note: DO NOT exclude src/** - handlers need src/integrations and src/api-modules at runtime
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
            ...(usePrismaLayer ? [
                'node_modules/@prisma/**',
                'node_modules/.prisma/**',
                'node_modules/prisma/**',
                'node_modules/@friggframework/core/generated/**',
            ] : []),

            // Exclude nested node_modules from symlinked frigg packages (for npm link development)
            'node_modules/@friggframework/core/node_modules/**',
            'node_modules/@friggframework/devtools/node_modules/**',

            // Exclude environment files (NEVER deploy .env files!)
            '.env',
            '.env.*',
            '.env.local',
            '.env.*.local',
            '**/.env',
            '**/.env.*',

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
        // Only use .env for local development (offline mode)
        // Production deployments should use environment vars from infrastructure
        useDotenv: process.argv.includes('offline'),
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
            // Only load dotenv plugin for offline mode
            ...(process.argv.includes('offline') ? ['serverless-dotenv-plugin'] : []),
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
                    ...(usePrismaLayer ? [
                        '@prisma/client',
                        'prisma',
                        '.prisma/*',
                    ] : []),
                ],
                packager: 'npm',
                keepNames: true,
                keepOutputDirectory: true,  // Keep .esbuild directory to prevent ENOENT errors during packaging
                exclude: [
                    'aws-sdk',
                    '@aws-sdk/*',
                    ...(usePrismaLayer ? [
                        '@prisma/client',
                        'prisma',
                    ] : []),
                ],
                // Reduce file scanning overhead - tell esbuild to skip these during watch/scan but still bundle them
                watch: {
                    ignore: ['node_modules/@aws-sdk/**', 'node_modules/@babel/**', 'node_modules/@smithy/**']
                },
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
                ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
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
                ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [{ httpApi: { path: '/user/{proxy+}', method: 'ANY' } }],
            },
            health: {
                handler: 'node_modules/@friggframework/core/handlers/routers/health.handler',
                ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [
                    { httpApi: { path: '/health', method: 'GET' } },
                    { httpApi: { path: '/health/{proxy+}', method: 'GET' } },
                ],
            },
            reporting: {
                handler: 'node_modules/@friggframework/core/handlers/routers/reporting.handler',
                ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
                skipEsbuild: true,  // Handlers in node_modules don't need bundling
                package: skipEsbuildPackageConfig,
                events: [
                    { httpApi: { path: '/api/v2/reports', method: 'GET' } },
                    { httpApi: { path: '/api/v2/reports/{proxy+}', method: 'GET' } },
                ],
            },
            // Note: dbMigrate removed - MigrationBuilder now handles migration infrastructure
            // See: packages/devtools/infrastructure/domains/database/migration-builder.js
        },
        layers: usePrismaLayer ? {
            prisma: {
                path: 'layers/prisma',
                name: '${self:service}-prisma-${sls:stage}',
                description: 'Prisma runtime client only (NO CLI) with rhel-openssl-3.0.x binaries (~10-15MB). CLI packaged separately in dbMigrate function.',
                compatibleRuntimes: ['nodejs20.x', 'nodejs22.x'],
                retain: false,
            },
        } : {},
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

