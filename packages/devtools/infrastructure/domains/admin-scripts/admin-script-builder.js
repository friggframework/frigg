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
const { isScopedEnvironmentActive } = require('../shared/function-environments');

class AdminScriptBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'AdminScriptBuilder';
    }

    shouldExecute(appDefinition) {
        const hasScripts =
            Array.isArray(appDefinition.adminScripts) &&
            appDefinition.adminScripts.length > 0;
        const hasReports =
            Array.isArray(appDefinition.reports) &&
            appDefinition.reports.length > 0;
        const hasBuiltinReports =
            appDefinition.admin?.includeBuiltinReports === true;
        return hasScripts || hasReports || hasBuiltinReports;
    }

    getDependencies() {
        return []; // Can run independently
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (appDefinition.adminScripts !== undefined) {
            if (!Array.isArray(appDefinition.adminScripts)) {
                result.addError('adminScripts must be an array');
            } else {
                appDefinition.adminScripts.forEach((script, index) => {
                    if (!script?.Definition?.name) {
                        result.addError(`Admin script at index ${index} is missing Definition or name`);
                    }
                });
            }
        }

        if (appDefinition.reports !== undefined) {
            if (!Array.isArray(appDefinition.reports)) {
                result.addError('reports must be an array');
            } else {
                appDefinition.reports.forEach((report, index) => {
                    if (!report?.Definition?.name) {
                        result.addError(`Report at index ${index} is missing Definition or name`);
                    }
                });
            }
        }

        return result;
    }

    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring admin operations...`);

        const usePrismaLayer = appDefinition.usePrismaLambdaLayer !== false;
        const adminConfig = appDefinition.admin || {};
        const adminScripts = Array.isArray(appDefinition.adminScripts)
            ? appDefinition.adminScripts
            : [];
        const reports = Array.isArray(appDefinition.reports)
            ? appDefinition.reports
            : [];
        const hasReports =
            reports.length > 0 || adminConfig.includeBuiltinReports === true;

        // Provision the artifact bucket only when an app-registered report
        // declares a non-JSON output format — that is the only output that gets
        // stored as an S3 object. Built-in reports emit JSON today, so
        // includeBuiltinReports alone does not provision the bucket; a non-JSON
        // built-in would need to be registered explicitly (or this widened).
        const reportsNeedArtifacts = reports.some((report) => {
            const format = report?.Definition?.output?.format;
            return Boolean(format) && format !== 'json';
        });

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
            iamStatements: [],
        };

        // Admin scripts: queue + executor + router. Only provisioned when the
        // app registers scripts.
        if (adminScripts.length > 0) {
            console.log(`  Processing ${adminScripts.length} scripts...`);
            this.createAdminScriptQueue(result, appDefinition);
            this.createScriptExecutorFunction(appDefinition, result, usePrismaLayer);
            this.createAdminScriptRoutes(appDefinition, result, usePrismaLayer);

            adminScripts.forEach(script => {
                const name = script.Definition?.name || 'unknown';
                console.log(`    ✓ Registered script: ${name}`);
            });
        }

        // Reports: the report router runs under the admin API key, with a
        // dedicated ReportQueue + executor for async recorded/snapshot runs.
        if (hasReports) {
            this.createReportQueue(result, appDefinition);
            this.createReportExecutorFunction(appDefinition, result, usePrismaLayer);
            this.createReportRoutes(appDefinition, result, usePrismaLayer);
            if (reportsNeedArtifacts) {
                this.createReportArtifactBucket(result, appDefinition);
            }
            reports.forEach(report => {
                const name = report.Definition?.name || 'unknown';
                console.log(`    ✓ Registered report: ${name}`);
            });
            if (adminConfig.includeBuiltinReports) {
                console.log('    ✓ Built-in reports enabled');
            }
        }

        // Scheduler infra (EventBridge Scheduler role + group) is shared across
        // scripts and reports. The role can invoke whichever executors exist;
        // each router gets its own scheduler env wiring.
        if (
            adminConfig.enableScheduling &&
            (adminScripts.length > 0 || hasReports)
        ) {
            this.createSchedulerResources(appDefinition, result, {
                scriptsPresent: adminScripts.length > 0,
                hasReports,
            });
        }

        console.log(`[${this.name}] ✅ Admin operations configuration completed`);
        return result;
    }

    createAdminScriptQueue(result, appDefinition) {
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

        if (isScopedEnvironmentActive(appDefinition)) {
            // Only the admin functions read this queue URL
            result.functionEnvironments = result.functionEnvironments || {};
            for (const fnName of ['adminScriptRouter', 'adminScriptExecutor']) {
                result.functionEnvironments[fnName] = {
                    ...result.functionEnvironments[fnName],
                    ADMIN_SCRIPT_QUEUE_URL: { Ref: 'AdminScriptQueue' },
                };
            }
        } else {
            result.environment.ADMIN_SCRIPT_QUEUE_URL = {
                Ref: 'AdminScriptQueue',
            };
        }

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

    createScriptExecutorFunction(appDefinition, result, usePrismaLayer) {
        result.functions.adminScriptExecutor = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(appDefinition, usePrismaLayer),
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

    createAdminScriptRoutes(appDefinition, result, usePrismaLayer) {
        result.functions.adminScriptRouter = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/admin-script-router.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(appDefinition, usePrismaLayer),
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

    createReportRoutes(appDefinition, result, usePrismaLayer) {
        result.functions.reportRouter = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/report-router.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(appDefinition, usePrismaLayer),
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 30,
            events: [
                // List report definitions
                { httpApi: { path: '/api/v2/reports', method: 'GET' } },
                // Definition detail, snapshots, executions, schedule, back-compat alias
                { httpApi: { path: '/api/v2/reports/{proxy+}', method: 'GET' } },
                // Run a report ({name}/run)
                { httpApi: { path: '/api/v2/reports/{proxy+}', method: 'POST' } },
                // Schedule management (PUT/DELETE {name}/schedule)
                { httpApi: { path: '/api/v2/reports/{proxy+}', method: 'PUT' } },
                { httpApi: { path: '/api/v2/reports/{proxy+}', method: 'DELETE' } },
            ],
        };
        console.log('  ✓ Created reportRouter function');
    }

    createReportQueue(result, appDefinition) {
        result.resources.ReportQueue = {
            Type: 'AWS::SQS::Queue',
            Properties: {
                QueueName: '${self:service}-${self:provider.stage}-ReportQueue',
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

        if (isScopedEnvironmentActive(appDefinition)) {
            // Only the report functions read this queue URL
            result.functionEnvironments = result.functionEnvironments || {};
            for (const fnName of ['reportRouter', 'reportExecutor']) {
                result.functionEnvironments[fnName] = {
                    ...result.functionEnvironments[fnName],
                    REPORT_QUEUE_URL: { Ref: 'ReportQueue' },
                };
            }
        } else {
            result.environment.REPORT_QUEUE_URL = { Ref: 'ReportQueue' };
        }

        // The report router enqueues async recorded/snapshot runs. The base
        // role's wildcard does not cover this queue's name, so grant
        // SendMessage explicitly.
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'sqs:SendMessage',
                'sqs:SendMessageBatch',
                'sqs:GetQueueUrl',
                'sqs:GetQueueAttributes',
            ],
            Resource: { 'Fn::GetAtt': ['ReportQueue', 'Arn'] },
        });

        console.log('  ✓ Created ReportQueue');
    }

    createReportExecutorFunction(appDefinition, result, usePrismaLayer) {
        result.functions.reportExecutor = {
            handler: 'node_modules/@friggframework/admin-scripts/src/infrastructure/report-executor-handler.handler',
            skipEsbuild: true,
            package: this.skipEsbuildPackageConfig(appDefinition, usePrismaLayer),
            ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }),
            timeout: 900, // 15 minutes max
            memorySize: 1024,
            events: [
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['ReportQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ],
        };
        console.log('  ✓ Created reportExecutor function');
    }

    // Private, encrypted bucket for non-JSON report output. Public access is
    // fully blocked; the router mints short-lived presigned URLs for reads.
    createReportArtifactBucket(result, appDefinition) {
        result.resources.ReportArtifactBucket = {
            Type: 'AWS::S3::Bucket',
            Properties: {
                BucketName:
                    '${self:service}-${self:provider.stage}-report-artifacts',
                BucketEncryption: {
                    ServerSideEncryptionConfiguration: [
                        {
                            ServerSideEncryptionByDefault: {
                                SSEAlgorithm: 'AES256',
                            },
                        },
                    ],
                },
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
            },
        };

        if (isScopedEnvironmentActive(appDefinition)) {
            result.functionEnvironments = result.functionEnvironments || {};
            for (const fnName of ['reportRouter', 'reportExecutor']) {
                result.functionEnvironments[fnName] = {
                    ...result.functionEnvironments[fnName],
                    REPORT_ARTIFACT_BUCKET: { Ref: 'ReportArtifactBucket' },
                };
            }
        } else {
            result.environment.REPORT_ARTIFACT_BUCKET = {
                Ref: 'ReportArtifactBucket',
            };
        }

        // The router presigns/reads and the executor writes artifacts. Scope
        // object-level access to this bucket's keys.
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['s3:PutObject', 's3:GetObject'],
            Resource: {
                'Fn::Sub': [
                    '${BucketArn}/*',
                    {
                        BucketArn: {
                            'Fn::GetAtt': ['ReportArtifactBucket', 'Arn'],
                        },
                    },
                ],
            },
        });

        console.log('  ✓ Created ReportArtifactBucket');
    }

    // Without this, the skipEsbuild functions package the whole node_modules
    // closure (aws-sdk, Prisma, dev deps) and blow past Lambda's 250 MB limit.
    // Mirrors the exclusions the framework's other node_modules handlers use.
    skipEsbuildPackageConfig(appDefinition, usePrismaLayer) {
        const tlsCAFile = appDefinition?.database?.documentDB?.tlsCAFile;
        return {
            include: [
                // Handlers connect to the DB, so ship the DocumentDB CA cert.
                ...(tlsCAFile ? [tlsCAFile.replace(/^\.\//, '')] : []),
            ],
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
                // Never deploy secrets or the lockfile.
                '.env',
                '.env.*',
                '**/.env',
                '**/.env.*',
                '.frigg-credentials.json',
                'package-lock.json',
                'test/**',
                'layers/**',
                'coverage/**',
                '**/*.test.js',
                '**/*.spec.js',
            ],
        };
    }

    createSchedulerResources(
        appDefinition,
        result,
        { scriptsPresent = true, hasReports = false } = {}
    ) {
        // Constructed ARNs, not Fn::GetAtt: a GetAtt edge to an executor closes a
        // CloudFormation circular dependency via the shared Lambda execution role.
        const fnArn = (logicalName) => ({
            'Fn::Sub': `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:\${self:service}-\${self:provider.stage}-${logicalName}`,
        });
        const scriptExecutorArn = fnArn('adminScriptExecutor');
        const reportExecutorArn = fnArn('reportExecutor');

        // The role invokes whichever executors exist. Keep a single Resource
        // (not a 1-element array) when only one side is present.
        const invokeResources = [
            ...(scriptsPresent ? [scriptExecutorArn] : []),
            ...(hasReports ? [reportExecutorArn] : []),
        ];
        const invokeResource =
            invokeResources.length === 1 ? invokeResources[0] : invokeResources;

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
                            Resource: invokeResource,
                        }],
                    },
                }],
            },
        };

        // Create schedule group (shared by script and report schedules)
        result.resources.AdminScriptScheduleGroup = {
            Type: 'AWS::Scheduler::ScheduleGroup',
            Properties: {
                Name: '${self:service}-${self:provider.stage}-admin-scripts',
            },
        };

        // Router-scoped, not shared provider env. Two reasons: broadcasting the
        // resource references to every function creates CloudFormation circular
        // deps; and SCHEDULER_PROVIDER='aws' is only valid for the admin-scripts
        // adapter (the routers are its sole consumers) — core's scheduler
        // factory, used by integration Lambdas, rejects 'aws', so it must not
        // leak app-wide.
        if (scriptsPresent) {
            result.functions.adminScriptRouter.environment = {
                ...(result.functions.adminScriptRouter.environment || {}),
                SCHEDULER_PROVIDER: 'aws',
                SCHEDULER_ROLE_ARN: {
                    'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
                },
                ADMIN_SCRIPT_SCHEDULE_GROUP: { Ref: 'AdminScriptScheduleGroup' },
                ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN: scriptExecutorArn,
            };
        }

        // The report router targets the report executor and reuses the shared
        // role/group. REPORT_EXECUTOR_LAMBDA_ARN keeps scheduled report messages
        // pointed at the report executor, not the script executor.
        if (hasReports) {
            result.functions.reportRouter.environment = {
                ...(result.functions.reportRouter.environment || {}),
                SCHEDULER_PROVIDER: 'aws',
                SCHEDULER_ROLE_ARN: {
                    'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
                },
                REPORT_SCHEDULE_GROUP: { Ref: 'AdminScriptScheduleGroup' },
                REPORT_EXECUTOR_LAMBDA_ARN: reportExecutorArn,
            };
        }

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
