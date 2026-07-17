/**
 * Tests for Admin Script Builder
 *
 * Tests admin script infrastructure generation including:
 * - SQS queue for script execution
 * - Lambda executor function
 * - Lambda router function with HTTP routes
 * - EventBridge Scheduler resources (optional)
 */

const { AdminScriptBuilder } = require('./admin-script-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('AdminScriptBuilder', () => {
    let adminScriptBuilder;

    beforeEach(() => {
        adminScriptBuilder = new AdminScriptBuilder();
    });

    describe('shouldExecute()', () => {
        it('should return false when no adminScripts', () => {
            const appDefinition = {};

            expect(adminScriptBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when adminScripts is empty array', () => {
            const appDefinition = {
                adminScripts: [],
            };

            expect(adminScriptBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return true when adminScripts has items', () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            expect(adminScriptBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when adminScripts is not an array', () => {
            const appDefinition = {
                adminScripts: { name: 'test' },
            };

            expect(adminScriptBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = adminScriptBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('validate()', () => {
        it('should pass validation with valid adminScripts', () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'oauth-refresh' } },
                    { Definition: { name: 'health-check' } },
                ],
            };

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass when adminScripts is undefined', () => {
            const appDefinition = {};

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should fail when adminScripts is not an array', () => {
            const appDefinition = {
                adminScripts: 'invalid',
            };

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('adminScripts must be an array');
        });

        it('should fail when script missing Definition.name', () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: {} },
                ],
            };

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'Admin script at index 0 is missing Definition or name'
            );
        });

        it('should fail when script missing Definition', () => {
            const appDefinition = {
                adminScripts: [
                    { someOtherField: 'value' },
                ],
            };

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'Admin script at index 0 is missing Definition or name'
            );
        });

        it('should validate all scripts', () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'valid' } },
                    { Definition: {} }, // Invalid - no name
                    { someField: 'value' }, // Invalid - no Definition
                ],
            };

            const result = adminScriptBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(2);
        });
    });

    describe('build()', () => {
        it('should create AdminScriptQueue resource', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptQueue).toBeDefined();
            expect(result.resources.AdminScriptQueue.Type).toBe('AWS::SQS::Queue');
        });

        it('should configure AdminScriptQueue with correct retention and timeout', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptQueue.Properties.MessageRetentionPeriod).toBe(86400); // 1 day
            expect(result.resources.AdminScriptQueue.Properties.VisibilityTimeout).toBe(900); // 15 minutes
        });

        it('should configure AdminScriptQueue redrive policy to InternalErrorQueue', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptQueue.Properties.RedrivePolicy).toEqual({
                maxReceiveCount: 3,
                deadLetterTargetArn: {
                    'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                },
            });
        });

        it('should add ADMIN_SCRIPT_QUEUE_URL to environment variables', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.environment.ADMIN_SCRIPT_QUEUE_URL).toEqual({
                Ref: 'AdminScriptQueue',
            });
        });

        it('should create adminScriptExecutor function', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor).toBeDefined();
            expect(result.functions.adminScriptExecutor.handler).toBe(
                'node_modules/@friggframework/admin-scripts/src/infrastructure/script-executor-handler.handler'
            );
        });

        it('should configure adminScriptExecutor with SQS event', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.events).toEqual([
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['AdminScriptQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ]);
        });

        it('should set adminScriptExecutor timeout to 900 seconds', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.timeout).toBe(900); // 15 minutes (Lambda max)
        });

        it('should set adminScriptExecutor memory size', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.memorySize).toBe(1024);
        });

        it('should exclude aws-sdk/Prisma from the skipEsbuild function packages', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            // Regression: without a package config the skipEsbuild functions
            // package the whole node_modules and exceed Lambda's 250 MB limit.
            for (const fn of [
                result.functions.adminScriptExecutor,
                result.functions.adminScriptRouter,
            ]) {
                expect(fn.package.exclude).toEqual(
                    expect.arrayContaining([
                        'node_modules/aws-sdk/**',
                        'node_modules/@aws-sdk/**',
                        'node_modules/@prisma/**',
                    ])
                );
            }
        });

        it('should attach Prisma layer to adminScriptExecutor', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should create adminScriptRouter function', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptRouter).toBeDefined();
            expect(result.functions.adminScriptRouter.handler).toBe(
                'node_modules/@friggframework/admin-scripts/src/infrastructure/admin-script-router.handler'
            );
        });

        it('should configure adminScriptRouter with correct HTTP routes', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptRouter.events).toEqual([
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
            ]);
        });

        it('should set adminScriptRouter timeout to 30 seconds', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptRouter.timeout).toBe(30);
        });

        it('should attach Prisma layer to adminScriptRouter', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptRouter.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' }
            ]);
        });

        it('should create scheduler resources when admin.enableScheduling is true', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
                admin: {
                    enableScheduling: true,
                },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            // Check for scheduler IAM role
            expect(result.resources.AdminScriptSchedulerRole).toBeDefined();
            expect(result.resources.AdminScriptSchedulerRole.Type).toBe('AWS::IAM::Role');

            // Check for schedule group
            expect(result.resources.AdminScriptScheduleGroup).toBeDefined();
            expect(result.resources.AdminScriptScheduleGroup.Type).toBe('AWS::Scheduler::ScheduleGroup');

            // Scheduler env vars are scoped to the router function (not the
            // shared provider env): resource refs would create CloudFormation
            // circular deps, and SCHEDULER_PROVIDER='aws' would break core's
            // scheduler factory (rejects 'aws') for every other Lambda.
            const routerEnv = result.functions.adminScriptRouter.environment;
            expect(routerEnv.SCHEDULER_PROVIDER).toBe('aws');
            expect(result.environment.SCHEDULER_PROVIDER).toBeUndefined();
            expect(routerEnv.SCHEDULER_ROLE_ARN).toEqual({
                'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
            });
            expect(routerEnv.ADMIN_SCRIPT_SCHEDULE_GROUP).toEqual({
                Ref: 'AdminScriptScheduleGroup',
            });
            // Executor referenced by constructed ARN (Fn::Sub), not Fn::GetAtt,
            // so it creates no dependency edge.
            expect(routerEnv.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN).toEqual({
                'Fn::Sub':
                    'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-adminScriptExecutor',
            });

            // Regression guard: these must NOT leak onto the shared provider env
            // (that is what produced the circular dependency, incl. the executor
            // self-reference).
            expect(result.environment.SCHEDULER_ROLE_ARN).toBeUndefined();
            expect(result.environment.ADMIN_SCRIPT_SCHEDULE_GROUP).toBeUndefined();
            expect(
                result.environment.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN
            ).toBeUndefined();
        });

        it('should not create scheduler resources when enableScheduling is false', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
                admin: {
                    enableScheduling: false,
                },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptSchedulerRole).toBeUndefined();
            expect(result.resources.AdminScriptScheduleGroup).toBeUndefined();
            expect(result.environment.SCHEDULER_ROLE_ARN).toBeUndefined();
            expect(result.environment.ADMIN_SCRIPT_SCHEDULE_GROUP).toBeUndefined();
        });

        it('should not create scheduler resources when admin config is not provided', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptSchedulerRole).toBeUndefined();
            expect(result.resources.AdminScriptScheduleGroup).toBeUndefined();
        });

        it('should use skipEsbuild for all functions', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.skipEsbuild).toBe(true);
            expect(result.functions.adminScriptRouter.skipEsbuild).toBe(true);
        });

        it('should not attach Prisma layer when usePrismaLambdaLayer=false', async () => {
            const appDefinition = {
                usePrismaLambdaLayer: false,
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.functions.adminScriptExecutor.layers).toBeUndefined();
            expect(result.functions.adminScriptRouter.layers).toBeUndefined();
        });

        it('should handle multiple admin scripts', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'oauth-refresh' } },
                    { Definition: { name: 'health-check' } },
                    { Definition: { name: 'attio-healing' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            // Should still only create one queue and two functions
            expect(result.resources.AdminScriptQueue).toBeDefined();
            expect(result.functions.adminScriptExecutor).toBeDefined();
            expect(result.functions.adminScriptRouter).toBeDefined();

            // Should not create separate resources per script
            expect(Object.keys(result.resources)).toHaveLength(1); // Only AdminScriptQueue
            expect(Object.keys(result.functions)).toHaveLength(2); // Only executor and router
        });

        it('should configure scheduler role with correct trust policy', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
                admin: {
                    enableScheduling: true,
                },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const trustPolicy = result.resources.AdminScriptSchedulerRole.Properties.AssumeRolePolicyDocument;

            expect(trustPolicy.Statement[0]).toEqual({
                Effect: 'Allow',
                Principal: { Service: 'scheduler.amazonaws.com' },
                Action: 'sts:AssumeRole',
            });
        });

        it('should configure scheduler role with Lambda invoke permission', async () => {
            const appDefinition = {
                adminScripts: [
                    { Definition: { name: 'test-script' } },
                ],
                admin: {
                    enableScheduling: true,
                },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const policies = result.resources.AdminScriptSchedulerRole.Properties.Policies;

            expect(policies[0].PolicyName).toBe('InvokeLambda');
            // Constructed ARN (Fn::Sub), not Fn::GetAtt — a GetAtt here closes a
            // circular dependency through the shared Lambda execution role.
            expect(policies[0].PolicyDocument.Statement[0]).toEqual({
                Effect: 'Allow',
                Action: 'lambda:InvokeFunction',
                Resource: {
                    'Fn::Sub':
                        'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-adminScriptExecutor',
                },
            });
        });

        it('should grant the router SendMessage on AdminScriptQueue', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const sqsGrant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('sqs:SendMessage')
            );
            expect(sqsGrant).toBeDefined();
            expect(sqsGrant.Action).toContain('sqs:SendMessageBatch');
            expect(sqsGrant.Resource).toEqual({
                'Fn::GetAtt': ['AdminScriptQueue', 'Arn'],
            });
        });

        it('should grant scheduler:* + iam:PassRole when scheduling is enabled', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
                admin: { enableScheduling: true },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const schedulerGrant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('scheduler:CreateSchedule')
            );
            expect(schedulerGrant).toBeDefined();
            expect(schedulerGrant.Action).toEqual(
                expect.arrayContaining([
                    'scheduler:CreateSchedule',
                    'scheduler:UpdateSchedule',
                    'scheduler:DeleteSchedule',
                    'scheduler:GetSchedule',
                ])
            );
            expect(schedulerGrant.Resource['Fn::Sub'][1]).toEqual({
                GroupName: { Ref: 'AdminScriptScheduleGroup' },
            });

            const passRole = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) && s.Action.includes('iam:PassRole')
            );
            expect(passRole).toBeDefined();
            expect(passRole.Resource).toEqual({
                'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
            });
            expect(passRole.Condition.StringEquals['iam:PassedToService']).toBe(
                'scheduler.amazonaws.com'
            );
        });

        it('should add no scheduler IAM statements when scheduling is disabled', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const schedulerGrant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.some((a) => a.startsWith('scheduler:'))
            );
            expect(schedulerGrant).toBeUndefined();
        });
    });

    describe('reports (ReportQueue + reportExecutor)', () => {
        it('creates ReportQueue + reportExecutor and wires REPORT_QUEUE_URL when reports are present', async () => {
            const appDefinition = {
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            // Queue
            expect(result.resources.ReportQueue).toBeDefined();
            expect(result.resources.ReportQueue.Type).toBe('AWS::SQS::Queue');
            expect(
                result.resources.ReportQueue.Properties.MessageRetentionPeriod
            ).toBe(86400);
            expect(
                result.resources.ReportQueue.Properties.VisibilityTimeout
            ).toBe(900);
            expect(
                result.resources.ReportQueue.Properties.RedrivePolicy
            ).toEqual({
                maxReceiveCount: 3,
                deadLetterTargetArn: {
                    'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
                },
            });

            // Executor function
            expect(result.functions.reportExecutor).toBeDefined();
            expect(result.functions.reportExecutor.handler).toBe(
                'node_modules/@friggframework/admin-scripts/src/infrastructure/report-executor-handler.handler'
            );
            expect(result.functions.reportExecutor.timeout).toBe(900);
            expect(result.functions.reportExecutor.memorySize).toBe(1024);
            expect(result.functions.reportExecutor.events).toEqual([
                {
                    sqs: {
                        arn: { 'Fn::GetAtt': ['ReportQueue', 'Arn'] },
                        batchSize: 1,
                    },
                },
            ]);
            expect(result.functions.reportExecutor.skipEsbuild).toBe(true);
            expect(result.functions.reportExecutor.layers).toEqual([
                { Ref: 'PrismaLambdaLayer' },
            ]);

            // Env wired app-wide (scoped flag off)
            expect(result.environment.REPORT_QUEUE_URL).toEqual({
                Ref: 'ReportQueue',
            });

            // IAM SendMessage grant on the queue Arn
            const grant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('sqs:SendMessage') &&
                    s.Resource &&
                    s.Resource['Fn::GetAtt'] &&
                    s.Resource['Fn::GetAtt'][0] === 'ReportQueue'
            );
            expect(grant).toBeDefined();
            expect(grant.Action).toContain('sqs:SendMessageBatch');
        });

        it('scopes REPORT_QUEUE_URL to reportRouter + reportExecutor when scopedEnvironment is on', async () => {
            const appDefinition = {
                lambda: { scopedEnvironment: true },
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.environment.REPORT_QUEUE_URL).toBeUndefined();
            for (const fnName of ['reportRouter', 'reportExecutor']) {
                expect(
                    result.functionEnvironments[fnName].REPORT_QUEUE_URL
                ).toEqual({ Ref: 'ReportQueue' });
            }
        });

        it('creates ReportQueue + reportExecutor when only builtin reports are enabled', async () => {
            const appDefinition = {
                admin: { includeBuiltinReports: true },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.ReportQueue).toBeDefined();
            expect(result.functions.reportExecutor).toBeDefined();
        });

        it('does NOT create ReportQueue or reportExecutor when only adminScripts are present', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.ReportQueue).toBeUndefined();
            expect(result.functions.reportExecutor).toBeUndefined();
            expect(result.functions.reportRouter).toBeUndefined();
            expect(result.environment.REPORT_QUEUE_URL).toBeUndefined();
        });
    });

    describe('report artifacts (ReportArtifactBucket for non-JSON output)', () => {
        it('provisions a private encrypted bucket + IAM + env when a report emits non-JSON', async () => {
            const appDefinition = {
                reports: [
                    {
                        Definition: {
                            name: 'sales-csv',
                            version: '1.0.0',
                            output: { format: 'csv' },
                        },
                    },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const bucket = result.resources.ReportArtifactBucket;
            expect(bucket).toBeDefined();
            expect(bucket.Type).toBe('AWS::S3::Bucket');
            expect(
                bucket.Properties.BucketEncryption
                    .ServerSideEncryptionConfiguration[0]
                    .ServerSideEncryptionByDefault.SSEAlgorithm
            ).toBe('AES256');
            expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            });

            // Env wired app-wide (scoped flag off).
            expect(result.environment.REPORT_ARTIFACT_BUCKET).toEqual({
                Ref: 'ReportArtifactBucket',
            });

            // IAM: object-level Put/Get scoped to the bucket keys.
            const grant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('s3:PutObject')
            );
            expect(grant).toBeDefined();
            expect(grant.Action).toContain('s3:GetObject');
            expect(grant.Resource['Fn::Sub'][0]).toBe('${BucketArn}/*');
            expect(grant.Resource['Fn::Sub'][1]).toEqual({
                BucketArn: { 'Fn::GetAtt': ['ReportArtifactBucket', 'Arn'] },
            });
        });

        it('does NOT provision the bucket for JSON-only reports', async () => {
            const appDefinition = {
                reports: [
                    {
                        Definition: {
                            name: 'json-report',
                            version: '1.0.0',
                            output: { format: 'json' },
                        },
                    },
                    // No output field defaults to JSON.
                    { Definition: { name: 'plain', version: '1.0.0' } },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.ReportArtifactBucket).toBeUndefined();
            expect(result.environment.REPORT_ARTIFACT_BUCKET).toBeUndefined();
            const grant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('s3:PutObject')
            );
            expect(grant).toBeUndefined();
        });

        it('scopes REPORT_ARTIFACT_BUCKET to report functions when scopedEnvironment is on', async () => {
            const appDefinition = {
                lambda: { scopedEnvironment: true },
                reports: [
                    {
                        Definition: {
                            name: 'sales-csv',
                            version: '1.0.0',
                            output: { format: 'csv' },
                        },
                    },
                ],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.environment.REPORT_ARTIFACT_BUCKET).toBeUndefined();
            for (const fnName of ['reportRouter', 'reportExecutor']) {
                expect(
                    result.functionEnvironments[fnName].REPORT_ARTIFACT_BUCKET
                ).toEqual({ Ref: 'ReportArtifactBucket' });
            }
        });
    });

    describe('report scheduling (enableScheduling && reports)', () => {
        it('wires the report scheduler env onto reportRouter targeting the report executor', async () => {
            const appDefinition = {
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
                admin: { enableScheduling: true },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            // Shared scheduler role + group are created even without scripts.
            expect(result.resources.AdminScriptSchedulerRole).toBeDefined();
            expect(result.resources.AdminScriptScheduleGroup).toBeDefined();

            const routerEnv = result.functions.reportRouter.environment;
            expect(routerEnv.SCHEDULER_PROVIDER).toBe('aws');
            expect(routerEnv.SCHEDULER_ROLE_ARN).toEqual({
                'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
            });
            expect(routerEnv.REPORT_SCHEDULE_GROUP).toEqual({
                Ref: 'AdminScriptScheduleGroup',
            });
            // Constructed ARN (Fn::Sub), not Fn::GetAtt — avoids a circular dep.
            expect(routerEnv.REPORT_EXECUTOR_LAMBDA_ARN).toEqual({
                'Fn::Sub':
                    'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-reportExecutor',
            });

            // Must NOT leak onto the shared provider env.
            expect(result.environment.SCHEDULER_PROVIDER).toBeUndefined();
            expect(result.environment.REPORT_EXECUTOR_LAMBDA_ARN).toBeUndefined();
        });

        it('grants the scheduler role invoke on the report executor (reports-only)', async () => {
            const appDefinition = {
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
                admin: { enableScheduling: true },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const statement =
                result.resources.AdminScriptSchedulerRole.Properties.Policies[0]
                    .PolicyDocument.Statement[0];
            // Only reports present -> single Resource, the report executor ARN.
            expect(statement.Resource).toEqual({
                'Fn::Sub':
                    'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-reportExecutor',
            });

            // scheduler:* + iam:PassRole grants present.
            const schedulerGrant = result.iamStatements.find(
                (s) =>
                    Array.isArray(s.Action) &&
                    s.Action.includes('scheduler:CreateSchedule')
            );
            expect(schedulerGrant).toBeDefined();
        });

        it('lets the scheduler role invoke BOTH executors when scripts and reports coexist', async () => {
            const appDefinition = {
                adminScripts: [{ Definition: { name: 'test-script' } }],
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
                admin: { enableScheduling: true },
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            const statement =
                result.resources.AdminScriptSchedulerRole.Properties.Policies[0]
                    .PolicyDocument.Statement[0];
            expect(statement.Resource).toEqual([
                {
                    'Fn::Sub':
                        'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-adminScriptExecutor',
                },
                {
                    'Fn::Sub':
                        'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:${self:service}-${self:provider.stage}-reportExecutor',
                },
            ]);

            // Both routers get their own scheduler env.
            expect(
                result.functions.adminScriptRouter.environment
                    .ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN
            ).toBeDefined();
            expect(
                result.functions.reportRouter.environment
                    .REPORT_EXECUTOR_LAMBDA_ARN
            ).toBeDefined();
        });

        it('does NOT wire report scheduler env when enableScheduling is off', async () => {
            const appDefinition = {
                reports: [{ Definition: { name: 'my-report', version: '1.0.0' } }],
            };

            const result = await adminScriptBuilder.build(appDefinition, {});

            expect(result.resources.AdminScriptSchedulerRole).toBeUndefined();
            expect(
                result.functions.reportRouter.environment
            ).toBeUndefined();
        });
    });

    describe('getName()', () => {
        it('should return AdminScriptBuilder', () => {
            expect(adminScriptBuilder.getName()).toBe('AdminScriptBuilder');
        });
    });

    describe('scoped environment (lambda.scopedEnvironment)', () => {
        const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

        beforeEach(() => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        });

        afterEach(() => {
            if (originalSkipDiscovery === undefined) {
                delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            } else {
                process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
            }
        });

        it('scopes ADMIN_SCRIPT_QUEUE_URL to the admin functions only', async () => {
            const result = await adminScriptBuilder.build(
                {
                    lambda: { scopedEnvironment: true },
                    adminScripts: [{ Definition: { name: 'fix-things' } }],
                },
                {}
            );

            expect(result.environment.ADMIN_SCRIPT_QUEUE_URL).toBeUndefined();
            for (const fnName of ['adminScriptRouter', 'adminScriptExecutor']) {
                expect(
                    result.functionEnvironments[fnName].ADMIN_SCRIPT_QUEUE_URL
                ).toEqual({ Ref: 'AdminScriptQueue' });
            }
        });

        it('broadcasts app-wide when the flag is off', async () => {
            const result = await adminScriptBuilder.build(
                { adminScripts: [{ Definition: { name: 'fix-things' } }] },
                {}
            );

            expect(result.environment.ADMIN_SCRIPT_QUEUE_URL).toEqual({
                Ref: 'AdminScriptQueue',
            });
            expect(result.functionEnvironments).toBeUndefined();
        });
    });
});
