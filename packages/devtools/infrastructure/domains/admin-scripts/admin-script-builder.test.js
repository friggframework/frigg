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

            // Check for environment variables consumed by the router's scheduler adapter
            expect(result.environment.SCHEDULER_PROVIDER).toBe('aws');
            expect(result.environment.SCHEDULER_ROLE_ARN).toEqual({
                'Fn::GetAtt': ['AdminScriptSchedulerRole', 'Arn'],
            });
            expect(result.environment.ADMIN_SCRIPT_SCHEDULE_GROUP).toEqual({
                Ref: 'AdminScriptScheduleGroup',
            });
            expect(result.environment.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN).toEqual({
                'Fn::GetAtt': ['AdminScriptExecutorLambdaFunction', 'Arn'],
            });
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
            expect(policies[0].PolicyDocument.Statement[0]).toEqual({
                Effect: 'Allow',
                Action: 'lambda:InvokeFunction',
                Resource: { 'Fn::GetAtt': ['AdminScriptExecutorLambdaFunction', 'Arn'] },
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

    describe('getName()', () => {
        it('should return AdminScriptBuilder', () => {
            expect(adminScriptBuilder.getName()).toBe('AdminScriptBuilder');
        });
    });
});
