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
            const schedule = script.Definition?.schedule;
            console.log(`    ✓ Registered: ${name}${schedule?.enabled ? ' (scheduled)' : ''}`);
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
        console.log('  ✓ Created AdminScriptQueue');
    }

    createScriptExecutorFunction(result, usePrismaLayer) {
        result.functions.adminScriptExecutor = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler',
            skipEsbuild: true,
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

    createSchedulerResources(appDefinition, result) {
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
                            Resource: { 'Fn::GetAtt': ['AdminScriptExecutorLambdaFunction', 'Arn'] },
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

        // Env vars consumed by the admin-script router when building the AWS
        // scheduler adapter. Names must match admin-script-router.js exactly.
        result.environment.SCHEDULER_PROVIDER = 'aws';
        result.environment.SCHEDULER_ROLE_ARN = { 'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'] };
        result.environment.ADMIN_SCRIPT_SCHEDULE_GROUP = { Ref: 'AdminScriptScheduleGroup' };
        result.environment.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN = {
            'Fn::GetAtt': ['AdminScriptExecutorLambdaFunction', 'Arn'],
        };

        console.log('  ✓ Created EventBridge Scheduler resources');
    }
}

module.exports = { AdminScriptBuilder };
