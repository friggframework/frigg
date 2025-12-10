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

const { getScriptFactory } = require('../../application/script-factory');
const { createScriptRunner } = require('../../application/script-runner');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');
const { QueuerUtil } = require('@friggframework/core/queues');

describe('Admin Script Router', () => {
    let mockFactory;
    let mockRunner;
    let mockCommands;

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

        getScriptFactory.mockReturnValue(mockFactory);
        createScriptRunner.mockReturnValue(mockRunner);
        createAdminScriptCommands.mockReturnValue(mockCommands);
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
});
