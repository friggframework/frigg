const request = require('supertest');
const { app } = require('../admin-script-router');
const { AdminScriptBase } = require('../../application/admin-script-base');

// Mock dependencies
jest.mock('../admin-auth-middleware', () => ({
    adminAuthMiddleware: (req, res, next) => {
        // Mock auth - attach admin audit info
        req.adminAudit = {
            apiKeyName: 'test-key',
            apiKeyLast4: '1234',
            ipAddress: '127.0.0.1',
        };
        next();
    },
}));

jest.mock('../../application/script-factory');
jest.mock('../../application/script-runner');
jest.mock('@friggframework/core/application/commands/admin-script-commands');
jest.mock('@friggframework/core/queues');
jest.mock('../../adapters/scheduler-adapter-factory');

const { getScriptFactory } = require('../../application/script-factory');
const { createScriptRunner } = require('../../application/script-runner');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const { createSchedulerAdapter } = require('../../adapters/scheduler-adapter-factory');

describe('Admin Script Router', () => {
    let mockFactory;
    let mockRunner;
    let mockCommands;
    let mockSchedulerAdapter;

    class TestScript extends AdminScriptBase {
        static Definition = {
            name: 'test-script',
            version: '1.0.0',
            description: 'Test script',
            config: { timeout: 300000 },
            display: { category: 'test' },
        };

        async execute(frigg, params) {
            return { success: true, params };
        }
    }

    beforeEach(() => {
        mockFactory = {
            getAll: jest.fn(),
            has: jest.fn(),
            get: jest.fn(),
        };

        mockRunner = {
            execute: jest.fn(),
        };

        mockCommands = {
            createScriptExecution: jest.fn(),
            findScriptExecutionById: jest.fn(),
            findRecentExecutions: jest.fn(),
        };

        mockSchedulerAdapter = {
            createSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
            setScheduleEnabled: jest.fn(),
        };

        getScriptFactory.mockReturnValue(mockFactory);
        createScriptRunner.mockReturnValue(mockRunner);
        createAdminScriptCommands.mockReturnValue(mockCommands);
        createSchedulerAdapter.mockReturnValue(mockSchedulerAdapter);
        QueuerUtil.send = jest.fn().mockResolvedValue({});

        // Default mock implementations
        mockFactory.getAll.mockReturnValue([
            {
                name: 'test-script',
                definition: TestScript.Definition,
                class: TestScript,
            },
        ]);

        mockFactory.has.mockReturnValue(true);
        mockFactory.get.mockReturnValue(TestScript);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /admin/scripts', () => {
        it('should list all registered scripts', async () => {
            const response = await request(app).get('/admin/scripts');

            expect(response.status).toBe(200);
            expect(response.body.scripts).toHaveLength(1);
            expect(response.body.scripts[0]).toEqual({
                name: 'test-script',
                version: '1.0.0',
                description: 'Test script',
                category: 'test',
                requiresIntegrationFactory: false,
                schedule: null,
            });
        });

        it('should handle errors gracefully', async () => {
            mockFactory.getAll.mockImplementation(() => {
                throw new Error('Factory error');
            });

            const response = await request(app).get('/admin/scripts');

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to list scripts');
        });
    });

    describe('GET /admin/scripts/:scriptName', () => {
        it('should return script details', async () => {
            const response = await request(app).get('/admin/scripts/test-script');

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('test-script');
            expect(response.body.version).toBe('1.0.0');
            expect(response.body.description).toBe('Test script');
        });

        it('should return 404 for non-existent script', async () => {
            mockFactory.has.mockReturnValue(false);

            const response = await request(app).get(
                '/admin/scripts/non-existent-script'
            );

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('SCRIPT_NOT_FOUND');
        });
    });

    describe('POST /admin/scripts/:scriptName/execute', () => {
        it('should execute script synchronously', async () => {
            mockRunner.execute.mockResolvedValue({
                executionId: 'exec-123',
                status: 'COMPLETED',
                scriptName: 'test-script',
                output: { success: true },
                metrics: { durationMs: 100 },
            });

            const response = await request(app)
                .post('/admin/scripts/test-script/execute')
                .send({
                    params: { foo: 'bar' },
                    mode: 'sync',
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('COMPLETED');
            expect(response.body.executionId).toBe('exec-123');
            expect(mockRunner.execute).toHaveBeenCalledWith(
                'test-script',
                { foo: 'bar' },
                expect.objectContaining({
                    trigger: 'MANUAL',
                    mode: 'sync',
                })
            );
        });

        it('should queue script for async execution', async () => {
            mockCommands.createScriptExecution.mockResolvedValue({
                id: 'exec-456',
            });

            const response = await request(app)
                .post('/admin/scripts/test-script/execute')
                .send({
                    params: { foo: 'bar' },
                    mode: 'async',
                });

            expect(response.status).toBe(202);
            expect(response.body.status).toBe('PENDING');
            expect(response.body.executionId).toBe('exec-456');
            expect(QueuerUtil.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    scriptName: 'test-script',
                    executionId: 'exec-456',
                }),
                process.env.ADMIN_SCRIPT_QUEUE_URL
            );
        });

        it('should default to async mode', async () => {
            mockCommands.createScriptExecution.mockResolvedValue({
                id: 'exec-789',
            });

            const response = await request(app)
                .post('/admin/scripts/test-script/execute')
                .send({
                    params: { foo: 'bar' },
                });

            expect(response.status).toBe(202);
            expect(response.body.status).toBe('PENDING');
        });

        it('should return 404 for non-existent script', async () => {
            mockFactory.has.mockReturnValue(false);

            const response = await request(app)
                .post('/admin/scripts/non-existent/execute')
                .send({
                    params: {},
                });

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('SCRIPT_NOT_FOUND');
        });
    });

    describe('GET /admin/executions/:executionId', () => {
        it('should return execution details', async () => {
            mockCommands.findScriptExecutionById.mockResolvedValue({
                id: 'exec-123',
                scriptName: 'test-script',
                status: 'COMPLETED',
            });

            const response = await request(app).get('/admin/executions/exec-123');

            expect(response.status).toBe(200);
            expect(response.body.id).toBe('exec-123');
            expect(response.body.scriptName).toBe('test-script');
        });

        it('should return 404 for non-existent execution', async () => {
            mockCommands.findScriptExecutionById.mockResolvedValue({
                error: 404,
                reason: 'Execution not found',
                code: 'EXECUTION_NOT_FOUND',
            });

            const response = await request(app).get(
                '/admin/executions/non-existent'
            );

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('EXECUTION_NOT_FOUND');
        });
    });

    describe('GET /admin/executions', () => {
        it('should list recent executions', async () => {
            mockCommands.findRecentExecutions.mockResolvedValue([
                { id: 'exec-1', scriptName: 'test-script', status: 'COMPLETED' },
                { id: 'exec-2', scriptName: 'test-script', status: 'RUNNING' },
            ]);

            const response = await request(app).get('/admin/executions');

            expect(response.status).toBe(200);
            expect(response.body.executions).toHaveLength(2);
        });

        it('should accept query parameters', async () => {
            mockCommands.findRecentExecutions.mockResolvedValue([]);

            await request(app).get(
                '/admin/executions?scriptName=test-script&status=COMPLETED&limit=10'
            );

            expect(mockCommands.findRecentExecutions).toHaveBeenCalledWith({
                scriptName: 'test-script',
                status: 'COMPLETED',
                limit: 10,
            });
        });
    });

    describe('GET /admin/scripts/:scriptName/schedule', () => {
        it('should return database schedule when override exists', async () => {
            const dbSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 9 * * *',
                timezone: 'America/New_York',
                lastTriggeredAt: new Date('2025-01-01T09:00:00Z'),
                nextTriggerAt: new Date('2025-01-02T09:00:00Z'),
                awsRuleArn: 'arn:aws:events:us-east-1:123456789012:rule/test',
                awsRuleName: 'test-script-schedule',
                createdAt: new Date('2025-01-01T00:00:00Z'),
                updatedAt: new Date('2025-01-01T00:00:00Z'),
            };

            mockCommands.getScheduleByScriptName = jest.fn().mockResolvedValue(dbSchedule);

            const response = await request(app).get('/admin/scripts/test-script/schedule');

            expect(response.status).toBe(200);
            expect(response.body.source).toBe('database');
            expect(response.body.enabled).toBe(true);
            expect(response.body.cronExpression).toBe('0 9 * * *');
            expect(response.body.timezone).toBe('America/New_York');
        });

        it('should return definition schedule when no database override', async () => {
            mockCommands.getScheduleByScriptName = jest.fn().mockResolvedValue(null);

            // Update test script to include schedule
            class ScheduledTestScript extends TestScript {
                static Definition = {
                    ...TestScript.Definition,
                    schedule: {
                        enabled: true,
                        cronExpression: '0 0 * * *',
                        timezone: 'UTC',
                    },
                };
            }

            mockFactory.get.mockReturnValue(ScheduledTestScript);

            const response = await request(app).get('/admin/scripts/test-script/schedule');

            expect(response.status).toBe(200);
            expect(response.body.source).toBe('definition');
            expect(response.body.enabled).toBe(true);
            expect(response.body.cronExpression).toBe('0 0 * * *');
            expect(response.body.timezone).toBe('UTC');
        });

        it('should return none when no schedule configured', async () => {
            mockCommands.getScheduleByScriptName = jest.fn().mockResolvedValue(null);

            const response = await request(app).get('/admin/scripts/test-script/schedule');

            expect(response.status).toBe(200);
            expect(response.body.source).toBe('none');
            expect(response.body.enabled).toBe(false);
        });

        it('should return 404 for non-existent script', async () => {
            mockFactory.has.mockReturnValue(false);

            const response = await request(app).get(
                '/admin/scripts/non-existent/schedule'
            );

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('SCRIPT_NOT_FOUND');
        });
    });

    describe('PUT /admin/scripts/:scriptName/schedule', () => {
        it('should create new schedule', async () => {
            const newSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'America/Los_Angeles',
                lastTriggeredAt: null,
                nextTriggerAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockCommands.upsertSchedule = jest.fn().mockResolvedValue(newSchedule);

            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: true,
                    cronExpression: '0 12 * * *',
                    timezone: 'America/Los_Angeles',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.schedule.source).toBe('database');
            expect(response.body.schedule.enabled).toBe(true);
            expect(response.body.schedule.cronExpression).toBe('0 12 * * *');
            expect(mockCommands.upsertSchedule).toHaveBeenCalledWith({
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'America/Los_Angeles',
            });
        });

        it('should update existing schedule', async () => {
            const updatedSchedule = {
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
                lastTriggeredAt: new Date('2025-01-01T09:00:00Z'),
                nextTriggerAt: null,
                createdAt: new Date('2025-01-01T00:00:00Z'),
                updatedAt: new Date(),
            };

            mockCommands.upsertSchedule = jest.fn().mockResolvedValue(updatedSchedule);

            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: false,
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.schedule.enabled).toBe(false);
        });

        it('should require enabled field', async () => {
            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    cronExpression: '0 12 * * *',
                });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('INVALID_INPUT');
            expect(response.body.error).toContain('enabled');
        });

        it('should require cronExpression when enabled is true', async () => {
            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: true,
                });

            expect(response.status).toBe(400);
            expect(response.body.code).toBe('INVALID_INPUT');
            expect(response.body.error).toContain('cronExpression');
        });

        it('should return 404 for non-existent script', async () => {
            mockFactory.has.mockReturnValue(false);

            const response = await request(app)
                .put('/admin/scripts/non-existent/schedule')
                .send({
                    enabled: true,
                    cronExpression: '0 12 * * *',
                });

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('SCRIPT_NOT_FOUND');
        });

        it('should provision EventBridge schedule when enabled', async () => {
            const newSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'America/Los_Angeles',
                lastTriggeredAt: null,
                nextTriggerAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockCommands.upsertSchedule = jest.fn().mockResolvedValue(newSchedule);
            mockCommands.updateScheduleAwsRule = jest.fn().mockResolvedValue(newSchedule);
            mockSchedulerAdapter.createSchedule.mockResolvedValue({
                ruleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                ruleName: 'frigg-script-test-script',
            });

            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: true,
                    cronExpression: '0 12 * * *',
                    timezone: 'America/Los_Angeles',
                });

            expect(response.status).toBe(200);
            expect(mockSchedulerAdapter.createSchedule).toHaveBeenCalledWith({
                scriptName: 'test-script',
                cronExpression: '0 12 * * *',
                timezone: 'America/Los_Angeles',
            });
            expect(mockCommands.updateScheduleAwsRule).toHaveBeenCalledWith('test-script', {
                awsRuleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                awsRuleName: 'frigg-script-test-script',
            });
            expect(response.body.schedule.awsRuleArn).toBe('arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script');
        });

        it('should delete EventBridge schedule when disabling existing schedule', async () => {
            const existingSchedule = {
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
                awsRuleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                awsRuleName: 'frigg-script-test-script',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockCommands.upsertSchedule = jest.fn().mockResolvedValue(existingSchedule);
            mockCommands.updateScheduleAwsRule = jest.fn().mockResolvedValue(existingSchedule);
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();

            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: false,
                });

            expect(response.status).toBe(200);
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith('test-script');
            expect(mockCommands.updateScheduleAwsRule).toHaveBeenCalledWith('test-script', {
                awsRuleArn: null,
                awsRuleName: null,
            });
        });

        it('should handle scheduler errors gracefully (non-fatal)', async () => {
            const newSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockCommands.upsertSchedule = jest.fn().mockResolvedValue(newSchedule);
            mockSchedulerAdapter.createSchedule.mockRejectedValue(new Error('AWS Scheduler API error'));

            const response = await request(app)
                .put('/admin/scripts/test-script/schedule')
                .send({
                    enabled: true,
                    cronExpression: '0 12 * * *',
                });

            // Request should succeed despite scheduler error
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.schedulerWarning).toBe('AWS Scheduler API error');
        });
    });

    describe('DELETE /admin/scripts/:scriptName/schedule', () => {
        it('should delete schedule override', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    enabled: true,
                    cronExpression: '0 12 * * *',
                },
            });

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.deletedCount).toBe(1);
            expect(response.body.message).toContain('removed');
            expect(mockCommands.deleteSchedule).toHaveBeenCalledWith('test-script');
        });

        it('should return definition schedule after deleting override', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 1,
            });

            // Update test script to include schedule
            class ScheduledTestScript extends TestScript {
                static Definition = {
                    ...TestScript.Definition,
                    schedule: {
                        enabled: true,
                        cronExpression: '0 0 * * *',
                        timezone: 'UTC',
                    },
                };
            }

            mockFactory.get.mockReturnValue(ScheduledTestScript);

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            expect(response.status).toBe(200);
            expect(response.body.effectiveSchedule.source).toBe('definition');
            expect(response.body.effectiveSchedule.enabled).toBe(true);
        });

        it('should handle no schedule found', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 0,
            });

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            expect(response.status).toBe(200);
            expect(response.body.deletedCount).toBe(0);
            expect(response.body.message).toContain('No schedule override found');
        });

        it('should return 404 for non-existent script', async () => {
            mockFactory.has.mockReturnValue(false);

            const response = await request(app).delete(
                '/admin/scripts/non-existent/schedule'
            );

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('SCRIPT_NOT_FOUND');
        });

        it('should delete EventBridge schedule when AWS rule exists', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    enabled: true,
                    cronExpression: '0 12 * * *',
                    awsRuleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                    awsRuleName: 'frigg-script-test-script',
                },
            });
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            expect(response.status).toBe(200);
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith('test-script');
        });

        it('should not call scheduler when no AWS rule exists', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    enabled: true,
                    cronExpression: '0 12 * * *',
                    // No awsRuleArn
                },
            });

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            expect(response.status).toBe(200);
            expect(mockSchedulerAdapter.deleteSchedule).not.toHaveBeenCalled();
        });

        it('should handle scheduler delete errors gracefully (non-fatal)', async () => {
            mockCommands.deleteSchedule = jest.fn().mockResolvedValue({
                acknowledged: true,
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    enabled: true,
                    cronExpression: '0 12 * * *',
                    awsRuleArn: 'arn:aws:scheduler:us-east-1:123456789012:schedule/frigg-admin-scripts/frigg-script-test-script',
                },
            });
            mockSchedulerAdapter.deleteSchedule.mockRejectedValue(new Error('AWS Scheduler delete failed'));

            const response = await request(app).delete(
                '/admin/scripts/test-script/schedule'
            );

            // Request should succeed despite scheduler error
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.schedulerWarning).toBe('AWS Scheduler delete failed');
        });
    });
});
