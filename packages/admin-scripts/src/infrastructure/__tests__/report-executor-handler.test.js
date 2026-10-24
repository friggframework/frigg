jest.mock('../bootstrap');
jest.mock('../../application/report-runner');
jest.mock('@friggframework/core/application/commands/report-commands');
jest.mock('@friggframework/core/queues', () => ({
    QueuerUtil: { send: jest.fn().mockResolvedValue({}) },
}));

const { bootstrapAdminScripts } = require('../bootstrap');
const { createReportRunner } = require('../../application/report-runner');
const {
    createReportCommands,
} = require('@friggframework/core/application/commands/report-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const { handler } = require('../report-executor-handler');

describe('Report Executor Handler', () => {
    let mockReportFactory;
    let mockIntegrationFactory;
    let mockReportFriggCommands;
    let mockRunner;
    let mockCommands;

    beforeEach(() => {
        mockReportFactory = { id: 'report-factory' };
        mockIntegrationFactory = { id: 'integration-factory' };
        mockReportFriggCommands = { id: 'report-frigg-commands' };
        mockRunner = { execute: jest.fn() };
        mockCommands = {
            completeExecution: jest.fn().mockResolvedValue({}),
        };

        bootstrapAdminScripts.mockReturnValue({
            reportFactory: mockReportFactory,
            reportCommands: { id: 'report-commands' },
            reportFriggCommands: mockReportFriggCommands,
            integrationFactory: mockIntegrationFactory,
        });
        createReportRunner.mockReturnValue(mockRunner);
        createReportCommands.mockReturnValue(mockCommands);

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
                reportName: 'my-report',
                trigger: 'SCHEDULED',
                mode: 'snapshot',
                seriesName: 'daily',
                params: { foo: 'bar' },
            });

            expect(createReportRunner).toHaveBeenCalledWith({
                reportFactory: mockReportFactory,
                reportCommands: { id: 'report-commands' },
                friggCommands: mockReportFriggCommands,
                integrationFactory: mockIntegrationFactory,
            });
            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-report',
                { foo: 'bar' },
                expect.objectContaining({
                    trigger: 'SCHEDULED',
                    mode: 'snapshot',
                    seriesName: 'daily',
                })
            );

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.processed).toBe(1);
            expect(body.results[0]).toEqual({
                reportName: 'my-report',
                status: 'COMPLETED',
                executionId: 'exec-1',
            });
        });

        it('defaults mode to recorded and trigger to QUEUE', async () => {
            mockRunner.execute.mockResolvedValue({
                status: 'COMPLETED',
                executionId: 'exec-d',
            });

            await handler({ reportName: 'my-report', params: {} });

            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-report',
                {},
                expect.objectContaining({ mode: 'recorded', trigger: 'QUEUE' })
            );
        });

        it('marks the execution FAILED when the runner throws', async () => {
            mockRunner.execute.mockRejectedValue(new Error('boom'));

            const response = await handler({
                reportName: 'my-report',
                executionId: 'exec-2',
                trigger: 'SCHEDULED',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.results[0].status).toBe('FAILED');
            expect(mockCommands.completeExecution).toHaveBeenCalledWith(
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
                            reportName: 'my-report',
                            executionId: 'exec-3',
                            mode: 'recorded',
                            params: {},
                        }),
                    },
                ],
            });

            expect(createReportRunner).toHaveBeenCalledWith({
                reportFactory: mockReportFactory,
                reportCommands: { id: 'report-commands' },
                friggCommands: mockReportFriggCommands,
                integrationFactory: mockIntegrationFactory,
            });
            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-report',
                {},
                expect.objectContaining({
                    trigger: 'QUEUE',
                    mode: 'recorded',
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
                    // Missing reportName -> runMessage throws before the runner
                    { body: JSON.stringify({ executionId: 'exec-bad' }) },
                    {
                        body: JSON.stringify({
                            reportName: 'my-report',
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
            expect(mockCommands.completeExecution).toHaveBeenCalledWith(
                'exec-bad',
                expect.objectContaining({ state: 'FAILED' })
            );
        });
    });

    describe('self-requeue on CONTINUE', () => {
        afterEach(() => {
            delete process.env.REPORT_QUEUE_URL;
        });

        it('passes the Lambda context to the runner', async () => {
            mockRunner.execute.mockResolvedValue({
                status: 'COMPLETED',
                executionId: 'exec-ctx',
            });
            const lambdaContext = {
                getRemainingTimeInMillis: () => 12345,
            };

            await handler(
                { reportName: 'my-report', executionId: 'exec-ctx', params: {} },
                lambdaContext
            );

            expect(mockRunner.execute).toHaveBeenCalledWith(
                'my-report',
                {},
                expect.objectContaining({ lambdaContext })
            );
        });

        it('re-enqueues the same execution with a resume marker when the runner returns CONTINUE', async () => {
            process.env.REPORT_QUEUE_URL = 'https://sqs.local/report-queue';
            mockRunner.execute.mockResolvedValue({
                status: 'CONTINUE',
                executionId: 'exec-cont',
                continuation: { cursor: 7 },
            });

            const response = await handler(
                {
                    reportName: 'my-report',
                    executionId: 'exec-cont',
                    mode: 'recorded',
                    params: { since: '2026-01-01' },
                },
                { getRemainingTimeInMillis: () => 5000 }
            );

            expect(QueuerUtil.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    reportName: 'my-report',
                    executionId: 'exec-cont',
                    mode: 'recorded',
                    trigger: 'QUEUE',
                    params: {
                        since: '2026-01-01',
                        __resume: { cursor: 7 },
                    },
                    resumeAt: expect.any(String),
                }),
                'https://sqs.local/report-queue'
            );

            const body = JSON.parse(response.body);
            expect(body.results[0].status).toBe('CONTINUE');
        });

        it('fails the record when a continuation is yielded but REPORT_QUEUE_URL is unset', async () => {
            delete process.env.REPORT_QUEUE_URL;
            mockRunner.execute.mockResolvedValue({
                status: 'CONTINUE',
                executionId: 'exec-noqueue',
                continuation: { cursor: 1 },
            });

            const response = await handler({
                reportName: 'my-report',
                executionId: 'exec-noqueue',
                params: {},
            });

            expect(QueuerUtil.send).not.toHaveBeenCalled();
            const body = JSON.parse(response.body);
            expect(body.results[0].status).toBe('FAILED');
            expect(mockCommands.completeExecution).toHaveBeenCalledWith(
                'exec-noqueue',
                expect.objectContaining({ state: 'FAILED' })
            );
        });

        it('compensates with the RUNNER-created id on a scheduled first run that cannot re-queue (no inbound executionId)', async () => {
            // A real EventBridge scheduled event carries NO executionId — the
            // runner creates the record. If the continuation can't be re-queued,
            // the record must still be marked FAILED using the runner-created id,
            // not the absent inbound one.
            delete process.env.REPORT_QUEUE_URL;
            mockRunner.execute.mockResolvedValue({
                status: 'CONTINUE',
                executionId: 'runner-created-exec',
                continuation: { cursor: 1 },
            });

            const response = await handler({
                reportName: 'my-report',
                trigger: 'SCHEDULED',
                mode: 'snapshot',
                params: {},
                // note: no executionId, matching the scheduler's buildInput
            });

            expect(QueuerUtil.send).not.toHaveBeenCalled();
            expect(mockCommands.completeExecution).toHaveBeenCalledWith(
                'runner-created-exec',
                expect.objectContaining({ state: 'FAILED' })
            );
            const body = JSON.parse(response.body);
            expect(body.results[0].status).toBe('FAILED');
        });
    });
});
