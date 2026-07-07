/**
 * Admin Script Builder
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Creating SQS queue for admin script execution
 * - Creating Lambda function for script execution (worker)
 * - Creating Lambda function for admin API routes (router)
 * - Creating EventBridge Scheduler resources (Phase 2)
 * - Creating IAM roles for scheduler to invoke Lambda
 * - Granting the router/executor Lambdas IAM permission to send to the queue
 *   and (when scheduling is enabled) manage EventBridge schedules
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

class AdminScriptBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'AdminScriptBuilder';
    }

    shouldExecute(appDefinition) {
        return Array.isArray(appDefinition.adminScripts) && appDefinition.adminScripts.length > 0;
    }

    getDependencies() {
        return []; // Can run independently
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.adminScripts) {
            return result; // Not an error, just no scripts
        }

        if (!Array.isArray(appDefinition.adminScripts)) {
            result.addError('adminScripts must be an array');
            return result;
        }

        // Validate each script
        appDefinition.adminScripts.forEach((script, index) => {
            if (!script?.Definition?.name) {
                result.addError(`Admin script at index ${index} is missing Definition or name`);
            }
        });

        return result;
    }

    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring admin scripts...`);
        console.log(`  Processing ${appDefinition.adminScripts.length} scripts...`);

        const usePrismaLayer = appDefinition.usePrismaLambdaLayer !== false;
        const adminConfig = appDefinition.admin || {};

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
            iamStatements: [],
        };

        // Create admin script queue
        this.createAdminScriptQueue(result);

        // Create Lambda function for script execution
        this.createScriptExecutorFunction(result, usePrismaLayer);

        // Create API routes for script management
        this.createAdminScriptRoutes(result, usePrismaLayer);

        // Phase 2: Create EventBridge Scheduler resources
        if (adminConfig.enableScheduling) {
            this.createSchedulerResources(appDefinition, result);
        }

        // Log registered scripts
        appDefinition.adminScripts.forEach(script => {
            const name = script.Definition?.name || 'unknown';
            console.log(`    ✓ Registered: ${name}`);
        });

        console.log(`[${this.name}] ✅ Admin script configuration completed`);
        return result;
    }

    createAdminScriptQueue(result) {
        result.resources.AdminScriptQueue = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: '${self:service}-${self:provider.stage}-AdminScriptQueue',
                MessageRetentionPeriod: 86400, // 1 day
                VisibilityTimeout: 900, // 15 minutes (Lambda max)
                RedrivePolicy: {
                    maxReceiveCount: 3,
                    deadLetterTargetArn: {
                        'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                    },
                },
            },
        };

        result.environment.ADMIN_SCRIPT_QUEUE_URL = { Ref: 'AdminScriptQueue' };

        // The router enqueues async executions and scripts enqueue continuations
        // via queueScript()/queueScriptBatch(). The base role's wildcard does not
        // cover this queue's name, so grant SendMessage explicitly.
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'sqs:SendMessage',
                'sqs:SendMessageBatch',
                'sqs:GetQueueUrl',
                'sqs:GetQueueAttributes',
            ],
            Resource: { 'Fn::GetAtt': ['AdminScriptQueue', 'Arn'] },
        });

        console.log('  ✓ Created AdminScriptQueue');
    }

    createScriptExecutorFunction(result, usePrismaLayer) {
        result.functions.adminScriptExecutor = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(usePrismaLayer),
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 900, // 15 minutes max
            memorySize: 1024,
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['AdminScriptQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ],
        };
        console.log('  ✓ Created adminScriptExecutor function');
    }

    createAdminScriptRoutes(result, usePrismaLayer) {
        result.functions.adminScriptRouter = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/admin-script-router.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(usePrismaLayer),
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 30,
            events: [
                // List scripts
                { httpApi: { path: '/admin/scripts', method: 'GET' } },
                // Get script details
                { httpApi: { path: '/admin/scripts/{scriptName}', method: 'GET' } },
                // Execute script (sync or async)
                { httpApi: { path: '/admin/scripts/{scriptName}', method: 'POST' } },
                // Validate script input (dry-run preview)
                { httpApi: { path: '/admin/scripts/{scriptName}/validate', method: 'POST' } },
                // List executions for a script
                { httpApi: { path: '/admin/scripts/{scriptName}/executions', method: 'GET' } },
                // Get a single execution
                {
                    httpApi: {
                        path: '/admin/scripts/{scriptName}/executions/{executionId}',
                        method: 'GET',
                    },
                },
                // Schedule management (Phase 2)
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'GET' } },
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'PUT' } },
                { httpApi: { path: '/admin/scripts/{scriptName}/schedule', method: 'DELETE' } },
            ],
        };
        console.log('  ✓ Created adminScriptRouter function');
    }

    // Without this, the skipEsbuild functions package the whole node_modules
    // closure (aws-sdk, Prisma, dev deps) and blow past Lambda's 250 MB limit.
    skipEsbuildPackageConfig(usePrismaLayer) {
        return {
            exclude: [
                'node_modules/aws-sdk/**',
                'node_modules/@aws-sdk/**',
                ...(usePrismaLayer
                    ? [
                          'node_modules/@prisma/**',
                          'node_modules/.prisma/**',
                          'node_modules/prisma/**',
                          'node_modules/@friggframework/core/generated/**',
                      ]
                    : []),
                'node_modules/**/node_modules/**',
                'node_modules/@friggframework/test/**',
                'node_modules/@friggframework/eslint-config/**',
                'node_modules/@friggframework/prettier-config/**',
                'node_modules/jest/**',
                'node_modules/prettier/**',
                'node_modules/eslint/**',
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
                '.env',
                '.env.*',
                '**/.env',
                '**/.env.*',
                'test/**',
                'layers/**',
                'coverage/**',
                '**/*.test.js',
                '**/*.spec.js',
            ],
        };
    }

    createSchedulerResources(appDefinition, result) {
        // Constructed ARN, not Fn::GetAtt: a GetAtt edge to the executor closes a
        // CloudFormation circular dependency via the shared Lambda execution role.
        const executorArn = {
            'Fn::Sub':
                'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-adminScriptExecutor',
        };

        // Create IAM role for EventBridge Scheduler
        result.resources.AdminScriptSchedulerRole = {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName: '${self:service}-${self:provider.stage}-admin-script-scheduler',
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: { Service: 'scheduler.amazonaws.com' },
                        Action: 'sts:AssumeRole',
                    }],
                },
                Policies: [{
                    PolicyName: 'InvokeLambda',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [{
                            Effect: 'Allow',
                            Action: 'lambda:InvokeFunction',
                            Resource: executorArn,
                        }],
                    },
                }],
            },
        };

        // Create schedule group
        result.resources.AdminScriptScheduleGroup = {
            Type: 'AWS::Scheduler::ScheduleGroup',
            Properties: {
                Name: '${self:service}-${self:provider.stage}-admin-scripts',
            },
        };

        result.environment.SCHEDULER_PROVIDER = 'aws';

        // Router-scoped, not shared provider env: broadcasting these resource
        // references to every function creates CloudFormation circular deps.
        result.functions.adminScriptRouter.environment = {
            ...(result.functions.adminScriptRouter.environment || {}),
            SCHEDULER_ROLE_ARN: {
                'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
            },
            ADMIN_SCRIPT_SCHEDULE_GROUP: { Ref: 'AdminScriptScheduleGroup' },
            ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN: executorArn,
        };

        // The router manages schedules through the AWS scheduler adapter, so it
        // needs scheduler:* on this group plus iam:PassRole for the role it hands
        // to EventBridge. (UpdateSchedule covers the upsert conflict path.)
        result.iamStatements.push(
            {
                Effect: 'Allow',
                Action: [
                    'scheduler:CreateSchedule',
                    'scheduler:UpdateSchedule',
                    'scheduler:DeleteSchedule',
                    'scheduler:GetSchedule',
                ],
                Resource: {
                    'Fn::Sub': [
                        'arn:aws:scheduler:${AWS::Region}:${AWS::AccountId}:schedule/${GroupName}/*',
                        { GroupName: { Ref: 'AdminScriptScheduleGroup' } },
                    ],
                },
            },
            {
                Effect: 'Allow',
                Action: ['iam:PassRole'],
                Resource: { 'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'] },
                Condition: {
                    StringEquals: {
                        'iam:PassedToService': 'scheduler.amazonaws.com',
                    },
                },
            }
        );

        console.log('  ✓ Created EventBridge Scheduler resources');
    }
}

module.exports = { AdminScriptBuilder };
