jest.mock('../bootstrap');
jest.mock('../../application/script-runner');
jest.mock('@friggframework/core/application/commands/admin-script-commands');

const { bootstrapAdminScripts } = require('../bootstrap');
const { createScriptRunner } = require('../../application/script-runner');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const { handler } = require('../script-executor-handler');

describe('Admin Script Executor Handler', () => {
    let mockScriptFactory;
    let mockIntegrationFactory;
    let mockScriptCommands;
    let mockRunner;
    let mockCommands;

    beforeEach(() => {
        mockScriptFactory = { id: 'script-factory' };
        mockIntegrationFactory = { id: 'integration-factory' };
        mockScriptCommands = { id: 'script-commands' };
        mockRunner = { execute: jest.fn() };
        mockCommands = {
            completeAdminProcess: jest.fn().mockResolvedValue({}),
        };

        bootstrapAdminScripts.mockReturnValue({
            scriptFactory: mockScriptFactory,
            integrationFactory: mockIntegrationFactory,
            scriptCommands: mockScriptCommands,
        });
        createScriptRunner.mockReturnValue(mockRunner);
        createAdminScriptCommands.mockReturnValue(mockCommands);

        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        console.error.mockRestore();
        jest.clearAllMocks();
    });

    describe('EventBridge Scheduler direct invoke (no Records)', () => {
        it('injects the bootstrapped factory into the runner and reports the result', async () => {
            mockRunner.execute.mockResolvedValue({
                status: 'COMPLETED',
                executionId: 'exec-1',
            });

            const response = await handler({
                scriptName: 'my-script',
                trigger: 'SCHEDULED',
                params: { foo: 'bar' },
            });

            expect(createScriptRunner).toHaveBeenCalledWith({
                scriptFactory: mockScriptFactory,
                integrationFactory: mockIntegrationFactory,
                scriptCommands: mockScriptCommands,
            });
            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-script',
                { foo: 'bar' },
                expect.objectContaining({ trigger: 'SCHEDULED', mode: 'async' })
            );

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.processed).toBe(1);
            expect(body.results[0]).toEqual({
                scriptName: 'my-script',
                status: 'COMPLETED',
                executionId: 'exec-1',
            });
        });

        it('marks the execution FAILED when the runner throws', async () => {
            mockRunner.execute.mockRejectedValue(new Error('boom'));

            const response = await handler({
                scriptName: 'my-script',
                executionId: 'exec-2',
                trigger: 'SCHEDULED',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.results[0].status).toBe('FAILED');
            expect(mockCommands.completeAdminProcess).toHaveBeenCalledWith(
                'exec-2',
                expect.objectContaining({ state: 'FAILED' })
            );
        });
    });

    describe('SQS batch (Records[])', () => {
        it('injects the bootstrapped factory and processes each record', async () => {
            mockRunner.execute.mockResolvedValue({
                status: 'COMPLETED',
                executionId: 'exec-3',
            });

            const response = await handler({
                Records: [
                    {
                        body: JSON.stringify({
                            scriptName: 'my-script',
                            executionId: 'exec-3',
                            params: {},
                        }),
                    },
                ],
            });

            expect(createScriptRunner).toHaveBeenCalledWith({
                scriptFactory: mockScriptFactory,
                integrationFactory: mockIntegrationFactory,
                scriptCommands: mockScriptCommands,
            });
            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-script',
                {},
                expect.objectContaining({
                    trigger: 'QUEUE',
                    executionId: 'exec-3',
                })
            );

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.processed).toBe(1);
            expect(body.results[0].status).toBe('COMPLETED');
        });

        it('isolates a bad record without dropping the rest of the batch', async () => {
            mockRunner.execute.mockResolvedValue({
                status: 'COMPLETED',
                executionId: 'exec-4',
            });

            const response = await handler({
                Records: [
                    // Missing scriptName -> runMessage throws before the runner
                    { body: JSON.stringify({ executionId: 'exec-bad' }) },
                    {
                        body: JSON.stringify({
                            scriptName: 'my-script',
                            executionId: 'exec-4',
                            params: {},
                        }),
                    },
                ],
            });

            const body = JSON.parse(response.body);
            expect(body.processed).toBe(2);
            expect(body.results[0].status).toBe('FAILED');
            expect(body.results[1].status).toBe('COMPLETED');
            expect(mockCommands.completeAdminProcess).toHaveBeenCalledWith(
                'exec-bad',
                expect.objectContaining({ state: 'FAILED' })
            );
        });
    });
});
