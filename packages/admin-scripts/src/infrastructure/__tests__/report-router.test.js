const request = require('supertest');

jest.mock('../admin-auth-middleware', () => ({
    validateAdminApiKey: (req, res, next) => next(),
}));
jest.mock('../bootstrap');
jest.mock('@friggframework/core/queues', () => ({
    QueuerUtil: { send: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@friggframework/core/application/commands/admin-script-commands');
jest.mock('../../adapters/scheduler-adapter-factory');

const { app } = require('../report-router');
const { bootstrapAdminScripts } = require('../bootstrap');
const { QueuerUtil } = require('@friggframework/core/queues');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const {
    createReportSchedulerAdapterFromEnv,
} = require('../../adapters/scheduler-adapter-factory');
const { ScriptFactory } = require('../../application/script-factory');

class DemoReport {
    static Definition = {
        name: 'demo',
        version: '1.0.0',
        description: 'demo report',
        runModes: ['live', 'recorded', 'snapshot'],
        output: { format: 'json' },
        inputSchema: {
            type: 'object',
            properties: { n: { type: 'integer' } },
        },
        display: { category: 'reporting' },
    };
    async execute(frigg, params) {
        return { ok: true, n: params.n ?? 0 };
    }
}

class IntegrationsReport {
    static Definition = {
        name: 'integrations',
        version: '1.0.0',
        description: 'integrations report',
        runModes: ['live', 'recorded', 'snapshot'],
        output: { format: 'json' },
        display: { category: 'reporting' },
    };
    async execute(frigg, params) {
        return { schemaVersion: 1, filters: params };
    }
}

class ScheduledReport {
    static Definition = {
        name: 'scheduled',
        version: '2.0.0',
        runModes: ['recorded', 'snapshot'],
        output: { format: 'json' },
        // Declares a preferred scheduled run mode.
        schedule: { mode: 'recorded' },
    };
    async execute() {
        return { ok: true };
    }
}

describe('Report Router', () => {
    let server;
    let mockReportCommands;
    let mockScheduleCommands;
    let mockSchedulerAdapter;

    beforeAll((done) => {
        server = app.listen(0, done);
    });
    afterAll((done) => {
        server.close(done);
    });

    beforeEach(() => {
        process.env.REPORT_QUEUE_URL = 'https://sqs.local/report-queue';
        mockReportCommands = {
            createExecution: jest
                .fn()
                .mockResolvedValue({ id: 'report-exec-1' }),
            completeExecution: jest.fn().mockResolvedValue({ success: true }),
            findExecutionById: jest.fn(),
            findSnapshotSeries: jest.fn(),
        };
        bootstrapAdminScripts.mockReturnValue({
            reportFactory: new ScriptFactory([
                DemoReport,
                IntegrationsReport,
                ScheduledReport,
            ]),
            reportFriggCommands: {},
            reportCommands: mockReportCommands,
            integrationFactory: null,
        });

        mockScheduleCommands = {
            getScheduleByScriptName: jest.fn().mockResolvedValue(null),
            upsertSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
            updateScheduleExternalInfo: jest.fn().mockResolvedValue({}),
        };
        mockSchedulerAdapter = {
            createSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
        };
        createAdminScriptCommands.mockReturnValue(mockScheduleCommands);
        createReportSchedulerAdapterFromEnv.mockReturnValue(
            mockSchedulerAdapter
        );

        QueuerUtil.send.mockClear();
    });

    afterEach(() => {
        delete process.env.REPORT_QUEUE_URL;
        jest.clearAllMocks();
    });

    it('GET /api/v2/reports lists report definitions', async () => {
        const res = await request(server).get('/api/v2/reports');
        expect(res.status).toBe(200);
        expect(res.body.service).toBe('frigg-core-api');
        const names = res.body.reports.map((r) => r.name).sort();
        expect(names).toEqual(['demo', 'integrations', 'scheduled']);
    });

    it('GET /api/v2/reports/:name returns the definition detail', async () => {
        const res = await request(server).get('/api/v2/reports/demo');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            name: 'demo',
            runModes: ['live', 'recorded', 'snapshot'],
            output: { format: 'json' },
        });
    });

    it('GET /api/v2/reports/:name 404s an unknown report', async () => {
        const res = await request(server).get('/api/v2/reports/nope');
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('REPORT_NOT_FOUND');
    });

    it('POST /:name/run live returns the runner envelope with inline output', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'live', params: { n: 3 } });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 'COMPLETED',
            mode: 'live',
            output: { ok: true, n: 3 },
        });
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('POST /:name/run 400s invalid input', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'live', params: { n: 'not-a-number' } });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
    });

    it('POST /:name/run recorded 400s invalid input WITHOUT creating a record or enqueueing', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'recorded', params: { n: 'not-a-number' } });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_INPUT');
        // The bad request must be rejected up front, not persisted + queued.
        expect(mockReportCommands.createExecution).not.toHaveBeenCalled();
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('POST /:name/run 400s an unsupported mode WITHOUT creating a record', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'bogus', params: {} });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_MODE');
        expect(mockReportCommands.createExecution).not.toHaveBeenCalled();
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('POST /:name/run recorded creates a record and enqueues it (202)', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'recorded', params: { n: 5 } });

        expect(res.status).toBe(202);
        expect(res.body).toEqual({
            executionId: 'report-exec-1',
            status: 'QUEUED',
            reportName: 'demo',
        });
        expect(mockReportCommands.createExecution).toHaveBeenCalledWith(
            expect.objectContaining({
                reportName: 'demo',
                reportVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'recorded',
                input: { n: 5 },
            })
        );
        expect(QueuerUtil.send).toHaveBeenCalledWith(
            expect.objectContaining({
                reportName: 'demo',
                executionId: 'report-exec-1',
                mode: 'recorded',
                trigger: 'MANUAL',
                params: { n: 5 },
            }),
            'https://sqs.local/report-queue'
        );
    });

    it('POST /:name/run snapshot forwards the seriesName', async () => {
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'snapshot', params: {}, seriesName: 'daily' });

        expect(res.status).toBe(202);
        expect(mockReportCommands.createExecution).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'snapshot', seriesName: 'daily' })
        );
        expect(QueuerUtil.send).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'snapshot', seriesName: 'daily' }),
            'https://sqs.local/report-queue'
        );
    });

    it('POST /:name/run 503s when REPORT_QUEUE_URL is not configured', async () => {
        delete process.env.REPORT_QUEUE_URL;
        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'recorded', params: {} });

        expect(res.status).toBe(503);
        expect(res.body.code).toBe('QUEUE_NOT_CONFIGURED');
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('POST /:name/run surfaces a createExecution error and does not enqueue', async () => {
        mockReportCommands.createExecution.mockResolvedValue({
            error: 500,
            reason: 'db down',
            code: 'DB_ERROR',
        });

        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'recorded', params: {} });

        expect(res.status).toBe(500);
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('POST /:name/run marks the record FAILED if enqueue throws after createExecution', async () => {
        QueuerUtil.send.mockRejectedValueOnce(new Error('sqs down'));

        const res = await request(server)
            .post('/api/v2/reports/demo/run')
            .send({ mode: 'recorded', params: {} });

        expect(res.status).toBe(500);
        // The persisted record must be compensated, not left non-terminal.
        expect(mockReportCommands.completeExecution).toHaveBeenCalledWith(
            'report-exec-1',
            expect.objectContaining({ state: 'FAILED' })
        );
    });

    it('GET /api/v2/reports/executions/:id returns the report execution', async () => {
        mockReportCommands.findExecutionById.mockResolvedValue({
            id: 'report-exec-1',
            type: 'REPORT',
            state: 'COMPLETED',
        });

        const res = await request(server).get(
            '/api/v2/reports/executions/report-exec-1'
        );

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            id: 'report-exec-1',
            state: 'COMPLETED',
        });
        expect(mockReportCommands.findExecutionById).toHaveBeenCalledWith(
            'report-exec-1'
        );
    });

    it('GET /api/v2/reports/executions/:id 404s a non-report execution', async () => {
        mockReportCommands.findExecutionById.mockResolvedValue({
            error: 404,
            reason: 'Report execution x not found',
            code: 'EXECUTION_NOT_FOUND',
        });

        const res = await request(server).get(
            '/api/v2/reports/executions/x'
        );

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('EXECUTION_NOT_FOUND');
    });

    it('GET /api/v2/reports/:name/snapshots returns the series', async () => {
        mockReportCommands.findSnapshotSeries.mockResolvedValue([
            { executionId: 'e1', capturedAt: '2026-01-01', summary: null },
        ]);

        const res = await request(server)
            .get('/api/v2/reports/demo/snapshots')
            .query({ from: '2026-01-01', to: '2026-02-01' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            snapshots: [
                { executionId: 'e1', capturedAt: '2026-01-01', summary: null },
            ],
        });
        expect(mockReportCommands.findSnapshotSeries).toHaveBeenCalledWith(
            'demo',
            { from: '2026-01-01', to: '2026-02-01' }
        );
    });

    it('GET /api/v2/reports/:name/snapshots 404s an unknown report', async () => {
        const res = await request(server).get(
            '/api/v2/reports/nope/snapshots'
        );

        expect(res.status).toBe(404);
        expect(res.body.code).toBe('REPORT_NOT_FOUND');
        expect(mockReportCommands.findSnapshotSeries).not.toHaveBeenCalled();
    });

    it('GET /api/v2/reports/integrations (back-compat) returns the payload directly', async () => {
        const res = await request(server)
            .get('/api/v2/reports/integrations')
            .query({ status: 'ENABLED' });
        expect(res.status).toBe(200);
        // payload directly, not the runner envelope
        expect(res.body).toMatchObject({
            schemaVersion: 1,
            filters: { status: 'ENABLED' },
        });
        expect(res.body.status).toBeUndefined();
    });

    describe('schedule routes', () => {
        it('GET /:name/schedule returns the effective schedule (none when no override)', async () => {
            mockScheduleCommands.getScheduleByScriptName.mockResolvedValue(null);

            const res = await request(server).get(
                '/api/v2/reports/demo/schedule'
            );

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                source: 'none',
                reportName: 'demo',
                enabled: false,
            });
            expect(
                mockScheduleCommands.getScheduleByScriptName
            ).toHaveBeenCalledWith('demo');
        });

        it('GET /:name/schedule returns the DB override when present', async () => {
            mockScheduleCommands.getScheduleByScriptName.mockResolvedValue({
                scriptName: 'demo',
                enabled: true,
                cronExpression: '0 9 * * *',
                timezone: 'UTC',
            });

            const res = await request(server).get(
                '/api/v2/reports/demo/schedule'
            );

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                source: 'database',
                reportName: 'demo',
                enabled: true,
                cronExpression: '0 9 * * *',
            });
        });

        it('GET /:name/schedule 404s an unknown report', async () => {
            const res = await request(server).get(
                '/api/v2/reports/nope/schedule'
            );
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('REPORT_NOT_FOUND');
        });

        it('PUT /:name/schedule creates the override and provisions the report scheduler', async () => {
            mockScheduleCommands.upsertSchedule.mockResolvedValue({
                scriptName: 'demo',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
            mockSchedulerAdapter.createSchedule.mockResolvedValue({
                scheduleArn:
                    'arn:aws:scheduler:us-east-1:123:schedule/g/frigg-report-demo',
                scheduleName: 'frigg-report-demo',
            });

            const res = await request(server)
                .put('/api/v2/reports/demo/schedule')
                .send({ enabled: true, cronExpression: '0 12 * * *' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.schedule).toMatchObject({
                source: 'database',
                enabled: true,
                cronExpression: '0 12 * * *',
            });
            // Default scheduled mode is snapshot (no schedule.mode on demo).
            expect(createReportSchedulerAdapterFromEnv).toHaveBeenCalledWith({
                reportName: 'demo',
                mode: 'snapshot',
            });
            expect(mockScheduleCommands.upsertSchedule).toHaveBeenCalledWith({
                scriptName: 'demo',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
            expect(mockSchedulerAdapter.createSchedule).toHaveBeenCalledWith({
                scriptName: 'demo',
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
        });

        it('PUT /:name/schedule uses the report Definition.schedule.mode when declared', async () => {
            mockScheduleCommands.upsertSchedule.mockResolvedValue({
                scriptName: 'scheduled',
                enabled: true,
                cronExpression: '0 6 * * *',
                timezone: 'UTC',
            });
            mockSchedulerAdapter.createSchedule.mockResolvedValue({
                scheduleArn: 'arn:...:frigg-report-scheduled',
                scheduleName: 'frigg-report-scheduled',
            });

            const res = await request(server)
                .put('/api/v2/reports/scheduled/schedule')
                .send({ enabled: true, cronExpression: '0 6 * * *' });

            expect(res.status).toBe(200);
            expect(createReportSchedulerAdapterFromEnv).toHaveBeenCalledWith({
                reportName: 'scheduled',
                mode: 'recorded',
            });
        });

        it('PUT /:name/schedule 400s when enabled without a cronExpression', async () => {
            const res = await request(server)
                .put('/api/v2/reports/demo/schedule')
                .send({ enabled: true });

            expect(res.status).toBe(400);
            expect(mockScheduleCommands.upsertSchedule).not.toHaveBeenCalled();
        });

        it('PUT /:name/schedule 404s an unknown report', async () => {
            const res = await request(server)
                .put('/api/v2/reports/nope/schedule')
                .send({ enabled: false });
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('REPORT_NOT_FOUND');
        });

        it('DELETE /:name/schedule removes the override and tears down the scheduler', async () => {
            mockScheduleCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: {
                    externalScheduleId: 'arn:...:frigg-report-demo',
                },
            });
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();

            const res = await request(server).delete(
                '/api/v2/reports/demo/schedule'
            );

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.deletedCount).toBe(1);
            expect(mockScheduleCommands.deleteSchedule).toHaveBeenCalledWith(
                'demo'
            );
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith(
                'demo'
            );
        });

        it('DELETE /:name/schedule 404s an unknown report', async () => {
            const res = await request(server).delete(
                '/api/v2/reports/nope/schedule'
            );
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('REPORT_NOT_FOUND');
        });
    });
});
